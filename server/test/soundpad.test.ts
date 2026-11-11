import { test } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { defaultSoundpadData, validSoundpadData } from '../../shared/soundpad.js'

const pad = (extra = {}) => ({
  id: randomUUID(), name: 'Air horn', category: 'reaction',
  bindingId: randomUUID(), displayName: 'air-horn.mp3', hotkey: '', ...extra,
})
const data = (pads: unknown[] = []) => ({ version: 1, volume: 75, pads })
const source = { provider: 'myinstants', slug: 'air-horn', name: 'Air horn', sound: 'https://www.myinstants.com/media/sounds/air-horn.mp3' }

test('Soundpad play modes are optional and accept only hold, toggle or restart',()=>{
 for(const playMode of ['hold','toggle','restart'])assert.equal(validSoundpadData(data([pad({playMode})])),true)
 for(const playMode of [null,undefined,'loop',false])assert.equal(validSoundpadData(data([pad({playMode})])),false)
})

test('Soundpad defaults are fresh editable documents', () => {
  const first = defaultSoundpadData()
  assert.deepEqual(first, { version: 1, volume: 75, enabled: true, pads: [] })
  first.volume = 0
  first.pads.push(pad() as any)
  assert.deepEqual(defaultSoundpadData(), { version: 1, volume: 75, enabled: true, pads: [] })
})

test('Soundpad accepts local bindings and optional restorable official sound descriptors', () => {
  assert.equal(validSoundpadData(data([pad()])), true)
  assert.equal(validSoundpadData({ ...data([pad({ source })]), volume: 0 }), true)
  assert.equal(validSoundpadData({ ...data(), volume: 100 }), true)
  assert.equal(validSoundpadData(data(Array.from({ length: 100 }, () => pad()))), true)
  for (const category of ['reaction', 'transition', 'effect'])
    assert.equal(validSoundpadData(data([pad({ category })])), true)
})

test('Soundpad rejects unknown fields, local paths, malformed identifiers and invalid boundaries', () => {
  const invalid: unknown[] = [
    null, [], {}, { ...data(), version: 2 }, { ...data(), volume: -1 },
    { ...data(), volume: 101 }, { ...data(), volume: 0.5 }, { ...data(), extra: true },
    { ...data(), pads: {} }, data(Array.from({ length: 101 }, () => pad())),
    data([pad({ id: 'pad-1' })]), data([pad({ bindingId: '/tmp/sound.mp3' })]),
    data([pad({ name: '' })]), data([pad({ name: ' ' })]), data([pad({ name: 'a'.repeat(41) })]),
    data([pad({ name: 'bad\nname' })]), data([pad({ displayName: '' })]),
    data([pad({ displayName: 'a'.repeat(256) })]), data([pad({ category: 'music' })]),
    data([pad({ hotkey: 'a'.repeat(81) })]), data([pad({ hotkey: 'Ctrl+\nA' })]),
    data([pad({ name: 'bad\u009fname' })]), data([pad({ displayName: '/Users/private/a.mp3' })]),
    data([pad({ displayName: 'C:\\Users\\private\\a.mp3' })]), data([pad({ hotkey: 'Ctrl+Invalid' })]),
    data([pad({ hotkey: 'Control+Alt+Shift+Backspace' })]),
    data([pad({ path: '/tmp/sound.mp3' })]), data([pad({ source: undefined })]),
    data([pad({ source: { ...source, path: '/tmp/sound.mp3' } })]),
    data([pad({ source: { ...source, provider: 'other' } })]),
    data([pad({ source: { ...source, slug: '' } })]),
    data([pad({ source: { ...source, slug: 'a'.repeat(161) } })]),
    data([pad({ source: { ...source, name: 'a'.repeat(161) } })]),
  ]
  for (const value of invalid) assert.equal(validSoundpadData(value), false, JSON.stringify(value))
})

test('Soundpad rejects duplicate UUIDs and hotkeys on either desktop platform', () => {
  const first = pad({ hotkey: 'Ctrl+A' })
  assert.equal(validSoundpadData(data([first, pad({ id: first.id.toUpperCase() })])), false)
  for (const hotkeys of [['Ctrl+A', 'Control+A'], ['CommandOrControl+A', 'Command+A'], ['Super+A', 'Command+A']])
    assert.equal(validSoundpadData(data(hotkeys.map(hotkey => pad({ hotkey })))), false)
  assert.equal(validSoundpadData(data([pad({ hotkey: '1' }), pad({ hotkey: 'num1' })])), true)
})

test('Soundpad source audio stays on the official HTTPS MP3 path', () => {
  for (const sound of [
    'http://www.myinstants.com/media/sounds/a.mp3',
    'https://myinstants.com/media/sounds/a.mp3',
    'https://www.myinstants.com.evil.test/media/sounds/a.mp3',
    'https://user@www.myinstants.com/media/sounds/a.mp3',
    'https://www.myinstants.com:8443/media/sounds/a.mp3',
    'https://www.myinstants.com/media/sounds/a.mp3?download=1',
    'https://www.myinstants.com/media/sounds/a.mp3#x',
    'https://www.myinstants.com/media/sounds/../a.mp3',
    'https://www.myinstants.com/media/sounds/%2e%2e/a.mp3',
    'https://www.myinstants.com/media/sounds/nested/a.mp3',
    'https://www.myinstants.com/media/sounds/a.wav',
    'file:///tmp/a.mp3',
  ]) assert.equal(validSoundpadData(data([pad({ source: { ...source, sound } })])), false, sound)
})

test('Soundpad restores percent-encoded UTF-8 MP3 basenames without encoded path separators', () => {
  assert.equal(validSoundpadData(data([pad({ source: { ...source, sound: 'https://www.myinstants.com/media/sounds/%E0%B9%80%E0%B8%AA%E0%B8%B5%E0%B8%A2%E0%B8%87%20horn.mp3' } })])), true)
  for (const filename of ['a%2fb.mp3', 'a%5cb.mp3', '%2e%2e%2fa.mp3', 'a%252fb.mp3', 'a%00.mp3', 'a%0a.mp3', 'a%ZZ.mp3', 'a%ff.mp3', 'a%C2%9F.mp3'])
    assert.equal(validSoundpadData(data([pad({ source: { ...source, sound: 'https://www.myinstants.com/media/sounds/' + filename } })])), false, filename)
})


test('Soundpad enabled setting is optional for existing documents and strictly boolean',()=>{
 assert.equal(validSoundpadData(data()),true)
 assert.equal(validSoundpadData({...data(),enabled:true}),true)
 assert.equal(validSoundpadData({...data(),enabled:false}),true)
 for(const enabled of [null,0,1,'false',undefined])assert.equal(validSoundpadData({...data(),enabled}),false)
})
