import {randomBytes,generateKeyPairSync} from 'node:crypto'
import {mkdir,lstat,open,rm} from 'node:fs/promises'
import {resolve,join} from 'node:path'
const directory=process.argv[2]
if(!directory){console.error('Usage: node deploy/init-env.mjs <private-environment-directory>');process.exit(1)}
const root=resolve(directory),names=['runtime.env','migrate.env','.pg-bootstrap.sql'],created=[]
try{
 await mkdir(root,{recursive:true,mode:0o700})
 for(const name of names){try{await lstat(join(root,name));throw Error('EXISTS')}catch(e){if(e.code!=='ENOENT')throw e}}
 const secret=()=>randomBytes(32).toString('base64url'),runtimePassword=secret(),migrationPassword=secret()
 const {privateKey}=generateKeyPairSync('ed25519')
 const runtime=`NODE_ENV=production\nHOST=127.0.0.1\nPORT=4300\nTRUST_PROXY=loopback\nAPI_ORIGIN=https://judytik.judygamestudio.com\nDATABASE_URL=postgresql://judytik_runtime:${runtimePassword}@127.0.0.1:5432/judytik\nADMIN_API_KEY=${secret()}\nAUTH_SIGNING_PRIVATE_KEY=${privateKey.export({format:'der',type:'pkcs8'}).toString('base64')}\nAUTH_SIGNING_KEY_ID=judytik-auth-v1\nAUTH_ENCRYPTION_KEY=${secret()}\nAUTH_BROWSER_SECRET=${secret()}\nEMAIL_CODE_PEPPER=${secret()}\nDISCORD_CLIENT_ID=\nDISCORD_CLIENT_SECRET=\nGOOGLE_CLIENT_ID=\nGOOGLE_CLIENT_SECRET=\nSMTP_URL=\nSMTP_FROM=\nEULER_API_KEY=\nEULER_ACCOUNT_ID=\n`
 const migration=`DIRECT_URL=postgresql://judytik_migrator:${migrationPassword}@127.0.0.1:5432/judytik\n`
 const bootstrap=`-- FIRST INSTALL ONLY. Run as PostgreSQL administrator; never commit this file.\nCREATE ROLE judytik_migrator LOGIN PASSWORD '${migrationPassword}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;\nCREATE ROLE judytik_runtime LOGIN PASSWORD '${runtimePassword}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS NOINHERIT;\nCREATE DATABASE judytik OWNER judytik_migrator;\nREVOKE ALL ON DATABASE judytik FROM PUBLIC;\nGRANT CONNECT ON DATABASE judytik TO judytik_runtime;\n`
 for(const [index,content] of [runtime,migration,bootstrap].entries()){
  const file=join(root,names[index]),handle=await open(file,'wx',0o600);created.push(file)
  try{await handle.writeFile(content);await handle.sync()}finally{await handle.close()}
 }
 console.log('Created runtime.env, migrate.env and private .pg-bootstrap.sql. No secret values printed. Existing files will never be overwritten.')
}catch(e){for(const file of created)await rm(file,{force:true}).catch(()=>{});console.error(e.message==='EXISTS'?'Environment already exists; preserve it and edit deliberately.':'Could not create environment files; check directory permissions and existing files.');process.exitCode=1}
