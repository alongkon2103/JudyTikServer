import test from 'node:test'
import assert from 'node:assert/strict'
import {validatePreset} from '../src/presets/contracts.js'
const rule={id:'fans',name:'Fans Lv5',trigger:'fanclub',enabled:true,giftId:'',threshold:5,minCoins:0,cooldownSeconds:0,comboMode:'each-event',commentMatch:'',hotkey:'',effects:[{kind:'overlay',template:'Welcome'}]}
test('server preserves fanclub minimum level and keeps legacy subscriptions separate',()=>{
 const payload=(patch={})=>({schemaVersion:1,name:'Fans',actions:[{...rule,...patch}]})
 assert.equal(validatePreset(payload()).actions[0].threshold,5)
 assert.equal(validatePreset(payload({trigger:'subscribe',threshold:1})).actions[0].trigger,'subscribe')
 for(const threshold of [0,-1,1.5,'5',1000001])assert.throws(()=>validatePreset(payload({threshold})),{code:'INVALID_REQUEST'})
})
