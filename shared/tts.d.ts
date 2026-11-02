export interface TtsData {
  filter?: { enabled: boolean; blockedWords: string[]; excludedBasicWords?: string[] }
  version: 1
  voiceId: string
  speed: number
  volume: number
  read: { comment: boolean; gift: boolean; follow: boolean }
  templates: { comment: string; gift: string; follow: string }
}
export function defaultTtsData(): TtsData
export function validTtsData(value: unknown): value is TtsData

export function validTtsFilter(value: unknown): boolean
export function isTtsTextBlocked(text: string, filter?: TtsData['filter']): boolean

export const basicBlockedWords: readonly string[]
