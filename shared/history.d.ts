export type HistoryRange = '7' | '30' | 'all'
export type LiveHistorySnapshot = {
 version: 1; id: string; sequence: number; username: string; roomId: string | null; title: string
 startedAt: string; updatedAt: string; endedAt: string | null; status: 'active' | 'completed' | 'interrupted'; durationSeconds: number
 stats: { peakViewers: number | null; likes: number | null; coins: number; followers: number; chats: number; shares: number; giftCount: number; unknownGiftCount: number }
 gifts: { id: string; name: string; coins: number | null; count: number; totalCoins: number }[]
 chart: { at: string; viewers: number }[]
}
export type LiveHistorySummary = { sessions: number; coins: number; durationSeconds: number; peakViewers: number | null }
export type LiveHistoryPage = { items: LiveHistorySnapshot[]; nextCursor: string | null; summary: LiveHistorySummary }
export type LiveHistoryQuery = { range: HistoryRange; query: string; cursor?: string }
export function validHistoryId(value: unknown): value is string
export function validHistorySnapshot(value: unknown): value is LiveHistorySnapshot
export function validHistorySummary(value: unknown): value is LiveHistorySummary
export function validHistoryPage(value: unknown): value is LiveHistoryPage
