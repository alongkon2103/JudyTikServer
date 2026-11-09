import { z } from 'zod';
const controls = /[\x00-\x1f\x7f\u202a-\u202e\u2066-\u2069]/;
const domains = ['tiktokcdn.com', 'tiktokcdn-us.com', 'tiktokcdn-eu.com', 'byteoversea.com', 'ibytedtos.com', 'muscdn.com'];
const avatar = z.string().max(2048).refine(value => { try {
    const u = new URL(value);
    return !/[\x00-\x20\x7f]/.test(value) && u.protocol === 'https:' && !u.username && !u.password && !u.port && domains.some(d => u.hostname === d || u.hostname.endsWith('.' + d));
}
catch {
    return false;
} }).nullable();
export const connectionIdSchema = z.uuid().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
export const channelProfileShape = { displayName: z.string().min(1).max(80).refine(v => v.trim().length > 0 && !controls.test(v)), avatarUrl: avatar, viewers: z.number().int().min(0).max(1e9).nullable() };
export const presenceStartSchema = z.strictObject({ connectionId: connectionIdSchema, username: z.string().regex(/^[a-z0-9_.]{2,24}$/), roomId: z.string().regex(/^(?!0+$)[0-9]{8,30}$/), ...channelProfileShape });
export const presenceHeartbeatSchema = z.strictObject({ sequence: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER), ...channelProfileShape });
export const presenceLeaseSchema = z.strictObject({ connectionId: connectionIdSchema, expiresAt: z.iso.datetime(), heartbeatAfterMs: z.literal(30000) });
export const directoryEntrySchema = z.strictObject({ username: presenceStartSchema.shape.username, roomId: presenceStartSchema.shape.roomId, ...channelProfileShape, lastSeenAt: z.iso.datetime() });
export const liveDirectorySchema = z.strictObject({ items: z.array(directoryEntrySchema).max(50), serverTime: z.iso.datetime(), refreshAfterMs: z.literal(30000) });
