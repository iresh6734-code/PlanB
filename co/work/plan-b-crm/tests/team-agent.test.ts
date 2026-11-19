import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes,randomUUID } from 'node:crypto';
import { embeddedDatabase } from '../server/team/database.js';
import { teamSchema } from '../server/team/schema.js';
import { TeamRepository } from '../server/team/repository.js';
import { CommercialService } from '../server/team/commercial.js';
import { DemoWorkspace } from '../server/team/google.js';
import { CopilotAuth } from '../server/team/copilot-auth.js';
import { TeamCopilotAgent } from '../server/team/copilot-agent.js';
import { TeamOAuth } from '../server/team/oauth.js';
import { makeFixture } from '../shared/fixtures.js';
import { salesPriorities } from '../shared/sales-priorities.js';
import { makeDemoSpec } from '../shared/fixtures.js';
import { open } from '../server/crypto.js';
import type { CrmRecord } from '../shared/model.js';
import { commercialReportRange,commercialReportRows } from '../shared/commercial-report.js';
import { TeamJobs } from '../server/team/jobs.js';
import { CommercialContentSchema } from '../shared/commercial.js';
const user={uid:'agent-user',email:'operator@ficticio.example'};

test('agente: contexto por empresa, revisión, salida acotada, deduplicación y borrador sin acciones externas',async()=>{
  const db=await embeddedDatabase();await db.exec(teamSchema);
  try{
    const repo=new TeamRepository(db,()=>new Date('2026-10-27T09:00:00Z')),a=await repo.createSpace(user,'Agente A'),b=await repo.createSpace(user,'Agente B');await repo.importSnapshot(a.id,user,makeFixture());await repo.importSnapshot(b.id,user,makeFixture());
    const commercial=new CommercialService(repo,new DemoWorkspace(),true);
    const config={tenantId:randomUUID(),clientId:randomUUID(),environmentId:'Default-'+randomUUID(),schemaName:'planb_test',monthlyTurnLimit:1,encryptionKey:randomBytes(32),redirectUri:'http://localhost:4334/team/oauth/microsoft/callback'};
    class TestAuth extends CopilotAuth {override async token(){return 'fictitious-token';}}
    const auth=new TestAuth(repo,config);let calls=0;
    const agent=new TeamCopilotAgent(repo,auth,commercial,async(_c,token,prompt)=>{calls++;assert.equal(token,'fictitious-token');assert.match(prompt,/DATOS/);assert.ok(!prompt.includes('fictitious-token'));return JSON.stringify({subject:'Propuesta revisada',body:'Hola, ¿qué punto del alcance necesitas aclarar?'});});
    const priority=(await agent.overview(a.id,user)).priorities.find(p=>p.contactId)!;assert.ok(priority);
    const preview=await agent.preview(a.id,user,priority.id);await assert.rejects(agent.run(a.id,user,{id:randomUUID(),opportunityId:priority.id,revision:'0'.repeat(64)}),/cambió/);assert.equal(calls,0);
    await repo.system(a.id,sql=>sql.query('INSERT INTO team_copilot_connections VALUES($1,$2,$3,$4,$5)',[a.id,user.uid,'own@ficticio.example','test-cache','revision']));
    const id=randomUUID();await agent.run(a.id,user,{id,opportunityId:priority.id,revision:preview.revision});await agent.run(a.id,user,{id,opportunityId:priority.id,revision:preview.revision});assert.equal(calls,1);
    assert.equal((await agent.overview(b.id,user)).runs.length,0);await assert.rejects(agent.apply(b.id,user,id),/disponible/);
    const proposal=await agent.apply(a.id,user,id);assert.deepEqual(await agent.apply(a.id,user,id),proposal);
    const overview=await commercial.overview(a.id,user),p=overview.proposals.find(p=>p.id===proposal.id)!;
    assert.equal(p.status,'draft');assert.equal(p.content.subject,'Propuesta revisada');assert.equal(p.content.email,false);assert.equal(p.content.meeting,false);assert.equal(p.content.document,false);assert.equal(p.content.spreadsheet,false);assert.equal(overview.tasks.length,0);
    await assert.rejects(agent.run(a.id,user,{id:randomUUID(),opportunityId:priority.id,revision:preview.revision}),/límite mensual/);assert.equal(calls,1);
    const viewer={uid:'viewer-agent',email:'viewer@ficticio.example'};await repo.invite(a.id,user,viewer.email,'viewer');await repo.spaces(viewer);
    await assert.rejects(agent.run(a.id,viewer,{id:randomUUID(),opportunityId:priority.id,revision:preview.revision}),/permiso/);await assert.rejects(agent.overview(a.id,{uid:'outsider',email:'other@ficticio.example'}),/permiso/);
  }finally{await db.close();}
});

test('prioridades: relaciones HubSpot en ambos sentidos, cierre y tareas futuras evitan falsos seguimientos',()=>{
  const snapshot=makeFixture(),spec=makeDemoSpec(snapshot),now=new Date('2026-10-27T09:00:00Z');
  const records:CrmRecord[]=[{entity:'contacts',id:'c',values:{firstname:'Cliente',email:'a@ficticio.example'}},{entity:'deals',id:'d',values:{dealname:'Oportunidad',dealstage:'open'}},{entity:'tasks',id:'t',values:{hs_task_status:'NOT_STARTED',hs_timestamp:'2026-10-28T10:00:00Z'}}];
  const links=[{fromEntity:'contacts' as const,fromId:'c',toEntity:'deals' as const,toId:'d',label:'contacto'},{fromEntity:'tasks' as const,fromId:'t',toEntity:'deals' as const,toId:'d',label:'tarea'}];
  assert.equal(salesPriorities(records,spec,links,now).length,0);
  const missing=salesPriorities(records.filter(r=>r.entity!=='tasks'),spec,links,now);assert.equal(missing[0].contactId,'c');
  records[1].values.dealstage='closedwon';assert.equal(salesPriorities(records,spec,[],now).length,0);
});

test('HubSpot privado: verifica portal de ensayo, cifra y nunca acepta producción o sustituciones',async()=>{
  const db=await embeddedDatabase();await db.exec(teamSchema);
  try{
    const repo=new TeamRepository(db),a=await repo.createSpace(user,'HubSpot local'),key=randomBytes(32);let accountType='DEVELOPER_TEST',calls=0;
    const fake:typeof fetch=async(url,init)=>{calls++;assert.equal(init?.method??'GET','GET');assert.ok(String(url).startsWith('https://api.hubapi.com/'));return String(url).includes('account-info')?Response.json({portalId:149623339,accountType}):Response.json({results:[]});};
    const oauth=new TeamOAuth(repo,null,fake,key);await assert.rejects(oauth.connectPrivate(a.id,user,'secret-test-token','999'),/otro portal/);accountType='STANDARD';await assert.rejects(oauth.connectPrivate(a.id,user,'secret-test-token','149623339'),/tipo de cuenta/);accountType='DEVELOPER_TEST';
    await oauth.connectPrivate(a.id,user,'secret-test-token','149623339');const saved=(await repo.system(a.id,sql=>sql.query<{secret:string}>('SELECT secret FROM team_connections WHERE tenant_id=$1',[a.id]))).rows[0].secret;
    assert.ok(!saved.includes('secret-test-token'));assert.equal(JSON.parse(open(saved,key)).access_token,'secret-test-token');const before=calls;await assert.rejects(oauth.connectPrivate(a.id,user,'another-test-token','149623339'),/Desconecta/);assert.equal(calls,before);
  }finally{await db.close();}
});

test('agente: salida con acciones no autorizadas queda incierta; no crea propuestas y consume su intento',async()=>{
  const db=await embeddedDatabase();await db.exec(teamSchema);
  try{
    const repo=new TeamRepository(db,()=>new Date('2026-10-27T09:00:00Z')),s=await repo.createSpace(user,'Salida inválida');await repo.importSnapshot(s.id,user,makeFixture());
    const commercial=new CommercialService(repo,new DemoWorkspace(),true),config={tenantId:randomUUID(),clientId:randomUUID(),environmentId:'Default-'+randomUUID(),schemaName:'planb_test',monthlyTurnLimit:1,encryptionKey:randomBytes(32),redirectUri:'http://localhost:4334/team/oauth/microsoft/callback'};
    class TestAuth extends CopilotAuth {override async token(){return 'test';}}
    let calls=0;const agent=new TeamCopilotAgent(repo,new TestAuth(repo,config),commercial,async()=>{calls++;return JSON.stringify({subject:'Texto',body:'Texto',sendEmail:true,recipient:'unapproved@ficticio.example'});});
    await repo.system(s.id,sql=>sql.query('INSERT INTO team_copilot_connections VALUES($1,$2,$3,$4,$5)',[s.id,user.uid,'own@ficticio.example','cache','revision']));
    const p=(await agent.overview(s.id,user)).priorities.find(p=>p.contactId)!,preview=await agent.preview(s.id,user,p.id),id=randomUUID();
    await assert.rejects(agent.run(s.id,user,{id,opportunityId:p.id,revision:preview.revision}),/borrador válido/);
    assert.equal((await agent.overview(s.id,user)).runs[0].status,'uncertain');assert.equal((await commercial.overview(s.id,user)).proposals.length,0);
    await agent.run(s.id,user,{id,opportunityId:p.id,revision:preview.revision});assert.equal(calls,1);await assert.rejects(agent.apply(s.id,user,id),/disponible/);
  }finally{await db.close();}
});

test('HubSpot: fuente comercial de la captura actual, sin sobrescribir cambios locales; informe y revisión ligados al origen',async()=>{
  const db=await embeddedDatabase();await db.exec(teamSchema);
  try{
    const repo=new TeamRepository(db),s=await repo.createSpace(user,'CRM separado'),local=makeFixture();await repo.importSnapshot(s.id,user,local);
    const crm=makeFixture();crm.id='crm-capture';crm.source.accountId='149623339';crm.records.find(r=>r.entity==='contacts'&&r.id==='contact-1')!.values.firstname='Nombre desde HubSpot';
    await repo.system(s.id,async sql=>{await sql.query('INSERT INTO team_connections VALUES($1,$2,$3,$4,$5,$6,$7)',[s.id,'149623339','DEVELOPER_TEST','readonly','unused','2026-10-27','2099-01-01']);await sql.query('INSERT INTO team_captures VALUES($1,$2,$3::jsonb,$4)',[s.id,randomUUID(),JSON.stringify(crm),'2026-10-27']);});
    const commercial=new CommercialService(repo,new DemoWorkspace(),true),p=await commercial.prepare(s.id,user,'contact-1'),overview=await commercial.overview(s.id,user),proposal=overview.proposals.find(v=>v.id===p.id)!;
    assert.equal(overview.source?.origin,'hubspot');assert.equal(overview.contacts[0].values.firstname,'Nombre desde HubSpot');assert.equal(((await repo.records(s.id,user)).find(r=>r.id==='contact-1')!.value as CrmRecord).values.firstname,local.records.find(r=>r.entity==='contacts'&&r.id==='contact-1')!.values.firstname);
    assert.ok(commercialReportRows(proposal.content).some(row=>row.join(' ').includes('Nombre desde HubSpot')));assert.match(commercialReportRange(proposal.content),/^Seguimiento!A1:B\d+$/);
    await commercial.approve(s.id,user,p.id,proposal.content_hash);
    const newer={...crm,id:'crm-capture-2'};await repo.system(s.id,sql=>sql.query('INSERT INTO team_captures VALUES($1,$2,$3::jsonb,$4)',[s.id,randomUUID(),JSON.stringify(newer),'2026-10-28']));await assert.rejects(commercial.execute(s.id,user,p.id,proposal.content_hash),/actual/);
  }finally{await db.close();}
});

test('agente: ejecución activa excluye la cola y las acciones comerciales; filas de informe incompletas se rechazan',async()=>{
  const db=await embeddedDatabase();await db.exec(teamSchema);
  try{
    const repo=new TeamRepository(db,()=>new Date('2026-10-27T09:00:00Z')),s=await repo.createSpace(user,'Exclusión');await repo.importSnapshot(s.id,user,makeFixture());
    const commercial=new CommercialService(repo,new DemoWorkspace(),true),prepared=await commercial.prepare(s.id,user,'contact-1'),p=(await commercial.overview(s.id,user)).proposals.find(p=>p.id===prepared.id)!;await commercial.approve(s.id,user,p.id,p.content_hash);
    assert.equal(CommercialContentSchema.safeParse({...p.content,reportRows:[['Dos','columnas'],['una']]}).success,false);
    await repo.system(s.id,sql=>sql.query("INSERT INTO team_copilot_runs(tenant_id,id,actor,opportunity_id,contact_id,revision,status,created_at) VALUES($1,$2,$3,'deal-1','contact-1','test','running',$4)",[s.id,randomUUID(),user.uid,repo.clock().toISOString()]));
    const jobs=new TeamJobs(repo),job=await jobs.enqueue(s.id,user,'sync-audit',randomUUID());assert.equal((await jobs.run(s.id,job.id)).claimed,false);await assert.rejects(commercial.execute(s.id,user,p.id,p.content_hash),/análisis en curso/);assert.equal((await commercial.overview(s.id,user)).tasks.length,0);
  }finally{await db.close();}
});
