import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Ajv2020} from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import {addGamesOpenApi} from '../src/games/openapi.js';
test('multipart OpenAPI requires only real required inputs and recursive response references resolve',()=>{
 const api=addGamesOpenApi({components:{schemas:{Error:{},Preset:{}}},paths:{}});
 assert.deepEqual([...api.components.schemas.GameFileImport.required].sort(),['coverFile','name','presetFile','slug']);
 const ajv=new Ajv2020({strict:false});addFormats.default(ajv);
 ajv.addSchema({$id:'urn:judytik:games',components:api.components});
 const check=ajv.getSchema('urn:judytik:games#/components/schemas/GameFileImportResult');assert(check);
});
