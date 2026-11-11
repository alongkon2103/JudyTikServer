import { normalizeShortcut, shortcutIdentity, reservedShortcut } from './shortcuts.js'

export const defaultSoundpadData = () => ({ version: 1, volume: 75, enabled: true, pads: [] })
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value)
const fields = (value, required, optional = []) => object(value)
  && required.every(key => Object.hasOwn(value, key))
  && Object.keys(value).every(key => required.includes(key) || optional.includes(key))
const text = (value, max) => typeof value === 'string' && value.length > 0
  && value.length <= max && Boolean(value.trim()) && !/[\x00-\x1f\x7f-\x9f]/.test(value)
const uuid = value => typeof value === 'string'
  && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
function validSoundUrl(value) {
  if (typeof value !== 'string' || value.length > 2048
    || !value.startsWith('https://www.myinstants.com/media/sounds/')) return false
  try {
    const url = new URL(value)
    if (url.href !== value || url.search || url.hash) return false
    const filename = decodeURIComponent(url.pathname.slice('/media/sounds/'.length))
    return filename.length > 4 && filename.endsWith('.mp3')
      && !filename.includes('/') && !filename.includes(String.fromCharCode(92))
      && !/[\x00-\x1f\x7f-\x9f%]/.test(filename)
  } catch { return false }
}
export function validSoundSource(source) {
  return fields(source, ['provider', 'slug', 'name', 'sound'])
    && source.provider === 'myinstants' && text(source.slug, 160) && text(source.name, 160)
    && validSoundUrl(source.sound)
}

export function validSoundpadData(value) {
  if (!fields(value, ['version', 'volume', 'pads'], ['enabled']) || value.version !== 1
    || (Object.hasOwn(value, 'enabled') && typeof value.enabled !== 'boolean')
    || !Number.isSafeInteger(value.volume) || value.volume < 0 || value.volume > 100
    || !Array.isArray(value.pads) || value.pads.length > 100) return false
  const ids = new Set(), hotkeys = new Set()
  for (const pad of value.pads) {
    if (!fields(pad, ['id', 'name', 'category', 'bindingId', 'displayName', 'hotkey'], ['source', 'playMode'])
      || !uuid(pad.id) || ids.has(pad.id.toLowerCase()) || !uuid(pad.bindingId)
      || !text(pad.name, 40) || !['reaction', 'transition', 'effect'].includes(pad.category)
      || !text(pad.displayName, 255) || /[\/\\]/.test(pad.displayName)
      || typeof pad.hotkey !== 'string' || pad.hotkey.length > 80 || /[\x00-\x1f\x7f-\x9f]/.test(pad.hotkey)
      || (Object.hasOwn(pad, 'playMode') && !['hold', 'toggle', 'restart'].includes(pad.playMode))
      || (Object.hasOwn(pad, 'source') && !validSoundSource(pad.source))) return false
    ids.add(pad.id.toLowerCase())
    if (pad.hotkey) {
      try {
        normalizeShortcut(pad.hotkey)
        if (reservedShortcut(pad.hotkey)) return false
        for (const platform of ['win32', 'darwin']) {
          const identity = platform + ':' + shortcutIdentity(pad.hotkey, platform)
          if (hotkeys.has(identity)) return false
          hotkeys.add(identity)
        }
      } catch { return false }
    }
  }
  return true
}
