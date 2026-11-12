import { fontOptions } from './win.js'
export const widgetKinds = [
 {id:'slider',name:'Slider',description:'รูปและข้อความเลื่อนวน · อัปโหลดรูปหรือเลือกรูปของขวัญ',icon:'slider'},
 {id:'alert',name:'Alert Box',description:'แจ้งเตือนของขวัญ ติดตาม และอีเวนต์',icon:'bell'},
 {id:'big-gift',name:'Big Gift',description:'แสดงของขวัญชิ้นใหญ่พร้อมชื่อผู้ส่ง',icon:'gift'},
 {id:'top-likers',name:'Top Likers',description:'อันดับผู้ส่งหัวใจระหว่างไลฟ์',icon:'heart'},
 {id:'goal',name:'Goal Bar',description:'แถบความคืบหน้าตามเป้าหมาย',icon:'target'},
 {id:'leaderboard',name:'Leaderboard',description:'อันดับผู้ส่งของขวัญ',icon:'trophy'},
 {id:'timer',name:'Subathon Timer',description:'แสดงเวลาและตั้งอีเวนต์เพิ่มเวลา',icon:'clock'},
 {id:'gift-jar',name:'โหลของขวัญ',description:'ของขวัญสะสมในโหลระหว่างไลฟ์',icon:'jar'},
 {id:'video',name:'Video Overlay',description:'เล่นวิดีโอจาก Actions พร้อมกรอบธีม',icon:'video'},
 {id:'spin',name:'Spin',description:'สุ่มรายการที่กำหนด แยกจาก WIN',icon:'sparkles'}
]
const themes = ['plain-white','plain-black','crystal-reverie','mochi-pals','orbital-bloom','enchanted-grove','pearl-tide','cloud-palace','sakura-moon','midnight-grimoire','sugar-garden','aurora-prism']
const triggers = ['gift','like','follow','comment','share','subscribe']
const keys = ['font','theme','title','viewer','accent','background','opacity','fontSize','value','goal','seconds','options','enabled','events','duration','minCoins','metric','trigger','giftId','threshold','secondsPerEvent']
const exact = (value, names) => value !== null && typeof value === 'object'
  && Object.getPrototypeOf(value) === Object.prototype
  && Reflect.ownKeys(value).length === names.length
  && names.every(key => { const descriptor=Object.getOwnPropertyDescriptor(value,key); return descriptor?.enumerable && Object.hasOwn(descriptor,'value') })
const array = (value,min,max) => Array.isArray(value) && Object.getPrototypeOf(value) === Array.prototype
  && value.length >= min && value.length <= max && Reflect.ownKeys(value).length === value.length+1
  && Array.from({length:value.length},(_,i)=>Object.getOwnPropertyDescriptor(value,String(i))).every(d=>d?.enumerable && Object.hasOwn(d,'value'))
const integer = (value,min,max) => Number.isSafeInteger(value) && value >= min && value <= max
const text = value => typeof value === 'string' && value.trim().length > 0 && value.length <= 40
  && !/[\x00-\x1f\x7f-\x9f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/.test(value)
const color = value => typeof value === 'string' && /^#[a-f0-9]{6}$/i.test(value)
export function validWidgetAppearance(value){
 const colors=['text','title','detail','value','rank','border','outline']
 return value!==null&&typeof value==='object'
  && exact(value,[...colors,'outlineSize'].filter(key=>Object.hasOwn(value,key)))
  && colors.every(key=>!Object.hasOwn(value,key)||color(value[key]))
  && (!Object.hasOwn(value,'outlineSize')||integer(value.outlineSize,0,6))
}

export function defaultWidget(kind) {
  const item=widgetKinds.find(item=>item.id===kind)
  if(!item)throw new TypeError('INVALID_WIDGET_KIND')
  return {font:'Judy',theme:'plain-white',title:item.name,viewer:'JUDY GAME',accent:'#595959',background:'#FFFFFF',opacity:kind==='slider'?0:100,fontSize:24,value:0,goal:1000,seconds:4975,options:['ร้องเพลง','เต้น','พัก 1 นาที','เล่าเรื่องตลก'],enabled:true,events:['gift','follow','subscribe'],duration:4,minCoins:0,metric:'coins',trigger:'gift',giftId:'*',threshold:1,secondsPerEvent:30,...(kind==='spin'?{spinSound:true,spinVolume:80}:{}),...(['leaderboard','gift-jar'].includes(kind)?{rankLimit:10}:{}),...(kind==='big-gift'?{bigGiftLimit:3}:{}),...(kind==='top-likers'?{likerLimit:10}:{}),...(kind==='gift-jar'?{showRanking:false,showTotal:true,showRecentGift:false}:{}),...(kind==='slider'?{sliderItems:[],sliderSpeed:45,sliderSize:120,sliderGap:32,sliderWidth:800,sliderDirection:'left',sliderTextColor:'#FFFFFF'}:{})}
}

export function safeSpinImage(value) {
 try { if(typeof value!=='string'||value.length>2048||/[\x00-\x20\x7f]/.test(value))return false;const url=new URL(value);return url.protocol==='https:'&&!url.username&&!url.password } catch { return false }
}
export function validSpinOption(value) {
 return exact(value,['id','label',...['imageUrl','imageBindingId','imageDisplayName','actionId','weight','textColor'].filter(key=>Object.hasOwn(value,key))])
  && typeof value.id==='string'&&/^[A-Za-z0-9_-]{1,64}$/.test(value.id)&&text(value.label)
  && (!Object.hasOwn(value,'imageUrl')||safeSpinImage(value.imageUrl))
  && (!Object.hasOwn(value,'imageBindingId')||typeof value.imageBindingId==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.imageBindingId)&&typeof value.imageDisplayName==='string'&&value.imageDisplayName.trim().length>0&&value.imageDisplayName.length<=255&&!/[\\/\x00-\x1f\x7f-\x9f]/.test(value.imageDisplayName)&&!Object.hasOwn(value,'imageUrl'))
  && (!Object.hasOwn(value,'imageDisplayName')||Object.hasOwn(value,'imageBindingId'))
  && (!Object.hasOwn(value,'textColor')||value.textColor===null||color(value.textColor))
  && (!Object.hasOwn(value,'weight')||integer(value.weight,0,100))
  && (!Object.hasOwn(value,'actionId')||typeof value.actionId==='string'&&/^[A-Za-z0-9_-]{1,64}$/.test(value.actionId))
}
export function validWidget(value) {
  try {
    return exact(value,[...keys,...['appearance','spinGiftIds','spinSound','spinVolume','rankLimit','bigGiftLimit','likerLimit','showRanking','showTotal','showRecentGift','spinOptions','sliderItems','sliderSpeed','sliderSize','sliderGap','sliderWidth','sliderDirection','sliderTextColor'].filter(key=>Object.hasOwn(value,key))]) && (!Object.hasOwn(value,'appearance')||validWidgetAppearance(value.appearance)) && ['showRanking','showTotal','showRecentGift'].every(key=>!Object.hasOwn(value,key)||typeof value[key]==='boolean') && typeof value.font === 'string' && Object.hasOwn(fontOptions,value.font)
      && (!Object.hasOwn(value,'spinGiftIds')||array(value.spinGiftIds,1,100)&&value.spinGiftIds.every(id=>typeof id==='string'&&/^[1-9][0-9]{0,19}$/.test(id))&&new Set(value.spinGiftIds).size===value.spinGiftIds.length)
      && (!Object.hasOwn(value,'spinSound')||typeof value.spinSound==='boolean')
      && (!Object.hasOwn(value,'spinVolume')||integer(value.spinVolume,0,100))
      && (!Object.hasOwn(value,'rankLimit')||[5,10].includes(value.rankLimit))
      && (!Object.hasOwn(value,'bigGiftLimit')||integer(value.bigGiftLimit,1,10))
      && (!Object.hasOwn(value,'likerLimit')||[5,10].includes(value.likerLimit))
      && (!Object.hasOwn(value,'sliderItems')||array(value.sliderItems,0,20)&&value.sliderItems.every(item=>validSpinOption(item)&&!Object.hasOwn(item,'actionId')&&!Object.hasOwn(item,'weight'))&&new Set(value.sliderItems.map(item=>item.id)).size===value.sliderItems.length)
      && (!Object.hasOwn(value,'sliderSpeed')||integer(value.sliderSpeed,10,200))
      && (!Object.hasOwn(value,'sliderSize')||integer(value.sliderSize,48,240))
      && (!Object.hasOwn(value,'sliderGap')||integer(value.sliderGap,8,96))
      && (!Object.hasOwn(value,'sliderWidth')||integer(value.sliderWidth,240,1920))
      && (!Object.hasOwn(value,'sliderDirection')||['left','right'].includes(value.sliderDirection))
      && (!Object.hasOwn(value,'sliderTextColor')||color(value.sliderTextColor))
      && themes.includes(value.theme) && text(value.title) && text(value.viewer) && color(value.accent) && color(value.background)
      && integer(value.opacity,0,100) && integer(value.fontSize,16,40) && integer(value.value,0,99999)
      && integer(value.goal,1,99999) && integer(value.seconds,0,86400)
      && (!Object.hasOwn(value,'spinOptions')||array(value.spinOptions,2,12)&&value.spinOptions.every(validSpinOption)&&new Set(value.spinOptions.map(option=>option.id)).size===value.spinOptions.length&&value.spinOptions.length===value.options.length&&value.spinOptions.every((option,index)=>option.label===value.options[index])&&value.spinOptions.some(option=>(option.weight??10)>0))
      && array(value.options,2,12) && value.options.every(text) && typeof value.enabled === 'boolean'
      && array(value.events,0,triggers.length) && value.events.every(event=>triggers.includes(event)) && new Set(value.events).size === value.events.length
      && integer(value.duration,1,30) && integer(value.minCoins,0,1000000) && ['coins','gifts','likes','follows'].includes(value.metric)
      && triggers.includes(value.trigger) && typeof value.giftId === 'string' && /^(?:\*|[1-9][0-9]{0,19})$/.test(value.giftId)
      && integer(value.threshold,1,1000000) && integer(value.secondsPerEvent,1,3600)
  } catch { return false }
}

export function defaultOverlayData() {
  return {version:1,widgets:Object.fromEntries(widgetKinds.map(({id})=>[id,defaultWidget(id)]))}
}

export function validOverlayData(value) {
  try {
    return exact(value,['version','widgets']) && value.version === 1
      && exact(value.widgets,widgetKinds.filter(({id})=>!['video','slider'].includes(id)||Object.hasOwn(value.widgets,id)).map(({id})=>id)) && widgetKinds.every(({id})=>['video','slider'].includes(id)&&!Object.hasOwn(value.widgets,id)||validWidget(value.widgets[id]))
      && ['plain-white','plain-black','crystal-reverie','mochi-pals','enchanted-grove','midnight-grimoire'].includes(value.widgets['gift-jar'].theme)
  } catch { return false }
}

// Existing accounts acquire video settings without rewriting their saved widgets.
export function hydrateOverlayData(value) {
 if(!validOverlayData(value))throw new TypeError('INVALID_OVERLAY_DATA')
 return {...value,widgets:{...value.widgets,video:value.widgets.video??defaultWidget('video'),slider:value.widgets.slider??defaultWidget('slider')}}
}
