import {Body,Controller,Get,Inject,Param,Post,Put,Req,Res,UploadedFiles,UseGuards,UseInterceptors} from '@nestjs/common';
import {FileFieldsInterceptor} from '@nestjs/platform-express';
import type {Request,Response} from 'express';
import {CONFIG,type ServerConfig} from '../config/env.js';
import {AdminGuard} from '../http/admin.guard.js';
import {ApiError} from '../http/api-error.js';
import {GamesService} from './service.js';
import {decodePresetFile,normalizeGameCover,parseGameFileFields,MAX_COVER_FILE,MAX_PRESET_FILE,presetFileFields,presetReplacementFields,coverReplacementFields,presetFileWarnings} from './files.js';
import {parse,matchRevision} from './contracts.js';
type Uploads = {presetFile?:{buffer:Buffer}[];coverFile?:{buffer:Buffer}[]};
@Controller()
export class GameFilesController {
 constructor(@Inject(GamesService) private readonly games:GamesService,@Inject(CONFIG) private readonly config:ServerConfig) {}
 @Post('admin/games/import')
 @UseGuards(AdminGuard)
 @UseInterceptors(FileFieldsInterceptor([{name:'presetFile',maxCount:1},{name:'coverFile',maxCount:1}],{limits:{fileSize:MAX_COVER_FILE,files:2,fields:7,parts:10,fieldSize:16384,fieldNameSize:100}}))
 async import(@Body() input:unknown,@UploadedFiles() files:Uploads|undefined,@Req() req:Request,@Res({passthrough:true}) res:Response) {
  const fields=parseGameFileFields(input??{});
  if(!files?.presetFile?.[0])throw new ApiError(400,'PRESET_FILE_REQUIRED');
  if(!files.coverFile?.[0])throw new ApiError(400,'GAME_COVER_REQUIRED');
  const preset=decodePresetFile(files.presetFile[0].buffer);
  const cover=await normalizeGameCover(files.coverFile[0].buffer);
  const result=await this.games.importFile(fields,preset,cover,this.origin(),req.headers['x-request-id'] as string);
  res.setHeader('ETag',`"${result.game.revision}"`);
  return result;
 }
 @Post('admin/games/:id/presets/import')
 @UseGuards(AdminGuard)
 @UseInterceptors(FileFieldsInterceptor([{name:'presetFile',maxCount:1}],{limits:{fileSize:MAX_PRESET_FILE,files:1,fields:5,parts:7,fieldSize:16384,fieldNameSize:100}}))
 async addPreset(@Param('id') id:string,@Body() input:unknown,@UploadedFiles() files:Uploads|undefined,@Req() req:Request,@Res({passthrough:true}) res:Response){
  const fields=parse(presetFileFields,input??{});const payload=this.preset(files);
  const preset=await this.games.save('preset',undefined,{slug:fields.slug,name:fields.presetName??payload.name,description:fields.description,status:fields.status,isDefault:fields.isDefault,format:'action-preset-v1',payload},undefined,req.headers['x-request-id'] as string,id);
  res.setHeader('ETag',`"${preset.revision}"`);return {preset,warnings:presetFileWarnings(payload)};
 }
 @Put('admin/games/:id/presets/:presetId/file')
 @UseGuards(AdminGuard)
 @UseInterceptors(FileFieldsInterceptor([{name:'presetFile',maxCount:1}],{limits:{fileSize:MAX_PRESET_FILE,files:1,fields:1,parts:3,fieldSize:16384,fieldNameSize:100}}))
 async replacePreset(@Param('id') id:string,@Param('presetId') presetId:string,@Body() input:unknown,@UploadedFiles() files:Uploads|undefined,@Req() req:Request,@Res({passthrough:true}) res:Response){
  matchRevision(req.headers['if-match']);const fields=parse(presetReplacementFields,input??{});
  const result=await this.games.replacePresetFile(id,presetId,this.preset(files),fields.presetName,req.headers['if-match'],req.headers['x-request-id'] as string);
  res.setHeader('ETag',`"${result.preset.revision}"`);return result;
 }
 @Put('admin/games/:id/cover')
 @UseGuards(AdminGuard)
 @UseInterceptors(FileFieldsInterceptor([{name:'coverFile',maxCount:1}],{limits:{fileSize:MAX_COVER_FILE,files:1,fields:0,parts:2,fieldNameSize:100}}))
 async replaceCover(@Param('id') id:string,@Body() input:unknown,@UploadedFiles() files:Uploads|undefined,@Req() req:Request,@Res({passthrough:true}) res:Response){
  matchRevision(req.headers['if-match']);parse(coverReplacementFields,input??{});
  if(!files?.coverFile?.[0])throw new ApiError(400,'GAME_COVER_REQUIRED');
  const result=await this.games.replaceCover(id,await normalizeGameCover(files.coverFile[0].buffer),req.headers['if-match'],this.origin(),req.headers['x-request-id'] as string);
  res.setHeader('ETag',`"${result.revision}"`);return result;
 }
 private origin(){return this.config.apiOrigin??this.config.auth?.origin??`http://127.0.0.1:${this.config.port}`;}
 private preset(files:Uploads|undefined){if(!files?.presetFile?.[0])throw new ApiError(400,'PRESET_FILE_REQUIRED');return decodePresetFile(files.presetFile[0].buffer);}
 @Get('games/:id/cover')
 async cover(@Param('id') id:string,@Res() res:Response) { return this.sendCover(id,res,false); }
 @Get('admin/games/:id/cover')
 @UseGuards(AdminGuard)
 async adminCover(@Param('id') id:string,@Res() res:Response) { return this.sendCover(id,res,true); }
 private async sendCover(id:string,res:Response,admin:boolean) {
  const bytes=await this.games.cover(id,admin);
  res.setHeader('Content-Type','image/webp');res.setHeader('Content-Length',String(bytes.length));
  res.setHeader('Content-Security-Policy',"default-src 'none'; sandbox");
  res.end(bytes);
 }
}
