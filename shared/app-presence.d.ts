export const APP_HEARTBEAT_MS:60000
export const APP_PRESENCE_TTL_MS:150000
export type AppPresenceCount={count:number;serverTime:string;refreshAfterMs:60000}
export type AppPresenceState={owner:string|null;count:number|null;serverTime:string|null}
export function validAppPresenceCount(v:unknown):v is AppPresenceCount
export function validAppPresenceLease(v:unknown):v is {connectionId:string;expiresAt:string;heartbeatAfterMs:60000}
