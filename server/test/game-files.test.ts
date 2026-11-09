import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import sharp from 'sharp';
import {deflateSync,crc32} from 'node:zlib';
import {decodePresetFile, normalizeGameCover, parseGameFileFields} from '../src/games/files.js';
const exported = readFileSync(new URL('./fixtures/native-export.judytik.json',import.meta.url),'utf8');
const preset = JSON.parse(exported).preset;
test('imports the exact native desktop export, including BOM, and preserves actions', () => {
 assert.deepEqual(decodePresetFile(Buffer.from('\uFEFF'+exported)),preset);
});
test('rejects foreign, future, malformed and oversized exports', () => {
 for (const doc of [{...preset},{format:'other',version:1,preset},{format:'judytik-actions-preset',version:1,preset,extra:true}, {format:'judytik-actions-preset',version:1,preset:{...preset,name:' '}}]) {
  assert.throws(()=>decodePresetFile(Buffer.from(JSON.stringify(doc))), {code:'PRESET_FILE_INVALID'});
 }
 assert.throws(()=>decodePresetFile(Buffer.from('{')), {code:'PRESET_FILE_INVALID'});
 assert.throws(()=>decodePresetFile(Buffer.from(JSON.stringify({format:'judytik-actions-preset',version:2,preset}))),{code:'PRESET_FILE_VERSION'});
 assert.throws(()=>decodePresetFile(Buffer.alloc(1048577)),{code:'PRESET_FILE_TOO_LARGE'});
 assert.throws(()=>decodePresetFile(Buffer.from([0xff])),{code:'PRESET_FILE_INVALID'});
});
test('multipart text fields are strict, draft by default, with canonical slugs', () => {
 assert.deepEqual(parseGameFileFields({slug:'my-game',name:' เกม '}),{slug:'my-game',name:'เกม',description:'',platform:'pc',categoryId:null,status:'draft'});
 for (const fields of [{slug:'My Game',name:'G'},{slug:'g',name:' '},{slug:'g',name:'G',status:'archived'},{slug:'g',name:'G',coverUrl:'http://example.com/a.png'},{slug:'g',name:'G',name2:'G'}]) assert.throws(()=>parseGameFileFields(fields),{code:'INVALID_REQUEST'});
});
test('cover decoding rejects fake MIME payloads, SVG and oversized bytes', async () => {
 for (const bytes of [Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>'),Buffer.from('not an image')]) await assert.rejects(normalizeGameCover(bytes),{code:'GAME_COVER_INVALID'});
 await assert.rejects(normalizeGameCover(Buffer.alloc(2097153)),{code:'GAME_COVER_TOO_LARGE'});
});
test('native semantic validation catches duplicate action IDs and excessive inner payload',()=>{
 const duplicate={...preset,actions:[...preset.actions,...preset.actions]};
 assert.throws(()=>decodePresetFile(Buffer.from(JSON.stringify({format:'judytik-actions-preset',version:1,preset:duplicate}))),{code:'PRESET_FILE_INVALID'});
 assert.throws(()=>decodePresetFile(Buffer.from(JSON.stringify({format:'judytik-actions-preset',version:1,preset:{...preset,extra:'x'.repeat(262144)}}))),{code:'PRESET_FILE_TOO_LARGE'});
});
test('decodes actual PNG/JPEG/WebP, strips metadata, and caps image dimensions',async()=>{
 for(const format of ['png','jpeg','webp'] as const){
  const bytes=await sharp({create:{width:2000,height:500,channels:3,background:'#cc3399'}})[format]().toBuffer();
  const result=await normalizeGameCover(bytes),meta=await sharp(result).metadata();
  assert.equal(meta.format,'webp');assert.equal(meta.width,1600);assert.equal(meta.height,400);assert.equal(meta.exif,undefined);
 }
 const bomb=await sharp({create:{width:4001,height:4000,channels:3,background:'#000000'}}).png().toBuffer();
 await assert.rejects(normalizeGameCover(bomb),{code:'GAME_COVER_INVALID'});
});
test('rejects APNG animation even when decoder metadata does not expose a pages count',async()=>{
 function chunk(type:string,data:Buffer){const t=Buffer.from(type),out=Buffer.alloc(data.length+12);out.writeUInt32BE(data.length);t.copy(out,4);data.copy(out,8);out.writeUInt32BE(crc32(Buffer.concat([t,data])),8+data.length);return out;}
 const png=await sharp({create:{width:1,height:1,channels:4,background:'#ff0000'}}).png().toBuffer();
 const parts=[png.subarray(0,8)],anim=Buffer.alloc(8);anim.writeUInt32BE(2);
 const fc=(seq:number)=>{const b=Buffer.alloc(26);b.writeUInt32BE(seq);b.writeUInt32BE(1,4);b.writeUInt32BE(1,8);b.writeUInt16BE(1,20);b.writeUInt16BE(1,22);return b;};
 for(let pos=8;pos<png.length;){const len=png.readUInt32BE(pos),type=png.toString('ascii',pos+4,pos+8);
  if(type==='IDAT' && !parts.some(p=>p.toString('ascii',4,8)==='acTL'))parts.push(chunk('acTL',anim),chunk('fcTL',fc(0)));
  if(type==='IEND')parts.push(chunk('fcTL',fc(1)),chunk('fdAT',Buffer.concat([Buffer.from([0,0,0,2]),deflateSync(Buffer.from([0,0,255,0,255]))])));
  parts.push(png.subarray(pos,pos+len+12));pos+=len+12;
 }
 await assert.rejects(normalizeGameCover(Buffer.concat(parts)),{code:'GAME_COVER_INVALID'});
});
