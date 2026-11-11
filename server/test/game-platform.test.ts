import {test} from 'node:test';import assert from 'node:assert/strict';import {GamesService} from '../src/games/service.js';
const category={id:'77777777-7777-4777-8777-777777777777',slug:'roblox',name:'Roblox',status:'active'};
test('new imports normalize platform and choose the existing platform category',async()=>{
 let created:any;
 const tx:any={gameCategory:{findMany:async()=>[category],findUnique:async()=>category},game:{create:async({data}:any)=>{created=data;return{...data,revision:1n}}},gameCover:{create:async()=>{}},gamePreset:{create:async({data}:any)=>({...data,id:'preset',version:1,revision:1n})},gamePresetVersion:{create:async()=>{}},auditEvent:{create:async()=>{}},$queryRaw:async()=>[]};
 const db:any={client:{$transaction:async(fn:any)=>fn(tx)}};const service=new GamesService(db,{} as any,{} as any);
 await service.importFile({slug:'new-game',name:'Game',platform:'roblox',categoryId:null,description:'',status:'draft'},{schemaVersion:1,name:'Native',actions:[]} as any,Buffer.from('cover'),'https://api.example.com','request');
 assert.equal(created.platform,'Roblox');assert.equal(created.categoryId,category.id)
});
