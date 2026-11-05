import { Inject, Injectable } from '@nestjs/common'
import { PrismaService } from '../database/prisma.service.js'
import type { VerifiedSession } from '../auth/auth.service.js'
import { CLOCK, type Clock } from '../auth/clock.js'
import type { components } from '../contracts/cloud-v1.js'
export function entitlementState(endsAt:Date|null,now:Date):components['schemas']['Entitlements']{
 if(endsAt&&endsAt>now)return{plan:'PRO',state:endsAt.getTime()-now.getTime()<=72*3600000?'expiring':'active',expiresAt:endsAt.toISOString(),serverTime:now.toISOString()}
 return{plan:'FREE',state:endsAt?'expired':'free',expiresAt:endsAt?.toISOString()??null,serverTime:now.toISOString()}
}
@Injectable()
export class EntitlementsService {
  constructor(
    @Inject(PrismaService) private readonly db: PrismaService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}
  async get(
    session: VerifiedSession,
  ): Promise<components['schemas']['Entitlements']> {
    const now = this.clock.now(),
      grants = await this.db.client.entitlementGrant.findMany({
        where: {
          userId: session.userId,
          plan: 'PRO',
          revokedAt: null,
          startsAt: { lte: now },
        },
        orderBy: { endsAt: 'desc' },
        take: 1,
      }),
      latest = grants[0]
    return entitlementState(latest?.endsAt??null,now)
  }
}
