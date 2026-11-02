import type { Prisma } from '../generated/prisma/client.js'
export function audit(
  tx: Prisma.TransactionClient,
  record: {
    eventName: string
    requestId: string
    actorUserId?: string
    sessionId?: string
    resourceId?: string
    resourceKey?: string
    resourceRevision?: bigint
  },
) {
  return tx.auditEvent.create({ data: record })
}
