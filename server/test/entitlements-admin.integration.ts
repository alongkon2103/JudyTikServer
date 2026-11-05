import 'reflect-metadata'
import {test,before,after} from 'node:test'
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {Client} from 'pg'
import {Test} from '@nestjs/testing'
import type {NestExpressApplication} from '@nestjs/platform-express'
import {AppModule} from '../src/app.module.js'
import {configureApp} from '../src/http/configure.js'
import {readConfig} from '../src/config/env.js'
import {PrismaService} from '../src/database/prisma.service.js'
import {CLOCK} from '../src/auth/clock.js'
import {EntitlementsAdminService} from '../src/entitlements/admin.service.js'
import {EntitlementsService} from '../src/entitlements/entitlements.service.js'
import {authHarness} from './support/auth-flow.js'
const config=readConfig(process.env),db=new PrismaService(config),h=authHarness(db),service=new EntitlementsAdminService(db,h.clock),native=new EntitlementsService(db,h.clock)
const owner=new Client({connectionString:process.env.TEST_ADMIN_DATABASE_URL}),DAY=86400000
const meta={source:'integration-admin',reason:'Acceptance test'}
let app:NestExpressApplication,base:string
before(async()=>{
 await db.onModuleInit();await owner.connect()
 const module=await Test.createTestingModule({imports:[AppModule.register({...config,auth:h.config})]}).overrideProvider(CLOCK).useValue(h.clock).compile()
 app=configureApp(module.createNestApplication<NestExpressApplication>({logger:false}));await app.listen(0,'127.0.0.1');base=await app.getUrl()
})
after(async()=>{await app?.close();await db.onModuleDestroy();await owner.end()})
const mutate=(op:'adjust'|'set-expiry'|'revoke',body:unknown,key=randomUUID())=>service.mutate(op,body,key,randomUUID())
test('runtime timestamps use UTC even when the Windows database defaults to a local timezone',async()=>{
 const rows=await db.client.$queryRaw<{zone:string}[]>`SELECT current_setting('TimeZone') AS zone`
 assert.equal(rows[0].zone,'UTC')
})
test('admin adds, subtracts, sets and revokes; desktop reads the same authority with no new login',async()=>{
 const a=await h.signIn(),userId=a.session.userId,now=+h.clock.now()
 assert.equal((await service.get({userId})).entitlement.plan,'FREE')
 const add=await mutate('adjust',{userId,...meta,days:7});assert.equal((add.entitlement as any).expiresAt,new Date(now+7*DAY).toISOString())
 assert.equal((await native.get(a.session)).plan,'PRO')
 const more=await mutate('adjust',{userId,...meta,days:30});assert.equal((more.entitlement as any).expiresAt,new Date(now+37*DAY).toISOString())
 const less=await mutate('adjust',{userId,...meta,days:-7});assert.equal((less.entitlement as any).expiresAt,new Date(now+30*DAY).toISOString())
 const expiresAt=new Date(now+12*DAY).toISOString();await mutate('set-expiry',{userId,...meta,expiresAt});assert.equal((await native.get(a.session)).expiresAt,expiresAt)
 await mutate('revoke',{userId,...meta});assert.equal((await native.get(a.session)).plan,'FREE')
 await assert.rejects(mutate('adjust',{userId,...meta,days:-1}),/ENTITLEMENT_NOT_ACTIVE/)
 assert.equal((await service.history({userId})).items.length,5)
})
test('concurrent top-ups accumulate and persistent idempotency never double adds or crosses users',async()=>{
 const a=await h.signIn(),b=await h.signIn(),userId=a.session.userId,key=randomUUID(),body={userId,...meta,days:1}
 const same=await Promise.all([mutate('adjust',body,key),mutate('adjust',body,key),mutate('adjust',body,key)])
 assert.equal(same.filter(r=>!r.replayed).length,1);assert.equal(new Set(same.map(r=>r.operation.id)).size,1)
 await Promise.all(Array.from({length:6},()=>mutate('adjust',body)))
 assert.equal((await native.get(a.session)).expiresAt,new Date(+h.clock.now()+7*DAY).toISOString())
 const restarted=new EntitlementsAdminService(db,h.clock);assert.equal((await restarted.mutate('adjust',body,key,randomUUID())).replayed,true)
 await assert.rejects(mutate('adjust',{...body,days:2},key),/IDEMPOTENCY_KEY_CONFLICT/)
 await assert.rejects(mutate('adjust',{...body,userId:b.session.userId},key),/IDEMPOTENCY_KEY_CONFLICT/)
 assert.equal((await native.get(b.session)).plan,'FREE')
 assert.equal(await db.client.entitlementOperation.count({where:{userId}}),7)
})
test('expiry boundary downgrades to FREE and revocation also cancels future scheduled grants',async()=>{
 const a=await h.signIn(),userId=a.session.userId,now=h.clock.now()
 await owner.query(`INSERT INTO judytik.entitlement_grants(user_id,plan,starts_at,ends_at) VALUES($1,'PRO',$2,$3)`,[userId,new Date(+now+DAY),new Date(+now+30*DAY)])
 await mutate('set-expiry',{userId,...meta,expiresAt:new Date(+now+DAY).toISOString()})
 await mutate('adjust',{userId,...meta,days:-7});assert.equal((await native.get(a.session)).plan,'FREE')
 await mutate('adjust',{userId,...meta,days:1});await mutate('revoke',{userId,...meta});h.clock.advance(2*DAY)
 assert.equal((await native.get(a.session)).plan,'FREE')
 assert.equal(await db.client.entitlementGrant.count({where:{userId,revokedAt:null}}),0)
 await mutate('adjust',{userId,...meta,days:1});h.clock.advance(DAY)
 assert.equal((await native.get(a.session)).state,'expired')
})
test('verified email lookup, bounded history cursor, unknown and disabled accounts',async()=>{
 const email=randomUUID()+'@example.invalid',a=await h.signIn({email,verified:true}),userId=a.session.userId
 const first=await mutate('adjust',{email:email.toUpperCase(),...meta,days:1});assert.equal(first.operation.userId,userId)
 await mutate('adjust',{userId,...meta,days:1});await mutate('adjust',{userId,...meta,days:1})
 const page=await service.history({email,limit:'2'});assert.equal(page.items.length,2);assert.ok(page.nextCursor)
 const rest=await service.history({userId,limit:'2',before:page.nextCursor});assert.equal(rest.items.length,1);assert.equal(rest.nextCursor,null)
 assert.equal(new Set([...page.items,...rest.items].map(r=>r.id)).size,3)
 await assert.rejects(service.get({email:randomUUID()+'@example.invalid'}),/ENTITLEMENT_USER_NOT_FOUND/)
 const other=await h.signIn();await assert.rejects(service.history({userId:other.session.userId,before:page.nextCursor}),/INVALID_CURSOR/)
 await owner.query(`UPDATE judytik.users SET disabled_at=now() WHERE id=$1`,[userId]);await assert.rejects(mutate('revoke',{userId,...meta}),/ENTITLEMENT_USER_DISABLED/)
 assert.equal((await service.history({userId})).items.length,3,'admin can still inspect a disabled account')
})
test('history is append-only and audit failure rolls the entire entitlement mutation back',async()=>{
 const a=await h.signIn(),userId=a.session.userId,key=randomUUID()
 await mutate('adjust',{userId,...meta,days:1})
 await assert.rejects(db.client.entitlementOperation.deleteMany({where:{userId}}))
 await assert.rejects(db.client.entitlementOperation.updateMany({where:{userId},data:{reason:'overwrite'}}))
 await owner.query(`CREATE FUNCTION judytik.test_entitlement_audit_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.event_name LIKE 'entitlement.%' THEN RAISE EXCEPTION 'test audit failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER test_entitlement_audit_fail BEFORE INSERT ON judytik.audit_events FOR EACH ROW EXECUTE FUNCTION judytik.test_entitlement_audit_fail()`)
 const prior=await native.get(a.session)
 try{await assert.rejects(mutate('adjust',{userId,...meta,days:1},key))}finally{await owner.query(`DROP TRIGGER test_entitlement_audit_fail ON judytik.audit_events; DROP FUNCTION judytik.test_entitlement_audit_fail()`)}
 assert.deepEqual(await native.get(a.session),prior);assert.equal(await db.client.entitlementOperation.count({where:{idempotencyKey:key}}),0)
})
test('HTTP endpoints accept only admin auth, require idempotency, validate bodies, and return error envelopes',async()=>{
 const a=await h.signIn(),userId=a.session.userId,body={userId,...meta,days:1}
 const request=(route:string,options:RequestInit={},authorization='Bearer '+config.adminApiKey)=>fetch(base+'/v1/admin/entitlements'+route,{...options,headers:{'content-type':'application/json',...(authorization?{authorization}:{}),...options.headers}})
 for(const auth of ['', 'Bearer invalid','Bearer '+a.tokens.access_token])assert.equal((await request('?userId='+userId,{},auth)).status,401)
 assert.equal((await request('/adjust',{method:'POST',body:JSON.stringify(body)})).status,428)
 assert.equal((await request('/adjust',{method:'POST',headers:{'Idempotency-Key':randomUUID()},body:JSON.stringify({...body,days:0})})).status,400)
 const key=randomUUID(),options={method:'POST',headers:{'Idempotency-Key':key},body:JSON.stringify(body)}
 const first=await request('/adjust',options);assert.equal(first.status,200);const result=await first.json();assert.equal(result.replayed,false);assert.ok(result.operation.requestId)
 assert.equal((await(await request('/adjust',options)).json()).replayed,true)
 const conflict=await request('/adjust',{...options,body:JSON.stringify({...body,days:2})});assert.equal(conflict.status,409);assert.equal((await conflict.json()).error.code,'IDEMPOTENCY_KEY_CONFLICT')
 const current=await request('?userId='+userId);assert.equal(current.status,200);assert.equal((await current.json()).entitlement.plan,'PRO')
 const history=await request('/history?userId='+userId);assert.equal((await history.json()).items.length,1)
})
