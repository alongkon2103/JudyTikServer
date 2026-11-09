import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { presenceStartSchema, presenceHeartbeatSchema } from '../src/live-presence/contracts.js';
import { addLivePresenceOpenApi } from '../src/live-presence/openapi.js';
import { validPresenceStart, validPresenceHeartbeat } from '../../shared/live-presence.js';
const profile = { displayName: 'Host', avatarUrl: null, viewers: 0 };
test('server validators agree with shared presence security boundaries', () => {
    const start = { connectionId: randomUUID(), username: 'host.test', roomId: '12345678', ...profile };
    const patches = [{}, ...['00000000-0000-0000-0000-000000000000', 'FFFFFFFF-FFFF-FFFF-FFFF-FFFFFFFFFFFF'].map(connectionId => ({ connectionId })), ...['', ' ', 'a\u202e', 'a\n', 'Host'].map(displayName => ({ displayName })), ...[null, 'https://p16.tiktokcdn.com/avatar.jpg', 'https://tiktokcdn.com.evil.test/a', 'https://a.tiktokcdn.com:8080/a', 'https://user@a.tiktokcdn.com/a'].map(avatarUrl => ({ avatarUrl })), ...[null, -1, 1.2, 0, 1e9, 1e9 + 1].map(viewers => ({ viewers }))];
    for (const patch of patches) {
        const value = { ...start, ...patch };
        assert.equal(presenceStartSchema.safeParse(value).success, validPresenceStart(value), JSON.stringify(patch));
    }
    for (const sequence of [0, 1, 2.5, Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER + 1]) {
        const value = { ...profile, sequence };
        assert.equal(presenceHeartbeatSchema.safeParse(value).success, validPresenceHeartbeat(value));
    }
});
test('generated LIVE presence operations use desktop auth and strict public schemas', () => {
    const doc: any = { paths: {}, components: { schemas: {} } };
    addLivePresenceOpenApi(doc);
    for (const path of Object.values(doc.paths) as any[])
        for (const operation of Object.values(path) as any[])
            assert.deepEqual(operation.security, [{ desktopSession: [] }]);
    assert.equal(doc.components.schemas.LiveDirectory.additionalProperties, false);
    assert.equal(doc.components.schemas.LiveDirectoryEntry.additionalProperties, false);
    assert.deepEqual(Object.keys(doc.components.schemas.LiveDirectoryEntry.properties).sort(), ['username', 'roomId', 'displayName', 'avatarUrl', 'viewers', 'lastSeenAt'].sort());
    assert.equal(doc.components.schemas.LiveDirectory.properties.items.maxItems, 50);
    assert.ok(doc.paths['/me/live-presence/{connectionId}'].delete.responses[204]);
});
