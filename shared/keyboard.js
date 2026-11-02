import names from './keyboard-keys.json' with {type:'json'}
const allowed=new Set(names),modifiers=['Control','Alt','Shift','Meta']
const aliases={Ctrl:'Control',Cmd:'Meta',Command:'Meta',Super:'Meta',Option:'Alt',Esc:'Escape',Return:'Enter',Up:'ArrowUp',Down:'ArrowDown',Left:'ArrowLeft',Right:'ArrowRight',Clear:'NumLock',NumpadClear:'NumLock',numadd:'NumpadAdd',numsub:'NumpadSubtract',nummult:'NumpadMultiply',numdiv:'NumpadDivide',numdec:'NumpadDecimal'}
export function parseKeyboardKeys(value){
 if(typeof value!=='string'||value.length>80)throw Error('KEYBOARD_INVALID_KEYS')
 const keys=value.split('+').map(v=>v.trim()).map(v=>aliases[v]??(/^num[0-9]$/i.test(v)?'Numpad'+v.slice(-1):/^Key[A-Z]$/.test(v)?v.slice(-1):/^[a-z]$/i.test(v)?v.toUpperCase():/^[0-9]$/.test(v)?'Digit'+v:v))
 if(!keys.length||keys.length>4||new Set(keys).size!==keys.length||keys.some(k=>!allowed.has(k)))throw Error('KEYBOARD_INVALID_KEYS')
 return keys
}
export function captureKeyboard(e,platform='win32'){
 if(e.repeat||e.isComposing)return{status:'ignore'}
 const mods=[];if(e.ctrlKey)mods.push('Control');if(e.altKey)mods.push('Alt');if(e.shiftKey)mods.push('Shift');if(e.metaKey)mods.push('Meta')
 const modifier={ControlLeft:'Control',ControlRight:'Control',AltLeft:'Alt',AltRight:'Alt',ShiftLeft:'Shift',ShiftRight:'Shift',MetaLeft:'Meta',MetaRight:'Meta'}[e.code]
 if(modifier){if(!mods.includes(modifier))mods.push(modifier);return{status:'modifier',value:mods.join(' + ')}}
 const key=/^Key[A-Z]$/.test(e.code)?e.code.slice(-1):aliases[e.code]??e.code
 if(!allowed.has(key)||(platform==='darwin'&&/^F2[1-4]$/.test(key))||(platform!=='darwin'&&key==='NumpadEqual'))return{status:'invalid'}
 try{return{status:'captured',value:parseKeyboardKeys([...mods,key].join(' + ')).join(' + ')}}catch{return{status:'invalid'}}
}
export function keyboardLabel(value,platform='win32'){if(!value)return'กดเพื่อตั้งปุ่ม';try{return parseKeyboardKeys(value).map(k=>({Control:'Ctrl',Meta:platform==='darwin'?'⌘':'Win',Alt:platform==='darwin'?'⌥':'Alt',NumpadAdd:'Numpad +',NumpadSubtract:'Numpad −',NumpadMultiply:'Numpad ×',NumpadDivide:'Numpad ÷',NumpadDecimal:'Numpad .',NumpadEnter:'Numpad Enter',NumpadEqual:'Numpad =',NumLock:platform==='darwin'?'Numpad Clear':'Num Lock'}[k]??(/^Digit[0-9]$/.test(k)?k.slice(-1):/^Numpad[0-9]$/.test(k)?'Numpad '+k.slice(-1):k))).join(' + ')}catch{return value}}
