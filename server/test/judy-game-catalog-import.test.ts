import assert from 'node:assert/strict'
import {test} from 'node:test'
// @ts-expect-error One-time importer is a standalone JavaScript tool.
import {readCatalog,importCatalog,requestWithRateLimit} from '../scripts/import-judy-game-catalog.mjs'

test('Judy source import preserves all originals and safely repeats',async()=>{
 const data=readCatalog(),categories:any[]=[],games:any[]=[],presets=new Map<string,any[]>(),writes:string[]=[]
 const request=async(method:string,path:string,body:any)=>{
  const presetPath=path.match(/^\/admin\/games\/([^/]+)\/presets/)
  if(method==='GET') return presetPath?{items:presets.get(presetPath[1])||[]}:path.includes('game-categories')?{items:categories}:{items:games,totalPages:1}
  writes.push(path)
  const row={...body,id:String(writes.length)}
  if(presetPath) presets.set(presetPath[1],[...(presets.get(presetPath[1])||[]),row])
  else if(path.includes('game-categories')) categories.push(row);else games.push(row)
  return row
 }
 assert.deepEqual(await importCatalog(data,request),{categoriesCreated:2,gamesCreated:19,gamesSkipped:0,presetsCreated:19,presetsSkipped:0})
 assert(games.every(g=>g.status==='published'&&!('presets' in g)))
 assert.equal([...presets.values()].flat().reduce((n,p)=>n+p.payload.actions.length,0),239)
 assert.deepEqual(await importCatalog(data,request),{categoriesCreated:0,gamesCreated:0,gamesSkipped:19,presetsCreated:0,presetsSkipped:19})
 assert.equal(writes.length,40)
})

test('Judy source import refuses unrelated slug collisions before writing',async()=>{
 let writes=0
 const data=readCatalog()
 await assert.rejects(()=>importCatalog(data,async(method:string,path:string)=>{
  if(method!=='GET') {writes++;return {}}
  return path.includes('game-categories')?{items:[]}:{items:[{slug:data.games[0].slug,metadata:{source:{presetId:'other'}}}],totalPages:1}
 }),/another source/)
 assert.equal(writes,0)
})


test('importer retries only 429 with bounded Retry-After waits',async()=>{
 const waits:number[]=[],responses=[new Response('',{status:429,headers:{'retry-after':'1'}}),new Response('',{status:429}),new Response('{}',{status:200})]
 let attempts=0
 const result=await requestWithRateLimit('http://127.0.0.1/test',{},async()=>responses[attempts++],async(ms:number)=>{waits.push(ms)})
 assert.equal(result.status,200)
 assert.equal(attempts,3)
 assert.deepEqual(waits,[1000,2000])
})

test('importer caps 429 retries and delay without retrying server errors',async()=>{
 let attempts=0
 const waits:number[]=[]
 const result=await requestWithRateLimit('http://127.0.0.1/test',{},async()=>{attempts++;return new Response('',{status:429,headers:{'retry-after':'999'}})},async(ms:number)=>{waits.push(ms)})
 assert.equal(result.status,429)
 assert.equal(attempts,3)
 assert.deepEqual(waits,[60000,60000])
 attempts=0
 const error=await requestWithRateLimit('http://127.0.0.1/test',{},async()=>{attempts++;return new Response('',{status:500})},async()=>assert.fail('unexpected wait'))
 assert.equal(error.status,500)
 assert.equal(attempts,1)
})
