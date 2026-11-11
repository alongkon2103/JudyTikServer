import { Inject, Injectable } from '@nestjs/common'
import { PrismaService } from '../database/prisma.service.js'
import type { VerifiedSession } from '../auth/auth.service.js'
import { ApiError } from '../http/api-error.js'
import { precondition } from '../presets/contracts.js'
import { defaultSoundpadData, validSoundpadData } from '../../../shared/soundpad.js'
import { audit } from '../audit/write.js'

@Injectable()
export class SoundpadService {
  constructor(@Inject(PrismaService) private readonly db: PrismaService) {}

  async get(actor: VerifiedSession, playModes = false) {
    return this.db.withUserContext(actor.userId, async tx => {
      const row = await tx.soundpadWorkspace.findUnique({ where: { userId: actor.userId } })
      if (row && !validSoundpadData(row.data)) throw new ApiError(500, 'SOUNDPAD_DATA_INVALID')
      return this.response(row?.revision.toString() ?? '0', row?.data ?? defaultSoundpadData(), playModes)
    })
  }

  async save(actor: VerifiedSession, input: unknown, match: unknown, requestId: string, playModes = false) {
    if (!validSoundpadData(input)) throw new ApiError(400, 'INVALID_REQUEST')
    const condition = precondition(match, undefined, false)
    if (condition.kind !== 'match') throw new ApiError(400, 'INVALID_PRECONDITION')
    return this.db.withUserContext(actor.userId, async tx => {
      await tx.$queryRaw`SELECT id FROM judytik.users WHERE id=${actor.userId}::uuid FOR UPDATE`
      const current = await tx.soundpadWorkspace.findUnique({ where: { userId: actor.userId } })
      if ((current?.revision ?? 0n) !== condition.revision)
        throw new ApiError(412, 'SOUNDPAD_VERSION_CONFLICT')
      const data = JSON.parse(JSON.stringify(input))
      if (!playModes && current && validSoundpadData(current.data)) {
        const modes = new Map(current.data.pads.map(pad => [pad.id.toLowerCase(), pad.playMode]))
        for (const pad of data.pads) {
          delete pad.playMode
          const mode = modes.get(pad.id.toLowerCase())
          if (mode) pad.playMode = mode
        }
      } else if (!playModes) {
        for (const pad of data.pads) delete pad.playMode
      }
      const row = current
        ? await tx.soundpadWorkspace.update({ where: { userId: actor.userId }, data: { data, revision: { increment: 1 } } })
        : await tx.soundpadWorkspace.create({ data: { userId: actor.userId, data } })
      await audit(tx, {
        eventName: 'soundpad.updated', actorUserId: actor.userId, sessionId: actor.sessionId,
        resourceRevision: row.revision, requestId,
      })
      return this.response(row.revision.toString(), row.data, playModes)
    })
  }

  private response(revision: string, input: unknown, playModes: boolean) {
    const data = JSON.parse(JSON.stringify(input))
    if (!playModes) for (const pad of data.pads) delete pad.playMode
    return { revision, data }
  }
}
