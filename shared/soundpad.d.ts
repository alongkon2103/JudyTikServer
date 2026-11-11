export interface SoundSource {
  provider: 'myinstants'
  slug: string
  name: string
  sound: string
}
export interface SoundPad {
  id: string
  name: string
  category: 'reaction' | 'transition' | 'effect'
  bindingId: string
  displayName: string
  hotkey: string
  playMode?: 'hold' | 'toggle' | 'restart'
  source?: SoundSource
}
export interface SoundpadData {
  version: 1
  volume: number
  enabled?: boolean
  pads: SoundPad[]
}
export function defaultSoundpadData(): SoundpadData
export function validSoundpadData(value: unknown): value is SoundpadData
export function validSoundSource(value: unknown): value is SoundSource
