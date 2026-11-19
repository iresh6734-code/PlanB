import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import Fastify from 'fastify';
import {embeddedDatabase,type TeamDatabase} from '../server/team/database.js';
import {teamSchema} from '../server/team/schema.js';
import {TeamRepository} from '../server/team/repository.js';
import {TeamOAuth} from '../server/team/oauth.js';
import {registerHubspotContext} from '../server/team/hubspot-routes.js';
import {AppError} from '../server/store.js';
import {seal} from '../server/crypto.js';
import {makeFixture} from '../shared/fixtures.js';
import type {CrmSnapshot} from '../shared/model.js';
let db:TeamDatabase,repo:TeamRepository;
const user={uid:'context-contract-admin',email:'context@example.test'};
before(async()=>{db=await embeddedDatabase();await db.exec(teamSchema);repo=new TeamRepository(db);});
after(async()=>{await db?.close();});
function capture(portal='123',production=false){
  const snapshot=makeFixture(),contact=snapshot.records.find(record=>record.entity==='contacts')!,old=contact.id;contact.id='42';
  for(const link of snapshot.links){if(link.fromEntity==='contacts'&&link.fromId===old)link.fromId='42';if(link.toEntity==='contacts'&&link.toId===old)link.toId='42';}
  snapshot.version=3;snapshot.source={...snapshot.source,kind:'hubspot',accountId:portal,isTestData:!production,environment:production?'production':'test',accountType:production?'STANDARD':'DEVELOPER_TEST'};
  return snapshot;
}
async function setup({production=false,demo=false}={}){
  const space=await repo.createSpace(user,'Context contract'),key=randomBytes(32),app=Fastify({logger:false});
  let requests:string[]=[],duringRead:undefined|((path:string)=>Promise<void>),currentUser=user,associated=false;
  const fetcher:typeof fetch=async(input,init)=>{
    const url=new URL(String(input));assert.equal(url.origin,'https://api.hubapi.com');assert.equal(init?.method??'GET',url.pathname.endsWith('/search')?'POST':'GET');assert.equal(init?.redirect,'error');requests.push(url.pathname);await duringRead?.(url.pathname);
    if(url.pathname.includes('/contacts/'))return Response.json({id:'42',properties:{firstname:'Synthetic'},associations:associated?{notes:{results:[{id:'7'}]}}:{}});
    return Response.json({results:[{id:'7',properties:{hs_createdate:'2026-10-29T07:00:00Z',hs_note_body:'SYNTHETIC_PRIVATE_ACTIVITY'}}]});
  };
  const oauth=new TeamOAuth(repo,null,fetcher,key);
  app.setErrorHandler((error,request,reply)=>reply.code(error instanceof AppError?error.status:500).send({error:error instanceof AppError?error.message:'Unexpected test failure'}));
  registerHubspotContext(app,repo,oauth,async()=>currentUser,demo);
  const secret=()=>seal(JSON.stringify({kind:production?'private-production-readonly':'private',...(production?{authorizedPortalId:'123'}:{}),access_token:'synthetic-private-access',scopes:[]}),key);
  await repo.system(space.id,sql=>sql.query('INSERT INTO team_connections VALUES($1,$2,$3,$4,$5,$6,$7)',[space.id,'123',production?'STANDARD':'DEVELOPER_TEST','readonly',secret(),'2026-10-29T07:00:00Z','2099-01-01']));
  const save=async(snapshot:CrmSnapshot)=>repo.system(space.id,sql=>sql.query('INSERT INTO team_captures VALUES($1,$2,$3::jsonb,now())',[space.id,randomUUID(),JSON.stringify(snapshot)]));
  return {space,key,app,oauth,save,secret,requests:()=>requests,during:(fn:(path:string)=>Promise<void>)=>{duringRead=fn;},associate:()=>{associated=true;},as:(value:typeof user)=>{currentUser=value;},read:()=>app.inject({url:'/api/team/spaces/'+space.id+'/v6/hubspot/42'})};
}
test('ficha: ID numérico local, captura de ensayo y portal ajeno no autorizan llamadas remotas',async()=>{
  for(const kind of ['local','fixture','foreign']){const s=await setup();try{
    if(kind==='local')await repo.system(s.space.id,sql=>sql.query("INSERT INTO team_records(tenant_id,entity,id,value) VALUES($1,'contacts','42',$2::jsonb)",[s.space.id,JSON.stringify({id:'42',entity:'contacts',values:{firstname:'Local'}})]));
    else {const snapshot=capture(kind==='foreign'?'456':'123');if(kind==='fixture')snapshot.source.kind='fixture';await s.save(snapshot);}
    const response=await s.read();assert.equal(response.statusCode,404,kind);assert.equal(s.requests().length,0,kind);
  }finally{await s.app.close();}}
});
test('ficha: captura HubSpot del mismo portal permite lectura en ensayo y producción',async()=>{
  for(const production of [false,true]){const s=await setup({production});try{
    await s.save(capture('123',production));s.associate();const response=await s.read();assert.equal(response.statusCode,200,response.body);assert.equal(response.json().contactId,'42');assert.equal(response.json().timeline[0].body,'SYNTHETIC_PRIVATE_ACTIVITY');assert.equal(s.requests().length,2);assert.ok(!response.body.includes('synthetic-private-access'));assert.ok(!response.body.includes('verifiedAt'));
  }finally{await s.app.close();}}
});
test('ficha: portal o modo esperado distintos se rechazan antes de leer o renovar credenciales',async()=>{
  const s=await setup();try{
    for(const source of [{accountId:'456',mode:'test' as const},{accountId:'123',mode:'production_readonly' as const}])await assert.rejects(s.oauth.context(s.space.id,'42',source),error=>error instanceof AppError&&error.status===409);
    await assert.rejects(s.oauth.context(s.space.id,'local-id'),error=>error instanceof AppError&&error.status===422);assert.equal(s.requests().length,0);
  }finally{await s.app.close();}
});
test('ficha: desconectar o sustituir portal durante lectura descarta contenido y detiene detalles posteriores',async()=>{
  for(const change of ['disconnect','portal','reauthorize']){const s=await setup();try{
    await s.save(capture());s.associate();s.during(async()=>{
      if(change==='disconnect')await repo.disconnectHubspot(s.space.id,user);
      else await repo.system(s.space.id,sql=>change==='portal'?sql.query("UPDATE team_connections SET account_id='456' WHERE tenant_id=$1",[s.space.id]):sql.query("UPDATE team_connections SET verified_at='2026-10-29T07:01:00Z' WHERE tenant_id=$1",[s.space.id]));
    });
    const response=await s.read();assert.equal(response.statusCode,409,change+response.body);assert.equal(s.requests().length,1);assert.ok(!response.body.includes('SYNTHETIC_PRIVATE_ACTIVITY'));
  }finally{await s.app.close();}}
});
test('ficha: cambio de identidad durante el último detalle también descarta el resultado',async()=>{
  const s=await setup();try{
    await s.save(capture());s.associate();s.during(async path=>{if(path.includes('/notes/'))await repo.disconnectHubspot(s.space.id,user);});
    const response=await s.read();assert.equal(response.statusCode,409);assert.equal(s.requests().length,2);assert.ok(!response.body.includes('SYNTHETIC_PRIVATE_ACTIVITY'));
  }finally{await s.app.close();}
});
test('ficha: renovación de token del mismo portal conserva identidad y lectura',async()=>{
  const s=await setup();try{
    await s.save(capture());s.during(async()=>{await repo.system(s.space.id,sql=>sql.query('UPDATE team_connections SET secret=$2,expires_at=$3 WHERE tenant_id=$1',[s.space.id,s.secret(),'2099-02-01']));});
    const response=await s.read();assert.equal(response.statusCode,200,response.body);assert.equal(s.requests().length,1);
  }finally{await s.app.close();}
});
test('ficha: revalida permiso de empresa y presencia en captura antes de responder',async()=>{
  for(const change of ['membership','capture']){const s=await setup();try{
    await s.save(capture());s.during(async()=>{await repo.system(s.space.id,sql=>change==='membership'?sql.query('DELETE FROM team_members WHERE tenant_id=$1 AND user_id=$2',[s.space.id,user.uid]):sql.query('DELETE FROM team_captures WHERE tenant_id=$1',[s.space.id]));});
    const response=await s.read();assert.equal(response.statusCode,change==='membership'?403:404,response.body);assert.equal(s.requests().length,1);
  }finally{await s.app.close();}}
});
test('ficha: un usuario de otra empresa no produce llamadas y la demo conserva su límite explícito',async()=>{
  const s=await setup(),demo=await setup({demo:true});try{
    await s.save(capture());s.as({uid:'outsider-contract',email:'outside@example.test'});assert.equal((await s.read()).statusCode,403);assert.equal(s.requests().length,0);
    await repo.system(demo.space.id,sql=>sql.query("INSERT INTO team_records(tenant_id,entity,id,value) VALUES($1,'contacts','42',$2::jsonb)",[demo.space.id,JSON.stringify({id:'42',entity:'contacts',values:{firstname:'Demo'}})]));const response=await demo.read();assert.equal(response.statusCode,200);assert.match(response.json().description,/ficticia/);assert.equal(demo.requests().length,0);
  }finally{await s.app.close();await demo.app.close();}
});
