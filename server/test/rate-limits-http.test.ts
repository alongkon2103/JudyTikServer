import 'reflect-metadata'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Controller, Get, Post, UseGuards } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import type { NestExpressApplication } from '@nestjs/platform-express'
import { SessionGuard } from '../src/auth/session.guard.js'
import { AuthService } from '../src/auth/auth.service.js'
import { ApiError } from '../src/http/api-error.js'
import { configureApp } from '../src/http/configure.js'

class ProbeController {
  protected() { return { ok: true } }
  other() { return { ok: true } }
  public() { return { ok: true } }
  attempts() { return { ok: true } }
  token() { return { ok: true } }
  admin() { return { ok: true } }
}
// Apply Nest metadata explicitly because the production tsconfig excludes test files.
Controller()(ProbeController)
for (const [name, path, method, guarded] of [
  ['protected', 'me/probe', Get, true], ['other', 'me/other', Get, true],
  ['public', 'public-probe', Get, false], ['attempts', 'auth/desktop/attempts', Post, false],
  ['token', 'auth/token', Post, false], ['admin', 'admin/probe', Get, false],
] as const) {
  const descriptor = Object.getOwnPropertyDescriptor(ProbeController.prototype, name)!
  method(path)(ProbeController.prototype, name, descriptor)
  if (guarded) UseGuards(SessionGuard)(ProbeController.prototype, name, descriptor)
}

async function harness() {
  // AuthService normally verifies signatures AND the persisted active user/session.
  // Isolate that database/crypto boundary; retain the real HTTP middleware and guard.
  const module = await Test.createTestingModule({
    controllers: [ProbeController],
    providers: [SessionGuard, { provide: AuthService, useValue: {
      async authenticate(token: string) {
        const match = /^owner-(a|b)-session-(1|2)$/.exec(token)
        if (!match) throw new ApiError(401, 'AUTH_UNAUTHORIZED')
        return { userId: match[1], sessionId: match[2], deviceId: 'test-device' }
      },
    } }],
  }).compile()
  const app = configureApp(module.createNestApplication<NestExpressApplication>({ logger: false, bodyParser: false }))
  await app.listen(0, '127.0.0.1')
  const origin = await app.getUrl()
  const request = (path = 'me/probe', token?: string, method = 'GET', body?: string) => fetch(`${origin}/v1/${path}`, {
    method, headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body ? { 'content-type': 'application/json' } : {}) },
    ...(body ? { body } : {}),
  })
  return { app, request }
}

async function assertLimited(response: Response, policy: string) {
  assert.equal(response.status, 429)
  assert.equal(response.headers.get('x-judytik-rate-limit-policy'), policy)
  assert.match(response.headers.get('retry-after') ?? '', /^[1-9]\d*$/)
  const body = await response.json()
  assert.equal(body.error.code, 'RATE_LIMITED')
  assert.equal(body.error.requestId, response.headers.get('x-request-id'))
}

test('shared NAT gives verified owners separate budgets across routes and sessions', async () => {
  const { app, request } = await harness()
  try {
    for (let n = 0; n < 120; n++) {
      for (const owner of ['a', 'b']) {
        const response = await request(n % 2 ? 'me/other' : 'me/probe', `owner-${owner}-session-${n % 2 + 1}`)
        assert.equal(response.status, 200, `owner ${owner}, request ${n + 1}`)
      }
    }
    await assertLimited(await request('me/probe', 'owner-a-session-2'), 'account')
    await assertLimited(await request('me/other', 'owner-b-session-1'), 'account')
  } finally { await app.close() }
})

test('unverified identities cannot consume or rotate an account budget', async () => {
  const { app, request } = await harness()
  try {
    for (let n = 0; n < 120; n++) {
      // Fake JWT subjects must never become rate-limit keys or authenticated users.
      const forged = `eyJhbGciOiJub25lIn0.${Buffer.from(JSON.stringify({ sub: `owner-${n}` })).toString('base64url')}.fake`
      assert.equal((await request('me/probe', forged)).status, 401)
    }
    for (let n = 0; n < 120; n++) assert.equal((await request('me/probe', 'owner-a-session-1')).status, 200)
    assert.equal((await request('me/probe', 'bogus-owner-a')).status, 401)
    await assertLimited(await request('me/probe', 'owner-a-session-2'), 'account')
  } finally { await app.close() }
})

test('the broad IP ceiling still bounds anonymous and bogus-auth traffic', async () => {
  const { app, request } = await harness()
  try {
    for (let n = 0; n < 1200; n++) {
      const bogus = n % 2 === 1
      assert.equal((await request(bogus ? 'me/probe' : 'public-probe', bogus ? `fake-${n}` : undefined)).status, bogus ? 401 : 200)
    }
    await assertLimited(await request('public-probe'), 'ip')
    await assertLimited(await request('me/probe', 'owner-a-session-1'), 'ip')
  } finally { await app.close() }
})

test('public auth and admin keep their tighter IP limits and identify the blocking policy', async () => {
  const { app, request } = await harness()
  try {
    for (const [path, limit, policy, method] of [
      ['auth/desktop/attempts', 10, 'auth', 'POST'],
      ['auth/token', 30, 'auth', 'POST'],
      ['admin/probe', 30, 'admin', 'GET'],
    ] as const) {
      for (let n = 0; n < limit; n++) assert.ok((await request(path, undefined, method)).ok)
      await assertLimited(await request(path, undefined, method), policy)
    }
  } finally { await app.close() }
})

test('rate-limit changes preserve JSON errors, body limits and security headers', async () => {
  const { app, request } = await harness()
  try {
    for (const [body, status, code] of [
      ['{broken', 400, 'INVALID_REQUEST'],
      [JSON.stringify({ data: 'x'.repeat(270000) }), 413, 'REQUEST_TOO_LARGE'],
    ] as const) {
      const response = await request('auth/token', undefined, 'POST', body)
      assert.equal(response.status, status)
      assert.equal((await response.json()).error.code, code)
      assert.equal(response.headers.get('x-content-type-options'), 'nosniff')
      assert.equal(response.headers.get('cache-control'), 'no-store')
    }
  } finally { await app.close() }
})

test('account quota resets exactly at its one-minute boundary', async (t) => {
  let now = Date.now()
  t.mock.method(Date, 'now', () => now)
  const { app, request } = await harness()
  try {
    for (let n = 0; n < 120; n++) assert.equal((await request('me/probe', 'owner-a-session-1')).status, 200)
    now += 59_999
    const blocked = await request('me/other', 'owner-a-session-2')
    await assertLimited(blocked, 'account')
    assert.equal(blocked.headers.get('retry-after'), '1')
    now++
    assert.equal((await request('me/other', 'owner-a-session-2')).status, 200)
  } finally { await app.close() }
})
