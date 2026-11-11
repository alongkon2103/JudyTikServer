import 'reflect-metadata'
import {test,before,after} from 'node:test'
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {PrismaService} from '../src/database/prisma.service.js'
import {readConfig} from '../src/config/env.js'
import {authHarness} from './support/auth-flow.js'
import {grantTestPro} from './support/pro-account.js'
import {PresetsService} from '../src/presets/service.js'
import {OverlaysService} from '../src/overlays/service.js'
import {SoundpadService} from '../src/soundpad/service.js'
import {WinService} from '../src/win/service.js'
import {EntitlementsAdminService} from '../src/entitlements/admin.service.js'
import {AccountMergeService} from '../src/accounts/merge.service.js'
import {defaultOverlayData} from '../../shared/overlays.js'
import {defaultWinData} from '../../shared/win.js'
import {defaultSoundpadData} from '../../shared/soundpad.js'

const db=new PrismaService(readConfig(process.env)),h=authHarness(db)
const presets=new PresetsService(db,h.clock),overlays=new OverlaysService(db,h.clock),soundpad=new SoundpadService(db,h.clock),win=new WinService(db,h.clock),admin=new EntitlementsAdminService(db,h.clock)
before(()=>db.onModuleInit());after(()=>db.onModuleDestroy())
const rules=(count:number)=>Array.from({length:count},(_,i)=>({id:`rule-${i}`,name:`Rule ${i}`,trigger:'like',giftId:'',threshold:1,minCoins:0,hotkey:'',enabled:true,cooldownSeconds:0,comboMode:'each-event',commentMatch:'',effects:[{kind:'overlay',template:'Hello'}]}))
test('runtime role enforces FREE persistence limits and preserves saved data on revocation',async()=>{
 const {session}=await h.signIn(),id=randomUUID(),body={schemaVersion:1,name:'Preserved',actions:rules(11)}
 await assert.rejects(presets.save(session,id,body,{ifNoneMatch:'*'},randomUUID()),/FREE_ACTION_LIMIT/)
 await assert.rejects(soundpad.save(session,defaultSoundpadData(),'"0"',randomUUID()),/PRO_REQUIRED/)
 await assert.rejects(win.save(session,defaultWinData(),'"0"',randomUUID()),/PRO_REQUIRED/)
 await grantTestPro(db,session.userId,h.clock)
 await presets.save(session,id,body,{ifNoneMatch:'*'},randomUUID())
 await soundpad.save(session,defaultSoundpadData(),'"0"',randomUUID())
 await win.save(session,defaultWinData(),'"0"',randomUUID())
 const data=defaultOverlayData();data.widgets.slider.title='Saved PRO slider'
 await overlays.save(session,data,'"0"',randomUUID())
 await admin.mutate('revoke',{userId:session.userId,source:'test',reason:'Verify downgrade'},randomUUID(),randomUUID())
 assert.equal((await presets.get(session,id)).actions.length,11)
 await presets.save(session,id,body,{ifMatch:'"1"'},randomUUID())
 await presets.save(session,id,{...body,actions:rules(10)},{ifMatch:'"2"'},randomUUID())
 await assert.rejects(presets.save(session,id,body,{ifMatch:'"3"'},randomUUID()),/FREE_ACTION_LIMIT/)
 await assert.rejects(soundpad.save(session,defaultSoundpadData(),'"1"',randomUUID()),/PRO_REQUIRED/)
 await assert.rejects(win.save(session,defaultWinData(),'"1"',randomUUID()),/PRO_REQUIRED/)
 assert.equal((await soundpad.get(session)).revision,'1');assert.equal((await win.get(session)).revision,'1')
 data.widgets.alert.title='FREE edit with saved slider'
 await overlays.save(session,data,'"1"',randomUUID())
 data.widgets.slider.title='Forbidden change'
 await assert.rejects(overlays.save(session,data,'"2"',randomUUID()),/PRO_REQUIRED/)
 assert.equal((await overlays.get(session)).data.widgets.slider.title,'Saved PRO slider')
})
test('FREE archive restore cannot introduce PRO workspaces while original archive remains readable',async()=>{
 const {session}=await h.signIn()
 const row=await db.withUserContext(session.userId,tx=>tx.accountMergeArchive.create({data:{ownerUserId:session.userId,sourceUserId:session.userId,kind:'restore',data:{winWorkspace:{data:JSON.parse(JSON.stringify(defaultWinData()))}}}}))
 const archives=new AccountMergeService(db,h.clock)
 await assert.rejects(archives.restore(session,row.id,{module:'winWorkspace',revision:'0'},randomUUID()),/PRO_REQUIRED/)
 assert.equal((await archives.get(session,row.id)).id,row.id)
 assert.equal((await win.get(session)).revision,'0')
})
