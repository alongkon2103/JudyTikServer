import {safeProfileAvatar} from './profile-avatar.js'
export const HEARTBEAT_MS=30000
export const PRESENCE_TTL_MS=90000
export const MAX_LIVE_CHANNELS=50
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value)
const keys=(value,names)=>object(value)&&Object.keys(value).length===names.length&&names.every(name=>Object.hasOwn(value,name))
const uuid=value=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
const iso=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)&&Number.isFinite(Date.parse(value))
export const validLiveUsername=value=>typeof value==='string'&&/^[a-z0-9_.]{2,24}$/.test(value)
export const validRoomId=value=>typeof value==='string'&&/^\d{8,30}$/.test(value)&&!/^0+$/.test(value)
export function validChannelProfile(value){return object(value)&&typeof value.displayName==='string'&&!!value.displayName.trim()&&value.displayName.length<=80&&!/[\x00-\x1f\x7f\u202a-\u202e\u2066-\u2069]/.test(value.displayName)&&(value.avatarUrl===null||safeProfileAvatar(value.avatarUrl))&&(value.viewers===null||(Number.isSafeInteger(value.viewers)&&value.viewers>=0&&value.viewers<=1000000000))}
export function validPresenceStart(value){return keys(value,['connectionId','username','roomId','displayName','avatarUrl','viewers'])&&uuid(value.connectionId)&&validLiveUsername(value.username)&&validRoomId(value.roomId)&&validChannelProfile(value)}
export function validPresenceHeartbeat(value){return keys(value,['sequence','displayName','avatarUrl','viewers'])&&Number.isSafeInteger(value.sequence)&&value.sequence>=1&&validChannelProfile(value)}
export function validPresenceLease(value){return keys(value,['connectionId','expiresAt','heartbeatAfterMs'])&&uuid(value.connectionId)&&iso(value.expiresAt)&&value.heartbeatAfterMs===HEARTBEAT_MS}
export function validLiveDirectory(value){return keys(value,['items','serverTime','refreshAfterMs'])&&iso(value.serverTime)&&value.refreshAfterMs===HEARTBEAT_MS&&Array.isArray(value.items)&&value.items.length<=MAX_LIVE_CHANNELS&&new Set(value.items.map(item=>item?.username)).size===value.items.length&&value.items.every(item=>keys(item,['username','roomId','displayName','avatarUrl','viewers','lastSeenAt'])&&validLiveUsername(item.username)&&validRoomId(item.roomId)&&validChannelProfile(item)&&iso(item.lastSeenAt))}
