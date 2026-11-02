import { z } from 'zod';
import { categoryWrite, gameWrite, presetWrite, reorderWrite, gamePresetImport } from './contracts.js';
export function addGamesOpenApi(doc: any) {
    const json = (s: z.ZodType) => { const { $schema, ...value } = z.toJSONSchema(s); return value; };
    const common = { id: z.uuid(), revision: z.string().regex(/^[1-9][0-9]*$/), createdAt: z.iso.datetime(), updatedAt: z.iso.datetime() };
    const schemas = { GameCategoryWrite: categoryWrite, GameWrite: gameWrite, GamePresetWrite: presetWrite, GameReorder: reorderWrite, GamePresetImport: gamePresetImport, GameCategory: categoryWrite.extend(common), Game: gameWrite.extend(common), GamePreset: presetWrite.extend({ ...common, gameId: z.uuid(), version: z.number().int().min(1) }) };
    for (const [name, s] of Object.entries(schemas))
        doc.components.schemas[name] = json(s);
    const ref = (name: string) => ({ $ref: '#/components/schemas/' + name });
    const body = (name: string) => ({ required: true, content: { 'application/json': { schema: ref(name) } } });
    const errors = Object.fromEntries([400, 401, 404, 409, 412, 413, 422, 428, 429, 500].map(n => [n, { description: 'Error envelope', content: { 'application/json': { schema: ref('Error') } } }]));
    const parameter = (name: string) => ({ name, in: 'path', required: true, schema: { type: 'string', format: 'uuid' } });
    const match = { name: 'If-Match', in: 'header', required: true, schema: { type: 'string', pattern: '^"[1-9][0-9]{0,18}"$' } };
    const operation = (operationId: string, schema: any, parameters: any[] = [], admin = false, write?: string, created = false) => ({ operationId, security: admin ? [{ adminServiceKey: [] }] : [], parameters, ...(write ? { requestBody: body(write) } : {}), responses: { [created ? '201' : '200']: { description: 'Success. Mutations return a strong ETag; DELETE archives and retains history.', headers: { ETag: { schema: { type: 'string' } } }, content: { 'application/json': { schema } } }, ...errors } });
    const items = (name: string) => ({ type: 'object', required: ['items'], properties: { items: { type: 'array', items: ref(name) } } });
    const page = { ...items('Game'), required: ['items', 'total', 'page', 'pageSize', 'totalPages'], properties: { ...items('Game').properties, total: { type: 'integer' }, page: { type: 'integer' }, pageSize: { type: 'integer' }, totalPages: { type: 'integer' } } };
    const query = [['q', { type: 'string', maxLength: 120 }], ['categoryId', { type: 'string', format: 'uuid' }], ['page', { type: 'integer', minimum: 1, default: 1 }], ['pageSize', { type: 'integer', minimum: 1, maximum: 100, default: 25 }]].map(([name, schema]) => ({ name, in: 'query', required: false, schema }));
    doc.paths['/game-categories'] = { get: operation('listGameCategories', items('GameCategory')) };
    doc.paths['/games'] = { get: operation('listPublishedGames', page, query) };
    doc.paths['/games/{id}'] = { get: operation('getPublishedGame', ref('Game'), [parameter('id')]) };
    doc.paths['/games/{id}/presets'] = { get: operation('listPublishedGamePresets', items('GamePreset'), [parameter('id')]) };
    doc.paths['/games/{id}/presets/{presetId}'] = { get: operation('getPublishedGamePreset', ref('GamePreset'), [parameter('id'), parameter('presetId')]) };
    doc.components.schemas.GamePresetImportResult = { type: 'object', additionalProperties: false, required: ['preset', 'warnings', 'skippedActions'], properties: { preset: ref('Preset'), warnings: { type: 'array', maxItems: 100, items: { type: 'string', maxLength: 500 } }, skippedActions: { type: 'integer', minimum: 0, maximum: 100 } } };
    const imp = operation('importCompatibleGamePreset', ref('GamePresetImportResult'), [parameter('id'), parameter('presetId')], false, undefined, true);
    imp.security = [{ desktopSession: [] }] as any;
    (imp as any).requestBody = { ...body('GamePresetImport'), required: false };
    (imp as any).description = 'Copies native actions or supported authoritative game-event-v1 keyboard rules into the signed-in account. Use targetId to retry without duplicates and revision to require the displayed source version. Empty source wheels are reported in warnings and omitted; unsupported commands return 422 without a partial import.';
    doc.paths['/games/{id}/presets/{presetId}/import'] = { post: imp };
    for (const [path, name] of [['game-categories', 'GameCategory'], ['games', 'Game']]) {
        doc.paths['/admin/' + path] = { get: operation('adminList' + name, name === 'Game' ? page : items(name), name === 'Game' ? [...query, { name: 'status', in: 'query', schema: { enum: ['draft', 'published', 'archived'] } }] : [], true), post: operation('create' + name, ref(name), [], true, name + 'Write', true) };
        doc.paths['/admin/' + path + '/reorder'] = { post: operation('reorder' + name, items(name), [], true, 'GameReorder', true) };
        doc.paths['/admin/' + path + '/{id}'] = { ...(name === 'Game' ? { get: operation('adminGetGame', ref(name), [parameter('id')], true) } : {}), put: operation('replace' + name, ref(name), [parameter('id'), match], true, name + 'Write'), delete: operation('archive' + name, ref(name), [parameter('id'), match], true) };
    }
    const pp = [parameter('id'), parameter('presetId')];
    doc.paths['/admin/games/{id}/presets'] = { get: operation('adminListGamePresets', items('GamePreset'), [parameter('id')], true), post: operation('createGamePreset', ref('GamePreset'), [parameter('id')], true, 'GamePresetWrite', true) };
    doc.paths['/admin/games/{id}/presets/{presetId}'] = { get: operation('adminGetGamePreset', ref('GamePreset'), pp, true), put: operation('replaceGamePreset', ref('GamePreset'), [...pp, match], true, 'GamePresetWrite'), delete: operation('archiveGamePreset', ref('GamePreset'), [...pp, match], true) };
    for (const path of ['/games/{id}/presets', '/admin/games/{id}/presets']) {
        doc.paths[path].get.parameters.push(...query.filter(p => ['page', 'pageSize'].includes(p.name as string)));
        const schema = doc.paths[path].get.responses['200'].content['application/json'].schema;
        schema.properties.page = { type: 'integer' };
        schema.properties.pageSize = { type: 'integer' };
        schema.properties.hasMore = { type: 'boolean' };
    }
    doc.paths['/admin/games/{id}/presets/{presetId}/versions'] = { get: operation('listGamePresetVersions', { type: 'object', properties: { items: { type: 'array', items: { type: 'object', properties: { presetId: { type: 'string', format: 'uuid' }, version: { type: 'integer' }, snapshot: ref('GamePreset'), createdAt: { type: 'string', format: 'date-time' } } } } } }, [...pp, ...query.filter(p => ['page', 'pageSize'].includes(p.name as string))], true) };
    return doc;
}
