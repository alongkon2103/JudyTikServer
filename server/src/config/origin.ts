// Public media and OAuth callbacks use the configured origin, never a request Host header.
export function readApiOrigin(env:NodeJS.ProcessEnv):string {
 let url:URL;
 try { url=new URL(env.API_ORIGIN??`http://127.0.0.1:${env.PORT??'4300'}`); }
 catch { throw new Error('Invalid API_ORIGIN; check server environment configuration'); }
 const local=['127.0.0.1','localhost','[::1]'].includes(url.hostname);
 if(url.username || url.password || url.pathname!=='/' || url.search || url.hash || !['http:','https:'].includes(url.protocol) || (url.protocol==='http:' && (!local || env.NODE_ENV==='production'))) {
  throw new Error('Invalid API_ORIGIN; check server environment configuration');
 }
 return url.origin;
}
