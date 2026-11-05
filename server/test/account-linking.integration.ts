import 'reflect-metadata'
import {test,before,after} from 'node:test'
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {Client} from 'pg'
import {PrismaService} from '../src/database/prisma.service.js'
import {readConfig} from '../src/config/env.js'
import {authHarness} from './support/auth-flow.js'
import {AccountMergeService} from '../src/accounts/merge.service.js'
import {AccountsService} from '../src/accounts/accounts.service.js'
import {EntitlementsAdminService} from '../src/entitlements/admin.service.js'
import {EntitlementsService} from '../src/entitlements/entitlements.service.js'
import {defaultWinData} from '../../shared/win.js'
import {defaultSoundpadData} from '../../shared/soundpad.js'
import {defaultTtsData} from '../../shared/tts.js'
import {defaultOverlayData} from '../../shared/overlays.js'
const db=new PrismaService(readConfig(process.env)),h=authHarness(db),merges=new AccountMergeService(db,h.clock),accounts=new AccountsService(db),admin=new EntitlementsAdminService(db,h.clock),rights=new EntitlementsService(db,h.clock)
before(()=>db.onModuleInit());after(()=>db.onModuleDestroy())
const request=()=>randomUUID(),address=()=>randomUUID()+'@example.invalid'
const body={schemaVersion:1,name:'Original Google actions',actions:[{id:'key',name:'Jump',trigger:'gift',enabled:true,giftId:'5655',threshold:1,minCoins:0,cooldownSeconds:0,comboMode:'each-event',commentMatch:'',hotkey:'',effects:[{kind:'keyboard',keys:['Space']}]}]}
const pad=(id:string,name:string)=>({id,name,category:'effect',bindingId:randomUUID(),displayName:name+'.mp3',hotkey:'Control+1'})
test('verified same-email first logins share one account; unverified email cannot link',async()=>{
 const email=address(),a=await h.signIn({provider:'discord',email,verified:true}),unverified=await h.signIn({provider:'google',email,verified:false})
 assert.notEqual(a.session.userId,unverified.session.userId)
 const linked=await h.signIn({provider:'google',email,verified:true})
 assert.equal(linked.session.userId,a.session.userId)
 assert.deepEqual((await accounts.me(a.session)).providers.sort(),['discord','google'])
 assert.equal((await merges.list(a.session)).items.length,0,'new identities do not create empty discarded accounts')
})
test('existing accounts merge atomically with all sets, history, media references, rights and both original configurations',async()=>{
 const email=address(),subject=randomUUID(),primary=await h.signIn({provider:'discord',email,verified:true}),source=await h.signIn({provider:'google',subject,email,verified:false})
 const from=source.session.userId,to=primary.session.userId,presetId=randomUUID(),historyId=randomUUID(),sourcePad=pad(randomUUID(),'Google sound'),primaryPad=pad(randomUUID(),'Discord sound')
 sourcePad.bindingId=primaryPad.bindingId
 const winSource=defaultWinData();winSource.count=11
 const winPrimary=defaultWinData();winPrimary.count=5
 const overlay=defaultOverlayData();overlay.widgets.alert.title='Google alert'
 const tts=defaultTtsData();tts.read.gift=true
 const history=(username:string)=>{const at=h.clock.now().toISOString();return{version:1,id:historyId,sequence:1,username,roomId:'123',title:username,startedAt:at,updatedAt:at,endedAt:at,status:'completed',durationSeconds:0,stats:{peakViewers:1,likes:0,coins:1,followers:0,chats:0,shares:0,giftCount:1,unknownGiftCount:0},gifts:[{id:'5655',name:'Rose',coins:1,count:1,totalCoins:1}],chart:[]}}
 await db.withUserContext(from,async tx=>{
  await tx.actionPreset.create({data:{id:presetId,userId:from,...body}})
  await tx.accountSettings.update({where:{userId:from},data:{theme:'light',language:'es',revision:{increment:1}}})
  await tx.winWorkspace.create({data:{userId:from,data:winSource}})
  await tx.soundpadWorkspace.create({data:{userId:from,data:{...defaultSoundpadData(),pads:[sourcePad]}}})
  await tx.ttsWorkspace.create({data:{userId:from,data:JSON.parse(JSON.stringify(tts))}})
  await tx.overlaysWorkspace.create({data:{userId:from,data:JSON.parse(JSON.stringify(overlay))}})
  await tx.$queryRaw`SELECT set_config('judytik.device_id',${source.session.deviceId},true)`
  await tx.liveHistory.create({data:{userId:from,id:historyId,creatorDeviceId:source.session.deviceId,startedAt:h.clock.now(),data:history('source')}})
 })
 await db.withUserContext(to,async tx=>{
  await tx.winWorkspace.create({data:{userId:to,data:winPrimary}})
  await tx.soundpadWorkspace.create({data:{userId:to,data:{...defaultSoundpadData(),pads:[primaryPad]}}})
  await tx.$queryRaw`SELECT set_config('judytik.device_id',${primary.session.deviceId},true)`
  await tx.liveHistory.create({data:{userId:to,id:historyId,creatorDeviceId:primary.session.deviceId,startedAt:h.clock.now(),data:history('target')}})
 })
 const key=randomUUID(),grantBody={userId:from,days:30,source:'test',reason:'Preserve source order'}
 await admin.mutate('adjust',{userId:to,days:7,source:'test',reason:'Primary order'},randomUUID(),request())
 const prior=await admin.mutate('adjust',grantBody,key,request())
 const linked=await h.signIn({provider:'google',subject,email,verified:true})
 assert.equal(linked.session.userId,to)
 assert.equal((await rights.get(primary.session)).expiresAt,(prior.entitlement as any).expiresAt)
 assert.equal((await accounts.me(linked.session)).email?.address,email)
 await assert.rejects(h.auth.authenticate(source.tokens.access_token),/AUTH_UNAUTHORIZED/)
 const backupList=await merges.list(linked.session),backup=backupList.items.find((row:any)=>row.kind==='source')!
 assert.deepEqual(backupList.linkedAccountIds,[from]);assert.equal(backupList.items.length,2)
 const archive=await merges.get(linked.session,backup.id),data=archive.data as any
 assert.equal(data.settings.language,'es');assert.equal(data.winWorkspace.data.count,11);assert.equal(data.presets[0].id,presetId);assert.equal(data.soundpadWorkspace.data.pads[0].hotkey,'Control+1')
 assert.equal(JSON.stringify(archive).includes('refresh_token'),false)
 await db.withUserContext(to,async tx=>{
  const sets=await tx.actionPreset.findMany({where:{userId:to}});assert.equal(sets.length,1);assert.notEqual(sets[0].id,presetId)
  assert.equal(((await tx.winWorkspace.findUniqueOrThrow({where:{userId:to}})).data as any).count,5)
  const pads=((await tx.soundpadWorkspace.findUniqueOrThrow({where:{userId:to}})).data as any).pads;assert.equal(pads.length,2);assert.notEqual(pads[1].bindingId,sourcePad.bindingId);assert.equal(pads[1].hotkey,'');assert.deepEqual(backupList.mediaAliases[pads[1].bindingId],{owner:from,bindingId:sourcePad.bindingId})
  assert.equal(((await tx.ttsWorkspace.findUniqueOrThrow({where:{userId:to}})).data as any).read.gift,true)
  assert.equal(((await tx.overlaysWorkspace.findUniqueOrThrow({where:{userId:to}})).data as any).widgets.alert.title,'Google alert')
  const histories=await tx.liveHistory.findMany({where:{userId:to}});assert.equal(histories.length,2);assert.equal(new Set(histories.map(r=>r.id)).size,2)
 })
 await db.withUserContext(from,async tx=>{assert.equal((await tx.actionPreset.findUniqueOrThrow({where:{id:presetId}})).name,body.name);assert.equal(await tx.liveHistory.count({where:{userId:from}}),1)})
 const again=await h.signIn({provider:'google',subject,email,verified:true});assert.equal(again.session.userId,to);assert.equal((await merges.list(again.session)).items.length,2)
 assert.equal((await admin.get({userId:from})).userId,to)
 assert.equal((await admin.mutate('adjust',grantBody,key,request())).replayed,true,'old API retries do not grant again after merge')
 assert.equal((await admin.history({userId:to})).items.length,2)
 await merges.restore(linked.session,backup.id,{module:'winWorkspace',revision:'1'},request())
 assert.equal(((await db.withUserContext(to,tx=>tx.winWorkspace.findUniqueOrThrow({where:{userId:to}}))).data as any).count,11)
 await assert.rejects(merges.restore(linked.session,backup.id,{module:'winWorkspace',revision:'1'},request()),/ACCOUNT_RESTORE_CONFLICT/)
 const restored=await merges.list(linked.session);assert.ok(restored.items.some((row:any)=>row.kind==='restore'))
 const other=await h.signIn();await assert.rejects(merges.get(other.session,backup.id),/NOT_FOUND/);await assert.rejects(merges.restore(other.session,backup.id,{module:'winWorkspace',revision:'1'},request()),/NOT_FOUND/)
 await assert.rejects(db.client.accountMergeArchive.deleteMany({where:{ownerUserId:to}}))
})
test('concurrent fresh Google and Discord sign-ins with verified email choose one canonical account',async()=>{
 const email=address(),[google,discord]=await Promise.all([h.signIn({provider:'google',email,verified:true}),h.signIn({provider:'discord',email,verified:true})])
 assert.equal(google.session.userId,discord.session.userId)
})
test('an audit failure rolls back account linking, snapshots, copies and session revocation together',async()=>{
 const email=address(),subject=randomUUID(),primary=await h.signIn({provider:'discord',email,verified:true}),source=await h.signIn({provider:'google',subject,email,verified:false}),id=randomUUID()
 await db.withUserContext(source.session.userId,tx=>tx.actionPreset.create({data:{id,userId:source.session.userId,...body}}))
 const owner=new Client({connectionString:process.env.TEST_ADMIN_DATABASE_URL});await owner.connect()
 try{
  await owner.query(`CREATE FUNCTION judytik.test_merge_audit_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.event_name='account.merged' THEN RAISE EXCEPTION 'test merge audit failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER test_merge_audit_fail BEFORE INSERT ON judytik.audit_events FOR EACH ROW EXECUTE FUNCTION judytik.test_merge_audit_fail()`)
  try{await assert.rejects(h.signIn({provider:'google',subject,email,verified:true}))}finally{await owner.query('DROP TRIGGER test_merge_audit_fail ON judytik.audit_events; DROP FUNCTION judytik.test_merge_audit_fail()')}
  assert.equal((await h.auth.authenticate(source.tokens.access_token)).userId,source.session.userId)
  assert.equal((await merges.list(primary.session)).items.length,0)
  assert.equal(await db.withUserContext(primary.session.userId,tx=>tx.actionPreset.count({where:{userId:primary.session.userId}})),0)
  assert.equal(await db.withUserContext(source.session.userId,tx=>tx.actionPreset.count({where:{id}})),1)
 }finally{await owner.end()}
})
