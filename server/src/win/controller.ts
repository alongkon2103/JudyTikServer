import {validWinData} from '../../../shared/win.js'
import {Controller,Get,Put,Body,Req,Res,Inject,UseGuards} from '@nestjs/common'
import type {Response} from 'express'
import {SessionGuard,type SessionRequest} from '../auth/session.guard.js'
import {ApiError} from '../http/api-error.js'
import {WinService} from './service.js'
@Controller('me/win')
@UseGuards(SessionGuard)
export class WinController {
 constructor(@Inject(WinService) private readonly win:WinService){}
 private response(value:{revision:string;data:unknown},req:SessionRequest){if(!validWinData(value.data))throw new ApiError(500,'WIN_DATA_INVALID');const data=structuredClone(value.data);if(req.headers['x-judytik-win-features']!=='spin-weights')delete data.slotWeights;return{...value,data}}
 @Get()async get(@Req()req:SessionRequest,@Res({passthrough:true})res:Response){const value=await this.win.get(req.verifiedSession);res.setHeader('etag','"'+value.revision+'"');return this.response(value,req)}
 @Put()async save(@Req()req:SessionRequest,@Body()body:unknown,@Res({passthrough:true})res:Response){if(req.headers['if-none-match']!==undefined)throw new ApiError(400,'INVALID_PRECONDITION');const value=await this.win.save(req.verifiedSession,body,req.headers['if-match'],req.headers['x-request-id'] as string);res.setHeader('etag','"'+value.revision+'"');return this.response(value,req)}
}
