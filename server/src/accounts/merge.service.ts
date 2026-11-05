import {Inject,Injectable} from '@nestjs/common'
import {randomUUID} from 'node:crypto'
import type {Prisma} from '../generated/prisma/client.js'
import {PrismaService} from '../database/prisma.service.js'
import {ApiError} from '../http/api-error.js'
import {audit} from '../audit/write.js'
import {CLOCK,type Clock} from '../auth/clock.js'
import type {VerifiedSession} from '../auth/auth.service.js'
import {validWinData} from '../../../shared/win.js'
import {validSoundpadData} from '../../../shared/soundpad.js'
import {validTtsData} from '../../../shared/tts.js'
import {validOverlayData} from '../../../shared/overlays.js'
type Tx=Prisma.TransactionClient
const tables=['winWorkspace','soundpadWorkspace','ttsWorkspace','overlaysWorkspace'] as const
const context=(tx:Tx,id:string)=>tx.$queryRaw`SELECT set_config('judytik.user_id',${id},true)`
const json=(value:unknown)=>JSON.parse(JSON.stringify(value,(_key,v)=>typeof v==='bigint'?String(v):v))
const idsEqual=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b)
function mediaRefs(data:any){
 const refs:{object:any;key:string}[]=[]
 for(const preset of data.presets??[])for(const effect of preset.actions??[])for(const command of effect.effects??[])if(command.media?.bindingId)refs.push({object:command.media,key:'bindingId'})
 for(const pad of data.soundpadWorkspace?.data?.pads??[])refs.push({object:pad,key:'bindingId'})
 for(const workspace of ['winWorkspace','overlaysWorkspace']){
  const pending=[data[workspace]?.data];while(pending.length){const value=pending.pop();if(!value||typeof value!=='object')continue;for(const [key,child]of Object.entries(value)){if(key==='imageBindingId'&&typeof child==='string'&&child)refs.push({object:value,key});else if(child&&typeof child==='object')pending.push(child)}}
 }
 return refs
}
function remapMedia(data:any,map:Record<string,string>){for(const ref of mediaRefs(data)){const to=map[ref.object[ref.key]];if(to)ref.object[ref.key]=to}}
export async function canonicalUser(tx:Tx,id:string){
 const seen=new Set<string>()
 for(let n=0;n<32;n++){
  if(seen.has(id))throw new ApiError(500,'ACCOUNT_LINK_INVALID');seen.add(id)
  const user=await tx.user.findUnique({where:{id}})
  if(!user)throw new ApiError(404,'ACCOUNT_NOT_FOUND')
  if(user.disabledAt)throw new ApiError(401,'AUTH_UNAUTHORIZED')
  if(!user.mergedIntoId)return user
  id=user.mergedIntoId
 }
 throw new ApiError(500,'ACCOUNT_LINK_INVALID')
}
export async function accountOwners(tx:Tx,id:string){return[id,...(await tx.user.findMany({where:{mergedIntoId:id},select:{id:true}})).map(row=>row.id)]}
async function snapshot(tx:Tx,id:string){
 await context(tx,id)
 const user=await tx.user.findUniqueOrThrow({where:{id},select:{id:true,displayName:true,avatarUrl:true,createdAt:true,email:true,identities:{select:{provider:true}}}})
 const settings=await tx.accountSettings.findUnique({where:{userId:id}}),workspaces:Record<string,unknown>={}
 for(const table of tables)workspaces[table]=await(tx[table] as any).findUnique({where:{userId:id}})
 const presets=await tx.actionPreset.findMany({where:{userId:id},orderBy:{id:'asc'}}),history=await tx.liveHistory.findMany({where:{userId:id},orderBy:{id:'asc'}}),grants=await tx.entitlementGrant.findMany({where:{userId:id}}),devices=await tx.device.findMany({where:{userId:id}})
 const result=json({version:1,user,settings,...workspaces,presets,history,grants,devices})
 if(Buffer.byteLength(JSON.stringify(result))>24*1024*1024)throw new ApiError(409,'ACCOUNT_MERGE_TOO_LARGE')
 return result
}
async function archive(tx:Tx,owner:string,source:string,kind:string,data:Prisma.InputJsonValue,now:Date){
 await context(tx,owner)
 return tx.accountMergeArchive.create({data:{ownerUserId:owner,sourceUserId:source,kind,data,createdAt:now}})
}
// Called only inside a freshly verified provider callback while the verified email is locked.
export async function mergeVerifiedAccounts(tx:Tx,sourceId:string,targetId:string,now:Date,requestId:string){
 for(const id of [sourceId,targetId].sort())await tx.$queryRaw`SELECT id FROM judytik.users WHERE id=${id}::uuid FOR UPDATE`
 const source=await canonicalUser(tx,sourceId),target=await canonicalUser(tx,targetId)
 if(source.id===target.id)return target
 if(source.id!==sourceId||target.id!==targetId)throw new ApiError(409,'ACCOUNT_LINK_RETRY')
 const oldOwners=await accountOwners(tx,source.id)
 const original=await snapshot(tx,source.id),primary=await snapshot(tx,target.id)
 const presetMap=new Map<string,string>(original.presets.filter((p:any)=>!p.deletedAt).map((p:any)=>[p.id,randomUUID()]))
 original.copiedPresetIds=Object.fromEntries(presetMap)
 const primaryMedia=new Set(mediaRefs(primary).map(ref=>ref.object[ref.key])),bindingIdMap:Record<string,string>={}
 for(const ref of mediaRefs(original)){const id=ref.object[ref.key];if(primaryMedia.has(id)&&!bindingIdMap[id])bindingIdMap[id]=randomUUID()}
 if(Object.keys(bindingIdMap).length>4000)throw new ApiError(409,'ACCOUNT_MERGE_TOO_LARGE')
 original.bindingIdMap=bindingIdMap;original.mediaAliases=Object.fromEntries(Object.entries(bindingIdMap).map(([bindingId,id])=>[id,{owner:source.id,bindingId}]))
 await archive(tx,target.id,source.id,'source',original,now)
 await archive(tx,target.id,target.id,'primary',primary,now)
 const incoming=structuredClone(original);remapMedia(incoming,bindingIdMap)
 await context(tx,target.id)
 // Owners/IDs of original rows are immutable; copy every active set and retain originals.
 for(const row of incoming.presets.filter((p:any)=>!p.deletedAt)){
  const id=presetMap.get(row.id)!
  await tx.actionPreset.create({data:{id,userId:target.id,schemaVersion:row.schemaVersion,name:row.name,actions:row.actions}})
 }
 for(const table of tables){
  const sourceRow=incoming[table],current=primary[table]
  if(!sourceRow)continue
  const data=structuredClone(sourceRow.data)
  if(table==='overlaysWorkspace')for(const option of data.widgets?.spin?.spinOptions??[])if(option.actionId&&presetMap.has(option.actionId))option.actionId=presetMap.get(option.actionId)
  if(!current)await(tx[table] as any).create({data:{userId:target.id,data}})
  else if(table==='soundpadWorkspace'){
   const combined=structuredClone(current.data)
   for(const pad of data.pads){
    if(combined.pads.some((p:any)=>idsEqual(p,pad)))continue
    const copy={...pad,id:combined.pads.some((p:any)=>p.id===pad.id)?randomUUID():pad.id}
    // Retain a conflicting shortcut in the archive, never register it twice.
    if(!validSoundpadData({...combined,pads:[...combined.pads,copy]}))copy.hotkey=''
    if(validSoundpadData({...combined,pads:[...combined.pads,copy]}))combined.pads.push(copy)
   }
   if(!idsEqual(combined,current.data))await tx.soundpadWorkspace.update({where:{userId:target.id},data:{data:combined,revision:{increment:1}}})
  }
 }
 if(original.settings&&!primary.settings)await tx.accountSettings.create({data:{userId:target.id,theme:original.settings.theme,language:original.settings.language}})
 const deviceMap=new Map<string,string>()
 for(const device of original.devices){
  const saved=await tx.device.upsert({where:{userId_installationId:{userId:target.id,installationId:device.installationId}},create:{userId:target.id,installationId:device.installationId,label:device.label,platform:device.platform,lastSeenAt:new Date(device.lastSeenAt)},update:{}})
  deviceMap.set(device.id,saved.id)
 }
 for(const row of original.history){
  const collision=await tx.liveHistory.findUnique({where:{userId_id:{userId:target.id,id:row.id}}})
  const id=collision?randomUUID():row.id,data={...row.data,id},deviceId=deviceMap.get(row.creatorDeviceId)!
  await tx.$queryRaw`SELECT set_config('judytik.device_id',${deviceId},true)`
  await tx.liveHistory.create({data:{userId:target.id,id,creatorDeviceId:deviceId,startedAt:new Date(row.startedAt),data}})
 }
 if(original.grants.length)await tx.entitlementGrant.createMany({data:original.grants.map((g:any)=>({userId:target.id,plan:g.plan,startsAt:new Date(g.startsAt),endsAt:new Date(g.endsAt),revokedAt:g.revokedAt?new Date(g.revokedAt):null,createdAt:new Date(g.createdAt)}))})
 await tx.identity.updateMany({where:{userId:source.id},data:{userId:target.id}})
 await tx.refreshToken.updateMany({where:{session:{userId:source.id},revokedAt:null},data:{revokedAt:now}})
 await tx.session.updateMany({where:{userId:source.id,revokedAt:null},data:{revokedAt:now}})
 await tx.emailChallenge.updateMany({where:{userId:source.id,invalidatedAt:null},data:{invalidatedAt:now}})
 await tx.user.updateMany({where:{id:{in:oldOwners}},data:{mergedIntoId:target.id,mergedAt:now}})
 await audit(tx,{eventName:'account.merged',actorUserId:target.id,resourceId:source.id,requestId})
 return target
}
@Injectable()
export class AccountMergeService{
 constructor(@Inject(PrismaService) private readonly db:PrismaService,@Inject(CLOCK) private readonly clock:Clock){}
 async list(actor:VerifiedSession){
  return this.db.client.$transaction(async tx=>{
   const owners=await accountOwners(tx,actor.userId),items:any[]=[],mediaAliases:Record<string,unknown>={}
   for(const owner of owners){await context(tx,owner);for(const row of await tx.$queryRaw<any[]>`SELECT id,kind,source_user_id,created_at,data->'mediaAliases' AS media_aliases,data->'user'->>'displayName' AS name,data->'user'->'identities' AS identities,ARRAY(SELECT k FROM unnest(ARRAY['settings','winWorkspace','soundpadWorkspace','ttsWorkspace','overlaysWorkspace']) k WHERE data->k IS NOT NULL AND data->k<>'null'::jsonb) AS modules FROM judytik.account_merge_archives WHERE owner_user_id=${owner}::uuid ORDER BY created_at DESC`){
    Object.assign(mediaAliases,row.media_aliases??{})
    items.push({id:row.id,kind:row.kind,sourceUserId:row.source_user_id,name:row.name??'บัญชีเดิม',providers:[...new Set((row.identities??[]).map((x:any)=>x.provider))],createdAt:row.created_at.toISOString(),modules:row.modules})
   }}
   return{userId:actor.userId,linkedAccountIds:owners.filter(id=>id!==actor.userId),mediaAliases,items}
  })
 }
 private async getArchive(tx:Tx,userId:string,id:string){
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id))throw new ApiError(400,'INVALID_REQUEST')
  for(const owner of await accountOwners(tx,userId)){await context(tx,owner);const row=await tx.accountMergeArchive.findUnique({where:{id}});if(row&&row.ownerUserId===owner)return row}
  throw new ApiError(404,'NOT_FOUND')
 }
 async get(actor:VerifiedSession,id:string){return this.db.client.$transaction(async tx=>{const row=await this.getArchive(tx,actor.userId,id);return{version:1,id:row.id,kind:row.kind,sourceUserId:row.sourceUserId,capturedAt:row.createdAt.toISOString(),data:row.data}})}
 async restore(actor:VerifiedSession,id:string,input:any,requestId:string){
  if(!input||Object.keys(input).sort().join(',')!=='module,revision'||!['settings',...tables].includes(input.module)||typeof input.revision!=='string'||!/^\d{1,19}$/.test(input.revision))throw new ApiError(400,'INVALID_REQUEST')
  return this.db.client.$transaction(async tx=>{
   await tx.$queryRaw`SELECT id FROM judytik.users WHERE id=${actor.userId}::uuid FOR UPDATE`
   const row=await this.getArchive(tx,actor.userId,id),data=(row.data as any)[input.module]
   if(!data)throw new ApiError(404,'NOT_FOUND')
   const model=input.module==='settings'?tx.accountSettings:(tx as any)[input.module]
   await context(tx,actor.userId)
   const current=await model.findUnique({where:{userId:actor.userId}})
   if(String(current?.revision??0)!==input.revision)throw new ApiError(412,'ACCOUNT_RESTORE_CONFLICT')
   const value=structuredClone(data.data??{theme:data.theme,language:data.language})
   const selected={presets:[],[input.module]:{data:value}};remapMedia(selected,(row.data as any).bindingIdMap??{})
   if(input.module==='overlaysWorkspace')for(const option of value.widgets?.spin?.spinOptions??[]){const copied=(row.data as any).copiedPresetIds?.[option.actionId];if(copied)option.actionId=copied}
   const valid=input.module==='settings'?['dark','light'].includes(value.theme)&&['th','en','es'].includes(value.language):({winWorkspace:validWinData,soundpadWorkspace:validSoundpadData,ttsWorkspace:validTtsData,overlaysWorkspace:validOverlayData} as any)[input.module](value)
   if(!valid)throw new ApiError(409,'ACCOUNT_BACKUP_INCOMPATIBLE')
   await archive(tx,actor.userId,actor.userId,'restore',await snapshot(tx,actor.userId),this.clock.now())
   const write=input.module==='settings'?value:{data:value}
   if(current)await model.update({where:{userId:actor.userId},data:{...write,revision:{increment:1}}})
   else await model.create({data:{userId:actor.userId,...write}})
   await audit(tx,{eventName:'account.configuration.restored',actorUserId:actor.userId,resourceId:id,resourceKey:input.module,requestId})
   return{restored:true,module:input.module}
  },{timeout:30000})
 }
}
