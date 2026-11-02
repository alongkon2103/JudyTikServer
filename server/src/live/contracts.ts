import { z } from 'zod'

export const liveAuthorizationRequestSchema = z.object({
  username: z.string().trim().regex(/^@?[A-Za-z0-9._]{2,24}$/),
}).strict()
const username = z.string().regex(/^[A-Za-z0-9._]{2,24}$/)
export const liveAuthorizationSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('community'), username }).strict(),
  z.object({
    mode: z.literal('jwt'), username,
    token: z.string().min(20).max(8192).regex(/^[A-Za-z0-9._-]+$/),
    expiresAt: z.iso.datetime(),
  }).strict(),
])
export type LiveAuthorization = z.infer<typeof liveAuthorizationSchema>
