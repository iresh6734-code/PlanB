import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, randomBytes } from 'node:crypto';
import { embeddedDatabase, type TeamDatabase } from '../server/team/database.js';
import { teamSchema } from '../server/team/schema.js';
import { TeamRepository } from '../server/team/repository.js';
import { TeamJobs } from '../server/team/jobs.js';
import { TeamOAuth } from '../server/team/oauth.js';
import { createTeamApp } from '../server/team/app.js';
import { makeFixture } from '../shared/fixtures.js';
import { TeamSyncClient } from '../server/team-sync.js';
import { Store } from '../server/store.js';
let db:TeamDatabase;let repo:TeamRepository;
const admin={uid:'test-admin',email:'admin@ensayo.example'},viewer={uid:'test-viewer',email:'lector@ensayo.example'};
before(async()=>{db=await embeddedDatabase();await db.exec(teamSchema);repo=new TeamRepository(db);});
after(async()=>{await db?.close();});
async function space(name='Empresa ficticia'){const result=await repo.createSpace(admin,name);const snapshot=makeFixture();snapshot.name=name;snapshot.records.find(r=>r.entity==='companies')!.values.name=name;await repo.importSnapshot(result.id,admin,snapshot);return result.id;}
test('equipo: PostgreSQL aplica RLS aun sin filtro explícito y bloquea insertar en otra empresa',async()=>{
  const a=await space('Empresa A'),b=await space('Empresa B');
  const rows=await repo.scoped(a,admin,'read',sql=>sql.query<{tenant_id:string}>('SELECT tenant_id FROM team_records'));assert.equal(rows.rows.length,62);assert.ok(rows.rows.every(r=>r.tenant_id===a));
  await assert.rejects(repo.scoped(a,admin,'write',sql=>sql.query('INSERT INTO team_records VALUES($1,$2,$3,$4::jsonb,1)',[b,'contacts','alien',JSON.stringify({})])),/row-level security/);
  assert.equal((await repo.records(b,admin)).length,62);
});
test('equipo: roles por membresía, invitación verificada y último administrador protegido',async()=>{
  const id=await space();await repo.invite(id,admin,viewer.email,'viewer');await repo.spaces(viewer);
  assert.equal((await repo.records(id,viewer)).length,62);
  await assert.rejects(repo.edit(id,viewer,{id:randomUUID(),entity:'contacts',recordId:'contact-1',baseVersion:1,values:{phone:'600001111'}}),/permiso/);
  await assert.rejects(repo.pair(id,viewer,'No autorizado'),/permiso/);
  await assert.rejects(repo.changeRole(id,admin,admin.uid,'viewer'),/administrador/);
  const outsider={uid:'otra-cuenta',email:'otro@ensayo.example'};await assert.rejects(repo.overview(id,outsider),/permiso/);
  await repo.changeRole(id,admin,viewer.uid,'sales');const device=await repo.pair(id,viewer,'Comercial de ensayo');await repo.changeRole(id,admin,viewer.uid,'viewer');await assert.rejects(repo.exchange(device.token,[],0),/vinculación/);
});
test('equipo: sincronización deduplica, conserva conflictos y exige la versión actual para resolver',async()=>{
  const id=await space(),device=await repo.pair(id,admin,'PC de ensayo'),operation={id:randomUUID(),entity:'contacts' as const,recordId:'contact-1',baseVersion:1,values:{phone:'600111222'}};
  const first=await repo.exchange(device.token,[operation],0);assert.equal(first.results[0].status,'applied');assert.equal((await repo.exchange(device.token,[operation],0)).results[0].version,2);
  await assert.rejects(repo.exchange(device.token,[{...operation,values:{phone:'OTRO'}}],0),/otra operación/);
  const conflict=(await repo.exchange(device.token,[{...operation,id:randomUUID(),values:{phone:'600222333'}}],first.cursor)).results[0];assert.equal(conflict.status,'conflict');
  await assert.rejects(repo.resolve(id,admin,conflict.conflictId!,'local',1),/cambió/);
  await repo.edit(id,admin,{...operation,id:randomUUID(),baseVersion:2,values:{phone:'600444555'}});
  await assert.rejects(repo.resolve(id,admin,conflict.conflictId!,'local',2),/cambió/);const currentConflict=(await repo.overview(id,admin)).conflicts[0];assert.equal(currentConflict.remote_version,3);assert.equal((currentConflict.remote_value as any).values.phone,'600444555');await repo.resolve(id,admin,conflict.conflictId!,'local',3);
  const record=(await repo.records(id,admin)).find(r=>r.id==='contact-1') as any;assert.equal(record.version,4);assert.equal(record.value.values.phone,'600222333');
  assert.ok((await repo.exchange(device.token,[],0)).resolvedConflicts.includes(conflict.operationId));
  await repo.revoke(id,admin,device.id);await assert.rejects(repo.exchange(device.token,[],0),/vinculación/);
});
test('equipo: cola persistente recupera lease, no duplica entrega y limita intentos',async()=>{
  const id=await space(),jobs=new TeamJobs(repo),key=randomUUID(),job=await jobs.enqueue(id,admin,'sync-audit',key);assert.equal((await jobs.enqueue(id,admin,'sync-audit',key)).id,job.id);
  await repo.system(id,sql=>sql.query("UPDATE team_jobs SET status='running',attempts=1,lease_until='2020-01-01' WHERE tenant_id=$1 AND id=$2",[id,job.id]));
  const restarted=new TeamJobs(new TeamRepository(db));assert.equal((await restarted.run(id,job.id)).status,'succeeded');assert.equal((await restarted.run(id,job.id)).claimed,false);
  const broken=await jobs.enqueue(id,admin,'hubspot-capture',randomUUID());const time=new Date();const retryRepo=new TeamRepository(db,()=>time),retry=new TeamJobs(retryRepo);
  for(let i=0;i<3;i++){await retry.run(id,broken.id);time.setMinutes(time.getMinutes()+5);}
  const result=await repo.system(id,sql=>sql.query<{status:string;attempts:number}>('SELECT status,attempts FROM team_jobs WHERE tenant_id=$1 AND id=$2',[id,broken.id]));assert.equal(result.rows[0].status,'failed');assert.equal(result.rows[0].attempts,3);
});
test('equipo: OAuth liga usuario/empresa, consume state una vez y cifra credenciales',async()=>{
  const id=await space(),other=await space();let calls=0,withdraw=false;
  const fetcher:typeof fetch=async(input,init)=>{calls++;const url=String(input);if(url.endsWith('/oauth/v3/token')){assert.equal(init?.method,'POST');assert.ok(!url.includes('secret'));return Response.json({access_token:'synthetic-access-token',refresh_token:'synthetic-refresh-token',expires_in:1800,hub_id:123,scopes:['oauth','crm.objects.contacts.read']});}
    if(url.includes('/account-info/')){if(withdraw)await repo.disconnectHubspot(id,admin);return Response.json({portalId:123,accountType:'DEVELOPER_TEST'});}return Response.json({results:[]});};
  const oauth=new TeamOAuth(repo,{clientId:'client-ficticio',clientSecret:'secret-ficticio',redirectUri:'https://planb.example/team/oauth/hubspot/callback',encryptionKey:randomBytes(32)},fetcher);
  const start=await oauth.begin(id,admin,'123');assert.ok(start.url.startsWith('https://app.hubspot.com/oauth/authorize?'));assert.ok(!start.url.includes('.write'));
  await assert.rejects(oauth.complete(other,admin,start.state,'code'),/caducó/);assert.equal(calls,0);
  assert.equal((await oauth.complete(id,admin,start.state,'code')).mode,'readonly');await assert.rejects(oauth.complete(id,admin,start.state,'code'),/caducó/);
  const secret=await repo.system(id,sql=>sql.query<{secret:string}>('SELECT secret FROM team_connections WHERE tenant_id=$1',[id]));assert.ok(!secret.rows[0].secret.includes('synthetic-access-token'));
  const job=await new TeamJobs(repo).enqueue(id,admin,'hubspot-capture',randomUUID());await repo.disconnectHubspot(id,admin);const overview=await repo.overview(id,admin);assert.equal(overview.connection,null);assert.equal(overview.jobs.find(j=>j.id===job.id)?.status,'failed');assert.equal(overview.recordCount,62);
  const cancelled=await oauth.begin(id,admin,'123');withdraw=true;await assert.rejects(oauth.complete(id,admin,cancelled.state,'code'),/retirada/);assert.equal((await repo.overview(id,admin)).connection,null);
});
test('equipo: API rechaza suplantación y el worker no acepta identidades de usuario',async()=>{
  const {app}=await createTeamApp({db,origin:'https://planb.example',migrate:false,verify:async token=>{if(token!=='user-ficticio')throw new Error('rechazado');return admin;}});
  try{const id=await space();assert.equal((await app.inject({url:'/api/team/spaces/'+id})).statusCode,401);
    assert.equal((await app.inject({url:'/api/team/spaces/'+id,headers:{Authorization:'Bearer user-ficticio'}})).statusCode,200);
    assert.equal((await app.inject({method:'POST',url:'/internal/jobs/'+id+'/'+randomUUID(),headers:{Authorization:'Bearer user-ficticio'}})).statusCode,403);
    assert.equal((await app.inject({method:'POST',url:'/api/team/demo/session',payload:{uid:'demo-admin'}})).statusCode,404);
    assert.equal((await app.inject({method:'POST',url:'/api/team/spaces/'+id+'/devices',headers:{Authorization:'Bearer user-ficticio',Origin:'https://malicioso.example'},payload:{name:'PC'}})).statusCode,403);
  }finally{await app.close();}
});
test('equipo: copia local conserva cambios sin red y reanuda sin duplicar',async()=>{
  const id=await space(),device=await repo.pair(id,admin,'Portátil');const {app}=await createTeamApp({db,origin:'http://127.0.0.1:4328',demo:true,migrate:false});let offline=false;
  const fetcher:typeof fetch=async(input,init)=>{if(offline)throw new Error('sin red');const response=await app.inject({url:new URL(String(input)).pathname,method:(init?.method??'GET') as 'GET'|'POST',headers:init?.headers as Record<string,string>,payload:init?.body?JSON.parse(String(init.body)):undefined});return new Response(response.body,{status:response.statusCode,headers:{'Content-Type':'application/json'}});};
  const store=new Store(':memory:');store.set('password',{configured:true});
  try{let client=new TeamSyncClient(store,'http://127.0.0.1:4328',true,fetcher);await client.link('http://127.0.0.1:4328',device.token,id);client.queue('contacts','contact-1',{phone:'600999777'});store.set('continuitySession',{id:'ensayo'});await assert.rejects(client.synchronize(),/continuidad/);assert.equal(client.status().pending,1);store.set('continuitySession',null);offline=true;await assert.rejects(client.synchronize(),/sincronización/);assert.equal(client.status().pending,1);
    client=new TeamSyncClient(store,'http://127.0.0.1:4328',true,fetcher);offline=false;await client.synchronize();assert.equal(client.status().pending,0);await client.synchronize();const record=(await repo.records(id,admin)).find(r=>r.id==='contact-1') as any;assert.equal(record.version,2);assert.equal(record.value.values.phone,'600999777');assert.ok(!JSON.stringify(client.status()).includes(device.token));
  }finally{store.close();await app.close();}
});
