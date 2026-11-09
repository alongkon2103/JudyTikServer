import sharp from 'sharp';
import {TextDecoder} from 'node:util';
import {z} from 'zod';
import {ApiError} from '../http/api-error.js';
import {validatePreset} from '../presets/contracts.js';
import {gameWrite, parse} from './contracts.js';

export const MAX_PRESET_FILE = 1048576;
export const MAX_COVER_FILE = 2097152;
export const MAX_STORED_COVER = 1048576;
function isAnimatedPng(bytes:Buffer):boolean {
 if(!bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))return false;
 // libvips can omit APNG's page count; inspect actual chunks, not arbitrary byte matches.
 for(let offset=8;offset+12<=bytes.length;) {
  const length=bytes.readUInt32BE(offset);
  if(length>bytes.length-offset-12)return false;
  if(bytes.toString('ascii',offset+4,offset+8)==='acTL')return true;
  offset+=length+12;
 }
 return false;
}
export const gameFileFields = gameWrite.pick({slug:true,name:true,description:true,categoryId:true,platform:true})
 .extend({status:z.enum(['draft','published']).default('draft'),presetName:z.string().trim().min(1).max(80).optional()}).strict();
export function parseGameFileFields(input:unknown) { return parse(gameFileFields,input); }
export function decodePresetFile(bytes:Buffer) {
 if(bytes.length>MAX_PRESET_FILE) throw new ApiError(413,'PRESET_FILE_TOO_LARGE');
 let value:any;
 try { value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)); }
 catch { throw new ApiError(400,'PRESET_FILE_INVALID'); }
 if(!value || typeof value!=='object' || Array.isArray(value) || value.format!=='judytik-actions-preset') throw new ApiError(400,'PRESET_FILE_INVALID');
 if(value.version!==1) throw new ApiError(400,'PRESET_FILE_VERSION');
 if(Object.keys(value).some(key=>!['format','version','preset'].includes(key))) throw new ApiError(400,'PRESET_FILE_INVALID');
 try { return validatePreset(value.preset); }
 catch(error) { throw new ApiError(error instanceof ApiError && error.getStatus()===413?413:400,error instanceof ApiError && error.getStatus()===413?'PRESET_FILE_TOO_LARGE':'PRESET_FILE_INVALID'); }
}
export async function normalizeGameCover(bytes:Buffer):Promise<Buffer> {
 if(bytes.length>MAX_COVER_FILE) throw new ApiError(413,'GAME_COVER_TOO_LARGE');
 if(isAnimatedPng(bytes))throw new ApiError(400,'GAME_COVER_INVALID');
 try {
  const image=sharp(bytes,{limitInputPixels:16000000,failOn:'warning'});
  const meta=await image.metadata();
  if(!['png','jpeg','webp'].includes(meta.format??'') || (meta.pages??1)!==1) throw new Error('Invalid raster cover');
  const normalized=await image.rotate().resize({width:1600,height:1600,fit:'inside',withoutEnlargement:true}).webp({quality:85}).toBuffer();
  if(normalized.length>MAX_STORED_COVER) throw new ApiError(413,'GAME_COVER_TOO_LARGE');
  return normalized;
 } catch(error) { if(error instanceof ApiError) throw error; throw new ApiError(400,'GAME_COVER_INVALID'); }
}
