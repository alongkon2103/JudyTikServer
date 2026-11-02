import { configureApp } from '../src/http/configure.js'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { historyQuery,historyCursor } from '../src/history/contracts.js'
test('history query accepts bounded filters and round trips cursor identity',()=>{
 const id='00000000-0000-4000-8000-000000000001',at='2026-11-01T10:00:00.000Z'
 assert.deepEqual(historyQuery({range:'7',query:' Creator ',cursor:historyCursor(at,id)}),{range:'7',query:'creator',limit:50,cursor:{at,id}})
 assert.deepEqual(historyQuery({}),{range:'all',query:'',limit:50,cursor:undefined})
})
test('history query rejects control characters before a database statement',()=>{
 for(const query of ['\u0000','\n','x\u0085']) assert.throws(()=>historyQuery({query}),{code:'INVALID_REQUEST'})
})

test('API filter recognizes only the known malformed-JSON SyntaxError shape',()=>{
 let filter:any
 configureApp({set(){},setGlobalPrefix(){},use(){},useBodyParser(){},useGlobalFilters(value:any){filter=value}} as any)
 const statusFor=(error:unknown)=>{
  let status=0
  filter.catch(error,{switchToHttp:()=>({getRequest:()=>({headers:{}}),getResponse:()=>({status(value:number){status=value;return this},json(){}})})})
  return status
 }
 assert.equal(statusFor(Object.assign(new SyntaxError('invalid JSON'),{status:400,type:'entity.parse.failed'})),400)
 assert.equal(statusFor({status:400,type:'entity.parse.failed'}),500)
 assert.equal(statusFor(Object.assign(new SyntaxError('other error'),{status:400,type:'unrelated'})),500)
})
