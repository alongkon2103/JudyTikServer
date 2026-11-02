import {
  Inject,
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common'
import { createHash, timingSafeEqual } from 'node:crypto'
import type { Request } from 'express'
import { CONFIG, type ServerConfig } from '../config/env.js'
import { ApiError } from './api-error.js'
@Injectable()
export class AdminGuard implements CanActivate {
  private readonly expected: Buffer
  constructor(@Inject(CONFIG) config: ServerConfig) {
    this.expected = createHash('sha256').update(config.adminApiKey).digest()
  }
  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<Request>()
    const header = request.headers.authorization
    const count = request.rawHeaders.filter(
      (_, index) =>
        index % 2 === 0 &&
        request.rawHeaders[index].toLowerCase() === 'authorization',
    ).length
    const match =
      typeof header === 'string'
        ? /^Bearer ([A-Za-z0-9_-]{32,128})$/i.exec(header)
        : null
    if (
      count !== 1 ||
      !match ||
      !timingSafeEqual(
        createHash('sha256').update(match[1]).digest(),
        this.expected,
      )
    )
      throw new ApiError(401, 'ADMIN_UNAUTHORIZED')
    return true
  }
}
