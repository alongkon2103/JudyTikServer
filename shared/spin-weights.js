export const DEFAULT_SPIN_WEIGHT=10
export const spinWeights=(weights,count)=>Array.from({length:count},(_,i)=>weights?.[i]??DEFAULT_SPIN_WEIGHT)
export const validSpinWeights=(weights,count)=>Array.isArray(weights)&&weights.length===count&&Array.from(weights).every(n=>Number.isSafeInteger(n)&&n>=0&&n<=100)&&weights.some(n=>n>0)
export function spinPercentages(weights){
 const total=weights.reduce((sum,n)=>sum+n,0);if(!total)return weights.map(()=>0)
 const raw=weights.map(n=>n/total*1000),parts=raw.map(Math.floor),rank=raw.map((n,i)=>({i,fraction:n-parts[i]})).sort((a,b)=>b.fraction-a.fraction||a.i-b.i)
 for(let n=1000-parts.reduce((sum,n)=>sum+n,0),i=0;i<n;i++)parts[rank[i].i]++
 return parts.map(n=>n/10)
}
export function weightedSpinIndex(weights,ticket){
 const total=weights.reduce((sum,value)=>sum+value,0)
 if(!total||!Number.isSafeInteger(ticket)||ticket<0||ticket>=total)throw new TypeError('INVALID_SPIN_WEIGHT')
 for(let i=0;i<weights.length;i++){if(ticket<weights[i])return i;ticket-=weights[i]}
 throw new TypeError('INVALID_SPIN_WEIGHT')
}
