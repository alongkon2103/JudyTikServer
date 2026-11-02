import {
  Body,
  Controller,
  Get,
  Post,
  Param,
  Query,
  Req,
  Res,
  Inject,
  HttpCode,
  UseGuards,
} from '@nestjs/common'
import type { Request, Response } from 'express'
import { AuthService } from './auth.service.js'
import { AuthSecurity } from './security.js'
import { SessionGuard, type SessionRequest } from './session.guard.js'
import { ApiError } from '../http/api-error.js'
const escape = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (char) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        char
      ]!,
  )
@Controller('auth')
export class AuthController {
  constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(AuthSecurity) private readonly security: AuthSecurity,
  ) {}
  private cookie(req: Request) {
    const name = this.security.requireConfig().origin.startsWith('https:')
        ? '__Host-judytik-auth'
        : 'judytik-auth',
      values = (req.headers.cookie ?? '')
        .split(';')
        .map((x) => x.trim())
        .filter((x) => x.startsWith(name + '='))
    if (values.length > 1) throw new ApiError(400, 'CSRF_INVALID')
    return values[0]?.slice(name.length + 1)
  }
  @Post('desktop/attempts') start(@Body() body: unknown, @Req() req: Request) {
    return this.auth.startAttempt(body, req.headers['x-request-id'] as string)
  }
  @Get('desktop/launch') async launch(@Query()query:Record<string,unknown>,@Req()req:Request,@Res()res:Response){
    if(Object.keys(query).length!==2||typeof query.attemptId!=='string'||typeof query.launch!=='string')throw new ApiError(400,'INVALID_REQUEST')
    const result=await this.auth.launchAuthorization(query.attemptId,query.launch,this.cookie(req),req.headers['x-request-id'] as string),secure=this.security.requireConfig().origin.startsWith('https:')
    res.cookie(secure?'__Host-judytik-auth':'judytik-auth',result.cookie,{httpOnly:true,secure,sameSite:'lax',path:secure?'/':'/v1/auth',maxAge:600000})
    res.setHeader('referrer-policy','no-referrer')
    res.redirect(302,result.url)
  }
  @Get('desktop/authorize') async page(
    @Query() query: Record<string, unknown>,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    if (Object.keys(query).length !== 1 || typeof query.attemptId !== 'string')
      throw new ApiError(400, 'INVALID_REQUEST')
    const data = await this.auth.authorizationPage(
        query.attemptId,
        this.cookie(req),
      ),
      secure = this.security.requireConfig().origin.startsWith('https:')
    res.cookie(secure ? '__Host-judytik-auth' : 'judytik-auth', data.cookie, {
      httpOnly: true,
      secure,
      sameSite: 'lax',
      path: secure ? '/' : '/v1/auth',
      maxAge: 600000,
    })
    // Browsers can enforce form-action across provider and native redirects.
    res.setHeader(
      'content-security-policy',
      `default-src 'none'; style-src 'unsafe-inline'; form-action 'self' ${data.provider === 'google' ? 'https://accounts.google.com' : 'https://discord.com'} ${data.redirectUri}; frame-ancestors 'none'; base-uri 'none'`,
    )
    // no-referrer makes a native form POST send Origin: null.
    res.setHeader('referrer-policy', 'same-origin')
    res
      .type('html')
      .send(
        `<!doctype html><html lang="th"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>เข้าสู่ระบบ JudyTik</title><style>body{font:16px system-ui;background:#130a1f;color:#f6f2f8;max-width:440px;margin:12vh auto;padding:24px}main{background:#211631;border-radius:24px;padding:32px}p{line-height:1.6;color:#cdbcd2}button{font:inherit;background:#dd0e75;color:#fff;border:0;border-radius:16px;padding:14px 20px;cursor:pointer}button:focus-visible{outline:3px solid #fff;outline-offset:4px}</style><main><h1>เข้าสู่ระบบ JudyTik</h1><p>อุปกรณ์: ${escape(data.deviceLabel)}</p><p>ดำเนินการต่อด้วย ${data.provider === 'google' ? 'Google' : 'Discord'} เพื่อเข้าสู่โปรแกรมบนอุปกรณ์นี้</p><form method="post" action="/v1/auth/desktop/authorize"><input type="hidden" name="attemptId" value="${data.attemptId}"><input type="hidden" name="csrfToken" value="${data.csrfToken}"><button type="submit">ดำเนินการต่อ</button></form><p>หากไม่ได้เริ่มจากโปรแกรม JudyTik ให้ปิดหน้านี้</p></main></html>`,
      )
  }
  @Post('desktop/authorize') async confirm(
    @Body() body: unknown,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    res.redirect(
      302,
      await this.auth.confirmAuthorization(
        body,
        this.cookie(req),
        req.headers.origin,
        req.headers['x-request-id'] as string,
      ),
    )
  }
  @Get('oauth/:provider/callback') async callback(
    @Param('provider') provider: string,
    @Query() query: unknown,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    res.setHeader('referrer-policy', 'no-referrer')
    res.redirect(
      302,
      await this.auth.completeProvider(
        provider,
        query,
        this.cookie(req),
        req.headers['x-request-id'] as string,
      ),
    )
  }
  @Post('desktop/cancel') @HttpCode(204) async cancel(
    @Body() body: unknown,
    @Req() req: Request,
  ) {
    await this.auth.cancel(body, req.headers['x-request-id'] as string)
  }
  @Post('token') @HttpCode(200) token(
    @Body() body: unknown,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    res.setHeader('pragma', 'no-cache')
    return this.auth.exchangeToken(body, req.headers['x-request-id'] as string)
  }
  @Post('logout') @UseGuards(SessionGuard) @HttpCode(204) async logout(
    @Req() req: SessionRequest,
  ) {
    await this.auth.logout(
      req.verifiedSession,
      req.headers['x-request-id'] as string,
    )
  }
}
