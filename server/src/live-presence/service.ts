import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service.js';
import type { Prisma } from '../generated/prisma/client.js';
import type { VerifiedSession } from '../auth/auth.service.js';
import { CLOCK, type Clock } from '../auth/clock.js';
import { ApiError } from '../http/api-error.js';
import { connectionIdSchema, presenceStartSchema, presenceHeartbeatSchema } from './contracts.js';
type Row = {
    connectionId: string;
    expiresAt: Date;
    active: boolean;
    sequence: bigint;
};
const lease = (r: Row) => ({ connectionId: r.connectionId, expiresAt: r.expiresAt.toISOString(), heartbeatAfterMs: 30000 });
@Injectable()
export class LivePresenceService {
    constructor(
    @Inject(PrismaService)
    private readonly db: PrismaService,
    @Inject(CLOCK)
    private readonly clock: Clock) { }
    private async lock(tx: Prisma.TransactionClient, s: VerifiedSession) {
        const rows = await tx.$queryRaw<{
            id: string;
        }[]> `SELECT s.id FROM judytik.sessions s JOIN judytik.users u ON u.id=s.user_id WHERE s.id=${s.sessionId}::uuid AND s.user_id=${s.userId}::uuid AND s.revoked_at IS NULL AND s.expires_at>${this.clock.now()} AND u.disabled_at IS NULL AND u.merged_into_id IS NULL FOR UPDATE OF s`;
        if (!rows.length)
            throw new ApiError(401, 'AUTH_UNAUTHORIZED');
    }
    async start(s: VerifiedSession, body: unknown) {
        const parsed = presenceStartSchema.safeParse(body);
        if (!parsed.success)
            throw new ApiError(400, 'INVALID_REQUEST');
        const p = { ...parsed.data, connectionId: parsed.data.connectionId.toLowerCase() };
        return this.db.withUserContext(s.userId, async (tx) => {
            await this.lock(tx, s);
            const old = await tx.livePresence.findUnique({ where: { sessionId: s.sessionId } });
            if (old?.connectionId === p.connectionId) {
                if (!old.active)
                    throw new ApiError(409, 'PRESENCE_LEASE_CLOSED');
                return lease(old);
            }
            // Keep retired IDs independently of the replaceable public lease.
            // The session lock makes this check/insert and replacement atomic.
            const connection = { sessionId: s.sessionId, connectionId: p.connectionId };
            if (await tx.livePresenceConnection.findUnique({ where: { sessionId_connectionId: connection } }))
                throw new ApiError(409, 'PRESENCE_LEASE_CLOSED');
            await tx.livePresenceConnection.create({ data: connection });
            const now = this.clock.now(), data = { ...p, sequence: 0n, active: true, expiresAt: new Date(+now + 90000), lastSeenAt: now };
            return lease(await tx.livePresence.upsert({ where: { sessionId: s.sessionId }, create: { sessionId: s.sessionId, ...data }, update: data }));
        });
    }
    async heartbeat(s: VerifiedSession, id: string, body: unknown) {
        const parsed = presenceHeartbeatSchema.safeParse(body);
        if (!connectionIdSchema.safeParse(id).success || !parsed.success)
            throw new ApiError(400, 'INVALID_REQUEST');
        id = id.toLowerCase();
        return this.db.withUserContext(s.userId, async (tx) => {
            await this.lock(tx, s);
            const now = this.clock.now(), old = await tx.livePresence.findUnique({ where: { sessionId: s.sessionId } });
            if (!old || old.connectionId !== id || !old.active || +old.expiresAt <= +now)
                throw new ApiError(404, 'PRESENCE_LEASE_EXPIRED');
            if (BigInt(parsed.data.sequence) <= old.sequence)
                return lease(old);
            return lease(await tx.livePresence.update({ where: { sessionId: s.sessionId }, data: { ...parsed.data, sequence: BigInt(parsed.data.sequence), lastSeenAt: now, expiresAt: new Date(+now + 90000) } }));
        });
    }
    async stop(s: VerifiedSession, id: string) {
        if (!connectionIdSchema.safeParse(id).success)
            throw new ApiError(400, 'INVALID_REQUEST');
        id = id.toLowerCase();
        await this.db.withUserContext(s.userId, async (tx) => {
            await this.lock(tx, s);
            // DELETE may arrive before a delayed POST; reserve its ID as closed.
            await tx.livePresenceConnection.createMany({
                data: [{ sessionId: s.sessionId, connectionId: id }], skipDuplicates: true,
            });
            await tx.livePresence.updateMany({ where: { sessionId: s.sessionId, connectionId: id, active: true }, data: { active: false, expiresAt: this.clock.now() } });
        });
    }
    async list(s: VerifiedSession) {
        const now = this.clock.now();
        const rows = await this.db.withUserContext(s.userId, tx => tx.$queryRaw<{
            username: string;
            roomId: string;
            displayName: string;
            avatarUrl: string | null;
            viewers: number | null;
            lastSeenAt: Date;
        }[]> `
   SELECT username,room_id AS "roomId",display_name AS "displayName",avatar_url AS "avatarUrl",viewers,last_seen_at AS "lastSeenAt" FROM (
    SELECT DISTINCT ON (p.username) p.username,p.room_id,p.display_name,p.avatar_url,p.viewers,p.last_seen_at
    FROM judytik.live_presences p JOIN judytik.sessions s ON s.id=p.session_id JOIN judytik.users u ON u.id=s.user_id
    WHERE p.active AND p.expires_at>${now} AND s.revoked_at IS NULL AND s.expires_at>${now} AND u.disabled_at IS NULL AND u.merged_into_id IS NULL
    ORDER BY p.username,p.last_seen_at DESC,p.session_id
   ) channels ORDER BY viewers DESC NULLS LAST,username COLLATE "C" ASC LIMIT 50`);
        return { items: rows.map(r => ({ ...r, lastSeenAt: r.lastSeenAt.toISOString() })), serverTime: now.toISOString(), refreshAfterMs: 30000 };
    }
}
