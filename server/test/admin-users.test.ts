import 'reflect-metadata'
import {test} from 'node:test'
import assert from 'node:assert/strict'
import {Test} from '@nestjs/testing'
import type {NestExpressApplication} from '@nestjs/platform-express'
import {parseAdminUsersQuery} from '../src/accounts/admin.contracts.js'
import {AdminUsersService} from '../src/accounts/admin.service.js'
import {AdminUsersController} from '../src/accounts/admin.controller.js'
import {AdminGuard} from '../src/http/admin.guard.js'
import {CONFIG} from '../src/config/env.js'
import {configureApp} from '../src/http/configure.js'

test('Admin user listing validates bounded pagination and literal partial email search',()=>{
 assert.deepEqual(parseAdminUsersQuery({}),{page:1,pageSize:25})
 assert.deepEqual(parseAdminUsersQuery({email:' Creator+live@EXAMPLE ',plan:'PRO',page:'2',pageSize:'100'}),{email:'creator+live@example',plan:'PRO',page:2,pageSize:100})
 for(const query of [{page:'0'},{page:'-1'},{page:'1.5'},{page:'1000001'},{page:'Infinity'},{pageSize:'101'},{pageSize:'0'},{page:['1','2']},{email:['a','b']},{plan:'free'},{email:'a'.repeat(255)},{email:'a\nb'},{online:'true'},{unexpected:'x'}])assert.throws(()=>parseAdminUsersQuery(query),/INVALID_REQUEST/)
})

test('Admin list filters canonical users with one clock and transaction, pages deterministically and limits its DTO',async()=>{
 const now=new Date('2026-11-09T03:00:00.000Z'),calls:any[]=[];let clockCalls=0
 const rows=[{id:'93ced232-99b5-43a4-9f05-cb0296778e54',displayName:'Creator',avatarUrl:null,createdAt:now,disabledAt:null,email:{emailKey:'creator@example.com'},identities:[{provider:'google',providerSubject:'secret'},{provider:'discord',providerSubject:'hidden'},{provider:'google'}],entitlements:[{endsAt:new Date(+now+30*86400000)}],sessions:[{id:'not-returned'}],passwordHash:'never-returned'},
 {id:'9405b269-a386-41ea-abed-e4f67c2b1d25',displayName:'No Email',avatarUrl:null,createdAt:now,disabledAt:now,email:null,identities:[],entitlements:[{endsAt:now}]}]
 const tx={user:{count:async(input:any)=>{calls.push(['count',input]);return 4},findMany:async(input:any)=>{calls.push(['rows',input]);return rows}}}
 const db={client:{$transaction:async(fn:any,options:any)=>{calls.push(['transaction',options]);return fn(tx)}}}
 const service=new AdminUsersService(db as any,{now:()=>{clockCalls++;return now}})
 const result=await service.list({email:'Creator_+%\\',plan:'PRO',page:'2',pageSize:'2'})
 assert.equal(clockCalls,1);assert.deepEqual(calls[0][1],{isolationLevel:'RepeatableRead'})
 const count=calls.find(c=>c[0]==='count')[1],page=calls.find(c=>c[0]==='rows')[1]
 assert.deepEqual(count.where,page.where);assert.equal(count.where.mergedIntoId,null)
 assert.deepEqual(count.where.email,{is:{emailKey:{contains:'creator\\_+\\%\\\\',mode:'insensitive'}}})
 assert.deepEqual(count.where.entitlements,{some:{plan:'PRO',revokedAt:null,startsAt:{lte:now},endsAt:{gt:now}}})
 assert.deepEqual(page.orderBy,[{createdAt:'desc'},{id:'desc'}]);assert.equal(page.skip,2);assert.equal(page.take,2)
 assert(!('include'in page));assert(!('sessions'in page.select));assert.deepEqual(page.select.identities,{select:{provider:true}})
 assert.deepEqual({page:result.page,pageSize:result.pageSize,total:result.total,totalPages:result.totalPages},{page:2,pageSize:2,total:4,totalPages:2})
 assert.equal(result.serverTime,now.toISOString());assert.equal(result.items[0].userId,rows[0].id);assert.equal(result.items[0].email,'creator@example.com')
 assert.deepEqual(result.items[0].providers,['google','discord']);assert.equal(result.items[0].entitlement.plan,'PRO')
 assert.equal(result.items[1].email,null);assert.equal(result.items[1].entitlement.state,'expired');assert.equal(result.items[1].disabledAt,now.toISOString())
 assert(!/passwordHash|providerSubject|sessions|secret|not-returned/.test(JSON.stringify(result)))
})

test('FREE filtering excludes active grants, keeps email-less accounts and supports empty/out-of-range pages',async()=>{
 const now=new Date('2026-11-09T03:00:00.000Z'),queries:any[]=[]
 const tx={user:{count:async({where}:any)=>{queries.push(where);return 0},findMany:async({where}:any)=>{queries.push(where);return []}}}
 const service=new AdminUsersService({client:{$transaction:async(fn:any)=>fn(tx)}} as any,{now:()=>now})
 const result=await service.list({plan:'FREE',page:'999',pageSize:'100'})
 assert.deepEqual(queries[0],{mergedIntoId:null,entitlements:{none:{plan:'PRO',revokedAt:null,startsAt:{lte:now},endsAt:{gt:now}}}})
 assert.deepEqual(result.items,[]);assert.equal(result.total,0);assert.equal(result.totalPages,0);assert.equal(result.page,999)
 await service.list({});assert.deepEqual(queries[2],{mergedIntoId:null})
})

test('Admin user HTTP route requires service key, forwards validated queries and uses error envelopes',async()=>{
 const key='a'.repeat(43),calls:any[]=[]
 const module=await Test.createTestingModule({controllers:[AdminUsersController],providers:[AdminGuard,{provide:CONFIG,useValue:{adminApiKey:key}},{provide:AdminUsersService,useValue:{list:async(query:unknown)=>{const parsed=parseAdminUsersQuery(query);calls.push(parsed);return{items:[],page:parsed.page,pageSize:parsed.pageSize,total:0,totalPages:0,serverTime:'2026-11-09T03:00:00.000Z'}}}}]}).compile()
 const app=configureApp(module.createNestApplication<NestExpressApplication>({logger:false}));await app.listen(0,'127.0.0.1')
 try{
  const base=await app.getUrl(),get=(query='',token?:string)=>fetch(base+'/v1/admin/users'+query,{headers:token?{authorization:'Bearer '+token}:{}})
  for(const token of [undefined,'user-session','b'.repeat(43)]){const r=await get('',token);assert.equal(r.status,401);assert.equal((await r.json()).error.code,'ADMIN_UNAUTHORIZED')}
  assert.equal(calls.length,0)
  const r=await get('?email=creator%2Blive%40example&plan=FREE&page=2&pageSize=10',key)
  assert.equal(r.status,200);assert.equal(r.headers.get('cache-control'),'no-store');assert.equal((await r.json()).page,2)
  assert.deepEqual(calls[0],{email:'creator+live@example',plan:'FREE',page:2,pageSize:10})
  const bad=await get('?plan=GOLD',key);assert.equal(bad.status,400);const error=(await bad.json()).error;assert.equal(error.code,'INVALID_REQUEST');assert(error.requestId)
 }finally{await app.close()}
})
