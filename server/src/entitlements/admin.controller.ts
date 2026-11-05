import {Controller,Get,Post,Query,Body,Req,Inject,UseGuards,HttpCode} from '@nestjs/common'
import type {Request} from 'express'
import {AdminGuard} from '../http/admin.guard.js'
import {EntitlementsAdminService} from './admin.service.js'
import {keySchema,parse} from './contracts.js'
import {ApiError} from '../http/api-error.js'
function key(req:Request){
 const count=req.rawHeaders.filter((_,i)=>i%2===0&&req.rawHeaders[i].toLowerCase()==='idempotency-key').length
 if(!count)throw new ApiError(428,'IDEMPOTENCY_KEY_REQUIRED')
 if(count!==1)throw new ApiError(400,'INVALID_REQUEST')
 return parse(keySchema,req.headers['idempotency-key'])
}
@Controller('admin/entitlements')
@UseGuards(AdminGuard)
export class EntitlementsAdminController{
 constructor(@Inject(EntitlementsAdminService) private readonly service:EntitlementsAdminService){}
 @Get() get(@Query() query:unknown){return this.service.get(query)}
 @Get('history') history(@Query() query:unknown){return this.service.history(query)}
 @Post('adjust') @HttpCode(200) adjust(@Body() body:unknown,@Req() req:Request){return this.service.mutate('adjust',body,key(req),req.headers['x-request-id'] as string)}
 @Post('set-expiry') @HttpCode(200) expiry(@Body() body:unknown,@Req() req:Request){return this.service.mutate('set-expiry',body,key(req),req.headers['x-request-id'] as string)}
 @Post('revoke') @HttpCode(200) revoke(@Body() body:unknown,@Req() req:Request){return this.service.mutate('revoke',body,key(req),req.headers['x-request-id'] as string)}
}
