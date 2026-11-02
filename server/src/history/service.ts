import { Inject, Injectable } from '@nestjs/common'
import { isDeepStrictEqual } from 'node:util'
import { Prisma } from '../generated/prisma/client.js'
import { PrismaService } from '../database/prisma.service.js'
import type { VerifiedSession } from '../auth/auth.service.js'
import { CLOCK, type Clock } from '../auth/clock.js'
import { ApiError } from '../http/api-error.js'
import { audit } from '../audit/write.js'
import { validHistorySnapshot, type LiveHistorySnapshot, type LiveHistoryPage, validHistorySummary } from '../../../shared/history.js'
import { historyId, historyQuery, historyCursor } from './contracts.js'
const conflict=()=>new ApiError(409,'HISTORY_CONFLICT')
function snapshot(data:unknown):LiveHistorySnapshot {
 if(!validHistorySnapshot(data))throw new ApiError(500,'HISTORY_DATA_INVALID')
 return data
}
function assertProgress(current:LiveHistorySnapshot,next:LiveHistorySnapshot) {
 if(['id','username','roomId','startedAt'].some(key=>current[key as keyof LiveHistorySnapshot]!==next[key as keyof LiveHistorySnapshot])
  || next.updatedAt<current.updatedAt || next.durationSeconds<current.durationSeconds
  || current.status!=='active' && (next.status!==current.status || next.endedAt!==current.endedAt)
  || Object.keys(current.stats).some(key=>{const k=key as keyof LiveHistorySnapshot['stats'];return current.stats[k]!==null && (next.stats[k]===null || next.stats[k]! < current.stats[k]!)})
  || current.gifts.some(gift=>{const updated=next.gifts.find(row=>row.id===gift.id);return !updated || updated.count<gift.count || updated.totalCoins<gift.totalCoins})) throw conflict()
}
@Injectable()
export class HistoryService {
 constructor(@Inject(PrismaService) private readonly db:PrismaService,@Inject(CLOCK) private readonly clock:Clock) {}
 async get(actor:VerifiedSession,input:unknown) {
  const id=historyId(input)
  return this.db.withUserContext(actor.userId,async tx=>{
   const [row]=await tx.$queryRaw<{data:unknown}[]>`SELECT data FROM judytik.live_history WHERE user_id=${actor.userId}::uuid AND id=${id}::uuid`
   if(!row)throw new ApiError(404,'NOT_FOUND')
   return snapshot(row.data)
  })
 }
 async save(actor:VerifiedSession,inputId:unknown,input:unknown,requestId:string) {
  const id=historyId(inputId)
  if(!validHistorySnapshot(input) || input.id!==id || Buffer.byteLength(JSON.stringify(input),'utf8')>1048576)throw new ApiError(400,'INVALID_REQUEST')
  const latest=this.clock.now().getTime()+300000
  if([input.startedAt,input.updatedAt,input.endedAt].some(at=>at!==null && Date.parse(at)>latest))throw new ApiError(400,'INVALID_REQUEST')
  return this.db.withUserContext(actor.userId,async tx=>{
   // The account lock also serializes first writes before a history row exists.
   await tx.$queryRaw`SELECT id FROM judytik.users WHERE id=${actor.userId}::uuid FOR UPDATE`
   await tx.$queryRaw`SELECT set_config('judytik.device_id',${actor.deviceId},true)`
   const [row]=await tx.$queryRaw<{data:unknown;creator_device_id:string}[]>`SELECT data,creator_device_id FROM judytik.live_history WHERE user_id=${actor.userId}::uuid AND id=${id}::uuid`
   if(row) {
    if(row.creator_device_id!==actor.deviceId)throw conflict()
    const current=snapshot(row.data)
    if(input.sequence<current.sequence)return current
    if(input.sequence===current.sequence) {if(!isDeepStrictEqual(input,current))throw conflict();return current}
    assertProgress(current,input)
    await tx.$executeRaw`UPDATE judytik.live_history SET data=${JSON.stringify(input)}::jsonb WHERE user_id=${actor.userId}::uuid AND id=${id}::uuid`
   } else await tx.$executeRaw`INSERT INTO judytik.live_history(user_id,id,creator_device_id,started_at,data) VALUES(${actor.userId}::uuid,${id}::uuid,${actor.deviceId}::uuid,${input.startedAt}::timestamptz,${JSON.stringify(input)}::jsonb)`
   await audit(tx,{eventName:'history.saved',actorUserId:actor.userId,sessionId:actor.sessionId,resourceId:id,resourceRevision:BigInt(input.sequence),requestId})
   return input
  })
 }
 async list(actor:VerifiedSession,input:unknown):Promise<LiveHistoryPage> {
  const query=historyQuery(input),cutoff=query.range==='all'?null:new Date(this.clock.now().getTime()-Number(query.range)*86400000)
  return this.db.withUserContext(actor.userId,async tx=>{
   const filter=Prisma.sql`user_id=${actor.userId}::uuid AND (${cutoff}::timestamptz IS NULL OR started_at>=${cutoff}::timestamptz) AND (${query.query}='' OR strpos(lower((data->>'username') || ' ' || (data->>'title')),${query.query})>0)`
   const after=query.cursor?Prisma.sql`AND (started_at,id)<(${query.cursor.at}::timestamptz,${query.cursor.id}::uuid)`:Prisma.empty
   const rows=await tx.$queryRaw<{data:unknown}[]>(Prisma.sql`SELECT data FROM judytik.live_history WHERE ${filter} ${after} ORDER BY started_at DESC,id DESC LIMIT ${query.limit+1}`)
   const [totals]=await tx.$queryRaw<{sessions:string;coins:string;duration:string;peak:string|null}[]>(Prisma.sql`SELECT count(*)::text AS sessions,coalesce(sum((data->'stats'->>'coins')::numeric),0)::text AS coins,coalesce(sum((data->>'durationSeconds')::numeric),0)::text AS duration,max((data->'stats'->>'peakViewers')::numeric)::text AS peak FROM judytik.live_history WHERE ${filter}`)
   const summary={sessions:Number(totals.sessions),coins:Number(totals.coins),durationSeconds:Number(totals.duration),peakViewers:totals.peak===null?null:Number(totals.peak)}
   if(!validHistorySummary(summary))throw new ApiError(500,'HISTORY_DATA_INVALID')
   const items:LiveHistorySnapshot[]=[]
   // Reserve envelope/cursor bytes; a single large snapshot must still make progress.
   let bytes=Buffer.byteLength(JSON.stringify({items:[],nextCursor:null,summary}))+1024
   for(const row of rows.slice(0,query.limit)) {
    const value=snapshot(row.data),size=Buffer.byteLength(JSON.stringify(value))+1
    if(items.length && bytes+size>750*1024)break
    items.push(value);bytes+=size
   }
   const last=items.at(-1)
   return {items,nextCursor:rows.length>items.length&&last?historyCursor(last.startedAt,last.id):null,summary}
  },'RepeatableRead')
 }
}
