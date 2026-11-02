import { Controller, Get, Put, Body, Req, Param, Query, Inject, UseGuards } from '@nestjs/common'
import { SessionGuard, type SessionRequest } from '../auth/session.guard.js'
import { HistoryService } from './service.js'
@Controller('me/live-history')
@UseGuards(SessionGuard)
export class HistoryController {
 constructor(@Inject(HistoryService) private readonly history:HistoryService) {}
 @Get() list(@Req() req:SessionRequest,@Query() query:unknown) {return this.history.list(req.verifiedSession,query)}
 @Get(':id') get(@Req() req:SessionRequest,@Param('id') id:string) {return this.history.get(req.verifiedSession,id)}
 @Put(':id') save(@Req() req:SessionRequest,@Param('id') id:string,@Body() body:unknown) {return this.history.save(req.verifiedSession,id,body,req.headers['x-request-id'] as string)}
}
