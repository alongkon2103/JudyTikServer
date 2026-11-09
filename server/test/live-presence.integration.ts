import 'reflect-metadata';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/http/configure.js';
import { readConfig } from '../src/config/env.js';
import { PrismaService } from '../src/database/prisma.service.js';
import { CLOCK } from '../src/auth/clock.js';
import { authHarness } from './support/auth-flow.js';
const config = readConfig(process.env), db = new PrismaService(config), h = authHarness(db), owner = new Client({ connectionString: process.env.TEST_ADMIN_DATABASE_URL });
type Account = Awaited<ReturnType<typeof h.signIn>>;
let app: NestExpressApplication, base: string;
const profile = { displayName: 'LIVE host', avatarUrl: null, viewers: 42 };
const startData = (patch: Record<string, unknown> = {}) => ({ connectionId: randomUUID(), username: 'creator.test', roomId: '1234567890123456789', ...profile, ...patch });
const call = (a: Account, path: string, method = 'GET', body?: unknown) => fetch(base + '/v1' + path, { method, headers: { authorization: 'Bearer ' + a.tokens.access_token, 'content-type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
const start = (a: Account, data: unknown = startData()) => call(a, '/me/live-presence', 'POST', data);
const beat = (a: Account, id: string, sequence: number, patch = {}) => call(a, '/me/live-presence/' + id, 'PUT', { sequence, ...profile, ...patch });
const stop = (a: Account, id: string) => call(a, '/me/live-presence/' + id, 'DELETE');
const list = async (a: Account) => (await call(a, '/live/active')).json();
before(async () => { await db.onModuleInit(); await owner.connect(); const module = await Test.createTestingModule({ imports: [AppModule.register({ ...config, auth: h.config })] }).overrideProvider(CLOCK).useValue(h.clock).compile(); app = configureApp(module.createNestApplication<NestExpressApplication>({ logger: false })); await app.listen(0, '127.0.0.1'); base = await app.getUrl(); });
after(async () => { await app?.close(); await db.onModuleDestroy(); await owner.end(); });
test('presence starts a 90 second lease and retries never overwrite or extend it', async () => { const a = await h.signIn(), data = startData(); const response = await start(a, data); assert.equal(response.status, 200); const lease = await response.json(); assert.deepEqual(lease, { connectionId: data.connectionId, expiresAt: new Date(+h.clock.now() + 90000).toISOString(), heartbeatAfterMs: 30000 }); h.clock.advance(1000); assert.deepEqual(await (await start(a, { ...data, viewers: 99 })).json(), lease); assert.equal((await list(a)).items.find((x: any) => x.username === data.username).viewers, 42); });
test('presence requires desktop authorization for every method', async () => { for (const [path, method] of [['/live/active', 'GET'], ['/me/live-presence', 'POST'], ['/me/live-presence/' + randomUUID(), 'PUT'], ['/me/live-presence/' + randomUUID(), 'DELETE']])
    assert.equal((await fetch(base + '/v1' + path, { method })).status, 401); });
test('presence rejects unknown keys and unsafe profiles', async () => { const a = await h.signIn(); for (const patch of [{ username: 'UPPER' }, { username: 'a' }, { roomId: '00000000' }, { roomId: '123' }, { viewers: -1 }, { viewers: 1.2 }, { viewers: 1000000001 }, { displayName: '' }, { avatarUrl: 'https://evil.test/a' }, { avatarUrl: 'http://p16.tiktokcdn.com/a' }, { userId: randomUUID() }])
    assert.equal((await start(a, startData(patch))).status, 400, JSON.stringify(patch)); assert.equal((await beat(a, randomUUID(), 0)).status, 400); });
test('presence heartbeats are monotonic and stale traffic cannot refresh expiry', async () => { const a = await h.signIn(), data = startData({ username: 'sequence.test' }); await start(a, data); h.clock.advance(1000); const lease = await (await beat(a, data.connectionId, 3, { viewers: 8 })).json(); h.clock.advance(1000); for (const seq of [3, 2, 1])
    assert.deepEqual(await (await beat(a, data.connectionId, seq, { viewers: 1000 })).json(), lease); assert.equal((await list(a)).items.find((x: any) => x.username === data.username).viewers, 8); h.clock.advance(90000); assert.equal((await beat(a, data.connectionId, 4)).status, 404); assert.ok(!(await list(a)).items.some((x: any) => x.username === data.username)); });
test('presence stop tombstones and stale stop or heartbeat cannot mutate a replacement', async () => { const a = await h.signIn(), b = await h.signIn(), old = startData(), next = startData({ username: 'replacement.test' }); await start(a, old); assert.equal((await beat(b, old.connectionId, 1)).status, 404); assert.equal((await stop(a, old.connectionId)).status, 204); assert.equal((await stop(a, old.connectionId)).status, 204); const closed = await start(a, old); assert.equal(closed.status, 409); assert.equal((await closed.json()).error.code, 'PRESENCE_LEASE_CLOSED'); await start(a, next); await stop(a, old.connectionId); assert.equal((await beat(a, old.connectionId, 2)).status, 404); assert.equal((await beat(a, next.connectionId, 1)).status, 200); });
test('presence concurrent sequences converge to greatest sequence with a single session row', async () => { const a = await h.signIn(), data = startData({ username: 'concurrent.test' }); await start(a, data); assert.deepEqual((await Promise.all([4, 2, 5, 1, 3].map(n => beat(a, data.connectionId, n, { viewers: n })))).map(r => r.status), [200, 200, 200, 200, 200]); assert.equal((await list(a)).items.find((x: any) => x.username === data.username).viewers, 5); const rows = await owner.query('SELECT sequence FROM judytik.live_presences WHERE session_id=$1', [a.session.sessionId]); assert.equal(rows.rowCount, 1); assert.equal(Number(rows.rows[0].sequence), 5); });
test('directory uses latest report per channel without summing and exposes only public fields', async () => { h.clock.advance(90001); const a = await h.signIn(), b = await h.signIn(), reader = await h.signIn(); await start(a, startData({ username: 'dedup.test', viewers: 999 })); h.clock.advance(1); await start(b, startData({ username: 'dedup.test', viewers: 3 })); await start(reader, startData({ username: 'highest.test', viewers: 10 })); const directory = await list(reader); assert.equal(directory.refreshAfterMs, 30000); assert.equal(directory.serverTime, h.clock.now().toISOString()); assert.deepEqual(directory.items.map((x: any) => [x.username, x.viewers]), [['highest.test', 10], ['dedup.test', 3]]); assert.deepEqual(Object.keys(directory.items[0]).sort(), ['username', 'roomId', 'displayName', 'avatarUrl', 'viewers', 'lastSeenAt'].sort()); });
test('directory immediately excludes revoked and expired sessions and disabled or merged accounts', async () => { h.clock.advance(90001); const reader = await h.signIn(); for (const kind of ['revoked', 'expired', 'disabled', 'merged']) {
    const a = await h.signIn();
    await start(a, startData({ username: kind + '.test' }));
    if (kind === 'revoked')
        await owner.query('UPDATE judytik.sessions SET revoked_at=$2 WHERE id=$1', [a.session.sessionId, h.clock.now()]);
    if (kind === 'expired')
        await owner.query("UPDATE judytik.sessions SET created_at=$2::timestamptz-interval '1 second',expires_at=$2 WHERE id=$1", [a.session.sessionId, h.clock.now()]);
    if (kind === 'disabled')
        await owner.query('UPDATE judytik.users SET disabled_at=$2 WHERE id=$1', [a.session.userId, h.clock.now()]);
    if (kind === 'merged')
        await owner.query('UPDATE judytik.users SET merged_into_id=$2,merged_at=$3 WHERE id=$1', [a.session.userId, reader.session.userId, h.clock.now()]);
} assert.deepEqual((await list(reader)).items, []); });
test('presence database RLS denies cross owner writes and no-context writes or deletion', async () => { const a = await h.signIn(), b = await h.signIn(), data = startData(); await start(a, data); assert.equal(await db.withUserContext(b.session.userId, tx => tx.$executeRaw `UPDATE judytik.live_presences SET viewers=99 WHERE session_id=${a.session.sessionId}::uuid`), 0); assert.equal(await db.client.$executeRaw `UPDATE judytik.live_presences SET viewers=99 WHERE session_id=${a.session.sessionId}::uuid`, 0); await assert.rejects(() => db.withUserContext(a.session.userId, tx => tx.$executeRaw `DELETE FROM judytik.live_presences WHERE session_id=${a.session.sessionId}::uuid`)); await assert.rejects(() => db.withUserContext(a.session.userId, tx => tx.$executeRaw `UPDATE judytik.live_presences SET session_id=${b.session.sessionId}::uuid WHERE session_id=${a.session.sessionId}::uuid`)); });
test('directory caps results at 50 with stable ties and null viewers last', async () => {
    h.clock.advance(90001);
    const a = await h.signIn();
    const now = h.clock.now();
    for (let i = 0; i < 53; i++) {
        const id = randomUUID();
        await owner.query('INSERT INTO judytik.sessions(id,user_id,device_id,created_at,expires_at) VALUES($1,$2,$3,$4,$5)', [id, a.session.userId, a.session.deviceId, now, new Date(+now + 3600000)]);
        await owner.query('INSERT INTO judytik.live_presences(session_id,connection_id,username,room_id,display_name,avatar_url,viewers,sequence,active,expires_at,last_seen_at) VALUES($1,$2,$3,$4,$5,NULL,$6,0,true,$7,$8)', [id, randomUUID(), 'channel.' + String(i).padStart(2, '0'), '1234567890123456', 'Host', i === 0 ? null : 10, new Date(+now + 90000), now]);
    }
    const first = await list(a), second = await list(a);
    assert.equal(first.items.length, 50);
    assert.deepEqual(first.items, second.items);
    assert.deepEqual(first.items.map((x: any) => x.username), Array.from({ length: 50 }, (_, i) => 'channel.' + String(i + 1).padStart(2, '0')));
});
test('real verified account merge removes source lease and permits fresh target session presence', async () => {
    h.clock.advance(90001);
    const email = randomUUID() + '@example.invalid', subject = randomUUID(), target = await h.signIn({ provider: 'discord', email, verified: true }), source = await h.signIn({ provider: 'google', subject, email, verified: false }), data = startData({ username: 'merge.source' });
    assert.equal((await start(source, data)).status, 200);
    const merged = await h.signIn({ provider: 'google', subject, email, verified: true });
    assert.equal(merged.session.userId, target.session.userId);
    assert.ok(!(await list(target)).items.some((x: any) => x.username === 'merge.source'));
    assert.equal((await beat(source, data.connectionId, 1)).status, 401);
    assert.equal((await start(merged, startData({ username: 'merge.target' }))).status, 200);
    const columns = await owner.query("SELECT column_name FROM information_schema.columns WHERE table_schema='judytik' AND table_name='live_presences'");
    assert.ok(!columns.rows.some((r: any) => r.column_name === 'user_id'), 'presence owner must derive only from Session');
});

test('used connection IDs survive replacements and cannot resurrect a stopped or superseded lease', async () => {
    const a = await h.signIn(), first = startData({username:'retired.first'}), second = startData({username:'current.second'}), third = startData({username:'current.third'});
    assert.equal((await start(a, first)).status, 200);
    assert.equal((await stop(a, first.connectionId)).status, 204);
    const secondResponse = await start(a, second);
    assert.equal(secondResponse.status, 200);
    const secondLease = await secondResponse.json();
    const stale = await start(a, first);
    assert.equal(stale.status, 409);
    assert.equal((await stale.json()).error.code, 'PRESENCE_LEASE_CLOSED');
    assert.deepEqual(await (await start(a, second)).json(), secondLease);
    assert.equal((await start(a, third)).status, 200);
    assert.equal((await start(a, second)).status, 409, 'a superseded connection is also retired');
    assert.equal((await beat(a, third.connectionId, 1)).status, 200);
});

test('used connection history is owner scoped, append-only, and cascades with its session', async () => {
    const a = await h.signIn(), b = await h.signIn(), data = startData();
    assert.equal((await start(a, data)).status, 200);
    assert.equal((await db.withUserContext(a.session.userId, tx => tx.livePresenceConnection.findMany({where:{sessionId:a.session.sessionId}}))).length, 1);
    assert.equal((await db.withUserContext(b.session.userId, tx => tx.livePresenceConnection.findMany({where:{sessionId:a.session.sessionId}}))).length, 0);
    assert.equal((await db.client.$queryRaw<any[]>`SELECT * FROM judytik.live_presence_connections`).length, 0);
    await assert.rejects(() => db.withUserContext(b.session.userId, tx => tx.livePresenceConnection.create({data:{sessionId:a.session.sessionId,connectionId:randomUUID()}})));
    await assert.rejects(() => db.withUserContext(a.session.userId, tx => tx.$executeRaw`DELETE FROM judytik.live_presence_connections WHERE session_id=${a.session.sessionId}::uuid`));
    await assert.rejects(() => db.withUserContext(a.session.userId, tx => tx.$executeRaw`UPDATE judytik.live_presence_connections SET connection_id=${randomUUID()}::uuid WHERE session_id=${a.session.sessionId}::uuid`));
    await owner.query('DELETE FROM judytik.sessions WHERE id=$1',[a.session.sessionId]);
    assert.equal((await owner.query('SELECT * FROM judytik.live_presence_connections WHERE session_id=$1',[a.session.sessionId])).rowCount,0);
    assert.equal((await owner.query('SELECT * FROM judytik.live_presences WHERE session_id=$1',[a.session.sessionId])).rowCount,0);
});

test('stopping a not-yet-arrived connection reserves its tombstone without disturbing the current lease', async () => {
    const a = await h.signIn(), b = await h.signIn(), current = startData(), delayed = startData();
    assert.equal((await start(a, current)).status, 200);
    assert.equal((await stop(a, delayed.connectionId)).status, 204);
    const response = await start(a, delayed);
    assert.equal(response.status, 409);
    assert.equal((await response.json()).error.code, 'PRESENCE_LEASE_CLOSED');
    assert.equal((await beat(a, current.connectionId, 1)).status, 200);
    assert.equal((await start(b, delayed)).status, 200, 'retirement is scoped to the authenticated session');
});

test('UUID case aliases retain idempotency and refer to the same lease on heartbeat and stop', async () => {
    const a = await h.signIn(), data = startData();
    const uppercase = {...data,connectionId:data.connectionId.toUpperCase()};
    const lease = await (await start(a, data)).json();
    assert.equal((await start(a, uppercase)).status, 200);
    assert.deepEqual(await (await start(a, uppercase)).json(),lease);
    assert.equal((await beat(a, uppercase.connectionId, 1)).status, 200);
    assert.equal((await stop(a, uppercase.connectionId)).status, 204);
    assert.equal((await beat(a, data.connectionId, 2)).status, 404);
});
