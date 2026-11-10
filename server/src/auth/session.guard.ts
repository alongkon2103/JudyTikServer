import {
  Inject,
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common'
import type { Request, Response } from 'express'
import { AuthService, type VerifiedSession } from './auth.service.js'
import { ApiError } from '../http/api-error.js'
import { enforceAccountRateLimit } from '../http/account-rate-limit.js'
export type SessionRequest = Request & { verifiedSession: VerifiedSession }
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}
  async canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest<SessionRequest>(),
      header = req.headers.authorization
    const count = req.rawHeaders.filter(
      (_, i) =>
        i % 2 === 0 && req.rawHeaders[i].toLowerCase() === 'authorization',
    ).length
    if (
      count !== 1 ||
      typeof header !== 'string' ||
      header.length > 8192 ||
      !/^Bearer [^\s,]+$/i.test(header)
    )
      throw new ApiError(401, 'AUTH_UNAUTHORIZED')
    req.verifiedSession = await this.auth.authenticate(header.slice(7))
    enforceAccountRateLimit(req, context.switchToHttp().getResponse<Response>(), req.verifiedSession.userId)
    return true
  }
}
