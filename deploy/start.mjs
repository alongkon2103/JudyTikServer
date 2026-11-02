import {resolve} from 'node:path'
import {readFileSync} from 'node:fs'
import {parseEnv} from 'node:util'
import {fileURLToPath} from 'node:url'
const file=process.argv[2]
if(!file){console.error('Usage: node deploy/start.mjs <runtime.env>');process.exit(1)}
const envPath=resolve(file)
try{Object.assign(process.env,parseEnv(readFileSync(envPath,'utf8')))}catch{console.error('Cannot read runtime environment; check service account permissions.');process.exit(1)}
if(process.env.DIRECT_URL){console.error('Migration credentials must not be present in the runtime environment.');process.exit(1)}
if(process.env.NODE_ENV!=='production'){console.error('Runtime requires NODE_ENV=production.');process.exit(1)}
process.env.DOTENV_CONFIG_PATH=envPath
process.chdir(fileURLToPath(new URL('../server/',import.meta.url)))
await import('../server/dist/main.js')
