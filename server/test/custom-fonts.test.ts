import {proGrants} from './support/plan-access.js'
import test from 'node:test'
import assert from 'node:assert/strict'
import {defaultWinData} from '../../shared/win.js'
import {WinController} from '../src/win/controller.js'
import {WinService} from '../src/win/service.js'
const font='custom:12345678-1234-4123-8123-123456789abc'
test('WIN custom fonts project safely for old clients, survive old writes and can be reset by new clients',async()=>{
 const data=defaultWinData();data.overlay.font=font;data.slotWeights=[1,2,3,4,5,6]
 const controller=new WinController({get:async()=>({revision:'1',data})} as any),res={setHeader(){}} as any
 const legacy=await controller.get({headers:{'x-judytik-win-features':'spin-weights'},verifiedSession:{}} as any,res);assert.equal(legacy.data.overlay.font,'Judy');assert.equal(data.overlay.font,font)
 const modern=await controller.get({headers:{'x-judytik-win-features':'spin-weights,custom-fonts'},verifiedSession:{}} as any,res);assert.equal(modern.data.overlay.font,font);assert.deepEqual(modern.data.slotWeights,data.slotWeights)
 let saved:any;const tx:any={entitlementGrant:proGrants,$queryRaw:async()=>[],auditEvent:{create:async()=>({})},winWorkspace:{findUnique:async()=>({data,revision:1n}),update:async({data}:any)=>{saved=data.data;return{data:saved,revision:2n}}}},service=new WinService({withUserContext:async(_o:string,fn:any)=>fn(tx)} as any),input=structuredClone(legacy.data)
 input.count=42;await service.save({userId:'a',sessionId:'s'} as any,input,'"1"','request','spin-weights');assert.equal(saved.overlay.font,font);assert.equal(saved.count,42)
 await service.save({userId:'a',sessionId:'s'} as any,input,'"1"','request','spin-weights,custom-fonts');assert.equal(saved.overlay.font,'Judy')
})
