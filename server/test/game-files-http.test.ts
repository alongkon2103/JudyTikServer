import 'reflect-metadata';
import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import sharp from 'sharp';
import {Test} from '@nestjs/testing';
import type {NestExpressApplication} from '@nestjs/platform-express';
import {GameFilesController} from '../src/games/files.controller.js';
import {GamesService} from '../src/games/service.js';
import {AdminGuard} from '../src/http/admin.guard.js';
import {configureApp} from '../src/http/configure.js';
import {CONFIG} from '../src/config/env.js';
const key='x'.repeat(43), calls:any[]=[];
const file=readFileSync(new URL('./fixtures/native-export.judytik.json',import.meta.url));
let image:Buffer,app:NestExpressApplication,base:string;
before(async()=>{
 image=await sharp({create:{width:80,height:40,channels:4,background:'#dc1684'}}).png().toBuffer();
 const m=await Test.createTestingModule({controllers:[GameFilesController],providers:[AdminGuard,{provide:CONFIG,useValue:{adminApiKey:key,apiOrigin:'https://api.example.invalid'}},{provide:GamesService,useValue:{async importFile(...args:any[]){calls.push(args);return {game:{id:'example',revision:'1'},preset:{revision:'1'},warnings:[]};}}}]}).compile();
 app=configureApp(m.createNestApplication<NestExpressApplication>({logger:false}));await app.listen(0,'127.0.0.1');base=await app.getUrl();
});
after(async()=>app?.close());
function form(fields:Record<string,string>={slug:'test-game',name:'เกมทดสอบ'},preset:Buffer|null=file,cover:Buffer|null=image) {
 const body=new FormData();for(const [k,v] of Object.entries(fields))body.append(k,v);
 if(preset)body.append('presetFile',new Blob([new Uint8Array(preset)]),'game.judytik.json');
 if(cover)body.append('coverFile',new Blob([new Uint8Array(cover)],{type:'image/png'}),'cover.png');
 return body;
}
async function send(body:FormData,token=key){return fetch(base+'/v1/admin/games/import',{method:'POST',headers:token?{authorization:'Bearer '+token}:{},body});}
test('requires admin key, accepts real multipart upload and normalizes cover before saving',async()=>{
 assert.equal((await send(form(),'')).status,401);
 const r=await send(form());assert.equal(r.status,201);assert.equal(r.headers.get('etag'),'"1"');assert.equal(calls.length,1);
 assert.equal(calls[0][0].status,'draft');assert.equal(calls[0][1].name,'เกมทดสอบ');
 assert.equal((await sharp(calls[0][2]).metadata()).format,'webp');assert.equal(calls[0][3],'https://api.example.invalid');
});
test('rejects missing, extra, malformed and oversized file parts without saving',async()=>{
 const count=calls.length;
 const cases:[FormData,number,string][]=[
  [form(undefined,null),400,'PRESET_FILE_REQUIRED'],[form(undefined,file,null),400,'GAME_COVER_REQUIRED'],
  [form({slug:'bad slug',name:'G'}),400,'INVALID_REQUEST'],[form(undefined,Buffer.from('{}')),400,'PRESET_FILE_INVALID'],
  [form(undefined,file,Buffer.from('not-image')),400,'GAME_COVER_INVALID'],
  [form(undefined,Buffer.alloc(1048577)),413,'PRESET_FILE_TOO_LARGE'],[form(undefined,file,Buffer.alloc(2097153)),413,'REQUEST_TOO_LARGE'],
 ];
 for(const [f,status,code] of cases){const r=await send(f);assert.equal(r.status,status);assert.equal((await r.json()).error.code,code);}
 const extra=form();extra.append('otherFile',new Blob(['x']),'other.txt');assert.equal((await send(extra)).status,400);
 const duplicate=form();duplicate.append('slug','different');assert.equal((await send(duplicate)).status,400);
 assert.equal(calls.length,count);
});
