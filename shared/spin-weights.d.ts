export const DEFAULT_SPIN_WEIGHT:number
export function spinWeights(weights:readonly number[]|undefined,count:number):number[]
export function validSpinWeights(weights:unknown,count:number):weights is number[]
export function weightedSpinIndex(weights:number[],ticket:number):number
export function spinPercentages(weights:number[]):number[]
