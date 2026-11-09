import {z} from 'zod'
import {ApiError} from '../http/api-error.js'

const positiveQueryInteger=(fallback:number,max:number)=>z.string().regex(/^[1-9][0-9]*$/).optional()
 .transform(value=>value===undefined?fallback:Number(value)).pipe(z.number().int().min(1).max(max))

export const adminUsersQuery=z.object({
 email:z.string().trim().max(254).regex(/^[^\x00-\x1f\x7f]*$/).transform(value=>value.toLowerCase()).optional(),
 plan:z.enum(['FREE','PRO']).optional(),
 page:positiveQueryInteger(1,1000000),
 pageSize:positiveQueryInteger(25,100),
}).strict()

export function parseAdminUsersQuery(input:unknown){
 const parsed=adminUsersQuery.safeParse(input)
 if(!parsed.success)throw new ApiError(400,'INVALID_REQUEST')
 return parsed.data
}
