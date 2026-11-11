import {validSpinWeights} from './spin-weights.js'
import {normalizeShortcut,shortcutIdentity,reservedShortcut} from './shortcuts.js'
import defaults from './win-defaults.json' with {type:'json'}
export const fontOptions={Judy:'IBM Plex Sans Thai','Komika Axis':'Komika Axis',Georgia:'Georgia','Arial Black':'Arial Black',Tahoma:'Tahoma',monospace:'Monospace'}
export const isCustomFont=font=>typeof font==='string'&&/^custom:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(font)
export const validFontChoice=font=>Object.hasOwn(fontOptions,font)||isCustomFont(font)
export const customFontFamily=font=>isCustomFont(font)?'JudyCustom_'+font.slice(7).replaceAll('-',''):null
export const fontStack=font=>isCustomFont(font)?`"${customFontFamily(font)}",Judy,sans-serif`:Object.hasOwn(fontOptions,font)&&font!=='Judy'?`"${font}",Judy,sans-serif`:'Judy,sans-serif'
export const defaultWinData=()=>structuredClone(defaults)
const object=v=>v&&typeof v==='object'&&!Array.isArray(v)
const exact=(v,template)=>object(v)&&Object.keys(v).length===Object.keys(template).length&&Object.keys(template).every(k=>Object.hasOwn(v,k))
const int=(v,min,max)=>Number.isSafeInteger(v)&&v>=min&&v<=max
const text=(v,max)=>typeof v==='string'&&v.length<=max&&!/[\x00-\x1f\x7f]/.test(v)
const hex=v=>typeof v==='string'&&/^#[a-f0-9]{6}$/i.test(v)
export function validWinData(d){
 if(!object(d))return false
 if(!exact(d,{...defaults,...(Object.hasOwn(d,'slotWeights')?{slotWeights:0}:{})})||!int(d.count,-9999,9999)||!int(d.goal,1,9999)||!int(d.step,1,999)||typeof d.allowNegative!=='boolean'||(!d.allowNegative&&d.count<0))return false
 if(!Array.isArray(d.slots)||d.slots.length<2||d.slots.length>12||!d.slots.every(v=>int(v,-999,999)&&v!==0))return false
 if(Object.hasOwn(d,'slotWeights')&&!validSpinWeights(d.slotWeights,d.slots.length))return false
 if(!Array.isArray(d.rules)||d.rules.length>100)return false
 const ids=new Set()
 for(const r of d.rules){if(!exact(r,{id:0,trigger:0,giftId:0,threshold:0,comment:0,effect:0,delta:0,enabled:0})||!text(r.id,64)||!r.id||ids.has(r.id)||!['gift','like','follow','comment','share','subscribe'].includes(r.trigger)||!text(r.giftId,20)||(r.trigger==='gift'&&!/^[1-9][0-9]{0,19}$/.test(r.giftId))||!int(r.threshold,1,99999)||!text(r.comment,100)||(r.trigger==='comment'&&!r.comment.trim())||!['win','spin'].includes(r.effect)||!int(r.delta,-999,999)||(r.effect==='win'&&r.delta===0)||typeof r.enabled!=='boolean')return false;ids.add(r.id)}
 const c=d.overlay,s=d.spin
 if(!exact(c,defaults.overlay)||!exact(s,defaults.spin)||!validFontChoice(c.font)||!Object.hasOwn(fontOptions,s.font))return false
 for(const [v,base]of [[c,defaults.overlay],[s,defaults.spin]]){for(const [k,value]of Object.entries(base)){if(typeof value==='boolean'&&typeof v[k]!=='boolean')return false;if(typeof value==='string'&&value.startsWith('#')&&!hex(v[k]))return false}if(!text(v.theme,40)||!text(v.label,v===c?40:20))return false}
 if(!['horizontal','vertical'].includes(c.layout)||!['bounce','roll','flip','pop','slide','elastic','swing','focus','none'].includes(c.motion)||!exact(c.effects,defaults.overlay.effects)||!Object.values(c.effects).every(v=>typeof v==='boolean'))return false
 for(const [key,min,max]of [['size',24,200],['scale',50,150],['outlineSize',0,12],['opacity',0,100],['radius',0,48],['milestoneEvery',1,9999],['volume',0,100]])if(!int(c[key],min,max))return false
 for(const [key,min,max]of [['opacity',0,100],['radius',0,32],['width',64,160],['height',64,144],['gap',4,24],['fontSize',18,48],['duration',1,8]])if(!int(s[key],min,max))return false
 if(!Array.isArray(c.keys)||c.keys.length!==3)return false
 const keys=new Set()
 for(const [i,k]of c.keys.entries()){if(!exact(k,defaults.overlay.keys[i])||!text(k.name,40)||!text(k.value,80)||k.delta!==[1,-1,0][i])return false;if(k.value){try{normalizeShortcut(k.value);if(reservedShortcut(k.value))return false;for(const platform of ['win32','darwin']){const id=platform+shortcutIdentity(k.value,platform);if(keys.has(id))return false;keys.add(id)}}catch{return false}}}
 return true
}
