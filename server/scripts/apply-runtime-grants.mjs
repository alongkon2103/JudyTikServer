import 'dotenv/config'
import {Client} from 'pg'
import {readFile} from 'node:fs/promises'
async function main(){
 const direct=process.env.DIRECT_URL,runtime=process.env.DATABASE_URL
 if(!direct||!runtime)throw Error('DIRECT_URL and DATABASE_URL must be configured in server/.env')
 const role=process.env.RUNTIME_DB_ROLE||decodeURIComponent(new URL(runtime).username)
 if(!/^[A-Za-z_][A-Za-z0-9_]{0,62}$/.test(role))throw Error('Set RUNTIME_DB_ROLE to the actual PostgreSQL runtime role name')
 const client=new Client({connectionString:direct})
 try{
  await client.connect()
  const result=await client.query(`SELECT r.rolname,r.rolsuper OR r.rolbypassrls OR r.rolname=current_user OR EXISTS(SELECT 1 FROM pg_namespace n WHERE n.nspname='judytik' AND pg_has_role(r.rolname,n.nspowner,'MEMBER')) OR EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='judytik' AND pg_has_role(r.rolname,c.relowner,'MEMBER')) AS unsafe FROM pg_roles r WHERE r.rolname=$1`,[role])
  if(!result.rows.length||result.rows[0].unsafe)throw Error('RUNTIME_DB_ROLE must be an existing restricted runtime role, separate from the migration owner')
  const sql=(await readFile(new URL('../prisma/runtime-grants.sql',import.meta.url),'utf8')).replaceAll(':"runtime_role"','"'+role+'"')
  await client.query('BEGIN');await client.query(sql);await client.query('COMMIT')
  console.log('Applied application runtime grants for '+role)
 }finally{await client.end()}
}
main().catch(error=>{console.error(error.code?'Database grants failed: '+error.code:error.message);process.exitCode=1})
