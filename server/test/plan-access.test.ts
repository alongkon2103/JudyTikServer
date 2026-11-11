import 'reflect-metadata'
import test from 'node:test'
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {PresetsService} from '../src/presets/service.js'
import {SoundpadService} from '../src/soundpad/service.js'
import {WinService} from '../src/win/service.js'
import {OverlaysService} from '../src/overlays/service.js'
import {defaultSoundpadData} from '../../shared/soundpad.js'
import {defaultWinData} from '../../shared/win.js'
import {defaultOverlayData,validOverlayData} from '../../shared/overlays.js'
import {userHasPro,assertPresetPlan} from '../src/entitlements/plan-access.js'
import {AccountMergeService} from '../src/accounts/merge.service.js'
import {GamesService} from '../src/games/service.js'

const now=new Date('2026-11-12T00:00:00Z'),clock={now:()=>now}
const actor={userId:randomUUID(),sessionId:randomUUID()} as any
const rules=(count:number)=>Array.from({length:count},(_,i)=>({id:`rule-${i}`,name:`Rule ${i}`,trigger:'like',giftId:'',threshold:1,minCoins:0,hotkey:'',enabled:true,cooldownSeconds:0,comboMode:'each-event',commentMatch:'',effects:[{kind:'overlay',template:'Hello'}]}))
function harness(current:any=null,pro=false){
 let writes=0
 const model={findUnique:async()=>current,create:async({data}:any)=>{writes++;return {...data,revision:1n,createdAt:now,updatedAt:now}},update:async({data}:any)=>{writes++;return {...current,...data,revision:2n,createdAt:now,updatedAt:now}}}
 const tx:any={$queryRaw:async()=>[],entitlementGrant:{findMany:async()=>pro?[{endsAt:new Date(now.getTime()+3600000)}]:[]},auditEvent:{create:async()=>({})},gift:{count:async()=>0},actionPreset:model,soundpadWorkspace:model,winWorkspace:model,overlaysWorkspace:model}
 return {db:{withUserContext:async(_:unknown,run:any)=>run(tx)} as any,tx,writes:()=>writes}
}
test('FREE cannot create an eleventh Action through the preset persistence API',async()=>{
 const h=harness(),service=new PresetsService(h.db,clock)
 await assert.rejects(service.save(actor,randomUUID(),{schemaVersion:1,name:'Too many',actions:rules(11)},{ifNoneMatch:'*'},randomUUID()),/FREE_ACTION_LIMIT/)
 assert.equal(h.writes(),0)
 await service.save(actor,randomUUID(),{schemaVersion:1,name:'Allowed',actions:rules(10)},{ifNoneMatch:'*'},randomUUID())
 assert.equal(h.writes(),1)
})
test('FREE retains and reduces an oversized saved preset but cannot grow it',async()=>{
 const h=harness({id:randomUUID(),actions:rules(15),revision:1n}),service=new PresetsService(h.db,clock)
 for(const count of [15,14,10])await service.save(actor,randomUUID(),{schemaVersion:1,name:'Existing',actions:rules(count)},{ifMatch:'"1"'},randomUUID())
 await assert.rejects(service.save(actor,randomUUID(),{schemaVersion:1,name:'Grow',actions:rules(16)},{ifMatch:'"1"'},randomUUID()),/FREE_ACTION_LIMIT/)
 assert.equal(h.writes(),3)
})
test('Soundpad and WIN reject FREE mutations before writing, but still return existing data',async()=>{
 for(const [Service,data]of [[SoundpadService,defaultSoundpadData()],[WinService,defaultWinData()]] as const){
  const h=harness({data,revision:1n}),service=new Service(h.db,clock)
  assert.deepEqual((await service.get(actor)).data,data)
  await assert.rejects(service.save(actor,data,'"1"',randomUUID()),/PRO_REQUIRED/)
  assert.equal(h.writes(),0)
 }
})
test('FREE can save allowed overlay widgets with enabled PRO defaults and retain legacy PRO settings',async()=>{
 const h=harness(),service=new OverlaysService(h.db,clock),data=defaultOverlayData()
 data.widgets.alert.title='Free alert'
 await service.save(actor,data,'"0"',randomUUID())
 for(const kind of ['slider','big-gift','video','timer','gift-jar'] as const){
  const changed=structuredClone(data);changed.widgets[kind].title='Changed'
  await assert.rejects(service.save(actor,changed,'"0"',randomUUID()),/PRO_REQUIRED/)
 }
 const existing=structuredClone(data);existing.widgets.slider.title='Saved PRO title'
 const legacy=harness({data:existing,revision:1n}),legacyService=new OverlaysService(legacy.db,clock)
 existing.widgets.goal.title='New free goal'
 await legacyService.save(actor,existing,'"1"',randomUUID())
 assert.equal(legacy.writes(),1)
})
test('active PRO can save unrestricted Actions and restricted workspaces',async()=>{
 const h=harness(null,true)
 await new PresetsService(h.db,clock).save(actor,randomUUID(),{schemaVersion:1,name:'PRO',actions:rules(11)},{ifNoneMatch:'*'},randomUUID())
 await new SoundpadService(h.db,clock).save(actor,defaultSoundpadData(),'"0"',randomUUID())
 await new WinService(h.db,clock).save(actor,defaultWinData(),'"0"',randomUUID())
 const data=defaultOverlayData();data.widgets.slider.title='PRO title'
 await new OverlaysService(h.db,clock).save(actor,data,'"0"',randomUUID())
 assert.equal(h.writes(),4)
})
test('plan lookup uses server time and ignores future, revoked and expired grants through its query',async()=>{
 let query:any
 const tx:any={entitlementGrant:{findMany:async(input:any)=>{query=input;return [{endsAt:new Date(now)}]}}}
 assert.equal(await userHasPro(tx,actor.userId,clock),false)
 assert.deepEqual(query.where,{userId:actor.userId,plan:'PRO',revokedAt:null,startsAt:{lte:now}})
 assert.deepEqual(query.orderBy,{endsAt:'desc'});assert.equal(query.take,1)
 tx.entitlementGrant.findMany=async()=>[{endsAt:new Date(now.getTime()+1)}]
 assert.equal(await userHasPro(tx,actor.userId,clock),true)
})
test('FREE preserves/removes saved video effects but cannot add, copy or change them; sound remains FREE',()=>{
 const video={kind:'video',media:{bindingId:randomUUID(),displayName:'video.mp4'}},saved=[{id:'one',effects:[video]}]
 assert.doesNotThrow(()=>assertPresetPlan(false,saved,saved))
 assert.doesNotThrow(()=>assertPresetPlan(false,[{id:'one',effects:[]}],saved))
 assert.throws(()=>assertPresetPlan(false,saved),/PRO_REQUIRED/)
 assert.throws(()=>assertPresetPlan(false,[{id:'two',effects:[video]}],saved),/PRO_REQUIRED/)
 assert.throws(()=>assertPresetPlan(false,[{id:'one',effects:[{...video,media:{...video.media,displayName:'changed.mp4'}}]}],saved),/PRO_REQUIRED/)
 assert.throws(()=>assertPresetPlan(false,[{id:'one',effects:[{kind:'win'}]}]),/PRO_REQUIRED/)
 assert.doesNotThrow(()=>assertPresetPlan(false,[{id:'one',effects:[{kind:'sound',media:video.media}]}]))
})
test('game import cannot bypass the real preset service FREE action limit',async()=>{
 const h=harness(),service=new GamesService(h.db,new PresetsService(h.db,clock),{require:async()=>{}} as any)
 service.preset=async()=>({revision:'1',name:'Large',format:'action-preset-v1',payload:{schemaVersion:1,name:'Large',actions:rules(11)}})
 await assert.rejects(service.importPreset(actor,randomUUID(),randomUUID(),{},randomUUID()),/FREE_ACTION_LIMIT/)
 assert.equal(h.writes(),0)
})
test('archive restore cannot bypass protected workspace mutation guards',async()=>{
 for(const module of ['winWorkspace','soundpadWorkspace','overlaysWorkspace']){
  const current=defaultOverlayData(),incoming=defaultOverlayData();incoming.widgets.slider.title='Archived PRO'
  const data=module==='winWorkspace'?defaultWinData():module==='soundpadWorkspace'?defaultSoundpadData():incoming
  const h=harness(module==='overlaysWorkspace'?{data:current,revision:1n}:null)
  h.tx.user={findMany:async()=>[]}
  h.tx.accountMergeArchive={findUnique:async()=>({ownerUserId:actor.userId,data:{[module]:{data}}})}
  h.db.client={$transaction:async(run:any)=>run(h.tx)}
  const service=new AccountMergeService(h.db,clock)
  await assert.rejects(service.restore(actor,randomUUID(),{module,revision:module==='overlaysWorkspace'?'1':'0'},randomUUID()),/PRO_REQUIRED/)
  assert.equal(h.writes(),0)
 }
})
test('allowed Spin config cannot smuggle nested video or WIN response commands',()=>{
 for(const type of ['video','win']){
  const data=defaultOverlayData()
  data.widgets.spin.spinOptions=data.widgets.spin.options.map((label,index)=>({id:`slot-${index}`,label,responses:[{type}]}))
  assert.equal(validOverlayData(data),false)
 }
})
test('expired PRO grants immediately deny protected writes',async()=>{
 const h=harness()
 h.tx.entitlementGrant.findMany=async()=>[{endsAt:new Date(now)}]
 await assert.rejects(new SoundpadService(h.db,clock).save(actor,defaultSoundpadData(),'"0"',randomUUID()),/PRO_REQUIRED/)
 await assert.rejects(new PresetsService(h.db,clock).save(actor,randomUUID(),{schemaVersion:1,name:'Expired',actions:rules(11)},{ifNoneMatch:'*'},randomUUID()),/FREE_ACTION_LIMIT/)
 assert.equal(h.writes(),0)
})
test('FREE older desktop can save allowed widgets without resetting its projected PRO jar theme',async()=>{
 const data=defaultOverlayData();data.widgets['gift-jar'].theme='mochi-pals'
 const h=harness({data,revision:1n}),service=new OverlaysService(h.db,clock)
 const legacy:any=structuredClone(data);delete legacy.widgets.slider;delete legacy.widgets.video
 legacy.widgets['gift-jar'].theme='plain-white';legacy.widgets.alert.title='Older free edit'
 const saved=await service.save(actor,legacy,'"1"',randomUUID())
 assert.equal(saved.data.widgets['gift-jar'].theme,'mochi-pals')
 assert.equal(saved.data.widgets.alert.title,'Older free edit')
})
test('FREE preserves omitted PRO optional settings even when caller advertises newer capabilities',async()=>{
 const data=defaultOverlayData(),h=harness({data,revision:1n}),service=new OverlaysService(h.db,clock)
 const legacy=structuredClone(data);delete legacy.widgets['gift-jar'].rankLimit;delete legacy.widgets['big-gift'].bigGiftLimit
 legacy.widgets['top-likers'].likerLimit=5
 const saved=await service.save(actor,legacy,'"1"',randomUUID(),'ranking-limit,big-gift-ranking')
 assert.equal(saved.data.widgets['gift-jar'].rankLimit,10)
 assert.equal(saved.data.widgets['big-gift'].bigGiftLimit,3)
 assert.equal(saved.data.widgets['top-likers'].likerLimit,5)
})


