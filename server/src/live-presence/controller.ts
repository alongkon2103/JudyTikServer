import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Post, Put, Req, UseGuards } from '@nestjs/common';
import { SessionGuard, type SessionRequest } from '../auth/session.guard.js';
import { LivePresenceService } from './service.js';
@Controller('me/live-presence')
@UseGuards(SessionGuard)
export class LivePresenceController {
    constructor(
    @Inject(LivePresenceService)
    private readonly presence: LivePresenceService) { }
    @Post()
    @HttpCode(200)
    start(
    @Req()
    req: SessionRequest,
    @Body()
    body: unknown) { return this.presence.start(req.verifiedSession, body); }
    @Put(':connectionId')
    heartbeat(
    @Req()
    req: SessionRequest,
    @Param('connectionId')
    id: string,
    @Body()
    body: unknown) { return this.presence.heartbeat(req.verifiedSession, id, body); }
    @Delete(':connectionId')
    @HttpCode(204)
    stop(
    @Req()
    req: SessionRequest,
    @Param('connectionId')
    id: string) { return this.presence.stop(req.verifiedSession, id); }
}
@Controller('live')
@UseGuards(SessionGuard)
export class LiveDirectoryController {
    constructor(
    @Inject(LivePresenceService)
    private readonly presence: LivePresenceService) { }
    @Get('active')
    list(
    @Req()
    req: SessionRequest) { return this.presence.list(req.verifiedSession); }
}
