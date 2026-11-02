import 'reflect-metadata'
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { NestFactory } from '@nestjs/core'
import type { NestExpressApplication } from '@nestjs/platform-express'
import { Client } from 'pg'
import { readConfig } from '../src/config/env.js'
import { PrismaService } from '../src/database/prisma.service.js'
import { EulerGiftClient } from '../src/gifts/euler.client.js'
import { GiftsService } from '../src/gifts/gifts.service.js'
import { AppModule } from '../src/app.module.js'
import { configureApp } from '../src/http/configure.js'
const config = readConfig(process.env),
  owner = new Client({ connectionString: process.env.TEST_ADMIN_DATABASE_URL })
const host =
  'eulerstream-tiktok.f00699f0017e82344b8bed18c38dab38.r2.cloudflarestorage.com'
let failUS = false,
  coins = 1
let retainedFixture = false,
  omitTHStar = false
let app: NestExpressApplication, base: string
const client = new EulerGiftClient(async (input) => {
  const u = new URL(String(input))
  const region =
    u.searchParams.get('region') ?? (u.pathname.includes('-TH-') ? 'TH' : 'US')
  if (u.hostname === 'api.eulerstream.com')
    return Response.json({
      code: 200,
      url: `https://${host}/gifts/region/en-${region}-gifts.json`,
    })
  if (failUS && region === 'US')
    return new Response('upstream private details', { status: 500 })
  return Response.json({
    data: {
      gifts: [
        {
          id: 5655,
          name: 'Rose',
          diamond_count: coins,
          combo: true,
          type: 1,
          image: { url_list: ['https://p16-webcast.tiktokcdn.com/rose.png'] },
        },
        {
          id: 5879,
          name: 'Doughnut',
          diamond_count: 30,
          combo: true,
          type: 1,
          image: {
            url_list: ['https://p16-webcast.tiktokcdn.com/doughnut.png'],
          },
        },
        ...(retainedFixture && (region === 'US' || !omitTHStar)
          ? [
              {
                id: 9001,
                name: region === 'TH' ? 'Thai Star' : 'Star',
                diamond_count: 5,
                combo: true,
                type: 1,
                image: {
                  url_list: ['https://p16-webcast.tiktokcdn.com/star.png'],
                },
              },
            ]
          : []),
      ],
    },
  })
})
before(async () => {
  await owner.connect()
  app = configureApp(
    await NestFactory.create<NestExpressApplication>(
      AppModule.register(config, client),
      { logger: false },
    ),
  )
  app.get(GiftsService)
  await app.listen(0, '127.0.0.1')
  base = await app.getUrl()
})
after(async () => {
  await app?.close()
  await owner.end()
})
const request = (path: string, options: RequestInit = {}) =>
  fetch(base + '/v1' + path, {
    ...options,
    headers: { 'content-type': 'application/json', ...options.headers },
  })
const admin = (path: string, options: RequestInit = {}) =>
  request(path, {
    ...options,
    headers: {
      authorization: 'Bearer ' + config.adminApiKey,
      ...options.headers,
    },
  })
test('Gift API exposes health/readiness and a clear empty catalog before first sync', async () => {
  assert.deepEqual(await (await request('/health')).json(), { status: 'ok' })
  assert.equal((await request('/health/ready')).status, 200)
  const response = await request('/gifts')
  assert.equal(response.status, 200)
  const body = await response.json()
  assert.equal(body.total, 0)
  assert.equal(body.lastSyncedAt, null)
})
test('Gift admin rejects missing/forged credentials with no mutation', async () => {
  for (const headers of [
    {} as Record<string, string>,
    { authorization: 'Bearer forged' },
  ]) {
    const response = await request('/admin/gifts/sync', {
      method: 'POST',
      headers,
    })
    assert.equal(response.status, 401)
    const body = await response.json()
    assert.equal(body.error.code, 'ADMIN_UNAUTHORIZED')
    assert(!JSON.stringify(body).includes(config.adminApiKey))
  }
  assert.equal(
    Number(
      (await owner.query('SELECT count(*) FROM judytik.gifts')).rows[0].count,
    ),
    0,
  )
})
test('Gift sync saves TH/US as regions of the same identities and supports search/filter/pagination', async () => {
  const response = await admin('/admin/gifts/sync', { method: 'POST' })
  assert.equal(response.status, 201)
  const synced = await response.json()
  assert.equal(synced.importedGiftCount, 2)
  assert.equal(synced.regionalCount, 4)
  const first = await (await request('/gifts?pageSize=1')).json()
  assert.equal(first.total, 2)
  assert.equal(first.items[0].id, '5655')
  assert.equal(first.items[0].coins, 1)
  assert.deepEqual(first.items[0].regions, ['TH', 'US'])
  const second = await (
    await request('/gifts?pageSize=1&page=2&revision=' + first.catalogRevision)
  ).json()
  assert.equal(second.items[0].id, '5879')
  assert.equal((await (await request('/gifts?q=Rose')).json()).total, 1)
  assert.equal((await (await request('/gifts?minCoins=10')).json()).total, 1)
  assert.equal((await (await request('/gifts?region=US')).json()).total, 2)
})
test('Gift admin overrides survive sync; stale edits and stale pagination are rejected', async () => {
  const snapshot = await (await request('/gifts')).json()
  const gift = await (await request('/gifts/5655')).json()
  const saved = await admin('/admin/gifts/5655', {
    method: 'PATCH',
    headers: { 'if-match': `"${gift.revision}"` },
    body: JSON.stringify({
      displayName: 'กุหลาบ',
      aliases: ['โรส'],
      imageUrl: 'https://cdn.example.invalid/custom-rose.png',
    }),
  })
  assert.equal(saved.status, 200)
  assert(saved.headers.get('etag'))
  const stale = await admin('/admin/gifts/5655', {
    method: 'PATCH',
    headers: { 'if-match': `"${gift.revision}"` },
    body: JSON.stringify({ enabled: false }),
  })
  assert.equal(stale.status, 412)
  const pagination = await request(
    '/gifts?page=2&revision=' + snapshot.catalogRevision,
  )
  assert.equal(pagination.status, 409)
  coins = 2
  assert.equal(
    (await admin('/admin/gifts/sync', { method: 'POST' })).status,
    201,
  )
  const updated = await (await request('/gifts/5655')).json()
  assert.equal(updated.name, 'กุหลาบ')
  assert.equal(updated.coins, 2)
  assert.equal(updated.imageUrl, 'https://cdn.example.invalid/custom-rose.png')
  assert.equal(
    (await (await request('/gifts?q=' + encodeURIComponent('โร'))).json())
      .total,
    1,
  )
})
test('Gift sync failure leaves the last complete catalog/revision intact', async () => {
  const before = await (await request('/gifts')).json()
  failUS = true
  const failed = await admin('/admin/gifts/sync', { method: 'POST' })
  assert.equal(failed.status, 503)
  failUS = false
  const after = await (await request('/gifts')).json()
  assert.equal(after.catalogRevision, before.catalogRevision)
  assert.deepEqual(after.items, before.items)
})
test('Gift admin hides a gift from public reads while retaining it for admin editing', async () => {
  const gift = await (await request('/gifts/5655')).json()
  const hidden = await admin('/admin/gifts/5655', {
    method: 'PATCH',
    headers: { 'if-match': `"${gift.revision}"` },
    body: JSON.stringify({ enabled: false }),
  })
  assert.equal(hidden.status, 200)
  assert.equal((await request('/gifts/5655')).status, 404)
  assert.equal((await (await request('/gifts')).json()).total, 1)
  assert.equal((await (await admin('/admin/gifts')).json()).total, 2)
})
test('Gift API rejects malformed filters, unknown writable fields and missing preconditions', async () => {
  for (const query of [
    '?page=2',
    '?region=EN',
    '?minCoins=100&maxCoins=1',
    '?pageSize=1000',
    '?showDisabled=true',
  ])
    assert.equal((await request('/gifts' + query)).status, 400)
  const missing = await admin('/admin/gifts/5879', {
    method: 'PATCH',
    body: JSON.stringify({ enabled: false }),
  })
  assert.equal(missing.status, 428)
  const forged = await admin('/admin/gifts/5879', {
    method: 'PATCH',
    headers: { 'if-match': '"1"' },
    body: JSON.stringify({ coins: 0, isPro: true }),
  })
  assert.equal(forged.status, 400)
  const url = await admin('/admin/gifts/5879', {
    method: 'PATCH',
    headers: { 'if-match': '"1"' },
    body: JSON.stringify({ imageUrl: 'file:///private' }),
  })
  assert.equal(url.status, 400)
})
test('Gift admin audit stores identifiers and revisions without credentials or raw payload', async () => {
  const audit = await owner.query(
    "SELECT event_name,resource_key,resource_revision,request_id FROM judytik.audit_events WHERE event_name LIKE 'gift.%'",
  )
  assert(audit.rows.length >= 3)
  assert(audit.rows.some((x) => x.resource_key === '5655'))
  assert(!JSON.stringify(audit.rows).includes(config.adminApiKey))
  for (const row of audit.rows) assert.match(row.request_id, /^[0-9a-f-]{36}$/)
})

test('Gift admin concurrent edits of one revision produce one success and one conflict', async () => {
  const gift = await (await request('/gifts/5879')).json()
  const etag = `"${gift.revision}"`
  const responses = await Promise.all(
    ['First', 'Second'].map((displayName) =>
      admin('/admin/gifts/5879', {
        method: 'PATCH',
        headers: { 'if-match': etag },
        body: JSON.stringify({ displayName }),
      }),
    ),
  )
  assert.deepEqual(responses.map((x) => x.status).sort(), [200, 412])
})
test('Gift search treats SQL wildcard characters as literal text', async () => {
  for (const q of ['%', '_', '\\']) {
    const response = await request('/gifts?q=' + encodeURIComponent(q))
    assert.equal(response.status, 200)
    assert.equal((await response.json()).total, 0)
  }
})
test('Gift API returns validation/size errors for malformed and oversized JSON', async () => {
  const malformed = await admin('/admin/gifts/5879', {
    method: 'PATCH',
    headers: { 'if-match': '"1"' },
    body: '{"bad"',
  })
  assert.equal(malformed.status, 400)
  const large = await admin('/admin/gifts/5879', {
    method: 'PATCH',
    headers: { 'if-match': '"1"' },
    body: JSON.stringify({ displayName: 'a'.repeat(270000) }),
  })
  assert.equal(large.status, 413)
})

test('Gift search retains names of regional records intentionally kept after an upstream omission', async () => {
  retainedFixture = true
  assert.equal(
    (await admin('/admin/gifts/sync', { method: 'POST' })).status,
    201,
  )
  assert.equal((await (await request('/gifts?q=Thai%20Star')).json()).total, 1)
  omitTHStar = true
  assert.equal(
    (await admin('/admin/gifts/sync', { method: 'POST' })).status,
    201,
  )
  const kept = await (await request('/gifts/9001?region=TH')).json()
  assert.equal(kept.name, 'Thai Star')
  const result = await (await request('/gifts?q=Thai%20Star')).json()
  assert.equal(result.total, 1)
  assert.equal(result.items[0].id, '9001')
})
