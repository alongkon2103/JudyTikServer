import {Inject,Injectable} from '@nestjs/common'
import {createHash} from 'node:crypto'
import {PrismaService} from '../database/prisma.service.js'
import type {Prisma,EntitlementOperation} from '../generated/prisma/client.js'
import {CLOCK,type Clock} from '../auth/clock.js'
import {ApiError} from '../http/api-error.js'
import {audit} from '../audit/write.js'
import {adjustSchema,expirySchema,revokeSchema,targetSchema,historySchema,parse,type Target,type Mutation} from './contracts.js'
import {entitlementState} from './entitlements.service.js'
import {accountOwners} from '../accounts/merge.service.js'
const DAY=86400000;
type Operation='adjust'|'set-expiry'|'revoke'
const dto=(row:EntitlementOperation)=>({id:row.id,userId:row.userId,idempotencyKey:row.idempotencyKey,operation:row.operation,days:row.days,source:row.source,reason:row.reason,before:row.beforeState,after:row.afterState,requestId:row.requestId,createdAt:row.createdAt.toISOString()})
@Injectable()
export class EntitlementsAdminService{
 constructor(@Inject(PrismaService) private readonly db:PrismaService,@Inject(CLOCK) private readonly clock:Clock){}
 private async resolve(tx:Prisma.TransactionClient,target:Target){
  let user=target.userId?await tx.user.findUnique({where:{id:target.userId}}):(await tx.userEmail.findUnique({where:{emailKey:target.email!},include:{user:true}}))?.user
  if(!user)throw new ApiError(404,'ENTITLEMENT_USER_NOT_FOUND')
  const seen=new Set<string>()
  while(user.mergedIntoId){if(seen.has(user.id))throw new ApiError(500,'ACCOUNT_LINK_INVALID');seen.add(user.id);user=await tx.user.findUnique({where:{id:user.mergedIntoId}});if(!user)throw new ApiError(404,'ENTITLEMENT_USER_NOT_FOUND')}
  return user
 }
 private async state(tx:Prisma.TransactionClient,userId:string,now:Date){
  const latest=await tx.entitlementGrant.findFirst({where:{userId,plan:'PRO',revokedAt:null,startsAt:{lte:now}},orderBy:{endsAt:'desc'}})
  return entitlementState(latest?.endsAt??null,now)
 }
 async get(input:unknown){
  const target=parse(targetSchema,input)
  return this.db.client.$transaction(async tx=>{const user=await this.resolve(tx,target);return{userId:user.id,entitlement:await this.state(tx,user.id,this.clock.now())}})
 }
 async history(input:unknown){
  const query=parse(historySchema,input)
  return this.db.client.$transaction(async tx=>{
   const user=await this.resolve(tx,query),owners=await accountOwners(tx,user.id)
   let cursor:EntitlementOperation|null=null
   if(query.before){cursor=await tx.entitlementOperation.findUnique({where:{id:query.before}});if(!cursor||!owners.includes(cursor.userId))throw new ApiError(400,'INVALID_CURSOR')}
   const rows=await tx.entitlementOperation.findMany({where:{userId:{in:owners},...(cursor?{OR:[{createdAt:{lt:cursor.createdAt}},{createdAt:cursor.createdAt,id:{lt:cursor.id}}]}:{})},orderBy:[{createdAt:'desc'},{id:'desc'}],take:query.limit+1})
   const items=rows.slice(0,query.limit)
   return{userId:user.id,items:items.map(dto),nextCursor:rows.length>query.limit?items.at(-1)!.id:null}
  })
 }
 async mutate(operation:Operation,raw:unknown,key:string,requestId:string){
  const input:Mutation=operation==='adjust'?parse(adjustSchema,raw):operation==='set-expiry'?parse(expirySchema,raw):parse(revokeSchema,raw)
  return this.db.client.$transaction(async tx=>{
   // A key serializes even across different accounts; user locking prevents lost top-ups.
   await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${'entitlement-op:'+key},0))`
   const user=await this.resolve(tx,input)
   await tx.$queryRaw`SELECT id FROM judytik.users WHERE id=${user.id}::uuid FOR UPDATE`
   const locked=await tx.user.findUnique({where:{id:user.id}})
   if(!locked||locked.disabledAt)throw new ApiError(409,'ENTITLEMENT_USER_DISABLED')
   const days='days'in input&&typeof input.days==='number'?input.days:null,expiresAt='expiresAt'in input&&typeof input.expiresAt==='string'?new Date(input.expiresAt).toISOString():null
   const requestHash=createHash('sha256').update(JSON.stringify({userId:user.id,operation,days,expiresAt,source:input.source,reason:input.reason})).digest('hex')
   const prior=await tx.entitlementOperation.findUnique({where:{idempotencyKey:key}})
   if(prior){
    const owners=await accountOwners(tx,user.id)
    const oldHash=owners.includes(prior.userId)?createHash('sha256').update(JSON.stringify({userId:prior.userId,operation,days,expiresAt,source:input.source,reason:input.reason})).digest('hex'):null
    if(prior.requestHash!==requestHash&&prior.requestHash!==oldHash)throw new ApiError(409,'IDEMPOTENCY_KEY_CONFLICT')
    return{replayed:true,operation:dto(prior),entitlement:prior.afterState}
   }
   const now=this.clock.now(),before=await this.state(tx,user.id,now)
   let end:Date|null=null
   if(operation==='adjust'){
    if(days===null)throw new ApiError(400,'INVALID_REQUEST')
    if(days<0&&before.plan!=='PRO')throw new ApiError(409,'ENTITLEMENT_NOT_ACTIVE')
    const base=before.plan==='PRO'?Date.parse(before.expiresAt!):now.getTime()
    end=new Date(Math.max(now.getTime(),base+days*DAY))
   }else if(operation==='set-expiry')end=new Date(expiresAt!)
   if(end&&(!Number.isFinite(end.getTime())||end.getTime()>now.getTime()+36500*DAY))throw new ApiError(400,'ENTITLEMENT_EXPIRY_OUT_OF_RANGE')
   // Retain grants for audit, replacing all active and scheduled access with the new result.
   await tx.entitlementGrant.updateMany({where:{userId:user.id,plan:'PRO',revokedAt:null},data:{revokedAt:now}})
   if(end)await tx.entitlementGrant.create({data:{userId:user.id,plan:'PRO',startsAt:new Date(Math.min(now.getTime(),end.getTime()-1)),endsAt:end}})
   const after=entitlementState(end,now)
   const row=await tx.entitlementOperation.create({data:{userId:user.id,idempotencyKey:key,requestHash,operation,days,source:input.source,reason:input.reason,beforeState:before,afterState:after,requestId,createdAt:now}})
   await audit(tx,{eventName:operation==='adjust'?'entitlement.adjusted':operation==='set-expiry'?'entitlement.expiry-set':'entitlement.revoked',requestId,resourceId:row.id,resourceKey:input.source})
   return{replayed:false,operation:dto(row),entitlement:after}
  },{timeout:10000,maxWait:10000})
 }
}
