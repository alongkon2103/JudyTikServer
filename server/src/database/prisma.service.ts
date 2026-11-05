import {
  Inject,
  Injectable,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient, Prisma } from '../generated/prisma/client.js'
import { CONFIG, type ServerConfig } from '../config/env.js'
export type VerifiedUserId = string & {
  readonly __verifiedSession: unique symbol
}
@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
  readonly client: PrismaClient
  constructor(@Inject(CONFIG) private readonly config: ServerConfig) {
    this.client = new PrismaClient({
      adapter: new PrismaPg({
        connectionString: config.databaseUrl,
        // Keep timestamp encoding/decoding consistent even when Windows/Postgres
        // defaults to a local zone; all API expiry timestamps are UTC instants.
        options: '-c timezone=UTC',
        max: 10,
        connectionTimeoutMillis: 10000,
      }),
      log: [],
    })
  }
  async onModuleInit() {
    await this.client.$connect()
    if (this.config.nodeEnv === 'production') {
      const [role] = await this.client.$queryRaw<
        { unsafe: boolean }[]
      >`SELECT r.rolsuper OR r.rolbypassrls OR EXISTS(SELECT 1 FROM pg_namespace n WHERE n.nspname='judytik' AND pg_has_role(current_user,n.nspowner,'MEMBER')) OR EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='judytik' AND pg_has_role(current_user,c.relowner,'MEMBER')) AS unsafe FROM pg_roles r WHERE r.rolname=current_user`
      if (!role || role.unsafe) throw new Error('DATABASE_ROLE_UNSAFE')
    }
  }
  async onModuleDestroy() {
    await this.client.$disconnect()
  }
  async withUserContext<T>(
    userId: VerifiedUserId,
    run: (tx: Prisma.TransactionClient) => Promise<T>,
    isolation: Prisma.TransactionIsolationLevel = 'ReadCommitted',
  ): Promise<T> {
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        userId,
      )
    )
      throw new Error('INVALID_USER_CONTEXT')
    return this.client.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT set_config('judytik.user_id',${userId},true)`
        return run(tx)
      },
      { isolationLevel: isolation, timeout: 10000 },
    )
  }
}
