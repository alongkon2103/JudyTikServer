import { Inject, Injectable } from '@nestjs/common'
import { PrismaService } from '../database/prisma.service.js'
import type { VerifiedSession } from '../auth/auth.service.js'
import type { AccountSettings } from '../generated/prisma/client.js'
import type { components } from '../contracts/cloud-v1.js'
import { assertContract } from '../auth/contracts.js'
import { ApiError } from '../http/api-error.js'
import { precondition } from '../presets/contracts.js'
import { audit } from '../audit/write.js'
const dto = (row: AccountSettings): components['schemas']['Settings'] => ({
  theme: row.theme as 'dark' | 'light',
  language: row.language as 'th' | 'en' | 'es',
  revision: row.revision.toString(),
  updatedAt: row.updatedAt.toISOString(),
})
@Injectable()
export class SettingsService {
  constructor(@Inject(PrismaService) private readonly db: PrismaService) {}
  async get(actor: VerifiedSession) {
    return this.db.withUserContext(actor.userId, async (tx) =>
      dto(
        await tx.accountSettings.findUniqueOrThrow({
          where: { userId: actor.userId },
        }),
      ),
    )
  }
  async save(
    actor: VerifiedSession,
    input: unknown,
    match: unknown,
    requestId: string,
  ) {
    const body = assertContract('SettingsWrite', input),
      condition = precondition(match, undefined, false)
    if (condition.kind !== 'match')
      throw new ApiError(400, 'INVALID_PRECONDITION')
    return this.db.withUserContext(actor.userId, async (tx) => {
      await tx.$queryRaw`SELECT id FROM judytik.users WHERE id=${actor.userId}::uuid FOR UPDATE`
      const current = await tx.accountSettings.findUniqueOrThrow({
        where: { userId: actor.userId },
      })
      if (current.revision !== condition.revision)
        throw new ApiError(412, 'SETTINGS_VERSION_CONFLICT')
      const row = await tx.accountSettings.update({
        where: { userId: actor.userId },
        data: {
          theme: body.theme,
          language: body.language,
          revision: { increment: 1 },
        },
      })
      await audit(tx, {
        eventName: 'settings.updated',
        actorUserId: actor.userId,
        sessionId: actor.sessionId,
        resourceRevision: row.revision,
        requestId,
      })
      return dto(row)
    })
  }
}
