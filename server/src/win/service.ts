import {CLOCK,type Clock,systemClock} from '../auth/clock.js'
import {userHasPro,requirePro} from '../entitlements/plan-access.js'
import {Inject,Injectable} from '@nestjs/common'
import {PrismaService} from '../database/prisma.service.js'
import type {VerifiedSession} from '../auth/auth.service.js'
import {ApiError} from '../http/api-error.js'
import {precondition} from '../presets/contracts.js'
import {defaultWinData,validWinData} from '../../../shared/win.js'
import {audit} from '../audit/write.js'
@Injectable()
export class WinService {
 constructor(@Inject(PrismaService) private readonly db:PrismaService,@Inject(CLOCK) private readonly clock:Clock=systemClock){}
 async get(actor:VerifiedSession){return this.db.withUserContext(actor.userId,async tx=>{const row=await tx.winWorkspace.findUnique({where:{userId:actor.userId}});if(row&&!validWinData(row.data))throw new ApiError(500,'WIN_DATA_INVALID');return{revision:row?.revision.toString()??'0',data:row?.data??defaultWinData()}})}
 async save(actor:VerifiedSession,input:unknown,match:unknown,requestId:string,features:unknown=undefined){
  if(!validWinData(input))throw new ApiError(400,'INVALID_REQUEST')
  const condition=precondition(match,undefined,false);if(condition.kind!=='match')throw new ApiError(400,'INVALID_PRECONDITION')
  return this.db.withUserContext(actor.userId,async tx=>{
   await tx.$queryRaw`SELECT id FROM judytik.users WHERE id=${actor.userId}::uuid FOR UPDATE`
   const current=await tx.winWorkspace.findUnique({where:{userId:actor.userId}})
   if((current?.revision??0n)!==condition.revision)throw new ApiError(412,'WIN_VERSION_CONFLICT')
   requirePro(await userHasPro(tx,actor.userId,this.clock))
   const data=JSON.parse(JSON.stringify(input))
   if(!Object.hasOwn(input,'slotWeights')&&current&&validWinData(current.data)&&JSON.stringify(input.slots)===JSON.stringify(current.data.slots)&&current.data.slotWeights)data.slotWeights=current.data.slotWeights
   if(!String(features??'').split(',').includes('custom-fonts')&&current&&validWinData(current.data)&&current.data.overlay.font.startsWith('custom:')&&input.overlay.font==='Judy')data.overlay.font=current.data.overlay.font
   const row=current?await tx.winWorkspace.update({where:{userId:actor.userId},data:{data,revision:{increment:1}}}):await tx.winWorkspace.create({data:{userId:actor.userId,data}})
   await audit(tx,{eventName:'win.updated',actorUserId:actor.userId,sessionId:actor.sessionId,resourceRevision:row.revision,requestId})
   return{revision:row.revision.toString(),data:row.data}
  })
 }
}
