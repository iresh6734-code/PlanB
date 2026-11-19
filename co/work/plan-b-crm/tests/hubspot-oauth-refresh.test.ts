import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {AsyncLocalStorage} from 'node:async_hooks';
import {embeddedDatabase,type TeamDatabase} from '../server/team/database.js';
import {teamSchema} from '../server/team/schema.js';
import {TeamRepository} from '../server/team/repository.js';
import {TeamOAuth} from '../server/team/oauth.js';
import {open,seal} from '../server/crypto.js';
import {AppError} from '../server/store.js';
let db:TeamDatabase,repo:TeamRepository;const inTransaction=new AsyncLocalStorage<boolean>();
const user={uid:'refresh-contract-admin',email:'refresh@example.test'},now=new Date('2026-10-29T09:00:00Z');
before(async()=>{db=await embeddedDatabase();await db.exec(teamSchema);const instrumented:TeamDatabase={...db,transaction:run=>db.transaction(sql=>inTransaction.run(true,()=>run(sql)))};repo=new TeamRepository(instrumented,()=>now);});
after(async()=>{await db?.close();});
async function setup(){
  const space=await repo.createSpace(user,'Refresh contract'),key=randomBytes(32),old={access_token:'synthetic-old-access',refresh_token:'synthetic-old-refresh',expires_in:1800,hub_id:123,scopes:['oauth','crm.objects.contacts.read','crm.objects.owners.read']};
  const config={clientId:'contract-id',clientSecret:'contract-client-secret',redirectUri:'https://contract.example/callback',encryptionKey:key};
  let refreshes=0,gets=0,onRefresh:undefined|(()=>Promise<void>),response:(attempt:number)=>Response=()=>Response.json({access_token:'synthetic-new-access',expires_in:1800}),seenHeaders:string[]=[];
  const fetcher:typeof fetch=async(input,init)=>{
    assert.notEqual(inTransaction.getStore(),true,'ninguna transacción de esta operación permanece abierta durante la red');const url=new URL(String(input));assert.equal(url.origin,'https://api.hubapi.com');assert.equal(init?.redirect,'error');
    if(url.pathname==='/oauth/v3/token'){
      const attempt=++refreshes;assert.equal(init?.method,'POST');assert.equal(url.search,'');const body=new URLSearchParams(String(init?.body));assert.equal(body.get('grant_type'),'refresh_token');assert.equal(body.get('refresh_token'),'synthetic-old-refresh');await onRefresh?.();return response(attempt);
    }
    gets++;assert.equal(init?.method??'GET','GET');seenHeaders.push(new Headers(init?.headers).get('authorization')??'');return url.pathname.includes('/owners/')?Response.json({id:'7',firstName:'Contract'}):Response.json({id:'42',properties:{hubspot_owner_id:'7'},associations:{}});
  };
  const secret=seal(JSON.stringify(old),key);await repo.system(space.id,sql=>sql.query('INSERT INTO team_connections VALUES($1,$2,$3,$4,$5,$6,$7)',[space.id,'123','DEVELOPER_TEST','readonly',secret,'2026-10-29T08:00:00Z','2026-10-29T08:59:00Z']));
  const oauth=new TeamOAuth(repo,config,fetcher),read=()=>oauth.context(space.id,'42',{accountId:'123',mode:'test'});
  const row=async()=>(await repo.system(space.id,sql=>sql.query<{secret:string;status:string;account_id:string}>('SELECT secret,status,account_id FROM team_connections WHERE tenant_id=$1',[space.id]))).rows[0];
  return {space,key,oauth,old,secret,read,row,fetcher,config,counts:()=>({refreshes,gets}),headers:()=>seenHeaders,during:(fn:()=>Promise<void>)=>{onRefresh=fn;},respond:(fn:(attempt:number)=>Response)=>{response=fn;}};
}
test('refresh: red sin transacción, conserva metadatos omitidos y guarda credencial cifrada',async()=>{
  const s=await setup();s.during(async()=>{await repo.system(s.space.id,sql=>sql.query('SELECT id FROM team_spaces WHERE id=$1',[s.space.id]));});
  const context=await s.read();assert.equal(context.owner?.name,'Contract');assert.equal(context.ownerPermission,true);assert.deepEqual(s.counts(),{refreshes:1,gets:2});
  const row=await s.row(),tokens=JSON.parse(open(row.secret,s.key));assert.equal(row.status,'readonly');assert.ok(!row.secret.includes('synthetic-new-access'));assert.equal(tokens.access_token,'synthetic-new-access');assert.equal(tokens.refresh_token,s.old.refresh_token);assert.deepEqual(tokens.scopes,s.old.scopes);assert.equal(tokens.hub_id,123);assert.ok(s.headers().every(value=>value==='Bearer synthetic-new-access'));
  await s.read();assert.equal(s.counts().refreshes,1,'credencial vigente no vuelve a renovarse');
});
test('refresh: llamadas concurrentes de una instancia comparten la renovación y no mezclan empresas',async()=>{
  const s=await setup(),other=await setup();let release!:()=>void,started!:()=>void;const gate=new Promise<void>(resolve=>release=resolve),ready=new Promise<void>(resolve=>started=resolve);
  s.during(async()=>{started();await gate;});const first=s.read();await ready;const second=s.read();await other.read();release();const contexts=await Promise.all([first,second]);assert.equal(contexts.length,2);assert.equal(s.counts().refreshes,1);assert.equal(other.counts().refreshes,1);
});
test('refresh: token nuevo y scopes explícitos sustituyen metadatos anteriores',async()=>{
  const s=await setup();s.respond(()=>Response.json({access_token:'synthetic-new-access',refresh_token:'synthetic-rotated-refresh',expires_in:30,hub_id:'123',scopes:[]}));const context=await s.read();assert.equal(context.ownerPermission,false);assert.equal(s.counts().refreshes,1);assert.equal(s.counts().gets,1);const saved=JSON.parse(open((await s.row()).secret,s.key));assert.equal(saved.refresh_token,'synthetic-rotated-refresh');assert.deepEqual(saved.scopes,[]);
});
test('refresh: invalid_grant o BAD_REFRESH_TOKEN persiste needs_reconnect sin revelar error remoto',async()=>{
  for(const error of [{error:'invalid_grant'},{status:'BAD_REFRESH_TOKEN'}]){const s=await setup();s.respond(()=>Response.json({...error,error_description:'synthetic-old-refresh contract-client-secret'},{status:400}));
    await assert.rejects(s.read(),value=>value instanceof AppError&&value.status===409&&!value.message.includes('synthetic-old-refresh'));const row=await s.row();assert.equal(row.status,'needs_reconnect');assert.equal(row.secret,s.secret);assert.equal(s.counts().gets,0);await assert.rejects(s.read(),value=>value instanceof AppError&&value.status===409);assert.equal(s.counts().refreshes,1);
  }
});
test('refresh: fallos transitorios, error de cliente y respuesta malformada conservan la conexión',async()=>{
  for(const response of [()=>Response.json({error:'temporarily_unavailable'},{status:503}),()=>Response.json({error:'invalid_client'},{status:401}),()=>Response.json({error:'invalid_grant'},{status:503}),()=>Response.json({expires_in:1800}),()=>Response.json({access_token:'synthetic-new-access'}),()=>new Response('not-json')]){const s=await setup();s.respond(response);await assert.rejects(s.read(),value=>value instanceof AppError&&value.status===502);const row=await s.row();assert.equal(row.status,'readonly');assert.equal(row.secret,s.secret);assert.equal(s.counts().gets,0);}
});
test('refresh: portal inesperado o scope de escritura se rechazan y requieren reconexión',async()=>{
  for(const metadata of [{hub_id:456},{scopes:['crm.objects.contacts.write']}]){const s=await setup();s.respond(()=>Response.json({access_token:'synthetic-new-access',expires_in:1800,...metadata}));await assert.rejects(s.read(),value=>value instanceof AppError&&value.status===403);const row=await s.row();assert.equal(row.status,'needs_reconnect');assert.equal(row.secret,s.secret);assert.equal(s.counts().gets,0);}
});
test('refresh: respuesta vieja tras desconexión o cambio de portal no reinstala credenciales',async()=>{
  for(const change of ['disconnect','portal']){const s=await setup();s.during(async()=>{if(change==='disconnect')await repo.disconnectHubspot(s.space.id,user);else await repo.system(s.space.id,sql=>sql.query("UPDATE team_connections SET account_id='456',secret=$2,expires_at='2099-01-01',verified_at='2026-10-29T09:01:00Z' WHERE tenant_id=$1",[s.space.id,seal(JSON.stringify({...s.old,access_token:'synthetic-reconnected-access',hub_id:456}),s.key)]));});await assert.rejects(s.read(),value=>value instanceof AppError&&value.status===409);const row=await s.row();if(change==='disconnect')assert.equal(row,undefined);else {assert.equal(row.account_id,'456');assert.equal(JSON.parse(open(row.secret,s.key)).access_token,'synthetic-reconnected-access');}assert.equal(s.counts().gets,0);}
});
test('refresh: un invalid_grant viejo no invalida una conexión nueva del mismo portal',async()=>{
  const s=await setup();s.respond(()=>Response.json({error:'invalid_grant'},{status:400}));s.during(async()=>{await repo.system(s.space.id,sql=>sql.query("UPDATE team_connections SET secret=$2,expires_at='2099-01-01',verified_at='2026-10-29T09:01:00Z' WHERE tenant_id=$1",[s.space.id,seal(JSON.stringify({...s.old,access_token:'synthetic-reconnected-access'}),s.key)]));});await s.read();assert.equal((await s.row()).status,'readonly');assert.ok(s.headers().every(value=>value==='Bearer synthetic-reconnected-access'));
});
test('refresh: escritura optimista entre instancias conserva al ganador y descarta el grant viejo',async()=>{
  const s=await setup(),otherInstance=new TeamOAuth(repo,s.config,s.fetcher);let grant=0;s.during(async()=>{grant++;if(grant===1)await otherInstance.context(s.space.id,'42',{accountId:'123',mode:'test'});});s.respond(attempt=>Response.json({access_token:attempt===2?'synthetic-new-access':'synthetic-losing-access',expires_in:1800}));await s.read();assert.equal(s.counts().refreshes,2);assert.equal((await s.row()).status,'readonly');assert.equal(JSON.parse(open((await s.row()).secret,s.key)).access_token,'synthetic-new-access');assert.ok(s.headers().every(value=>value==='Bearer synthetic-new-access'));
});
test('refresh: invalid_grant antes del éxito concurrente no deja una conexión válida desactivada',async()=>{
  for(const reconnect of [false,true]){
    const s=await setup(),other=new TeamOAuth(repo,s.config,s.fetcher);let entered!:()=>void,release!:()=>void,attempt=0;const ready=new Promise<void>(resolve=>entered=resolve),gate=new Promise<void>(resolve=>release=resolve);
    s.during(async()=>{if(++attempt===1){entered();await gate;}});s.respond(index=>index===1?Response.json({access_token:'synthetic-new-access',expires_in:1800}):Response.json({error:'invalid_grant'},{status:400}));
    const winner=s.read();await ready;await assert.rejects(other.context(s.space.id,'42',{accountId:'123',mode:'test'}),value=>value instanceof AppError&&value.status===409);assert.equal((await s.row()).status,'needs_reconnect');
    if(reconnect)await repo.system(s.space.id,sql=>sql.query("UPDATE team_connections SET status='readonly',secret=$2,expires_at='2099-01-01',verified_at='2026-10-29T09:01:00Z' WHERE tenant_id=$1",[s.space.id,seal(JSON.stringify({...s.old,access_token:'synthetic-reconnected-access'}),s.key)]));
    release();await winner;const row=await s.row();assert.equal(row.status,'readonly');const expected=reconnect?'synthetic-reconnected-access':'synthetic-new-access';assert.equal(JSON.parse(open(row.secret,s.key)).access_token,expected);assert.ok(s.headers().every(value=>value==='Bearer '+expected));
  }
});
