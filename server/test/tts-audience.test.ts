import test from 'node:test'
import assert from 'node:assert/strict'
import {defaultTtsData} from '../../shared/tts.js'
import {defaultTtsAudience} from '../../shared/tts-audience.js'
import {TtsController} from '../src/tts/controller.js'
import {TtsService} from '../src/tts/service.js'
test('TTS audience is returned only to capable desktop clients without mutating stored settings',async()=>{
 const data={...defaultTtsData(),audience:{...defaultTtsAudience(),everyone:false,followers:true}},doc={revision:'1',data},controller=new TtsController({get:async()=>doc} as any),res={setHeader(){}} as any
 const old=await controller.get({headers:{},verifiedSession:{}} as any,res);assert(!Object.hasOwn(old.data!,'audience'));assert(data.audience.followers)
 const current=await controller.get({headers:{'x-judytik-tts-features':'audience'},verifiedSession:{}} as any,res);assert.deepEqual(current.data,data)
})
test('Older desktop saves retain audience settings; new clients can explicitly restore everyone',async()=>{
 const data={...defaultTtsData(),audience:{...defaultTtsAudience(),everyone:false,teamMembers:true,minTeamLevel:5}};let saved:any
 const tx={$queryRaw:async()=>[],ttsWorkspace:{findUnique:async()=>({data,revision:1n}),update:async({data}:any)=>{saved=data.data;return {revision:2n,data:saved}}},auditEvent:{create:async()=>({})}}
 const service=new TtsService({withUserContext:async(_id:string,fn:any)=>fn(tx)} as any),actor={userId:'a',sessionId:'s'} as any
 await service.save(actor,defaultTtsData(),'"1"','req');assert.equal(saved.audience.minTeamLevel,5);assert.equal(saved.audience.everyone,false)
 await service.save(actor,{...defaultTtsData(),audience:defaultTtsAudience()},'"1"','req');assert(saved.audience.everyone)
})

test('TTS voice controls require a capability token and survive saves from old clients',async()=>{
 const data={...defaultTtsData(),pitch:0.8,messageDelayMs:750,audience:defaultTtsAudience()},doc={revision:'1',data},controller=new TtsController({get:async()=>doc} as any),res={setHeader(){}} as any;
 const old:any=await controller.get({headers:{'x-judytik-tts-features':'audience'},verifiedSession:{}} as any,res);assert(!Object.hasOwn(old.data,'pitch'));assert(!Object.hasOwn(old.data,'messageDelayMs'));assert(old.data.audience);
 const modern=await controller.get({headers:{'x-judytik-tts-features':'audience,voice-controls'},verifiedSession:{}} as any,res);assert.deepEqual(modern.data,data);
 let saved:any;const tx={$queryRaw:async()=>[],ttsWorkspace:{findUnique:async()=>({data,revision:1n}),update:async({data}:any)=>{saved=data.data;return {revision:2n,data:saved}}},auditEvent:{create:async()=>({})}};const service=new TtsService({withUserContext:async(_id:string,fn:any)=>fn(tx)} as any);await service.save({userId:'a',sessionId:'s'} as any,defaultTtsData(),'"1"','req');assert.equal(saved.pitch,0.8);assert.equal(saved.messageDelayMs,750)
})
