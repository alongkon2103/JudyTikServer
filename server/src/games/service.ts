import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { convertGamePreset } from './import.js';
import { PrismaService } from '../database/prisma.service.js';
import { Prisma } from '../generated/prisma/client.js';
import type { VerifiedSession } from '../auth/auth.service.js';
import { ApiError } from '../http/api-error.js';
import { validatePreset } from '../presets/contracts.js';
import { PresetsService } from '../presets/service.js';
import { categoryWrite, gameWrite, presetWrite, gamePresetImport, listQuery, pageQuery, reorderWrite, parse, uuid, matchRevision } from './contracts.js';
type Kind = 'category' | 'game' | 'preset';
function dto<T>(value: T): any { return JSON.parse(JSON.stringify(value, (_key, v) => typeof v === 'bigint' ? v.toString() : v)); }
const visible: Prisma.GameWhereInput = { status: 'published', OR: [{ categoryId: null }, { category: { status: 'active' } }] };
@Injectable()
export class GamesService {
    constructor(
    @Inject(PrismaService)
    private readonly db: PrismaService,
    @Inject(PresetsService)
    private readonly presets: PresetsService) { }
    async categories(admin = false) { return { items: dto(await this.db.client.gameCategory.findMany({ where: admin ? {} : { status: 'active' }, orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] })) }; }
    async list(input: unknown, admin = false) { const q = parse(listQuery, input); if (!admin && q.status && q.status !== 'published')
        throw new ApiError(400, 'INVALID_REQUEST'); const where: Prisma.GameWhereInput = { ...(admin ? (q.status ? { status: q.status } : {}) : visible), ...(q.categoryId ? { categoryId: q.categoryId } : {}), ...(q.q ? { AND: [{ OR: [{ name: { contains: q.q.replace(/[\\%_]/g, '\\$&'), mode: 'insensitive' } }, { description: { contains: q.q.replace(/[\\%_]/g, '\\$&'), mode: 'insensitive' } }] }] } : {}) }; return this.db.client.$transaction(async (tx) => { const total = await tx.game.count({ where }); const rows = await tx.game.findMany({ where, orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }], skip: (q.page - 1) * q.pageSize, take: q.pageSize }); return { items: dto(rows), total, page: q.page, pageSize: q.pageSize, totalPages: Math.ceil(total / q.pageSize) }; }, { isolationLevel: 'RepeatableRead' }); }
    async get(id: string, admin = false) { uuid(id); const row = await this.db.client.game.findFirst({ where: { id, ...(admin ? {} : visible) } }); if (!row)
        throw new ApiError(404, 'GAME_NOT_FOUND'); return dto(row); }
    async gamePresets(id: string, admin = false, input: unknown = {}) { await this.get(id, admin); const q = parse(pageQuery, input); const items = await this.db.client.gamePreset.findMany({ where: { gameId: id, ...(admin ? {} : { status: 'published' }) }, orderBy: [{ isDefault: 'desc' }, { id: 'asc' }], skip: (q.page - 1) * q.pageSize, take: q.pageSize + 1 }); return { items: dto(items.slice(0, q.pageSize)), page: q.page, pageSize: q.pageSize, hasMore: items.length > q.pageSize }; }
    async preset(id: string, presetId: string, admin = false) { await this.get(id, admin); uuid(presetId); const row = await this.db.client.gamePreset.findFirst({ where: { id: presetId, gameId: id, ...(admin ? {} : { status: 'published' }) } }); if (!row)
        throw new ApiError(404, 'GAME_PRESET_NOT_FOUND'); return dto(row); }
    async versions(gameId: string, id: string, input: unknown = {}) { await this.preset(gameId, id, true); const q = parse(pageQuery, input); const items = await this.db.client.gamePresetVersion.findMany({ where: { presetId: id }, orderBy: { version: 'desc' }, skip: (q.page - 1) * q.pageSize, take: q.pageSize + 1 }); return { items: dto(items.slice(0, q.pageSize)), page: q.page, pageSize: q.pageSize, hasMore: items.length > q.pageSize }; }
    async importPreset(actor: VerifiedSession, gameId: string, id: string, input: unknown, requestId: string) {
        const body = parse(gamePresetImport, input === undefined ? {} : input);
        const preset = await this.preset(gameId, id);
        if (body.revision !== undefined && body.revision !== preset.revision) throw new ApiError(412, 'GAME_VERSION_CONFLICT');
        const gifts = preset.format === 'game-event-v1' ? await this.db.client.gift.findMany({ select: { id: true, nameOverride: true, aliases: true, regions: { select: { providerName: true } } } }) : undefined;
        const converted = convertGamePreset(preset.format, preset.payload, body.name ?? preset.name, gifts);
        const targetId = body.targetId ?? randomUUID();
        try {
            return { preset: (await this.presets.save(actor, targetId, converted.payload, { ifNoneMatch: '*' }, requestId)).value, warnings: converted.warnings, skippedActions: converted.skippedActions };
        } catch (error) {
            if (!(error instanceof ApiError) || error.code !== 'PRESET_VERSION_CONFLICT') throw error;
            const saved = await this.presets.get(actor, targetId);
            // A retry may acknowledge the same copy, but must never overwrite a user's later edits.
            if (!isDeepStrictEqual({ schemaVersion: saved.schemaVersion, name: saved.name, actions: saved.actions }, converted.payload)) throw error;
            return { preset: saved, warnings: converted.warnings, skippedActions: converted.skippedActions };
        }
    }
    private async locked<T>(run: (tx: Prisma.TransactionClient) => Promise<T>) { try {
        return await this.db.client.$transaction(async (tx) => { await tx.$queryRaw `SELECT pg_advisory_xact_lock(174827,1)::text`; return run(tx); });
    }
    catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')
            throw new ApiError(409, 'GAME_SLUG_OR_DEFAULT_CONFLICT');
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2003')
            throw new ApiError(400, 'GAME_REFERENCE_NOT_FOUND');
        throw e;
    } }
    private async audit(tx: Prisma.TransactionClient, kind: Kind, id: string, revision: bigint, requestId: string, action: string) { await tx.auditEvent.create({ data: { eventName: `game.${kind}.${action}`, resourceId: id, resourceRevision: revision, requestId } }); }
    async save(kind: Kind, id: string | undefined, input: unknown, match: unknown, requestId: string, gameId?: string) {
        if (id)
            uuid(id);
        if (gameId)
            uuid(gameId);
        const revision = id ? matchRevision(match) : undefined;
        const data: any = kind === 'category' ? parse(categoryWrite, input) : kind === 'game' ? parse(gameWrite, input) : parse(presetWrite, input);
        if (kind === 'preset' && data.isDefault && data.status !== 'published')
            throw new ApiError(400, 'GAME_DEFAULT_MUST_BE_PUBLISHED');
        if (kind === 'preset' && data.format === 'action-preset-v1') {
            validatePreset(data.payload);
        }
        ;
        return this.locked(async (tx) => {
            const model = kind === 'category' ? tx.gameCategory : kind === 'game' ? tx.game : tx.gamePreset;
            const current: any = id ? await (model as any).findUnique({ where: { id } }) : null;
            if (id && (!current || (kind === 'preset' && current.gameId !== gameId)))
                throw new ApiError(404, 'GAME_RESOURCE_NOT_FOUND');
            if (current && current.revision !== revision)
                throw new ApiError(412, 'GAME_VERSION_CONFLICT');
            if (kind === 'game' && data.categoryId) {
                const category = await tx.gameCategory.findUnique({ where: { id: data.categoryId } });
                if (!category || category.status !== 'active')
                    throw new ApiError(400, 'GAME_CATEGORY_UNAVAILABLE');
            }
            if (kind === 'preset') {
                if (!await tx.game.findUnique({ where: { id: gameId } }))
                    throw new ApiError(404, 'GAME_NOT_FOUND');
                if (data.isDefault) {
                    const previous = await tx.gamePreset.findFirst({ where: { gameId, isDefault: true, ...(id ? { id: { not: id } } : {}) } });
                    if (previous)
                        throw new ApiError(409, 'GAME_DEFAULT_ALREADY_SET', 'Clear the existing default with its revision before selecting another.');
                }
            }
            const row: any = id ? await (model as any).update({ where: { id }, data: { ...data, revision: { increment: 1 }, ...(kind === 'preset' ? { version: { increment: 1 } } : {}) } }) : await (model as any).create({ data: { ...data, ...(kind === 'preset' ? { gameId } : {}) } });
            if (kind === 'preset')
                await tx.gamePresetVersion.create({ data: { presetId: row.id, version: row.version, snapshot: dto(row) } });
            await this.audit(tx, kind, row.id, row.revision, requestId, id ? 'updated' : 'created');
            return dto(row);
        });
    }
    async remove(kind: Kind, id: string, match: unknown, requestId: string, gameId?: string) { uuid(id); const revision = matchRevision(match); return this.locked(async (tx) => { const model = kind === 'category' ? tx.gameCategory : kind === 'game' ? tx.game : tx.gamePreset; const row: any = await (model as any).findUnique({ where: { id } }); if (!row || (kind === 'preset' && row.gameId !== uuid(gameId!)))
        throw new ApiError(404, 'GAME_RESOURCE_NOT_FOUND'); if (row.revision !== revision)
        throw new ApiError(412, 'GAME_VERSION_CONFLICT'); const saved: any = await (model as any).update({ where: { id }, data: { status: 'archived', revision: { increment: 1 }, ...(kind === 'preset' ? { isDefault: false, version: { increment: 1 } } : {}) } }); if (kind === 'preset')
        await tx.gamePresetVersion.create({ data: { presetId: id, version: saved.version, snapshot: dto(saved) } }); await this.audit(tx, kind, id, saved.revision, requestId, 'archived'); return dto(saved); }); }
    async reorder(kind: 'category' | 'game', input: unknown, requestId: string) { const body = parse(reorderWrite, input); if (new Set(body.items.map(i => i.id)).size !== body.items.length)
        throw new ApiError(400, 'INVALID_REQUEST'); return this.locked(async (tx) => { const model = kind === 'category' ? tx.gameCategory : tx.game; const items = []; for (const item of [...body.items].sort((a, b) => a.id.localeCompare(b.id))) {
        const current: any = await (model as any).findUnique({ where: { id: item.id } });
        if (!current)
            throw new ApiError(404, 'GAME_RESOURCE_NOT_FOUND');
        if (current.revision !== BigInt(item.revision))
            throw new ApiError(412, 'GAME_VERSION_CONFLICT');
        const saved: any = await (model as any).update({ where: { id: item.id }, data: { sortOrder: item.sortOrder, revision: { increment: 1 } } });
        await this.audit(tx, kind, item.id, saved.revision, requestId, 'reordered');
        items.push(dto(saved));
    } return { items }; }); }
}
