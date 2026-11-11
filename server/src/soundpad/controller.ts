import { Controller, Get, Put, Body, Req, Res, Inject, UseGuards } from '@nestjs/common'
import type { Response } from 'express'
import { SessionGuard, type SessionRequest } from '../auth/session.guard.js'
import { ApiError } from '../http/api-error.js'
import { SoundpadService } from './service.js'

@Controller('me/soundpad')
@UseGuards(SessionGuard)
export class SoundpadController {
  constructor(@Inject(SoundpadService) private readonly soundpad: SoundpadService) {}

  @Get() async get(@Req() req: SessionRequest, @Res({ passthrough: true }) res: Response) {
    const value = await this.soundpad.get(req.verifiedSession, this.playModes(req))
    res.setHeader('etag', '"' + value.revision + '"')
    return value
  }

  @Put() async save(@Req() req: SessionRequest, @Body() body: unknown, @Res({ passthrough: true }) res: Response) {
    if (req.headers['if-none-match'] !== undefined) throw new ApiError(400, 'INVALID_PRECONDITION')
    const value = await this.soundpad.save(req.verifiedSession, body, req.headers['if-match'], req.headers['x-request-id'] as string, this.playModes(req))
    res.setHeader('etag', '"' + value.revision + '"')
    return value
  }

  private playModes(req: SessionRequest) {
    const features = req.headers['x-judytik-soundpad-features']
    return typeof features === 'string' && features.split(',').some(value => value.trim() === 'play-modes')
  }
}
