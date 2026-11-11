import {test} from 'node:test'
import assert from 'node:assert/strict'
import {appPresenceStartSchema,appPresenceHeartbeatSchema} from '../src/app-presence/contracts.js'
test('app presence accepts only connection identity and monotonic sequence inputs',()=>{assert.equal(appPresenceStartSchema.safeParse({connectionId:'11111111-1111-4111-8111-111111111111'}).success,true);for(const v of [{},{connectionId:'bad'},{connectionId:'11111111-1111-4111-8111-111111111111',userId:'forged'}])assert.equal(appPresenceStartSchema.safeParse(v).success,false);for(const sequence of [0,-1,1.5,Number.MAX_SAFE_INTEGER+1])assert.equal(appPresenceHeartbeatSchema.safeParse({sequence}).success,false);assert.equal(appPresenceHeartbeatSchema.safeParse({sequence:1}).success,true)})
