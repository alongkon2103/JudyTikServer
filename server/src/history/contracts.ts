import { z } from 'zod'
import { validHistoryId } from '../../../shared/history.js'
import { ApiError } from '../http/api-error.js'
const timestamp=z.string().refine(v=>v.length===24 && Number.isFinite(Date.parse(v)) && new Date(v).toISOString()===v)
const cursorSchema=z.object({at:timestamp,id:z.string().refine(validHistoryId)}).strict()
export function historyId(input:unknown):string {
 if(!validHistoryId(input)) throw new ApiError(400,'INVALID_REQUEST')
 return input
}
export function historyQuery(input:unknown) {
 const parsed=z.object({range:z.enum(['7','30','all']).default('all'),query:z.string().max(120).regex(/^[^\x00-\x1f\x7f-\x9f]*$/).default(''),limit:z.string().regex(/^(?:[1-9]|[1-9][0-9]|100)$/).default('50'),cursor:z.string().max(1024).optional()}).strict().safeParse(input)
 if(!parsed.success) throw new ApiError(400,'INVALID_REQUEST')
 let cursor:z.infer<typeof cursorSchema>|undefined
 if(parsed.data.cursor!==undefined) {
  try {const raw=parsed.data.cursor;if(!/^[A-Za-z0-9_-]+$/.test(raw))throw Error();cursor=cursorSchema.parse(JSON.parse(Buffer.from(raw,'base64url').toString('utf8')))}
  catch {throw new ApiError(400,'INVALID_REQUEST')}
 }
 return {...parsed.data,query:parsed.data.query.trim().toLowerCase(),limit:Number(parsed.data.limit),cursor}
}
export function historyCursor(at:string,id:string) {return Buffer.from(JSON.stringify({at,id})).toString('base64url')}
