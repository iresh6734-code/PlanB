import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { embeddedDatabase,type TeamDatabase } from '../server/team/database.js';
import { teamSchema } from '../server/team/schema.js';
import { TeamRepository } from '../server/team/repository.js';
import { CustomerService } from '../server/team/customers.js';
import { CommercialService } from '../server/team/commercial.js';
import { DemoWorkspace } from '../server/team/google.js';
import { makeFixture } from '../shared/fixtures.js';
import { createTeamApp } from '../server/team/app.js';
import { TeamCopilotAgent } from '../server/team/copilot-agent.js';
import { CopilotAuth } from '../server/team/copilot-auth.js';
const admin={uid:'customer-admin',email:'admin@ficticio.example'},viewer={uid:'customer-viewer',email:'viewer@ficticio.example'};
let db:TeamDatabase,repo:TeamRepository;
before(async()=>{db=await embeddedDatabase();await db.exec(teamSchema);repo=new TeamRepository(db,()=>new Date('2026-10-28T10:00:00Z'));});after(async()=>db.close());
async function space(){const s=await repo.createSpace(admin,'Ficha ficticia');await repo.importSnapshot(s.id,admin,makeFixture());return s.id;}

test('asistente por reglas: próxima acción interna retira prioridad, completar la devuelve sin IA ni red',async()=>{
  const id=await space(),customers=new CustomerService(repo),agent=new TeamCopilotAgent(repo,new CopilotAuth(repo,null),new CommercialService(repo,new DemoWorkspace(),true));
  assert.ok((await agent.overview(id,admin)).priorities.some(p=>p.id==='deal-1'));
  const action={id:randomUUID(),sourceKey:'local',title:'Concretar siguiente paso',dueAt:'2026-10-29T10:00:00Z'};await customers.createAction(id,admin,'contact-1',action);
  assert.ok(!(await agent.overview(id,admin)).priorities.some(p=>p.id==='deal-1'));await assert.rejects(agent.preview(id,admin,'deal-1'),/próxima acción/);
  await customers.setStatus(id,admin,'contact-1',action.id,{sourceKey:'local',version:1,status:'completed'});assert.ok((await agent.overview(id,admin)).priorities.some(p=>p.id==='deal-1'));
  await customers.createAction(id,admin,'contact-1',{...action,id:randomUUID(),dueAt:'2026-11-29T10:00:00Z'});assert.ok((await agent.overview(id,admin)).priorities.some(p=>p.id==='deal-1'));
});

test('ficha: reúne relaciones sin incluir otras oportunidades de la misma empresa, no inventa propietario',async()=>{
  const id=await space(),service=new CustomerService(repo),data=await service.dossier(id,admin,'contact-1');
  assert.equal(data.contact.name,'Lucía Martín');assert.equal(data.companies[0].name,'Estudio Arce');
  assert.deepEqual(data.opportunities.map(d=>d.id),['deal-1']);assert.ok(data.capturedTasks.every(t=>['task-1','task-13'].includes(t.id)));assert.equal(data.owner.id,null);assert.equal(data.owner.name,null);assert.equal(data.source.key,'local');
});

test('acción interna: persistencia, entrega duplicada y conflicto de contenido, sin proveedor',async()=>{
  const id=await space(),service=new CustomerService(repo),action={id:randomUUID(),sourceKey:'local',title:'Revisar necesidades',dueAt:'2026-10-30T10:00:00Z'};
  await Promise.all([service.createAction(id,admin,'contact-1',action),service.createAction(id,admin,'contact-1',action)]);
  await assert.rejects(service.createAction(id,admin,'contact-1',{...action,title:'Otro contenido'}),/otra acción/);
  const reloaded=new CustomerService(new TeamRepository(db)),data=await reloaded.dossier(id,admin,'contact-1');assert.equal(data.actions.length,1);assert.equal(data.actions[0].title,action.title);
  await service.setStatus(id,admin,'contact-1',action.id,{sourceKey:'local',version:1,status:'completed'});await service.setStatus(id,admin,'contact-1',action.id,{sourceKey:'local',version:1,status:'completed'});
  await assert.rejects(service.setStatus(id,admin,'contact-1',action.id,{sourceKey:'local',version:1,status:'open'}),/cambió/);
  await service.setStatus(id,admin,'contact-1',action.id,{sourceKey:'local',version:2,status:'open'});assert.equal((await service.dossier(id,admin,'contact-1')).actions[0].version,3);
  await assert.rejects(service.createAction(id,admin,'contact-1',{...action,id:randomUUID(),dueAt:'2026-10-01T10:00:00Z'}),/futura/);
});

test('ficha: permisos, aislamiento por empresa y RLS sin filtro explícito',async()=>{
  const a=await space(),b=await space(),service=new CustomerService(repo),action={id:randomUUID(),sourceKey:'local',title:'Acción privada de ensayo',dueAt:'2026-10-30T10:00:00Z'};
  await service.createAction(a,admin,'contact-1',action);assert.equal((await service.dossier(b,admin,'contact-1')).actions.length,0);
  await assert.rejects(service.setStatus(b,admin,'contact-1',action.id,{sourceKey:'local',version:1,status:'completed'}),/fuera/);
  const scoped=await repo.scoped(b,admin,'read',sql=>sql.query('SELECT * FROM team_customer_actions'));assert.equal(scoped.rows.length,0);
  await repo.invite(a,admin,viewer.email,'viewer');await repo.spaces(viewer);assert.equal((await service.dossier(a,viewer,'contact-1')).actions.length,1);
  await assert.rejects(service.createAction(a,viewer,'contact-1',{...action,id:randomUUID()}),/permiso/);
});

test('ficha: mismo ID en captura y copia local conserva acciones separadas y rechaza cambio de portal',async()=>{
  const id=await space(),service=new CustomerService(repo),action={id:randomUUID(),sourceKey:'local',title:'Acción local',dueAt:'2026-10-30T10:00:00Z'};await service.createAction(id,admin,'contact-1',action);
  const snapshot=makeFixture();snapshot.source.accountId='149623339';snapshot.records.find(r=>r.entity==='contacts'&&r.id==='contact-1')!.values.firstname='Contacto de captura';
  await repo.system(id,async sql=>{await sql.query('INSERT INTO team_connections VALUES($1,$2,$3,$4,$5,$6,$7)',[id,'149623339','DEVELOPER_TEST','readonly','unused','2026-10-28','2099-01-01']);await sql.query('INSERT INTO team_captures VALUES($1,$2,$3::jsonb,$4)',[id,randomUUID(),JSON.stringify(snapshot),'2026-10-28']);});
  const captured=await service.dossier(id,admin,'contact-1');assert.equal(captured.contact.name,'Contacto de captura Martín');assert.equal(captured.actions.length,0);
  const local=await service.dossier(id,admin,'contact-1',true);assert.equal(local.contact.name,'Lucía Martín');assert.equal(local.actions.length,1);assert.equal(local.source.canPrepare,false);
  await assert.rejects(service.createAction(id,admin,'contact-1',{...action,id:randomUUID()}),/fuente cambió/);
  await service.createAction(id,admin,'contact-1',{...action,id:randomUUID(),sourceKey:'hubspot:149623339',title:'Acción captura'});
  assert.equal((await service.dossier(id,admin,'contact-1')).actions.length,1);assert.equal((await service.dossier(id,admin,'contact-1',true)).actions.length,1);
  await repo.system(id,sql=>sql.query('UPDATE team_connections SET account_id=$2 WHERE tenant_id=$1',[id,'999']));await assert.rejects(service.dossier(id,admin,'contact-1'),/fuente/);
});

test('ficha: preparar seguimiento preserva la fuente y deja todas las acciones externas apagadas',async()=>{
  const id=await space(),service=new CommercialService(repo,new DemoWorkspace(),true),prepared=await service.prepare(id,admin,'contact-1',undefined,{sourceKey:'local',internalOnly:true});
  const p=(await service.overview(id,admin)).proposals.find(p=>p.id===prepared.id)!;assert.deepEqual([p.content.email,p.content.meeting,p.content.document,p.content.spreadsheet],[false,false,false,false]);
  await assert.rejects(service.prepare(id,admin,'contact-1',undefined,{sourceKey:'hubspot:otro',internalOnly:true}),/fuente comercial cambió/);
});

test('API ficha: lectura y escritura local no llaman a HubSpot ni Google',async()=>{
  const id=await space();let external=0;const {app}=await createTeamApp({db,migrate:false,origin:'https://planb.example',verify:async()=>admin,fetcher:async()=>{external++;throw new Error('No red');}});
  try{
    const headers={authorization:'Bearer ficticio'},root='/api/team/spaces/'+id+'/v6/customers/contact-1',action={id:randomUUID(),sourceKey:'local',title:'Acción desde API',dueAt:'2099-01-01T10:00:00Z'};
    assert.equal((await app.inject({url:root,headers})).statusCode,200);
    assert.equal((await app.inject({url:root+'/actions',method:'POST',headers,payload:action})).statusCode,200);
    assert.equal((await app.inject({url:root+'/actions/'+action.id,method:'POST',headers,payload:{sourceKey:'local',version:1,status:'completed'}})).statusCode,200);
    assert.equal((await app.inject({url:root+'?source=otro',headers})).statusCode,422);assert.equal(external,0);
  }finally{await app.close();}
});
