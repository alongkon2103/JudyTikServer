import {z} from 'zod'
import {adjustSchema,expirySchema,revokeSchema} from './contracts.js'
export function addEntitlementsOpenApi(doc:any){
 const ref=(name:string)=>({$ref:'#/components/schemas/'+name})
 const uuid={type:'string',format:'uuid'},time={type:'string',format:'date-time'}
 const json=(s:z.ZodType)=>{const {$schema,...value}=z.toJSONSchema(s,{io:'input'});return value}
 Object.assign(doc.components.schemas,{
  EntitlementAdjustment:json(adjustSchema),EntitlementExpiryWrite:json(expirySchema),EntitlementRevocation:json(revokeSchema),
  ManagedEntitlement:{type:'object',additionalProperties:false,required:['userId','entitlement'],properties:{userId:uuid,entitlement:ref('Entitlements')}},
  EntitlementOperation:{type:'object',additionalProperties:false,required:['id','userId','idempotencyKey','operation','days','source','reason','before','after','requestId','createdAt'],properties:{id:uuid,userId:uuid,idempotencyKey:{type:'string',minLength:8,maxLength:128},operation:{enum:['adjust','set-expiry','revoke']},days:{type:['integer','null']},source:{type:'string'},reason:{type:'string'},before:ref('Entitlements'),after:ref('Entitlements'),requestId:uuid,createdAt:time}},
  EntitlementMutationResult:{type:'object',additionalProperties:false,required:['replayed','operation','entitlement'],properties:{replayed:{type:'boolean'},operation:ref('EntitlementOperation'),entitlement:ref('Entitlements')}},
  EntitlementHistory:{type:'object',additionalProperties:false,required:['userId','items','nextCursor'],properties:{userId:uuid,items:{type:'array',items:ref('EntitlementOperation')},nextCursor:{type:['string','null'],format:'uuid'}}},
 })
 const query=[{name:'userId',in:'query',schema:uuid,description:'Exactly one of userId or email is required.'},{name:'email',in:'query',schema:{type:'string',format:'email'},description:'Existing verified account email. No account is created.'}]
 const errors=Object.fromEntries([400,401,404,409,413,428,429,500].map(code=>[code,{description:'Error envelope. 409 includes IDEMPOTENCY_KEY_CONFLICT, ENTITLEMENT_NOT_ACTIVE or ENTITLEMENT_USER_DISABLED.',content:{'application/json':{schema:ref('Error')}}}]))
 const op=(operationId:string,result:string,description:string,body?:string,parameters:any[]=[])=>({operationId,tags:['Admin entitlements'],description,security:[{adminServiceKey:[]}],parameters,...(body?{requestBody:{required:true,content:{'application/json':{schema:ref(body)}}}}:{}),responses:{200:{description:'Success. A replay returns the original operation snapshot and does not mutate current access.',content:{'application/json':{schema:ref(result)}}},...errors}})
 const key={name:'Idempotency-Key',in:'header',required:true,schema:{type:'string',minLength:8,maxLength:128,pattern:'^[A-Za-z0-9._:-]+$'},description:'Unique per business operation. Retry the exact same normalized payload with the same key; changed payload returns 409.'}
 doc.paths['/admin/entitlements']={get:op('adminGetEntitlement','ManagedEntitlement','Inspect current FREE/PRO and expiry by userId or verified email.',undefined,query)}
 doc.paths['/admin/entitlements/history']={get:op('adminEntitlementHistory','EntitlementHistory','Append-only history of management API operations, ordered newest first. Legacy manually inserted grants are not operation history.',undefined,[...query,{name:'limit',in:'query',schema:{type:'integer',minimum:1,maximum:100,default:25}},{name:'before',in:'query',schema:uuid,description:'nextCursor from the previous page for the same account.'}])}
 doc.paths['/admin/entitlements/adjust']={post:op('adminAdjustEntitlement','EntitlementMutationResult','Exactly one of userId/email. Positive integer days extend active PRO, otherwise start now; negative days require active PRO and clamp expiry to now. A day is exactly 24 hours. Mutations replace current and scheduled grants, preserving them as revoked history. Maximum resulting expiry is 36,500 days from now. source and reason are required.','EntitlementAdjustment',[key])}
 doc.paths['/admin/entitlements/set-expiry']={post:op('adminSetEntitlementExpiry','EntitlementMutationResult','Exactly one target. Set an ISO 8601 timestamp with timezone. A past timestamp makes access FREE; scheduled grants are replaced. Allowed years start at 2000; expiry cannot exceed now + 36,500 days.','EntitlementExpiryWrite',[key])}
 doc.paths['/admin/entitlements/revoke']={post:op('adminRevokeEntitlement','EntitlementMutationResult','Exactly one target. Revoke all active and scheduled PRO grants immediately. Does not delete the account or modify Desktop page restrictions.','EntitlementRevocation',[key])}
 return doc
}
