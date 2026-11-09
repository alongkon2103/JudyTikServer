import {Body,Controller,Get,Inject,Param,Post,Req,Res,UploadedFiles,UseGuards,UseInterceptors} from '@nestjs/common';
import {FileFieldsInterceptor} from '@nestjs/platform-express';
import type {Request,Response} from 'express';
import {CONFIG,type ServerConfig} from '../config/env.js';
import {AdminGuard} from '../http/admin.guard.js';
import {ApiError} from '../http/api-error.js';
import {GamesService} from './service.js';
import {decodePresetFile,normalizeGameCover,parseGameFileFields,MAX_COVER_FILE} from './files.js';
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
  const origin=this.config.apiOrigin??this.config.auth?.origin??`http://127.0.0.1:${this.config.port}`;
  const result=await this.games.importFile(fields,preset,cover,origin,req.headers['x-request-id'] as string);
  res.setHeader('ETag',`"${result.game.revision}"`);
  return result;
 }
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
