import 'reflect-metadata'
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { Test } from '@nestjs/testing'
import type { NestExpressApplication } from '@nestjs/platform-express'
import { AppModule } from '../src/app.module.js'
import { configureApp } from '../src/http/configure.js'
import { readConfig } from '../src/config/env.js'
import { readAuthConfig } from '../src/auth/config.js'
import { OAuthProviders } from '../src/auth/provider-adapters.js'
import { CLOCK } from '../src/auth/clock.js'
import { VerificationMailer } from '../src/accounts/mailer.js'
import { randomSecret, sha256 } from '../src/auth/security.js'
import { authEnv, TestClock } from './support/auth-fixture.js'
import { FakeProviders } from './support/fake-auth.js'
import { FakeMailer } from './support/fake-mail.js'
const cfg = Object.assign(readConfig(process.env), {
    auth: readAuthConfig(authEnv())!,
  }),
  providers = new FakeProviders(),
  clock = new TestClock(),
  mailer = new FakeMailer()
let app: NestExpressApplication, base: string
before(async () => {
  const module = await Test.createTestingModule({
    imports: [AppModule.register(cfg)],
  })
    .overrideProvider(OAuthProviders)
    .useValue(providers)
    .overrideProvider(CLOCK)
    .useValue(clock)
    .overrideProvider(VerificationMailer)
    .useValue(mailer)
    .compile()
  app = configureApp(
    module.createNestApplication<NestExpressApplication>({ logger: false }),
  )
  await app.listen(0, '127.0.0.1')
  base = await app.getUrl()
})
after(async () => {
  await app?.close()
})
const request = (path: string, options: RequestInit = {}) =>
  fetch(base + '/v1' + path, {
    ...options,
    redirect: 'manual',
    headers: { 'content-type': 'application/json', ...options.headers },
  })
const error = async (response: Response) => {
  const value = await response.json()
  assert(value.error.requestId)
  return value.error.code
}
const payload = (label = 'Creator PC') => {
  const verifier = randomSecret()
  return {
    verifier,
    body: {
      provider: 'google',
      codeChallenge: sha256(verifier).toString('base64url'),
      codeChallengeMethod: 'S256',
      clientState: randomSecret(),
      redirectUri: 'http://127.0.0.1:43817/oauth/callback',
      installationId: randomUUID(),
      deviceLabel: label,
      platform: 'windows',
    },
  }
}
async function attempt(label?: string) {
  const data = payload(label),
    start = await request('/auth/desktop/attempts', {
      method: 'POST',
      body: JSON.stringify(data.body),
    })
  assert.equal(start.status, 201)
  const value = await start.json(),
    page = await request('/auth/desktop/authorize?attemptId=' + value.id)
  assert.equal(page.status, 200)
  const cookie = page.headers.get('set-cookie')!,
    html = await page.text(),
    csrf = html.match(/name="csrfToken" value="([^"]+)"/)![1]
  return {
    ...data,
    id: value.id,
    cookie: cookie.split(';')[0],
    html,
    csrf,
    headers: cookie,
    page,
  }
}
async function confirm(
  a: Awaited<ReturnType<typeof attempt>>,
  headers: Record<string, string> = {},
) {
  return request('/auth/desktop/authorize', {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      cookie: a.cookie,
      origin: cfg.auth.origin,
      ...headers,
    },
    body: new URLSearchParams({
      attemptId: a.id,
      csrfToken: a.csrf,
    }).toString(),
  })
}
async function login() {
  const a = await attempt(),
    consent = await confirm(a)
  assert.equal(consent.status, 302)
  const state = new URL(consent.headers.get('location')!).searchParams.get(
      'state',
    )!,
    code = randomUUID()
  providers.profiles.set(code, {
    provider: 'google',
    subject: randomUUID(),
    displayName: 'Creator',
    emailVerified: false,
  })
  const callback = await request(
    '/auth/oauth/google/callback?' + new URLSearchParams({ state, code }),
    { headers: { cookie: a.cookie } },
  )
  assert.equal(callback.status, 302)
  const native = new URL(callback.headers.get('location')!)
  assert.equal(native.origin, 'http://127.0.0.1:43817')
  assert.deepEqual([...native.searchParams.keys()].sort(), ['code', 'state'])
  assert.equal(native.searchParams.get('state'), a.body.clientState)
  const response = await request('/auth/token', {
    method: 'POST',
    body: JSON.stringify({
      grant_type: 'authorization_code',
      code: native.searchParams.get('code'),
      code_verifier: a.verifier,
      redirect_uri: a.body.redirectUri,
    }),
  })
  assert.equal(response.status, 200)
  assert.equal(response.headers.get('cache-control'), 'no-store')
  assert.equal(response.headers.get('pragma'), 'no-cache')
  const tokens = await response.json()
  return { tokens, authorization: 'Bearer ' + tokens.access_token }
}
test('Auth HTTP consent escapes user text, sets browser cookie and rejects Origin/cookie/CSRF errors', async () => {
  const a = await attempt('<img src=x onerror=alert(1)>')
  assert(a.html.includes('&lt;img'))
  assert(!a.html.includes('<img'))
  assert.match(a.headers, /HttpOnly/i)
  assert.match(a.headers, /SameSite=Lax/i)
  assert.equal(a.page.headers.get('referrer-policy'), 'same-origin')
  const policy = a.page.headers.get('content-security-policy')!
  assert(
    policy.includes(
      "form-action 'self' https://accounts.google.com " + a.body.redirectUri,
    ),
  )
  assert(!policy.includes('https://discord.com'))

  assert.match(
    a.page.headers.get('content-security-policy')!,
    /frame-ancestors 'none'/,
  )
  for (const headers of [
    { origin: 'https://attacker.invalid' },
    { origin: 'null' },
    { cookie: '' },
  ] as Record<string, string>[]) {
    const response = await confirm(a, headers)
    assert.equal(response.status, 400)
    assert.equal(await error(response), 'CSRF_INVALID')
  }
  const csrf = await request('/auth/desktop/authorize', {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      cookie: a.cookie,
      origin: cfg.auth.origin,
    },
    body: new URLSearchParams({
      attemptId: a.id,
      csrfToken: randomSecret(),
    }).toString(),
  })
  assert.equal(csrf.status, 400)
})
test('Auth HTTP rejects invalid/duplicate callback parameters before consuming valid state', async () => {
  const a = await attempt(),
    consent = await confirm(a),
    state = new URL(consent.headers.get('location')!).searchParams.get('state')!
  for (const query of [
    'state=' + state + '&state=' + state + '&code=x',
    'state=' + state + '&code=x&code=y',
    'state=' + state + '&code=x&error=denied',
  ]) {
    const response = await request('/auth/oauth/google/callback?' + query, {
      headers: { cookie: a.cookie },
    })
    assert.equal(response.status, 400)
  }
  assert.equal(providers.exchanges, 0)
})
test('Auth HTTP authenticates owned profile/session/entitlements, rejects client plan and revoked access', async () => {
  const user = await login(),
    headers = { authorization: user.authorization }
  const me = await request('/me', { headers })
  assert.equal(me.status, 200)
  const profile = await me.json()
  assert(profile.id)
  assert.equal(
    (await (await request('/me/entitlements?plan=PRO', { headers })).json())
      .plan,
    'FREE',
  )
  const sessions = await (await request('/me/sessions', { headers })).json()
  assert(sessions.items.some((x: { isCurrent: boolean }) => x.isCurrent))
  assert.equal(
    (await request('/auth/logout', { method: 'POST', headers })).status,
    204,
  )
  assert.equal((await request('/me', { headers })).status, 401)
})
test('Auth HTTP verifies mail through adapter, exposes no codes, and refuses service key as user token', async () => {
  const user = await login(),
    headers = { authorization: user.authorization },
    email = randomUUID() + '@example.invalid',
    response = await request('/me/email/challenges', {
      method: 'POST',
      headers,
      body: JSON.stringify({ email }),
    })
  assert.equal(response.status, 202)
  const challenge = await response.json()
  assert.deepEqual(Object.keys(challenge).sort(), [
    'expiresAt',
    'id',
    'resendAfterSeconds',
  ])
  const verified = await request(
    '/me/email/challenges/' + challenge.id + '/verify',
    {
      method: 'POST',
      headers,
      body: JSON.stringify({ code: mailer.sent.at(-1)!.code }),
    },
  )
  assert.equal(verified.status, 200)
  assert.equal((await verified.json()).address, email)
  assert.equal(
    (
      await request('/me', {
        headers: { authorization: 'Bearer ' + cfg.adminApiKey },
      })
    ).status,
    401,
  )
  assert.equal((await request('/me')).status, 401)
})
test('Auth HTTP missing provider registrations fail closed and public Gifts remain available', async () => {
  const module = await Test.createTestingModule({
      imports: [AppModule.register(cfg)],
    }).compile(),
    disabled = configureApp(
      module.createNestApplication<NestExpressApplication>({ logger: false }),
    )
  try {
    await disabled.listen(0, '127.0.0.1')
    const url = await disabled.getUrl(),
      response = await fetch(url + '/v1/auth/desktop/attempts', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload().body),
      })
    assert.equal(response.status, 503)
    assert.equal(await error(response), 'OAUTH_PROVIDER_NOT_CONFIGURED')
    assert.equal((await fetch(url + '/v1/gifts')).status, 200)
  } finally {
    await disabled.close()
  }
})
