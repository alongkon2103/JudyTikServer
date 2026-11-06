export type OverlayConfig={
 theme: string; enabled: boolean; label: string; showLabel: boolean; showGoal: boolean; showProgress: boolean;
 layout: 'horizontal' | 'vertical'; font: string; size: number; bold: boolean; scale: number;
 colorWin: string; colorGoal: string; colorLabel: string; colorNegative: string;
 outline: boolean; outlineColor: string; outlineSize: number;
 background: string; background2: string; opacity: number; gradient: boolean; radius: number;
 motion: 'bounce'|'roll'|'flip'|'pop'|'slide'|'elastic'|'swing'|'focus'|'none'; effects: Record<'floatDelta'|'particles'|'pulse'|'goalCelebration'|'ambientGlow'|'lightSweep'|'orbitStars'|'trail'|'milestone', boolean>; milestoneEvery: number;
 sound: boolean; volume: number; keys: { name: string; value: string; delta: number }[];
}
export type SpinConfig={
 theme: string; enabled: boolean; label: string; showLabel: boolean; showResult: boolean; showPointer: boolean;
 positive: string; negative: string; text: string; pointer: string; tile: string; border: string;
 background: string; background2: string; gradient: boolean; opacity: number; radius: number;
 width: number; height: number; gap: number; fontSize: number; font: string; duration: number;
}
export type WinRule={id:string;trigger:'gift'|'like'|'follow'|'comment'|'share'|'subscribe';giftId:string;threshold:number;comment:string;effect:'win'|'spin';delta:number;enabled:boolean}
export type WinData={count:number;goal:number;step:number;allowNegative:boolean;slots:number[];slotWeights?:number[];rules:WinRule[];overlay:OverlayConfig;spin:SpinConfig}
export type WinDocument={revision:string;data:WinData}
export function defaultWinData():WinData
export function validWinData(value:unknown):value is WinData
export const fontOptions:Record<string,string>
export function fontStack(font:string):string
