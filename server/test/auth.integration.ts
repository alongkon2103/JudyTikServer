import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { Client } from 'pg'
import { PrismaService } from '../src/database/prisma.service.js'
import { readConfig } from '../src/config/env.js'
import { readAuthConfig } from '../src/auth/config.js'
import { AuthService } from '../src/auth/auth.service.js'
import { AuthSecurity, randomSecret, sha256 } from '../src/auth/security.js'
import { authEnv, TestClock } from './support/auth-fixture.js'
import { FakeProviders } from './support/fake-auth.js'
import type { Provider } from '../src/auth/contracts.js'
const owner = new Client({
    connectionString: process.env.TEST_ADMIN_DATABASE_URL,
  }),
  db = new PrismaService(readConfig(process.env)),
  clock = new TestClock(),
  cfg = readAuthConfig(authEnv())!,
  security = new AuthSecurity(cfg, clock),
  providers = new FakeProviders(),
  auth = new AuthService(db, security, providers, clock)
before(async () => {
  await owner.connect()
  await db.onModuleInit()
})
after(async () => {
  await db.onModuleDestroy()
  await owner.end()
})
async function pending(provider: Provider = 'google', cookie?: string) {
  const verifier = randomSecret(),
    state = randomSecret(),
    body = {
      provider,
      codeChallenge: sha256(verifier).toString('base64url'),
      codeChallengeMethod: 'S256',
      clientState: state,
      installationId: randomUUID(),
      deviceLabel: 'Creator PC',
      platform: 'windows',
      redirectUri: 'http://127.0.0.1:43817/oauth/callback',
    }
  const attempt = await auth.startAttempt(body, randomUUID()),
    page = await auth.authorizationPage(attempt.id, cookie),
    url = new URL(
      await auth.confirmAuthorization(
        { attemptId: attempt.id, csrfToken: page.csrfToken },
        page.cookie,
        cfg.origin,
        randomUUID(),
      ),
    )
  return {
    verifier,
    state,
    attempt,
    page,
    providerState: url.searchParams.get('state')!,
    body,
    provider,
  }
}
async function callback(
  p: Awaited<ReturnType<typeof pending>>,
  subject = 'subject-' + randomUUID(),
  email = 'creator-' + randomUUID() + '@example.invalid',
) {
  const code = 'provider-' + randomUUID()
  providers.profiles.set(code, {
    provider: p.provider,
    subject,
    displayName: 'Creator',
    email,
    emailVerified: true,
  })
  const location = await auth.completeProvider(
    p.provider,
    { code, state: p.providerState },
    p.page.cookie,
    randomUUID(),
  )
  return new URL(location)
}
async function signedIn(
  subject = 'subject-' + randomUUID(),
  provider: Provider = 'google',
  email?: string,
) {
  const p = await pending(provider),
    url = await callback(p, subject, email)
  const tokens = await auth.exchangeToken(
    {
      grant_type: 'authorization_code',
      code: url.searchParams.get('code'),
      code_verifier: p.verifier,
      redirect_uri: p.body.redirectUri,
    },
    randomUUID(),
  )
  return { ...p, tokens, session: await auth.authenticate(tokens.access_token) }
}
test('auth completes a PKCE-bound login with hashed code/refresh and no account token in URL', async () => {
  const p = await pending(),
    url = await callback(p)
  assert.equal(url.origin, 'http://127.0.0.1:43817')
  assert.equal(url.searchParams.get('state'), p.state)
  assert.equal(url.searchParams.has('access_token'), false)
  assert.equal(url.searchParams.has('refresh_token'), false)
  const code = url.searchParams.get('code')!,
    row = await db.client.desktopAuthAttempt.findUniqueOrThrow({
      where: { id: p.attempt.id },
    })
  assert.deepEqual(Buffer.from(row.grantCodeHash!), sha256(code))
  assert.equal(row.providerSecretCiphertext, null)
  const tokens = await auth.exchangeToken(
    {
      grant_type: 'authorization_code',
      code,
      code_verifier: p.verifier,
      redirect_uri: p.body.redirectUri,
    },
    randomUUID(),
  )
  const session = await auth.authenticate(tokens.access_token)
  assert.equal(tokens.expires_in, 900)
  assert.equal(session.sessionId, tokens.sessionId)
  const settings = await db.withUserContext(session.userId, (tx) =>
    tx.accountSettings.findUniqueOrThrow({ where: { userId: session.userId } }),
  )
  assert.equal(settings.theme, 'dark')
  assert.equal(settings.language, 'th')
  const refresh = await db.client.refreshToken.findUniqueOrThrow({
    where: { tokenHash: sha256(tokens.refresh_token) },
  })
  assert.notEqual(
    Buffer.from(refresh.tokenHash).toString(),
    tokens.refresh_token,
  )
  await assert.rejects(
    () =>
      auth.exchangeToken(
        {
          grant_type: 'authorization_code',
          code,
          code_verifier: p.verifier,
          redirect_uri: p.body.redirectUri,
        },
        randomUUID(),
      ),
    /AUTH_UNAUTHORIZED/,
  )
})
test('auth rejects browser CSRF, wrong state/provider, duplicate callback and wrong verifier', async () => {
  const p = await pending()
  await assert.rejects(
    () =>
      auth.confirmAuthorization(
        { attemptId: p.attempt.id, csrfToken: 'bad' },
        p.page.cookie,
        cfg.origin,
        randomUUID(),
      ),
    /INVALID_REQUEST|CSRF_INVALID/,
  )
  await assert.rejects(
    () =>
      auth.completeProvider(
        'google',
        { code: 'x', state: randomSecret() },
        p.page.cookie,
        randomUUID(),
      ),
    /OAUTH_STATE_INVALID/,
  )
  await assert.rejects(
    () =>
      auth.completeProvider(
        'discord',
        { code: 'x', state: p.providerState },
        p.page.cookie,
        randomUUID(),
      ),
    /OAUTH_STATE_INVALID/,
  )
  const url = await callback(p)
  await assert.rejects(
    () =>
      auth.completeProvider(
        'google',
        { code: 'x', state: p.providerState },
        p.page.cookie,
        randomUUID(),
      ),
    /OAUTH_STATE_INVALID/,
  )
  await assert.rejects(
    () =>
      auth.exchangeToken(
        {
          grant_type: 'authorization_code',
          code: url.searchParams.get('code'),
          code_verifier: randomSecret(),
          redirect_uri: p.body.redirectUri,
        },
        randomUUID(),
      ),
    /AUTH_UNAUTHORIZED/,
  )
})
test('auth cancellation invalidates an issued unconsumed grant', async () => {
  const p = await pending(),
    url = await callback(p)
  await auth.cancel(
    { attemptId: p.attempt.id, codeVerifier: p.verifier },
    randomUUID(),
  )
  await assert.rejects(
    () =>
      auth.exchangeToken(
        {
          grant_type: 'authorization_code',
          code: url.searchParams.get('code'),
          code_verifier: p.verifier,
          redirect_uri: p.body.redirectUri,
        },
        randomUUID(),
      ),
    /AUTH_UNAUTHORIZED/,
  )
})
test('auth rejects late callback after cancel and after attempt expiry', async () => {
  const p = await pending()
  await auth.cancel(
    { attemptId: p.attempt.id, codeVerifier: p.verifier },
    randomUUID(),
  )
  await assert.rejects(() => callback(p), /OAUTH_STATE_INVALID/)
  const expired = await pending()
  clock.advance(600001)
  await assert.rejects(() => callback(expired), /OAUTH_STATE_INVALID/)
})
test('auth cancellation during provider exchange prevents final grant/session creation', async () => {
  const p = await pending()
  let release!: () => void, entered!: () => void
  const gate = new Promise<void>((r) => (release = r)),
    started = new Promise<void>((r) => (entered = r))
  providers.beforeExchange = async () => {
    entered()
    await gate
  }
  const result = callback(p)
  await started
  await auth.cancel(
    { attemptId: p.attempt.id, codeVerifier: p.verifier },
    randomUUID(),
  )
  release()
  await assert.rejects(() => result, /OAUTH_STATE_INVALID/)
  providers.beforeExchange = undefined
})
test('auth exchange and cancel serialize to an explicit success/cancel outcome', async () => {
  const p = await pending(),
    url = await callback(p)
  const results = await Promise.allSettled([
    auth.exchangeToken(
      {
        grant_type: 'authorization_code',
        code: url.searchParams.get('code'),
        code_verifier: p.verifier,
        redirect_uri: p.body.redirectUri,
      },
      randomUUID(),
    ),
    auth.cancel(
      { attemptId: p.attempt.id, codeVerifier: p.verifier },
      randomUUID(),
    ),
  ])
  assert.equal(results.filter((x) => x.status === 'fulfilled').length, 1)
  const failed = results.find(
    (x) => x.status === 'rejected',
  ) as PromiseRejectedResult
  assert.match(
    String(failed.reason),
    /AUTH_UNAUTHORIZED|AUTH_ATTEMPT_ALREADY_CONSUMED/,
  )
})
test('auth uses same provider subject across devices but never merges identities from shared email', async () => {
  const subject = 'same-' + randomUUID(),
    email = 'shared-' + randomUUID() + '@example.invalid'
  const a = await signedIn(subject, 'google', email),
    b = await signedIn(subject, 'google', email),
    other = await signedIn('discord-' + randomUUID(), 'discord', email)
  assert.equal(a.session.userId, b.session.userId)
  assert.notEqual(a.tokens.deviceId, b.tokens.deviceId)
  assert.notEqual(a.session.userId, other.session.userId)
  const attached = await db.client.userEmail.findUniqueOrThrow({
    where: { emailKey: email },
  })
  assert.equal(attached.userId, a.session.userId)
})
test('auth refresh rotation and reuse commit family revocation before rejecting the old token', async () => {
  const current = await signedIn()
  const next = await auth.exchangeToken(
    {
      grant_type: 'refresh_token',
      refresh_token: current.tokens.refresh_token,
    },
    randomUUID(),
  )
  assert.notEqual(next.refresh_token, current.tokens.refresh_token)
  await auth.authenticate(next.access_token)
  await assert.rejects(
    () =>
      auth.exchangeToken(
        {
          grant_type: 'refresh_token',
          refresh_token: current.tokens.refresh_token,
        },
        randomUUID(),
      ),
    /AUTH_UNAUTHORIZED/,
  )
  await assert.rejects(
    () => auth.authenticate(next.access_token),
    /AUTH_UNAUTHORIZED/,
  )
  const row = await db.client.session.findUniqueOrThrow({
    where: { id: current.tokens.sessionId },
  })
  assert(row.revokedAt)
})
test('auth concurrent refresh of the same token returns one result and revokes on reuse', async () => {
  const current = await signedIn()
  const out = await Promise.allSettled([
    auth.exchangeToken(
      {
        grant_type: 'refresh_token',
        refresh_token: current.tokens.refresh_token,
      },
      randomUUID(),
    ),
    auth.exchangeToken(
      {
        grant_type: 'refresh_token',
        refresh_token: current.tokens.refresh_token,
      },
      randomUUID(),
    ),
  ])
  assert.equal(out.filter((x) => x.status === 'fulfilled').length, 1)
  const row = await db.client.session.findUniqueOrThrow({
    where: { id: current.tokens.sessionId },
  })
  assert(row.revokedAt)
})
test('auth logout rejects still-unexpired access tokens and session absolute expiry does not extend', async () => {
  const a = await signedIn()
  await auth.logout(a.session, randomUUID())
  await assert.rejects(
    () => auth.authenticate(a.tokens.access_token),
    /AUTH_UNAUTHORIZED/,
  )
  const b = await signedIn()
  clock.advance(30 * 86400000 + 1)
  await assert.rejects(
    () =>
      auth.exchangeToken(
        { grant_type: 'refresh_token', refresh_token: b.tokens.refresh_token },
        randomUUID(),
      ),
    /AUTH_UNAUTHORIZED/,
  )
})

test('auth renews browser-cookie lifetime for successive attempts without breaking active browser bindings', async () => {
  const oldCookie = security.newBrowserCookie(),
    browser = security.readBrowserCookie(oldCookie)
  clock.advance(580000)
  const active = await pending('google', oldCookie)
  clock.advance(10000)
  const next = await pending('google', active.page.cookie)
  clock.advance(20000)
  assert.equal(security.readBrowserCookie(next.page.cookie), browser)
  assert.equal(security.readBrowserCookie(oldCookie), undefined)
  const activeWithCurrentCookie = {
    ...active,
    page: { ...active.page, cookie: next.page.cookie },
  }
  assert((await callback(activeWithCurrentCookie)).searchParams.has('code'))
  assert((await callback(next)).searchParams.has('code'))
})
