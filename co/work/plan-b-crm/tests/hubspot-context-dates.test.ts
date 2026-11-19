import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {embeddedDatabase,type TeamDatabase} from '../server/team/database.js';
import {teamSchema} from '../server/team/schema.js';
import {TeamRepository} from '../server/team/repository.js';
import {TeamOAuth} from '../server/team/oauth.js';
import {seal} from '../server/crypto.js';

let db:TeamDatabase,repo:TeamRepository;
const user={uid:'activity-dates',email:'dates@example.test'};
type Entry={kind:string;id:string;at:unknown};
before(async()=>{db=await embeddedDatabase();await db.exec(teamSchema);repo=new TeamRepository(db);});
after(async()=>{await db?.close();});
async function read(entries:Entry[]){
  const space=await repo.createSpace(user,'Activity dates'),key=randomBytes(32),paths:string[]=[];
  const associations=Object.fromEntries(['notes','tasks','meetings','calls','emails'].map(kind=>[kind,{results:entries.filter(e=>e.kind===kind).map(e=>({id:e.id}))}]));
  const fetcher:typeof fetch=async(input,init)=>{
    const url=new URL(String(input));assert.equal(url.origin,'https://api.hubapi.com');assert.equal(init?.method??'GET',url.pathname.endsWith('/search')?'POST':'GET');assert.equal(init?.redirect,'error');paths.push(url.pathname);
    if(url.pathname==='/crm/v3/objects/contacts/42')return Response.json({id:'42',properties:{},associations});
    const kind=kindsFromPath(url.pathname),body=JSON.parse(String(init?.body));assert.ok(kind,'only the five activity searches may be read');assert.deepEqual(body.sorts,['-hs_createdate']);
    return Response.json({results:entries.filter(e=>e.kind===kind).slice(0,body.limit).map(entry=>({id:entry.id,properties:{hs_createdate:'2026-10-29T12:00:00Z',hs_timestamp:entry.at,hs_task_subject:'Task',hs_note_body:'Note'}}))});
  };
  await repo.system(space.id,sql=>sql.query('INSERT INTO team_connections VALUES($1,$2,$3,$4,$5,$6,$7)',[space.id,'123','DEVELOPER_TEST','readonly',seal(JSON.stringify({kind:'private',access_token:'synthetic-date-token',scopes:[]}),key),'2026-10-29','2099-01-01']));
  return {result:await new TeamOAuth(repo,null,fetcher,key).context(space.id,'42',{accountId:'123',mode:'test'}),paths};
}
const kindsFromPath=(value:string)=>/^\/crm\/objects\/2026-09\/(notes|tasks|meetings|calls|emails)\/search$/.exec(value)?.[1];

test('fechas: offsets se ordenan por instante aunque su texto invierta el orden',async()=>{
  const {result,paths}=await read([{kind:'notes',id:'later',at:'2026-10-29T08:30:00-03:00'},{kind:'notes',id:'earlier',at:'2026-10-29T12:00:00+02:00'}]);
  assert.deepEqual(result.timeline.map(e=>e.id),['later','earlier']);
  assert.deepEqual(result.timeline.map(e=>e.at),['2026-10-29T11:30:00.000Z','2026-10-29T10:00:00.000Z']);assert.equal(paths.length,2);
});
test('fechas: Unix milisegundos numéricos o texto conservan el mismo instante que ISO',async()=>{
  const {result}=await read([{kind:'notes',id:'number',at:1793275200000},{kind:'tasks',id:'text',at:'1793275200000'},{kind:'calls',id:'iso',at:'2026-10-29T12:00:00Z'}]);
  assert.deepEqual(result.timeline.map(e=>e.at),Array(3).fill('2026-10-29T12:00:00.000Z'));assert.deepEqual(result.timeline.map(e=>e.id),['number','text','iso']);
});
test('fechas: valores imposibles, sin zona o de tipo inesperado pasan a desconocido',async()=>{
  const invalid:unknown[]=['2026-02-30T12:00:00Z','2025-02-29T12:00:00Z','2026-13-01T12:00:00Z','2026-10-29T24:00:00Z','2026-10-29T12:00:00','2026-10-29','yesterday','1e12','8640000000000001',9007199254740992,1793275200000.5,true,{},[],null,''];
  for(const at of invalid){const {result}=await read([{kind:'notes',id:'bad',at},{kind:'notes',id:'valid',at:'2026-10-29T12:00:00Z'}]);assert.deepEqual(result.timeline.map(e=>[e.id,e.at]),[['valid','2026-10-29T12:00:00.000Z'],['bad',null]],JSON.stringify(at));}
});
test('fechas: empate y desconocidos conservan orden de selección entre tipos',async()=>{
  const {result}=await read([{kind:'notes',id:'note',at:'2026-10-29T12:00:00Z'},{kind:'tasks',id:'task',at:'2026-10-29T13:00:00+01:00'},{kind:'meetings',id:'missing1',at:null},{kind:'calls',id:'missing2',at:'invalid'}]);
  assert.deepEqual(result.timeline.map(e=>e.id),['note','task','missing1','missing2']);assert.deepEqual(result.timeline.slice(2).map(e=>e.at),[null,null]);
});
test('fechas: año bisiesto, fracciones, epoch y fechas anteriores a epoch son válidos',async()=>{
  for(const [at,expected] of [['2024-02-29T23:59:59.1Z','2024-02-29T23:59:59.100Z'],['2026-10-29T12:00:00.123+02:30','2026-10-29T09:30:00.123Z'],[0,'1970-01-01T00:00:00.000Z'],['-1','1969-12-31T23:59:59.999Z']] as const){const {result}=await read([{kind:'notes',id:'valid',at}]);assert.equal(result.timeline[0].at,expected);}
});
test('fechas: vencimiento futuro sigue siendo tarea y no amplía la muestra ni promete recencia',async()=>{
  const {result,paths}=await read([{kind:'tasks',id:'due',at:'2027-01-01T09:00:00Z'},{kind:'notes',id:'first',at:'2026-10-29T12:00:00Z'},{kind:'notes',id:'second',at:'2026-10-28T12:00:00Z'},{kind:'notes',id:'not-selected',at:'2027-02-01T12:00:00Z'}]);
  assert.equal(result.timeline[0].kind,'tasks');assert.equal(result.timeline[0].id,'due');assert.ok(result.timeline.every(e=>e.id!=='not-selected'));assert.equal(paths.length,3);assert.equal(result.partial,true);assert.match(result.description,/No garantiza la última interacción/);
});
