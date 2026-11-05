import { Inject, Injectable } from '@nestjs/common'
import { PrismaService } from '../database/prisma.service.js'
import type { VerifiedSession } from '../auth/auth.service.js'
import type { Provider } from '../auth/contracts.js'
import type { components } from '../contracts/cloud-v1.js'
@Injectable()
export class AccountsService {
  constructor(@Inject(PrismaService) private readonly db: PrismaService) {}
  async me(session: VerifiedSession): Promise<components['schemas']['Me']> {
    const user = await this.db.client.user.findUniqueOrThrow({
      where: { id: session.userId },
      include: { email: true, identities: true },
    })
    return {
      id: user.id,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
      email: user.email
        ? {
            address: user.email.emailKey,
            verifiedAt: user.email.verifiedAt.toISOString(),
          }
        : null,
      providers: [...new Set(user.identities.map((x) => x.provider as Provider))],
    }
  }
  async sessions(
    session: VerifiedSession,
  ): Promise<{ items: components['schemas']['Session'][] }> {
    const current = await this.db.client.session.findUniqueOrThrow({
      where: { id: session.sessionId },
      include: { device: true },
    })
    const others = await this.db.client.session.findMany({
      where: { userId: session.userId, id: { not: session.sessionId } },
      orderBy: { createdAt: 'desc' },
      take: 999,
      include: { device: true },
    })
    return {
      items: [current, ...others].map((row) => ({
        id: row.id,
        deviceId: row.deviceId,
        deviceLabel: row.device.label,
        isCurrent: row.id === session.sessionId,
        createdAt: row.createdAt.toISOString(),
        expiresAt: row.expiresAt.toISOString(),
        revokedAt: row.revokedAt?.toISOString() ?? null,
      })),
    }
  }
}
