import { Inject, Injectable } from '@nestjs/common'
import { z } from 'zod'
import {
  PrismaService,
  type VerifiedUserId,
} from '../database/prisma.service.js'
import type {
  DesktopAuthAttempt,
  Session,
  Prisma,
} from '../generated/prisma/client.js'
import { ApiError } from '../http/api-error.js'
import { audit } from '../audit/write.js'
import {
  AuthSecurity,
  randomSecret,
  sha256,
  equal,
  type AccessIdentity,
} from './security.js'
import {
  OAuthProviders,
  type VerifiedProviderIdentity,
} from './provider-adapters.js'
import { CLOCK, type Clock } from './clock.js'
import {
  assertContract,
  parseAttemptRequest,
  parseConsent,
  type Provider,
} from './contracts.js'
import type { components } from '../contracts/cloud-v1.js'
export interface VerifiedSession {
  userId: VerifiedUserId
  sessionId: string
  deviceId: string
}
const providerSecret = z
  .object({
    verifier: z.string(),
    nonce: z.string().optional(),
    browserHash: z.string(),
  })
  .strict()
const expires = (now: Date, ms: number) => new Date(now.getTime() + ms)
const unauthorized = () => new ApiError(401, 'AUTH_UNAUTHORIZED')
@Injectable()
export class AuthService {
  constructor(
    @Inject(PrismaService) private readonly db: PrismaService,
    @Inject(AuthSecurity) private readonly security: AuthSecurity,
    @Inject(OAuthProviders) private readonly providers: OAuthProviders,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}
  private pending(
    attempt: DesktopAuthAttempt | null,
  ): attempt is DesktopAuthAttempt {
    return (
      !!attempt &&
      !attempt.cancelledAt &&
      !attempt.consumedAt &&
      attempt.expiresAt > this.clock.now()
    )
  }
  private async lockAttempt(tx: Prisma.TransactionClient, id: string) {
    await tx.$queryRaw`SELECT id FROM judytik.desktop_auth_attempts WHERE id=${id}::uuid FOR UPDATE`
    return tx.desktopAuthAttempt.findUnique({ where: { id } })
  }
  private async lockSession(tx: Prisma.TransactionClient, id: string) {
    await tx.$queryRaw`SELECT id FROM judytik.sessions WHERE id=${id}::uuid FOR UPDATE`
    return tx.session.findUnique({ where: { id }, include: { user: true } })
  }
  private browser(cookie: string | undefined) {
    const browser = this.security.readBrowserCookie(cookie ?? '')
    if (!browser) throw new ApiError(400, 'CSRF_INVALID')
    return browser
  }
  private nativeRedirect(
    attempt: DesktopAuthAttempt,
    params: { code?: string; error?: string },
  ) {
    const url = new URL(attempt.redirectUri)
    url.search = new URLSearchParams({
      ...params,
      state: attempt.clientState,
    }).toString()
    return url.toString()
  }
  async startAttempt(
    input: unknown,
    requestId: string,
  ): Promise<components['schemas']['AuthAttempt']> {
    const body = parseAttemptRequest(input),
      cfg = this.security.requireConfig()
    if (!this.providers.available(body.provider))
      throw new ApiError(503, 'OAUTH_PROVIDER_NOT_CONFIGURED')
    const now = this.clock.now()
    const row = await this.db.client.$transaction(async (tx) => {
      const row = await tx.desktopAuthAttempt.create({
        data: {
          provider: body.provider,
          installationId: body.installationId,
          deviceLabel: body.deviceLabel,
          platform: body.platform,
          codeChallenge: body.codeChallenge,
          clientState: body.clientState,
          redirectUri: body.redirectUri,
          createdAt: now,
          expiresAt: expires(now, 600000),
        },
      })
      await audit(tx, {
        eventName: 'auth.attempt.started',
        resourceId: row.id,
        requestId,
      })
      return row
    })
    const url = new URL('/v1/auth/desktop/launch', cfg.origin)
    url.searchParams.set('attemptId', row.id)
    url.searchParams.set('launch', this.security.launchMac(row))
    return {
      id: row.id,
      authorizationUrl: url.toString(),
      expiresAt: row.expiresAt.toISOString(),
    }
  }
  async authorizationPage(value: string, cookie?: string) {
    const id = assertContract('UUID', value)
    this.security.requireConfig()
    const row = await this.db.client.desktopAuthAttempt.findUnique({
      where: { id },
    })
    if (!row) throw new ApiError(404, 'AUTH_ATTEMPT_NOT_FOUND')
    if (!this.pending(row)) throw new ApiError(400, 'OAUTH_STATE_INVALID')
    const next = this.security.newBrowserCookie(cookie),
      browser = this.security.readBrowserCookie(next)!
    return {
      deviceLabel: row.deviceLabel,
      provider: row.provider as Provider,
      redirectUri: row.redirectUri,
      csrfToken: this.security.csrf(browser, id),
      cookie: next,
      attemptId: id,
    }
  }
  async confirmAuthorization(
    input: unknown,
    cookie: string | undefined,
    origin: string | undefined,
    requestId: string,
  ) {
    const form = parseConsent(input),
      cfg = this.security.requireConfig(),
      browser = this.browser(cookie)
    if (
      origin !== cfg.origin ||
      !this.security.checkCsrf(browser, form.attemptId, form.csrfToken)
    )
      throw new ApiError(400, 'CSRF_INVALID')
    const existing = await this.db.client.desktopAuthAttempt.findUnique({
      where: { id: form.attemptId },
    })
    if (!this.pending(existing)) throw new ApiError(400, 'OAUTH_STATE_INVALID')
    return this.beginAuthorization(existing,browser,requestId)
  }
  async launchAuthorization(value:string,ticket:string,cookie:string|undefined,requestId:string) {
    const id=assertContract('UUID',value),row=await this.db.client.desktopAuthAttempt.findUnique({where:{id}})
    if(!this.pending(row)||!/^[-_A-Za-z0-9]{43}$/.test(ticket)||!equal(Buffer.from(ticket),Buffer.from(this.security.launchMac(row))))throw new ApiError(400,'OAUTH_STATE_INVALID')
    const next=this.security.newBrowserCookie(cookie),browser=this.security.readBrowserCookie(next)!
    return {url:await this.beginAuthorization(row,browser,requestId),cookie:next}
  }
  private async beginAuthorization(existing:DesktopAuthAttempt,browser:string,requestId:string) {
    const cfg=this.security.requireConfig()
    const provider = existing.provider as Provider
    if (!this.providers.available(provider))
      throw new ApiError(503, 'OAUTH_PROVIDER_NOT_CONFIGURED')
    const state = randomSecret(),
      verifier = randomSecret(),
      nonce = provider === 'google' ? randomSecret() : undefined,
      redirectUri = cfg.origin + '/v1/auth/oauth/' + provider + '/callback'
    const url = await this.providers.authorizationUrl(provider, {
      state,
      verifier,
      nonce,
      redirectUri,
    })
    await this.db.client.$transaction(async (tx) => {
      const row = await this.lockAttempt(tx, existing.id)
      if (!this.pending(row)) throw new ApiError(400, 'OAUTH_STATE_INVALID')
      if (row.oauthStateHash)
        throw new ApiError(409, 'AUTH_ATTEMPT_IN_PROGRESS')
      await tx.desktopAuthAttempt.update({
        where: { id: row.id },
        data: {
          oauthStateHash: sha256(state),
          oauthNonceHash: nonce ? sha256(nonce) : null,
          providerSecretCiphertext: this.security.seal(
            {
              verifier,
              nonce,
              browserHash: sha256(browser).toString('base64url'),
            },
            provider + ':' + row.id,
          ),
        },
      })
      await audit(tx, {
        eventName: 'auth.browser.confirmed',
        resourceId: row.id,
        requestId,
      })
    })
    return url.toString()
  }
  async completeProvider(
    providerInput: unknown,
    input: unknown,
    cookie: string | undefined,
    requestId: string,
  ) {
    const provider = assertContract('Provider', providerInput),
      cfg = this.security.requireConfig()
    const query = z
      .object({
        state: z.string().regex(/^[-_A-Za-z0-9]{43,128}$/),
        code: z.string().min(1).max(4096).optional(),
        error: z.string().min(1).max(80).optional(),
        iss: z.string().max(2048).optional(),
      })
      .passthrough()
      .safeParse(input)
    if (!query.success || !!query.data.code === !!query.data.error)
      throw new ApiError(400, 'INVALID_REQUEST')
    const q = query.data,
      initial = await this.db.client.desktopAuthAttempt.findUnique({
        where: { oauthStateHash: sha256(q.state) },
      })
    if (!this.pending(initial) || initial.provider !== provider)
      throw new ApiError(400, 'OAUTH_STATE_INVALID')
    const browser = this.browser(cookie)
    const claimed = await this.db.client.$transaction(async (tx) => {
      const row = await this.lockAttempt(tx, initial.id)
      if (
        !this.pending(row) ||
        row.providerStateConsumedAt ||
        !row.providerSecretCiphertext
      )
        throw new ApiError(400, 'OAUTH_STATE_INVALID')
      const secret = providerSecret.safeParse(
        this.security.open(
          row.providerSecretCiphertext,
          provider + ':' + row.id,
        ),
      )
      if (
        !secret.success ||
        !equal(
          Buffer.from(secret.data.browserHash, 'base64url'),
          sha256(browser),
        ) ||
        (provider === 'google' &&
          (!secret.data.nonce ||
            !row.oauthNonceHash ||
            !equal(sha256(secret.data.nonce), row.oauthNonceHash)))
      )
        throw new ApiError(400, 'OAUTH_STATE_INVALID')
      await tx.desktopAuthAttempt.update({
        where: { id: row.id },
        data: {
          providerStateConsumedAt: this.clock.now(),
          ...(q.error
            ? { cancelledAt: this.clock.now(), providerSecretCiphertext: null }
            : {}),
        },
      })
      return { row, secret: secret.data }
    })
    if (q.error)
      return this.nativeRedirect(claimed.row, {
        error: 'OAUTH_PROVIDER_DENIED',
      })
    const callback = new URL(
      cfg.origin + '/v1/auth/oauth/' + provider + '/callback',
    )
    for (const [key, value] of Object.entries(q)) {
      if (typeof value === 'string') callback.searchParams.set(key, value)
    }
    const profile = await this.providers.exchange(provider, callback, {
      state: q.state,
      verifier: claimed.secret.verifier,
      nonce: claimed.secret.nonce,
      redirectUri: cfg.origin + '/v1/auth/oauth/' + provider + '/callback',
    })
    if (profile.provider !== provider)
      throw new ApiError(400, 'OAUTH_PROVIDER_INVALID')
    const code = randomSecret()
    const attempt = await this.db.client.$transaction(async (tx) => {
      const row = await this.lockAttempt(tx, initial.id)
      if (!this.pending(row) || row.grantCodeHash)
        throw new ApiError(400, 'OAUTH_STATE_INVALID')
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${provider + ':' + profile.subject},0))`
      const now = this.clock.now()
      let identity = await tx.identity.findUnique({
        where: {
          provider_providerSubject: {
            provider,
            providerSubject: profile.subject,
          },
        },
        include: { user: true },
      })
      let user = identity?.user
      if (!user) {
        user = await tx.user.create({
          data: {
            displayName: profile.displayName,
            avatarUrl: profile.avatarUrl ?? null,
            createdAt: now,
            identities: {
              create: {
                provider,
                providerSubject: profile.subject,
                createdAt: now,
              },
            },
          },
        })
        await tx.$queryRaw`SELECT set_config('judytik.user_id',${user.id},true)`
        await tx.accountSettings.create({
          data: { userId: user.id, createdAt: now, updatedAt: now },
        })
      }
      if (user.disabledAt) throw unauthorized()
      if(identity) user=await tx.user.update({where:{id:user.id},data:{displayName:profile.displayName,...(profile.avatarUrl?{avatarUrl:profile.avatarUrl}:{})}})
      if (profile.emailVerified && profile.email) {
        const email = profile.email.trim().toLowerCase()
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${'email-address:' + sha256(email).toString('hex')},0))`
        await tx.$queryRaw`SELECT id FROM judytik.users WHERE id=${user.id}::uuid FOR UPDATE`
        await tx.userEmail.createMany({
          data: [
            {
              userId: user.id,
              emailKey: email,
              verifiedAt: now,
              createdAt: now,
            },
          ],
          skipDuplicates: true,
        })
      }
      const updated = await tx.desktopAuthAttempt.update({
        where: { id: row.id },
        data: {
          userId: user.id,
          grantCodeHash: sha256(code),
          grantExpiresAt: new Date(
            Math.min(now.getTime() + 60000, row.expiresAt.getTime()),
          ),
          providerSecretCiphertext: null,
        },
      })
      await audit(tx, {
        eventName: 'auth.provider.verified',
        actorUserId: user.id,
        resourceId: row.id,
        resourceKey: provider,
        requestId,
      })
      return updated
    })
    return this.nativeRedirect(attempt, { code })
  }
  async cancel(input: unknown, requestId: string) {
    const body = assertContract('CancelAttempt', input)
    await this.db.client.$transaction(async (tx) => {
      const row = await this.lockAttempt(tx, body.attemptId)
      if (
        !row ||
        !equal(
          Buffer.from(row.codeChallenge),
          Buffer.from(sha256(body.codeVerifier).toString('base64url')),
        )
      )
        throw new ApiError(400, 'INVALID_REQUEST')
      if (row.consumedAt)
        throw new ApiError(409, 'AUTH_ATTEMPT_ALREADY_CONSUMED')
      if (!row.cancelledAt) {
        await tx.desktopAuthAttempt.update({
          where: { id: row.id },
          data: {
            cancelledAt: this.clock.now(),
            providerSecretCiphertext: null,
          },
        })
        await audit(tx, {
          eventName: 'auth.attempt.cancelled',
          resourceId: row.id,
          requestId,
        })
      }
    })
  }
  async exchangeToken(
    input: unknown,
    requestId: string,
  ): Promise<components['schemas']['Tokens']> {
    const body = assertContract('TokenRequest', input)
    this.security.requireConfig()
    return body.grant_type === 'refresh_token'
      ? this.rotate(body.refresh_token, requestId)
      : this.consumeCode(body, requestId)
  }
  private async consumeCode(
    body: components['schemas']['AuthorizationCodeGrant'],
    requestId: string,
  ) {
    const initial = await this.db.client.desktopAuthAttempt.findUnique({
      where: { grantCodeHash: sha256(body.code) },
    })
    if (!initial) throw unauthorized()
    const raw = randomSecret()
    const result = await this.db.client.$transaction(async (tx) => {
      const row = await this.lockAttempt(tx, initial.id),
        now = this.clock.now()
      if (
        !this.pending(row) ||
        !row.userId ||
        !row.grantExpiresAt ||
        row.grantExpiresAt <= now ||
        row.redirectUri !== body.redirect_uri ||
        !equal(
          Buffer.from(row.codeChallenge),
          Buffer.from(sha256(body.code_verifier).toString('base64url')),
        )
      )
        throw unauthorized()
      const user = await tx.user.findUnique({ where: { id: row.userId } })
      if (!user || user.disabledAt) throw unauthorized()
      const device = await tx.device.upsert({
        where: {
          userId_installationId: {
            userId: user.id,
            installationId: row.installationId,
          },
        },
        create: {
          userId: user.id,
          installationId: row.installationId,
          label: row.deviceLabel,
          platform: row.platform,
          createdAt: now,
          lastSeenAt: now,
        },
        update: {
          label: row.deviceLabel,
          platform: row.platform,
          lastSeenAt: now,
        },
      })
      const session = await tx.session.create({
        data: {
          userId: user.id,
          deviceId: device.id,
          createdAt: now,
          expiresAt: expires(now, 30 * 86400000),
        },
      })
      await tx.refreshToken.create({
        data: {
          sessionId: session.id,
          tokenHash: sha256(raw),
          createdAt: now,
          expiresAt: session.expiresAt,
        },
      })
      await tx.desktopAuthAttempt.update({
        where: { id: row.id },
        data: { consumedAt: now },
      })
      await audit(tx, {
        eventName: 'auth.session.created',
        actorUserId: user.id,
        sessionId: session.id,
        resourceId: row.id,
        requestId,
      })
      return session
    })
    return this.tokens(result, raw)
  }
  private async rotate(raw: string, requestId: string) {
    const initial = await this.db.client.refreshToken.findUnique({
      where: { tokenHash: sha256(raw) },
    })
    if (!initial) throw unauthorized()
    const next = randomSecret()
    const result = await this.db.client.$transaction(async (tx) => {
      const session = await this.lockSession(tx, initial.sessionId),
        now = this.clock.now()
      if (
        !session ||
        session.revokedAt ||
        session.expiresAt <= now ||
        session.user.disabledAt
      )
        return null
      const current = await tx.refreshToken.findUnique({
        where: { id: initial.id },
      })
      if (!current) return null
      if (current.usedAt || current.revokedAt) {
        await tx.session.update({
          where: { id: session.id },
          data: { revokedAt: now },
        })
        await tx.refreshToken.updateMany({
          where: { sessionId: session.id, revokedAt: null },
          data: { revokedAt: now },
        })
        await audit(tx, {
          eventName: 'auth.refresh.reused',
          actorUserId: session.userId,
          sessionId: session.id,
          requestId,
        })
        return null
      }
      if (current.expiresAt <= now) return null
      const replacement = await tx.refreshToken.create({
        data: {
          sessionId: session.id,
          tokenHash: sha256(next),
          createdAt: now,
          expiresAt: session.expiresAt,
        },
      })
      await tx.refreshToken.update({
        where: { id: current.id },
        data: { usedAt: now, replacedBy: replacement.id },
      })
      await tx.device.update({
        where: { id: session.deviceId },
        data: { lastSeenAt: now },
      })
      await audit(tx, {
        eventName: 'auth.refresh.rotated',
        actorUserId: session.userId,
        sessionId: session.id,
        requestId,
      })
      return session
    })
    if (!result) throw unauthorized()
    return this.tokens(result, next)
  }
  private async tokens(
    session: Session,
    refresh: string,
  ): Promise<components['schemas']['Tokens']> {
    return {
      token_type: 'Bearer',
      access_token: await this.security.issueAccess({
        userId: session.userId,
        sessionId: session.id,
        deviceId: session.deviceId,
      }),
      expires_in: 900,
      refresh_token: refresh,
      sessionId: session.id,
      deviceId: session.deviceId,
      sessionExpiresAt: session.expiresAt.toISOString(),
    }
  }
  async authenticate(token: string): Promise<VerifiedSession> {
    const identity = await this.security.verifyAccess(token)
    const session = await this.db.client.session.findFirst({
      where: {
        id: identity.sessionId,
        userId: identity.userId,
        deviceId: identity.deviceId,
        revokedAt: null,
        expiresAt: { gt: this.clock.now() },
        user: { disabledAt: null },
      },
    })
    if (!session) throw unauthorized()
    return {
      userId: session.userId as VerifiedUserId,
      sessionId: session.id,
      deviceId: session.deviceId,
    }
  }
  async logout(session: VerifiedSession, requestId: string) {
    await this.revokeSession(session, session.sessionId, requestId)
  }
  async revokeSession(actor: VerifiedSession, id: string, requestId: string) {
    assertContract('UUID', id)
    await this.db.client.$transaction(async (tx) => {
      const session = await this.lockSession(tx, id)
      if (!session || session.userId !== actor.userId)
        throw new ApiError(404, 'SESSION_NOT_FOUND')
      if (!session.revokedAt) {
        const now = this.clock.now()
        await tx.session.update({ where: { id }, data: { revokedAt: now } })
        await tx.refreshToken.updateMany({
          where: { sessionId: id, revokedAt: null },
          data: { revokedAt: now },
        })
        await audit(tx, {
          eventName: 'auth.session.revoked',
          actorUserId: actor.userId,
          sessionId: actor.sessionId,
          resourceId: id,
          requestId,
        })
      }
    })
  }
}
