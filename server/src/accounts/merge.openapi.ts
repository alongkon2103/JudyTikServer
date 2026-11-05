export function addAccountMergeOpenApi(doc:any){
 const ref=(name:string)=>({$ref:'#/components/schemas/'+name})
 const uuid={type:'string',format:'uuid'},modules=['settings','winWorkspace','soundpadWorkspace','ttsWorkspace','overlaysWorkspace']
 Object.assign(doc.components.schemas,{
  AccountMergeItem:{type:'object',required:['id','kind','sourceUserId','name','providers','createdAt','modules'],properties:{id:uuid,kind:{enum:['source','primary','restore']},sourceUserId:uuid,name:{type:'string'},providers:{type:'array',items:{enum:['google','discord']}},createdAt:{type:'string',format:'date-time'},modules:{type:'array',items:{enum:modules}}}},
  AccountMergeList:{type:'object',required:['userId','linkedAccountIds','mediaAliases','items'],properties:{userId:uuid,linkedAccountIds:{type:'array',items:uuid},mediaAliases:{type:'object',additionalProperties:{type:'object',required:['owner','bindingId'],properties:{owner:uuid,bindingId:uuid}}},items:{type:'array',items:ref('AccountMergeItem')}}},
  AccountMergeArchive:{type:'object',required:['version','id','kind','sourceUserId','capturedAt','data'],properties:{version:{const:1},id:uuid,kind:{enum:['source','primary','restore']},sourceUserId:uuid,capturedAt:{type:'string',format:'date-time'},data:{type:'object',description:'Immutable original settings, workspaces, presets, history, grants and device metadata. Contains no session/refresh tokens or OAuth secrets.'}}},
  AccountMergeRestore:{type:'object',additionalProperties:false,required:['module','revision'],properties:{module:{enum:modules},revision:{type:'string',pattern:'^[0-9]{1,19}$',description:'Current module revision, or 0 if it does not exist.'}}},
  AccountMergeRestored:{type:'object',required:['restored','module'],properties:{restored:{const:true},module:{enum:modules}}},
 })
 const errors=Object.fromEntries([400,401,404,409,412,429,500].map(status=>[status,{description:'Error envelope. 412 ACCOUNT_RESTORE_CONFLICT requires rereading the current revision. 409 ACCOUNT_BACKUP_INCOMPATIBLE or ACCOUNT_MERGE_TOO_LARGE leaves current data unchanged.',content:{'application/json':{schema:ref('Error')}}}]))
 const operation=(id:string,result:string,description:string,archive=false,body?:string)=>({operationId:id,tags:['Accounts'],security:[{desktopSession:[]}],description,...(archive?{parameters:[{name:'id',in:'path',required:true,schema:uuid}]}:{}),...(body?{requestBody:{required:true,content:{'application/json':{schema:ref(body)}}}}:{}),responses:{200:{description:'Success',content:{'application/json':{schema:ref(result)}}},...errors}})
 const paths={
  '/me/account-merges':{get:operation('accountMergeList','AccountMergeList','List backups and local media ownership aliases belonging to the signed-in merged account.')},
  '/me/account-merges/{id}':{get:operation('accountMergeDownload','AccountMergeArchive','Download one original cloud snapshot. Local media bytes are not stored on the server.',true)},
  '/me/account-merges/{id}/restore':{post:operation('accountMergeRestore','AccountMergeRestored','Restore one module using an optimistic revision. Saves another immutable current-state snapshot first. Presets, history and rights are not replaced by this endpoint.',true,'AccountMergeRestore')},
 }
 Object.assign(doc.paths,paths)
 return doc
}
