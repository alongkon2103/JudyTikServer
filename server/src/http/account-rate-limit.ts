import type { Request, Response } from 'express'
import { ApiError } from './api-error.js'

const windowMs = 60_000
type Bucket = { count: number; resetAt: number }
type AccountLimits = { buckets: Map<string, Bucket>; sweepAt: number }
// One budget per verified owner across every guarded route/session in this app.
// App scope also keeps independently created Nest applications isolated.
const applications = new WeakMap<Request['app'], AccountLimits>()

export function enforceAccountRateLimit(req: Request, res: Response, verifiedUserId: string) {
  const now = Date.now()
  let limits = applications.get(req.app)
  if (!limits) {
    limits = { buckets: new Map(), sweepAt: now + windowMs }
    applications.set(req.app, limits)
  }
  if (now >= limits.sweepAt) {
    for (const [id, bucket] of limits.buckets) {
      if (now >= bucket.resetAt) limits.buckets.delete(id)
    }
    limits.sweepAt = now + windowMs
  }
  let bucket = limits.buckets.get(verifiedUserId)
  if (!bucket || now >= bucket.resetAt) {
    bucket = { count: 0, resetAt: now + windowMs }
    limits.buckets.set(verifiedUserId, bucket)
  }
  if (bucket.count >= 120) {
    res.setHeader('x-judytik-rate-limit-policy', 'account')
    res.setHeader('retry-after', Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)))
    throw new ApiError(429, 'RATE_LIMITED')
  }
  bucket.count++
}
