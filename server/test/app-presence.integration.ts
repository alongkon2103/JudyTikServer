import 'reflect-metadata';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/http/configure.js';
import { readConfig } from '../src/config/env.js';
import { PrismaService } from '../src/database/prisma.service.js';
import { CLOCK } from '../src/auth/clock.js';
import { authHarness } from './support/auth-flow.js';
const config = readConfig(process.env), db = new PrismaService(config), h = authHarness(db), owner = new Client({ connectionString: process.env.TEST_ADMIN_DATABASE_URL });
type Account = Awaited<ReturnType<typeof h.signIn>>;
let app: NestExpressApplication, base: string;
const call=(a:Account,path:string,method='GET',body?:unknown)=>fetch(base+'/v1'+path,{method,headers:{authorization:'Bearer '+a.tokens.access_token,'content-type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});
const start=(a:Account,id=randomUUID())=>call(a,'/me/app-presence','POST',{connectionId:id});
const count=async(a:Account)=>(await call(a,'/app-presence/count')).json();
before(async () => { await db.onModuleInit(); await owner.connect(); const module = await Test.createTestingModule({ imports: [AppModule.register({ ...config, auth: h.config })] }).overrideProvider(CLOCK).useValue(h.clock).compile(); app = configureApp(module.createNestApplication<NestExpressApplication>({ logger: false })); await app.listen(0, '127.0.0.1'); base = await app.getUrl(); });
after(async () => { await app?.close(); await db.onModuleDestroy(); await owner.end(); });

test('app count requires authentication and publishes only an aggregate',async()=>{assert.equal((await fetch(base+'/v1/app-presence/count')).status,401);const a=await h.signIn();const value=await count(a);assert.deepEqual(Object.keys(value).sort(),['count','refreshAfterMs','serverTime']);assert.equal(value.count,0)});
test('app presence deduplicates signed in accounts and expires after 150 seconds without any LIVE connection',async()=>{h.clock.advance(150001);const subject=randomUUID(),a=await h.signIn({subject}),same=await h.signIn({subject}),b=await h.signIn();for(const x of [a,same,b])assert.equal((await start(x)).status,200);assert.equal((await count(a)).count,2);h.clock.advance(150000);assert.equal((await count(a)).count,0)});
test('closed or expired leases cannot resurrect and cross-account writes are denied',async()=>{h.clock.advance(150001);const a=await h.signIn(),b=await h.signIn(),id=randomUUID();assert.equal((await start(a,id)).status,200);assert.equal((await call(b,'/me/app-presence/'+id,'PUT',{sequence:1})).status,404);h.clock.advance(1000);const lease=await(await call(a,'/me/app-presence/'+id,'PUT',{sequence:2})).json();h.clock.advance(1000);assert.deepEqual(await(await call(a,'/me/app-presence/'+id,'PUT',{sequence:1})).json(),lease);assert.equal((await call(a,'/me/app-presence/'+id,'DELETE')).status,204);assert.equal((await start(a,id)).status,409);assert.equal((await count(a)).count,0);const delayed=randomUUID();await call(a,'/me/app-presence/'+delayed,'DELETE');assert.equal((await start(a,delayed)).status,409);const fresh=randomUUID();await start(a,fresh);h.clock.advance(150001);assert.equal((await call(a,'/me/app-presence/'+fresh,'PUT',{sequence:3})).status,404)});
test('revocation, session expiry, disabled accounts and merges disappear immediately',async()=>{for(const mutation of ['revoked','expired','disabled','merged']){h.clock.advance(150001);const a=await h.signIn(),viewer=await h.signIn();await start(a);assert.equal((await count(viewer)).count,1);h.clock.advance(1000);if(mutation==='revoked')await owner.query('UPDATE judytik.sessions SET revoked_at=now() WHERE id=$1',[a.session.sessionId]);if(mutation==='expired')await owner.query('UPDATE judytik.sessions SET expires_at=$2 WHERE id=$1',[a.session.sessionId,h.clock.now()]);if(mutation==='disabled')await owner.query('UPDATE judytik.users SET disabled_at=now() WHERE id=$1',[a.session.userId]);if(mutation==='merged')await owner.query('UPDATE judytik.users SET merged_into_id=$2,merged_at=now() WHERE id=$1',[a.session.userId,viewer.session.userId]);assert.equal((await count(viewer)).count,0)}});
test('runtime role cannot read other account presence identities',async()=>{const a=await h.signIn(),b=await h.signIn();await start(a);const rows=await db.withUserContext(b.session.userId,tx=>tx.$queryRaw<any[]>`SELECT * FROM judytik.app_presences WHERE session_id=${a.session.sessionId}::uuid`);assert.equal(rows.length,0);await assert.rejects(()=>db.withUserContext(b.session.userId,tx=>tx.$executeRaw`INSERT INTO judytik.app_presences(session_id,connection_id,expires_at,last_seen_at) VALUES(${a.session.sessionId}::uuid,${randomUUID()}::uuid,now(),now())`));assert.equal((await db.client.$queryRaw<any[]>`SELECT * FROM judytik.app_presences`).length,0)});

test('all write endpoints require auth and reject caller supplied account fields',async()=>{for(const [path,method] of [['/me/app-presence','POST'],['/me/app-presence/'+randomUUID(),'PUT'],['/me/app-presence/'+randomUUID(),'DELETE']])assert.equal((await fetch(base+'/v1'+path,{method})).status,401);const a=await h.signIn();assert.equal((await call(a,'/me/app-presence','POST',{connectionId:randomUUID(),userId:randomUUID()})).status,400);const r=await owner.query("SELECT has_function_privilege('public','judytik.app_online_count(timestamptz)','EXECUTE') AS public_execute");assert.equal(r.rows[0].public_execute,false)});
