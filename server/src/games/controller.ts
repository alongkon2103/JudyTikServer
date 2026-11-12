import {mediaVolumeResponse} from '../presets/media-volume.js';
import { Controller, Get, Post, Put, Delete, Param, Body, Query, Req, Res, Inject, UseGuards } from '@nestjs/common';
import type { Request, Response } from 'express';
import { AdminGuard } from '../http/admin.guard.js';
import { SessionGuard, type SessionRequest } from '../auth/session.guard.js';
import { GamesService } from './service.js';
const requestId = (req: Request) => req.headers['x-request-id'] as string;
function etag(res: Response, row: any) { res.setHeader('ETag', `"${row.revision}"`); return row; }
@Controller('game-categories')
export class GameCategoriesController {
    constructor(
    @Inject(GamesService)
    private readonly service: GamesService) { }
    @Get()
    list() { return this.service.categories(); }
}
@Controller('games')
export class GamesController {
    constructor(
    @Inject(GamesService)
    private readonly service: GamesService) { }
    @Get()
    list(
    @Query()
    query: unknown) { return this.service.list(query); }
    @Get(':id')
    async get(
    @Param('id')
    id: string,
    @Res({ passthrough: true })
    res: Response) { return etag(res, await this.service.get(id)); }
    @Get(':id/presets')
    @UseGuards(SessionGuard)
    async presets(
    @Req() req:SessionRequest,
    @Res({passthrough:true}) res:Response,
    @Param('id')
    id: string,
    @Query()
    query: unknown) { res.setHeader('Cache-Control','no-store');return mediaVolumeResponse(await this.service.gamePresets(id, false, query, req.verifiedSession),req.headers['x-judytik-preset-features']); }
    @Get(':id/presets/:presetId')
    @UseGuards(SessionGuard)
    async preset(
    @Req() req:SessionRequest,
    @Param('id')
    id: string,
    @Param('presetId')
    presetId: string,
    @Res({ passthrough: true })
    res: Response) { res.setHeader('Cache-Control','no-store');return mediaVolumeResponse(etag(res, await this.service.preset(id, presetId, false, req.verifiedSession)),req.headers['x-judytik-preset-features']); }
    @Post(':id/presets/:presetId/import')
    @UseGuards(SessionGuard)
    async importPreset(
    @Req()
    req: SessionRequest,
    @Param('id')
    id: string,
    @Param('presetId')
    presetId: string,
    @Body()
    body: unknown,
    @Res({ passthrough: true })
    res: Response) { const result = await this.service.importPreset(req.verifiedSession, id, presetId, body, requestId(req)); etag(res, result.preset); return mediaVolumeResponse(result,req.headers['x-judytik-preset-features']); }
}
@Controller('admin/game-categories')
@UseGuards(AdminGuard)
export class AdminGameCategoriesController {
    constructor(
    @Inject(GamesService)
    private readonly service: GamesService) { }
    @Get()
    list(
    @Query()
    query: unknown) { return this.service.categories(true); }
    @Post('reorder')
    reorder(
    @Body()
    body: unknown,
    @Req()
    req: Request) { return this.service.reorder('category', body, requestId(req)); }
    @Post()
    async create(
    @Body()
    body: unknown,
    @Req()
    req: Request,
    @Res({ passthrough: true })
    res: Response) { return etag(res, await this.service.save('category', undefined, body, undefined, requestId(req))); }
    @Put(':id')
    async update(
    @Param('id')
    id: string,
    @Body()
    body: unknown,
    @Req()
    req: Request,
    @Res({ passthrough: true })
    res: Response) { return etag(res, await this.service.save('category', id, body, req.headers['if-match'], requestId(req))); }
    @Delete(':id')
    async remove(
    @Param('id')
    id: string,
    @Req()
    req: Request,
    @Res({ passthrough: true })
    res: Response) { return etag(res, await this.service.remove('category', id, req.headers['if-match'], requestId(req))); }
}
@Controller('admin/games')
@UseGuards(AdminGuard)
export class AdminGamesController {
    constructor(
    @Inject(GamesService)
    private readonly service: GamesService) { }
    @Get()
    list(
    @Query()
    query: unknown) { return this.service.list(query, true); }
    @Post('reorder')
    reorder(
    @Body()
    body: unknown,
    @Req()
    req: Request) { return this.service.reorder('game', body, requestId(req)); }
    @Post()
    async create(
    @Body()
    body: unknown,
    @Req()
    req: Request,
    @Res({ passthrough: true })
    res: Response) { return etag(res, await this.service.save('game', undefined, body, undefined, requestId(req))); }
    @Put(':id')
    async update(
    @Param('id')
    id: string,
    @Body()
    body: unknown,
    @Req()
    req: Request,
    @Res({ passthrough: true })
    res: Response) { return etag(res, await this.service.save('game', id, body, req.headers['if-match'], requestId(req))); }
    @Delete(':id')
    async remove(
    @Param('id')
    id: string,
    @Req()
    req: Request,
    @Res({ passthrough: true })
    res: Response) { return etag(res, await this.service.remove('game', id, req.headers['if-match'], requestId(req))); }
    @Get(':id')
    async get(
    @Param('id')
    id: string,
    @Res({ passthrough: true })
    res: Response) { return etag(res, await this.service.get(id, true)); }
    @Get(':id/presets')
    presets(
    @Param('id')
    id: string,
    @Query()
    query: unknown) { return this.service.gamePresets(id, true, query); }
    @Get(':id/presets/:presetId')
    async preset(
    @Param('id')
    id: string,
    @Param('presetId')
    presetId: string,
    @Res({ passthrough: true })
    res: Response) { return etag(res, await this.service.preset(id, presetId, true)); }
    @Get(':id/presets/:presetId/versions')
    versions(
    @Param('id')
    id: string,
    @Param('presetId')
    presetId: string,
    @Query()
    query: unknown) { return this.service.versions(id, presetId, query); }
    @Post(':id/presets')
    async createPreset(
    @Param('id')
    id: string,
    @Body()
    body: unknown,
    @Req()
    req: Request,
    @Res({ passthrough: true })
    res: Response) { return etag(res, await this.service.save('preset', undefined, body, undefined, requestId(req), id)); }
    @Put(':id/presets/:presetId')
    async updatePreset(
    @Param('id')
    id: string,
    @Param('presetId')
    presetId: string,
    @Body()
    body: unknown,
    @Req()
    req: Request,
    @Res({ passthrough: true })
    res: Response) { return etag(res, await this.service.save('preset', presetId, body, req.headers['if-match'], requestId(req), id)); }
    @Delete(':id/presets/:presetId')
    async removePreset(
    @Param('id')
    id: string,
    @Param('presetId')
    presetId: string,
    @Req()
    req: Request,
    @Res({ passthrough: true })
    res: Response) { return etag(res, await this.service.remove('preset', presetId, req.headers['if-match'], requestId(req), id)); }
}
