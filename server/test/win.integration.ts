import {grantTestPro} from './support/pro-account.js'
import 'reflect-metadata'
import {test,before,after} from 'node:test'
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {Test} from '@nestjs/testing'
import type {NestExpressApplication} from '@nestjs/platform-express'
import {AppModule} from '../src/app.module.js'
import {configureApp} from '../src/http/configure.js'
import {readConfig} from '../src/config/env.js'
import {PrismaService} from '../src/database/prisma.service.js'
import {CLOCK} from '../src/auth/clock.js'
import {authHarness} from './support/auth-flow.js'
const config=readConfig(process.env),db=new PrismaService(config),h=authHarness(db)
let app:NestExpressApplication,base:string,a:Awaited<ReturnType<typeof h.signIn>>,other:typeof a,same:typeof a
before(async()=>{await db.onModuleInit();const subject=randomUUID();a=await h.signIn({subject});same=await h.signIn({subject});other=await h.signIn();await grantTestPro(db,a.session.userId,h.clock);const module=await Test.createTestingModule({imports:[AppModule.register({...config,auth:h.config})]}).overrideProvider(CLOCK).useValue(h.clock).compile();app=configureApp(module.createNestApplication<NestExpressApplication>({logger:false}));await app.listen(0,'127.0.0.1');base=await app.getUrl()})
after(async()=>{await app?.close();await db.onModuleDestroy()})
const call=(options:RequestInit={},user:typeof a=a)=>fetch(base+'/v1/me/win',{...options,headers:{'content-type':'application/json',authorization:'Bearer '+user.tokens.access_token,...options.headers}})
test('WIN HTTP resource requires native auth, validates input and separates accounts',async()=>{
 assert.equal((await fetch(base+'/v1/me/win')).status,401)
 const initial=await call();assert.equal(initial.status,200);assert.equal(initial.headers.get('etag'),'"0"');const first=await initial.json();assert.equal(first.data.count,0)
 const changed={...first.data,count:7,rules:[{id:'rose',trigger:'gift',giftId:'5655',threshold:1,comment:'',effect:'win',delta:-1,enabled:true}]}
 assert.equal((await call({method:'PUT',headers:{'if-match':'"0"'},body:JSON.stringify(changed)})).status,200)
 assert.equal((await (await call({},same)).json()).data.count,7)
 assert.equal((await (await call({},other)).json()).data.count,0)
 assert.equal((await call({method:'PUT',headers:{'if-match':'"0"'},body:JSON.stringify(changed)})).status,412)
 assert.equal((await call({method:'PUT',headers:{'if-match':'"1"'},body:JSON.stringify({...changed,count:1.5})})).status,400)
 assert.equal((await call({method:'PUT',body:JSON.stringify(changed)})).status,428)
 const prefs=await fetch(base+'/v1/me/settings',{headers:{authorization:'Bearer '+a.tokens.access_token}});assert.equal(prefs.headers.get('etag'),'"0"')
})
test('WIN restricted database role exposes only the current account document',async()=>{
 const me=await (await fetch(base+'/v1/me',{headers:{authorization:'Bearer '+a.tokens.access_token}})).json()
 await db.withUserContext(me.id,async tx=>{const rows=await tx.$queryRaw<any[]>`SELECT user_id FROM judytik.win_workspaces`;assert.equal(rows.length,1);assert(rows.every(row=>row.user_id===me.id))})
})
