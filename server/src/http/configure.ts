import {
  Catch,
  HttpException,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common'
import type { NestExpressApplication } from '@nestjs/platform-express'
import type { Request, Response, NextFunction } from 'express'
import { randomUUID } from 'node:crypto'
import { json } from 'express'
import { rateLimit } from 'express-rate-limit'
import { ApiError } from './api-error.js'
const requestId = (req: Request) => req.headers['x-request-id'] as string
@Catch()
class ApiExceptionFilter implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost) {
    const http = host.switchToHttp(),
      request = http.getRequest<Request>(),
      response = http.getResponse<Response>()
    const tooLarge =
      !!error &&
      typeof error === 'object' &&
      'status' in error &&
      error.status === 413
    const malformedJson = error instanceof SyntaxError &&
      'status' in error && error.status === 400 &&
      'type' in error && error.type === 'entity.parse.failed'
    const status =
      error instanceof HttpException ? error.getStatus() : tooLarge ? 413 : malformedJson ? 400 : 500
    const code =
      error instanceof ApiError
        ? error.code
        : ((
            {
              400: 'INVALID_REQUEST',
              404: 'NOT_FOUND',
              413: 'REQUEST_TOO_LARGE',
              429: 'RATE_LIMITED',
            } as Record<number, string>
          )[status] ?? 'INTERNAL_ERROR')
    response.status(status).json({
      error: {
        code,
        message: code,
        requestId: requestId(request) ?? randomUUID(),
      },
    })
  }
}
export function configureApp(app: NestExpressApplication, trustProxy: false | 'loopback' = false) {
  // Only the local proxy is trusted; it must overwrite forwarded headers.
  app.set('trust proxy', trustProxy)
  app.setGlobalPrefix('v1')
  app.use((req: Request, res: Response, next: NextFunction) => {
    const provided = req.headers['x-request-id']
    const id =
      typeof provided === 'string' &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        provided,
      )
        ? provided
        : randomUUID()
    req.headers['x-request-id'] = id
    res.setHeader('x-request-id', id)
    res.setHeader('x-content-type-options', 'nosniff')
    res.setHeader('cache-control', 'no-store')
    next()
  })
  const limiter = (limit: number) =>
    rateLimit({
      windowMs: 60000,
      limit,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      handler: (req: Request, res: Response) =>
        res.status(429).json({
          error: {
            code: 'RATE_LIMITED',
            message: 'RATE_LIMITED',
            requestId: requestId(req),
          },
        }),
    })
  app.use('/v1', limiter(120))
  app.use('/v1/admin', limiter(30))
  app.use('/v1/auth/desktop/attempts', limiter(10))
  app.use('/v1/auth/token', limiter(30))
  const historyJson = json({ limit: '1mb' })
  app.use('/v1/me/live-history', (req: Request, res: Response, next: NextFunction) => req.method === 'PUT' ? historyJson(req, res, next) : next())
  app.useBodyParser('json', { limit: '256kb' })
  app.useBodyParser('urlencoded', {
    extended: false,
    limit: '8kb',
    parameterLimit: 8,
  })
  app.useGlobalFilters(new ApiExceptionFilter())
  return app
}
