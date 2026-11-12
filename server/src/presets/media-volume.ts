import {ApiError} from '../http/api-error.js'
// Optional fields must not break older Desktop contract validators.
export const supportsMediaVolume=(features:unknown)=>String(features??'').split(',').map(x=>x.trim()).includes('media-volume')
export function mediaVolumeResponse<T>(value:T,features:unknown):T{
 if(supportsMediaVolume(features))return value
 function strip(input:any):any{
  if(Array.isArray(input))return input.map(strip)
  if(!input||typeof input!=='object')return input
  return Object.fromEntries(Object.entries(input).filter(([key])=>!(key==='volume'&&['sound','video'].includes(input.kind)&&input.media)).map(([key,v])=>[key,strip(v)]))
 }
 return strip(value)
}
export function retainMediaVolumes(actions:any[],saved:any[],features:unknown){
 if(supportsMediaVolume(features))return
 for(const rule of actions){const old=saved.find(x=>x.id===rule.id);if(!old)continue
  rule.effects.forEach((effect:any,index:number)=>{
   if(!['sound','video'].includes(effect.kind)||effect.volume!==undefined)return
   const same=(candidate:any)=>candidate?.kind===effect.kind&&candidate.media?.bindingId===effect.media?.bindingId
   const matches=(old.effects??[]).filter(same)
   let prior=matches[0]
   if(matches.length>1&&new Set(matches.map((x:any)=>x.volume??100)).size>1){
    // Identical bindings have no effect IDs in old clients. Preserve only an
    // unchanged sequence; refuse ambiguous edits rather than assign wrong gains.
    const key=(x:any)=>JSON.stringify({...x,volume:undefined})
    if(old.effects.length!==rule.effects.length||old.effects.some((x:any,i:number)=>key(x)!==key(rule.effects[i])))throw new ApiError(409,'PRESET_MEDIA_VOLUME_REQUIRES_UPDATE')
    prior=old.effects[index]
   }
   if(prior?.volume!==undefined)effect.volume=prior.volume
  })
 }
}
