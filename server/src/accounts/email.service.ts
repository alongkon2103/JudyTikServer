import { randomInt, randomUUID } from 'node:crypto'
import { Inject, Injectable } from '@nestjs/common'
import { PrismaService } from '../database/prisma.service.js'
import type { VerifiedSession } from '../auth/auth.service.js'
import { CLOCK, type Clock } from '../auth/clock.js'
import { AuthSecurity, equal, sha256 } from '../auth/security.js'
import { assertContract } from '../auth/contracts.js'
import { VerificationMailer } from './mailer.js'
import { ApiError } from '../http/api-error.js'
import { audit } from '../audit/write.js'
import type { components } from '../contracts/cloud-v1.js'
@Injectable()
export class EmailService {
  constructor(
    @Inject(PrismaService) private readonly db: PrismaService,
    @Inject(AuthSecurity) private readonly security: AuthSecurity,
    @Inject(VerificationMailer) private readonly mailer: VerificationMailer,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}
  async request(
    session: VerifiedSession,
    input: unknown,
    ip: string,
    requestId: string,
  ): Promise<components['schemas']['EmailChallenge']> {
    const body = assertContract('EmailChallengeRequest', input)
    if (!this.mailer.configured())
      throw new ApiError(503, 'EMAIL_NOT_CONFIGURED')
    const email = body.email.trim().toLowerCase(),
      id = randomUUID(),
      code = randomInt(0, 1000000).toString().padStart(6, '0'),
      ipHash = this.security.ipMac(ip)
    const row = await this.db.client.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${'email-ip:' + ipHash.toString('hex')},0))`
      await tx.$queryRaw`SELECT id FROM judytik.users WHERE id=${session.userId}::uuid FOR UPDATE`
      const now = this.clock.now(),
        recent = await tx.emailChallenge.findMany({
          where: {
            userId: session.userId,
            createdAt: { gt: new Date(now.getTime() - 900000) },
          },
          orderBy: { createdAt: 'desc' },
        }),
        ipCount = await tx.emailChallenge.count({
          where: {
            requestIpHash: ipHash,
            createdAt: { gt: new Date(now.getTime() - 3600000) },
          },
        })
      if (
        recent.length >= 3 ||
        (recent[0] && now.getTime() - recent[0].createdAt.getTime() < 60000) ||
        ipCount >= 10
      )
        throw new ApiError(429, 'EMAIL_RATE_LIMITED')
      await tx.emailChallenge.updateMany({
        where: {
          userId: session.userId,
          consumedAt: null,
          invalidatedAt: null,
        },
        data: { invalidatedAt: now },
      })
      const row = await tx.emailChallenge.create({
        data: {
          id,
          userId: session.userId,
          emailKey: email,
          codeHmac: this.security.emailMac(id, session.userId, email, code),
          requestIpHash: ipHash,
          createdAt: now,
          expiresAt: new Date(now.getTime() + 600000),
        },
      })
      await audit(tx, {
        eventName: 'email.challenge.created',
        actorUserId: session.userId,
        sessionId: session.sessionId,
        resourceId: id,
        requestId,
      })
      return row
    })
    try {
      await this.mailer.send(email, code, row.expiresAt)
    } catch {
      await this.db.client.emailChallenge.updateMany({
        where: { id, consumedAt: null, invalidatedAt: null },
        data: { invalidatedAt: this.clock.now() },
      })
      throw new ApiError(503, 'EMAIL_SEND_UNAVAILABLE')
    }
    return {
      id,
      expiresAt: row.expiresAt.toISOString(),
      resendAfterSeconds: 60,
    }
  }
  async verify(
    session: VerifiedSession,
    value: string,
    input: unknown,
    requestId: string,
  ): Promise<components['schemas']['VerifiedEmail']> {
    const id = assertContract('UUID', value),
      body = assertContract('EmailCode', input),
      initial = await this.db.client.emailChallenge.findUnique({
        where: { id },
      })
    if (!initial || initial.userId !== session.userId)
      throw new ApiError(404, 'EMAIL_CHALLENGE_NOT_FOUND')
    const result = await this.db.client.$transaction<
      components['schemas']['VerifiedEmail'] | { error: string; status: number }
    >(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${'email-address:' + sha256(initial.emailKey).toString('hex')},0))`
      await tx.$queryRaw`SELECT id FROM judytik.users WHERE id=${session.userId}::uuid FOR UPDATE`
      await tx.$queryRaw`SELECT id FROM judytik.email_challenges WHERE id=${id}::uuid FOR UPDATE`
      const row = await tx.emailChallenge.findUniqueOrThrow({ where: { id } }),
        now = this.clock.now()
      if (
        row.consumedAt ||
        row.invalidatedAt ||
        row.expiresAt <= now ||
        row.attempts >= 5
      )
        return { error: 'EMAIL_CODE_INVALID', status: 400 } as const
      if (
        !equal(
          row.codeHmac,
          this.security.emailMac(id, session.userId, row.emailKey, body.code),
        )
      ) {
        const attempts = row.attempts + 1
        await tx.emailChallenge.update({
          where: { id },
          data: { attempts, invalidatedAt: attempts >= 5 ? now : null },
        })
        return { error: 'EMAIL_CODE_INVALID', status: 400 } as const
      }
      const owner = await tx.userEmail.findUnique({
        where: { emailKey: row.emailKey },
      })
      if (owner && owner.userId !== session.userId) {
        await tx.emailChallenge.update({
          where: { id },
          data: { invalidatedAt: now },
        })
        return { error: 'EMAIL_ALREADY_IN_USE', status: 409 } as const
      }
      await tx.userEmail.upsert({
        where: { userId: session.userId },
        create: {
          userId: session.userId,
          emailKey: row.emailKey,
          verifiedAt: now,
          createdAt: now,
        },
        update: { emailKey: row.emailKey, verifiedAt: now },
      })
      await tx.emailChallenge.update({
        where: { id },
        data: { consumedAt: now },
      })
      await audit(tx, {
        eventName: 'email.verified',
        actorUserId: session.userId,
        sessionId: session.sessionId,
        resourceId: id,
        requestId,
      })
      return { address: row.emailKey, verifiedAt: now.toISOString() }
    })
    if ('error' in result) throw new ApiError(result.status, result.error)
    return result
  }
}
