import 'reflect-metadata'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readConfig } from '../src/config/env.js'

const baseEnv = {
  NODE_ENV: 'test',
  DATABASE_URL: 'postgresql://runtime:dev_only@127.0.0.1:5432/test',
  ADMIN_API_KEY: 'a'.repeat(43),
}
const credentials = { apiKey: 'fixture_euler_key_1234567890', accountId: 122 }

test('LIVE config accepts omitted and paired blank credentials', () => {
  assert.equal(readConfig(baseEnv).live, undefined)
  assert.equal(readConfig({ ...baseEnv, EULER_API_KEY: ' ', EULER_ACCOUNT_ID: '' }).live, undefined)
})
test('LIVE config reads server-only Euler credentials as a pair', () => {
  assert.deepEqual(readConfig({
    ...baseEnv, EULER_API_KEY: credentials.apiKey, EULER_ACCOUNT_ID: '122',
  }).live, credentials)
})
for (const [overrides, name] of [
  [{ EULER_API_KEY: credentials.apiKey }, 'EULER_ACCOUNT_ID'],
  [{ EULER_ACCOUNT_ID: '122' }, 'EULER_API_KEY'],
  [{ EULER_API_KEY: 'bad\nkey', EULER_ACCOUNT_ID: '122' }, 'EULER_API_KEY'],
  [{ EULER_API_KEY: credentials.apiKey, EULER_ACCOUNT_ID: '../122' }, 'EULER_ACCOUNT_ID'],
  [{ EULER_API_KEY: credentials.apiKey, EULER_ACCOUNT_ID: '0' }, 'EULER_ACCOUNT_ID'],
  [{ EULER_API_KEY: credentials.apiKey, EULER_ACCOUNT_ID: '9007199254740992' }, 'EULER_ACCOUNT_ID'],
] as const) test(`LIVE config rejects invalid ${name} without exposing values`, () => {
  assert.throws(() => readConfig({ ...baseEnv, ...overrides }), error => {
    assert(error instanceof Error)
    assert.equal(error.message, `Invalid ${name}; check server live configuration`)
    return true
  })
})

import { Test } from '@nestjs/testing'
import type { NestExpressApplication } from '@nestjs/platform-express'
import { AppModule } from '../src/app.module.js'
import { AuthService } from '../src/auth/auth.service.js'
import { PrismaService, type VerifiedUserId } from '../src/database/prisma.service.js'
import { ApiError } from '../src/http/api-error.js'
import { configureApp } from '../src/http/configure.js'

async function httpFixture(live?: LiveService) {
  const builder = Test.createTestingModule({
    imports: [AppModule.register(readConfig(baseEnv))],
  })
    .overrideProvider(PrismaService).useValue({})
    .overrideProvider(AuthService).useValue({
      authenticate: async (token: string) => {
        if (token !== 'fixture-access') throw new ApiError(401, 'AUTH_UNAUTHORIZED')
        return { userId: 'owner-one' as VerifiedUserId, sessionId: 's', deviceId: 'd' }
      },
    })
  if (live) builder.overrideProvider(LiveService).useValue(live)
  const module = await builder.compile()
  const app = configureApp(module.createNestApplication<NestExpressApplication>({ logger: false }))
  await app.listen(0, '127.0.0.1')
  const url = await app.getUrl()
  return {
    app,
    request: (body: unknown, token = 'fixture-access', signal?: AbortSignal) => fetch(url + '/v1/live/authorize', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) },
      body: JSON.stringify(body), signal,
    }),
  }
}

test('LIVE HTTP authorizes a normalized community username behind the real session guard', async () => {
  const h = await httpFixture()
  try {
    const response = await h.request({ username: '@Creator_2' })
    assert.equal(response.status, 200)
    assert.equal(response.headers.get('cache-control'), 'no-store')
    assert.deepEqual(await response.json(), { mode: 'community', username: 'Creator_2' })
    for (const token of ['', 'wrong', baseEnv.ADMIN_API_KEY]) {
      const denied = await h.request({ username: 'creator' }, token)
      assert.equal(denied.status, 401)
      assert.equal((await denied.json()).error.code, 'AUTH_UNAUTHORIZED')
    }
    for (const body of [null, [], {}, { username: 'a' }, { username: 'a'.repeat(25) },
      { username: 'https://www.tiktok.com/@creator/live' }, { username: '@@creator' },
      { username: 'ครีเอเตอร์' }, { username: 'creator', apiKey: 'injected' }]) {
      const invalid = await h.request(body)
      assert.equal(invalid.status, 400)
      assert.equal((await invalid.json()).error.code, body === null ? 'INVALID_REQUEST' : 'LIVE_INVALID_REQUEST')
    }
  } finally { await h.app.close() }
})

import { LiveService } from '../src/live/service.js'
import type { Clock } from '../src/auth/clock.js'
import type { VerifiedSession } from '../src/auth/auth.service.js'
const owner = { userId: 'owner-one' as VerifiedUserId, sessionId: 's', deviceId: 'd' } satisfies VerifiedSession
const otherOwner = { ...owner, userId: 'owner-two' as VerifiedUserId }
const start = Date.parse('2026-10-26T00:00:00.000Z')
const token = 'fixture_short_lived_euler_token'
const upstream = (expiresAt = start + 60_000) => ({ code: 200, token, config: { expiresAt } })
function serviceFixture(fetcher: typeof fetch) {
  let now = start
  const clock: Clock = { now: () => new Date(now) }
  const service = new LiveService({ ...readConfig(baseEnv), live: credentials }, clock, fetcher)
  return { service, advance: (ms: number) => { now += ms } }
}
async function rejectsCode(operation: Promise<unknown>, status: number, code: string) {
  await assert.rejects(operation, error => {
    assert(error instanceof ApiError)
    assert.equal(error.getStatus(), status)
    assert.equal(error.code, code)
    assert.equal(error.message, code)
    assert(!JSON.stringify(error.getResponse()).includes(credentials.apiKey))
    return true
  })
}

test('LIVE JWT uses the fixed Euler account endpoint with header-only key, 60s TTL and minimal permissions', async () => {
  const requests: { url: string; init?: RequestInit }[] = []
  const h = serviceFixture(async (url, init) => {
    requests.push({ url: String(url), init })
    return Response.json(upstream())
  })
  assert.deepEqual(await h.service.authorize(owner, { username: '@Creator_2' }), {
    mode: 'jwt', username: 'Creator_2', token, expiresAt: '2026-10-26T00:01:00.000Z',
  })
  assert.equal(requests[0].url, 'https://api.eulerstream.com/accounts/122/jwt/create')
  const init = requests[0].init!
  assert.equal(init.method, 'POST')
  assert.equal(init.redirect, 'error')
  assert(init.signal instanceof AbortSignal)
  assert.equal(new Headers(init.headers).get('x-api-key'), credentials.apiKey)
  assert.deepEqual(JSON.parse(String(init.body)), {
    metadata: { version: 'v2', expireAfter: 60 },
    api: { enabled: true, limits: { minute: 5, hour: 5, day: 5 } },
    websockets: { enabled: false },
    cdn: { enabled: false, access_permitted: false, upload_permitted: false },
  })
  assert(!String(init.body).includes(credentials.apiKey))
})

test('LIVE JWT caps the advertised expiry at 60s and accepts upstream Unix seconds', async () => {
  const h = serviceFixture(async () => Response.json(upstream((start + 45_000) / 1000)))
  const value = await h.service.authorize(owner, { username: 'creator' })
  assert.equal(value.mode, 'jwt')
  if (value.mode === 'jwt') assert.equal(value.expiresAt, '2026-10-26T00:00:45.000Z')
})

test('LIVE JWT rate cap is owner-bound across sessions, counts failures, and expires', async () => {
  let calls = 0
  const h = serviceFixture(async () => { calls++; throw new Error(credentials.apiKey) })
  await rejectsCode(h.service.authorize(owner, { username: 'creator' }), 503, 'LIVE_SIGNING_UNAVAILABLE')
  await rejectsCode(h.service.authorize({ ...owner, sessionId: 'other-session' }, { username: 'creator' }), 429, 'LIVE_RATE_LIMITED')
  await rejectsCode(h.service.authorize(otherOwner, { username: 'creator' }), 503, 'LIVE_SIGNING_UNAVAILABLE')
  assert.equal(calls, 2)
  h.advance(15_000)
  await rejectsCode(h.service.authorize(owner, { username: 'creator' }), 503, 'LIVE_SIGNING_UNAVAILABLE')
  assert.equal(calls, 3)
})

for (const [label, response, code] of [
  ['HTTP failure', () => new Response(credentials.apiKey, { status: 401 }), 'LIVE_SIGNING_UNAVAILABLE'],
  ['redirect', () => new Response('', { status: 302, headers: { location: 'https://attacker.invalid/' } }), 'LIVE_SIGNING_UNAVAILABLE'],
  ['invalid JSON', () => new Response('{oops'), 'LIVE_SIGNING_INVALID'],
  ['upstream failure code', () => Response.json({ code: 401, token: credentials.apiKey }), 'LIVE_SIGNING_INVALID'],
  ['missing expiry', () => Response.json({ code: 200, token }), 'LIVE_SIGNING_INVALID'],
  ['expired token', () => Response.json(upstream(start - 1)), 'LIVE_SIGNING_INVALID'],
  ['long TTL', () => Response.json(upstream(start + 120_000)), 'LIVE_SIGNING_INVALID'],
  ['key echoed as token', () => Response.json({ ...upstream(), token: credentials.apiKey }), 'LIVE_SIGNING_INVALID'],
  ['oversized body', () => new Response('x'.repeat(16 * 1024 + 1)), 'LIVE_SIGNING_INVALID'],
] as const) test(`LIVE JWT rejects ${label} without fallback or secret disclosure`, async () => {
  const h = serviceFixture(async () => response())
  await rejectsCode(h.service.authorize(owner, { username: 'creator' }), 503, code)
})

test('LIVE JWT validates before spending quota and cancels a caller-aborted request', async () => {
  let calls = 0
  const h = serviceFixture(async (_url, init) => {
    calls++
    return new Promise((_resolve, reject) => {
      init!.signal!.addEventListener('abort', () => reject(new Error(credentials.apiKey)), { once: true })
    })
  })
  await rejectsCode(h.service.authorize(owner, { username: 'https://tiktok.com/@creator' }), 400, 'LIVE_INVALID_REQUEST')
  const abort = new AbortController()
  const pending = h.service.authorize(owner, { username: 'creator' }, abort.signal)
  abort.abort()
  await rejectsCode(pending, 499, 'LIVE_REQUEST_CANCELLED')
  assert.equal(calls, 1)
})

test('LIVE JWT cancels a stalled body at the fixed eight second deadline', { timeout: 10_000 }, async () => {
  let cancelled = false
  const h = serviceFixture(async () => new Response(new ReadableStream({
    start(controller) { controller.enqueue(new TextEncoder().encode('{')) },
    cancel() { cancelled = true },
  })))
  await rejectsCode(h.service.authorize(owner, { username: 'creator' }), 503, 'LIVE_SIGNING_UNAVAILABLE')
  assert.equal(cancelled, true)
})

test('LIVE JWT owner capacity refuses new issuance instead of evicting active limits', async () => {
  const h = serviceFixture(async () => { throw new Error('fixture offline') })
  for (let i = 0; i < 10_000; i++) {
    await rejectsCode(h.service.authorize({ ...owner, userId: String(i) as VerifiedUserId }, { username: 'creator' }), 503, 'LIVE_SIGNING_UNAVAILABLE')
  }
  await rejectsCode(h.service.authorize(owner, { username: 'creator' }), 503, 'LIVE_SIGNING_BUSY')
  await rejectsCode(h.service.authorize({ ...owner, userId: '0' as VerifiedUserId }, { username: 'creator' }), 429, 'LIVE_RATE_LIMITED')
  h.advance(15_000)
  await rejectsCode(h.service.authorize(owner, { username: 'creator' }), 503, 'LIVE_SIGNING_UNAVAILABLE')
})

test('LIVE HTTP returns only the JWT contract and sanitized upstream failures', async () => {
  const h = serviceFixture(async () => Response.json({ ...upstream(), debug: credentials.apiKey }))
  const http = await httpFixture(h.service)
  try {
    const response = await http.request({ username: 'creator' })
    assert.equal(response.status, 200)
    assert.deepEqual(await response.json(), { mode: 'jwt', username: 'creator', token, expiresAt: '2026-10-26T00:01:00.000Z' })
    const limited = await http.request({ username: 'creator' })
    assert.equal(limited.status, 429)
    assert.equal((await limited.json()).error.code, 'LIVE_RATE_LIMITED')
  } finally { await http.app.close() }
  const broken = serviceFixture(async () => { throw new Error(credentials.apiKey) })
  const failed = await httpFixture(broken.service)
  try {
    const response = await failed.request({ username: 'creator' })
    assert.equal(response.status, 503)
    const body = await response.text()
    assert(!body.includes(credentials.apiKey))
    const value = JSON.parse(body)
    assert.equal(value.error.code, 'LIVE_SIGNING_UNAVAILABLE')
    assert(value.error.requestId)
  } finally { await failed.app.close() }
})

test('LIVE HTTP client disconnect aborts the pending Euler request', async () => {
  let started!: () => void, aborted!: () => void
  const ready = new Promise<void>(resolve => { started = resolve })
  const cancelled = new Promise<void>(resolve => { aborted = resolve })
  const h = serviceFixture(async (_url, init) => {
    started()
    return new Promise((_resolve, reject) => {
      init!.signal!.addEventListener('abort', () => { aborted(); reject(new Error('aborted')) }, { once: true })
    })
  })
  const http = await httpFixture(h.service)
  try {
    const controller = new AbortController()
    const pending = http.request({ username: 'creator' }, 'fixture-access', controller.signal)
    await ready
    controller.abort()
    await assert.rejects(pending, { name: 'AbortError' })
    await Promise.race([cancelled, new Promise((_, reject) => setTimeout(() => reject(new Error('Euler not cancelled')), 1000))])
  } finally { await http.app.close() }
})

import { existsSync, readFileSync } from 'node:fs'
import { Ajv2020 } from 'ajv/dist/2020.js'
import addFormats from 'ajv-formats'
import { liveAuthorizationSchema, liveAuthorizationRequestSchema } from '../src/live/contracts.js'
import { z } from 'zod'
import type { components as LiveComponents } from '../../shared/live-signing.js'

test('generated LIVE schemas match canonical backend validation and reject mixed or extra fields', () => {
  const path = new URL('../../shared/live-signing.openapi.json', import.meta.url)
  assert(existsSync(path), 'Generated live signing runtime contract exists')
  const contract = JSON.parse(readFileSync(path, 'utf8'))
  const schemas = contract.components.schemas
  assert.deepEqual(schemas.LiveAuthorization, z.toJSONSchema(liveAuthorizationSchema))
  assert.deepEqual(schemas.LiveAuthorizationRequest, z.toJSONSchema(liveAuthorizationRequestSchema))
  const ajv = new Ajv2020({ strict: false })
  addFormats.default(ajv)
  const validate = ajv.compile(schemas.LiveAuthorization)
  const community: LiveComponents['schemas']['LiveAuthorization'] = { mode: 'community', username: 'creator' }
  assert(validate(community))
  assert(validate({ mode: 'jwt', username: 'creator', token, expiresAt: '2026-10-26T00:01:00.000Z' }))
  assert(!validate({ ...community, token }))
  assert(!validate({ mode: 'jwt', username: 'creator', token }))
  assert(!validate({ ...community, apiKey: credentials.apiKey }))
  assert(!validate({ ...community, username: '@creator' }))
  assert(!ajv.compile(schemas.LiveAuthorizationRequest)({ username: 'https://tiktok.com/@creator' }))
})
