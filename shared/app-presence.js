export const APP_HEARTBEAT_MS=60000
export const APP_PRESENCE_TTL_MS=150000
const exact=(v,names)=>v!==null&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length===names.length&&names.every(n=>Object.hasOwn(v,n))
const iso=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(v)&&Number.isFinite(Date.parse(v))
export const validAppPresenceCount=v=>exact(v,['count','serverTime','refreshAfterMs'])&&Number.isSafeInteger(v.count)&&v.count>=0&&iso(v.serverTime)&&v.refreshAfterMs===APP_HEARTBEAT_MS
export const validAppPresenceLease=v=>exact(v,['connectionId','expiresAt','heartbeatAfterMs'])&&typeof v.connectionId==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v.connectionId)&&iso(v.expiresAt)&&v.heartbeatAfterMs===APP_HEARTBEAT_MS
