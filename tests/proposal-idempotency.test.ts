import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { embeddedDatabase,type TeamDatabase } from '../server/team/database.js';
import { teamSchema } from '../server/team/schema.js';
import { TeamRepository } from '../server/team/repository.js';
import { CommercialService } from '../server/team/commercial.js';
import { DemoWorkspace } from '../server/team/google.js';
import { createTeamApp } from '../server/team/app.js';
import { makeFixture } from '../shared/fixtures.js';

// Clave de idempotencia opcional al preparar un seguimiento (hallazgo R-05 de CLAUDE-004).
let db:TeamDatabase,repo:TeamRepository;const admin={uid:'idem-admin',email:'admin@ficticio.example'},viewer={uid:'idem-viewer',email:'viewer@ficticio.example'};
before(async()=>{db=await embeddedDatabase();await db.exec(teamSchema);repo=new TeamRepository(db);});after(async()=>db.close());
async function space(){const s=await repo.createSpace(admin,'Idempotencia ficticia');await repo.importSnapshot(s.id,admin,makeFixture());return s.id;}
const audits=(tenant:string,id:string)=>repo.system(tenant,async sql=>(await sql.query("SELECT 1 FROM team_audit WHERE tenant_id=$1 AND action='commercial.prepare' AND reference=$2",[tenant,id])).rows.length);

test('mismo id y mismo contacto: una sola propuesta, una sola auditoría y se conserva lo ya editado',async()=>{
  const tenant=await space(),service=new CommercialService(repo,new DemoWorkspace(),true),key=randomUUID();
  const first=await service.prepare(tenant,admin,'contact-1',undefined,undefined,key);assert.equal(first.id,key);
  const original=(await service.overview(tenant,admin)).proposals.find(p=>p.id===key)!;
  await service.edit(tenant,admin,key,{...original.content,body:'Texto editado por la persona.'});
  const retry=await service.prepare(tenant,admin,'contact-1',undefined,undefined,key);
  assert.equal(retry.id,key);
  const proposals=(await service.overview(tenant,admin)).proposals;
  assert.equal(proposals.length,1);assert.equal(proposals[0].content.body,'Texto editado por la persona.','el reintento no pisa la edición');assert.equal(await audits(tenant,key),1,'una sola auditoría');
});
test('mismo id con otro contacto se rechaza con 409 y no crea ni modifica nada',async()=>{
  const tenant=await space(),service=new CommercialService(repo,new DemoWorkspace(),true),key=randomUUID();
  await service.prepare(tenant,admin,'contact-1',undefined,undefined,key);
  await assert.rejects(service.prepare(tenant,admin,'contact-2',undefined,undefined,key),(error:any)=>error.status===409||/otro contacto/.test(error.message));
  const proposals=(await service.overview(tenant,admin)).proposals;assert.equal(proposals.length,1);assert.equal(proposals[0].contact_id,'contact-1');
});
test('sin id el comportamiento no cambia: cada petición crea una propuesta distinta',async()=>{
  const tenant=await space(),service=new CommercialService(repo,new DemoWorkspace(),true);
  const a=await service.prepare(tenant,admin,'contact-1'),b=await service.prepare(tenant,admin,'contact-1');
  assert.notEqual(a.id,b.id);assert.equal((await service.overview(tenant,admin)).proposals.length,2);
});
test('el mismo id en otra empresa no colisiona ni filtra la propuesta de la primera',async()=>{
  const one=await space(),two=await space(),service=new CommercialService(repo,new DemoWorkspace(),true),key=randomUUID();
  await service.prepare(one,admin,'contact-1',undefined,undefined,key);await service.prepare(two,admin,'contact-1',undefined,undefined,key);
  assert.equal((await service.overview(one,admin)).proposals.length,1);assert.equal((await service.overview(two,admin)).proposals.length,1);
});
test('el id repetido no evita las validaciones propias de una propuesta nueva',async()=>{
  const tenant=await space(),service=new CommercialService(repo,new DemoWorkspace(),true);
  await assert.rejects(service.prepare(tenant,admin,'no-existe',undefined,undefined,randomUUID()),/no pertenece|contacto/i);
  assert.equal((await service.overview(tenant,admin)).proposals.length,0);
});
test('ruta: acepta un uuid, rechaza un id que no lo es y un lector no puede preparar ni con id',async()=>{
  const tenant=await space();await repo.invite(tenant,admin,viewer.email,'viewer');await repo.spaces(viewer);
  let user=admin;const {app}=await createTeamApp({db,migrate:false,origin:'https://planb.example',verify:async()=>user});
  try{
    const post=(payload:unknown)=>app.inject({method:'POST',url:'/api/team/spaces/'+tenant+'/v6/proposals',headers:{Authorization:'Bearer test-user'},payload:payload as any});
    const key=randomUUID();const created=await post({contactId:'contact-1',id:key});assert.equal(created.statusCode,200);assert.equal(created.json().id,key);
    const repeated=await post({contactId:'contact-1',id:key});assert.equal(repeated.statusCode,200);assert.equal(repeated.json().id,key);
    const overview=await app.inject({url:'/api/team/spaces/'+tenant+'/v6/commercial',headers:{Authorization:'Bearer test-user'}});assert.equal(overview.json().proposals.length,1);
    assert.notEqual((await post({contactId:'contact-1',id:'no-es-uuid'})).statusCode,200);assert.notEqual((await post({contactId:'contact-1',id:12})).statusCode,200);
    assert.equal((await app.inject({url:'/api/team/spaces/'+tenant+'/v6/commercial',headers:{Authorization:'Bearer test-user'}})).json().proposals.length,1,'las peticiones rechazadas no crean nada');
    user=viewer;assert.equal((await post({contactId:'contact-1',id:randomUUID()})).statusCode,403);
    user=admin;assert.equal((await app.inject({url:'/api/team/spaces/'+tenant+'/v6/commercial',headers:{Authorization:'Bearer test-user'}})).json().proposals.length,1);
  }finally{await app.close();}
});

test('un id que ya pertenece a una ejecución del agente está reservado y no crea nada',async()=>{
  const tenant=await space(),service=new CommercialService(repo,new DemoWorkspace(),true),runId=randomUUID();
  await repo.system(tenant,sql=>sql.query("INSERT INTO team_copilot_runs(tenant_id,id,actor,opportunity_id,contact_id,revision,status) VALUES($1,$2,$3,$4,$5,$6,'running')",[tenant,runId,'otra-persona','opp-1','contact-1','r']));
  await assert.rejects(service.prepare(tenant,admin,'contact-1',undefined,undefined,runId),/reservado/);
  assert.equal((await service.overview(tenant,admin)).proposals.length,0);
});
test('dos peticiones simultáneas con el mismo id y distinto contacto: solo una crea, la otra recibe 409',async()=>{
  const tenant=await space(),service=new CommercialService(repo,new DemoWorkspace(),true),key=randomUUID();
  const results=await Promise.allSettled([service.prepare(tenant,admin,'contact-1',undefined,undefined,key),service.prepare(tenant,admin,'contact-2',undefined,undefined,key)]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.filter(r=>r.status==='rejected').length,1);
  const proposals=(await service.overview(tenant,admin)).proposals;assert.equal(proposals.length,1);assert.equal(await audits(tenant,key),1);
});
test('dos peticiones simultáneas con el mismo id y contacto: una propuesta y una auditoría',async()=>{
  const tenant=await space(),service=new CommercialService(repo,new DemoWorkspace(),true),key=randomUUID();
  const results=await Promise.all([service.prepare(tenant,admin,'contact-1',undefined,undefined,key),service.prepare(tenant,admin,'contact-1',undefined,undefined,key)]);
  assert.deepEqual(results.map(r=>r.id),[key,key]);assert.equal((await service.overview(tenant,admin)).proposals.length,1);assert.equal(await audits(tenant,key),1);
});
