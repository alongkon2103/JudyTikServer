import {z} from 'zod'
import {ApiError} from '../http/api-error.js'
const targetShape={userId:z.uuid().optional(),email:z.email().max(254).transform(value=>value.trim().toLowerCase()).optional()}
const oneTarget=(v:{userId?:string;email?:string})=>Number(!!v.userId)+Number(!!v.email)===1
const metadata={source:z.string().trim().min(1).max(80).regex(/^[A-Za-z0-9._:-]+$/),reason:z.string().trim().min(1).max(300).regex(/^[^\x00-\x1f\x7f]*$/)}
export const targetSchema=z.object(targetShape).strict().refine(oneTarget)
export const historySchema=z.object({...targetShape,limit:z.coerce.number().int().min(1).max(100).default(25),before:z.uuid().optional()}).strict().refine(oneTarget)
export const adjustSchema=z.object({...targetShape,...metadata,days:z.number().int().min(-36500).max(36500).refine(v=>v!==0)}).strict().refine(oneTarget)
export const expirySchema=z.object({...targetShape,...metadata,expiresAt:z.iso.datetime({offset:true}).refine(v=>Number.isFinite(Date.parse(v))&&Date.parse(v)>=Date.UTC(2000,0,1))}).strict().refine(oneTarget)
export const revokeSchema=z.object({...targetShape,...metadata}).strict().refine(oneTarget)
export const keySchema=z.string().min(8).max(128).regex(/^[A-Za-z0-9._:-]+$/)
export type Target=z.infer<typeof targetSchema>
export type Mutation=z.infer<typeof adjustSchema>|z.infer<typeof expirySchema>|z.infer<typeof revokeSchema>
export function parse<T>(schema:z.ZodType<T>,input:unknown):T{const result=schema.safeParse(input);if(!result.success)throw new ApiError(400,'INVALID_REQUEST');return result.data}
