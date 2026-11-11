import {proGrants} from './support/plan-access.js'
import test from 'node:test'
import assert from 'node:assert/strict'
import {defaultWinData} from '../../shared/win.js'
import {defaultOverlayData} from '../../shared/overlays.js'
import {WinController} from '../src/win/controller.js'
import {WinService} from '../src/win/service.js'
import {OverlaysController} from '../src/overlays/controller.js'
import {OverlaysService} from '../src/overlays/service.js'
test('Old desktop responses omit weights without mutating storage; capable clients receive them',async()=>{
 const data={...defaultWinData(),slotWeights:[0,10,20,30,40,50]},doc={revision:'1',data},controller=new WinController({get:async()=>doc} as any),res={setHeader(){}} as any
 const old=await controller.get({headers:{},verifiedSession:{}} as any,res);assert(!Object.hasOwn(old.data!,'slotWeights'));assert.equal(doc.data.slotWeights[0],0)
 const current=await controller.get({headers:{'x-judytik-win-features':'spin-weights'},verifiedSession:{}} as any,res);assert.deepEqual(current.data,data)
 const overlays=defaultOverlayData();overlays.widgets.spin.spinOptions=overlays.widgets.spin.options.map((label,i)=>({id:'slot-'+i,label,weight:i?0:100}));const overlay=new OverlaysController({get:async()=>({revision:'1',data:overlays})} as any)
 const legacy=await overlay.get({headers:{'x-judytik-overlay-features':'slider'},verifiedSession:{}} as any,res);assert(!Object.hasOwn(legacy.data.widgets.spin.spinOptions![0],'weight'));assert.equal(overlays.widgets.spin.spinOptions[0].weight,100)
 const capable=await overlay.get({headers:{'x-judytik-overlay-features':'slider,spin-weights'},verifiedSession:{}} as any,res);assert.equal(capable.data.widgets.spin.spinOptions![0].weight,100);assert('slider' in capable.data.widgets)
})
test('Unrelated writes from an older desktop preserve saved odds',async()=>{
 const winData={...defaultWinData(),slotWeights:[0,10,20,30,40,50]},overlayData=defaultOverlayData();overlayData.widgets.spin.spinOptions=overlayData.widgets.spin.options.map((label,i)=>({id:'slot-'+i,label,weight:i?0:100}))
 const rows:any={winWorkspace:{data:winData,revision:1n},overlaysWorkspace:{data:overlayData,revision:1n}},saved:any={}
 const tx:any={entitlementGrant:proGrants,$queryRaw:async()=>[],auditEvent:{create:async()=>({})}}
 for(const name of Object.keys(rows))tx[name]={findUnique:async()=>rows[name],update:async({data}:any)=>{saved[name]=data.data;return{data:data.data,revision:2n}}}
 const db={withUserContext:async(_owner:string,fn:any)=>fn(tx)},actor={userId:'a',sessionId:'s'} as any
 const oldWin=defaultWinData();oldWin.count=100;await new WinService(db as any).save(actor,oldWin,'"1"','request');assert.deepEqual(saved.winWorkspace.slotWeights,winData.slotWeights)
 const oldOverlay=structuredClone(overlayData);for(const item of oldOverlay.widgets.spin.spinOptions!)delete item.weight;await new OverlaysService(db as any).save(actor,oldOverlay,'"1"','request');assert.equal(saved.overlaysWorkspace.widgets.spin.spinOptions[0].weight,100)
})

test('Slider colors are projected for old desktops, preserved on old writes and can explicitly return to global color',async()=>{
 const data=defaultOverlayData();data.widgets.slider.sliderItems=[{id:'one',label:'ONE',textColor:'#FF0000'},{id:'two',label:'TWO',textColor:null}]
 const doc={revision:'1',data},res={setHeader(){}} as any,controller=new OverlaysController({get:async()=>doc} as any)
 const old=await controller.get({headers:{'x-judytik-overlay-features':'slider'},verifiedSession:{}} as any,res);assert(!Object.hasOwn((old.data.widgets as any).slider.sliderItems[0],'textColor'));assert.equal(data.widgets.slider.sliderItems[0].textColor,'#FF0000')
 const current=await controller.get({headers:{'x-judytik-overlay-features':'slider,spin-weights,slider-item-colors'},verifiedSession:{}} as any,res);assert.equal((current.data.widgets as any).slider.sliderItems[0].textColor,'#FF0000')
 let saved:any;const tx={entitlementGrant:proGrants,$queryRaw:async()=>[],overlaysWorkspace:{findUnique:async()=>({data,revision:1n}),update:async({data}:any)=>{saved=data.data;return{data:saved,revision:2n}}},auditEvent:{create:async()=>({})}},service=new OverlaysService({withUserContext:async(_owner:string,fn:any)=>fn(tx)} as any),actor={userId:'a',sessionId:'s'} as any
 const legacy=structuredClone(data);for(const item of legacy.widgets.slider.sliderItems!)delete item.textColor;await service.save(actor,legacy,'"1"','request');assert.equal(saved.widgets.slider.sliderItems[0].textColor,'#FF0000')
 const reset=structuredClone(data);reset.widgets.slider.sliderItems![0].textColor=null;await service.save(actor,reset,'"1"','request');assert.equal(saved.widgets.slider.sliderItems[0].textColor,null)
})
