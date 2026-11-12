import 'reflect-metadata'
import test from 'node:test'
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {proGrants} from './support/plan-access.js'
import {defaultOverlayData,validOverlayData} from '../../shared/overlays.js'
import {assertContract} from '../src/auth/contracts.js'
import {OverlaysService} from '../src/overlays/service.js'
import {OverlaysController} from '../src/overlays/controller.js'

const appearance={text:'#FFFFFF',title:'#FA1234',detail:'#EEEEEE',value:'#99FF00',rank:'#AABBCC',border:'#ABCDEF',outline:'#000000',outlineSize:2}
test('custom appearance contracts reject invalid colors and unknown keys',()=>{
 const data=defaultOverlayData();data.widgets.alert.appearance=appearance
 assert(validOverlayData(data));assertContract('OverlayData',data)
 for(const patch of [{text:'red'},{text:'url(x)'},{outlineSize:7},{extra:'#FFFFFF'}]){
  const invalid=structuredClone(data);Object.assign(invalid.widgets.alert.appearance!,patch)
  assert(!validOverlayData(invalid));assert.throws(()=>assertContract('OverlayData',invalid))
 }
})
test('old clients cannot erase appearance overrides; capable clients can reset to a theme',async()=>{
 let row:any=null
 const tx={entitlementGrant:proGrants,$queryRaw:async()=>[],auditEvent:{create:async()=>({})},overlaysWorkspace:{findUnique:async()=>row,create:async({data}:any)=>(row={...structuredClone(data),revision:1n}),update:async({data}:any)=>(row={...row,data:structuredClone(data.data),revision:row.revision+1n})}}
 const service=new OverlaysService({withUserContext:async(_:unknown,run:any)=>run(tx)} as any),controller=new OverlaysController(service),actor={userId:randomUUID(),sessionId:randomUUID()} as any
 const data=defaultOverlayData();for(const widget of Object.values(data.widgets))widget.appearance=appearance
 await service.save(actor,data,'"0"',randomUUID(),'slider,custom-appearance')
 const old=await controller.get({headers:{'x-judytik-overlay-features':'slider'},verifiedSession:actor} as any,{setHeader(){}} as any)
 for(const widget of Object.values(old.data.widgets))assert(!Object.hasOwn(widget,'appearance'))
 old.data.widgets.alert.title='Older desktop edit'
 const saved=await service.save(actor,old.data,'"1"',randomUUID(),'slider')
 assert.equal(saved.data.widgets.alert.title,'Older desktop edit')
 for(const widget of Object.values(saved.data.widgets))assert.deepEqual(widget.appearance,appearance)
 const current=await controller.get({headers:{'x-judytik-overlay-features':'slider,custom-appearance'},verifiedSession:actor} as any,{setHeader(){}} as any)
 assert.deepEqual(current.data.widgets.alert.appearance,appearance)
 delete current.data.widgets.alert.appearance
 const reset=await service.save(actor,current.data,'"2"',randomUUID(),'slider,custom-appearance')
 assert.equal(reset.data.widgets.alert.appearance,undefined)
 assert.deepEqual(reset.data.widgets.leaderboard.appearance,appearance)
})
