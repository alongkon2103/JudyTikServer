import 'reflect-metadata'
import test from 'node:test'
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {defaultOverlayData,validOverlayData} from '../../shared/overlays.js'
import {assertContract} from '../src/auth/contracts.js'
import {OverlaysController} from '../src/overlays/controller.js'
import {OverlaysService} from '../src/overlays/service.js'

test('Overlay options accept distinct positive gift IDs and ranked and sound settings',()=>{
 const data=defaultOverlayData() as any
 Object.assign(data.widgets.spin,{spinGiftIds:['1','5655'],spinSound:false,spinVolume:0})
 data.widgets.leaderboard.rankLimit=5;data.widgets['gift-jar'].rankLimit=10
 assert(validOverlayData(data));assert.deepEqual(assertContract('OverlayData',data),data)
 for(const patch of [{spinGiftIds:[]},{spinGiftIds:['1','1']},{spinGiftIds:['*']},{spinGiftIds:['01']},{spinGiftIds:['0']},{spinGiftIds:[1]},{spinGiftIds:['1\n']},{spinGiftIds:Array.from({length:101},(_,i)=>String(i+1))},{spinSound:1},{spinVolume:-1},{spinVolume:101},{spinVolume:1.5},{rankLimit:3}]){
  const bad:any=structuredClone(data);Object.assign(bad.widgets.spin,patch)
  assert.equal(validOverlayData(bad),false,JSON.stringify(patch))
  assert.throws(()=>assertContract('OverlayData',bad),/INVALID_REQUEST/,JSON.stringify(patch))
 }
 const legacy=structuredClone(data);delete legacy.widgets.spin.spinGiftIds;delete legacy.widgets.spin.spinSound;delete legacy.widgets.spin.spinVolume;delete legacy.widgets.leaderboard.rankLimit;delete legacy.widgets['gift-jar'].rankLimit
 assert(validOverlayData(legacy));assertContract('OverlayData',legacy)
})

test('Overlay capability projection hides new options individually without mutating stored settings',async()=>{
 const data=defaultOverlayData() as any
 Object.assign(data.widgets.spin,{spinGiftIds:['1','2'],spinSound:false,spinVolume:15})
 data.widgets.leaderboard.rankLimit=5;data.widgets['gift-jar'].rankLimit=5
 const controller=new OverlaysController({get:async()=>({revision:'1',data}),save:async()=>({revision:'2',data})} as any),res={setHeader(){}} as any
 for(const operation of ['get','save'] as const){
  const old=await (operation==='get'?controller.get({headers:{},verifiedSession:{}} as any,res):controller.save({headers:{},verifiedSession:{}} as any,data,res))
  for(const key of ['spinGiftIds','spinSound','spinVolume'])assert(!Object.hasOwn(old.data.widgets.spin,key))
  assert(!Object.hasOwn(old.data.widgets.leaderboard,'rankLimit'));assert(!Object.hasOwn(old.data.widgets['gift-jar'],'rankLimit'))
 }
 const ranked=await controller.get({headers:{'x-judytik-overlay-features':'ranking-limit'},verifiedSession:{}} as any,res)
 assert.equal((ranked.data.widgets.leaderboard as any).rankLimit,5);assert(!Object.hasOwn(ranked.data.widgets.spin,'spinGiftIds'))
 const current=await controller.get({headers:{'x-judytik-overlay-features':'slider,big-gift-ranking,top-likers-limit,spin-multi-gifts,ranking-limit,spin-sound'},verifiedSession:{}} as any,res)
 assert.deepEqual(current.data,data);assert.equal(data.widgets.spin.spinVolume,15)
})

test('Older saves preserve hidden overlay options and capable saves can replace them',async()=>{
 let row:any=null
 const tx={$queryRaw:async()=>[],auditEvent:{create:async()=>({})},overlaysWorkspace:{findUnique:async()=>row,create:async({data}:any)=>(row={...structuredClone(data),revision:1n}),update:async({data}:any)=>(row={...row,data:structuredClone(data.data),revision:row.revision+1n})}}
 const service=new OverlaysService({withUserContext:async(_:unknown,run:any)=>run(tx)} as any),actor={userId:randomUUID(),sessionId:randomUUID()} as any
 const data=defaultOverlayData() as any;Object.assign(data.widgets.spin,{giftId:'1',spinGiftIds:['1','2'],spinSound:false,spinVolume:15});data.widgets.leaderboard.rankLimit=5;data.widgets['gift-jar'].rankLimit=5
 await service.save(actor,data,'"0"',randomUUID())
 const legacy=structuredClone(data);for(const key of ['spinGiftIds','spinSound','spinVolume'])delete legacy.widgets.spin[key];delete legacy.widgets.leaderboard.rankLimit;delete legacy.widgets['gift-jar'].rankLimit;legacy.widgets.alert.title='Older edit'
 const saved=await service.save(actor,legacy,'"1"',randomUUID())
 assert.equal(saved.data.widgets.alert.title,'Older edit');assert.deepEqual((saved.data.widgets.spin as any).spinGiftIds,['1','2']);assert.equal((saved.data.widgets.spin as any).spinSound,false);assert.equal((saved.data.widgets.spin as any).spinVolume,15);assert.equal((saved.data.widgets.leaderboard as any).rankLimit,5);assert.equal((saved.data.widgets['gift-jar'] as any).rankLimit,5)
 const next=structuredClone(saved.data) as any;Object.assign(next.widgets.spin,{spinGiftIds:['3'],spinSound:true,spinVolume:100});next.widgets.leaderboard.rankLimit=10
 const replaced=await service.save(actor,next,'"2"',randomUUID());assert.deepEqual((replaced.data.widgets.spin as any).spinGiftIds,['3']);assert.equal((replaced.data.widgets.spin as any).spinSound,true);assert.equal((replaced.data.widgets.leaderboard as any).rankLimit,10)
})


test('A capable desktop can clear gift selection and return to legacy wildcard matching',async()=>{
 const data=defaultOverlayData() as any;data.widgets.spin.spinGiftIds=['1','2'];let stored:any
 const tx={$queryRaw:async()=>[],auditEvent:{create:async()=>({})},overlaysWorkspace:{findUnique:async()=>({revision:1n,data}),update:async({data}:any)=>(stored=data.data,{revision:2n,data:stored})}}
 const service=new OverlaysService({withUserContext:async(_:unknown,run:any)=>run(tx)} as any)
 const controller=new OverlaysController(service),input=structuredClone(data);delete input.widgets.spin.spinGiftIds;input.widgets.spin.giftId='*'
 const response=await controller.save({headers:{'if-match':'"1"','x-judytik-overlay-features':'slider,spin-multi-gifts'},verifiedSession:{userId:randomUUID(),sessionId:randomUUID()}} as any,input,{setHeader(){}} as any)
 assert.equal(response.data.widgets.spin.giftId,'*');assert(!Object.hasOwn(stored.widgets.spin,'spinGiftIds'))
})
