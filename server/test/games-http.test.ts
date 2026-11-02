import 'reflect-metadata';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { GamesService } from '../src/games/service.js';
import { GamesController, GameCategoriesController, AdminGameCategoriesController, AdminGamesController } from '../src/games/controller.js';
import { PrismaService } from '../src/database/prisma.service.js';
import { PresetsService } from '../src/presets/service.js';
import { AdminGuard } from '../src/http/admin.guard.js';
import { SessionGuard } from '../src/auth/session.guard.js';
import { AuthService } from '../src/auth/auth.service.js';
import { CONFIG } from '../src/config/env.js';
import { ApiError } from '../src/http/api-error.js';
import { configureApp } from '../src/http/configure.js';
const key = 'a'.repeat(43), audits: any[] = [], versions: any[] = [], imports: any[] = [];
function model() { const rows = new Map<string, any>(); return { rows, async findUnique({ where }: any) { return rows.get(where.id) ?? null; }, async create({ data }: any) { const row = { id: randomUUID(), revision: 1n, version: 1, createdAt: new Date(), updatedAt: new Date(), ...data }; rows.set(row.id, row); return row; }, async update({ where, data }: any) { const old = rows.get(where.id); const row = { ...old, ...data, revision: old.revision + 1n, version: data.version ? old.version + 1 : old.version }; rows.set(row.id, row); return row; }, async findFirst({ where }: any) { return [...rows.values()].find(r => (!where.id || r.id === where.id) && (!where.gameId || r.gameId === where.gameId) && (!where.status || r.status === where.status) && (!where.isDefault || r.isDefault)) ?? null; }, async findMany({ where }: any) { return [...rows.values()].filter(r => (!where.status || r.status === where.status) && (!where.gameId || r.gameId === where.gameId)); }, async count({ where }: any) { return (await this.findMany({ where })).length; } }; }
const tx = { gift: { findMany: async () => [] }, gameCategory: model(), game: model(), gamePreset: model(), gamePresetVersion: { async create({ data }: any) { versions.push(data); return data; }, async findMany({ where }: any) { return versions.filter(v => v.presetId === where.presetId); } }, auditEvent: { async create({ data }: any) { audits.push(data); } }, async $queryRaw() { return []; } };
let app: NestExpressApplication, base: string;
before(async () => { const m = await Test.createTestingModule({ controllers: [GamesController, GameCategoriesController, AdminGameCategoriesController, AdminGamesController], providers: [GamesService, AdminGuard, SessionGuard, { provide: CONFIG, useValue: { adminApiKey: key } }, { provide: PrismaService, useValue: { client: { ...tx, $transaction: async (fn: any) => fn(tx) } } }, { provide: PresetsService, useValue: { async save(actor: any, id: string, payload: any) { imports.push({ actor, id, payload }); return { value: { id, ...payload, revision: '1' }, created: true }; } } }, { provide: AuthService, useValue: { async authenticate(token: string) { if (token !== 'account-session')
                    throw new ApiError(401, 'AUTH_UNAUTHORIZED'); return { userId: randomUUID(), sessionId: randomUUID() }; } } }] }).compile(); app = configureApp(m.createNestApplication<NestExpressApplication>({ logger: false })); await app.listen(0, '127.0.0.1'); base = await app.getUrl(); });
after(async () => app?.close());
async function req(path: string, method = 'GET', body?: unknown, token?: string, revision?: string) { return fetch(base + '/v1' + path, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}), ...(revision ? { 'if-match': '"' + revision + '"' } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }); }
test('HTTP guards separate admin service keys, sessions and public catalog', async () => { assert.equal((await req('/games')).status, 200); assert.equal((await req('/admin/games')).status, 401); assert.equal((await req('/admin/games', 'GET', undefined, 'account-session')).status, 401); assert.equal((await req('/admin/games', 'GET', undefined, key)).status, 200); assert.equal((await req('/games/' + randomUUID() + '/presets/' + randomUUID() + '/import', 'POST', {}, key)).status, 401); });
test('HTTP CRUD ETags prevent stale writes and archive removes public visibility with audit', async () => {
    const created = await req('/admin/games', 'POST', { slug: 'http-game', name: 'HTTP Game' }, key);
    assert.equal(created.status, 201);
    assert.equal(created.headers.get('etag'), '"1"');
    const game = await created.json();
    assert.equal((await req('/games/' + game.id)).status, 404);
    assert.equal((await req('/admin/games/' + game.id, 'PUT', { slug: 'http-game', name: 'Published', status: 'published' }, key)).status, 428);
    const published = await req('/admin/games/' + game.id, 'PUT', { slug: 'http-game', name: 'Published', status: 'published' }, key, '1');
    assert.equal(published.status, 200);
    assert.equal(published.headers.get('etag'), '"2"');
    assert.equal((await req('/games/' + game.id)).status, 200);
    assert.equal((await req('/admin/games/' + game.id, 'DELETE', undefined, key, '1')).status, 412);
    assert.equal((await req('/admin/games/' + game.id, 'DELETE', undefined, key, '2')).status, 200);
    assert.equal((await req('/games/' + game.id)).status, 404);
    assert.deepEqual(audits.filter(a => a.resourceId === game.id).map(a => [a.eventName, a.resourceRevision]), [['game.game.created', 1n], ['game.game.updated', 2n], ['game.game.archived', 3n]]);
});
test('HTTP validates writes, versions presets, refuses game-event imports and copies compatible presets', async () => {
    assert.equal((await req('/admin/games', 'POST', { slug: 'unsafe', name: 'Unsafe', url: 'file:///tmp/a' }, key)).status, 400);
    const game = await (await req('/admin/games', 'POST', { slug: 'preset-game', name: 'Preset game', status: 'published' }, key)).json();
    const payload = { event: 'GAME_EVENT', parameters: { value: 'ไทย', originalIds: [1, 2] } };
    const created = await req('/admin/games/' + game.id + '/presets', 'POST', { slug: 'event', name: 'Original event', format: 'game-event-v1', payload, status: 'published' }, key);
    assert.equal(created.status, 201);
    const preset = await created.json();
    assert.deepEqual(preset.payload, payload);
    assert.equal((await req(`/games/${game.id}/presets/${preset.id}/import`, 'POST', {}, 'account-session')).status, 422);
    assert.equal(imports.length, 0);
    const updated = await req(`/admin/games/${game.id}/presets/${preset.id}`, 'PUT', { slug: 'event', name: 'Revised', format: 'game-event-v1', payload: { ...payload, extra: true }, status: 'published' }, key, '1');
    assert.equal(updated.status, 200);
    const history = await (await req(`/admin/games/${game.id}/presets/${preset.id}/versions`, 'GET', undefined, key)).json();
    assert.equal(history.items.length, 2);
    assert.deepEqual(history.items[0].snapshot.payload, payload);
    const compatible = await (await req(`/admin/games/${game.id}/presets`, 'POST', { slug: 'actions', name: 'Actions', format: 'action-preset-v1', payload: { schemaVersion: 1, name: 'Actions', actions: [] }, status: 'published', isDefault: true }, key)).json();
    const imported = await req(`/games/${game.id}/presets/${compatible.id}/import`, 'POST', { name: 'My copy' }, 'account-session');
    assert.equal(imported.status, 201);
    assert.equal((await imported.json()).preset.name, 'My copy');
    assert.equal(imports.length, 1);
    const noBody = await req(`/games/${game.id}/presets/${compatible.id}/import`, 'POST', undefined, 'account-session');
    assert.equal(noBody.status, 201);
    assert.equal((await noBody.json()).preset.name, 'Actions');
});
test('HTTP converts supported source game commands, exposes import warnings and binds the source revision', async () => {
    const game = await (await req('/admin/games', 'POST', { slug: 'source-import-game', name: 'Source import', status: 'published' }, key)).json();
    const payload = { schemaVersion: 1, sourceFormat: 'tikkies-actions-v1', actions: [
        { id: 'follow', name: 'Follow', enabled: true, cooldownSec: 0, trigger: { type: 'follow' }, responses: [{ type: 'keypress', key: 'num6', modifiers: ['shift'], holdMs: 0 }] },
        { id: 'empty', name: 'Empty source wheel', enabled: true, cooldownSec: 0, trigger: { type: 'follow' }, responses: [{ type: 'randomWheel', branches: [{ prize: '', responses: [] }] }] },
    ] };
    const preset = await (await req(`/admin/games/${game.id}/presets`, 'POST', { slug: 'source', name: 'Source copy', format: 'game-event-v1', payload, status: 'published' }, key)).json();
    const targetId = randomUUID();
    const stale = await req(`/games/${game.id}/presets/${preset.id}/import`, 'POST', { targetId, revision: '2' }, 'account-session');
    assert.equal(stale.status, 412);
    const result = await req(`/games/${game.id}/presets/${preset.id}/import`, 'POST', { targetId, revision: '1' }, 'account-session');
    assert.equal(result.status, 201); assert.equal(result.headers.get('etag'), '"1"');
    const body = await result.json();
    assert.equal(body.preset.id, targetId); assert.equal(body.preset.name, 'Source copy'); assert.equal(body.skippedActions, 1); assert.equal(body.warnings.length, 1);
    assert.deepEqual(body.preset.actions[0].effects, [{ kind: 'keyboard', keys: ['Shift', 'Numpad6'] }]);
});
