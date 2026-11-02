import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gameWrite, categoryWrite, presetWrite, parse, matchRevision } from '../src/games/contracts.js';
test('catalog rejects unsafe URLs, unknown fields and empty names', () => {
    for (const value of [{ slug: 'game', name: ' ' }, { slug: 'game', name: 'Game', url: 'javascript:alert(1)' }, { slug: 'game', name: 'Game', unknown: true }])
        assert.throws(() => parse(gameWrite, value));
    assert.equal(parse(gameWrite, { slug: 'game', name: 'Game' }).status, 'draft');
    assert.throws(() => parse(categoryWrite, { slug: 'bad slug', name: 'Category' }));
});
test('preset payload remains lossless and format explicit', () => {
    const payload = { event: 'GAME_EVENT', params: { ids: [1, 2], label: 'ไทย' } };
    assert.deepEqual(parse(presetWrite, { slug: 'default', name: 'Default', format: 'game-event-v1', payload }).payload, payload);
    assert.throws(() => parse(presetWrite, { slug: 'default', name: 'Default', format: 'keyboard', payload }));
});
test('optimistic revision requires a single strong numeric ETag', () => {
    assert.equal(matchRevision('"12"'), 12n);
    for (const value of [undefined, '*', 'W/"1"', '"1", "2"', '-1'])
        assert.throws(() => matchRevision(value));
});
