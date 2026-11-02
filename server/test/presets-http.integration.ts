import 'reflect-metadata'
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { Test } from '@nestjs/testing'
import type { NestExpressApplication } from '@nestjs/platform-express'
import { AppModule } from '../src/app.module.js'
import { configureApp } from '../src/http/configure.js'
import { readConfig } from '../src/config/env.js'
import { PrismaService } from '../src/database/prisma.service.js'
import { CLOCK } from '../src/auth/clock.js'
import { authHarness } from './support/auth-flow.js'
const config = readConfig(process.env),
  db = new PrismaService(config),
  h = authHarness(db)
let app: NestExpressApplication,
  base: string,
  a: Awaited<ReturnType<typeof h.signIn>>,
  a2: typeof a,
  b: typeof a
before(async () => {
  await db.onModuleInit()
  const subject = randomUUID()
  a = await h.signIn({ subject })
  a2 = await h.signIn({ subject })
  b = await h.signIn()
  const module = await Test.createTestingModule({
    imports: [AppModule.register({ ...config, auth: h.config })],
  })
    .overrideProvider(CLOCK)
    .useValue(h.clock)
    .compile()
  app = configureApp(
    module.createNestApplication<NestExpressApplication>({ logger: false }),
  )
  await app.listen(0, '127.0.0.1')
  base = await app.getUrl()
})
after(async () => {
  await app?.close()
  await db.onModuleDestroy()
})
const request = (
  path: string,
  options: RequestInit = {},
  user: typeof a | undefined = a,
) =>
  fetch(base + '/v1' + path, {
    ...options,
    headers: {
      'content-type': 'application/json',
      ...(user ? { authorization: 'Bearer ' + user.tokens.access_token } : {}),
      ...options.headers,
    },
  })
const payload = () => ({ schemaVersion: 1, name: 'Cloud HTTP', actions: [] })
test('Preset HTTP endpoints require a native session and reject admin service keys', async () => {
  assert.equal((await fetch(base + '/v1/presets')).status, 401)
  assert.equal((await fetch(base + '/v1/me/settings')).status, 401)
  assert.equal(
    (
      await request('/presets', {
        headers: { authorization: 'Bearer ' + config.adminApiKey },
      })
    ).status,
    401,
  )
})
test('Preset HTTP ETags round-trip across devices and preserve ownership under update/delete', async () => {
  const id = randomUUID(),
    created = await request('/presets/' + id, {
      method: 'PUT',
      headers: { 'if-none-match': '*' },
      body: JSON.stringify(payload()),
    })
  assert.equal(created.status, 201)
  assert.equal(created.headers.get('etag'), '"1"')
  assert.equal((await created.json()).userId, undefined)
  const read = await request('/presets/' + id, {}, a2)
  assert.equal(read.status, 200)
  assert.equal(read.headers.get('etag'), '"1"')
  assert.equal((await request('/presets/' + id, {}, b)).status, 404)
  assert.equal(
    (
      await request(
        '/presets/' + id,
        {
          method: 'PUT',
          headers: { 'if-match': '"1"' },
          body: JSON.stringify(payload()),
        },
        b,
      )
    ).status,
    404,
  )
  const attempts = await Promise.all(
    [1, 2].map((i) =>
      request(
        '/presets/' + id,
        {
          method: 'PUT',
          headers: { 'if-match': '"1"' },
          body: JSON.stringify({ ...payload(), name: 'Device ' + i }),
        },
        i === 1 ? a : a2,
      ),
    ),
  )
  assert.deepEqual(attempts.map((r) => r.status).sort(), [200, 412])
  assert.equal(
    (
      await request('/presets/' + id, {
        method: 'DELETE',
        headers: { 'if-match': '"2"' },
      })
    ).status,
    204,
  )
  assert.equal((await request('/presets/' + id)).status, 404)
})
test('Preset HTTP preconditions, query and body validation reject malformed writes without authority changes', async () => {
  const id = randomUUID()
  assert.equal(
    (
      await request('/presets/' + id, {
        method: 'PUT',
        body: JSON.stringify(payload()),
      })
    ).status,
    428,
  )
  assert.equal(
    (
      await request('/presets/' + id, {
        method: 'PUT',
        headers: { 'if-none-match': '*', 'if-match': '"1"' },
        body: JSON.stringify(payload()),
      })
    ).status,
    400,
  )
  assert.equal(
    (
      await request('/presets/' + id, {
        method: 'PUT',
        headers: { 'if-none-match': '*' },
        body: JSON.stringify({
          ...payload(),
          userId: b.session.userId,
          plan: 'PRO',
        }),
      })
    ).status,
    400,
  )
  assert.equal((await request('/presets?limit=101')).status, 400)
  assert.equal(
    (await request('/presets?limit=1&userId=' + b.session.userId)).status,
    400,
  )
})
test('Settings HTTP follows account identity and strong ETags', async () => {
  const initial = await request('/me/settings')
  assert.equal(initial.status, 200)
  assert.equal(initial.headers.get('etag'), '"0"')
  const save = await request('/me/settings', {
    method: 'PUT',
    headers: { 'if-match': '"0"' },
    body: JSON.stringify({ theme: 'light', language: 'en' }),
  })
  assert.equal(save.status, 200)
  assert.equal(save.headers.get('etag'), '"1"')
  assert.equal(
    (await (await request('/me/settings', {}, a2)).json()).theme,
    'light',
  )
  assert.equal(
    (await (await request('/me/settings', {}, b)).json()).theme,
    'dark',
  )
  assert.equal(
    (
      await request('/me/settings', {
        method: 'PUT',
        headers: { 'if-match': '"0"' },
        body: JSON.stringify({ theme: 'dark', language: 'th' }),
      })
    ).status,
    412,
  )
})

test('Unsupported If-None-Match cannot be ignored on delete or settings update', async () => {
  const id = randomUUID()
  const saved = await request('/presets/' + id, {
    method: 'PUT',
    headers: { 'if-none-match': '*' },
    body: JSON.stringify(payload()),
  })
  assert.equal(saved.status, 201)
  assert.equal(
    (
      await request('/presets/' + id, {
        method: 'DELETE',
        headers: { 'if-match': '"1"', 'if-none-match': '*' },
      })
    ).status,
    400,
  )
  assert.equal((await request('/presets/' + id)).status, 200)
  const settings = await request('/me/settings'),
    tag = settings.headers.get('etag')!
  assert.equal(
    (
      await request('/me/settings', {
        method: 'PUT',
        headers: { 'if-match': tag, 'if-none-match': '*' },
        body: JSON.stringify({ theme: 'dark', language: 'th' }),
      })
    ).status,
    400,
  )
  assert.equal((await request('/me/settings')).headers.get('etag'), tag)
})

test('Preset API saves All gifts without a catalog row and rejects invalid/duplicate hotkeys',async()=>{
 const rule={id:'all',name:'All gifts',trigger:'gift',enabled:true,giftId:'*',threshold:1,minCoins:0,cooldownSeconds:0,comboMode:'each-event',commentMatch:'',hotkey:'',effects:[{kind:'keyboard',keys:['Shift']}]},id=randomUUID();const result=await request('/presets/'+id,{method:'PUT',headers:{'if-none-match':'*'},body:JSON.stringify({...payload(),actions:[rule]})});assert.equal(result.status,201);assert.equal((await (await request('/presets/'+id)).json()).actions[0].giftId,'*')
 for(const hotkeys of [['Control+Control+A'],['Ctrl+J','Control+J']]){const actions=hotkeys.map((hotkey,index)=>({...rule,id:'key'+index,name:'Key',trigger:'hotkey',giftId:'',hotkey}));assert.equal((await request('/presets/'+randomUUID(),{method:'PUT',headers:{'if-none-match':'*'},body:JSON.stringify({...payload(),actions})})).status,400)}
})
