const object = value => value !== null && typeof value === 'object' && !Array.isArray(value)
const fields = (value, names) => object(value) && Object.keys(value).length === names.length && names.every(name => Object.hasOwn(value, name))
const integer = (value, max = 1e12) => Number.isSafeInteger(value) && value >= 0 && value <= max
const text = (value, max) => typeof value === 'string' && value.trim().length > 0 && value.length <= max && !/[\x00-\x1f\x7f-\x9f]/.test(value)
const timestamp = value => typeof value === 'string' && value.length === 24 && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value
export const validHistoryId = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
export function validHistorySnapshot(value) {
 if (!fields(value, ['version', 'id', 'sequence', 'username', 'roomId', 'title', 'startedAt', 'updatedAt', 'endedAt', 'status', 'durationSeconds', 'stats', 'gifts', 'chart'])
  || value.version !== 1 || !validHistoryId(value.id) || !integer(value.sequence, Number.MAX_SAFE_INTEGER) || value.sequence < 1
  || typeof value.username !== 'string' || !/^[A-Za-z0-9_.]{2,24}$/.test(value.username)
  || (value.roomId !== null && !text(value.roomId, 30)) || !text(value.title, 160)
  || !timestamp(value.startedAt) || !timestamp(value.updatedAt) || value.updatedAt < value.startedAt
  || !['active', 'completed', 'interrupted'].includes(value.status)
  || (value.status === 'active' ? value.endedAt !== null : !timestamp(value.endedAt) || value.endedAt < value.startedAt || value.endedAt > value.updatedAt)
  || !integer(value.durationSeconds, 31536000)
  || !fields(value.stats, ['peakViewers', 'likes', 'coins', 'followers', 'chats', 'shares', 'giftCount', 'unknownGiftCount'])
  || !['peakViewers', 'likes'].every(key => value.stats[key] === null || integer(value.stats[key]))
  || !['coins', 'followers', 'chats', 'shares', 'giftCount', 'unknownGiftCount'].every(key => integer(value.stats[key]))
  || value.stats.unknownGiftCount > value.stats.giftCount
  || !Array.isArray(value.gifts) || value.gifts.length > 2000 || !Array.isArray(value.chart) || value.chart.length > 720) return false
 const ids = new Set()
 let count = 0, coins = 0
 for (const gift of value.gifts) {
  if (!fields(gift, ['id', 'name', 'coins', 'count', 'totalCoins']) || typeof gift.id !== 'string' || !/^[1-9][0-9]{0,19}$/.test(gift.id)
   || ids.has(gift.id) || !text(gift.name, 100) || (gift.coins !== null && !integer(gift.coins, 1000000))
   || !integer(gift.count) || gift.count < 1 || !integer(gift.totalCoins)) return false
  ids.add(gift.id); count += gift.count; coins += gift.totalCoins
 }
 if (count !== value.stats.giftCount || coins !== value.stats.coins) return false
 let previous = value.startedAt
 for (const sample of value.chart) {
  if (!fields(sample, ['at', 'viewers']) || !timestamp(sample.at) || sample.at < previous || sample.at > value.updatedAt || !integer(sample.viewers)
   || value.stats.peakViewers === null || sample.viewers > value.stats.peakViewers) return false
  previous = sample.at
 }
 return value.durationSeconds <= Math.ceil((Date.parse(value.updatedAt) - Date.parse(value.startedAt)) / 1000)
}
export function validHistorySummary(value) {
 return fields(value, ['sessions', 'coins', 'durationSeconds', 'peakViewers'])
  && ['sessions', 'coins', 'durationSeconds'].every(key => integer(value[key], Number.MAX_SAFE_INTEGER))
  && (value.peakViewers === null || integer(value.peakViewers))
}
export function validHistoryPage(value) {
 return fields(value, ['items', 'nextCursor', 'summary']) && Array.isArray(value.items) && value.items.length <= 100
  && value.items.every(validHistorySnapshot) && new Set(value.items.map(item => item.id)).size === value.items.length
  && (value.nextCursor === null || typeof value.nextCursor === 'string' && value.nextCursor.length > 0 && value.nextCursor.length <= 1024)
  && validHistorySummary(value.summary)
}
