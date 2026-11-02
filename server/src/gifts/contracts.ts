import { z } from 'zod'
import { ApiError } from '../http/api-error.js'
export const regionSchema = z.enum(['TH', 'US'])
const revision = z
  .string()
  .regex(/^(0|[1-9][0-9]{0,18})$/)
  .refine((value) => BigInt(value) <= 9223372036854775807n)
export const querySchema = z
  .object({
    region: regionSchema.default('TH'),
    q: z.string().trim().max(80).default(''),
    page: z.coerce.number().int().min(1).max(10000).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(50),
    minCoins: z.coerce.number().int().min(0).max(2147483647).optional(),
    maxCoins: z.coerce.number().int().min(0).max(2147483647).optional(),
    sort: z.enum(['coins-asc', 'coins-desc']).default('coins-asc'),
    revision: revision.optional(),
  })
  .strict()
  .refine((q) => q.page === 1 || q.revision !== undefined)
  .refine(
    (q) =>
      q.minCoins === undefined ||
      q.maxCoins === undefined ||
      q.minCoins <= q.maxCoins,
  )
export const detailQuery = z
  .object({ region: regionSchema.default('TH') })
  .strict()
const image = z
  .string()
  .max(2048)
  .url()
  .refine((value) => {
    const u = new URL(value)
    return u.protocol === 'https:' && !u.username && !u.password
  })
export const patchSchema = z
  .object({
    displayName: z.string().trim().min(1).max(255).nullable().optional(),
    imageUrl: image.nullable().optional(),
    aliases: z.array(z.string().trim().min(1).max(80)).max(20).optional(),
    enabled: z.boolean().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0)
  .meta({ minProperties: 1 })
export type GiftQuery = z.infer<typeof querySchema>
export function parseQuery(input: unknown) {
  const parsed = querySchema.safeParse(input)
  if (!parsed.success) throw new ApiError(400, 'INVALID_QUERY')
  return parsed.data
}
export function parseDetailQuery(input: unknown) {
  const parsed = detailQuery.safeParse(input)
  if (!parsed.success) throw new ApiError(400, 'INVALID_QUERY')
  return parsed.data
}
export function parsePatch(input: unknown) {
  const parsed = patchSchema.safeParse(input)
  if (!parsed.success) throw new ApiError(400, 'INVALID_GIFT_PATCH')
  if (parsed.data.aliases)
    parsed.data.aliases = [...new Set(parsed.data.aliases)]
  return parsed.data
}
export function parseGiftId(value: string) {
  if (!/^[1-9][0-9]{0,19}$/.test(value))
    throw new ApiError(400, 'INVALID_GIFT_ID')
  return value
}
export function parseIfMatch(value: unknown) {
  if (value === undefined) throw new ApiError(428, 'PRECONDITION_REQUIRED')
  if (typeof value !== 'string' || !/^"[1-9][0-9]{0,18}"$/.test(value))
    throw new ApiError(400, 'INVALID_PRECONDITION')
  const parsed = revision.safeParse(value.slice(1, -1))
  if (!parsed.success) throw new ApiError(400, 'INVALID_PRECONDITION')
  return BigInt(parsed.data)
}

export const giftItemSchema = z
  .object({
    id: z.string().regex(/^[1-9][0-9]{0,19}$/),
    region: regionSchema,
    regions: z.array(regionSchema),
    name: z.string(),
    providerName: z.string(),
    coins: z.number().int().nonnegative(),
    imageUrl: z.string().url(),
    combo: z.boolean(),
    aliases: z.array(z.string()),
    enabled: z.boolean(),
    revision: z.string().regex(/^[1-9][0-9]*$/),
    sourceObservedAt: z.iso.datetime(),
  })
  .strict()
export const giftPageSchema = z
  .object({
    items: z.array(giftItemSchema),
    total: z.number().int().nonnegative(),
    page: z.number().int().positive(),
    pageSize: z.number().int().positive(),
    totalPages: z.number().int().nonnegative(),
    catalogRevision: z.string().regex(/^(0|[1-9][0-9]*)$/),
    lastSyncedAt: z.iso.datetime().nullable(),
  })
  .strict()
export const syncResultSchema = z
  .object({
    importedGiftCount: z.number().int().nonnegative(),
    regionalCount: z.number().int().nonnegative(),
    catalogRevision: z.string(),
    lastSyncedAt: z.iso.datetime().nullable(),
    regions: z.array(regionSchema),
    skipped: z.boolean().optional(),
  })
  .strict()
