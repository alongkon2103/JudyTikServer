import 'reflect-metadata';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { convertGamePreset } from '../src/games/import.js';
import { GamesService } from '../src/games/service.js';
import { ApiError } from '../src/http/api-error.js';
const catalog = JSON.parse(readFileSync(new URL('../data/judy-games-catalog-source.json', import.meta.url), 'utf8'));
const nameIds: Record<string, string> = { Overreact: '19447', 'Finger Heart': '5487', 'Friendship Necklace': '9947', Rosa: '8913', Rose: '5655', Perfume: '5658', Doughnut: '5879', 'Slow motion': '19448' };
const gifts = [...new Map(catalog.games.flatMap((game: any) => game.presets.flatMap((preset: any) => preset.payload.actions.filter((a: any) => a.trigger.type === 'gift').map((a: any) => ({ id: String(a.trigger.giftId ?? nameIds[a.trigger.giftName]), nameOverride: null, aliases: [], regions: [{ providerName: a.trigger.giftName }] })))).map((gift: any) => [gift.id, gift])).values()] as any[];
const source = () => structuredClone(catalog.games[0].presets[0].payload);
test('all 19 authoritative presets convert losslessly: 237 rules, 241 keypresses, only 2 empty no-ops skipped', () => {
    let rules = 0, effects = 0, skipped = 0, warnings = 0;
    assert.equal(catalog.games.length, 19);
    for (const game of catalog.games) for (const preset of game.presets) {
        const before = structuredClone(preset.payload), converted = convertGamePreset(preset.format, preset.payload, preset.name, gifts);
        assert.deepEqual(preset.payload, before);
        rules += converted.payload.actions.length; effects += converted.payload.actions.reduce((n, a) => n + a.effects.length, 0); skipped += converted.skippedActions; warnings += converted.warnings.length;
        for (const rule of converted.payload.actions) {
            const original = before.actions.find((a: any) => a.id === rule.id);
            assert.equal(rule.enabled, original.enabled); assert.equal(rule.cooldownSeconds, original.cooldownSec); assert.equal(rule.comboMode, 'each-event');
            if (rule.trigger === 'gift') { assert.equal(rule.giftId, String(original.trigger.giftId ?? nameIds[original.trigger.giftName])); assert.equal(rule.threshold, 1); assert.equal(rule.minCoins, original.trigger.minDiamonds); }
            if (rule.trigger === 'like') { assert.equal(rule.threshold, original.trigger.likeThreshold); assert.equal(rule.likeScope, original.trigger.likeMode === 'total' ? 'room' : 'user'); }
        }
    }
    assert.deepEqual({ rules, effects, skipped, warnings }, { rules: 237, effects: 241, skipped: 2, warnings: 2 });
});
test('conversion preserves top-row, numpad, modifiers and response order', () => {
    const input = source(); input.actions = [input.actions[0]];
    input.actions[0].responses = [{ type: 'keypress', key: '1', modifiers: ['ctrl'], holdMs: 0 }, { type: 'keypress', key: 'num8', modifiers: ['shift'], holdMs: 0 }, { type: 'keypress', key: 'g', modifiers: [], holdMs: 0 }];
    assert.deepEqual(convertGamePreset('game-event-v1', input, 'Keys').payload.actions[0].effects, [{ kind: 'keyboard', keys: ['Control', 'Digit1'] }, { kind: 'keyboard', keys: ['Shift', 'Numpad8'] }, { kind: 'keyboard', keys: ['G'] }]);
});
test('unsupported semantics reject whole preset without silently changing a command', () => {
    const changes = [(a: any) => { a.responses[0].holdMs = 1000; }, (a: any) => { a.responses[0].key = 'unknown'; }, (a: any) => { a.responses[0].modifiers = ['ctrl', 'ctrl']; }, (a: any) => { a.responses = [{ type: 'randomWheel', branches: [{ prize: 'Win', responses: [] }] }]; }, (a: any) => { a.responses = [{ type: 'webhook', url: 'https://example.com' }]; }, (a: any) => { a.trigger.repeatCombo = false; }, (a: any) => { a.trigger.extra = true; }];
    for (const change of changes) { const input = source(); change(input.actions[0]); assert.throws(() => convertGamePreset('game-event-v1', input, 'Invalid'), /GAME_PRESET_INCOMPATIBLE/); }
    const duplicate = source(); duplicate.actions.push(duplicate.actions[0]); assert.throws(() => convertGamePreset('game-event-v1', duplicate, 'Duplicate'));
    assert.throws(() => convertGamePreset('game-event-v1', { actions: [] }, 'Missing marker'));
});
test('native presets still import with validation and chosen name', () => {
    assert.deepEqual(convertGamePreset('action-preset-v1', { schemaVersion: 1, name: 'Original', actions: [] }, 'Copy'), { payload: { schemaVersion: 1, name: 'Copy', actions: [] }, warnings: [], skippedActions: 0 });
});
function harness() {
    const rows = new Map<string, any>(), writes: any[] = [], actor = { userId: randomUUID(), sessionId: randomUUID() } as any;
    const row = { id: randomUUID(), revision: '1', name: 'Judy Climb', format: 'game-event-v1', payload: source() };
    const presets = { async save(user: any, id: string, payload: any) { if (rows.has(user.userId + id)) throw new ApiError(412, 'PRESET_VERSION_CONFLICT'); const value = { id, ...payload, revision: '1' }; rows.set(user.userId + id, value); writes.push(value); return { value }; }, async get(user: any, id: string) { const value = rows.get(user.userId + id); if (!value) throw new ApiError(404, 'PRESET_NOT_FOUND'); return value; } };
    const service = new GamesService({ client: { gift: { findMany: async () => gifts } } } as any, presets as any); service.preset = async () => structuredClone(row);
    return { service, row, rows, writes, actor };
}
test('import creates independent saved preset and retries without another write or overwriting edits', async () => {
    const h = harness(), targetId = randomUUID(), request = { targetId, revision: '1' };
    const first = await h.service.importPreset(h.actor, randomUUID(), h.row.id, request, randomUUID());
    const retry = await h.service.importPreset(h.actor, randomUUID(), h.row.id, request, randomUUID());
    assert.equal(first.preset.id, targetId); assert.deepEqual(first, retry); assert.equal(h.writes.length, 1);
    assert.notDeepEqual(first.preset.actions, h.row.payload.actions);
    h.rows.get(h.actor.userId + targetId).name = 'User edits';
    await assert.rejects(h.service.importPreset(h.actor, randomUUID(), h.row.id, request, randomUUID()), /PRESET_VERSION_CONFLICT/);
    assert.equal(h.rows.get(h.actor.userId + targetId).name, 'User edits');
});
test('stale source, bad request and unsupported source produce no saved copy', async () => {
    const h = harness();
    for (const request of [{ targetId: randomUUID(), revision: '2' }, { targetId: 'unsafe' }, { unknown: true }]) await assert.rejects(h.service.importPreset(h.actor, randomUUID(), h.row.id, request, randomUUID()));
    h.row.payload.actions[0].responses[0].holdMs = 12;
    await assert.rejects(h.service.importPreset(h.actor, randomUUID(), h.row.id, {}, randomUUID()), /GAME_PRESET_INCOMPATIBLE/);
    assert.equal(h.writes.length, 0);
});

test('gift names resolve only one exact normalized catalog identity; missing explicit IDs never silently rebind', () => {
    const input = source(); input.actions = [input.actions[0]]; const trigger = input.actions[0].trigger; delete trigger.giftId; trigger.giftName = '  ROSE  ';
    assert.equal(convertGamePreset('game-event-v1', input, 'Names', gifts).payload.actions[0].giftId, '5655');
    assert.throws(() => convertGamePreset('game-event-v1', input, 'Names', []), /GAME_GIFT_NOT_FOUND/);
    assert.throws(() => convertGamePreset('game-event-v1', input, 'Names', [...gifts, { id: '9999999', nameOverride: 'Rose', aliases: [], regions: [] }]), /GAME_GIFT_AMBIGUOUS/);
    trigger.giftId = 9999999;
    const skipped = convertGamePreset('game-event-v1', input, 'Names', gifts);
    assert.equal(skipped.payload.actions.length, 0); assert.equal(skipped.skippedActions, 1); assert.match(skipped.warnings[0], /9999999/);
});

test('warnings stay at one bounded entry per action even with 20 empty responses and an unavailable gift', () => {
    const input = source(), rule = input.actions[0];
    rule.name = 'ก'.repeat(80); rule.trigger.giftName = 'ข'.repeat(160); rule.trigger.giftId = Number.MAX_SAFE_INTEGER;
    const wheel = { type: 'randomWheel', branches: [{ prize: '', responses: [] }] };
    input.actions = Array.from({ length: 100 }, (_, i) => ({ ...structuredClone(rule), id: ('a' + i).padEnd(64, '_'), responses: Array.from({ length: 20 }, () => structuredClone(wheel)) }));
    let result = convertGamePreset('game-event-v1', input, 'Bounded warnings', []);
    assert.equal(result.warnings.length, 100); assert.equal(result.skippedActions, 100); assert.equal(result.payload.actions.length, 0);
    for (const warning of result.warnings) { assert.ok(warning.length <= 500); assert.match(warning, /วงล้อว่าง/); assert.match(warning, /9007199254740991/); }
    for (const action of input.actions) action.responses[0] = { type: 'keypress', key: 'g', modifiers: [], holdMs: 0 };
    result = convertGamePreset('game-event-v1', input, 'Mixed warnings', []);
    assert.equal(result.warnings.length, 100); assert.equal(result.skippedActions, 100);
    for (const warning of result.warnings) assert.ok(warning.length <= 500);
});
