export const defaultTtsData = () => ({
  version: 1, voiceId: '', speed: 1.2, volume: 80,
  filter: { enabled: true, blockedWords: [] },
  read: { comment: true, gift: false, follow: false },
  templates: {
    comment: '{comment}',
    gift: 'ขอบคุณ {username} สำหรับ {gift}',
    follow: 'ขอบคุณ {username} ที่ติดตาม',
  },
})
const fields = (value, keys) => value !== null && typeof value === 'object' && !Array.isArray(value)
  && keys.every(key => Object.hasOwn(value, key)) && Object.keys(value).length === keys.length
const events = ['comment', 'gift', 'follow']

export function validTtsData(value) {
  return (fields(value, ['version', 'voiceId', 'speed', 'volume', 'read', 'templates'])
    || (fields(value, ['version', 'voiceId', 'speed', 'volume', 'read', 'templates', 'filter']) && validTtsFilter(value.filter)))
    && value.version === 1
    && typeof value.voiceId === 'string' && value.voiceId.length <= 100
    && !/[\x00-\x1f\x7f-\x9f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/.test(value.voiceId)
    && Number.isFinite(value.speed) && value.speed >= 0.5 && value.speed <= 2
    && Number.isInteger(value.volume) && value.volume >= 0 && value.volume <= 100
    && fields(value.read, events) && events.every(key => typeof value.read[key] === 'boolean')
    && fields(value.templates, events) && events.every(key => typeof value.templates[key] === 'string'
      && value.templates[key].length >= 1 && value.templates[key].length <= 500
      && !/[\x00-\x1f]/.test(value.templates[key]))
}

export function validTtsFilter(value) {
  return (fields(value, ['enabled', 'blockedWords']) || (fields(value, ['enabled', 'blockedWords', 'excludedBasicWords'])
    && Array.isArray(value.excludedBasicWords) && value.excludedBasicWords.length <= basicBlockedWords.length
    && new Set(value.excludedBasicWords).size === value.excludedBasicWords.length
    && value.excludedBasicWords.every(word => basicBlockedWords.includes(word)))) && typeof value.enabled === 'boolean'
    && Array.isArray(value.blockedWords) && value.blockedWords.length <= 100
    && value.blockedWords.every(word => typeof word === 'string' && word.trim().length > 0
      && word.length <= 60 && !/[\x00-\x1f\x7f]/.test(word))
}
export const basicBlockedWords = Object.freeze([
  'fuck', 'fucking', 'fucked', 'fucker', 'motherfucker', 'motherfucking',
  'shit', 'shitty', 'bullshit', 'bitch', 'bitches', 'asshole', 'arsehole',
  'cunt', 'dick', 'dickhead', 'bastard', 'pussy', 'cock',
  'เหี้ย', 'ไอ้เหี้ย', 'อีเหี้ย', 'สัส', 'สัด', 'ไอ้สัส', 'อีสัส', 'สัตว์นรก',
  'ควย', 'ไอ้ควย', 'หี', 'เย็ด', 'เย็ดแม่', 'แม่ง', 'แม่เย็ด', 'หน้าหี', 'ส้นตีน',
]);
const normalize = text => text.normalize('NFKC').replace(/[\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]/g, '').toLowerCase();
const segmenter = new Intl.Segmenter('th', { granularity: 'word' });
const escapeRegex = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const matchesLatin = (text, word) => new RegExp('(^|[^\\p{L}\\p{N}])' + escapeRegex(word) + '(?=$|[^\\p{L}\\p{N}])', 'u').test(text);
export function isTtsTextBlocked(text, filter = { enabled: true, blockedWords: [] }) {
  if (!filter.enabled) return false;
  const normalized = normalize(text);
  // Thai default terms require dictionary boundaries; custom Thai phrases stay literal.
  const boundaries = new Set([0, normalized.length]);
  for (const part of segmenter.segment(normalized)) {
    boundaries.add(part.index);
    boundaries.add(part.index + part.segment.length);
  }
  const excluded = new Set(filter.excludedBasicWords ?? []);
  for (const word of basicBlockedWords) {
    if (excluded.has(word)) continue;
    if (/^[a-z0-9 ]+$/.test(word)) {
      if (matchesLatin(normalized, word)) return true;
    } else {
      let index = normalized.indexOf(word);
      while (index >= 0) {
        if (boundaries.has(index) && boundaries.has(index + word.length)) return true;
        index = normalized.indexOf(word, index + 1);
      }
    }
  }
  return filter.blockedWords.some(value => {
    const word = normalize(value.trim());
    return !!word && (/^[a-z0-9 ]+$/.test(word) ? matchesLatin(normalized, word) : normalized.includes(word));
  });
}
