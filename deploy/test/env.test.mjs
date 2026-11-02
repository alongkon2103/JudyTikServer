import {fileURLToPath} from 'node:url'
import {test} from 'node:test'
import assert from 'node:assert/strict'
import {mkdtemp,readFile,stat,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {spawnSync} from 'node:child_process'
import {createPrivateKey} from 'node:crypto'
const script=new URL('../init-env.mjs',import.meta.url)
test('initial environment generation creates private stable keys and separates migration access',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'judy-deploy-env-'))
 try{
  const generate=()=>spawnSync(process.execPath,[fileURLToPath(script),dir],{encoding:'utf8'})
  const first=generate();assert.equal(first.status,0,first.stderr)
  const runtime=await readFile(join(dir,'runtime.env'),'utf8'),migration=await readFile(join(dir,'migrate.env'),'utf8')
  const parse=text=>Object.fromEntries(text.split('\n').filter(line=>/^[A-Z_]+=/.test(line)).map(line=>{const i=line.indexOf('=');return[line.slice(0,i),line.slice(i+1)]}))
  const vars=parse(runtime),db=parse(migration)
  assert.equal(vars.API_ORIGIN,'https://judytik.judygamestudio.com');assert.equal(vars.TRUST_PROXY,'loopback');assert(!('DIRECT_URL'in vars));assert(!('DATABASE_URL'in db));assert.match(db.DIRECT_URL,/judytik_migrator/)
  const secrets=['ADMIN_API_KEY','AUTH_ENCRYPTION_KEY','AUTH_BROWSER_SECRET','EMAIL_CODE_PEPPER'].map(key=>vars[key]);assert(secrets.every(v=>/^[A-Za-z0-9_-]{43}$/.test(v)));assert.equal(new Set(secrets).size,4)
  assert.equal(createPrivateKey({key:Buffer.from(vars.AUTH_SIGNING_PRIVATE_KEY,'base64'),format:'der',type:'pkcs8'}).asymmetricKeyType,'ed25519')
  const sql=await readFile(join(dir,'.pg-bootstrap.sql'),'utf8');assert(sql.includes(new URL(vars.DATABASE_URL).password));assert(sql.includes(new URL(db.DIRECT_URL).password));assert(sql.includes('NOBYPASSRLS'))
  if(process.platform!=='win32')for(const name of ['runtime.env','migrate.env','.pg-bootstrap.sql'])assert.equal((await stat(join(dir,name))).mode&0o777,0o600)
  assert(!secrets.some(v=>first.stdout.includes(v)||first.stderr.includes(v)))
  const repeated=generate();assert.notEqual(repeated.status,0);assert.equal(await readFile(join(dir,'runtime.env'),'utf8'),runtime);assert.equal(await readFile(join(dir,'migrate.env'),'utf8'),migration)
 }finally{await rm(dir,{recursive:true,force:true})}
})
test('partial existing environment is never overwritten or completed implicitly',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'judy-deploy-partial-'))
 try{const {writeFile}=await import('node:fs/promises');await writeFile(join(dir,'migrate.env'),'DIRECT_URL=existing\n');const result=spawnSync(process.execPath,[fileURLToPath(script),dir],{encoding:'utf8'});assert.notEqual(result.status,0);assert.equal(await readFile(join(dir,'migrate.env'),'utf8'),'DIRECT_URL=existing\n');await assert.rejects(readFile(join(dir,'runtime.env')))}finally{await rm(dir,{recursive:true,force:true})}
})

test('environment runner uses the selected file, preserves literal secrets and propagates command failure',async()=>{
 const {writeFile}=await import('node:fs/promises'),dir=await mkdtemp(join(tmpdir(),'judy-run-env-')),file=join(dir,'runtime.env'),runner=new URL('../run-with-env.mjs',import.meta.url)
 try{
  await writeFile(file,'JUDY_TEST_LITERAL="value $(ignored) with spaces"\n',{mode:0o600})
  const command="if(process.env.JUDY_TEST_LITERAL!=='value $(ignored) with spaces')process.exit(3);if(!process.cwd().endsWith('server'))process.exit(4);process.exit(7)"
  const result=spawnSync(process.execPath,[fileURLToPath(runner),file,process.execPath,'-e',command],{encoding:'utf8',env:{...process.env,JUDY_TEST_LITERAL:'stale inherited value'}})
  assert.equal(result.status,7,result.stderr);assert.equal(result.stdout,'')
 }finally{await rm(dir,{recursive:true,force:true})}
})
test('production starter refuses migration credentials before importing the server',async()=>{
 const {writeFile}=await import('node:fs/promises'),dir=await mkdtemp(join(tmpdir(),'judy-start-env-')),file=join(dir,'runtime.env')
 try{await writeFile(file,'NODE_ENV=production\nDIRECT_URL=must-not-be-present\n');const result=spawnSync(process.execPath,[fileURLToPath(new URL('../start.mjs',import.meta.url)),file],{encoding:'utf8'});assert.notEqual(result.status,0);assert.match(result.stderr,/Migration credentials/);assert(!result.stderr.includes('must-not-be-present'))}finally{await rm(dir,{recursive:true,force:true})}
})
