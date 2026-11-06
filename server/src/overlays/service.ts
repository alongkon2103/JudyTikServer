import { Inject, Injectable } from '@nestjs/common'
import { PrismaService } from '../database/prisma.service.js'
import type { VerifiedSession } from '../auth/auth.service.js'
import { ApiError } from '../http/api-error.js'
import { precondition } from '../presets/contracts.js'
import { defaultOverlayData, validOverlayData, hydrateOverlayData } from '../../../shared/overlays.js'
import { audit } from '../audit/write.js'

@Injectable()
export class OverlaysService {
  constructor(@Inject(PrismaService) private readonly db: PrismaService) {}

  async get(actor: VerifiedSession) {
    return this.db.withUserContext(actor.userId, async tx => {
      const row = await tx.overlaysWorkspace.findUnique({ where: { userId: actor.userId } })
      if (row && !validOverlayData(row.data)) throw new ApiError(500, 'OVERLAY_DATA_INVALID')
      return { revision: row?.revision.toString() ?? '0', data: row ? hydrateOverlayData(row.data) : defaultOverlayData() }
    })
  }

  async save(actor: VerifiedSession, input: unknown, match: unknown, requestId: string) {
    if (!validOverlayData(input)) throw new ApiError(400, 'INVALID_REQUEST')
    const condition = precondition(match, undefined, false)
    if (condition.kind !== 'match') throw new ApiError(400, 'INVALID_PRECONDITION')
    return this.db.withUserContext(actor.userId, async tx => {
      await tx.$queryRaw`SELECT id FROM judytik.users WHERE id=${actor.userId}::uuid FOR UPDATE`
      const current = await tx.overlaysWorkspace.findUnique({ where: { userId: actor.userId } })
      if ((current?.revision ?? 0n) !== condition.revision)
        throw new ApiError(412, 'OVERLAY_VERSION_CONFLICT')
      const data = JSON.parse(JSON.stringify(hydrateOverlayData(input)))
      if(current&&validOverlayData(current.data)&&data.widgets.spin.spinOptions){
        const saved=new Map(current.data.widgets.spin.spinOptions?.map(option=>[option.id,option.weight]))
        for(const option of data.widgets.spin.spinOptions)if(!Object.hasOwn(option,'weight')&&saved.has(option.id)&&saved.get(option.id)!==undefined)option.weight=saved.get(option.id)
      }
      if(current&&validOverlayData(current.data)&&data.widgets.slider.sliderItems){
        const saved=new Map(current.data.widgets.slider?.sliderItems?.map(item=>[item.id,item.textColor]))
        for(const item of data.widgets.slider.sliderItems)if(!Object.hasOwn(item,'textColor')&&saved.get(item.id)!==undefined)item.textColor=saved.get(item.id)
      }
      for (const kind of ['video','slider'] as const)
        if (!Object.hasOwn(input.widgets, kind) && current && validOverlayData(current.data))
          data.widgets[kind] = hydrateOverlayData(current.data).widgets[kind]
      const row = current
        ? await tx.overlaysWorkspace.update({ where: { userId: actor.userId }, data: { data, revision: { increment: 1 } } })
        : await tx.overlaysWorkspace.create({ data: { userId: actor.userId, data } })
      await audit(tx, {
        eventName: 'overlays.updated', actorUserId: actor.userId, sessionId: actor.sessionId,
        resourceRevision: row.revision, requestId,
      })
      return { revision: row.revision.toString(), data: hydrateOverlayData(row.data) }
    })
  }
}
