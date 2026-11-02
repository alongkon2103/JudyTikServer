export type WidgetKind = 'alert' | 'big-gift' | 'top-likers' | 'goal' | 'leaderboard' | 'timer' | 'gift-jar' | 'spin' | 'video'
export type OverlayTrigger = 'gift' | 'like' | 'follow' | 'comment' | 'share' | 'subscribe'
export type OverlayMetric = 'coins' | 'gifts' | 'likes' | 'follows'
export interface SpinOption {id:string;label:string;imageUrl?:string;imageBindingId?:string;imageDisplayName?:string;actionId?:string}
export function safeSpinImage(value:unknown):value is string
export function validSpinOption(value:unknown):value is SpinOption
export interface WidgetConfig {
  font: string
  theme: string
  title: string
  viewer: string
  accent: string
  background: string
  opacity: number
  fontSize: number
  value: number
  goal: number
  seconds: number
  options: string[]
  spinOptions?: SpinOption[]
  enabled: boolean
  events: OverlayTrigger[]
  duration: number
  minCoins: number
  metric: OverlayMetric
  trigger: OverlayTrigger
  giftId: string
  threshold: number
  showRanking?: boolean
  showTotal?: boolean
  showRecentGift?: boolean
  secondsPerEvent: number
}
export type WidgetConfigs = Record<WidgetKind,WidgetConfig>
export interface OverlayData {version:1; widgets:WidgetConfigs}
export const widgetKinds: readonly {id:WidgetKind;name:string;description:string;icon:'bell'|'gift'|'heart'|'target'|'trophy'|'clock'|'jar'|'sparkles'|'video'}[]
export function defaultWidget(kind:WidgetKind):WidgetConfig
export function validWidget(value:unknown):value is WidgetConfig
export function defaultOverlayData():OverlayData
export function validOverlayData(value:unknown):value is OverlayData

export function hydrateOverlayData(value:unknown):OverlayData
