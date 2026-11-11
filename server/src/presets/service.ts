import {CLOCK,type Clock,systemClock} from '../auth/clock.js'
import {userHasPro,assertPresetPlan} from '../entitlements/plan-access.js'
import { Inject, Injectable } from '@nestjs/common'
import { PrismaService } from '../database/prisma.service.js'
import type { VerifiedSession } from '../auth/auth.service.js'
import { assertContract } from '../auth/contracts.js'
import { ApiError } from '../http/api-error.js'
import { audit } from '../audit/write.js'
import type { ActionPreset, Prisma } from '../generated/prisma/client.js'
import type { components } from '../contracts/cloud-v1.js'
import { parseList, precondition, validatePreset } from './contracts.js'
type Preset = components['schemas']['Preset']
function dto(row: ActionPreset): Preset {
  return {
    id: row.id,
    schemaVersion: 1,
    name: row.name,
    actions: row.actions as Preset['actions'],
    revision: row.revision.toString(),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}
@Injectable()
export class PresetsService {
  constructor(@Inject(PrismaService) private readonly db: PrismaService, @Inject(CLOCK) private readonly clock: Clock = systemClock) {}
  async list(
    actor: VerifiedSession,
    input: unknown,
  ): Promise<components['schemas']['PresetPage']> {
    const query = parseList(input)
    return this.db.withUserContext(
      actor.userId,
      async (tx) => {
        const user = await tx.user.findUniqueOrThrow({
            where: { id: actor.userId },
            select: { presetsRevision: true },
          }),
          revision = user.presetsRevision.toString()
        if (
          query.collectionRevision !== undefined &&
          query.collectionRevision !== revision
        )
          throw new ApiError(409, 'PRESET_COLLECTION_CHANGED')
        const rows = await tx.actionPreset.findMany({
          where: {
            userId: actor.userId,
            deletedAt: null,
            ...(query.after ? { id: { gt: query.after } } : {}),
          },
          orderBy: { id: 'asc' },
          take: query.limit + 1,
        })
        const page = rows.slice(0, query.limit)
        return {
          items: page.map(dto),
          collectionRevision: revision,
          nextCursor:
            rows.length > query.limit
              ? { after: page.at(-1)!.id, collectionRevision: revision }
              : null,
        }
      },
      'RepeatableRead',
    )
  }
  async get(actor: VerifiedSession, value: string): Promise<Preset> {
    const id = assertContract('UUID', value)
    return this.db.withUserContext(actor.userId, async (tx) => {
      const row = await tx.actionPreset.findFirst({
        where: { id, userId: actor.userId, deletedAt: null },
      })
      if (!row) throw new ApiError(404, 'PRESET_NOT_FOUND')
      return dto(row)
    })
  }
  async save(
    actor: VerifiedSession,
    value: string,
    input: unknown,
    headers: { ifMatch?: unknown; ifNoneMatch?: unknown },
    requestId: string,
  ): Promise<{ value: Preset; created: boolean }> {
    const id = assertContract('UUID', value),
      condition = precondition(headers.ifMatch, headers.ifNoneMatch),
      body = validatePreset(input)
    try {
      return await this.db.withUserContext(actor.userId, async (tx) => {
        await tx.$queryRaw`SELECT id FROM judytik.users WHERE id=${actor.userId}::uuid FOR UPDATE`
        const current = await tx.actionPreset.findUnique({ where: { id } })
        if (condition.kind === 'create' && current)
          throw new ApiError(412, 'PRESET_VERSION_CONFLICT')
        if (condition.kind === 'match' && (!current || current.deletedAt))
          throw new ApiError(404, 'PRESET_NOT_FOUND')
        if (
          condition.kind === 'match' &&
          current!.revision !== condition.revision
        )
          throw new ApiError(412, 'PRESET_VERSION_CONFLICT')
        assertPresetPlan(await userHasPro(tx,actor.userId,this.clock),body.actions,current && !current.deletedAt ? current.actions as unknown as typeof body.actions : [])
        const giftIds = [
          ...new Set(
            body.actions
              .filter((rule) => rule.trigger === 'gift' && rule.giftId !== '*')
              .map((rule) => rule.giftId),
          ),
        ]
        if (
          giftIds.length &&
          (await tx.gift.count({ where: { id: { in: giftIds } } })) !==
            giftIds.length
        )
          throw new ApiError(400, 'GIFT_NOT_FOUND')
        const data = {
          name: body.name,
          schemaVersion: body.schemaVersion,
          actions: body.actions as Prisma.InputJsonValue,
        }
        const row =
          condition.kind === 'create'
            ? await tx.actionPreset.create({
                data: { id, userId: actor.userId, ...data },
              })
            : await tx.actionPreset.update({
                where: { id },
                data: { ...data, revision: { increment: 1 } },
              })
        await audit(tx, {
          eventName:
            condition.kind === 'create' ? 'preset.created' : 'preset.updated',
          actorUserId: actor.userId,
          sessionId: actor.sessionId,
          resourceId: id,
          resourceRevision: row.revision,
          requestId,
        })
        return { value: dto(row), created: condition.kind === 'create' }
      })
    } catch (error) {
      if (
        error &&
        typeof error === 'object' &&
        'code' in error &&
        error.code === 'P2002'
      )
        throw new ApiError(404, 'PRESET_NOT_FOUND')
      throw error
    }
  }
  async remove(
    actor: VerifiedSession,
    value: string,
    match: unknown,
    requestId: string,
  ) {
    const id = assertContract('UUID', value),
      condition = precondition(match, undefined, false)
    if (condition.kind !== 'match')
      throw new ApiError(400, 'INVALID_PRECONDITION')
    await this.db.withUserContext(actor.userId, async (tx) => {
      await tx.$queryRaw`SELECT id FROM judytik.users WHERE id=${actor.userId}::uuid FOR UPDATE`
      const row = await tx.actionPreset.findFirst({
        where: { id, userId: actor.userId, deletedAt: null },
      })
      if (!row) throw new ApiError(404, 'PRESET_NOT_FOUND')
      if (row.revision !== condition.revision)
        throw new ApiError(412, 'PRESET_VERSION_CONFLICT')
      const updated = await tx.actionPreset.update({
        where: { id },
        data: { deletedAt: new Date(), revision: { increment: 1 } },
      })
      await audit(tx, {
        eventName: 'preset.deleted',
        actorUserId: actor.userId,
        sessionId: actor.sessionId,
        resourceId: id,
        resourceRevision: updated.revision,
        requestId,
      })
    })
  }
}
