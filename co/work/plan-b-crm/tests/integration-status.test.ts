import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { googleIntegrationStatus } from '../shared/integration-status.js';
import { embeddedDatabase } from '../server/team/database.js';
import { teamSchema } from '../server/team/schema.js';
import { TeamRepository } from '../server/team/repository.js';
import { CommercialService } from '../server/team/commercial.js';
import { DemoWorkspace } from '../server/team/google.js';
import { makeFixture } from '../shared/fixtures.js';
import { createTeamApp } from '../server/team/app.js';

test('integraciones: OAuth no acredita operaciones, demo y desconexión nunca muestran éxito remoto',()=>{
  assert.ok(googleIntegrationStatus(true,true,true,[]).every(item=>item.state==='simulated'));
  assert.ok(googleIntegrationStatus(false,false,true,[]).every(item=>item.state==='not_configured'));
  assert.ok(googleIntegrationStatus(false,true,false,[]).every(item=>item.state==='disconnected'));
  assert.ok(googleIntegrationStatus(false,true,true,[]).every(item=>item.state==='authorized'&&item.evidenceAt===null));
});

test('integraciones: envío aceptado, verificación y resultado parcial se distinguen sin promover referencias simuladas',()=>{
  const older={id:'old',started_at:'2026-10-26T08:00:00Z',evidence:[{step:'document',status:'verified',remoteId:'doc',detail:'Comprobado'}]} as const;
  const status=googleIntegrationStatus(false,true,true,[{...older,evidence:[...older.evidence]},
    {id:'new',started_at:'2026-10-27T09:00:00Z',evidence:[
      {step:'email',status:'accepted',remoteId:'msg',detail:'Aceptado'},
      {step:'meeting',status:'verified',remoteId:'event',detail:'Comprobado'},
      {step:'document',status:'accepted',remoteId:'partial-doc',detail:'Falta contenido'},
      {step:'spreadsheet',status:'verified',remoteId:'simulated-sheet',detail:'Ficticio'},
    ]},
    {id:'no-date',started_at:null,evidence:[{step:'spreadsheet',status:'verified',remoteId:'sheet',detail:'Sin fecha'}]},
  ]);
  const byId=Object.fromEntries(status.map(item=>[item.id,item]));
  assert.equal(byId.gmail.state,'accepted');assert.match(byId.gmail.detail,/no acredita entrega/);
  assert.equal(byId.calendar.state,'verified');assert.equal(byId.docs.state,'incomplete');
  assert.equal(byId.docs.proposalId,'new');assert.equal(byId.sheets.state,'authorized');
});

test('integraciones: evidencia aislada por empresa e identidad, sin leer secretos ni llamar proveedores',async()=>{
  const db=await embeddedDatabase();await db.exec(teamSchema);
  try{
    const repo=new TeamRepository(db),user={uid:'integration-admin',email:'admin@ficticio.example'};
    const a=await repo.createSpace(user,'Empresa A'),b=await repo.createSpace(user,'Empresa B');
    const service=new CommercialService(repo,new DemoWorkspace(),false,true);
    for(const tenant of [a.id,b.id]){
      await repo.importSnapshot(tenant,user,makeFixture());
      await repo.system(tenant,sql=>sql.query('INSERT INTO team_google_connections VALUES($1,$2,$3,$4,$5,$6)',[tenant,'own@ficticio.example','own-subject',randomUUID(),'not-a-token','2099-01-01']));
    }
    const p=await service.prepare(a.id,user,'contact-1');
    await repo.system(a.id,sql=>sql.query("UPDATE team_sales_proposals SET started_at=$3,execution_account=$4::jsonb,evidence=$5::jsonb,status='uncertain' WHERE tenant_id=$1 AND id=$2",[a.id,p.id,'2026-10-27T09:00:00Z',JSON.stringify({subject:'own-subject',account:'own@ficticio.example'}),JSON.stringify([{step:'meeting',status:'verified',remoteId:'event-real-reference',detail:'Referencia sintética del test'}])]));
    assert.equal((await service.overview(a.id,user)).integrations.find(i=>i.id==='calendar')?.state,'verified');
    assert.ok((await service.overview(b.id,user)).integrations.every(i=>i.state==='authorized'));
    for(const [subject,account] of [['other-subject','own@ficticio.example'],['own-subject','other@ficticio.example']]){
      await repo.system(a.id,sql=>sql.query('UPDATE team_google_connections SET subject=$2,account=$3 WHERE tenant_id=$1',[a.id,subject,account]));
      assert.ok((await service.overview(a.id,user)).integrations.every(i=>i.state==='authorized'));
    }
    const outsider={uid:'outsider',email:'outsider@ficticio.example'};
    await assert.rejects(service.overview(a.id,outsider),/permiso|miembro|empresa/i);
    const {app}=await createTeamApp({db,migrate:false,origin:'https://planb.example',verify:async()=>outsider});
    try{
      assert.equal((await app.inject({url:'/api/team/spaces/'+a.id+'/v6/commercial'})).statusCode,401);
      assert.equal((await app.inject({url:'/api/team/spaces/'+a.id+'/v6/commercial',headers:{Authorization:'Bearer test'}})).statusCode,403);
    }finally{await app.close();}
  }finally{await db.close();}
});
