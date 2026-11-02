import { Inject, Injectable } from '@nestjs/common'
import { PrismaService } from '../database/prisma.service.js'
import { Prisma } from '../generated/prisma/client.js'
import {
  EulerGiftClient,
  GIFT_REGIONS,
  type ProviderGift,
} from './euler.client.js'
import {
  parseQuery,
  parseDetailQuery,
  parsePatch,
  parseGiftId,
  parseIfMatch,
} from './contracts.js'
import { ApiError } from '../http/api-error.js'
const includeGift = {
  gift: { include: { regions: { select: { region: true } } } },
} as const
const escapeLike = (value: string) => value.replace(/[\\%_]/g, '\\$&')
type GiftRow = Prisma.GiftRegionGetPayload<{ include: typeof includeGift }>
function item(row: GiftRow) {
  const g = row.gift
  return {
    id: g.id,
    region: row.region,
    regions: g.regions.map((x) => x.region).sort(),
    name: g.nameOverride ?? row.providerName,
    providerName: row.providerName,
    coins: row.coins,
    imageUrl: g.imageOverride ?? row.imageUrl,
    combo: row.combo,
    aliases: g.aliases,
    enabled: g.enabled,
    revision: g.revision.toString(),
    sourceObservedAt: row.sourceObservedAt.toISOString(),
  }
}
export interface SyncResult {
  importedGiftCount: number
  regionalCount: number
  catalogRevision: string
  lastSyncedAt: string | null
  regions: readonly string[]
  skipped?: boolean
}
@Injectable()
export class GiftsService {
  private pendingSync?: Promise<SyncResult>
  constructor(
    @Inject(PrismaService) private readonly db: PrismaService,
    @Inject(EulerGiftClient) private readonly euler: EulerGiftClient,
  ) {}
  async list(input: unknown, includeDisabled = false) {
    const query = parseQuery(input)
    return this.db.client.$transaction(
      async (tx) => {
        const state = await tx.giftCatalogState.findUniqueOrThrow({
          where: { id: 1 },
        })
        if (
          query.revision !== undefined &&
          query.revision !== state.revision.toString()
        )
          throw new ApiError(409, 'GIFT_CATALOG_CHANGED')
        const where: Prisma.GiftRegionWhereInput = {
          region: query.region,
          coins: { gte: query.minCoins, lte: query.maxCoins },
          gift: {
            ...(!includeDisabled ? { enabled: true } : {}),
            ...(query.q
              ? {
                  searchText: {
                    contains: escapeLike(query.q),
                    mode: 'insensitive' as const,
                  },
                }
              : {}),
          },
        }
        const orderBy: Prisma.GiftRegionOrderByWithRelationInput[] = [
          { coins: query.sort === 'coins-desc' ? 'desc' : 'asc' },
          { giftId: 'asc' },
        ]
        const total = await tx.giftRegion.count({ where })
        const rows = await tx.giftRegion.findMany({
          where,
          include: includeGift,
          orderBy,
          skip: (query.page - 1) * query.pageSize,
          take: query.pageSize,
        })
        return {
          items: rows.map(item),
          total,
          page: query.page,
          pageSize: query.pageSize,
          totalPages: Math.ceil(total / query.pageSize),
          catalogRevision: state.revision.toString(),
          lastSyncedAt: state.lastSyncedAt?.toISOString() ?? null,
        }
      },
      { isolationLevel: 'RepeatableRead' },
    )
  }
  async get(value: string, input: unknown) {
    const id = parseGiftId(value),
      { region } = parseDetailQuery(input)
    const row = await this.db.client.giftRegion.findFirst({
      where: { giftId: id, region, gift: { enabled: true } },
      include: includeGift,
    })
    if (!row) throw new ApiError(404, 'GIFT_NOT_FOUND')
    return item(row)
  }
  async patch(value: string, body: unknown, etag: unknown, requestId: string) {
    const id = parseGiftId(value),
      patch = parsePatch(body),
      revision = parseIfMatch(etag)
    return this.db.client.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM judytik.gift_catalog_state WHERE id=1 FOR UPDATE`
      const current = await tx.gift.findUnique({
        where: { id },
        include: { regions: true },
      })
      if (!current) throw new ApiError(404, 'GIFT_NOT_FOUND')
      if (current.revision !== revision)
        throw new ApiError(412, 'GIFT_VERSION_CONFLICT')
      const aliases = patch.aliases ?? current.aliases,
        name =
          patch.displayName === undefined
            ? current.nameOverride
            : patch.displayName
      await tx.gift.update({
        where: { id },
        data: {
          nameOverride: patch.displayName,
          imageOverride: patch.imageUrl,
          aliases: patch.aliases,
          enabled: patch.enabled,
          searchText: [
            id,
            ...current.regions.map((r) => r.providerName),
            name ?? '',
            ...aliases,
          ].join(' '),
          revision: { increment: 1 },
        },
      })
      await tx.giftCatalogState.update({
        where: { id: 1 },
        data: { revision: { increment: 1 } },
      })
      const row = await tx.giftRegion.findFirst({
        where: { giftId: id },
        orderBy: { region: 'asc' },
        include: includeGift,
      })
      if (!row) throw new ApiError(404, 'GIFT_NOT_FOUND')
      await tx.auditEvent.create({
        data: {
          eventName: 'gift.override.saved',
          resourceKey: id,
          resourceRevision: row.gift.revision,
          requestId,
        },
      })
      return item(row)
    })
  }
  async sync(requestId: string) {
    if (this.pendingSync) return this.pendingSync
    const task = this.performSync(requestId)
    this.pendingSync = task
    try {
      return await task
    } finally {
      if (this.pendingSync === task) this.pendingSync = undefined
    }
  }
  private async performSync(requestId: string): Promise<SyncResult> {
    const rows = await this.euler.fetchCatalog()
    const grouped = new Map<string, string[]>()
    for (const row of rows)
      grouped.set(row.id, [...(grouped.get(row.id) ?? []), row.name])
    const regional = JSON.stringify(
      rows.map((g) => ({
        gift_id: g.id,
        region: g.region,
        provider_name: g.name,
        coins: g.coins,
        image_url: g.imageUrl,
        description: g.description,
        gift_type: g.giftType,
        combo: g.combo,
        source_observed_at: g.sourceObservedAt.toISOString(),
      })),
    )
    return this.db.client.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM judytik.gift_catalog_state WHERE id=1 FOR UPDATE`
        const state = await tx.giftCatalogState.findUniqueOrThrow({
          where: { id: 1 },
        })
        if (state.lastSyncedAt && state.lastSyncedAt > rows[0].sourceObservedAt)
          return {
            importedGiftCount: 0,
            regionalCount: 0,
            catalogRevision: state.revision.toString(),
            lastSyncedAt: state.lastSyncedAt.toISOString(),
            regions: GIFT_REGIONS,
            skipped: true,
          }
        const incomingRegions = new Set(
          rows.map((row) => `${row.id}:${row.region}`),
        )
        const retained = await tx.giftRegion.findMany({
          where: { giftId: { in: [...grouped.keys()] } },
          select: { giftId: true, region: true, providerName: true },
        })
        for (const row of retained) {
          if (!incomingRegions.has(`${row.giftId}:${row.region}`))
            grouped.get(row.giftId)!.push(row.providerName)
        }
        const globals = JSON.stringify(
          [...grouped].map(([id, names]) => ({
            id,
            names: [id, ...names].join(' '),
          })),
        )
        await tx.$executeRaw`INSERT INTO judytik.gifts AS g(id,search_text) SELECT p.id,p.names FROM jsonb_to_recordset(${globals}::jsonb) AS p(id text,names text) ON CONFLICT(id) DO UPDATE SET search_text=concat_ws(' ',EXCLUDED.search_text,g.name_override,array_to_string(g.aliases,' ')),revision=g.revision+1`
        await tx.$executeRaw`INSERT INTO judytik.gift_regions AS g(gift_id,region,provider_name,coins,image_url,description,gift_type,combo,source_observed_at) SELECT p.gift_id,p.region,p.provider_name,p.coins,p.image_url,p.description,p.gift_type,p.combo,p.source_observed_at FROM jsonb_to_recordset(${regional}::jsonb) AS p(gift_id text,region text,provider_name text,coins integer,image_url text,description text,gift_type integer,combo boolean,source_observed_at timestamptz) ON CONFLICT(gift_id,region) DO UPDATE SET provider_name=EXCLUDED.provider_name,coins=EXCLUDED.coins,image_url=EXCLUDED.image_url,description=EXCLUDED.description,gift_type=EXCLUDED.gift_type,combo=EXCLUDED.combo,source_observed_at=EXCLUDED.source_observed_at WHERE g.source_observed_at<=EXCLUDED.source_observed_at`
        const saved = await tx.giftCatalogState.update({
          where: { id: 1 },
          data: {
            revision: { increment: 1 },
            lastSyncedAt: rows[0].sourceObservedAt,
          },
        })
        await tx.auditEvent.create({
          data: {
            eventName: 'gift.catalog.synced',
            resourceKey: 'TH,US',
            resourceRevision: saved.revision,
            requestId,
          },
        })
        return {
          importedGiftCount: grouped.size,
          regionalCount: rows.length,
          catalogRevision: saved.revision.toString(),
          lastSyncedAt: saved.lastSyncedAt?.toISOString() ?? null,
          regions: GIFT_REGIONS,
        }
      },
      { timeout: 30000 },
    )
  }
}
