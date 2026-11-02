import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { createServer } from 'node:http'
import { Client } from 'pg'
import { PrismaService } from '../src/database/prisma.service.js'
import { readConfig } from '../src/config/env.js'
import { PresetsService } from '../src/presets/service.js'
import { SettingsService } from '../src/settings/service.js'
import { authHarness } from './support/auth-flow.js'
const db = new PrismaService(readConfig(process.env)),
  owner = new Client({ connectionString: process.env.TEST_ADMIN_DATABASE_URL }),
  h = authHarness(db),
  presets = new PresetsService(db),
  settings = new SettingsService(db)
before(async () => {
  await owner.connect()
  await db.onModuleInit()
  await owner.query(
    "INSERT INTO judytik.gifts(id,aliases,search_text) VALUES('5655',ARRAY[]::text[],'rose') ON CONFLICT DO NOTHING",
  )
})
after(async () => {
  await db.onModuleDestroy()
  await owner.end()
})
const body = () => ({
  schemaVersion: 1,
  name: 'My preset',
  actions: [
    {
      id: 'rose',
      name: 'Rose hello',
      trigger: 'gift',
      enabled: true,
      giftId: '5655',
      threshold: 1,
      minCoins: 0,
      cooldownSeconds: 0,
      comboMode: 'streak-end',
      commentMatch: '',
      hotkey: '',
      effects: [{ kind: 'overlay', template: 'Hello {username}' }],
    },
  ],
})
const create = { ifNoneMatch: '*' },
  requestId = () => randomUUID()
test('Cloud preset round-trip follows one account across sessions and rejects another owner', async () => {
  const subject = randomUUID(),
    a = await h.signIn({ provider: 'discord', subject }),
    again = await h.signIn({ provider: 'discord', subject }),
    b = await h.signIn(),
    id = randomUUID()
  const saved = await presets.save(a.session, id, body(), create, requestId())
  assert.equal(saved.value.revision, '1')
  assert.equal(saved.created, true)
  assert.deepEqual(
    (await presets.get(again.session, id)).actions,
    saved.value.actions,
  )
  for (const fn of [
    () => presets.get(b.session, id),
    () => presets.save(b.session, id, body(), { ifMatch: '"1"' }, requestId()),
    () => presets.save(b.session, id, body(), create, requestId()),
    () => presets.remove(b.session, id, '"1"', requestId()),
  ])
    await assert.rejects(fn, /PRESET_NOT_FOUND/)
  assert.equal((await presets.get(a.session, id)).revision, '1')
})
test('Cloud preset requires one strong precondition and detects stale/concurrent writes', async () => {
  const a = await h.signIn(),
    id = randomUUID()
  for (const headers of [
    {},
    { ifMatch: '"1"', ifNoneMatch: '*' },
    { ifMatch: 'W/"1"' },
    { ifNoneMatch: 'invalid' },
  ])
    await assert.rejects(
      () => presets.save(a.session, id, body(), headers, requestId()),
      /PRECONDITION_REQUIRED|INVALID_PRECONDITION/,
    )
  await presets.save(a.session, id, body(), create, requestId())
  const results = await Promise.allSettled(
    [1, 2].map((i) =>
      presets.save(
        a.session,
        id,
        { ...body(), name: 'Device ' + i },
        { ifMatch: '"1"' },
        requestId(),
      ),
    ),
  )
  assert.equal(results.filter((x) => x.status === 'fulfilled').length, 1)
  const failure = results.find(
    (x) => x.status === 'rejected',
  ) as PromiseRejectedResult
  assert.match(String(failure.reason), /PRESET_VERSION_CONFLICT/)
  assert.equal((await presets.get(a.session, id)).revision, '2')
  await assert.rejects(
    () => presets.save(a.session, id, body(), create, requestId()),
    /PRESET_VERSION_CONFLICT/,
  )
  await assert.rejects(
    () => presets.remove(a.session, id, undefined, requestId()),
    /PRECONDITION_REQUIRED/,
  )
})
test('Cloud preset validation rejects authority flags, duplicate rules, unknown gifts, invalid effects and paths', async () => {
  const a = await h.signIn(),
    base = body(),
    rule = base.actions[0]
  const invalid = [
    { ...base, userId: a.session.userId },
    { ...base, isPro: true },
    { ...base, revision: '999' },
    { ...base, actions: [rule, { ...rule }] },
    { ...base, name: '   ' },
    { ...base, actions: [{ ...rule, giftId: '99999999999999999999' }] },
    {
      ...base,
      actions: [
        {
          ...rule,
          effects: [
            {
              kind: 'sound',
              media: {
                bindingId: randomUUID(),
                displayName: '/private/voice.mp3',
              },
            },
          ],
        },
      ],
    },
    {
      ...base,
      actions: [
        { ...rule, effects: [{ kind: 'keyboard', keys: ['ExecuteAnything'] }] },
      ],
    },
    {
      ...base,
      actions: [
        {
          ...rule,
          effects: [
            { kind: 'webhook', method: 'POST', url: 'javascript:alert(1)' },
          ],
        },
      ],
    },
    {
      ...base,
      actions: [
        {
          ...rule,
          effects: [
            {
              kind: 'webhook',
              method: 'GET',
              url: 'https://user:secret@example.invalid/hook',
            },
          ],
        },
      ],
    },
  ]
  for (const input of invalid)
    await assert.rejects(
      () => presets.save(a.session, randomUUID(), input, create, requestId()),
      /INVALID_REQUEST|INVALID_PRESET|GIFT_NOT_FOUND/,
    )
  assert.equal((await presets.list(a.session, {})).items.length, 0)
})
test('Cloud preset body limit is byte-based and oversized valid shapes do not mutate state', async () => {
  const a = await h.signIn(),
    rule = body().actions[0],
    oversized = {
      ...body(),
      actions: Array.from({ length: 100 }, (_, i) => ({
        ...rule,
        id: 'action' + i,
        effects: Array.from({ length: 20 }, () => ({
          kind: 'overlay',
          template: 'x'.repeat(1000),
        })),
      })),
    }
  await assert.rejects(
    () => presets.save(a.session, randomUUID(), oversized, create, requestId()),
    /REQUEST_TOO_LARGE/,
  )
  assert.equal((await presets.list(a.session, {})).collectionRevision, '0')
})
test('Cloud preset tombstones hide deletes and prevent silent resurrection', async () => {
  const a = await h.signIn(),
    id = randomUUID()
  await presets.save(a.session, id, body(), create, requestId())
  await assert.rejects(
    () => presets.remove(a.session, id, '"0"', requestId()),
    /PRESET_VERSION_CONFLICT/,
  )
  await presets.remove(a.session, id, '"1"', requestId())
  await assert.rejects(() => presets.get(a.session, id), /PRESET_NOT_FOUND/)
  assert.equal((await presets.list(a.session, {})).items.length, 0)
  await assert.rejects(
    () => presets.save(a.session, id, body(), create, requestId()),
    /PRESET_VERSION_CONFLICT/,
  )
  const row = await owner.query(
    'SELECT revision,deleted_at FROM judytik.action_presets WHERE id=$1',
    [id],
  )
  assert.equal(row.rows[0].revision, '2')
  assert(row.rows[0].deleted_at)
})
test('Cloud preset pagination rejects an old collection snapshot after another device mutation', async () => {
  const a = await h.signIn(),
    ids = [randomUUID(), randomUUID(), randomUUID()].sort()
  for (const id of ids)
    await presets.save(a.session, id, body(), create, requestId())
  const page = await presets.list(a.session, { limit: '1' })
  assert.equal(page.items.length, 1)
  assert.equal(page.collectionRevision, '3')
  assert(page.nextCursor)
  await assert.rejects(
    () => presets.list(a.session, { after: page.nextCursor!.after }),
    /INVALID_REQUEST/,
  )
  await presets.save(
    a.session,
    ids[0],
    { ...body(), name: 'Edited' },
    { ifMatch: '"1"' },
    requestId(),
  )
  await assert.rejects(
    () => presets.list(a.session, { limit: '1', ...page.nextCursor }),
    /PRESET_COLLECTION_CHANGED/,
  )
  const fresh = await presets.list(a.session, { limit: '2' }),
    last = await presets.list(a.session, { limit: '2', ...fresh.nextCursor })
  assert.equal(fresh.collectionRevision, last.collectionRevision)
  assert.deepEqual(
    [...fresh.items, ...last.items].map((x: any) => x.id),
    ids,
  )
  await assert.rejects(
    () => presets.list(a.session, { limit: '101' }),
    /INVALID_REQUEST/,
  )
})
test('Cloud saves store webhook/media metadata without executing URLs or returning owner fields', async () => {
  let calls = 0
  const probe = createServer((_q, r) => {
    calls++
    r.end('unexpected')
  })
  await new Promise<void>((r) => probe.listen(0, '127.0.0.1', r))
  try {
    const a = await h.signIn(),
      id = randomUUID(),
      rule = body().actions[0],
      payload = {
        ...body(),
        actions: [
          {
            ...rule,
            effects: [
              {
                kind: 'webhook',
                method: 'POST',
                url:
                  'http://127.0.0.1:' + (probe.address() as any).port + '/hook',
                body: { secret: 'fixture-private-value' },
              },
              {
                kind: 'sound',
                media: { bindingId: randomUUID(), displayName: 'voice.mp3' },
              },
            ],
          },
        ],
      }
    const saved = await presets.save(
      a.session,
      id,
      payload,
      create,
      requestId(),
    )
    assert.equal(calls, 0)
    assert.equal(
      (saved.value as unknown as Record<string, unknown>).userId,
      undefined,
    )
    const audit = await owner.query(
      'SELECT event_name,resource_key,resource_revision FROM judytik.audit_events WHERE actor_user_id=$1 AND resource_id=$2',
      [a.session.userId, id],
    )
    assert(audit.rows.length)
    assert(!JSON.stringify(audit.rows).includes('fixture-private-value'))
  } finally {
    await new Promise<void>((r) => probe.close(() => r()))
  }
})
test('Cloud preset mutation, collection revision and audit roll back together', async () => {
  const a = await h.signIn(),
    id = randomUUID()
  await owner.query(
    `CREATE FUNCTION judytik.reject_data_audit_test() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.actor_user_id='${a.session.userId}'::uuid AND NEW.event_name LIKE 'preset.%' THEN RAISE EXCEPTION 'fixture audit failure'; END IF;RETURN NEW; END $$;CREATE TRIGGER reject_data_audit_test BEFORE INSERT ON judytik.audit_events FOR EACH ROW EXECUTE FUNCTION judytik.reject_data_audit_test()`,
  )
  try {
    await assert.rejects(() =>
      presets.save(a.session, id, body(), create, requestId()),
    )
    assert.equal((await presets.list(a.session, {})).collectionRevision, '0')
    await assert.rejects(() => presets.get(a.session, id), /PRESET_NOT_FOUND/)
  } finally {
    await owner.query('DROP FUNCTION judytik.reject_data_audit_test() CASCADE')
  }
})
test('Cloud settings are session-owned and reject stale writes or writable plan/owner fields', async () => {
  const a = await h.signIn(),
    b = await h.signIn(),
    initial = await settings.get(a.session)
  assert.equal(initial.theme, 'dark')
  assert.equal(initial.revision, '0')
  await assert.rejects(
    () =>
      settings.save(
        a.session,
        { theme: 'light', language: 'en' },
        undefined,
        requestId(),
      ),
    /PRECONDITION_REQUIRED/,
  )
  await assert.rejects(
    () =>
      settings.save(
        a.session,
        { theme: 'light', language: 'en', plan: 'PRO' },
        '"0"',
        requestId(),
      ),
    /INVALID_REQUEST/,
  )
  const results = await Promise.allSettled(
    [1, 2].map(() =>
      settings.save(
        a.session,
        { theme: 'light', language: 'en' },
        '"0"',
        requestId(),
      ),
    ),
  )
  assert.equal(results.filter((x) => x.status === 'fulfilled').length, 1)
  assert.equal((await settings.get(a.session)).revision, '1')
  assert.equal((await settings.get(b.session)).theme, 'dark')
  assert.equal((await settings.get(b.session)).revision, '0')
})
