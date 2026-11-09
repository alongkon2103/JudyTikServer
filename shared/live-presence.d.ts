export const HEARTBEAT_MS:30000
export const PRESENCE_TTL_MS:90000
export const MAX_LIVE_CHANNELS:50
export type ChannelProfile={displayName:string;avatarUrl:string|null;viewers:number|null}
export type PresenceStart=ChannelProfile&{connectionId:string;username:string;roomId:string}
export type PresenceHeartbeat=ChannelProfile&{sequence:number}
export type PresenceLease={connectionId:string;expiresAt:string;heartbeatAfterMs:30000}
export type LiveDirectoryEntry=ChannelProfile&{username:string;roomId:string;lastSeenAt:string}
export type LiveDirectoryPage={items:LiveDirectoryEntry[];serverTime:string;refreshAfterMs:30000}
export function validLiveUsername(value:unknown):value is string
export function validRoomId(value:unknown):value is string
export function validChannelProfile(value:unknown):value is ChannelProfile
export function validPresenceStart(value:unknown):value is PresenceStart
export function validPresenceHeartbeat(value:unknown):value is PresenceHeartbeat
export function validPresenceLease(value:unknown):value is PresenceLease
export function validLiveDirectory(value:unknown):value is LiveDirectoryPage
