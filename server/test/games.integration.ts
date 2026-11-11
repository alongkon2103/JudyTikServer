import 'reflect-metadata';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { Client } from 'pg';
import { authHarness } from './support/auth-flow.js';
import { PrismaService } from '../src/database/prisma.service.js';
import { readConfig } from '../src/config/env.js';
import { GamesService } from '../src/games/service.js';
import { PresetsService } from '../src/presets/service.js';
const db = new PrismaService(readConfig(process.env)), service = new GamesService(db, new PresetsService(db),{require:async()=>{}} as any), requestId = randomUUID();
before(() => db.onModuleInit());
after(() => db.onModuleDestroy());
test('Postgres runtime catalog mutations enforce revision conflicts, rollback reorder and retain immutable preset history', async () => {
    const slug = 'integration-' + randomUUID();
    const category = await service.save('category', undefined, { slug, name: 'Category' }, undefined, requestId);
    const game = await service.save('game', undefined, { slug, name: 'Game', categoryId: category.id, status: 'published' }, undefined, requestId);
    assert.equal((await service.get(game.id)).name, 'Game');
    const concurrent = await Promise.allSettled(['First', 'Second'].map(name => service.save('game', game.id, { slug, name, categoryId: category.id, status: 'published' }, '"1"', requestId)));
    assert.equal(concurrent.filter(r => r.status === 'fulfilled').length, 1);
    assert.equal(concurrent.filter(r => r.status === 'rejected' && (r.reason as any).code === 'GAME_VERSION_CONFLICT').length, 1);
    const other = await service.save('game', undefined, { slug: slug + '-other', name: 'Other', status: 'published' }, undefined, requestId);
    await assert.rejects(() => service.reorder('game', { items: [{ id: game.id, revision: '2', sortOrder: 30 }, { id: other.id, revision: '999', sortOrder: 40 }] }, requestId));
    assert.equal((await service.get(game.id)).sortOrder, 0);
    const payload = { event: 'GAME_EVENT', parameters: { amount: 8, original: ['ไทย', 1] } };
    const preset = await service.save('preset', undefined, { slug: 'default', name: 'Original', format: 'game-event-v1', payload, status: 'published', isDefault: true }, undefined, requestId, game.id);
    await service.save('preset', preset.id, { slug: 'default', name: 'Updated', format: 'game-event-v1', payload: { ...payload, extra: true }, status: 'published', isDefault: true }, '"1"', requestId, game.id);
    await service.remove('preset', preset.id, '"2"', requestId, game.id);
    const versions = await service.versions(game.id, preset.id);
    assert.equal(versions.items.length, 3);
    assert.equal(versions.items[0].snapshot.status, 'archived');
    assert.deepEqual(versions.items[2].snapshot.payload, payload);
    const paged = await service.versions(game.id, preset.id, { page: 1, pageSize: 1 });
    assert.equal(paged.items.length, 1);
    assert.equal(paged.hasMore, true);
    const audit = await db.client.auditEvent.findMany({ where: { requestId, resourceId: preset.id }, orderBy: { id: 'asc' } });
    assert.deepEqual(audit.map(x => x.resourceRevision), [1n, 2n, 3n]);
    await service.remove('category', category.id, '"1"', requestId);
    await assert.rejects(() => service.get(game.id), e => (e as any).code === 'GAME_NOT_FOUND');
});

test('all Judy game presets import into real account storage with catalog warnings, retry safety and account isolation', async () => {
    const admin = new Client({ connectionString: process.env.TEST_ADMIN_DATABASE_URL });
    await admin.connect();
    const seededIds: string[] = [], previous: { id: string; aliases: string[] }[] = [];
    try {
        const source = JSON.parse(readFileSync(new URL('../data/judy-games-catalog-source.json', import.meta.url), 'utf8'));
        const named: Record<string, string> = { Overreact: '19447', 'Finger Heart': '5487', 'Friendship Necklace': '9947', Rosa: '8913', Rose: '5655', Perfume: '5658', Doughnut: '5879', 'Slow motion': '19448' };
        // These three original IDs are absent from the current production catalog; do not rebind them by name.
        const unavailable = new Set(['166996', '53781', '13458']);
        const gifts = new Map<string, Set<string>>();
        for (const game of source.games) for (const preset of game.presets) for (const rule of preset.payload.actions) {
            if (rule.trigger.type !== 'gift') continue;
            const id = String(rule.trigger.giftId ?? named[rule.trigger.giftName]);
            if (unavailable.has(id)) continue;
            if (!gifts.has(id)) gifts.set(id, new Set());
            gifts.get(id)!.add(rule.trigger.giftName);
        }
        seededIds.push(...gifts.keys());
        previous.push(...(await admin.query('SELECT id, aliases FROM judytik.gifts WHERE id = ANY($1::text[])', [seededIds])).rows);
        for (const [id, names] of gifts) await admin.query('INSERT INTO judytik.gifts(id,aliases,search_text) VALUES($1,$2,$3) ON CONFLICT(id) DO UPDATE SET aliases=EXCLUDED.aliases', [id, [...names], [...names].join(' ')]);
        const h = authHarness(db), account = await h.signIn({ provider: 'discord' }), other = await h.signIn({ provider: 'discord' });
        const presets = new PresetsService(db);
        let importedRules = 0, importedEffects = 0, skipped = 0, warnings = 0;
        for (const original of source.games) {
            const game = await service.save('game', undefined, { slug: 'import-' + randomUUID(), name: original.name, status: 'published' }, undefined, randomUUID());
            const src = original.presets[0];
            const preset = await service.save('preset', undefined, { slug: 'default', name: src.name, format: src.format, payload: src.payload, status: 'published', isDefault: true }, undefined, randomUUID(), game.id);
            const targetId = randomUUID(), input = { targetId, revision: preset.revision };
            const first = await service.importPreset(account.session, game.id, preset.id, input, randomUUID());
            const retry = await service.importPreset(account.session, game.id, preset.id, input, randomUUID());
            assert.deepEqual(retry, first); assert.equal(first.preset.revision, '1');
            assert.deepEqual((await presets.get(account.session, targetId)), first.preset);
            await assert.rejects(presets.get(other.session, targetId), /PRESET_NOT_FOUND/);
            await assert.rejects(service.importPreset(other.session, game.id, preset.id, input, randomUUID()), /PRESET_NOT_FOUND/);
            importedRules += first.preset.actions.length; importedEffects += first.preset.actions.reduce((n, a) => n + a.effects.length, 0); skipped += first.skippedActions; warnings += first.warnings.length;
            assert.deepEqual((await service.preset(game.id, preset.id,true)).payload, src.payload);
        }
        assert.deepEqual({ importedRules, importedEffects, skipped, warnings }, { importedRules: 234, importedEffects: 238, skipped: 5, warnings: 5 });
        assert.equal((await presets.list(account.session, { limit: 100 })).items.length, 19);
    } finally {
        await admin.query('DELETE FROM judytik.gifts WHERE id = ANY($1::text[])', [seededIds.filter(id => !previous.some(row => row.id === id))]);
        for (const row of previous) await admin.query('UPDATE judytik.gifts SET aliases=$2 WHERE id=$1', [row.id, row.aliases]);
        await admin.end();
    }
});
