import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { Client } from 'pg'
import {
  PrismaService,
  type VerifiedUserId,
} from '../src/database/prisma.service.js'
import { readConfig } from '../src/config/env.js'
const owner = new Client({
  connectionString: process.env.TEST_ADMIN_DATABASE_URL,
})
const db = new PrismaService(readConfig(process.env))
const A = '00000000-0000-4000-8000-000000000001' as VerifiedUserId,
  B = '00000000-0000-4000-8000-000000000002' as VerifiedUserId
before(async () => {
  await owner.connect()
  await db.onModuleInit()
  await owner.query(
    'INSERT INTO judytik.users(id,display_name) VALUES($1,$2),($3,$4)',
    [A, 'A', B, 'B'],
  )
  await owner.query(
    'INSERT INTO judytik.account_settings(user_id) SELECT id FROM judytik.users WHERE id IN ($1,$2)',[A,B],
  )
  await owner.query(
    `INSERT INTO judytik.action_presets(id,user_id,name,actions) VALUES('10000000-0000-4000-8000-000000000001',$1,'A preset','[]'),('10000000-0000-4000-8000-000000000002',$2,'B preset','[]')`,
    [A, B],
  )
})
after(async () => {
  await db.onModuleDestroy()
  await owner.end()
})
test('database scopes A and B to their own presets with one trusted same-tx context', async () => {
  const a = await db.withUserContext(A, (tx) => tx.actionPreset.findMany())
  const b = await db.withUserContext(B, (tx) => tx.actionPreset.findMany())
  assert.deepEqual(
    a.map((x) => x.name),
    ['A preset'],
  )
  assert.deepEqual(
    b.map((x) => x.name),
    ['B preset'],
  )
  assert.equal(await db.client.actionPreset.count(), 0)
})
test('database clears user context after rollback', async () => {
  await assert.rejects(
    () =>
      db.withUserContext(A, async (tx) => {
        assert.equal(await tx.actionPreset.count(), 1)
        throw Error('rollback requested')
      }),
    /rollback requested/,
  )
  assert.equal(await db.client.actionPreset.count(), 0)
})
test('database forbids foreign-owner inserts and owner changes even with valid IDs', async () => {
  await assert.rejects(() =>
    db.withUserContext(A, (tx) =>
      tx.actionPreset.create({
        data: {
          id: '10000000-0000-4000-8000-000000000009',
          userId: B,
          name: 'forged',
          actions: [],
        },
      }),
    ),
  )
  await assert.rejects(() =>
    db.withUserContext(A, (tx) =>
      tx.actionPreset.update({
        where: { id: '10000000-0000-4000-8000-000000000001' },
        data: { userId: B, revision: { increment: 1 } },
      }),
    ),
  )
})
test('database enforces revisions and increments collection revision without granting direct counter mutation', async () => {
  await assert.rejects(() =>
    db.withUserContext(A, (tx) =>
      tx.actionPreset.update({
        where: { id: '10000000-0000-4000-8000-000000000001' },
        data: { name: 'invalid' },
      }),
    ),
  )
  await db.withUserContext(A, async (tx) => {
    await tx.$queryRaw`SELECT id FROM judytik.users WHERE id=${A}::uuid FOR UPDATE`
    await tx.actionPreset.update({
      where: { id: '10000000-0000-4000-8000-000000000001' },
      data: { name: 'A revision 2', revision: { increment: 1 } },
    })
  })
  const user = await db.client.user.findUniqueOrThrow({ where: { id: A } })
  assert.equal(user.presetsRevision, 2n)
  await assert.rejects(() =>
    db.client.user.update({
      where: { id: A },
      data: { presetsRevision: 999n },
    }),
  )
})
test('database settings are owner-scoped and require monotonic revision', async () => {
  const rows = await db.withUserContext(A, (tx) =>
    tx.accountSettings.findMany(),
  )
  assert.equal(rows.length, 1)
  assert.equal(rows[0].userId, A)
  await assert.rejects(() =>
    db.withUserContext(A, (tx) =>
      tx.accountSettings.update({
        where: { userId: A },
        data: { theme: 'light' },
      }),
    ),
  )
  const saved = await db.withUserContext(A, (tx) =>
    tx.accountSettings.update({
      where: { userId: A },
      data: { theme: 'light', revision: { increment: 1 } },
    }),
  )
  assert.equal(saved.revision, 1n)
})
test('database rejects malformed user context before entering a transaction', async () => {
  await assert.rejects(
    () =>
      db.withUserContext('forged' as VerifiedUserId, (tx) =>
        tx.actionPreset.count(),
      ),
    /INVALID_USER_CONTEXT/,
  )
})

test('database rejects a session attached to another user device', async () => {
  await owner.query(
    `INSERT INTO judytik.devices(id,user_id,installation_id,label,platform) VALUES('20000000-0000-4000-8000-000000000001',$1,gen_random_uuid(),'A device','windows'),('20000000-0000-4000-8000-000000000002',$2,gen_random_uuid(),'B device','windows')`,
    [A, B],
  )
  await assert.rejects(
    () =>
      owner.query(
        `INSERT INTO judytik.sessions(user_id,device_id,expires_at) VALUES($1,'20000000-0000-4000-8000-000000000002',now()+interval '1 day')`,
        [A],
      ),
    { code: '23503' },
  )
})
test('database refresh replacement cannot cross session families', async () => {
  await owner.query(
    `INSERT INTO judytik.sessions(id,user_id,device_id,expires_at) VALUES('30000000-0000-4000-8000-000000000001',$1,'20000000-0000-4000-8000-000000000001',now()+interval '1 day'),('30000000-0000-4000-8000-000000000002',$2,'20000000-0000-4000-8000-000000000002',now()+interval '1 day')`,
    [A, B],
  )
  await owner.query(
    `INSERT INTO judytik.refresh_tokens(id,session_id,token_hash,expires_at) VALUES('40000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001',decode(repeat('01',32),'hex'),now()+interval '1 day'),('40000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000002',decode(repeat('02',32),'hex'),now()+interval '1 day')`,
  )
  await assert.rejects(
    () =>
      owner.query(
        `UPDATE judytik.refresh_tokens SET used_at=now(),replaced_by='40000000-0000-4000-8000-000000000002' WHERE id='40000000-0000-4000-8000-000000000001'`,
      ),
    { code: '23503' },
  )
})
test('database allows only one pending email challenge and replacement after invalidation', async () => {
  const insert = () =>
    owner.query(
      `INSERT INTO judytik.email_challenges(user_id,email_key,code_hmac,expires_at) VALUES($1,'test@example.invalid',decode(repeat('03',32),'hex'),now()+interval '10 minutes')`,
      [A],
    )
  await insert()
  await assert.rejects(insert, { code: '23505' })
  await owner.query(
    'UPDATE judytik.email_challenges SET invalidated_at=now() WHERE user_id=$1',
    [A],
  )
  await insert()
})
test('production startup rejects elevated database role and accepts the restricted runtime role', async () => {
  const elevated = new PrismaService({
    ...readConfig(process.env),
    nodeEnv: 'production',
    databaseUrl: process.env.TEST_ADMIN_DATABASE_URL!,
  })
  try {
    await assert.rejects(() => elevated.onModuleInit(), /DATABASE_ROLE_UNSAFE/)
  } finally {
    await elevated.onModuleDestroy()
  }
  const safe = new PrismaService({
    ...readConfig(process.env),
    nodeEnv: 'production',
  })
  try {
    await safe.onModuleInit()
  } finally {
    await safe.onModuleDestroy()
  }
})

test('production startup rejects a runtime role that owns an application table even without schema ownership', async () => {
  await owner.query('CREATE TABLE judytik.runtime_owned_probe(id integer)')
  await owner.query(
    'ALTER TABLE judytik.runtime_owned_probe OWNER TO judytik_test_runtime',
  )
  const unsafe = new PrismaService({
    ...readConfig(process.env),
    nodeEnv: 'production',
  })
  try {
    await assert.rejects(() => unsafe.onModuleInit(), /DATABASE_ROLE_UNSAFE/)
  } finally {
    await unsafe.onModuleDestroy()
    await owner.query('DROP TABLE judytik.runtime_owned_probe')
  }
})
