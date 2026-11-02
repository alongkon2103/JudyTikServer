// One-time local copy. This script never contacts Tikkies or reads its credentials.
import 'dotenv/config'
import {readFileSync} from 'node:fs'
import {isDeepStrictEqual} from 'node:util'
import {setTimeout as delay} from 'node:timers/promises'
import {pathToFileURL} from 'node:url'

export function readCatalog() {
  const data=JSON.parse(readFileSync(new URL('../data/judy-games-catalog-source.json',import.meta.url),'utf8'))
  if(data.schemaVersion!==1||data.games.length!==19||data.categories.length!==2) throw Error('Unexpected catalog snapshot')
  for(const game of data.games) {
    if(game.metadata?.creatorGroup!=='Judy Games'||game.metadata.source.groupName!=='Judy Games'||!['Roblox','Unity'].includes(game.platform)||game.status!=='published'||game.presets.length!==1) throw Error('Catalog ownership or preset safety check failed')
    const preset=game.presets[0]
    if(preset.format!=='game-event-v1'||!preset.isDefault||preset.status!=='published'||JSON.stringify(JSON.parse(preset.payload.originalActionsJson))!==JSON.stringify(preset.payload.actions)||preset.payload.actions.length!==game.metadata.source.actionCount) throw Error('Original source preset was changed')
  }
  if(new Set(data.games.map(g=>g.slug)).size!==data.games.length) throw Error('Duplicate source game slugs')
  return data
}

export async function importCatalog(data,request) {
  const categories=(await request('GET','/admin/game-categories')).items
  let games=[],page=1
  for(;;page++) {
    const result=await request('GET',`/admin/games?page=${page}&pageSize=100`)
    games.push(...result.items)
    if(page>=result.totalPages) break
  }
  // Check all collisions before creating anything. Existing entries are never overwritten.
  for(const desired of data.categories) {
    const existing=categories.find(c=>c.slug===desired.slug)
    if(existing&&existing.status!=='active') throw Error(`Category ${desired.slug} is archived; review it manually`)
  }
  for(const desired of data.games) {
    const existing=games.find(g=>g.slug===desired.slug)
    if(existing&&existing.metadata?.source?.presetId!==desired.metadata.source.presetId) throw Error(`Game slug ${desired.slug} belongs to another source; no changes made`)
  }
  const existingPresets=new Map()
  for(const desired of data.games) {
    const existing=games.find(g=>g.slug===desired.slug)
    if(!existing) continue
    const result=await request('GET',`/admin/games/${existing.id}/presets?page=1&pageSize=100`)
    existingPresets.set(existing.id,result.items)
    for(const preset of desired.presets) {
      const found=result.items.find(p=>p.slug===preset.slug)
      if(found&&!isDeepStrictEqual(found.payload,preset.payload)) throw Error(`Preset ${desired.slug}/${preset.slug} differs; review manually before import`)
      if(!found&&result.items.some(p=>p.isDefault)) throw Error(`Game ${desired.slug} already has another default; review manually before import`)
    }
  }
  const counts={categoriesCreated:0,gamesCreated:0,gamesSkipped:0,presetsCreated:0,presetsSkipped:0}
  for(const desired of data.categories) if(!categories.some(c=>c.slug===desired.slug)) {
    categories.push(await request('POST','/admin/game-categories',desired));counts.categoriesCreated++
  }
  for(const desired of data.games) {
    let game=games.find(g=>g.slug===desired.slug)
    if(game) counts.gamesSkipped++
    else {
      const {categorySlug,presets,...body}=desired
      const category=categories.find(c=>c.slug===categorySlug)
      if(!category) throw Error(`Missing category ${categorySlug}`)
      game=await request('POST','/admin/games',{...body,categoryId:category.id})
      games.push(game);counts.gamesCreated++
    }
    for(const preset of desired.presets) {
      if((existingPresets.get(game.id)||[]).some(p=>p.slug===preset.slug)) {counts.presetsSkipped++;continue}
      await request('POST',`/admin/games/${game.id}/presets`,preset);counts.presetsCreated++
    }
  }
  return counts
}

export async function requestWithRateLimit(url,options,fetcher=fetch,wait=delay) {
  for(let attempt=0;attempt<3;attempt++) {
    const response=await fetcher(url,{...options,signal:AbortSignal.timeout(15000)})
    if(response.status!==429||attempt===2) return response
    const retryAfter=response.headers.get('retry-after')
    const milliseconds=retryAfter===null?2000:/^\d+(?:\.\d+)?$/.test(retryAfter)?Number(retryAfter)*1000:Date.parse(retryAfter)-Date.now()
    await response.body?.cancel()
    await wait(Math.min(60000,Math.max(0,Number.isFinite(milliseconds)?milliseconds:2000)))
  }
}

async function main() {
  const args=process.argv.slice(2)
  if(args.some(a=>!['--apply','--dry-run'].includes(a))||(args.includes('--apply')&&args.includes('--dry-run'))) throw Error('Use --dry-run (default) or --apply')
  const data=readCatalog()
  if(!args.includes('--apply')) {
    console.log(JSON.stringify({mode:'dry-run',categories:data.categories.map(c=>c.slug),games:data.games.map(g=>({slug:g.slug,status:g.status,category:g.categorySlug})),presets:data.games.reduce((n,g)=>n+g.presets.length,0),actions:data.games.reduce((n,g)=>n+g.metadata.source.actionCount,0),note:'Authoritative Judy Games group only. Original defaults preserved; native Actions import requires a compatibility adapter. No API requests or database writes.'},null,2));return
  }
  const key=process.env.ADMIN_API_KEY
  if(!key) throw Error('Missing JudyTik ADMIN_API_KEY')
  const port=process.env.PORT||'4300'
  if(!/^\d{1,5}$/.test(port)||Number(port)>65535||Number(port)<1) throw Error('Invalid local JudyTik PORT')
  const request=async(method,path,body)=>{
    const response=await requestWithRateLimit(`http://127.0.0.1:${port}/v1${path}`,{method,headers:{authorization:`Bearer ${key}`,...(body?{'content-type':'application/json'}:{})},body:body?JSON.stringify(body):undefined})
    if(!response.ok) throw Error(`JudyTik catalog request failed (${response.status}); existing entries were not overwritten. Re-running safely resumes missing entries.`)
    return response.json()
  }
  console.log(JSON.stringify({mode:'apply',...await importCatalog(data,request)}))
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) main().catch(e=>{console.error(e.message);process.exitCode=1})
