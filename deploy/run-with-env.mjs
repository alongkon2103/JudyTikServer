import {resolve} from 'node:path'
import {readFileSync} from 'node:fs'
import {parseEnv} from 'node:util'
import {spawn} from 'node:child_process'
import {fileURLToPath} from 'node:url'
const [file,command,...args]=process.argv.slice(2)
if(!file||!command){console.error('Usage: node deploy/run-with-env.mjs <env-file> <executable> [arguments...]');process.exit(1)}
const envPath=resolve(file)
try{Object.assign(process.env,parseEnv(readFileSync(envPath,'utf8')))}catch{console.error('Cannot read environment file.');process.exit(1)}
process.env.DOTENV_CONFIG_PATH=envPath
// No shell: environment values and command arguments are never evaluated as code.
const child=spawn(command,args,{cwd:fileURLToPath(new URL('../server/',import.meta.url)),env:process.env,stdio:'inherit',shell:false})
child.on('error',()=>{console.error('Could not start command; use the full executable path.');process.exitCode=1})
child.on('exit',(code,signal)=>{process.exitCode=code??(signal?1:0)})
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>child.kill(signal))
