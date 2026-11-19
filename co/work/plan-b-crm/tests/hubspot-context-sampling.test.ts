import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {embeddedDatabase,type TeamDatabase} from '../server/team/database.js';
import {teamSchema} from '../server/team/schema.js';
import {TeamRepository} from '../server/team/repository.js';
import {TeamOAuth} from '../server/team/oauth.js';
import {seal} from '../server/crypto.js';
import {AppError} from '../server/store.js';
let db:TeamDatabase,repo:TeamRepository;
const user={uid:'sampling-contract',email:'sampling@example.test'};
const kinds=['notes','tasks','meetings','calls','emails'];
before(async()=>{db=await embeddedDatabase();await db.exec(teamSchema);repo=new TeamRepository(db);});
after(async()=>{await db?.close();});
async function setup(counts:Record<string,number>,owners=false){
  const space=await repo.createSpace(user,'Sampling contract'),key=randomBytes(32),paths:string[]=[],associations=Object.fromEntries(kinds.map(kind=>[kind,{results:Array.from({length:counts[kind]??0},(_,index)=>({id:kind+'-'+index}))}]));
  let onRead:undefined|((path:string)=>Promise<void>);
  const fetcher:typeof fetch=async(input,init)=>{
    const url=new URL(String(input));assert.equal(url.origin,'https://api.hubapi.com');assert.equal(init?.method??'GET',url.pathname.endsWith('/search')?'POST':'GET');assert.equal(init?.redirect,'error');paths.push(url.pathname);await onRead?.(url.pathname);
    if(url.pathname==='/crm/v3/objects/contacts/42')return Response.json({id:'42',properties:owners?{hubspot_owner_id:'7'}:{},associations});
    if(url.pathname==='/crm/v3/owners/7')return Response.json({id:'7',firstName:'Contract',lastName:'Owner'});
    const [,kind]=/^\/crm\/objects\/2026-09\/([^/]+)\/search$/.exec(url.pathname)??[];assert.ok(kinds.includes(kind));const body=JSON.parse(String(init?.body));assert.deepEqual(body.filterGroups,[{filters:[{propertyName:'associations.contact',operator:'EQ',value:'42'}]}]);assert.deepEqual(body.sorts,['-hs_createdate']);assert.ok(body.limit===1||body.limit===2);
    return Response.json({results:associations[kind].results.slice(0,body.limit).map(({id},index)=>({id,properties:{hs_createdate:'2026-10-'+(index===0?'29':'28')+'T10:00:00Z',hs_timestamp:'2026-10-'+(index===0?'20':'21')+'T10:00:00Z',hs_note_body:'<p>note</p>',hs_task_subject:'Task',hs_task_body:'task',hs_meeting_title:'Meeting',hs_meeting_body:'meeting',hs_call_title:'Call',hs_call_body:'call',hs_email_subject:'Email',hs_email_text:'email'}}))});
  };
  await repo.system(space.id,sql=>sql.query('INSERT INTO team_connections VALUES($1,$2,$3,$4,$5,$6,$7)',[space.id,'123','DEVELOPER_TEST','readonly',seal(JSON.stringify({kind:'private',access_token:'synthetic-sampling-token',scopes:owners?['crm.objects.owners.read']:[]}),key),'2026-10-29','2099-01-01']));
  return {space,paths,read:()=>new TeamOAuth(repo,null,fetcher,key).context(space.id,'42',{accountId:'123',mode:'test'}),during:(fn:(path:string)=>Promise<void>)=>{onRead=fn;}};
}
const detailPaths=(paths:string[])=>paths.filter(path=>!path.includes('/contacts/')&&!path.includes('/owners/'));
test('muestra: cinco tipos saturados aparecen dentro del presupuesto de ocho detalles',async()=>{
  const s=await setup(Object.fromEntries(kinds.map(kind=>[kind,3]))),result=await s.read();
  assert.equal(result.timeline.length,8);assert.deepEqual([...new Set(result.timeline.map(item=>item.kind))].sort(),[...kinds].sort());
  const details=detailPaths(s.paths);assert.equal(details.length,5);assert.deepEqual(details.map(path=>path.split('/')[4]),kinds);
  for(const kind of kinds)assert.ok(result.timeline.filter(item=>item.kind===kind).length<=2);
  assert.ok(result.timeline.every(item=>!item.id.endsWith('-2')));assert.match(result.description,/No garantiza la última interacción/);assert.equal(result.partial,true);
});
test('muestra: tipos vacíos no malgastan cupo y la segunda vuelta completa hasta ocho',async()=>{
  const s=await setup({notes:4,tasks:4,calls:4,emails:4}),result=await s.read();assert.equal(result.timeline.length,8);assert.equal(detailPaths(s.paths).length,4);
  for(const kind of ['notes','tasks','calls','emails'])assert.equal(result.timeline.filter(item=>item.kind===kind).length,2);assert.ok(!result.timeline.some(item=>item.kind==='meetings'));
});
test('muestra: un único tipo conserva máximo dos y la ausencia de actividades no añade llamadas',async()=>{
  const single=await setup({emails:6}),result=await single.read();assert.equal(result.timeline.length,2);assert.ok(result.timeline.every(item=>item.kind==='emails'));assert.equal(single.paths.length,2);
  const empty=await setup({}),none=await empty.read();assert.deepEqual(none.timeline,[]);assert.equal(empty.paths.length,1);
});
test('muestra: propietario queda fuera del presupuesto de detalles y se ordenan solo los seleccionados',async()=>{
  const s=await setup(Object.fromEntries(kinds.map(kind=>[kind,3])),true),result=await s.read();assert.equal(detailPaths(s.paths).length,5);assert.equal(s.paths.length,7);assert.equal(result.owner?.name,'Contract Owner');assert.equal(result.ownerPermission,true);
  assert.deepEqual(result.timeline.map(item=>item.at),[...result.timeline].map(item=>item.at).sort((a,b)=>(b??'').localeCompare(a??'')));assert.ok(result.timeline.every(item=>!item.id.endsWith('-2')));
});
test('muestra: cambiar conexión durante la primera vuelta detiene la lectura y descarta datos',async()=>{
  const s=await setup(Object.fromEntries(kinds.map(kind=>[kind,3])));s.during(async path=>{if(path.endsWith('/notes/search'))await repo.disconnectHubspot(s.space.id,user);});
  await assert.rejects(s.read(),error=>error instanceof AppError&&error.status===409);assert.equal(detailPaths(s.paths).length,1);
});
