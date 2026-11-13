import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {randomBytes} from 'node:crypto';
import {embeddedDatabase,type TeamDatabase} from '../server/team/database.js';
import {teamSchema} from '../server/team/schema.js';
import {TeamRepository} from '../server/team/repository.js';
import {seal} from '../server/crypto.js';
import {AppError} from '../server/store.js';
const source=process.env.PLANB_HS029_SRC??process.cwd();
const {TeamOAuth}=await import(pathToFileURL(path.join(source,'server/team/oauth.ts')).href) as typeof import('../server/team/oauth.js');
const {readonlyFetch}=await import(pathToFileURL(path.join(source,'server/connection.ts')).href) as typeof import('../server/connection.js');
let db:TeamDatabase,repo:TeamRepository;const user={uid:'search029',email:'fiction029@example.test'},kinds=['notes','tasks','meetings','calls','emails'];
before(async()=>{db=await embeddedDatabase();await db.exec(teamSchema);repo=new TeamRepository(db);});after(async()=>{await db?.close();});
type Item={id:string;properties:Record<string,unknown>;archived?:boolean};
const activity=(id:string,creation='2026-10-29T10:00:00Z',at:unknown=creation):Item=>({id,properties:{hs_createdate:creation,hs_timestamp:at,hs_note_body:'<p>FICTION029</p>',hs_task_subject:'Fiction task',hs_task_body:'Fiction body'}});
async function setup(counts:Record<string,number>={notes:3},owner=false){
  const space=await repo.createSpace(user,'Search029 fixture'),key=randomBytes(32),calls:{path:string;method:string;body:any;signal:AbortSignal;auth:string|null}[]=[];
  const associations=Object.fromEntries(kinds.map((kind,i)=>[kind,{results:Array.from({length:counts[kind]??0},(_,n)=>({id:String(1000+i*100+n)}))}]));
  const index=Object.fromEntries(kinds.map((kind,i)=>[kind,[activity(String(1099+i*100),'2026-10-29T12:00:00Z'),activity(String(1098+i*100),'2026-10-29T11:00:00Z')]]));
  let respond:((call:typeof calls[number])=>Promise<Response|undefined>)|undefined;
  const fetcher:typeof fetch=async(input,init)=>{const url=new URL(String(input));assert.equal(url.origin,'https://api.hubapi.com');assert.equal(init?.redirect,'error');const call={path:url.pathname,method:init?.method??'GET',body:init?.body?JSON.parse(String(init.body)):null,signal:init?.signal as AbortSignal,auth:new Headers(init?.headers).get('authorization')};calls.push(call);const override=await respond?.(call);if(override)return override;
    if(url.pathname==='/crm/v3/objects/contacts/42')return Response.json({id:'42',properties:owner?{hubspot_owner_id:'7'}:{},associations});
    if(url.pathname==='/crm/v3/owners/7')return Response.json({id:'7',firstName:'Fiction',lastName:'Owner'});
    const search=/^\/crm\/objects\/2026-09\/(notes|tasks|meetings|calls|emails)\/search$/.exec(url.pathname);
    if(search){assert.equal(call.method,'POST');const rows=index[search[1]].slice(0,call.body.limit);return Response.json({results:rows,total:index[search[1]].length,paging:{next:{after:'never-follow029',link:'https://outside.invalid/NEVER'}}});}
    // Old code can complete its legitimate old GETs. Baseline failures must reach the behavior assertion.
    const old=/^\/crm\/v3\/objects\/(notes|tasks|meetings|calls|emails)\/([^/]+)$/.exec(url.pathname);assert.ok(old,'Unexpected fixture request');assert.equal(call.method,'GET');return Response.json(activity(old[2],'2020-01-01T00:00:00Z'));
  };
  await repo.system(space.id,sql=>sql.query('INSERT INTO team_connections VALUES($1,$2,$3,$4,$5,$6,$7)',[space.id,'123','DEVELOPER_TEST','readonly',seal(JSON.stringify({kind:'private',access_token:'synthetic-search029-token',scopes:owner?['crm.objects.owners.read']:[]}),key),'2026-10-29','2099-01-01']));
  const oauth=new TeamOAuth(repo,null,fetcher,key);return {space,calls,index,associations,on:(fn:NonNullable<typeof respond>)=>{respond=fn;},read:(options={})=>oauth.context(space.id,'42',{accountId:'123',mode:'test'},options),readContact:(id:string)=>oauth.context(space.id,id,{accountId:'123',mode:'test'})};
}
const bad=(error:unknown)=>error instanceof AppError&&error.status===502&&/válida/.test(error.message);

test('search029 causal: a newer indexed activity outside the first association IDs is selected',async()=>{
  const s=await setup(),result=await s.read();assert.deepEqual(result.timeline.map(r=>r.id),['1099','1098']);assert.ok(!result.timeline.some(r=>r.id==='1000'));assert.equal(result.partial,true);assert.match(result.description,/creación.*índice/);assert.match(result.description,/búsqueda vacía no demuestra ausencia/);assert.ok(!JSON.stringify(result).includes('synthetic-search029-token'));
});
test('search029 causal: exact contact filter, creation sort, properties and quota travel in one POST',async()=>{
  const s=await setup({notes:3}),result=await s.read(),searches=s.calls.filter(c=>c.method==='POST');assert.equal(searches.length,1);assert.deepEqual(searches[0].body,{filterGroups:[{filters:[{propertyName:'associations.contact',operator:'EQ',value:'42'}]}],sorts:['-hs_createdate'],properties:['hs_createdate','hs_note_body','hs_timestamp'],limit:2});assert.equal(searches[0].path,'/crm/objects/2026-09/notes/search');assert.equal(s.calls.length,2);assert.equal(result.timeline[0].body,'FICTION029');assert.ok(s.calls.every(c=>c.auth==='Bearer synthetic-search029-token'));
});
test('search029 diverse quotas allocate 2/2/2/1/1 and preserve all five types in eight objects with owner outside quota',async()=>{
  const s=await setup(Object.fromEntries(kinds.map(k=>[k,5])),true),result=await s.read();assert.equal(result.timeline.length,8);assert.deepEqual(s.calls.filter(c=>c.method==='POST').map(c=>[c.path.split('/')[4],c.body.limit]),[['notes',2],['tasks',2],['meetings',2],['calls',1],['emails',1]]);assert.equal(s.calls.length,7);assert.equal(result.owner?.name,'Fiction Owner');assert.deepEqual([...new Set(result.timeline.map(r=>r.kind))].sort(),[...kinds].sort());
});
test('search029 sparse or empty index never reallocates slots, follows paging or proves empty history',async()=>{
  const s=await setup(Object.fromEntries(kinds.map(k=>[k,3])));s.index.notes=[];s.index.tasks=[];s.index.meetings=[];const result=await s.read();assert.equal(result.timeline.length,2);assert.equal(s.calls.length,6);assert.equal(s.calls.filter(c=>c.method==='POST').length,5);assert.ok(s.calls.every(c=>!c.path.includes('never-follow029')));assert.match(result.description,/indexación puede demorarse/);
  const empty=await setup({}),none=await empty.read();assert.deepEqual(none.timeline,[]);assert.equal(empty.calls.length,1);assert.equal(none.partial,true);
});
test('search029 causal: search404 is fatal and never becomes an omitted individual activity',async()=>{
  const s=await setup();s.on(async c=>c.path.includes('/notes/')?new Response('not-json',{status:404}):undefined);await assert.rejects(s.read(),e=>e instanceof AppError&&e.status===502);assert.equal(s.calls.length,2);
});
test('search029 rejects malformed arrays, excess rows, duplicate identities, invalid properties and creation order',async()=>{
  for(const payload of [null,[],42,{}, {results:null},{results:{}},{results:[null]}, {results:[{id:'',properties:{}}]}, {results:[{id:3,properties:{}}]}, {results:[{id:' bad ',properties:{}}]}, {results:[{id:'a',properties:[]}]}, {results:[{id:'a',properties:{}}]}, {results:[activity('a','impossible')]}, {results:[{...activity('a'),archived:true}]}, {results:[activity('a'),activity('a')]}, {results:[activity('a'),activity('b'),activity('c')]}, {results:[activity('a','2020-01-01T00:00:00Z'),activity('b','2026-01-01T00:00:00Z')]}, {results:[{id:'a',properties:{hs_createdate:'2026-01-01T00:00:00Z',hs_note_body:{private:'NEVER'}}}]}, {results:[],total:-1}, {results:[activity('a')],total:0}]){
    const s=await setup();s.on(async c=>c.method==='POST'?Response.json(payload):undefined);await assert.rejects(s.read(),bad,JSON.stringify(payload));assert.equal(s.calls.length,2);
  }
});
test('search029 equal IDs across types and equal creation dates remain valid; activity timestamp keeps its meaning',async()=>{
  const s=await setup({notes:2,tasks:1});s.index.notes=[activity('same','2026-01-01T00:00:00Z','2026-10-29T10:00:00Z'),activity('other','2026-01-01T00:00:00Z',null)];s.index.tasks=[activity('same','2026-01-01T00:00:00Z','2027-01-01T09:00:00Z')];const r=await s.read();assert.equal(r.timeline.length,3);assert.equal(r.timeline[0].kind,'tasks');assert.equal(r.timeline[0].at,'2027-01-01T09:00:00.000Z');assert.equal(r.timeline[2].at,null);assert.match(r.description,/vencimiento de tarea/);
});
test('search029 rejects malformed observed associations before it sends any search',async()=>{
  for(const associations of [null,[],{notes:null},{notes:{results:'not-array'}},{notes:{results:[{id:null}]}},{notes:{results:[{id:'7'},{id:'7'}]}}]){const s=await setup();s.on(async c=>c.path.includes('/contacts/')?Response.json({id:'42',properties:{},associations}):undefined);await assert.rejects(s.read(),bad);assert.equal(s.calls.length,1);}
});
test('search029 query and body retain the same deadline/identity on a single429 retry, maximum fourteen attempts',async()=>{
  const s=await setup(Object.fromEntries(kinds.map(k=>[k,3])),true),seen=new Map<string,typeof s.calls[number]>();s.on(async c=>{const prior=seen.get(c.path);if(!prior){seen.set(c.path,c);return new Response('',{status:429,headers:{'Retry-After':'0'}});}assert.equal(c.signal,prior.signal);assert.deepEqual(c.body,prior.body);return undefined;});const result=await s.read();assert.equal(result.timeline.length,8);assert.equal(s.calls.length,14);assert.equal(seen.size,7);
});
test('search029 disconnect during POST response or JSON prevents later requests and returned content',async()=>{
  for(const phase of ['response','json']){const s=await setup({notes:2,tasks:2});s.on(async c=>{if(c.method!=='POST')return;const res=Response.json({results:[activity('new')],total:1});if(phase==='response')await repo.disconnectHubspot(s.space.id,user);else res.json=async()=>{await repo.disconnectHubspot(s.space.id,user);return {results:[activity('new')],total:1};};return res;});await assert.rejects(s.read(),e=>e instanceof AppError&&e.status===409);assert.equal(s.calls.length,2);}
});
test('search029 cancellation during JSON discards a valid late response even when transport ignores abort',async()=>{
  const s=await setup({notes:2,tasks:2}),controller=new AbortController();let release!:(data:any)=>void,entered!:()=>void;const body=new Promise(resolve=>release=resolve),ready=new Promise<void>(resolve=>entered=resolve);s.on(async c=>{if(c.method!=='POST')return;const r=Response.json({});r.json=()=>{entered();return body as Promise<any>;};return r;});const result=assert.rejects(s.read({signal:controller.signal}),e=>e instanceof AppError&&e.status===409);await ready;controller.abort();await result;release({results:[activity('late')],total:1});await new Promise<void>(r=>setImmediate(r));assert.equal(s.calls.length,2);assert.equal(s.calls[1].signal.aborted,true);
});
test('search029 read allowlist admits only the four new2026activity search paths and retains older allowed reads',async()=>{
  let calls=0;const read=readonlyFetch(async()=>{calls++;return Response.json({});});for(const kind of kinds)await read('https://api.hubapi.com/crm/objects/2026-09/'+kind+'/search',{method:'POST'});assert.equal(calls,5);
  for(const url of ['https://api.hubapi.com/crm/v3/objects/notes/search','https://api.hubapi.com/crm/objects/2026-09/notes','https://api.hubapi.com/crm/objects/2026-09/notes/batch/create','https://api.hubapi.com/crm/objects/2026-09/notes/search/extra','https://api.hubapi.com/crm/objects/2026-08/notes/search','https://outside.invalid/crm/objects/2026-09/notes/search','http://api.hubapi.com/crm/objects/2026-09/notes/search'])await assert.rejects(read(url,{method:'POST'}),e=>e instanceof AppError&&e.status===403);
  await assert.rejects(read('https://api.hubapi.com/crm/objects/2026-09/notes/search',{method:'PATCH'}),e=>e instanceof AppError&&e.status===403);assert.equal(calls,5);await read('https://api.hubapi.com/crm/v3/objects/contacts/search',{method:'POST'});assert.equal(calls,6);
});
test('search029 contact identifiers are bounded before network and unrequested properties never supply another activity type content',async()=>{
  const s=await setup({notes:1});for(const id of ['a','42/notes','42?portal=other','9'.repeat(101),''])await assert.rejects(s.readContact(id),e=>e instanceof AppError&&e.status===422);assert.equal(s.calls.length,0);
  s.index.notes=[{id:'7',properties:{hs_createdate:'2026-10-29T10:00:00Z',hs_email_text:'UNREQUESTED_PRIVATE_FIELD',hs_task_subject:'WRONG_KIND_TITLE'}}];const result=await s.read();assert.equal(result.timeline[0].title,'Nota');assert.equal(result.timeline[0].body,'');assert.ok(!JSON.stringify(result).includes('UNREQUESTED_PRIVATE_FIELD'));
});
