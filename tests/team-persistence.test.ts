import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, readFileSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { randomUUID } from 'node:crypto';
import { embeddedDatabase } from '../server/team/database.js';
import { teamSchema } from '../server/team/schema.js';
import { TeamRepository } from '../server/team/repository.js';
import { TeamJobs } from '../server/team/jobs.js';
import { createTeamApp } from '../server/team/app.js';
import { TeamSyncClient } from '../server/team-sync.js';
import { makeFixture } from '../shared/fixtures.js';
import { Store } from '../server/store.js';
test('equipo: reinicio de PostgreSQL en disco recupera cola y réplica cifrada reanuda una respuesta perdida',async()=>{
  const scratch=resolve('tests/.tmp');mkdirSync(scratch,{recursive:true});const folder=mkdtempSync(join(scratch,'team-persist-'));
  let db=await embeddedDatabase(join(folder,'postgres'));let local:Store|null=null;let app:Awaited<ReturnType<typeof createTeamApp>>['app']|undefined;
  try {
    await db.exec(teamSchema);let repo=new TeamRepository(db);const admin={uid:'disk-admin',email:'admin@disco.example'},space=await repo.createSpace(admin,'Ensayo persistente');await repo.importSnapshot(space.id,admin,makeFixture());
    const job=await new TeamJobs(repo).enqueue(space.id,admin,'sync-audit',randomUUID());
    await repo.system(space.id,sql=>sql.query("UPDATE team_jobs SET status='running',attempts=1,lease_until='2020-01-01' WHERE tenant_id=$1 AND id=$2",[space.id,job.id]));
    const device=await repo.pair(space.id,admin,'PC cifrado');await db.close();db=await embeddedDatabase(join(folder,'postgres'));repo=new TeamRepository(db);
    assert.equal((await new TeamJobs(repo).run(space.id,job.id)).status,'succeeded');
    app=(await createTeamApp({db,origin:'http://127.0.0.1:4328',demo:true,migrate:false})).app;
    let loseReply=true;
    const fetcher:typeof fetch=async(input,init)=>{const path=new URL(String(input)).pathname;const response=await app!.inject({url:path,method:(init?.method??'GET') as 'GET'|'POST',headers:init?.headers as Record<string,string>,payload:init?.body?JSON.parse(String(init.body)):undefined});if(path.endsWith('/exchange')&&loseReply){loseReply=false;throw new Error('Respuesta perdida después del commit');}return new Response(response.body,{status:response.statusCode});};
    const filename=join(folder,'local','planb.sqlite');local=new Store(filename);local.set('password',{configured:true});let client=new TeamSyncClient(local,'http://127.0.0.1:4328',true,fetcher);
    await client.link('http://127.0.0.1:4328',device.token,space.id);client.queue('contacts','contact-1',{phone:'600 555 222'});await assert.rejects(client.synchronize(),/sincronización/);assert.equal(client.status().pending,1);local.close();local=null;
    assert.ok(!readFileSync(filename).includes(Buffer.from(device.token)));
    local=new Store(filename);client=new TeamSyncClient(local,'http://127.0.0.1:4328',true,fetcher);await client.synchronize();assert.equal(client.status().pending,0);
    const record=(await repo.records(space.id,admin)).find(r=>r.id==='contact-1') as any;assert.equal(record.version,2);assert.equal(record.value.values.phone,'600 555 222');
  } finally {local?.close();await app?.close();await db.close();assert.ok(resolve(folder).startsWith(scratch+sep));rmSync(folder,{recursive:true,force:true});}
});
