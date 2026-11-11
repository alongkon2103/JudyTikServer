import 'reflect-metadata';
import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import sharp from 'sharp';
import {Test} from '@nestjs/testing';
import type {NestExpressApplication} from '@nestjs/platform-express';
import {AppModule} from '../src/app.module.js';
import {GamesService} from '../src/games/service.js';
import {PrismaService} from '../src/database/prisma.service.js';
import {PresetsService} from '../src/presets/service.js';
import {configureApp} from '../src/http/configure.js';
import {readConfig} from '../src/config/env.js';
import {authHarness} from './support/auth-flow.js';
const config=readConfig(process.env),db=new PrismaService(config),service=new GamesService(db,new PresetsService(db),{require:async()=>{}} as any);
const source=JSON.parse(readFileSync(new URL('./fixtures/native-export.judytik.json',import.meta.url),'utf8')).preset;
let app:NestExpressApplication,base:string,cover:Buffer;
before(async()=>{await db.onModuleInit();cover=await sharp({create:{width:40,height:40,channels:3,background:'#dc1684'}}).webp().toBuffer();const m=await Test.createTestingModule({imports:[AppModule.register({...config,auth:authHarness(db).config})]}).compile();app=configureApp(m.createNestApplication<NestExpressApplication>({logger:false}));await app.listen(0,'127.0.0.1');base=await app.getUrl();});
after(async()=>{await app?.close();await db.onModuleDestroy();});
function native(payload=source){const f=new FormData();f.set('presetFile',new Blob([JSON.stringify({format:'judytik-actions-preset',version:1,preset:payload})]),'export.judytik.json');return f;}
function req(path:string,method='GET',body?:unknown,revision?:string){return fetch(base+'/v1'+path,{method,headers:{authorization:'Bearer '+config.adminApiKey,...(body instanceof FormData?{}:{'content-type':'application/json'}),...(revision?{'if-match':'"'+revision+'"'}:{})},...(body===undefined?{}:{body:body instanceof FormData?body:JSON.stringify(body)})});}
test('Admin can list, read, edit metadata, replace files/covers, add presets and archive with retained history',async()=>{
 const slug='manage-'+randomUUID(),original=await service.importFile({slug,name:slug,description:'Original',platform:'pc',categoryId:null,status:'published'},source,cover,base,randomUUID());
 const gameId=original.game.id,presetId=original.preset.id;
 let response=await req('/admin/games?q='+slug+'&page=1&pageSize=1');assert.equal(response.status,200);let page=await response.json();assert.equal(page.total,1);assert.equal(page.items[0].id,gameId);
 assert.equal((await req('/admin/games/'+gameId)).status,200);assert.equal((await req('/admin/games/'+gameId+'/presets/'+presetId)).status,200);
 const gameWrite={slug,name:slug,description:'Edited',categoryId:null,platform:'pc',coverUrl:original.game.coverUrl,url:null,status:'published',sortOrder:0,metadata:{admin:true}};
 response=await req('/admin/games/'+gameId,'PUT',gameWrite);assert.equal(response.status,428);
 response=await req('/admin/games/'+gameId,'PUT',gameWrite,'1');assert.equal(response.status,200);assert.equal(response.headers.get('etag'),'"2"');
 const replacement={...source,name:'New export',actions:source.actions.map((r:any)=>({...r,effects:[{kind:'keyboard',keys:['B']}]}))};
 response=await req(`/admin/games/${gameId}/presets/${presetId}/file`,'PUT',native(replacement),'1');assert.equal(response.status,200);const replaced=await response.json();assert.equal(replaced.preset.id,presetId);assert.equal(replaced.preset.slug,'default');assert.equal(replaced.preset.name,original.preset.name);assert.equal(replaced.preset.isDefault,true);assert.equal(replaced.preset.version,2);assert.deepEqual(replaced.preset.payload,replacement);
 assert.equal((await req(`/admin/games/${gameId}/presets/${presetId}/file`,'PUT',native(source),'1')).status,412);
 const extra=native();extra.set('slug','secondary');extra.set('presetName','ชุดเสริม');response=await req(`/admin/games/${gameId}/presets/import`,'POST',extra);assert.equal(response.status,201);const added=await response.json();assert.equal(added.preset.status,'draft');assert.equal(added.preset.name,'ชุดเสริม');
 const newImage=await sharp({create:{width:30,height:60,channels:3,background:'#0088ee'}}).png().toBuffer(),upload=new FormData();upload.set('coverFile',new Blob([new Uint8Array(newImage)]),'new.png');
 response=await req('/admin/games/'+gameId+'/cover','PUT',upload,'2');assert.equal(response.status,200);assert.equal(response.headers.get('etag'),'"3"');assert.equal((await sharp(await service.cover(gameId)).metadata()).height,60);
 assert.equal((await req('/admin/games/'+gameId+'/cover','PUT',upload,'2')).status,412);
 response=await req(`/admin/games/${gameId}/presets/${presetId}`,'DELETE',undefined,'2');assert.equal(response.status,200);assert.equal((await response.json()).status,'archived');assert.equal((await service.versions(gameId,presetId)).items.length,3);
 response=await req('/admin/games/'+gameId,'DELETE',undefined,'3');assert.equal(response.status,200);assert.equal((await response.json()).revision,'4');assert.equal((await fetch(base+'/v1/games/'+gameId)).status,404);assert.equal((await fetch(base+'/v1/games/'+gameId+'/cover')).status,404);
 page=await (await req('/admin/games?status=archived&q='+slug)).json();assert.equal(page.items[0].id,gameId);
 assert.equal((await req(`/admin/games/${gameId}/presets`)).status,200);assert.equal((await req(`/admin/games/${gameId}/cover`)).status,200);
});
test('cover replacement rolls back bytes and game revision if its audit insert fails',async()=>{
 const value=await service.importFile({slug:'cover-rollback-'+randomUUID(),name:'G',description:'',platform:'pc',categoryId:null,status:'published'},source,cover,base,randomUUID());
 const failingDb={client:{$transaction:(run:any)=>db.client.$transaction(tx=>run(new Proxy(tx,{get(target,key){if(key==='auditEvent')return{create:async()=>{throw Error('Injected audit failure');}};return Reflect.get(target,key);}})))}};
 const failing=new GamesService(failingDb as any,new PresetsService(db),{require:async()=>{}} as any);
 await assert.rejects(failing.replaceCover(value.game.id,Buffer.from('different'),'"1"',base,randomUUID()),/Injected audit failure/);
 assert.equal((await service.get(value.game.id,true)).revision,'1');assert.deepEqual(await service.cover(value.game.id,true),cover);
});
test('concurrent preset replacements retain metadata and permit only one revision winner',async()=>{
 const created=await service.importFile({slug:'preset-cas-'+randomUUID(),name:'G',description:'',platform:'pc',categoryId:null,status:'published'},source,cover,base,randomUUID());
 const attempts=await Promise.allSettled(['First','Second'].map(name=>service.replacePresetFile(created.game.id,created.preset.id,{...source,name},undefined,'"1"',randomUUID())));
 assert.equal(attempts.filter(x=>x.status==='fulfilled').length,1);assert.equal(attempts.filter(x=>x.status==='rejected'&&x.reason.code==='GAME_VERSION_CONFLICT').length,1);
 const current=await service.preset(created.game.id,created.preset.id,true);assert.equal(current.version,2);assert.equal(current.name,created.preset.name);assert.equal(current.isDefault,true);assert.equal((await service.versions(created.game.id,current.id)).items.length,2);
});
test('cover data grant permits replacement but forbids reassignment and creation-time changes',async()=>{
 const created=await service.importFile({slug:'cover-grant-'+randomUUID(),name:'G',description:'',platform:'pc',categoryId:null,status:'published'},source,cover,base,randomUUID());
 await assert.rejects(db.client.$executeRaw`UPDATE judytik.game_covers SET created_at=created_at WHERE game_id=${created.game.id}::uuid`,/permission denied for table game_covers/);
 await assert.rejects(db.client.$executeRaw`UPDATE judytik.game_covers SET game_id=game_id WHERE game_id=${created.game.id}::uuid`,/permission denied for table game_covers/);
 assert.equal((await service.get(created.game.id,true)).revision,'1');
});
