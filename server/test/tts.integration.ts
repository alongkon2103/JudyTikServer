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
let app: NestExpressApplication, base: string
const defaults = {
  version: 1, voiceId: '', speed: 1.2, volume: 80,
  filter: { enabled: true, blockedWords: [] },
  read: { comment: true, gift: false, follow: false },
  templates: {
    comment: '{comment}',
    gift: 'ขอบคุณ {username} สำหรับ {gift}',
    follow: 'ขอบคุณ {username} ที่ติดตาม',
  },
}
const document = () => ({
  ...defaults, voiceId: 'com.apple.voice.compact.th-TH.Kanya', speed: 1.25, volume: 65,
  read: { comment: true, gift: true, follow: false },
  templates: { ...defaults.templates, comment: '{username}: {comment}' },
})
const call = (user: Account, options: RequestInit = {}) => fetch(base + '/v1/me/tts', {
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

test('TTS HTTP requires native session authorization', async () => {
  assert.equal((await fetch(base + '/v1/me/tts')).status, 401)
  assert.equal((await fetch(base + '/v1/me/tts', { method: 'PUT', headers: { 'content-type': 'application/json', 'if-match': '\"0\"' }, body: JSON.stringify(document()) })).status, 401)
  assert.equal((await fetch(base + '/v1/me/tts', { headers: { authorization: 'Bearer invalid' } })).status, 401)
  assert.equal((await fetch(base + '/v1/me/tts', { headers: { cookie: 'session=fake' } })).status, 401)
})

test('TTS defaults, writes, same-account restore and audit are account scoped', async () => {
  const subject = randomUUID(), a = await h.signIn({ subject }), same = await h.signIn({ subject }), other = await h.signIn()
  const initial = await call(a)
  assert.equal(initial.status, 200)
  assert.equal(initial.headers.get('etag'), '"0"')
  assert.deepEqual(await initial.json(), { revision: '0', data: defaults })
  assert.equal(await db.withUserContext(a.session.userId, tx => tx.$queryRaw<any[]>`SELECT * FROM judytik.tts_workspaces`).then(rows => rows.length), 0)
  const changed = document(), requestId = randomUUID(), written = await save(a, changed, '0', requestId)
  assert.equal(written.status, 200)
  assert.equal(written.headers.get('etag'), '"1"')
  assert.deepEqual(await written.json(), { revision: '1', data: changed })
  assert.deepEqual(await (await call(same)).json(), { revision: '1', data: changed })
  assert.deepEqual(await (await call(other)).json(), { revision: '0', data: defaults })
  const events = await owner.query('SELECT actor_user_id,session_id,event_name,resource_revision,request_id FROM judytik.audit_events WHERE request_id=$1', [requestId])
  assert.deepEqual(events.rows, [{ actor_user_id: a.session.userId, session_id: a.session.sessionId, event_name: 'tts.updated', resource_revision: '1', request_id: requestId }])
  const updated = { ...changed, voiceId: '', speed: 0.5, volume: 25 }
  assert.equal((await save(a, updated, '1')).headers.get('etag'), '"2"')
  assert.deepEqual(await (await call(same)).json(), { revision: '2', data: updated })
})

test('TTS rejects invalid documents and preconditions without changing stored data', async () => {
  const a = await h.signIn(), changed = document()
  assert.equal((await call(a, { method: 'PUT', body: JSON.stringify(changed) })).status, 428)
  for (const match of ['0', '*', 'W/"0"', '"01"', '"-1"'])
    assert.equal((await call(a, { method: 'PUT', headers: { 'if-match': match }, body: JSON.stringify(changed) })).status, 400)
  assert.equal((await call(a, { method: 'PUT', headers: { 'if-match': '"0"', 'if-none-match': '*' }, body: JSON.stringify(changed) })).status, 400)
  for (const invalid of [
    { ...changed, speed: 2.01 }, { ...changed, volume: 0.5 },
    { ...changed, voiceId: 'a'.repeat(101) }, { ...changed, voiceId: 'bad\u202e' },
    { ...changed, read: { ...changed.read, comment: 'yes' } },
    { ...changed, templates: { ...changed.templates, comment: '' } },
    { ...changed, templates: { ...changed.templates, gift: 'bad\n' } },
    { ...changed, queue: [] }, { ...changed, chats: [] }, { ...changed, voices: [] },
    { ...changed, userId: randomUUID() },
  ])
    assert.equal((await save(a, invalid)).status, 400)
  assert.deepEqual(await (await call(a)).json(), { revision: '0', data: defaults })
})

test('TTS optimistic writes serialize and preserve the winning document', async () => {
  const a = await h.signIn(), first = document(), second = { ...document(), volume: 20 }
  const results = await Promise.all([save(a, first), save(a, second)])
  assert.deepEqual(results.map(r => r.status).sort(), [200, 412])
  const conflict = await results.find(r => r.status === 412)!.json()
  assert.equal(conflict.error.code, 'TTS_VERSION_CONFLICT')
  const stored = await (await call(a)).json()
  assert.equal(stored.revision, '1')
  assert.deepEqual(stored.data, results[0].status === 200 ? first : second)
  assert.equal((await save(a, document(), '0')).status, 412)
})

test('TTS RLS hides foreign documents and forbids foreign writes and owner changes', async () => {
  const a = await h.signIn(), b = await h.signIn(), c = await h.signIn(), changed = document()
  assert.equal((await save(a, changed)).status, 200)
  assert.equal((await save(b, document())).status, 200)
  assert.equal((await db.client.$queryRaw<any[]>`SELECT * FROM judytik.tts_workspaces`).length, 0)
  const rows = await db.withUserContext(a.session.userId, tx => tx.$queryRaw<any[]>`SELECT user_id FROM judytik.tts_workspaces`)
  assert.deepEqual(rows, [{ user_id: a.session.userId }])
  await assert.rejects(() => db.withUserContext(a.session.userId, tx => tx.$executeRaw`INSERT INTO judytik.tts_workspaces(user_id,data) VALUES(${c.session.userId}::uuid,${JSON.stringify(changed)}::jsonb)`))
  await assert.rejects(() => db.withUserContext(a.session.userId, tx => tx.$executeRaw`UPDATE judytik.tts_workspaces SET user_id=${c.session.userId}::uuid,revision=revision+1 WHERE user_id=${a.session.userId}::uuid`))
  await assert.rejects(() => db.withUserContext(a.session.userId, tx => tx.$executeRaw`UPDATE judytik.tts_workspaces SET data='{}'::jsonb WHERE user_id=${a.session.userId}::uuid`))
  await assert.rejects(() => db.withUserContext(a.session.userId, tx => tx.$executeRaw`DELETE FROM judytik.tts_workspaces WHERE user_id=${a.session.userId}::uuid`))
})

test('TTS audit failure rolls back both initial creation and an existing document update', async () => {
  const a = await h.signIn(), b = await h.signIn(), changed = document()
  assert.equal((await save(b, changed)).status, 200)
  await owner.query(`CREATE FUNCTION judytik.reject_tts_audit_test() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.actor_user_id IN ('${a.session.userId}'::uuid,'${b.session.userId}'::uuid) AND NEW.event_name='tts.updated' THEN RAISE EXCEPTION 'fixture audit failure'; END IF;RETURN NEW; END $$;CREATE TRIGGER reject_tts_audit_test BEFORE INSERT ON judytik.audit_events FOR EACH ROW EXECUTE FUNCTION judytik.reject_tts_audit_test()`)
  try {
    assert.equal((await save(a, document())).status, 500)
    assert.deepEqual(await (await call(a)).json(), { revision: '0', data: defaults })
    assert.equal((await save(b, { ...changed, volume: 20 }, '1')).status, 500)
    assert.deepEqual(await (await call(b)).json(), { revision: '1', data: changed })
  } finally {
    await owner.query('DROP TRIGGER reject_tts_audit_test ON judytik.audit_events;DROP FUNCTION judytik.reject_tts_audit_test()')
  }
})

test('TTS accepts all inclusive settings and template limits over HTTP', async () => {
  const a = await h.signIn(), changed = {
    ...document(), voiceId: 'ก'.repeat(100), speed: 2, volume: 100,
    templates: { comment: 'ก'.repeat(500), gift: '🎁'.repeat(250), follow: 'a' },
  }
  const written = await save(a, changed)
  assert.equal(written.status, 200)
  assert.deepEqual(await (await call(a)).json(), { revision: '1', data: changed })
})

test('TTS HTTP round-trips long multilingual filters while retaining the 256 KiB body boundary',async()=>{
 const a=await h.signIn(),phrase='สวัสดี 欢迎 नमस्ते સ્વાગત \\ '.repeat(60)
 const changed={...document(),filter:{enabled:true,blockedWords:[phrase,...Array.from({length:150},(_,i)=>'รายการ '+i)]}}
 const written=await save(a,changed)
 assert.equal(written.status,200)
 assert.deepEqual(await (await call(a)).json(),{revision:'1',data:changed})
 const oversized=await save(a,{...changed,filter:{enabled:true,blockedWords:['ก'.repeat(90000)]}},'1')
 assert.equal(oversized.status,413)
 assert.equal((await oversized.json()).error.code,'REQUEST_TOO_LARGE')
 assert.deepEqual(await (await call(a)).json(),{revision:'1',data:changed})
})

test('TTS database stores only the bounded account settings document', async () => {
  const columns = await owner.query(`SELECT column_name FROM information_schema.columns WHERE table_schema='judytik' AND table_name='tts_workspaces' ORDER BY ordinal_position`)
  assert.deepEqual(columns.rows.map(row => row.column_name), ['user_id', 'data', 'revision', 'created_at', 'updated_at'])
  const a = await h.signIn()
  for (const data of [[], null, 'a'.repeat(1048576), { text: 'a'.repeat(1048576) }])
    await assert.rejects(() => owner.query('INSERT INTO judytik.tts_workspaces(user_id,data) VALUES($1,$2::jsonb)', [a.session.userId, JSON.stringify(data)]), { code: '23514' })
  await assert.rejects(() => owner.query('INSERT INTO judytik.tts_workspaces(user_id,data,revision) VALUES($1,$2::jsonb,0)', [a.session.userId, JSON.stringify(document())]), { code: '23514' })
})

test('TTS refuses to return a stored document that fails its settings contract', async () => {
  const a = await h.signIn()
  await owner.query('INSERT INTO judytik.tts_workspaces(user_id,data) VALUES($1,$2::jsonb)', [a.session.userId, '{}'])
  const response = await call(a)
  assert.equal(response.status, 500)
  assert.equal((await response.json()).error.code, 'TTS_DATA_INVALID')
})
