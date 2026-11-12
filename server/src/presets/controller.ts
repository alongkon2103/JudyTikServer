import {mediaVolumeResponse} from './media-volume.js'
import { ApiError } from '../http/api-error.js'
import {
  Controller,
  Get,
  Put,
  Delete,
  Param,
  Query,
  Body,
  Req,
  Res,
  Inject,
  UseGuards,
  HttpCode,
} from '@nestjs/common'
import type { Response } from 'express'
import { SessionGuard, type SessionRequest } from '../auth/session.guard.js'
import { PresetsService } from './service.js'
@Controller('presets')
@UseGuards(SessionGuard)
export class PresetsController {
  constructor(
    @Inject(PresetsService) private readonly presets: PresetsService,
  ) {}
  @Get() async list(@Req() req: SessionRequest, @Query() query: unknown) {
    return mediaVolumeResponse(await this.presets.list(req.verifiedSession, query),req.headers['x-judytik-preset-features'])
  }
  @Get(':presetId') async get(
    @Req() req: SessionRequest,
    @Param('presetId') id: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const value = await this.presets.get(req.verifiedSession, id)
    res.setHeader('etag', '"' + value.revision + '"')
    return mediaVolumeResponse(value,req.headers['x-judytik-preset-features'])
  }
  @Put(':presetId') async save(
    @Req() req: SessionRequest,
    @Param('presetId') id: string,
    @Body() body: unknown,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.presets.save(
      req.verifiedSession,
      id,
      body,
      {
        ifMatch: req.headers['if-match'],
        ifNoneMatch: req.headers['if-none-match'],
      },
      req.headers['x-request-id'] as string,
      req.headers['x-judytik-preset-features'],
    )
    res.status(result.created ? 201 : 200)
    res.setHeader('etag', '"' + result.value.revision + '"')
    return mediaVolumeResponse(result.value,req.headers['x-judytik-preset-features'])
  }
  @Delete(':presetId') @HttpCode(204) async remove(
    @Req() req: SessionRequest,
    @Param('presetId') id: string,
  ) {
    if (req.headers['if-none-match'] !== undefined)
      throw new ApiError(400, 'INVALID_PRECONDITION')
    await this.presets.remove(
      req.verifiedSession,
      id,
      req.headers['if-match'],
      req.headers['x-request-id'] as string,
    )
  }
}
