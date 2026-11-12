import {test} from 'node:test'
import assert from 'node:assert/strict'
import {validatePreset} from '../src/presets/contracts.js'
const body=(kind:string,volume?:unknown)=>({schemaVersion:1,name:'Audio',actions:[{id:'audio',name:'Audio',trigger:'follow',enabled:true,giftId:'',threshold:1,minCoins:0,cooldownSeconds:0,comboMode:'each-event',commentMatch:'',hotkey:'',effects:[{kind,media:{bindingId:'11111111-1111-4111-8111-111111111111',displayName:'clip.mp3'},...(volume===undefined?{}:{volume})}]}]})
test('media effect volume is optional for existing clients and accepts only integer percentages',()=>{
 for(const kind of ['sound','video']){
  for(const volume of [undefined,0,37,100])assert.deepEqual(validatePreset(body(kind,volume)),body(kind,volume))
  for(const invalid of [-1,101,0.5,'50',null])assert.throws(()=>validatePreset(body(kind,invalid)))
 }
})
