import {Inject,Injectable,Controller,Get,Req,Res,UseGuards} from '@nestjs/common';
import type {Response} from 'express';
import {z} from 'zod';
import {CONFIG,type ServerConfig} from '../config/env.js';
import {CLOCK,type Clock} from '../auth/clock.js';
import {PrismaService} from '../database/prisma.service.js';
import type {VerifiedSession} from '../auth/auth.service.js';
import {SessionGuard,type SessionRequest} from '../auth/session.guard.js';
import {ApiError} from '../http/api-error.js';
export type ShopConfig={baseUrl:string;serviceKey:string};
const iso=z.iso.datetime({offset:false});
const entry=z.object({gameSlug:z.string().min(1).max(80).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),status:z.enum(['active','expired','revoked']),expiresAt:iso.nullable()}).strict();
export const shopResponse=z.object({schemaVersion:z.literal(1),email:z.email().max(254),customerId:z.string().min(1).max(128).nullable(),licenses:z.array(entry).max(10000),serverTime:iso}).strict();
type Licenses=z.infer<typeof shopResponse>['licenses'];
const unavailable=()=>new ApiError(503,'GAME_LICENSE_UNAVAILABLE');
export class ShopLicenseClient {
 private cache=new Map<string,{until:number;licenses:Licenses}>();private pending=new Map<string,Promise<Licenses>>();private blockedUntil=0;private attempts:number[]=[];
 constructor(private config?:ShopConfig,private now=Date.now,private fetcher:typeof fetch=fetch){}
 async lookup(input:string):Promise<Licenses>{
  const email=input.trim().toLowerCase(),now=this.now(),cached=this.cache.get(email);if(cached&&cached.until>now)return structuredClone(cached.licenses);
  const pending=this.pending.get(email);if(pending)return structuredClone(await pending);
  this.attempts=this.attempts.filter(t=>now-t<60000);
  if(!this.config||now<this.blockedUntil||this.pending.size>=20||this.attempts.length>=120)throw unavailable();
  this.attempts.push(now);
  const task=this.read(email).then(licenses=>{if(this.cache.size>=1000)this.cache.delete(this.cache.keys().next().value!);this.cache.set(email,{until:this.now()+60000,licenses});return licenses});this.pending.set(email,task);
  try{return structuredClone(await task)}finally{if(this.pending.get(email)===task)this.pending.delete(email)}
 }
 private async read(email:string):Promise<Licenses>{
  try{
   const config=this.config!;const r=await this.fetcher(new URL('/api/integrations/judytik/licenses/lookup',config.baseUrl),{method:'POST',redirect:'error',headers:{Authorization:'Bearer '+config.serviceKey,'Content-Type':'application/json',Accept:'application/json','X-Request-Id':crypto.randomUUID()},body:JSON.stringify({email}),signal:AbortSignal.timeout(10000)});
   if(r.status===429){const raw=r.headers.get('retry-after'),seconds=Number(raw),ms=raw===null?60000:Number.isFinite(seconds)?seconds*1000:Date.parse(raw)-this.now();this.blockedUntil=this.now()+Math.min(86400000,Math.max(1000,Number.isFinite(ms)?ms:60000));}
   if(!r.ok){await r.body?.cancel();throw unavailable()}
   const reader=r.body?.getReader();if(!reader)throw unavailable();let length=0;const chunks:Uint8Array[]=[];
   try{while(true){const part=await reader.read();if(part.done)break;length+=part.value.byteLength;if(length>1048576){await reader.cancel();throw unavailable()}chunks.push(part.value)}}finally{reader.releaseLock()}
   const parsed=shopResponse.safeParse(JSON.parse(Buffer.concat(chunks).toString('utf8')));if(!parsed.success)throw unavailable();const data=parsed.data;
   if(data.email!==email||new Set(data.licenses.map(x=>x.gameSlug)).size!==data.licenses.length||data.customerId===null&&data.licenses.length)throw unavailable();return data.licenses;
  }catch{throw unavailable()}
 }
}
@Injectable()
export class GameLicensesService {
 client:ShopLicenseClient;
 constructor(@Inject(PrismaService) private db:PrismaService,@Inject(CONFIG) config:ServerConfig,@Inject(CLOCK) private clock:Clock){this.client=new ShopLicenseClient(config.shop,()=>+clock.now())}
 async snapshot(actor:VerifiedSession){
  if(!actor)throw new ApiError(401,'AUTH_UNAUTHORIZED');
  // Compatible access snapshot for already-installed Desktop versions.
  // No shop calls and no changes to purchases, PRO or expiry records.
  const games=await this.db.client.game.findMany({where:{status:'published',OR:[{categoryId:null},{category:{status:'active'}}]},select:{slug:true},orderBy:{slug:'asc'},take:10000});
  return {state:'ready' as const,licenses:games.map(game=>({gameSlug:game.slug,status:'active' as const,expiresAt:null})),checkedAt:this.clock.now().toISOString()};
 }
 async require(actor:VerifiedSession|undefined,_slug:string){if(!actor)throw new ApiError(401,'AUTH_UNAUTHORIZED')}

}
@Controller('me/game-licenses')
@UseGuards(SessionGuard)
export class GameLicensesController{
 constructor(@Inject(GameLicensesService) private service:GameLicensesService){}
 @Get() async get(@Req() req:SessionRequest,@Res({passthrough:true}) res:Response){res.setHeader('Cache-Control','no-store');return this.service.snapshot(req.verifiedSession)}
}
