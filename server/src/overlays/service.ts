import {CLOCK,type Clock,systemClock} from '../auth/clock.js'
import {userHasPro,assertOverlayPlan} from '../entitlements/plan-access.js'
import {PRO_WIDGETS} from '../../../shared/plan-access.js'
import { Inject, Injectable } from '@nestjs/common'
import { PrismaService } from '../database/prisma.service.js'
import type { VerifiedSession } from '../auth/auth.service.js'
import { ApiError } from '../http/api-error.js'
import { precondition } from '../presets/contracts.js'
import { defaultOverlayData, validOverlayData, hydrateOverlayData } from '../../../shared/overlays.js'
import { audit } from '../audit/write.js'

@Injectable()
export class OverlaysService {
  constructor(@Inject(PrismaService) private readonly db: PrismaService, @Inject(CLOCK) private readonly clock: Clock = systemClock) {}

  async get(actor: VerifiedSession) {
    return this.db.withUserContext(actor.userId, async tx => {
      const row = await tx.overlaysWorkspace.findUnique({ where: { userId: actor.userId } })
      if (row && !validOverlayData(row.data)) throw new ApiError(500, 'OVERLAY_DATA_INVALID')
      return { revision: row?.revision.toString() ?? '0', data: row ? hydrateOverlayData(row.data) : defaultOverlayData() }
    })
  }

  async save(actor: VerifiedSession, input: unknown, match: unknown, requestId: string, features: unknown = undefined) {
    if (!validOverlayData(input)) throw new ApiError(400, 'INVALID_REQUEST')
    const capabilities=String(features??'').split(',')
    const optionFeatures={spinGiftIds:'spin-multi-gifts',rankLimit:'ranking-limit',spinSound:'spin-sound',spinVolume:'spin-sound'} as const
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
      if(!Object.hasOwn(input.widgets['big-gift'],'bigGiftLimit')&&current&&validOverlayData(current.data)&&current.data.widgets['big-gift'].bigGiftLimit!==undefined)data.widgets['big-gift'].bigGiftLimit=current.data.widgets['big-gift'].bigGiftLimit
      if(!Object.hasOwn(input.widgets['top-likers'],'likerLimit')&&current&&validOverlayData(current.data)&&current.data.widgets['top-likers'].likerLimit!==undefined)data.widgets['top-likers'].likerLimit=current.data.widgets['top-likers'].likerLimit
      if(current&&validOverlayData(current.data)){
        for(const kind of Object.keys(input.widgets) as Array<keyof typeof input.widgets>){
          const saved=current.data.widgets[kind]
          for(const key of ['spinGiftIds','rankLimit','spinSound','spinVolume'] as const)
            if(!capabilities.includes(optionFeatures[key])&&!Object.hasOwn(input.widgets[kind],key)&&saved&&Object.hasOwn(saved,key))data.widgets[kind][key]=saved[key]
        }
      }
      const pro = await userHasPro(tx,actor.userId,this.clock)
      if (!pro) {
        const saved = current && validOverlayData(current.data) ? hydrateOverlayData(current.data) : defaultOverlayData()
        for (const kind of PRO_WIDGETS as Array<keyof typeof saved.widgets>) {
          const incoming = input.widgets[kind]
          for (const key of Object.keys(saved.widgets[kind]) as Array<keyof typeof incoming>)
            if (!incoming || !Object.hasOwn(incoming,key)) data.widgets[kind][key] = saved.widgets[kind][key]
        }
      }
      // Released desktops receive decorated jar themes projected to plain-white.
      // A FREE user's unrelated edit must retain the original stored PRO theme.
      if (!pro && !capabilities.includes('slider') && !Object.hasOwn(input.widgets,'slider') &&
          current && validOverlayData(current.data) && input.widgets['gift-jar'].theme === 'plain-white')
        data.widgets['gift-jar'].theme = current.data.widgets['gift-jar'].theme
      assertOverlayPlan(pro,data,current?.data)
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
