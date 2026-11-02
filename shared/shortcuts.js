const modifiers=['CommandOrControl','Control','Command','Super','Alt','Shift']
const aliases={ctrl:'Control',control:'Control',cmd:'Command',command:'Command',meta:'Super',super:'Super',commandorcontrol:'CommandOrControl',cmdorctrl:'CommandOrControl',alt:'Alt',option:'Alt',shift:'Shift',escape:'Esc',esc:'Esc',arrowup:'Up',arrowdown:'Down',arrowleft:'Left',arrowright:'Right',enter:'Enter',return:'Enter',space:'Space',tab:'Tab',backspace:'Backspace',delete:'Delete',home:'Home',end:'End',pageup:'PageUp',pagedown:'PageDown',insert:'Insert',plus:'Plus',numadd:'numadd',numsub:'numsub',nummult:'nummult',numdiv:'numdiv',numdec:'numdec',numlock:'Numlock',numpadadd:'numadd',numpadsubtract:'numsub',numpadmultiply:'nummult',numpaddivide:'numdiv',numpaddecimal:'numdec'}
const punctuation=new Set(['`','-','=','[',']','\\',';',"'",',','.','/'])
export function normalizeShortcut(value,platform='win32'){
 if(typeof value!=='string'||!value||value.length>80)throw Error('SHORTCUT_INVALID')
 const parts=value.split('+').map(k=>k.trim()).map(k=>aliases[k.toLowerCase()]??(/^Digit[0-9]$/.test(k)?k.slice(-1):/^Key[A-Z]$/.test(k)?k.slice(-1):/^(?:[a-z0-9]|f(?:[1-9]|1[0-9]|2[0-4]))$/i.test(k)?k.toUpperCase():/^(?:num|numpad)[0-9]$/i.test(k)?'num'+k.slice(-1):k))
 const mods=parts.filter(k=>modifiers.includes(k)),keys=parts.filter(k=>!modifiers.includes(k))
 if(parts.length>5||new Set(parts).size!==parts.length||keys.length!==1||(!Object.values(aliases).includes(keys[0])&&!/^(?:[A-Z0-9]|F(?:[1-9]|1[0-9]|2[0-4])|num[0-9])$/.test(keys[0])&&!punctuation.has(keys[0])))throw Error('SHORTCUT_INVALID')
 if(keys[0]==='Plus'){keys[0]='=';if(!mods.includes('Shift'))mods.push('Shift')}
 return [...modifiers.filter(k=>mods.includes(k)),keys[0]].join('+')
}
export function shortcutIdentity(value,platform='win32'){const keys=normalizeShortcut(value,platform).split('+').map(k=>k==='CommandOrControl'?(platform==='darwin'?'Command':'Control'):k==='Super'&&platform==='darwin'?'Command':k);const key=keys.pop();return[...new Set(keys.sort()),key].join('+')}

export const reservedShortcut=value=>{try{return ['darwin','win32'].some(p=>shortcutIdentity(value,p)===shortcutIdentity('Control+Alt+Shift+Backspace',p))}catch{return false}}
const codes={Space:'Space',Enter:'Enter',NumLock:'Numlock',Escape:'Esc',Tab:'Tab',Backspace:'Backspace',Delete:'Delete',ArrowUp:'Up',ArrowDown:'Down',ArrowLeft:'Left',ArrowRight:'Right',Home:'Home',End:'End',PageUp:'PageUp',PageDown:'PageDown',Insert:'Insert',NumpadAdd:'numadd',NumpadSubtract:'numsub',NumpadMultiply:'nummult',NumpadDivide:'numdiv',NumpadDecimal:'numdec',Backquote:'`',Minus:'-',Equal:'=',BracketLeft:'[',BracketRight:']',Backslash:'\\',Semicolon:';',Quote:"'",Comma:',',Period:'.',Slash:'/'}
export function captureShortcut(e,platform='win32'){
 if(e.repeat||e.isComposing||/^(Control|Alt|Shift|Meta)(Left|Right)$/.test(e.code))return{status:'ignore'}
 if(e.code==='Escape'&&!e.ctrlKey&&!e.metaKey&&!e.altKey&&!e.shiftKey)return{status:'cancel'}
 const key=codes[e.code]??(/^Key[A-Z]$/.test(e.code)?e.code.slice(-1):/^Digit[0-9]$/.test(e.code)?e.code.slice(-1):/^Numpad[0-9]$/.test(e.code)?'num'+e.code.slice(-1):/^F(?:[1-9]|1[0-9]|2[0-4])$/.test(e.code)?e.code:null)
 if(!key)return{status:'invalid'}
 const mods=[];if(e.metaKey)mods.push(platform==='darwin'?'CommandOrControl':'Super');if(e.ctrlKey)mods.push(platform==='darwin'?'Control':'CommandOrControl');if(e.altKey)mods.push('Alt');if(e.shiftKey)mods.push('Shift')
 try{const value=normalizeShortcut([...mods,key].join('+'),platform);return reservedShortcut(value)?{status:'reserved'}:{status:'captured',value}}catch{return{status:'invalid'}}
}
export function shortcutLabel(value,platform='win32'){if(!value)return'กดเพื่อตั้งคีย์ลัด';try{return normalizeShortcut(value,platform).split('+').map(k=>({CommandOrControl:platform==='darwin'?'⌘':'Ctrl',Control:'Ctrl',Command:'⌘',Super:platform==='darwin'?'⌘':'Win',Alt:platform==='darwin'?'⌥':'Alt',Shift:'Shift',numadd:'Numpad +',numsub:'Numpad −',nummult:'Numpad ×',numdiv:'Numpad ÷',numdec:'Numpad .',Numlock:platform==='darwin'?'Numpad Clear':'Num Lock'}[k]??(/^num[0-9]$/.test(k)?'Numpad '+k.slice(-1):k))).join(' + ')}catch{return value}}

// DOM codes keep the displayed keypad separate from the top row.
export function shortcutCodes(value,platform='win32'){
 try{return normalizeShortcut(value,platform).split('+').map(key=>{
  if(key==='CommandOrControl')return platform==='darwin'?'MetaLeft':'ControlLeft'
  if(key==='Control')return 'ControlLeft'
  if(key==='Command'||key==='Super')return 'MetaLeft'
  if(key==='Alt'||key==='Shift')return key+'Left'
  if(/^[A-Z]$/.test(key))return 'Key'+key
  if(/^[0-9]$/.test(key))return 'Digit'+key
  if(/^num[0-9]$/.test(key))return 'Numpad'+key.slice(-1)
  return Object.keys(codes).find(code=>codes[code]===key)??(key==='Plus'?'Equal':key)
 })}catch{return []}
}
