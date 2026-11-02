import {Controller,Get,Put,Body,Req,Res,Inject,UseGuards} from '@nestjs/common'
import type {Response} from 'express'
import {SessionGuard,type SessionRequest} from '../auth/session.guard.js'
import {ApiError} from '../http/api-error.js'
import {WinService} from './service.js'
@Controller('me/win')
@UseGuards(SessionGuard)
export class WinController {
 constructor(@Inject(WinService) private readonly win:WinService){}
 @Get()async get(@Req()req:SessionRequest,@Res({passthrough:true})res:Response){const value=await this.win.get(req.verifiedSession);res.setHeader('etag','"'+value.revision+'"');return value}
 @Put()async save(@Req()req:SessionRequest,@Body()body:unknown,@Res({passthrough:true})res:Response){if(req.headers['if-none-match']!==undefined)throw new ApiError(400,'INVALID_PRECONDITION');const value=await this.win.save(req.verifiedSession,body,req.headers['if-match'],req.headers['x-request-id'] as string);res.setHeader('etag','"'+value.revision+'"');return value}
}
