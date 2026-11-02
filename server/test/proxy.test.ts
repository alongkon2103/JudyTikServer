import {test} from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import type {AddressInfo} from 'node:net'
import {configureApp} from '../src/http/configure.js'
async function harness(trustProxy:false|'loopback'){
 const http=express()
 configureApp({set:http.set.bind(http),setGlobalPrefix(){},use:http.use.bind(http),useBodyParser(){},useGlobalFilters(){}} as any,trustProxy)
 http.get('/v1/proxy-probe',(req,res)=>res.json({ip:req.ip,secure:req.secure}))
 const server=await new Promise<ReturnType<typeof http.listen>>(resolve=>{const s=http.listen(0,'127.0.0.1',()=>resolve(s))})
 return {origin:'http://127.0.0.1:'+(server.address() as AddressInfo).port,close:()=>new Promise<void>((resolve,reject)=>server.close(e=>e?reject(e):resolve()))}
}
test('direct mode ignores forged forwarded IP and protocol headers',async()=>{
 const app=await harness(false)
 try{const response=await fetch(app.origin+'/v1/proxy-probe',{headers:{'x-forwarded-for':'203.0.113.9','x-forwarded-proto':'https'}});assert.deepEqual(await response.json(),{ip:'127.0.0.1',secure:false})}finally{await app.close()}
})
test('loopback proxy separates real client rate buckets and ignores a forged leftmost IP',async()=>{
 const app=await harness('loopback')
 try{
  const request=(forwarded:string)=>fetch(app.origin+'/v1/proxy-probe',{headers:{'x-forwarded-for':forwarded,'x-forwarded-proto':'https'}})
  for(let n=0;n<120;n++){
   const response=await request(`203.0.113.${n+1}, 198.51.100.7`)
   assert.equal(response.status,200)
   if(n===0)assert.deepEqual(await response.json(),{ip:'198.51.100.7',secure:true})
  }
  const blocked=await request('192.0.2.99, 198.51.100.7');assert.equal(blocked.status,429)
  const other=await request('198.51.100.8');assert.equal(other.status,200)
 }finally{await app.close()}
})
