import {test} from 'node:test'
import assert from 'node:assert/strict'
import {validatePreset} from '../src/presets/contracts.js'
import {mediaVolumeResponse,retainMediaVolumes} from '../src/presets/media-volume.js'
const body=(kind:string,volume?:unknown)=>({schemaVersion:1,name:'Audio',actions:[{id:'audio',name:'Audio',trigger:'follow',enabled:true,giftId:'',threshold:1,minCoins:0,cooldownSeconds:0,comboMode:'each-event',commentMatch:'',hotkey:'',effects:[{kind,media:{bindingId:'11111111-1111-4111-8111-111111111111',displayName:'clip.mp3'},...(volume===undefined?{}:{volume})}]}]})
test('media effect volume is optional for existing clients and accepts only integer percentages',()=>{
 for(const kind of ['sound','video']){
  for(const volume of [undefined,0,37,100])assert.deepEqual(validatePreset(body(kind,volume)),body(kind,volume))
  for(const invalid of [-1,101,0.5,'50',null])assert.throws(()=>validatePreset(body(kind,invalid)))
 }
})
test('old clients receive compatible media effects and retain volume when saving unchanged media',()=>{
 const original=body('sound',37),old=mediaVolumeResponse(original,undefined)
 assert.equal((old.actions[0].effects[0] as any).volume,undefined)
 assert.equal(original.actions[0].effects[0].volume,37)
 assert.deepEqual(mediaVolumeResponse(original,'media-volume'),original)
 retainMediaVolumes(old.actions,original.actions,undefined)
 assert.equal((old.actions[0].effects[0] as any).volume,37)
 const reset=body('sound');retainMediaVolumes(reset.actions,original.actions,'media-volume')
 assert.equal((reset.actions[0].effects[0] as any).volume,undefined)
})
test('legacy edits retain unique media volume when preceding effects are removed',()=>{
 const original=body('sound',37),sound=original.actions[0].effects[0]
 original.actions[0].effects.unshift({kind:'keyboard',keys:['Space']} as any)
 const edited=body('sound');retainMediaVolumes(edited.actions,original.actions,undefined)
 assert.equal(edited.actions[0].effects[0].volume,sound.volume)
})
test('ambiguous duplicate media edits from old clients never inherit the wrong volume',()=>{
 const saved=body('sound',37);saved.actions[0].effects.push({...saved.actions[0].effects[0],volume:72})
 const same=mediaVolumeResponse(saved,undefined);retainMediaVolumes(same.actions,saved.actions,undefined)
 assert.deepEqual(same.actions[0].effects.map((x:any)=>x.volume),[37,72])
 const deleted=body('sound');assert.throws(()=>retainMediaVolumes(deleted.actions,saved.actions,undefined),{code:'PRESET_MEDIA_VOLUME_REQUIRES_UPDATE'})
})
