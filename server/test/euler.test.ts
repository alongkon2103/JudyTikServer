import { test } from 'node:test'
import assert from 'node:assert/strict'
import { EulerGiftClient } from '../src/gifts/euler.client.js'
const host =
  'eulerstream-tiktok.f00699f0017e82344b8bed18c38dab38.r2.cloudflarestorage.com'
const gift = (id: number, name = 'Rose') => ({
  id,
  name,
  type: 1,
  diamond_count: 1,
  combo: true,
  describe: 'sent ' + name,
  image: { url_list: ['https://p16-webcast.tiktokcdn.com/gift.png'] },
})
const download = (region: string) =>
  `https://${host}/gifts/region/en-${region}-gifts.json?X-Amz-Signature=public-test-signature`
function transport(transform?: (url: URL) => Response) {
  return async (
    input: Parameters<typeof fetch>[0],
    options?: Parameters<typeof fetch>[1],
  ) => {
    const url = new URL(String(input))
    assert.equal(new Headers(options?.headers).get('x-api-key'), null)
    return (
      transform?.(url) ??
      (url.hostname === 'api.eulerstream.com'
        ? Response.json({
            code: 200,
            url: download(url.searchParams.get('region')!),
          })
        : Response.json({
            data: {
              gifts: [gift(url.pathname.includes('-TH-') ? 5655 : 5879)],
            },
          }))
    )
  }
}
test('Euler uses public TH and US resolver URLs, follows each allowed signed download and preserves region', async () => {
  const calls: URL[] = []
  const fake = transport()
  const client = new EulerGiftClient(async (input, options) => {
    calls.push(new URL(String(input)))
    return fake(input, options)
  })
  const rows = await client.fetchCatalog()
  assert.deepEqual(
    rows.map((g) => [g.id, g.region, g.coins]),
    [
      ['5655', 'TH', 1],
      ['5879', 'US', 1],
    ],
  )
  assert.equal(calls.length, 4)
  assert.equal(calls[0].origin, 'https://api.eulerstream.com')
  assert.equal(calls[0].pathname, '/webcast/gifts')
  assert.equal(calls[0].searchParams.get('region'), 'TH')
  assert.equal(calls[2].searchParams.get('region'), 'US')
  assert.equal(calls[0].searchParams.get('webcast_language'), 'en')
})
test('Euler keeps the same gift ID across regions instead of creating two identities', async () => {
  const client = new EulerGiftClient(
    transport((url) =>
      url.hostname === 'api.eulerstream.com'
        ? Response.json({
            code: 200,
            url: download(url.searchParams.get('region')!),
          })
        : Response.json({ data: { gifts: [gift(5655)] } }),
    ),
  )
  const rows = await client.fetchCatalog()
  assert.deepEqual(
    rows.map((g) => [g.id, g.region]),
    [
      ['5655', 'TH'],
      ['5655', 'US'],
    ],
  )
})
for (const [label, alter] of [
  [
    'resolver rejection',
    (url: URL) =>
      url.hostname === 'api.eulerstream.com'
        ? new Response('upstream details', { status: 403 })
        : Response.json({}),
  ],
  [
    'download SSRF',
    (url: URL) =>
      Response.json({ code: 200, url: 'http://127.0.0.1:5432/private' }),
  ],
  [
    'unexpected CDN path',
    (url: URL) =>
      Response.json({ code: 200, url: `https://${host}/private/object` }),
  ],
  [
    'conflicting IDs within one region',
    (url: URL) =>
      url.hostname === 'api.eulerstream.com'
        ? Response.json({
            code: 200,
            url: download(url.searchParams.get('region')!),
          })
        : Response.json({
            data: { gifts: [gift(5655), { ...gift(5655), diamond_count: 2 }] },
          }),
  ],
  [
    'invalid coin value',
    (url: URL) =>
      url.hostname === 'api.eulerstream.com'
        ? Response.json({
            code: 200,
            url: download(url.searchParams.get('region')!),
          })
        : Response.json({
            data: { gifts: [{ ...gift(5655), diamond_count: 1.5 }] },
          }),
  ],
  [
    'unsafe image URL',
    (url: URL) =>
      url.hostname === 'api.eulerstream.com'
        ? Response.json({
            code: 200,
            url: download(url.searchParams.get('region')!),
          })
        : Response.json({
            data: {
              gifts: [
                { ...gift(5655), image: { url_list: ['file:///etc/passwd'] } },
              ],
            },
          }),
  ],
  [
    'empty snapshot',
    (url: URL) =>
      url.hostname === 'api.eulerstream.com'
        ? Response.json({
            code: 200,
            url: download(url.searchParams.get('region')!),
          })
        : Response.json({ data: { gifts: [] } }),
  ],
  [
    'partial second region',
    (url: URL) =>
      url.hostname === 'api.eulerstream.com'
        ? Response.json({
            code: 200,
            url: download(url.searchParams.get('region')!),
          })
        : url.pathname.includes('-US-')
          ? new Response('failure', { status: 503 })
          : Response.json({ data: { gifts: [gift(5655)] } }),
  ],
  [
    'oversized body',
    (_url: URL) => new Response('x'.repeat(16 * 1024 * 1024 + 1)),
  ],
] as const)
  test(`Euler rejects ${label} without returning a partial snapshot`, async () => {
    const client = new EulerGiftClient(transport(alter))
    await assert.rejects(
      () => client.fetchCatalog(),
      /EULER_UPSTREAM_INVALID|EULER_UNAVAILABLE/,
    )
  })

test('Euler collapses identical duplicate IDs present in real regional snapshots', async () => {
  const client = new EulerGiftClient(
    transport((url) =>
      url.hostname === 'api.eulerstream.com'
        ? Response.json({
            code: 200,
            url: download(url.searchParams.get('region')!),
          })
        : Response.json({ data: { gifts: [gift(5655), gift(5655)] } }),
    ),
  )
  assert.equal((await client.fetchCatalog()).length, 2)
})
