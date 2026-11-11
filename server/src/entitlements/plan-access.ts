import {isDeepStrictEqual} from 'node:util'
import type {Prisma} from '../generated/prisma/client.js'
import {type Clock,systemClock} from '../auth/clock.js'
import {ApiError} from '../http/api-error.js'
import {entitlementState} from './entitlements.service.js'
import {FREE_ACTION_LIMIT,PRO_WIDGETS,hasProAccess} from '../../../shared/plan-access.js'
import {defaultOverlayData,hydrateOverlayData,type OverlayData,type WidgetKind} from '../../../shared/overlays.js'

// Call inside the mutation transaction after locking the user row. Admin grant
// changes use that same lock, so revocation cannot race a protected write.
export async function userHasPro(tx:Prisma.TransactionClient,userId:string,clock:Clock=systemClock){
 const now=clock.now()
 const [grant]=await tx.entitlementGrant.findMany({where:{userId,plan:'PRO',revokedAt:null,startsAt:{lte:now}},orderBy:{endsAt:'desc'},take:1})
 return hasProAccess(entitlementState(grant?.endsAt??null,now),now.getTime())
}
export function requirePro(pro:boolean){if(!pro)throw new ApiError(403,'PRO_REQUIRED')}

type Rule={id:string;effects:readonly unknown[]}
function restrictedEffects(rule:Rule){return rule.effects.filter(effect=>effect!==null&&typeof effect==='object'&&'kind'in effect&&['video','win'].includes(String(effect.kind)))}
export function assertPresetPlan(pro:boolean,next:readonly Rule[],previous:readonly Rule[]=[]){
 if(pro)return
 if(next.length>Math.max(FREE_ACTION_LIMIT,previous.length))throw new ApiError(403,'FREE_ACTION_LIMIT')
 const saved=new Map(previous.map(rule=>[rule.id,restrictedEffects(rule)]))
 for(const rule of next){
  // Removing a saved PRO effect is safe; adding/copying/changing one is gated.
  const available=[...(saved.get(rule.id)??[])]
  for(const effect of restrictedEffects(rule)){
   const index=available.findIndex(value=>isDeepStrictEqual(value,effect))
   if(index<0)requirePro(false)
   available.splice(index,1)
  }
 }
}
export function assertOverlayPlan(pro:boolean,next:OverlayData,previous?:unknown){
 if(pro)return
 const saved=previous?hydrateOverlayData(previous):defaultOverlayData()
 for(const kind of PRO_WIDGETS as readonly WidgetKind[])
  if(!isDeepStrictEqual(next.widgets[kind],saved.widgets[kind]))requirePro(false)
}
