import { Inject, Injectable, Optional } from '@nestjs/common'
import { z } from 'zod'
import type { VerifiedSession } from '../auth/auth.service.js'
import { CLOCK, type Clock } from '../auth/clock.js'
import { CONFIG, type ServerConfig } from '../config/env.js'
import { ApiError } from '../http/api-error.js'
import { liveAuthorizationRequestSchema, liveAuthorizationSchema, type LiveAuthorization } from './contracts.js'

export const LIVE_FETCH = Symbol('LiveSigningFetch')
const TTL_MS = 60_000
const OWNER_COOLDOWN_MS = 15_000
const MAX_OWNERS = 10_000
const MAX_BODY_BYTES = 16 * 1024
const upstreamSchema = z.object({
  code: z.literal(200),
  token: liveAuthorizationSchema.options[1].shape.token,
  config: z.object({ expiresAt: z.number().positive().finite() }),
})

@Injectable()
export class LiveService {
  // shortcut: per-process quota protection; use shared storage before scaling to multiple servers.
  private readonly owners = new Map<string, number>()
  constructor(
    @Inject(CONFIG) private readonly config: ServerConfig,
    @Inject(CLOCK) private readonly clock: Clock,
    @Optional() @Inject(LIVE_FETCH) private readonly fetcher: typeof fetch = fetch,
  ) {}

  async authorize(session: VerifiedSession, body: unknown, caller?: AbortSignal): Promise<LiveAuthorization> {
    const input = liveAuthorizationRequestSchema.safeParse(body)
    if (!input.success) throw new ApiError(400, 'LIVE_INVALID_REQUEST')
    if (caller?.aborted) throw new ApiError(499, 'LIVE_REQUEST_CANCELLED')
    const username = input.data.username.replace(/^@/, '')
    const config = this.config.live
    if (!config) return { mode: 'community', username }
    const now = this.clock.now().getTime()
    for (const [owner, until] of this.owners) if (until <= now) this.owners.delete(owner)
    if (this.owners.has(session.userId)) throw new ApiError(429, 'LIVE_RATE_LIMITED')
    if (this.owners.size >= MAX_OWNERS) throw new ApiError(503, 'LIVE_SIGNING_BUSY')
    this.owners.set(session.userId, now + OWNER_COOLDOWN_MS)
    const timeout = AbortSignal.timeout(8000)
    const signal = caller ? AbortSignal.any([caller, timeout]) : timeout
    const unavailable = () => new ApiError(
      caller?.aborted ? 499 : 503,
      caller?.aborted ? 'LIVE_REQUEST_CANCELLED' : 'LIVE_SIGNING_UNAVAILABLE',
    )
    let response: Response
    try {
      response = await this.fetcher(`https://api.eulerstream.com/accounts/${config.accountId}/jwt/create`, {
        method: 'POST',
        headers: { accept: 'application/json', 'content-type': 'application/json', 'x-api-key': config.apiKey },
        redirect: 'error', signal,
        body: JSON.stringify({
          metadata: { version: 'v2', expireAfter: TTL_MS / 1000 },
          api: { enabled: true, limits: { minute: 5, hour: 5, day: 5 } },
          websockets: { enabled: false },
          cdn: { enabled: false, access_permitted: false, upload_permitted: false },
        }),
      })
    } catch { throw unavailable() }
    if (!response.ok) {
      await response.body?.cancel().catch(() => {})
      throw unavailable()
    }
    let data: unknown
    try {
      const reader = response.body?.getReader()
      if (!reader) throw new Error('Missing body')
      const cancel = () => { void reader.cancel().catch(() => {}) }
      signal.addEventListener('abort', cancel, { once: true })
      try {
        if (signal.aborted) throw unavailable()
        const chunks: Uint8Array[] = []
        let size = 0
        while (true) {
          const { done, value } = await reader.read()
          if (signal.aborted) throw unavailable()
          if (done) break
          size += value.byteLength
          if (size > MAX_BODY_BYTES) {
            await reader.cancel()
            throw new Error('Body too large')
          }
          chunks.push(value)
        }
        data = JSON.parse(Buffer.concat(chunks).toString('utf8'))
      } finally {
        signal.removeEventListener('abort', cancel)
        reader.releaseLock()
      }
    } catch {
      if (signal.aborted) throw unavailable()
      throw new ApiError(503, 'LIVE_SIGNING_INVALID')
    }
    const parsed = upstreamSchema.safeParse(data)
    if (!parsed.success || parsed.data.token.includes(config.apiKey))
      throw new ApiError(503, 'LIVE_SIGNING_INVALID')
    const rawExpiry = parsed.data.config.expiresAt
    const expiry = rawExpiry < 100_000_000_000 ? rawExpiry * 1000 : rawExpiry
    if (expiry <= this.clock.now().getTime() || expiry > now + TTL_MS + 5000)
      throw new ApiError(503, 'LIVE_SIGNING_INVALID')
    return {
      mode: 'jwt', username, token: parsed.data.token,
      expiresAt: new Date(Math.min(expiry, now + TTL_MS)).toISOString(),
    }
  }
}
