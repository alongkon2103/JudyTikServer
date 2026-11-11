import {z} from 'zod'
export const appConnectionId=z.uuid()
export const appPresenceStartSchema=z.strictObject({connectionId:appConnectionId})
export const appPresenceHeartbeatSchema=z.strictObject({sequence:z.number().int().min(1).max(Number.MAX_SAFE_INTEGER)})
