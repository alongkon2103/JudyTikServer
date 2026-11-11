import {z} from 'zod';
import {appPresenceStartSchema,appPresenceHeartbeatSchema} from './contracts.js';
export function addAppPresenceOpenApi(doc:any){
 const schemas={AppPresenceStart:appPresenceStartSchema,AppPresenceHeartbeat:appPresenceHeartbeatSchema,AppPresenceLease:z.strictObject({connectionId:z.uuid(),expiresAt:z.iso.datetime(),heartbeatAfterMs:z.literal(60000)}),AppPresenceCount:z.strictObject({count:z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),serverTime:z.iso.datetime(),refreshAfterMs:z.literal(60000)})};
 for(const [name,v] of Object.entries(schemas)){const {$schema,...s}=z.toJSONSchema(v);doc.components.schemas[name]=s;}
 const ref=(n:string)=>({$ref:'#/components/schemas/'+n});
 const errors=Object.fromEntries([400,401,404,409,429,500].map(n=>[n,{description:'Error envelope',content:{'application/json':{schema:ref('Error')}}}]));
 const op=(operationId:string,out:string,input?:string)=>({operationId,security:[{desktopSession:[]}],...(input?{requestBody:{required:true,content:{'application/json':{schema:ref(input)}}}}:{}),responses:{200:{description:'Success',content:{'application/json':{schema:ref(out)}}},...errors}});
 const parameters=[{name:'connectionId',in:'path',required:true,schema:{type:'string',format:'uuid'}}];
 doc.paths['/me/app-presence']={post:{...op('startAppPresence','AppPresenceLease','AppPresenceStart'),description:'Private 150 second signed-in desktop lease, independent of TikTok LIVE and plan. Retries do not extend expiry. Closed or expired IDs return 409 APP_PRESENCE_CLOSED.'}};
 doc.paths['/me/app-presence/{connectionId}']={put:{...op('heartbeatAppPresence','AppPresenceLease','AppPresenceHeartbeat'),parameters,description:'Heartbeat every 60 seconds. Sequence must increase to renew a matching unexpired active lease. Missing/expired/stopped returns 404 APP_PRESENCE_EXPIRED.'},delete:{operationId:'stopAppPresence',security:[{desktopSession:[]}],parameters,responses:{204:{description:'Lease stopped; ID retired even before a delayed start arrives.'},...errors}}};
 doc.paths['/app-presence/count']={get:{...op('getAppOnlineCount','AppPresenceCount'),description:'Unique signed-in active JudyTik accounts, deduplicated across processes, sessions and devices. Excludes disabled/merged accounts and revoked/expired sessions. Aggregate only; no identities or LIVE activity.'}};
 return doc;
}
