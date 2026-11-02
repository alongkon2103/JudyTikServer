export type KeyCapture={status:'ignore'|'cancel'|'invalid'|'reserved'}|{status:'captured';value:string}
export function captureShortcut(event:{code:string;ctrlKey:boolean;metaKey:boolean;altKey:boolean;shiftKey:boolean;repeat?:boolean;isComposing?:boolean},platform?:string):KeyCapture
export function normalizeShortcut(value:string,platform?:string):string
export function shortcutIdentity(value:string,platform?:string):string
export function shortcutLabel(value:string,platform?:string):string
export function reservedShortcut(value:string):boolean
export function shortcutCodes(value:string,platform?:string):string[]
