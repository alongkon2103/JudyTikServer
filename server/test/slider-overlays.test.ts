import 'reflect-metadata'
import test from 'node:test'
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {defaultOverlayData,defaultWidget,hydrateOverlayData,validOverlayData} from '../../shared/overlays.js'
import {assertContract} from '../src/auth/contracts.js'
import {OverlaysController} from '../src/overlays/controller.js'
import type {SessionRequest} from '../src/auth/session.guard.js'
import type {Response} from 'express'
import {OverlaysService} from '../src/overlays/service.js'
import type {PrismaService} from '../src/database/prisma.service.js'
import type {VerifiedSession} from '../src/auth/auth.service.js'

test('Slider saves gift URLs, local image bindings and bounded display settings',()=>{
 const data=defaultOverlayData()
 data.widgets.slider.sliderItems=[{id:'gift',label:'Rose × 3',imageUrl:'https://example.com/rose.png'},{id:'local',label:'รูปของเรา',imageBindingId:randomUUID(),imageDisplayName:'photo.png'}]
 assert(validOverlayData(data));assert.deepEqual(assertContract('OverlayData',data),data)
 for(const patch of [{sliderSpeed:0},{sliderWidth:1921},{sliderDirection:'up'},{sliderItems:[{id:'x',label:'bad',imageUrl:'file:///private.png'}]},{sliderItems:[{id:'x',label:'bad',imageBindingId:randomUUID(),imageDisplayName:'C:\\private.png'}]},{sliderItems:Array.from({length:21},(_,i)=>({id:String(i),label:'item'}))}]){
  const bad={...data,widgets:{...data.widgets,slider:{...data.widgets.slider,...patch}}}
  assert.equal(validOverlayData(bad),false)
  assert.throws(()=>assertContract('OverlayData',bad),/INVALID_REQUEST/)
 }
 for(const theme of ['crystal-reverie','mochi-pals','enchanted-grove','midnight-grimoire']){
  data.widgets['gift-jar'].theme=theme;assert(validOverlayData(data));assertContract('OverlayData',data)
 }
})

test('Existing eight-widget documents hydrate Slider without changing saved settings',()=>{
 const legacy:any=defaultOverlayData();delete legacy.widgets.slider;delete legacy.widgets.video;legacy.widgets.goal.value=321
 assert(validOverlayData(legacy));assertContract('OverlayData',legacy)
 const restored=hydrateOverlayData(legacy)
 assert.equal(restored.widgets.goal.value,321);assert.deepEqual(restored.widgets.slider,defaultWidget('slider'))
 assert.equal(legacy.widgets.slider,undefined)
})

test('Overlay service persists Slider and preserves it when an older desktop saves',async()=>{
 let row:any=null
 const tx={
  $queryRaw:async()=>[],auditEvent:{create:async()=>({})},
  overlaysWorkspace:{findUnique:async()=>row,create:async({data}:any)=>(row={...structuredClone(data),revision:1n}),update:async({data}:any)=>(row={...row,data:structuredClone(data.data),revision:row.revision+1n})},
 }
 const db={withUserContext:async(_user:unknown,run:(tx:unknown)=>unknown)=>run(tx)} as unknown as PrismaService
 const service=new OverlaysService(db),actor={userId:randomUUID(),sessionId:randomUUID(),deviceId:randomUUID()} as VerifiedSession
 const initial=await service.get(actor);assert.equal(initial.revision,'0')
 const data=defaultOverlayData();data.widgets.slider.sliderItems=[{id:'rose',label:'ROSE × 3',imageUrl:'https://example.com/rose.png'}]
 const saved=await service.save(actor,data,'"0"',randomUUID());assert.equal(saved.revision,'1')
 assert.deepEqual((await service.get(actor)).data.widgets.slider,data.widgets.slider)
 const legacy:any=structuredClone(data);delete legacy.widgets.slider;delete legacy.widgets.video;legacy.widgets.alert.title='Older desktop edit'
 await service.save(actor,legacy,'"1"',randomUUID())
 const restored=await service.get(actor);assert.equal(restored.revision,'2');assert.equal(restored.data.widgets.alert.title,'Older desktop edit');assert.deepEqual(restored.data.widgets.slider,data.widgets.slider)
 await assert.rejects(()=>service.save(actor,data,'"1"',randomUUID()),/OVERLAY_VERSION_CONFLICT/)
})


test('Legacy desktops receive their known widget shape without erasing saved Slider data',async()=>{
 const data=defaultOverlayData();data.widgets.slider.sliderItems=[{id:'rose',label:'Rose'}];data.widgets['gift-jar'].theme='mochi-pals'
 const service={get:async()=>({revision:'3',data}),save:async()=>({revision:'4',data})} as unknown as OverlaysService
 const controller=new OverlaysController(service),res={setHeader:()=>{}} as unknown as Response
 const old={headers:{},verifiedSession:{}} as SessionRequest
 const legacy=await controller.get(old,res)
 assert.equal(Object.hasOwn(legacy.data.widgets,'slider'),false);assert.equal(legacy.data.widgets['gift-jar'].theme,'plain-white')
 const current={...old,headers:{'x-judytik-overlay-features':'slider,big-gift-ranking'}} as unknown as SessionRequest
 assert.deepEqual((await controller.get(current,res)).data,data)
 const expectedLegacy=structuredClone(data);delete expectedLegacy.widgets['big-gift'].bigGiftLimit
 assert.deepEqual((await controller.save(old,data,res)).data,expectedLegacy)
 assert.equal(data.widgets['gift-jar'].theme,'mochi-pals');assert.equal(data.widgets.slider.sliderItems?.length,1)
})
