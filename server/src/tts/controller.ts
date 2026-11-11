import { Controller, Get, Put, Body, Req, Res, Inject, UseGuards } from '@nestjs/common'
import type { Response } from 'express'
import { SessionGuard, type SessionRequest } from '../auth/session.guard.js'
import { ApiError } from '../http/api-error.js'
import { TtsService } from './service.js'

@Controller('me/tts')
@UseGuards(SessionGuard)
export class TtsController {
  constructor(@Inject(TtsService) private readonly tts: TtsService) {}
  private response(value:{revision:string;data:unknown},req:SessionRequest){
    const result=structuredClone(value),features=new Set(String(req.headers['x-judytik-tts-features']??'').split(',').map(value=>value.trim()))
    if(result.data&&typeof result.data==='object'){
      const data=result.data as Record<string,unknown>
      if(!features.has('audience'))delete data.audience
      if(!features.has('voice-controls')){delete data.pitch;delete data.messageDelayMs}
    }
    return result
  }

  @Get() async get(@Req() req: SessionRequest, @Res({ passthrough: true }) res: Response) {
    const value = await this.tts.get(req.verifiedSession)
    res.setHeader('etag', '"' + value.revision + '"')
    return this.response(value,req)
  }

  @Put() async save(@Req() req: SessionRequest, @Body() body: unknown, @Res({ passthrough: true }) res: Response) {
    if (req.headers['if-none-match'] !== undefined) throw new ApiError(400, 'INVALID_PRECONDITION')
    const value = await this.tts.save(req.verifiedSession, body, req.headers['if-match'], req.headers['x-request-id'] as string)
    res.setHeader('etag', '"' + value.revision + '"')
    return this.response(value,req)
  }
}
