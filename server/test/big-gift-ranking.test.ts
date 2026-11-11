import {proGrants} from './support/plan-access.js'
import test from 'node:test'
import assert from 'node:assert/strict'
import {defaultOverlayData} from '../../shared/overlays.js'
import {OverlaysController} from '../src/overlays/controller.js'
import {OverlaysService} from '../src/overlays/service.js'
test('Big Gift ranking settings are capability-gated for older desktop validators',async()=>{
 const data=defaultOverlayData();data.widgets['big-gift'].bigGiftLimit=7;const controller=new OverlaysController({get:async()=>({revision:'1',data})} as any),res={setHeader(){}} as any
 const old=await controller.get({headers:{'x-judytik-overlay-features':'slider'},verifiedSession:{}} as any,res);assert(!Object.hasOwn(old.data.widgets['big-gift'],'bigGiftLimit'));assert.equal(data.widgets['big-gift'].bigGiftLimit,7)
 const next=await controller.get({headers:{'x-judytik-overlay-features':'slider,big-gift-ranking'},verifiedSession:{}} as any,res);assert.equal(next.data.widgets['big-gift'].bigGiftLimit,7)
})
test('Older clients cannot accidentally erase the configured Big Gift rank limit',async()=>{
 const data=defaultOverlayData();data.widgets['big-gift'].bigGiftLimit=8;let saved:any;const tx={entitlementGrant:proGrants,$queryRaw:async()=>[],overlaysWorkspace:{findUnique:async()=>({revision:1n,data}),update:async({data}:any)=>{saved=data.data;return {revision:2n,data:saved}}},auditEvent:{create:async()=>({})}}
 const old=structuredClone(data);delete old.widgets['big-gift'].bigGiftLimit;await new OverlaysService({withUserContext:async(_owner:string,fn:any)=>fn(tx)} as any).save({userId:'a',sessionId:'s'} as any,old,'"1"','request');assert.equal(saved.widgets['big-gift'].bigGiftLimit,8)
})
