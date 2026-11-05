import {test} from 'node:test'
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {adjustSchema,expirySchema,revokeSchema,targetSchema,historySchema,keySchema,parse} from '../src/entitlements/contracts.js'
import {entitlementState} from '../src/entitlements/entitlements.service.js'
const target={userId:randomUUID()},metadata={source:'admin-postman',reason:'Manual adjustment'}
test('admin entitlement contracts require one account selector, bounded nonzero days and metadata',()=>{
 assert.deepEqual(parse(adjustSchema,{...target,...metadata,days:30}),{...target,...metadata,days:30})
 assert.equal(parse(targetSchema,{email:'Creator@Example.com'}).email,'creator@example.com')
 for(const value of [{},{...target,email:'a@example.com'},{userId:'invalid'},{email:'not-email'},{...target,plan:'PRO'}])assert.throws(()=>parse(targetSchema,value))
 for(const days of [0,1.5,36501,-36501,'30',null])assert.throws(()=>parse(adjustSchema,{...target,...metadata,days}))
 for(const source of ['', 'with spaces','x'.repeat(81)])assert.throws(()=>parse(adjustSchema,{...target,...metadata,days:1,source}))
 assert.throws(()=>parse(adjustSchema,{...target,...metadata,days:1,reason:'\n'}))
 assert.throws(()=>parse(revokeSchema,{...target,...metadata,expiresAt:'2027-01-01T00:00:00Z'}))
 assert.equal(parse(historySchema,target).limit,25)
 for(const limit of ['0','101','abc'])assert.throws(()=>parse(historySchema,{...target,limit}))
})
test('expiry is an explicit timestamp and idempotency keys are bounded service references',()=>{
 assert.equal(parse(expirySchema,{...target,...metadata,expiresAt:'2027-01-01T00:00:00+07:00'}).expiresAt,'2027-01-01T00:00:00+07:00')
 for(const expiresAt of ['2027-01-01','not a date','1999-01-01T00:00:00Z'])assert.throws(()=>parse(expirySchema,{...target,...metadata,expiresAt}))
 assert.equal(parse(keySchema,'order:shop-12345'),'order:shop-12345')
 for(const key of ['', 'short','with space','a'.repeat(129)])assert.throws(()=>parse(keySchema,key))
})
test('FREE/PRO, expiry and 72-hour notification use server time boundaries',()=>{
 const now=new Date('2026-11-05T00:00:00Z'),day=86400000
 assert.equal(entitlementState(null,now).state,'free')
 assert.equal(entitlementState(now,now).state,'expired')
 assert.equal(entitlementState(new Date(+now+3*day),now).state,'expiring')
 assert.equal(entitlementState(new Date(+now+3*day+1),now).state,'active')
})
