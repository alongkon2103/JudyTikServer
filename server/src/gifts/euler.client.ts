import { z } from 'zod'
import { ApiError } from '../http/api-error.js'
export const GIFT_REGIONS = ['TH', 'US'] as const
export type GiftRegionCode = (typeof GIFT_REGIONS)[number]
const DOWNLOAD_HOST =
  'eulerstream-tiktok.f00699f0017e82344b8bed18c38dab38.r2.cloudflarestorage.com'
const giftSchema = z.object({
  id: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  name: z.string().trim().min(1).max(255),
  type: z.number().int().min(0),
  diamond_count: z.number().int().min(0).max(2147483647),
  combo: z.boolean(),
  describe: z.string().max(4000).optional(),
  image: z.object({ url_list: z.array(z.string().max(2048)) }).optional(),
  icon: z.object({ url_list: z.array(z.string().max(2048)) }).optional(),
})
const envelopeSchema = z.object({
  code: z.literal(200),
  url: z.string().max(8192).url(),
})
const snapshotSchema = z.object({
  data: z.object({ gifts: z.array(giftSchema).min(1).max(20000) }),
})
export interface ProviderGift {
  id: string
  region: GiftRegionCode
  name: string
  coins: number
  imageUrl: string
  giftType: number
  combo: boolean
  description: string
  sourceObservedAt: Date
}
const validImage = (value: string) => {
  try {
    const u = new URL(value)
    return u.protocol === 'https:' && !u.username && !u.password
  } catch {
    return false
  }
}
export class EulerGiftClient {
  constructor(private readonly fetcher: typeof fetch = fetch) {}
  async fetchCatalog(): Promise<ProviderGift[]> {
    const result: ProviderGift[] = []
    const sourceObservedAt = new Date()
    const overall = AbortSignal.timeout(60000)
    for (const region of GIFT_REGIONS) {
      const resolver = new URL('https://api.eulerstream.com/webcast/gifts')
      resolver.search = new URLSearchParams({
        region,
        webcast_language: 'en',
        redirect: 'false',
      }).toString()
      const resolved = envelopeSchema.safeParse(
        await this.getJson(resolver, overall),
      )
      if (!resolved.success) throw new ApiError(503, 'EULER_UPSTREAM_INVALID')
      const url = new URL(resolved.data.url)
      if (
        url.protocol !== 'https:' ||
        url.hostname !== DOWNLOAD_HOST ||
        url.port ||
        url.username ||
        url.password ||
        url.pathname !== `/gifts/region/en-${region}-gifts.json`
      )
        throw new ApiError(503, 'EULER_UPSTREAM_INVALID')
      const snapshot = snapshotSchema.safeParse(
        await this.getJson(url, overall),
      )
      if (!snapshot.success) throw new ApiError(503, 'EULER_UPSTREAM_INVALID')
      const unique = new Map<string, ProviderGift>()
      for (const gift of snapshot.data.data.gifts) {
        const imageUrl = [
          ...(gift.image?.url_list ?? []),
          ...(gift.icon?.url_list ?? []),
        ].find(validImage)
        if (!imageUrl) throw new ApiError(503, 'EULER_UPSTREAM_INVALID')
        const row: ProviderGift = {
          id: String(gift.id),
          region,
          name: gift.name,
          coins: gift.diamond_count,
          imageUrl,
          giftType: gift.type,
          combo: gift.combo,
          description: gift.describe ?? '',
          sourceObservedAt,
        }
        const previous = unique.get(row.id)
        if (previous && JSON.stringify(previous) !== JSON.stringify(row))
          throw new ApiError(503, 'EULER_UPSTREAM_INVALID')
        unique.set(row.id, row)
      }
      result.push(...unique.values())
    }
    return result
  }
  private async getJson(url: URL, overall: AbortSignal): Promise<unknown> {
    let response: Response
    try {
      response = await this.fetcher(url, {
        headers: { accept: 'application/json' },
        redirect: 'error',
        signal: AbortSignal.any([overall, AbortSignal.timeout(15000)]),
      })
    } catch {
      throw new ApiError(503, 'EULER_UNAVAILABLE')
    }
    if (!response.ok) {
      await response.body?.cancel()
      throw new ApiError(503, 'EULER_UNAVAILABLE')
    }
    const reader = response.body?.getReader()
    if (!reader) throw new ApiError(503, 'EULER_UPSTREAM_INVALID')
    const chunks: Uint8Array[] = []
    let size = 0
    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        size += value.byteLength
        if (size > 16 * 1024 * 1024) {
          await reader.cancel()
          throw new ApiError(503, 'EULER_UPSTREAM_INVALID')
        }
        chunks.push(value)
      }
      return JSON.parse(Buffer.concat(chunks).toString('utf8'))
    } catch (error) {
      if (error instanceof ApiError) throw error
      throw new ApiError(503, 'EULER_UPSTREAM_INVALID')
    } finally {
      reader.releaseLock()
    }
  }
}
