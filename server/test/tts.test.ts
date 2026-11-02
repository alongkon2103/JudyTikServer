import { test } from 'node:test'
import assert from 'node:assert/strict'
import { defaultTtsData, validTtsData } from '../../shared/tts.js'

const defaults = {
  version: 1, voiceId: '', speed: 1.2, volume: 80,
  filter: { enabled: true, blockedWords: [] },
  read: { comment: true, gift: false, follow: false },
  templates: {
    comment: '{comment}',
    gift: 'ขอบคุณ {username} สำหรับ {gift}',
    follow: 'ขอบคุณ {username} ที่ติดตาม',
  },
}

test('TTS fresh defaults read comments with the requested voice, speed and templates', () => {
  const first = defaultTtsData()
  assert.deepEqual(first, defaults)
  assert.equal(validTtsData(first), true)
  first.read.comment = false
  first.templates.gift = 'changed'
  first.filter.blockedWords.push('custom')
  assert.deepEqual(defaultTtsData(), defaults)
})

test('TTS accepts native automatic voices and inclusive settings limits', () => {
  for (const speed of [0.5, 1, 2]) for (const volume of [0, 80, 100])
    assert.equal(validTtsData({ ...defaults, speed, volume }), true)
  assert.equal(validTtsData({
    ...defaults, voiceId: 'ก'.repeat(100),
    read: { comment: true, gift: true, follow: true },
    templates: { comment: 'a', gift: 'ก'.repeat(500), follow: '{username}' },
  }), true)
})

test('TTS accepts only the exact versioned settings shape', () => {
  for (const value of [null, [], {}, { ...defaults, version: 2 }, { ...defaults, version: '1' },
    { ...defaults, read: [] }, { ...defaults, templates: null },
    { ...defaults, read: { comment: false, gift: false } },
    { ...defaults, read: { ...defaults.read, share: false } },
    { ...defaults, read: { ...defaults.read, comment: 1 } },
    { ...defaults, templates: { comment: 'a', gift: 'b' } },
    { ...defaults, templates: { ...defaults.templates, share: 'a' } },
  ]) assert.equal(validTtsData(value), false, JSON.stringify(value))
  for (const key of Object.keys(defaults).filter(key => key !== 'filter')) {
    const value: Record<string, unknown> = { ...defaults }
    delete value[key]
    assert.equal(validTtsData(value), false, key)
  }
  for (const key of ['queue', 'chat', 'history', 'voices', 'userId', 'revision'])
    assert.equal(validTtsData({ ...defaults, [key]: [] }), false, key)
})

test('TTS voice identifiers are bounded and exclude control and bidi characters', () => {
  for (const voiceId of [null, 1, 'a'.repeat(101), ...Array.from({ length: 32 }, (_, i) => 'a' + String.fromCharCode(i)),
    'a\u007f', 'a\u0085', 'a\u009f', 'a\u061c', 'a\u200e', 'a\u200f',
    'a\u202a', 'a\u202b', 'a\u202c', 'a\u202d', 'a\u202e',
    'a\u2066', 'a\u2067', 'a\u2068', 'a\u2069',
  ]) assert.equal(validTtsData({ ...defaults, voiceId }), false, String(voiceId))
})

test('TTS rejects nonfinite speeds and noninteger or out-of-range volumes', () => {
  for (const speed of [0.49, 2.01, NaN, Infinity, -Infinity, '1', null, true])
    assert.equal(validTtsData({ ...defaults, speed }), false, String(speed))
  for (const volume of [-1, 101, 0.5, NaN, Infinity, '80', null, false])
    assert.equal(validTtsData({ ...defaults, volume }), false, String(volume))
})

test('TTS templates require 1 to 500 characters and reject all C0 controls', () => {
  for (const key of ['comment', 'gift', 'follow'])
    for (const template of ['', 'a'.repeat(501), null, 1, ...Array.from({ length: 32 }, (_, i) => 'a' + String.fromCharCode(i))])
      assert.equal(validTtsData({ ...defaults, templates: { ...defaults.templates, [key]: template } }), false, key + ':' + String(template))
})


test('TTS legacy documents remain valid and optional filter rejects malformed or oversized lists', () => {
  const {filter,...base}=defaults
  const legacy={...base,speed:1,read:{comment:false,gift:false,follow:false},templates:{comment:'{username} พูดว่า {comment}',gift:'ขอบคุณ {username} สำหรับ {gift} {count} ชิ้น',follow:'ขอบคุณ {username} ที่ติดตาม'}}
  assert.equal(validTtsData(legacy),true)
  for(const filter of [null, {}, {enabled:'yes',blockedWords:[]}, {enabled:true,blockedWords:['']},
    {enabled:true,blockedWords:['a'.repeat(61)]}, {enabled:true,blockedWords:Array(101).fill('word')},
    {enabled:true,blockedWords:['bad\nword']}, {enabled:true,blockedWords:[],extra:true}])
    assert.equal(validTtsData({...defaults,filter}),false)
})
