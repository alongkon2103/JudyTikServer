export function addAdminUsersOpenApi(doc:any){
 const ref=(name:string)=>({$ref:'#/components/schemas/'+name})
 const time={type:'string',format:'date-time'}
 doc.components.schemas.AdminUser={
  type:'object',additionalProperties:false,
  required:['userId','displayName','avatarUrl','email','providers','createdAt','disabledAt','entitlement'],
  properties:{
   userId:{type:'string',format:'uuid'},displayName:{type:'string'},
   avatarUrl:{type:['string','null']},email:{type:['string','null'],format:'email'},
   providers:{type:'array',uniqueItems:true,items:{type:'string'}},
   createdAt:time,disabledAt:{type:['string','null'],format:'date-time'},entitlement:ref('Entitlements'),
  },
 }
 doc.components.schemas.AdminUserPage={
  type:'object',additionalProperties:false,required:['items','page','pageSize','total','totalPages','serverTime'],
  properties:{items:{type:'array',items:ref('AdminUser')},page:{type:'integer',minimum:1,maximum:1000000},pageSize:{type:'integer',minimum:1,maximum:100},total:{type:'integer',minimum:0},totalPages:{type:'integer',minimum:0},serverTime:time},
 }
 doc.paths['/admin/users']={get:{
  operationId:'adminListUsers',tags:['Admin users'],security:[{adminServiceKey:[]}],
  description:'List canonical accounts, newest first (createdAt DESC, id DESC). Includes disabled and email-less accounts; excludes merged sources. Optional literal case-insensitive email substring and current FREE/PRO filter. Expired, revoked and not-yet-started grants do not confer PRO. Read-only; no feature access enforcement or online presence.',
  parameters:[
   {name:'email',in:'query',description:'Optional literal partial verified email, trimmed and case-insensitive. Use URL encoding, including %2B for +. Empty means no email filter.',schema:{type:'string',maxLength:254}},
   {name:'plan',in:'query',schema:{type:'string',enum:['FREE','PRO']}},
   {name:'page',in:'query',schema:{type:'integer',minimum:1,maximum:1000000,default:1}},
   {name:'pageSize',in:'query',schema:{type:'integer',minimum:1,maximum:100,default:25}},
  ],
  responses:{
   200:{description:'One transaction and Server time snapshot for filtered total and page rows. An out-of-range page has empty items; zero matches has totalPages 0.',content:{'application/json':{schema:ref('AdminUserPage')}}},
   ...Object.fromEntries([400,401,429,500].map(status=>[status,{description:'Error envelope. Invalid query: INVALID_REQUEST; service key required: ADMIN_UNAUTHORIZED; quota: RATE_LIMITED.',content:{'application/json':{schema:ref('Error')}}}])),
  },
 }}
 return doc
}
