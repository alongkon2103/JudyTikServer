import test from 'node:test'
import assert from 'node:assert/strict'
import {defaultOverlayData} from '../../shared/overlays.js'
import {assertContract} from '../src/auth/contracts.js'

test('OverlayData canonical contract accepts account settings and rejects extra runtime state',()=>{
 const data=defaultOverlayData()
 assert.deepEqual(assertContract('OverlayData',data),data)
 for(const value of [{...data,history:[]},{...data,userId:'forged'},{...data,widgets:{...data.widgets,'gift-jar':{...data.widgets['gift-jar'],theme:'orbital-bloom'}}}])
  assert.throws(()=>assertContract('OverlayData',value),/INVALID_REQUEST/)
})

test('OverlayData canonical contract rejects bad widget strings, identifiers and bounds',()=>{
 const data=defaultOverlayData()
 for(const value of [{duration:31},{minCoins:-1},{giftId:'01'},{events:['gift','gift']},{title:'bad\u202e'},{font:'constructor'},{options:['one']},{giftId:'1\n'},{accent:'#ffffff\n'},{background:'#000000\r'}])
  assert.throws(()=>assertContract('OverlayData',{...data,widgets:{...data.widgets,alert:{...data.widgets.alert,...value}}}),/INVALID_REQUEST/)
})


test('OverlayData canonical contract retains old eight-widget settings and validates optional video config',()=>{
 const data=defaultOverlayData(),legacy=structuredClone(data) as any;delete legacy.widgets.video
 assert.deepEqual(assertContract('OverlayData',legacy),legacy)
 for(const video of [null,{}, {...data.widgets.video,theme:'unknown'}])assert.throws(()=>assertContract('OverlayData',{...legacy,widgets:{...legacy.widgets,video}}),/INVALID_REQUEST/)
})
