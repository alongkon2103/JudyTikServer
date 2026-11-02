import {test} from 'node:test'
import assert from 'node:assert/strict'
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {fileURLToPath} from 'node:url'
import {spawn,spawnSync} from 'node:child_process'
import {createServer} from 'node:net'
import {Client} from 'pg'
const root=fileURLToPath(new URL('../../',import.meta.url))
test('built production backend starts independently with restricted database credentials and runtime-only env',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'judy-production-start-'))
 let child:ReturnType<typeof spawn>|undefined,output=''
 const admin=new Client({connectionString:process.env.TEST_ADMIN_DATABASE_URL});await admin.connect()
 let bootstrap=false
 try{
  const generated=spawnSync(process.execPath,[join(root,'deploy/init-env.mjs'),dir],{encoding:'utf8'});assert.equal(generated.status,0)
  const socket=createServer();await new Promise<void>(resolve=>socket.listen(0,'127.0.0.1',resolve));const port=(socket.address() as {port:number}).port;await new Promise<void>(resolve=>socket.close(()=>resolve()))
  const file=join(dir,'runtime.env'),migration=join(dir,'migrate.env'),template=await readFile(file,'utf8'),migrationTemplate=await readFile(migration,'utf8')
  for(const line of (await readFile(join(dir,'.pg-bootstrap.sql'),'utf8')).split('\n').filter(line=>line.trim()&&!line.startsWith('--')))await admin.query(line)
  bootstrap=true
  const target=(value:string)=>{const original=new URL(value),destination=new URL(process.env.TEST_ADMIN_DATABASE_URL!);destination.pathname='/judytik';destination.username=original.username;destination.password=original.password;return destination.toString()}
  const runtimeUrl=target(template.match(/^DATABASE_URL=(.*)$/m)![1]),migrationUrl=target(migrationTemplate.match(/^DIRECT_URL=(.*)$/m)![1])
  await writeFile(file,template.replace(/^DATABASE_URL=.*$/m,'DATABASE_URL='+runtimeUrl).replace('PORT=4300','PORT='+port),{mode:0o600})
  await writeFile(migration,'DIRECT_URL='+migrationUrl+'\n',{mode:0o600})
  const safeEnv={...process.env};delete safeEnv.DIRECT_URL;delete safeEnv.DATABASE_URL;delete safeEnv.TEST_ADMIN_DATABASE_URL;delete safeEnv.DOTENV_CONFIG_PATH
  const migrated=spawnSync(process.execPath,[join(root,'deploy/run-with-env.mjs'),migration,process.execPath,'node_modules/prisma/build/index.js','migrate','deploy'],{env:safeEnv,encoding:'utf8'})
  assert.equal(migrated.status,0,'Fresh generated bootstrap migrations failed')
  const ownerUrl=new URL(process.env.TEST_ADMIN_DATABASE_URL!);ownerUrl.pathname='/judytik';const owner=new Client({connectionString:ownerUrl.toString()});await owner.connect()
  try{await owner.query((await readFile(join(root,'server/prisma/runtime-grants.sql'),'utf8')).replaceAll(':"runtime_role"','"judytik_runtime"'))}finally{await owner.end()}
  const env={...process.env};delete env.DIRECT_URL;delete env.TEST_ADMIN_DATABASE_URL;delete env.DOTENV_CONFIG_PATH
  child=spawn(process.execPath,[join(root,'deploy/start.mjs'),file],{cwd:tmpdir(),env,stdio:['ignore','pipe','pipe']})
  child.stdout?.on('data',chunk=>{output+=chunk});child.stderr?.on('data',chunk=>{output+=chunk})
  let ready=false
  for(let attempt=0;attempt<200;attempt++){
   if(child.exitCode!==null)throw Error('Production process exited: '+output.slice(-2000))
   try{const response=await fetch(`http://127.0.0.1:${port}/v1/health/ready`);if(response.status===200){assert.deepEqual(await response.json(),{status:'ok'});ready=true;break}}catch{}
   await new Promise(resolve=>setTimeout(resolve,50))
  }
  assert(ready,'Production readiness timed out')
  assert.equal((await fetch(`http://127.0.0.1:${port}/v1/games`)).status,200)
  const denied=await fetch(`http://127.0.0.1:${port}/v1/presets`);assert.equal(denied.status,401)
  assert(!output.includes(new URL(runtimeUrl).password),'Startup must not print credentials')
 }finally{
  if(child&&child.exitCode===null){const exited=new Promise(resolve=>child!.once('exit',resolve));child.kill('SIGTERM');const timeout=setTimeout(()=>child?.kill('SIGKILL'),5000);await exited;clearTimeout(timeout)}
  if(bootstrap){await admin.query('DROP DATABASE judytik WITH (FORCE)');await admin.query('DROP ROLE judytik_runtime');await admin.query('DROP ROLE judytik_migrator')}
  await admin.end();await rm(dir,{recursive:true,force:true})
 }
})
