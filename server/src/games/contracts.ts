import { z } from 'zod';
import { ApiError } from '../http/api-error.js';
const slug = z.string().min(1).max(80).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const name = z.string().trim().min(1).max(80);
const url = z.string().max(2048).url().refine(v => { const u = new URL(v); return ['https:', 'http:'].includes(u.protocol) && !u.username && !u.password; }).nullable();
export const categoryWrite = z.object({ slug, name, description: z.string().max(4000).default(''), sortOrder: z.number().int().min(0).max(1000000).default(0), status: z.enum(['active', 'archived']).default('active') }).strict();
export const gameWrite = z.object({ slug, name, description: z.string().max(16000).default(''), categoryId: z.uuid().nullable().default(null), platform: z.string().trim().min(1).max(80).default('pc'), coverUrl: url.default(null), url: url.default(null), status: z.enum(['draft', 'published', 'archived']).default('draft'), sortOrder: z.number().int().min(0).max(1000000).default(0), metadata: z.record(z.string(), z.json()).default({}) }).strict();
export const presetWrite = z.object({ slug, name, description: z.string().max(4000).default(''), format: z.enum(['action-preset-v1', 'game-event-v1']), payload: z.record(z.string(), z.json()), isDefault: z.boolean().default(false), status: z.enum(['draft', 'published', 'archived']).default('draft') }).strict();
export const listQuery = z.object({ q: z.string().max(120).optional(), categoryId: z.uuid().optional(), status: z.enum(['draft', 'published', 'archived']).optional(), page: z.coerce.number().int().min(1).max(100000).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(25) }).strict();
export const reorderWrite = z.object({ items: z.array(z.object({ id: z.uuid(), revision: z.string().regex(/^[1-9][0-9]{0,18}$/), sortOrder: z.number().int().min(0).max(1000000) }).strict()).min(1).max(200) }).strict();
export function parse<T>(schema: z.ZodType<T>, input: unknown): T { let size; try {
    size = Buffer.byteLength(JSON.stringify(input));
}
catch {
    throw new ApiError(400, 'INVALID_REQUEST');
} if (size > 1048576)
    throw new ApiError(413, 'REQUEST_TOO_LARGE'); const r = schema.safeParse(input); if (!r.success)
    throw new ApiError(400, 'INVALID_REQUEST'); return r.data; }
export function uuid(value: string) { return parse(z.uuid(), value); }
export function matchRevision(value: unknown) { if (value === undefined)
    throw new ApiError(428, 'PRECONDITION_REQUIRED'); if (typeof value !== 'string' || !/^"[1-9][0-9]{0,18}"$/.test(value))
    throw new ApiError(400, 'INVALID_PRECONDITION'); return BigInt(value.slice(1, -1)); }
export const pageQuery = listQuery.pick({ page: true, pageSize: true });

export const gamePresetImport = z.object({ targetId: z.uuid().optional(), revision: z.string().regex(/^[1-9][0-9]{0,18}$/).optional(), name: name.optional() }).strict();
