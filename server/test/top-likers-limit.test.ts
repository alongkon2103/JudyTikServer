import test from 'node:test'
import assert from 'node:assert/strict'
import {defaultOverlayData} from '../../shared/overlays.js'
import {OverlaysController} from '../src/overlays/controller.js'
import {OverlaysService} from '../src/overlays/service.js'
test('Top Likers limit is projected for old clients without mutating storage',async()=>{
 const data=defaultOverlayData();data.widgets['top-likers'].likerLimit=5;const controller=new OverlaysController({get:async()=>({revision:'1',data})} as any),res={setHeader(){}}
 const old=await controller.get({headers:{'x-judytik-overlay-features':'slider,big-gift-ranking'},verifiedSession:{}} as any,res as any);assert(!Object.hasOwn(old.data.widgets['top-likers'],'likerLimit'));assert.equal(data.widgets['top-likers'].likerLimit,5)
 const next=await controller.get({headers:{'x-judytik-overlay-features':'slider,big-gift-ranking,top-likers-limit'},verifiedSession:{}} as any,res as any);assert.equal(next.data.widgets['top-likers'].likerLimit,5)
})
test('old clients saving other overlays preserve the chosen Top Likers limit',async()=>{
 const data=defaultOverlayData();data.widgets['top-likers'].likerLimit=5;let saved:any;const tx={$queryRaw:async()=>[],overlaysWorkspace:{findUnique:async()=>({revision:1n,data}),update:async({data}:any)=>{saved=data.data;return{revision:2n,data:saved}}},auditEvent:{create:async()=>({})}}
 const old=structuredClone(data);delete old.widgets['top-likers'].likerLimit;await new OverlaysService({withUserContext:async(_owner:string,fn:any)=>fn(tx)} as any).save({userId:'a',sessionId:'s'} as any,old,'"1"','test');assert.equal(saved.widgets['top-likers'].likerLimit,5)
})
