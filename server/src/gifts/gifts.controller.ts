import {
  Controller,
  Get,
  Post,
  Patch,
  Query,
  Param,
  Body,
  Req,
  Res,
  Inject,
  UseGuards,
} from '@nestjs/common'
import type { Request, Response } from 'express'
import { GiftsService } from './gifts.service.js'
import { AdminGuard } from '../http/admin.guard.js'
@Controller('gifts')
export class GiftsController {
  constructor(@Inject(GiftsService) private readonly service: GiftsService) {}
  @Get() list(@Query() query: unknown) {
    return this.service.list(query)
  }
  @Get(':id') get(@Param('id') id: string, @Query() query: unknown) {
    return this.service.get(id, query)
  }
}
@Controller('admin/gifts')
@UseGuards(AdminGuard)
export class AdminGiftsController {
  constructor(@Inject(GiftsService) private readonly service: GiftsService) {}
  @Get() list(@Query() query: unknown) {
    return this.service.list(query, true)
  }
  @Post('sync') sync(@Req() request: Request) {
    return this.service.sync(request.headers['x-request-id'] as string)
  }
  @Patch(':id') async patch(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.service.patch(
      id,
      body,
      request.headers['if-match'],
      request.headers['x-request-id'] as string,
    )
    response.setHeader('ETag', `"${result.revision}"`)
    return result
  }
}
