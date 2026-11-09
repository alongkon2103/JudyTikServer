import 'reflect-metadata'
import {test,before,after} from 'node:test'
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {Client} from 'pg'
import {readConfig} from '../src/config/env.js'
import {PrismaService} from '../src/database/prisma.service.js'
import {AdminUsersService} from '../src/accounts/admin.service.js'
import {TestClock} from './support/auth-fixture.js'
import {Test} from '@nestjs/testing'
import type {NestExpressApplication} from '@nestjs/platform-express'
import {AppModule} from '../src/app.module.js'
import {CLOCK} from '../src/auth/clock.js'
import {configureApp} from '../src/http/configure.js'
import {authHarness} from './support/auth-flow.js'

const config=readConfig(process.env),db=new PrismaService(config),owner=new Client({connectionString:process.env.TEST_ADMIN_DATABASE_URL})
const clock=new TestClock(new Date('2026-11-09T03:00:00.000Z')),service=new AdminUsersService(db,clock)
const prefix='list-'+randomUUID(),ids:string[]=[],DAY=86400000
const names=['free','active','expired','revoked','scheduled','boundary','disabled','merged']
let app:NestExpressApplication,base:string
before(async()=>{
 await db.onModuleInit();await owner.connect()
 for(const name of names){const id=randomUUID();ids.push(id);await owner.query('INSERT INTO judytik.users(id,display_name,created_at) VALUES($1,$2,$3)',[id,name,clock.now()]);await owner.query('INSERT INTO judytik.user_emails(user_id,email_key,verified_at) VALUES($1,$2,$3)',[id,`${prefix}-${name}@example.invalid`,clock.now()])}
 for(const [index,start,end,revoked] of [[1,-DAY,30*DAY,null],[2,-DAY,-1,null],[3,-DAY,30*DAY,0],[4,DAY,30*DAY,null],[5,-DAY,0,null],[6,-DAY,30*DAY,null]] as const){await owner.query("INSERT INTO judytik.entitlement_grants(user_id,plan,starts_at,ends_at,revoked_at) VALUES($1,'PRO',$2,$3,$4)",[ids[index],new Date(+clock.now()+start),new Date(+clock.now()+end),revoked===null?null:clock.now()])}
 await owner.query('UPDATE judytik.users SET disabled_at=$2 WHERE id=$1',[ids[6],clock.now()])
 await owner.query('UPDATE judytik.users SET merged_into_id=$2,merged_at=$3 WHERE id=$1',[ids[7],ids[0],clock.now()])
 const module=await Test.createTestingModule({imports:[AppModule.register({...config,auth:authHarness(db).config})]}).overrideProvider(CLOCK).useValue(clock).compile()
 app=configureApp(module.createNestApplication<NestExpressApplication>({logger:false}));await app.listen(0,'127.0.0.1');base=await app.getUrl()
})
after(async()=>{await app?.close();await db.onModuleDestroy();await owner.end()})

test('Database-backed Admin HTTP listing returns real filtered accounts and rejects unauthenticated requests',async()=>{
 const url=base+'/v1/admin/users?'+new URLSearchParams({email:prefix,plan:'PRO',page:'1',pageSize:'1'})
 assert.equal((await fetch(url)).status,401)
 const response=await fetch(url,{headers:{authorization:'Bearer '+config.adminApiKey}})
 assert.equal(response.status,200);const page=await response.json();assert.equal(page.total,2);assert.equal(page.totalPages,2);assert.equal(page.items.length,1);assert.equal(page.items[0].entitlement.plan,'PRO')
})

test('Database list matches current entitlement rules at exact expiry, revoked and future grants',async()=>{
 const pro=await service.list({email:prefix,plan:'PRO'});assert.equal(pro.total,2);assert.deepEqual(new Set(pro.items.map(row=>row.displayName)),new Set(['active','disabled']));assert(pro.items.every(row=>row.entitlement.plan==='PRO'))
 const free=await service.list({email:prefix,plan:'FREE'});assert.equal(free.total,5);assert.deepEqual(new Set(free.items.map(row=>row.displayName)),new Set(['free','expired','revoked','scheduled','boundary']));assert(free.items.every(row=>row.entitlement.plan==='FREE'))
 const all=await service.list({email:prefix});assert.equal(all.total,7);assert(!all.items.some(row=>row.displayName==='merged'));assert(all.items.some(row=>row.disabledAt!==null))
 clock.advance(31*DAY);const expired=await service.list({email:prefix,plan:'PRO'});assert.equal(expired.total,0)
 clock.advance(-31*DAY)
})

test('Database email matching is literal and case-insensitive, plus email-less users remain visible',async()=>{
 const id=randomUUID();await owner.query('INSERT INTO judytik.users(id,display_name) VALUES($1,$2)',[id,'Literal search'])
 const email=`${prefix}_+%literal@example.invalid`;await owner.query('INSERT INTO judytik.user_emails(user_id,email_key,verified_at) VALUES($1,$2,$3)',[id,email,clock.now()])
 const match=await service.list({email:`${prefix.toUpperCase()}_+%LITERAL`});assert.equal(match.total,1);assert.equal(match.items[0].userId,id)
 assert.equal((await service.list({email:prefix+'X+Xliteral'})).total,0)
 const empty=randomUUID();await owner.query('INSERT INTO judytik.users(id,display_name,created_at) VALUES($1,$2,$3)',[empty,'No email',new Date('2090-01-01T00:00:00Z')]);const all=await service.list({pageSize:'100'});const row=all.items.find(row=>row.userId===empty);assert(row);assert.equal(row.email,null)
 await owner.query('DELETE FROM judytik.users WHERE id=ANY($1::uuid[])',[[id,empty]])
})

test('Database pages are stable across equal createdAt timestamps and return filtered total',async()=>{
 const seen:string[]=[]
 for(let page=1;page<=4;page++){const result=await service.list({email:prefix,page:String(page),pageSize:'2'});assert.equal(result.total,7);assert.equal(result.totalPages,4);seen.push(...result.items.map(row=>row.userId))}
 assert.equal(new Set(seen).size,7);assert.deepEqual(seen,[...seen].sort().reverse())
 const beyond=await service.list({email:prefix,page:'5',pageSize:'2'});assert.deepEqual(beyond.items,[]);assert.equal(beyond.total,7)
})
