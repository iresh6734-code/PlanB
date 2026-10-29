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
const user={uid:'partial-contract',email:'partial@example.test'};
before(async()=>{db=await embeddedDatabase();await db.exec(teamSchema);repo=new TeamRepository(db);});
after(async()=>{await db?.close();});
async function setup({owner=true,activity=true}={}){
  const space=await repo.createSpace(user,'Partial context contract'),key=randomBytes(32),paths:string[]=[];let override:undefined|((path:string)=>Promise<Response|undefined>);
  const fetcher:typeof fetch=async(input,init)=>{
    const path=new URL(String(input)).pathname;assert.equal(new URL(String(input)).origin,'https://api.hubapi.com');assert.equal(init?.method??'GET','GET');assert.equal(init?.redirect,'error');paths.push(path);const response=await override?.(path);if(response)return response;
    if(path.includes('/contacts/'))return Response.json({id:'42',properties:owner?{hubspot_owner_id:'7'}:{},associations:activity?{notes:{results:[{id:'note-gone'},{id:'note-kept'}]},emails:{results:[{id:'email-kept'}]}}:{}});
    if(path.includes('/owners/'))return Response.json({id:'7',firstName:'Contract',lastName:'Owner'});
    return Response.json({id:path.split('/').at(-1),properties:{hs_note_body:'DETAIL_KEPT',hs_email_subject:'Email',hs_email_text:'DETAIL_KEPT',hs_timestamp:'2026-10-29T08:00:00Z'}});
  };
  await repo.system(space.id,sql=>sql.query('INSERT INTO team_connections VALUES($1,$2,$3,$4,$5,$6,$7)',[space.id,'123','DEVELOPER_TEST','readonly',seal(JSON.stringify({kind:'private',access_token:'synthetic-partial-token',scopes:owner?['crm.objects.owners.read']:[]}),key),'2026-10-29','2099-01-01']));
  return {space,paths,read:()=>new TeamOAuth(repo,null,fetcher,key).context(space.id,'42',{accountId:'123',mode:'test'}),override:(fn:(path:string)=>Promise<Response|undefined>)=>{override=fn;}};
}
test('ficha parcial: actividad404 conserva otros detalles y declara la omisión sin reintentar',async()=>{
  const s=await setup();s.override(async path=>path.endsWith('/note-gone')?new Response('not-json',{status:404}):undefined);const result=await s.read();assert.equal(result.partial,true);assert.equal(result.timeline.length,2);assert.deepEqual(result.timeline.map(item=>item.id).sort(),['email-kept','note-kept']);assert.match(result.description,/1 actividad.*ya no est[aá] disponible/i);assert.equal(result.owner?.name,'Contract Owner');assert.equal(s.paths.filter(path=>path.endsWith('/note-gone')).length,1);assert.ok(!JSON.stringify(result).includes('synthetic-partial-token'));
});
test('ficha parcial: propietario404 conserva permiso y actividad, sin nombre inventado',async()=>{
  const s=await setup();s.override(async path=>path.includes('/owners/')?new Response('',{status:404}):undefined);const result=await s.read();assert.equal(result.owner,null);assert.equal(result.ownerPermission,true);assert.equal(result.timeline.length,3);assert.match(result.description,/propietario.*ya no est[aá] disponible/i);assert.equal(s.paths.filter(path=>path.includes('/owners/')).length,1);
});
test('ficha parcial: todos los detalles404 conservan contacto y distinguen vacío de omisiones',async()=>{
  const s=await setup();s.override(async path=>!path.includes('/contacts/')?new Response('',{status:404}):undefined);const result=await s.read();assert.equal(result.contactId,'42');assert.deepEqual(result.timeline,[]);assert.equal(result.owner,null);assert.match(result.description,/3 actividades.*ya no est[aá]n disponibles/i);assert.match(result.description,/propietario.*ya no est[aá] disponible/i);assert.equal(s.paths.length,5);
  const empty=await setup({owner:false,activity:false}),normal=await empty.read();assert.deepEqual(normal.timeline,[]);assert.equal(normal.ownerPermission,false);assert.ok(!normal.description.includes('ya no'));assert.equal(empty.paths.length,1);
});
test('ficha parcial: contacto principal404 sigue siendo error, sin detalles posteriores',async()=>{
  const s=await setup();s.override(async path=>path.includes('/contacts/')?new Response('',{status:404}):undefined);await assert.rejects(s.read(),error=>error instanceof AppError&&error.status===502);assert.equal(s.paths.length,1);
});
test('ficha parcial: no se ocultan permisos, credencial, límites de uso o fallo de proveedor',async()=>{
  for(const pathType of ['activity','owner'])for(const status of [401,403,429,500,503]){
    const s=await setup();s.override(async path=>(pathType==='activity'?path.endsWith('/note-gone'):path.includes('/owners/'))?Response.json({error:'synthetic-secret-error'},{status}):undefined);await assert.rejects(s.read(),error=>error instanceof AppError&&error.status===(status===403?403:502)&&!error.message.includes('synthetic-secret-error'));
  }
});
test('ficha parcial: cambio de conexión durante404 de actividad o último propietario descarta resultado',async()=>{
  for(const pathType of ['activity','owner']){const s=await setup();s.override(async path=>{
    if(pathType==='activity'?path.endsWith('/note-gone'):path.includes('/owners/')){await repo.disconnectHubspot(s.space.id,user);return new Response('',{status:404});}
    return undefined;
  });await assert.rejects(s.read(),error=>error instanceof AppError&&error.status===409);if(pathType==='activity')assert.equal(s.paths.length,2);}
});
test('ficha parcial: JSON inválido y fallo de transporte siguen rechazando la lectura',async()=>{
  for(const fail of ['json','network']){const s=await setup();s.override(async path=>{if(path.endsWith('/note-gone')){if(fail==='network')throw new Error('SYNTHETIC_NETWORK_FAILURE');return new Response('not-json');}return undefined;});await assert.rejects(s.read(),fail==='network'?/SYNTHETIC_NETWORK_FAILURE/:SyntaxError);assert.equal(s.paths.length,2);}
});
test('ficha parcial: null, array o primitivo200 no se confunden con objeto404 omitido',async()=>{
  for(const pathType of ['contact','activity','owner'])for(const payload of [null,[],42,'not-an-object']){
    const s=await setup();s.override(async path=>(pathType==='contact'?path.includes('/contacts/'):pathType==='activity'?path.endsWith('/note-gone'):path.includes('/owners/'))?Response.json(payload):undefined);
    await assert.rejects(s.read(),error=>error instanceof AppError&&error.status===502&&/válida/.test(error.message));
  }
});
