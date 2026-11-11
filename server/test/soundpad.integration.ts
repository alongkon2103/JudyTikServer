import {grantTestPro} from './support/pro-account.js'
import 'reflect-metadata'
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { Client } from 'pg'
import { Test } from '@nestjs/testing'
import type { NestExpressApplication } from '@nestjs/platform-express'
import { AppModule } from '../src/app.module.js'
import { configureApp } from '../src/http/configure.js'
import { readConfig } from '../src/config/env.js'
import { PrismaService } from '../src/database/prisma.service.js'
import { CLOCK } from '../src/auth/clock.js'
import { authHarness } from './support/auth-flow.js'

const config = readConfig(process.env), db = new PrismaService(config), h = authHarness(db)
const owner = new Client({ connectionString: process.env.TEST_ADMIN_DATABASE_URL })
type Account = Awaited<ReturnType<typeof h.signIn>>
const signInPro=async(options:Parameters<typeof h.signIn>[0]={})=>{const account=await h.signIn(options);await grantTestPro(db,account.session.userId,h.clock);return account}
let app: NestExpressApplication, base: string
const document = () => ({ version: 1, volume: 75, pads: [{
  id: randomUUID(), name: 'Air horn', category: 'reaction', bindingId: randomUUID(),
  displayName: 'air-horn.mp3', hotkey: 'num1', source: {
    provider: 'myinstants', slug: 'air-horn', name: 'Air horn',
    sound: 'https://www.myinstants.com/media/sounds/air-horn.mp3',
  },
}] })
const call = (user: Account, options: RequestInit = {}) => fetch(base + '/v1/me/soundpad', {
  ...options, headers: { 'content-type': 'application/json', authorization: 'Bearer ' + user.tokens.access_token, ...options.headers },
})
const save = (user: Account, body: unknown, revision = '0', requestId = randomUUID()) => call(user, {
  method: 'PUT', headers: { 'if-match': '"' + revision + '"', 'x-request-id': requestId }, body: JSON.stringify(body),
})
before(async () => {
  await db.onModuleInit()
  await owner.connect()
  const module = await Test.createTestingModule({ imports: [AppModule.register({ ...config, auth: h.config })] })
    .overrideProvider(CLOCK).useValue(h.clock).compile()
  app = configureApp(module.createNestApplication<NestExpressApplication>({ logger: false }))
  await app.listen(0, '127.0.0.1')
  base = await app.getUrl()
})
after(async () => { await app?.close(); await db.onModuleDestroy(); await owner.end() })

test('Soundpad HTTP requires native session authorization', async () => {
  assert.equal((await fetch(base + '/v1/me/soundpad')).status, 401)
  assert.equal((await fetch(base + '/v1/me/soundpad', { headers: { authorization: 'Bearer invalid' } })).status, 401)
  assert.equal((await fetch(base + '/v1/me/soundpad', { headers: { cookie: 'session=fake' } })).status, 401)
})

test('Soundpad defaults, writes, same-account restore and audit are account scoped', async () => {
  const subject = randomUUID(), a = await signInPro({ subject }), same = await signInPro({ subject }), other = await signInPro()
  const initial = await call(a)
  assert.equal(initial.status, 200)
  assert.equal(initial.headers.get('etag'), '"0"')
  assert.deepEqual(await initial.json(), { revision: '0', data: { version: 1, volume: 75, enabled: true, pads: [] } })
  assert.equal(await db.withUserContext(a.session.userId, tx => tx.$queryRaw<any[]>`SELECT * FROM judytik.soundpad_workspaces`).then(rows => rows.length), 0)
  const changed = document(), requestId = randomUUID(), written = await save(a, changed, '0', requestId)
  assert.equal(written.status, 200)
  assert.equal(written.headers.get('etag'), '"1"')
  assert.deepEqual(await written.json(), { revision: '1', data: changed })
  assert.deepEqual(await (await call(same)).json(), { revision: '1', data: changed })
  assert.deepEqual(await (await call(other)).json(), { revision: '0', data: { version: 1, volume: 75, enabled: true, pads: [] } })
  const events = await owner.query('SELECT actor_user_id,session_id,event_name,resource_revision,request_id FROM judytik.audit_events WHERE request_id=$1', [requestId])
  assert.deepEqual(events.rows, [{ actor_user_id: a.session.userId, session_id: a.session.sessionId, event_name: 'soundpad.updated', resource_revision: '1', request_id: requestId }])
  const updated = { ...changed, enabled: false, volume: 25, pads: [] }
  assert.equal((await save(a, updated, '1')).headers.get('etag'), '"2"')
  assert.deepEqual(await (await call(same)).json(), { revision: '2', data: updated })
})

test('Soundpad rejects invalid documents and preconditions without changing stored data', async () => {
  const a = await signInPro(), changed = document()
  assert.equal((await call(a, { method: 'PUT', body: JSON.stringify(changed) })).status, 428)
  for (const match of ['0', '*', 'W/"0"', '"01"', '"-1"'])
    assert.equal((await call(a, { method: 'PUT', headers: { 'if-match': match }, body: JSON.stringify(changed) })).status, 400)
  assert.equal((await call(a, { method: 'PUT', headers: { 'if-match': '"0"', 'if-none-match': '*' }, body: JSON.stringify(changed) })).status, 400)
  for (const invalid of [{ ...changed, enabled: 'false' }, { ...changed, volume: 101 }, { ...changed, path: '/tmp/a.mp3' }, { ...changed, pads: [{ ...changed.pads[0], source: { ...changed.pads[0].source, sound: 'https://evil.test/a.mp3' } }] }])
    assert.equal((await save(a, invalid)).status, 400)
  assert.deepEqual(await (await call(a)).json(), { revision: '0', data: { version: 1, volume: 75, enabled: true, pads: [] } })
})

test('Soundpad optimistic writes serialize and preserve the winning document', async () => {
  const a = await signInPro(), first = document(), second = { ...document(), volume: 20 }
  const results = await Promise.all([save(a, first), save(a, second)])
  assert.deepEqual(results.map(r => r.status).sort(), [200, 412])
  const conflict = await results.find(r => r.status === 412)!.json()
  assert.equal(conflict.error.code, 'SOUNDPAD_VERSION_CONFLICT')
  const stored = await (await call(a)).json()
  assert.equal(stored.revision, '1')
  assert.deepEqual(stored.data, results[0].status === 200 ? first : second)
  assert.equal((await save(a, document(), '0')).status, 412)
})

test('Soundpad RLS hides foreign documents and forbids foreign writes and owner changes', async () => {
  const a = await signInPro(), b = await signInPro(), c = await signInPro(), changed = document()
  assert.equal((await save(a, changed)).status, 200)
  assert.equal((await save(b, document())).status, 200)
  assert.equal((await db.client.$queryRaw<any[]>`SELECT * FROM judytik.soundpad_workspaces`).length, 0)
  const rows = await db.withUserContext(a.session.userId, tx => tx.$queryRaw<any[]>`SELECT user_id FROM judytik.soundpad_workspaces`)
  assert.deepEqual(rows, [{ user_id: a.session.userId }])
  await assert.rejects(() => db.withUserContext(a.session.userId, tx => tx.$executeRaw`INSERT INTO judytik.soundpad_workspaces(user_id,data) VALUES(${c.session.userId}::uuid,${JSON.stringify(changed)}::jsonb)`))
  await assert.rejects(() => db.withUserContext(a.session.userId, tx => tx.$executeRaw`UPDATE judytik.soundpad_workspaces SET user_id=${c.session.userId}::uuid,revision=revision+1 WHERE user_id=${a.session.userId}::uuid`))
  await assert.rejects(() => db.withUserContext(a.session.userId, tx => tx.$executeRaw`UPDATE judytik.soundpad_workspaces SET data='{}'::jsonb WHERE user_id=${a.session.userId}::uuid`))
  await assert.rejects(() => db.withUserContext(a.session.userId, tx => tx.$executeRaw`DELETE FROM judytik.soundpad_workspaces WHERE user_id=${a.session.userId}::uuid`))
})

test('Soundpad audit failure rolls back the document write', async () => {
  const a = await signInPro()
  await owner.query(`CREATE FUNCTION judytik.reject_soundpad_audit_test() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.actor_user_id='${a.session.userId}'::uuid AND NEW.event_name='soundpad.updated' THEN RAISE EXCEPTION 'fixture audit failure'; END IF;RETURN NEW; END $$;CREATE TRIGGER reject_soundpad_audit_test BEFORE INSERT ON judytik.audit_events FOR EACH ROW EXECUTE FUNCTION judytik.reject_soundpad_audit_test()`)
  try {
    assert.equal((await save(a, document())).status, 500)
    assert.deepEqual(await (await call(a)).json(), { revision: '0', data: { version: 1, volume: 75, enabled: true, pads: [] } })
  } finally {
    await owner.query('DROP TRIGGER reject_soundpad_audit_test ON judytik.audit_events;DROP FUNCTION judytik.reject_soundpad_audit_test()')
  }
})

test('Soundpad accepts a valid 100-pad document within the HTTP byte limit', async () => {
  const a = await signInPro(), changed = { version: 1, volume: 75, pads: Array.from({ length: 100 }, () => ({
    ...document().pads[0], name: 'a'.repeat(40), displayName: 'b'.repeat(255), hotkey: '',
    source: { provider: 'myinstants', slug: 's'.repeat(160), name: 'n'.repeat(160), sound: 'https://www.myinstants.com/media/sounds/' + 'c'.repeat(1727) + '.mp3' },
  })) }
  assert(Buffer.byteLength(JSON.stringify(changed)) < 262144)
  const written = await save(a, changed)
  assert.equal(written.status, 200)
  assert.deepEqual(await (await call(a)).json(), { revision: '1', data: changed })
})

test('Soundpad play modes round-trip for capable clients while older saves preserve them', async () => {
  const user = await signInPro(), changed = document()
  Object.assign(changed.pads[0], { playMode: 'hold' })
  const features = { 'x-judytik-soundpad-features': 'play-modes' }
  const write = (body: unknown, revision: string, capable = true) => call(user, {
    method: 'PUT', headers: { 'if-match': '"' + revision + '"', ...(capable ? features : {}) }, body: JSON.stringify(body),
  })
  assert.equal((await write(changed, '0')).status, 200)
  assert.deepEqual((await (await call(user, { headers: features })).json()).data, changed)
  const legacy = structuredClone(changed)
  delete (legacy.pads[0] as any).playMode
  legacy.volume = 30
  assert.deepEqual((await (await write(legacy, '1', false)).json()).data, legacy)
  assert.equal((await (await call(user, { headers: features })).json()).data.pads[0].playMode, 'hold')
  assert.equal((await write(legacy, '2')).status, 200)
  assert.equal((await (await call(user, { headers: features })).json()).data.pads[0].playMode, undefined)
})
