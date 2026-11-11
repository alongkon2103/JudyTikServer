import { z } from 'zod';
import { categoryWrite, gameWrite, presetWrite, reorderWrite, gamePresetImport } from './contracts.js';
import {gameFileFields,presetFileFields,presetReplacementFields} from './files.js';
import {shopResponse} from './licenses.js';
export function addGamesOpenApi(doc: any) {
    const json = (s:z.ZodType,name:string,input=false) => {
        const {$schema,...value}=z.toJSONSchema(s,{io:input?'input':'output'});
        const scopeRefs=(node:any):void=>{
            if(!node || typeof node!=='object')return;
            if(typeof node.$ref==='string' && node.$ref.startsWith('#/$defs/'))node.$ref=`#/components/schemas/${name}${node.$ref.slice(1)}`;
            for(const child of Object.values(node))scopeRefs(child);
        };
        scopeRefs(value);return value;
    };
    const common = { id: z.uuid(), revision: z.string().regex(/^[1-9][0-9]*$/), createdAt: z.iso.datetime(), updatedAt: z.iso.datetime() };
    const schemas = { GameCategoryWrite: categoryWrite, GameWrite: gameWrite, GamePresetWrite: presetWrite, GameReorder: reorderWrite, GamePresetImport: gamePresetImport, GameCategory: categoryWrite.extend(common), Game: gameWrite.extend(common), GamePreset: presetWrite.extend({ ...common, gameId: z.uuid(), version: z.number().int().min(1) }) };
    for (const [name, s] of Object.entries(schemas))
        doc.components.schemas[name] = json(s,name,name.endsWith('Write') || ['GameReorder','GamePresetImport'].includes(name));
    const ref = (name: string) => ({ $ref: '#/components/schemas/' + name });
    const body = (name: string) => ({ required: true, content: { 'application/json': { schema: ref(name) } } });
    const errors = Object.fromEntries([400, 401, 403, 404, 409, 412, 413, 422, 428, 429, 500, 503].map(n => [n, { description: 'Error envelope', content: { 'application/json': { schema: ref('Error') } } }]));
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
    for(const path of ['/games/{id}/presets','/games/{id}/presets/{presetId}']){
        doc.paths[path].get.security=[{desktopSession:[]}];
        doc.paths[path].get.description='Requires verified-email purchase access to parent Game.slug. 403 GAME_LICENSE_REQUIRED or GAME_LICENSE_EMAIL_REQUIRED; 503 GAME_LICENSE_UNAVAILABLE. No PRO bypass. Response Cache-Control: no-store.';
    }
    doc.components.schemas.GameLicenseSnapshot=json(z.object({state:z.enum(['ready','email_required']),licenses:shopResponse.shape.licenses,checkedAt:z.iso.datetime()}).strict(),'GameLicenseSnapshot');
    const lookup=operation('getMyGameLicenses',ref('GameLicenseSnapshot'));lookup.security=[{desktopSession:[]}] as any;
    doc.paths['/me/game-licenses']={get:{...lookup,description:'Verified account email resolved on server; no caller email accepted. Returns game-level access for every preset; no customer identifiers or shop key. Cache-Control: no-store. Shop unavailable returns 503, not empty licenses.'}};
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
    const fields:any=json(gameFileFields,'GameFileImport',true);
    doc.components.schemas.GameFileImport = {...fields, required:[...fields.required,'presetFile','coverFile'], properties:{...fields.properties,
        presetFile:{type:'string',format:'binary',description:'Native judytik-actions-preset version 1 JSON export; maximum 1 MiB file and 256 KiB decoded preset.'},
        coverFile:{type:'string',format:'binary',description:'Static PNG, JPEG or WebP; maximum 2 MiB and 16 megapixels. Normalized to WebP, at most 1600 x 1600 and 1 MiB.'}}};
    doc.components.schemas.GameFileImportResult = {type:'object',additionalProperties:false,required:['game','preset','warnings'],properties:{game:ref('Game'),preset:ref('GamePreset'),warnings:{type:'array',items:{type:'string'}}}};
    doc.paths['/admin/games/import']={post:{...operation('adminImportJudyTikGameFile',ref('GameFileImportResult'),[],true,undefined,true),description:'Atomically creates a new game, uploaded cover, native preset, version and audit records. Draft by default; published creates a published default preset. Duplicate slug returns 409 without overwriting. Does not enforce purchase rights. Exported local media references are preserved with a warning; sound/video bytes are not included.',requestBody:{required:true,content:{'multipart/form-data':{schema:ref('GameFileImport')}}}}};
    const withFile=(schema:any,key:string)=>({...schema,required:[...(schema.required??[]),key],properties:{...schema.properties,[key]:doc.components.schemas.GameFileImport.properties[key]}});
    doc.components.schemas.GamePresetFileCreate=withFile(json(presetFileFields,'GamePresetFileCreate',true),'presetFile');
    doc.components.schemas.GamePresetFileReplace=withFile(json(presetReplacementFields,'GamePresetFileReplace',true),'presetFile');
    doc.components.schemas.GameCoverReplace=withFile({type:'object',additionalProperties:false,properties:{}},'coverFile');
    doc.components.schemas.GamePresetFileResult={type:'object',additionalProperties:false,required:['preset','warnings'],properties:{preset:ref('GamePreset'),warnings:{type:'array',items:{type:'string'}}}};
    const upload=(operationId:string,response:string,write:string,parameters:any[],created=false)=>({...operation(operationId,ref(response),parameters,true,undefined,created),requestBody:{required:true,content:{'multipart/form-data':{schema:ref(write)}}}});
    doc.paths['/admin/games/{id}/presets/import']={post:{...upload('adminAddNativeGamePreset','GamePresetFileResult','GamePresetFileCreate',[parameter('id')],true),description:'Adds one native exported preset to an existing game. Does not change game publication. Defaults to draft and not default. isDefault is the text true or false; true requires published and no existing default.'}};
    doc.paths['/admin/games/{id}/presets/{presetId}/file']={put:{...upload('adminReplaceNativeGamePresetFile','GamePresetFileResult','GamePresetFileReplace',[...pp,match]),description:'Replaces native Actions while preserving preset ID, slug, description, status and default flag. Optional presetName renames the display name. If-Match is the preset revision. Increments preset version/revision and retains prior snapshots atomically.'}};
    const coverUpload={...upload('adminReplaceGameCover','Game','GameCoverReplace',[parameter('id'),match]),description:'Replaces or adds a normalized cover. If-Match is the game revision. Preserves game ID and settings; increments game revision and audits atomically with image data.'};
    for(const admin of [false,true]) {
        doc.paths[(admin?'/admin':'')+'/games/{id}/cover']={...(admin?{put:coverUpload}:{}),get:{operationId:admin?'adminGetGameCover':'getPublishedGameCover',security:admin?[{adminServiceKey:[]}]:[],parameters:[parameter('id')],description:admin?'Admin preview, including drafts and archived games.':'Serves only a published game in an active category (or without category). No purchase restriction.',responses:{'200':{description:'Normalized cover image. Cache-Control: no-store.',content:{'image/webp':{schema:{type:'string',format:'binary'}}}},...errors}}};
    }
    return doc;
}
