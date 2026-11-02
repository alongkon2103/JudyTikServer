import {
  Body,
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Req,
  Inject,
  HttpCode,
  UseGuards,
} from '@nestjs/common'
import { AuthService } from '../auth/auth.service.js'
import { SessionGuard, type SessionRequest } from '../auth/session.guard.js'
import { AccountsService } from './accounts.service.js'
import { EmailService } from './email.service.js'
import { EntitlementsService } from '../entitlements/entitlements.service.js'
@Controller('me')
@UseGuards(SessionGuard)
export class AccountsController {
  constructor(
    @Inject(AccountsService) private readonly accounts: AccountsService,
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(EmailService) private readonly email: EmailService,
    @Inject(EntitlementsService)
    private readonly entitlements: EntitlementsService,
  ) {}
  @Get() me(@Req() req: SessionRequest) {
    return this.accounts.me(req.verifiedSession)
  }
  @Get('entitlements') plan(@Req() req: SessionRequest) {
    return this.entitlements.get(req.verifiedSession)
  }
  @Get('sessions') sessions(@Req() req: SessionRequest) {
    return this.accounts.sessions(req.verifiedSession)
  }
  @Delete('sessions/:sessionId') @HttpCode(204) async revoke(
    @Param('sessionId') id: string,
    @Req() req: SessionRequest,
  ) {
    await this.auth.revokeSession(
      req.verifiedSession,
      id,
      req.headers['x-request-id'] as string,
    )
  }
  @Post('email/challenges') @HttpCode(202) challenge(
    @Body() body: unknown,
    @Req() req: SessionRequest,
  ) {
    return this.email.request(
      req.verifiedSession,
      body,
      req.ip ?? 'unknown',
      req.headers['x-request-id'] as string,
    )
  }
  @Post('email/challenges/:challengeId/verify') @HttpCode(200) verify(
    @Param('challengeId') id: string,
    @Body() body: unknown,
    @Req() req: SessionRequest,
  ) {
    return this.email.verify(
      req.verifiedSession,
      id,
      body,
      req.headers['x-request-id'] as string,
    )
  }
}
