import { Controller, Get, Put, Body, Req, Res, Inject, UseGuards } from '@nestjs/common'
import type { Response } from 'express'
import { SessionGuard, type SessionRequest } from '../auth/session.guard.js'
import { ApiError } from '../http/api-error.js'
import { OverlaysService } from './service.js'

@Controller('me/overlays')
@UseGuards(SessionGuard)
export class OverlaysController {
  constructor(@Inject(OverlaysService) private readonly overlays: OverlaysService) {}

  private response(value: Awaited<ReturnType<OverlaysService['get']>>, req: SessionRequest, body?: unknown) {
    const features=String(req.headers['x-judytik-overlay-features']??'').split(',')
    if(!features.includes('top-likers-limit')){value=structuredClone(value);delete value.data.widgets['top-likers'].likerLimit}
    if(!features.includes('big-gift-ranking')){value=structuredClone(value);delete value.data.widgets['big-gift'].bigGiftLimit}
    if(!features.includes('spin-weights')){
      value=structuredClone(value)
      if(value.data.widgets.spin.spinOptions)value.data.widgets.spin.spinOptions=value.data.widgets.spin.spinOptions.map(({weight:_weight,...option})=>option)
    }
    if(!features.includes('slider-item-colors')&&value.data.widgets.slider?.sliderItems){
      value=structuredClone(value)
      value.data.widgets.slider.sliderItems=value.data.widgets.slider.sliderItems!.map(({textColor:_color,...item})=>item)
    }
    if (features.includes('slider') ||
        (body && typeof body === 'object' && 'widgets' in body && body.widgets &&
         typeof body.widgets === 'object' && Object.hasOwn(body.widgets, 'slider'))) return value
    // Released desktops reject unknown widget keys and decorated jar themes.
    // Project their response only; preserve the full stored document.
    const { slider: _slider, ...widgets } = value.data.widgets
    if (!['plain-white','plain-black'].includes(widgets['gift-jar'].theme))
      widgets['gift-jar'] = { ...widgets['gift-jar'], theme: 'plain-white' }
    return { ...value, data: { ...value.data, widgets } }
  }

  @Get() async get(@Req() req: SessionRequest, @Res({ passthrough: true }) res: Response) {
    const value = await this.overlays.get(req.verifiedSession)
    res.setHeader('etag', '"' + value.revision + '"')
    return this.response(value, req)
  }

  @Put() async save(@Req() req: SessionRequest, @Body() body: unknown, @Res({ passthrough: true }) res: Response) {
    if (req.headers['if-none-match'] !== undefined) throw new ApiError(400, 'INVALID_PRECONDITION')
    const value = await this.overlays.save(req.verifiedSession, body, req.headers['if-match'], req.headers['x-request-id'] as string)
    res.setHeader('etag', '"' + value.revision + '"')
    return this.response(value, req, body)
  }
}
