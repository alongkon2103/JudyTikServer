export function parseKeyboardKeys(value:string):string[]
export function captureKeyboard(event:{code:string;ctrlKey:boolean;altKey:boolean;shiftKey:boolean;metaKey:boolean;repeat?:boolean;isComposing?:boolean},platform?:string):{status:'ignore'|'invalid'}|{status:'captured'|'modifier';value:string}
export function keyboardLabel(value:string,platform?:string):string
