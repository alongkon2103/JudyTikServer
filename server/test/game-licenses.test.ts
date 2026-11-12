import {test} from 'node:test';import assert from 'node:assert/strict';
import {ShopLicenseClient,GameLicensesService} from '../src/games/licenses.js';
const email='buyer@example.com',shop={baseUrl:'https://shop.example.com',serviceKey:'k'.repeat(40)};
const response=(licenses:any[]=[])=>({schemaVersion:1,email,customerId:'customer-1',licenses,serverTime:'2026-11-11T00:00:00.000Z'});
const license=(gameSlug='judy-run',status='active',expiresAt:any=null)=>({gameSlug,status,expiresAt});
test('shop lookup coalesces concurrent requests, caches for 60s, resets after expiry and normalizes verified email',async()=>{let now=0,calls=0;const client=new ShopLicenseClient(shop,()=>now,async(_url:any,options:any)=>{calls++;assert.equal(JSON.parse(options.body).email,email);assert.equal(options.redirect,'error');return Response.json(response([license()]));});const values=await Promise.all([client.lookup(' Buyer@example.com '),client.lookup(email)]);assert.equal(calls,1);assert.deepEqual(values[0],values[1]);await client.lookup(email);assert.equal(calls,1);now=60000;await client.lookup(email);assert.equal(calls,2)});
test('shop refuses mismatched identity, duplicate slugs, malformed status/date and oversized payloads',async()=>{for(const body of [{...response(),email:'other@example.com'},response([license(),license()]),response([license('judy-run','pending')]),response([license('judy-run','active','bad-date')]),{...response([license()]),customerId:null}]){const c=new ShopLicenseClient(shop,Date.now,async()=>Response.json(body));await assert.rejects(()=>c.lookup(email),{code:'GAME_LICENSE_UNAVAILABLE'})}});
test('shop failure is not cached as no ownership; rate limiting honors cooldown without repeated fetch',async()=>{let calls=0,now=0;const c=new ShopLicenseClient(shop,()=>now,async()=>{calls++;return new Response('',{status:429,headers:{'Retry-After':'60'}})});await assert.rejects(()=>c.lookup(email),{code:'GAME_LICENSE_UNAVAILABLE'});await assert.rejects(()=>c.lookup(email));assert.equal(calls,1);now=60001;await assert.rejects(()=>c.lookup(email));assert.equal(calls,2);const absent=new ShopLicenseClient(undefined);await assert.rejects(()=>absent.lookup(email),{code:'GAME_LICENSE_UNAVAILABLE'})});
test('all signed-in accounts can use game presets without checking email, shop availability or purchases',async()=>{
 let reads=0;const db:any={client:{userEmail:{findUnique:async()=>{throw Error('Email must not be checked')}},game:{findMany:async(query:any)=>{
  reads++;assert.equal(query.where.status,'published');assert.deepEqual(query.where.OR,[{categoryId:null},{category:{status:'active'}}]);return [{slug:'judy-clean'},{slug:'judy-run'}]
 }}}}
 const service=new GameLicensesService(db,{shop} as any,{now:()=>new Date('2026-11-13T00:00:00.000Z')})
 service.client={lookup:async()=>{throw Error('Shop must not be called')}} as any
 const actor:any={userId:'owner'}
 for(const slug of ['judy-clean','expired','revoked','not-bought'])await service.require(actor,slug)
 await assert.rejects(()=>service.require(undefined,'judy-clean'),{code:'AUTH_UNAUTHORIZED'})
 const snapshot=await service.snapshot(actor)
 assert.equal(snapshot.state,'ready');assert.deepEqual(snapshot.licenses,[license('judy-clean'),license('judy-run')]);assert.equal(reads,1)
})
