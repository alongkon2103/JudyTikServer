import { Body, Controller, HttpCode, Inject, Post, Req, Res, UseGuards } from '@nestjs/common'
import type { Response } from 'express'
import { SessionGuard, type SessionRequest } from '../auth/session.guard.js'
import { LiveService } from './service.js'

@Controller('live')
@UseGuards(SessionGuard)
export class LiveController {
  constructor(@Inject(LiveService) private readonly live: LiveService) {}
  @Post('authorize')
  @HttpCode(200)
  async authorize(
    @Req() req: SessionRequest, @Body() body: unknown,
    @Res({ passthrough: true }) res: Response,
  ) {
    const controller = new AbortController()
    const abort = () => controller.abort()
    const close = () => { if (!res.writableEnded) abort() }
    req.once('aborted', abort)
    res.once('close', close)
    if (req.aborted || res.destroyed) abort()
    try { return await this.live.authorize(req.verifiedSession, body, controller.signal) }
    finally {
      req.off('aborted', abort)
      res.off('close', close)
    }
  }
}
