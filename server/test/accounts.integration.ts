import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { Client } from 'pg'
import { PrismaService } from '../src/database/prisma.service.js'
import { readConfig } from '../src/config/env.js'
import { AccountsService } from '../src/accounts/accounts.service.js'
import { EmailService } from '../src/accounts/email.service.js'
import { EntitlementsService } from '../src/entitlements/entitlements.service.js'
import { VerificationMailer } from '../src/accounts/mailer.js'
import { authHarness } from './support/auth-flow.js'
import { FakeMailer } from './support/fake-mail.js'
const owner = new Client({
    connectionString: process.env.TEST_ADMIN_DATABASE_URL,
  }),
  db = new PrismaService(readConfig(process.env)),
  h = authHarness(db),
  accounts = new AccountsService(db),
  entitlements = new EntitlementsService(db, h.clock),
  mailer = new FakeMailer(),
  email = new EmailService(db, h.security, mailer, h.clock)
before(async () => {
  await owner.connect()
  await db.onModuleInit()
})
after(async () => {
  await db.onModuleDestroy()
  await owner.end()
})
const address = () => randomUUID() + '@example.invalid'
test('accounts return only own profile/sessions and reject revoking another account session', async () => {
  const a = await h.signIn(),
    b = await h.signIn()
  const profile = await accounts.me(a.session)
  assert.equal(profile.id, a.session.userId)
  assert.equal(profile.email, null)
  const sessions = await accounts.sessions(a.session)
  assert(sessions.items.some((x) => x.id === a.tokens.sessionId && x.isCurrent))
  assert(!sessions.items.some((x) => x.id === b.tokens.sessionId))
  await assert.rejects(
    () => h.auth.revokeSession(a.session, b.tokens.sessionId, randomUUID()),
    /SESSION_NOT_FOUND/,
  )
  await h.auth.authenticate(b.tokens.access_token)
})
test('entitlements are computed from server grants and time, including expiry/revocation', async () => {
  const a = await h.signIn()
  assert.equal((await entitlements.get(a.session)).plan, 'FREE')
  const now = h.clock.now()
  const grant = await owner.query(
    `INSERT INTO judytik.entitlement_grants(user_id,plan,starts_at,ends_at) VALUES($1,'PRO',$2,$3) RETURNING id`,
    [
      a.session.userId,
      new Date(now.getTime() - 1000),
      new Date(now.getTime() + 86400000),
    ],
  )
  assert.equal((await entitlements.get(a.session)).state, 'expiring')
  await owner.query(
    'UPDATE judytik.entitlement_grants SET revoked_at=$2 WHERE id=$1',
    [grant.rows[0].id, now],
  )
  assert.equal((await entitlements.get(a.session)).plan, 'FREE')
  await owner.query(
    'UPDATE judytik.entitlement_grants SET revoked_at=NULL WHERE id=$1',
    [grant.rows[0].id],
  )
  h.clock.advance(86400001)
  const expired = await entitlements.get(a.session)
  assert.equal(expired.plan, 'FREE')
  assert.equal(expired.state, 'expired')
})
test('email challenge stores an HMAC, verifies once and updates only the authenticated account', async () => {
  const a = await h.signIn(),
    recipient = address()
  const challenge = await email.request(
      a.session,
      { email: recipient },
      '198.51.100.1',
      randomUUID(),
    ),
    message = mailer.sent.at(-1)!
  assert.match(message.code, /^\d{6}$/)
  const stored = await db.client.emailChallenge.findUniqueOrThrow({
    where: { id: challenge.id },
  })
  assert.equal(stored.codeHmac.byteLength, 32)
  assert.notEqual(Buffer.from(stored.codeHmac).toString(), message.code)
  assert(stored.requestIpHash)
  const verified = await email.verify(
    a.session,
    challenge.id,
    { code: message.code },
    randomUUID(),
  )
  assert.equal(verified.address, recipient)
  assert.equal((await accounts.me(a.session)).email?.address, recipient)
  await assert.rejects(
    () =>
      email.verify(
        a.session,
        challenge.id,
        { code: message.code },
        randomUUID(),
      ),
    /EMAIL_CODE_INVALID/,
  )
})
test('email wrong guesses commit, stop at five and reject even the correct code afterward', async () => {
  const a = await h.signIn(),
    challenge = await email.request(
      a.session,
      { email: address() },
      '198.51.100.2',
      randomUUID(),
    ),
    correct = mailer.sent.at(-1)!.code,
    wrong = correct === '000000' ? '000001' : '000000'
  for (let i = 0; i < 5; i++)
    await assert.rejects(
      () =>
        email.verify(a.session, challenge.id, { code: wrong }, randomUUID()),
      /EMAIL_CODE_INVALID/,
    )
  const stored = await db.client.emailChallenge.findUniqueOrThrow({
    where: { id: challenge.id },
  })
  assert.equal(stored.attempts, 5)
  await assert.rejects(
    () =>
      email.verify(a.session, challenge.id, { code: correct }, randomUUID()),
    /EMAIL_CODE_INVALID/,
  )
})
test('email rejects cross-user challenge access and expired codes', async () => {
  const a = await h.signIn(),
    b = await h.signIn(),
    challenge = await email.request(
      a.session,
      { email: address() },
      '198.51.100.3',
      randomUUID(),
    ),
    code = mailer.sent.at(-1)!.code
  await assert.rejects(
    () => email.verify(b.session, challenge.id, { code }, randomUUID()),
    /EMAIL_CHALLENGE_NOT_FOUND/,
  )
  h.clock.advance(600001)
  await assert.rejects(
    () => email.verify(a.session, challenge.id, { code }, randomUUID()),
    /EMAIL_CODE_INVALID/,
  )
})
test('email initiation is generic for existing addresses and never reassigns another owner', async () => {
  const recipient = address(),
    owner = await h.signIn({ email: recipient, verified: true }),
    other = await h.signIn(),
    challenge = await email.request(
      other.session,
      { email: recipient },
      '198.51.100.4',
      randomUUID(),
    )
  assert(challenge.id)
  await assert.rejects(
    () =>
      email.verify(
        other.session,
        challenge.id,
        { code: mailer.sent.at(-1)!.code },
        randomUUID(),
      ),
    /EMAIL_ALREADY_IN_USE/,
  )
  assert.equal((await accounts.me(owner.session)).email?.address, recipient)
  assert.equal((await accounts.me(other.session)).email, null)
})
test('email enforces resend delay and per-account send limit with persistent counters', async () => {
  const a = await h.signIn()
  const first = await email.request(
    a.session,
    { email: address() },
    '198.51.100.5',
    randomUUID(),
  )
  await assert.rejects(
    () =>
      email.request(
        a.session,
        { email: address() },
        '198.51.100.5',
        randomUUID(),
      ),
    /EMAIL_RATE_LIMITED/,
  )
  h.clock.advance(60001)
  await email.request(
    a.session,
    { email: address() },
    '198.51.100.5',
    randomUUID(),
  )
  h.clock.advance(60001)
  await email.request(
    a.session,
    { email: address() },
    '198.51.100.5',
    randomUUID(),
  )
  h.clock.advance(60001)
  await assert.rejects(
    () =>
      email.request(
        a.session,
        { email: address() },
        '198.51.100.5',
        randomUUID(),
      ),
    /EMAIL_RATE_LIMITED/,
  )
  assert(
    (
      await db.client.emailChallenge.findUniqueOrThrow({
        where: { id: first.id },
      })
    ).invalidatedAt,
  )
})
test('email serializes per-IP send limits across different authenticated accounts', async () => {
  const users = await Promise.all(Array.from({ length: 11 }, () => h.signIn()))
  const results = await Promise.allSettled(
    users.map((user) =>
      email.request(
        user.session,
        { email: address() },
        '198.51.100.99',
        randomUUID(),
      ),
    ),
  )
  assert.equal(results.filter((x) => x.status === 'fulfilled').length, 10)
  const failure = results.find(
    (x) => x.status === 'rejected',
  ) as PromiseRejectedResult
  assert.match(String(failure.reason), /EMAIL_RATE_LIMITED/)
})
test('email sending failure invalidates its challenge and never accepts a development mock code', async () => {
  const a = await h.signIn()
  mailer.fail = true
  await assert.rejects(
    () =>
      email.request(
        a.session,
        { email: address() },
        '198.51.100.6',
        randomUUID(),
      ),
    /EMAIL_SEND_UNAVAILABLE/,
  )
  mailer.fail = false
  const row = await db.client.emailChallenge.findFirstOrThrow({
    where: { userId: a.session.userId },
    orderBy: { createdAt: 'desc' },
  })
  assert(row.invalidatedAt)
  await assert.rejects(
    () => email.verify(a.session, row.id, { code: '123456' }, randomUUID()),
    /EMAIL_CODE_INVALID/,
  )
})
test('email unconfigured transport fails closed without creating a pretend verification', async () => {
  const a = await h.signIn(),
    unavailable = new EmailService(
      db,
      h.security,
      new VerificationMailer(undefined),
      h.clock,
    )
  await assert.rejects(
    () =>
      unavailable.request(
        a.session,
        { email: address() },
        '198.51.100.7',
        randomUUID(),
      ),
    /EMAIL_NOT_CONFIGURED/,
  )
})

test('Discord profile avatar persists and refreshes on later sign-in for the same identity',async()=>{const subject=randomUUID(),avatarUrl='https://cdn.discordapp.com/avatars/123/'+'b'.repeat(32)+'.png?size=128';const first=await h.signIn({provider:'discord',subject,avatarUrl});assert.equal((await accounts.me(first.session) as any).avatarUrl,avatarUrl);const nextUrl='https://cdn.discordapp.com/avatars/123/'+'c'.repeat(32)+'.png?size=128';const again=await h.signIn({provider:'discord',subject,avatarUrl:nextUrl});assert.equal(again.session.userId,first.session.userId);assert.equal((await accounts.me(first.session) as any).avatarUrl,nextUrl)})
