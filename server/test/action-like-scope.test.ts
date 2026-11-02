import test from 'node:test'
import assert from 'node:assert/strict'
import {validatePreset} from '../src/presets/contracts.js'
const action={id:'likes',name:'Likes',trigger:'like',enabled:true,giftId:'',threshold:100,minCoins:0,cooldownSeconds:0,comboMode:'each-event',commentMatch:'',hotkey:'',effects:[{kind:'overlay',template:'Thanks'}]}
test('server accepts legacy likes, preserves both scopes and rejects malformed persisted scope',()=>{
 const payload=(extra:any)=>({schemaVersion:1,name:'Scope',actions:[{...action,...extra}]})
 assert.equal(validatePreset(payload({})).actions[0].likeScope,undefined)
 for(const likeScope of ['user','room'])assert.equal(validatePreset(payload({likeScope})).actions[0].likeScope,likeScope)
 for(const likeScope of ['all',null,0,{}])assert.throws(()=>validatePreset(payload({likeScope})),{code:'INVALID_REQUEST'})
})
