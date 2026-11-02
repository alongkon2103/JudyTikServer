import 'reflect-metadata'
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { Client } from 'pg'
import { Test } from '@nestjs/testing'
import type { NestExpressApplication } from '@nestjs/platform-express'
import { AppModule } from '../src/app.module.js'
import { configureApp } from '../src/http/configure.js'
import { readConfig } from '../src/config/env.js'
import { PrismaService } from '../src/database/prisma.service.js'
import { CLOCK } from '../src/auth/clock.js'
import { authHarness } from './support/auth-flow.js'

const config=readConfig(process.env), db=new PrismaService(config), h=authHarness(db)
const owner=new Client({connectionString:process.env.TEST_ADMIN_DATABASE_URL})
type Account=Awaited<ReturnType<typeof h.signIn>>
let app:NestExpressApplication, base:string
const document=(overrides:Record<string,unknown>={})=>({version:1,id:randomUUID(),sequence:1,username:'creator.test',roomId:'123456',title:'LIVE ทดสอบ',startedAt:'2026-10-31T10:00:00.000Z',updatedAt:'2026-10-31T10:01:00.000Z',endedAt:null,status:'active',durationSeconds:60,stats:{peakViewers:100,likes:1000,coins:2,followers:3,chats:4,shares:5,giftCount:2,unknownGiftCount:0},gifts:[{id:'5655',name:'Rose',coins:1,count:2,totalCoins:2}],chart:[{at:'2026-10-31T10:00:00.000Z',viewers:100}],...overrides})
const call=(a:Account,path='',options:RequestInit={})=>fetch(base+'/v1/me/live-history'+path,{...options,headers:{'content-type':'application/json',authorization:'Bearer '+a.tokens.access_token,...options.headers}})
const save=(a:Account,data:Record<string,any>,id:string=data.id)=>call(a,'/'+id,{method:'PUT',body:JSON.stringify(data)})
before(async()=>{await db.onModuleInit();await owner.connect();const module=await Test.createTestingModule({imports:[AppModule.register({...config,auth:h.config})]}).overrideProvider(CLOCK).useValue(h.clock).compile();app=configureApp(module.createNestApplication<NestExpressApplication>({logger:false}));await app.listen(0,'127.0.0.1');base=await app.getUrl()})
after(async()=>{await app?.close();await db.onModuleDestroy();await owner.end()})

test('history requires native session authorization for every route',async()=>{
 for(const path of ['', '/'+randomUUID()]) assert.equal((await fetch(base+'/v1/me/live-history'+path)).status,401)
 assert.equal((await fetch(base+'/v1/me/live-history/'+randomUUID(),{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify(document())})).status,401)
})
test('history round trips account scoped snapshots and binds mutations to original device',async()=>{
 const subject=randomUUID(),a=await h.signIn({subject}),same=await h.signIn({subject}),b=await h.signIn(),data=document()
 assert.equal((await save(a,data)).status,200)
 assert.deepEqual(await (await call(same,'/'+data.id)).json(),data)
 assert.equal((await call(b,'/'+data.id)).status,404)
 assert.equal((await save(same,{...data,sequence:2})).status,409)
 assert.deepEqual((await (await call(b)).json()).items,[])
 assert.equal((await save(a,{...data,userId:b.session.userId})).status,400)
 assert.equal((await save(a,data,randomUUID())).status,400)
})
test('history duplicate and stale retries never overwrite; conflicting equal sequence rejects',async()=>{
 const a=await h.signIn(),data=document();assert.equal((await save(a,data)).status,200)
 assert.deepEqual(await (await save(a,data)).json(),data)
 assert.equal((await save(a,{...data,title:'Different'})).status,409)
 const next={...data,sequence:3,durationSeconds:120,updatedAt:'2026-10-31T10:02:00.000Z'}
 assert.equal((await save(a,next)).status,200)
 assert.deepEqual(await (await save(a,data)).json(),next)
 assert.deepEqual(await (await call(a,'/'+data.id)).json(),next)
})
test('history serializes concurrent writes and never reopens or regresses a finished record',async()=>{
 const a=await h.signIn(),data=document();await save(a,data)
 const variants=[2,3,4,5].map(sequence=>({...data,sequence,durationSeconds:sequence*60,updatedAt:`2026-10-31T10:0${sequence}:00.000Z`}))
 assert.deepEqual((await Promise.all(variants.map(v=>save(a,v)))).map(r=>r.status),[200,200,200,200])
 assert.equal((await (await call(a,'/'+data.id)).json()).sequence,5)
 const finished={...variants[3],sequence:6,status:'completed',endedAt:'2026-10-31T10:05:00.000Z'}
 assert.equal((await save(a,finished)).status,200)
 for(const patch of [{status:'active',endedAt:null},{durationSeconds:1},{stats:{...data.stats,giftCount:1},gifts:[{...data.gifts[0],count:1}]},{stats:{...data.stats,chats:3}},{username:'hijacked'},{roomId:'999'},{startedAt:'2026-10-31T09:00:00.000Z'},{stats:{...data.stats,coins:1},gifts:[{...data.gifts[0],totalCoins:1}]},{updatedAt:'2026-10-31T10:04:00.000Z',endedAt:'2026-10-31T10:04:00.000Z',durationSeconds:240}]) assert.equal((await save(a,{...finished,sequence:7,...patch})).status,409,JSON.stringify(patch))
})
test('history rejects invalid fields, nested PII, limits, and malformed pagination',async()=>{
 const a=await h.signIn(),data=document()
 for(const patch of [{version:2},{sequence:0},{sequence:1.5},{title:''},{roomId:'1'.repeat(31)},{status:'fake'},{durationSeconds:-1},{stats:{...data.stats,coins:-1}},{stats:{...data.stats,viewerProfiles:[]}},{gifts:Array(2001).fill(data.gifts[0])},{gifts:[data.gifts[0],data.gifts[0]]},{chart:Array(721).fill(data.chart[0])},{chatMessages:[]},{endedAt:data.startedAt},{updatedAt:'yesterday'}]) assert.equal((await save(a,{...data,...patch})).status,400,JSON.stringify(patch).slice(0,80))
 for(const query of ['?range=8','?limit=101','?cursor=invalid','?query='+ 'a'.repeat(121),'?owner='+randomUUID()]) assert.equal((await call(a,query)).status,400,query)
 assert.equal((await call(a,'/invalid')).status,400)
})
test('history pages deterministically and summarizes the entire filtered result',async()=>{
 const a=await h.signIn(),old=document({startedAt:'2020-01-01T10:00:00.000Z',updatedAt:'2020-01-01T10:01:00.000Z',chart:[]})
 await save(a,old)
 for(let i=0;i<4;i++) assert.equal((await save(a,document({title:'Search '+i,gifts:[{...document().gifts[0],totalCoins:i}],chart:[],stats:{...document().stats,coins:i,peakViewers:i===0?null:10*i}}))).status,200)
 const first=await (await call(a,'?range=all&query=Search&limit=2')).json()
 assert.equal(first.items.length,2);assert.equal(typeof first.nextCursor,'string')
 assert.deepEqual(first.summary,{sessions:4,coins:6,durationSeconds:240,peakViewers:30})
 const second=await (await call(a,'?range=all&query=Search&limit=2&cursor='+encodeURIComponent(first.nextCursor))).json()
 assert.equal(second.items.length,2);assert.equal(second.nextCursor,null)
 assert.equal(new Set([...first.items,...second.items].map((x:any)=>x.id)).size,4)
 assert.deepEqual(second.summary,first.summary)
 assert.equal((await (await call(a,'?range=7')).json()).summary.sessions,4)
})
test('history accepts a bounded document above the global body limit and rejects above 1 MiB',async()=>{
 const a=await h.signIn(),data=document({stats:{...document().stats,coins:2000,giftCount:2000},gifts:Array.from({length:2000},(_,i)=>({id:String(i+1),name:'ก'.repeat(100),coins:1,count:1,totalCoins:1}))})
 assert.ok(Buffer.byteLength(JSON.stringify(data))>262144)
 assert.equal((await save(a,data)).status,200)
 const response=await call(a,'/'+randomUUID(),{method:'PUT',body:JSON.stringify({...data,title:'a'.repeat(1048576)})})
 assert.equal(response.status,413)
})
test('history RLS, immutable identity, bounded SQL storage, grants, and audit rollback',async()=>{
 const a=await h.signIn(),b=await h.signIn(),data=document();await save(a,data)
 assert.equal((await db.client.$queryRaw<any[]>`SELECT * FROM judytik.live_history`).length,0)
 assert.deepEqual(await db.withUserContext(a.session.userId,tx=>tx.$queryRaw<any[]>`SELECT user_id FROM judytik.live_history`),[{user_id:a.session.userId}])
 await assert.rejects(()=>db.withUserContext(a.session.userId,async tx=>{await tx.$queryRaw`SELECT set_config('judytik.device_id',${a.session.deviceId},true)`;return tx.$executeRaw`UPDATE judytik.live_history SET user_id=${b.session.userId}::uuid WHERE id=${data.id}::uuid`}))
 await assert.rejects(()=>db.withUserContext(a.session.userId,async tx=>{await tx.$queryRaw`SELECT set_config('judytik.device_id',${a.session.deviceId},true)`;return tx.$executeRaw`UPDATE judytik.live_history SET creator_device_id=${b.session.deviceId}::uuid WHERE id=${data.id}::uuid`}))
 await assert.rejects(()=>db.withUserContext(a.session.userId,tx=>tx.$executeRaw`DELETE FROM judytik.live_history WHERE id=${data.id}::uuid`))
 await assert.rejects(()=>owner.query('INSERT INTO judytik.live_history(user_id,id,creator_device_id,started_at,data) VALUES($1,$2,$3,$4,$5)',[a.session.userId,randomUUID(),a.session.deviceId,data.startedAt,JSON.stringify({...data,title:'x'.repeat(1048576)})]))
 const newData=document(),requestId=randomUUID()
 await owner.query(`CREATE FUNCTION judytik.reject_history_audit_test() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.event_name='history.saved' THEN RAISE EXCEPTION 'fixture audit failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER reject_history_audit_test BEFORE INSERT ON judytik.audit_events FOR EACH ROW EXECUTE FUNCTION judytik.reject_history_audit_test()`)
 try{assert.equal((await save(a,newData)).status,500);assert.equal((await call(a,'/'+newData.id)).status,404);assert.equal((await save(a,{...data,sequence:2,title:'Changed'})).status,500);assert.deepEqual(await (await call(a,'/'+data.id)).json(),data)}finally{await owner.query('DROP TRIGGER reject_history_audit_test ON judytik.audit_events;DROP FUNCTION judytik.reject_history_audit_test()')}
})

test('history bounds every busy page by response bytes without omitting records',async()=>{
 const a=await h.signIn(),start=Date.parse('2026-10-31T10:00:00.000Z')
 const chart=Array.from({length:720},(_,i)=>({at:new Date(start+i*1000).toISOString(),viewers:100}))
 const busy=()=>document({chart,updatedAt:'2026-10-31T10:12:00.000Z',durationSeconds:720})
 const records=Array.from({length:50},busy)
 const large=busy()
 large.gifts=Array.from({length:2000},(_,i)=>({id:'1234567890123456'+String(i).padStart(4,'0'),name:'ก'.repeat(100),coins:1,count:1,totalCoins:1}))
 large.stats={...large.stats,coins:2000,giftCount:2000}
 assert.ok(Buffer.byteLength(JSON.stringify(large))>750*1024)
 records.push(large)
 for(const record of records) await owner.query('INSERT INTO judytik.live_history(user_id,id,creator_device_id,started_at,data) VALUES($1,$2,$3,$4,$5::jsonb)',[a.session.userId,record.id,a.session.deviceId,record.startedAt,JSON.stringify(record)])
 const seen:string[]=[]
 let cursor:string|null=null,pages=0
 do {
  const response=await call(a,'?range=all'+(cursor?'&cursor='+encodeURIComponent(cursor):''))
  assert.equal(response.status,200)
  const raw=await response.text();assert.ok(Buffer.byteLength(raw)<1048576,'page must fit desktop response cap')
  const page=JSON.parse(raw)
  assert.ok(page.items.length>0)
  assert.deepEqual(page.summary,{sessions:51,coins:2100,durationSeconds:51*720,peakViewers:100})
  seen.push(...page.items.map((item:any)=>item.id));cursor=page.nextCursor;pages++
  assert.ok(pages<=51,'cursor must advance on every page')
 }while(cursor)
 assert.ok(pages>=3)
 assert.equal(new Set(seen).size,51)
 assert.deepEqual([...seen].sort(),records.map(record=>record.id).sort())
})

test('history rejects future timestamps beyond the allowed server clock skew',async()=>{
 const a=await h.signIn(),boundary=new Date(h.clock.now().getTime()+300000).toISOString()
 const accepted=document({startedAt:boundary,updatedAt:boundary,chart:[],durationSeconds:0})
 assert.equal((await save(a,accepted)).status,200)
 const future=new Date(h.clock.now().getTime()+300001).toISOString()
 for(const record of [
  document({startedAt:future,updatedAt:future,chart:[],durationSeconds:0}),
  document({updatedAt:future}),
  document({status:'completed',updatedAt:future,endedAt:future}),
  document({startedAt:'9999-01-01T00:00:00.000Z',updatedAt:'9999-01-01T00:00:00.000Z',chart:[],durationSeconds:0}),
 ]) {
  assert.equal((await save(a,record)).status,400)
  assert.equal((await call(a,'/'+record.id)).status,404)
 }
 assert.equal((await save(a,{...accepted,sequence:2,updatedAt:future})).status,400)
 assert.deepEqual(await (await call(a,'/'+accepted.id)).json(),accepted)
})


test('history returns INVALID_REQUEST for malformed JSON and keeps oversized bodies at 413',async()=>{
 const a=await h.signIn()
 const response=await call(a,'/'+randomUUID(),{method:'PUT',body:'{"version":'})
 assert.equal(response.status,400)
 assert.equal((await response.json()).error.code,'INVALID_REQUEST')
 const oversized=await call(a,'/'+randomUUID(),{method:'PUT',body:'{"title":"'+'a'.repeat(1048576)+'"}'})
 assert.equal(oversized.status,413)
 assert.equal((await oversized.json()).error.code,'REQUEST_TOO_LARGE')
})
