import { test } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID, generateKeyPairSync } from 'node:crypto'
import { SignJWT } from 'jose'
import { readAuthConfig } from '../src/auth/config.js'
import { AuthSecurity } from '../src/auth/security.js'
import { authEnv, TestClock } from './support/auth-fixture.js'
function fixture() {
  const clock = new TestClock(),
    config = readAuthConfig(authEnv())!
  return { clock, config, security: new AuthSecurity(config, clock) }
}
test('auth config remains disabled without persistent keys and rejects incomplete or unsafe keys', () => {
  assert.equal(readAuthConfig({}), undefined)
  const config = readAuthConfig(authEnv())!
  assert.equal(config.origin, 'http://127.0.0.1:4300')
  assert.equal(config.privateKey.asymmetricKeyType, 'ed25519')
  for (const [name, value] of [
    ['AUTH_ENCRYPTION_KEY', 'short'],
    ['AUTH_SIGNING_PRIVATE_KEY', 'invalid-private-data'],
    ['API_ORIGIN', 'https://api.example.invalid/extra/path'],
    ['API_ORIGIN', 'http://api.example.invalid'],
  ] as const)
    assert.throws(
      () => readAuthConfig(authEnv({ [name]: value })),
      (error) => {
        assert(error instanceof Error)
        assert(error.message.includes(name))
        assert(!error.message.includes(value))
        return true
      },
    )
  assert.throws(
    () => readAuthConfig(authEnv({ AUTH_BROWSER_SECRET: undefined })),
    /AUTH_BROWSER_SECRET/,
  )
})
test('auth provider secret envelope is authenticated and bound to its own attempt', () => {
  const { security } = fixture(),
    scope = randomUUID(),
    secret = { verifier: 's'.repeat(43), nonce: 'n'.repeat(43) }
  const encrypted = security.seal(secret, scope)
  assert(!encrypted.includes(Buffer.from(secret.verifier)))
  assert.deepEqual(security.open(encrypted, scope), secret)
  assert.throws(
    () => security.open(encrypted, randomUUID()),
    /OAUTH_STATE_INVALID/,
  )
  const tampered = Buffer.from(encrypted)
  tampered[tampered.length - 1] ^= 1
  assert.throws(() => security.open(tampered, scope), /OAUTH_STATE_INVALID/)
})
test('auth browser cookie expires and CSRF is tied to that browser and attempt', () => {
  const { security, clock } = fixture(),
    cookie = security.newBrowserCookie(),
    browser = security.readBrowserCookie(cookie),
    attempt = randomUUID()
  assert(browser)
  const csrf = security.csrf(browser!, attempt)
  assert(security.checkCsrf(browser!, attempt, csrf))
  assert(!security.checkCsrf(browser!, randomUUID(), csrf))
  assert(!security.checkCsrf('x'.repeat(43), attempt, csrf))
  assert.equal(security.readBrowserCookie(cookie + 'x'), undefined)
  clock.advance(600001)
  assert.equal(security.readBrowserCookie(cookie), undefined)
})
test('auth access JWT validates signature issuer audience and TTL and never encodes plan flags', async () => {
  const { security, clock, config } = fixture(),
    identity = {
      userId: randomUUID(),
      sessionId: randomUUID(),
      deviceId: randomUUID(),
    }
  const token = await security.issueAccess(identity)
  assert.deepEqual(await security.verifyAccess(token), identity)
  const payload = JSON.parse(
    Buffer.from(token.split('.')[1], 'base64url').toString(),
  )
  assert.equal(payload.plan, undefined)
  assert.equal(payload.isPro, undefined)
  const foreign = generateKeyPairSync('ed25519').privateKey
  const fake = await new SignJWT({
    sid: identity.sessionId,
    did: identity.deviceId,
  })
    .setProtectedHeader({ alg: 'EdDSA', kid: 'judytik-test-v1' })
    .setSubject(identity.userId)
    .setIssuer(config.origin)
    .setAudience('judytik-desktop')
    .setIssuedAt()
    .setExpirationTime('15m')
    .sign(foreign)
  await assert.rejects(() => security.verifyAccess(fake), /AUTH_UNAUTHORIZED/)
  for (const [issuer, audience] of [
    ['https://other.invalid', 'judytik-desktop'],
    [config.origin, 'other-app'],
  ]) {
    const invalid = await new SignJWT({
      sid: identity.sessionId,
      did: identity.deviceId,
    })
      .setProtectedHeader({ alg: 'EdDSA', kid: 'judytik-test-v1' })
      .setSubject(identity.userId)
      .setIssuer(issuer)
      .setAudience(audience)
      .setIssuedAt()
      .setExpirationTime('15m')
      .sign(config.privateKey)
    await assert.rejects(
      () => security.verifyAccess(invalid),
      /AUTH_UNAUTHORIZED/,
    )
  }
  clock.advance(900001)
  await assert.rejects(() => security.verifyAccess(token), /AUTH_UNAUTHORIZED/)
})
