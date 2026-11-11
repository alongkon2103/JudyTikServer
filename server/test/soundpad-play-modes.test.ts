import {proGrants} from './support/plan-access.js'
import 'reflect-metadata'
import {test} from 'node:test'
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {SoundpadService} from '../src/soundpad/service.js'
import {SoundpadController} from '../src/soundpad/controller.js'

for(const playMode of ['hold','toggle','restart'])test(`Legacy HTTP clients receive compatible pads and cannot erase saved ${playMode} mode`,async()=>{
 const id=randomUUID(),actor={userId:randomUUID(),sessionId:randomUUID()},base={id,name:'Clap',category:'reaction',bindingId:randomUUID(),displayName:'clap.mp3',hotkey:''};let row:any={revision:1n,data:{version:1,volume:75,pads:[{...base,playMode}]}};
 const tx={soundpadWorkspace:{findUnique:async()=>structuredClone(row),update:async({data}:any)=>(row={revision:row.revision+1n,data:data.data})},entitlementGrant:proGrants,$queryRaw:async()=>[],auditEvent:{create:async()=>({})}};
 const service=new SoundpadService({withUserContext:async(_id:string,fn:any)=>fn(tx)} as any),controller=new SoundpadController(service),res={setHeader:()=>{}} as any;
 const request=(features?:unknown)=>({verifiedSession:actor,headers:{'if-match':'"'+row.revision+'"','x-request-id':randomUUID(),...(features?{'x-judytik-soundpad-features':features}:{})}} as any);
 assert.equal((await controller.get(request(),res)).data.pads[0].playMode,undefined);
 assert.equal((await controller.get(request('play-modes'),res)).data.pads[0].playMode,playMode);
 const legacy={version:1,volume:20,pads:[base]};const saved=await controller.save(request(),legacy,res);assert.equal(saved.data.pads[0].playMode,undefined);assert.equal(row.data.pads[0].playMode,playMode);
 await controller.save(request('play-modes'),legacy,res);assert.equal(row.data.pads[0].playMode,undefined);
})
