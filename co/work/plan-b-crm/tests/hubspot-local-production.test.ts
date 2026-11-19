import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes,randomUUID } from 'node:crypto';
import { embeddedDatabase } from '../server/team/database.js';
import { teamSchema } from '../server/team/schema.js';
import { TeamRepository } from '../server/team/repository.js';
import { TeamOAuth } from '../server/team/oauth.js';
import { open,seal } from '../server/crypto.js';
import { makeFixture } from '../shared/fixtures.js';

// Contract tests only: no provider, local vault, user session or live installation.
const operator={uid:'production-contract-admin',email:'contract@example.test'};
const review={accountId:'123',confirmedAccountId:'123',token:'contract-read-token',reviewed:true};
async function setup(){
  const db=await embeddedDatabase();await db.exec(teamSchema);
  const repo=new TeamRepository(db),space=await repo.createSpace(operator,'Contrato de lectura'),key=randomBytes(32);
  let accountType='STANDARD',portalId='123',calls=0,onAccount:undefined|(()=>Promise<void>);
  const fetcher:typeof fetch=async(input,init)=>{
    calls++;assert.equal(init?.method??'GET','GET');assert.equal(new URL(String(input)).origin,'https://api.hubapi.com');assert.equal(init?.redirect,'error');
    if(String(input).includes('/account-info/')){await onAccount?.();return Response.json({portalId,accountType});}
    if(String(input).includes('/objects/contacts/'))return Response.json({id:'42',properties:{firstname:'Contract'},associations:{}});
    return Response.json({results:[]});
  };
  return {db,repo,space,key,fetcher,oauth:new TeamOAuth(repo,null,fetcher,key),calls:()=>calls,type:(value:string)=>{accountType=value;},portal:(value:string)=>{portalId=value;},duringAccount:(fn:()=>Promise<void>)=>{onAccount=fn;}};
}

test('HubSpot real local: revisión exacta, permisos y vía exclusiva; ensayo sigue rechazando STANDARD',async()=>{
  const s=await setup();try{
    for(const input of [{...review,reviewed:false},{...review,confirmedAccountId:'456'},{...review,confirmedAccountId:undefined},{...review,extra:true}])await assert.rejects(s.oauth.connectPrivateProduction(s.space.id,operator,input));
    await assert.rejects(s.oauth.connectPrivateProduction(s.space.id,{uid:'outsider',email:'outsider@example.test'},review),/permiso/);
    await assert.rejects(new TeamOAuth(s.repo,null,s.fetcher).connectPrivateProduction(s.space.id,operator,review),/piloto local/);
    assert.equal(s.calls(),0);
    await assert.rejects(s.oauth.connectPrivate(s.space.id,operator,review.token,'123'),/tipo de cuenta/);
    assert.equal((await s.repo.overview(s.space.id,operator)).connection,null);
  }finally{await s.db.close();}
});

test('HubSpot real local: cifra autorización por portal, conserva otros espacios y captura en modo producción',async()=>{
  const s=await setup();try{
    const other=await s.repo.createSpace(operator,'Otra fuente');
    await s.oauth.connectPrivateProduction(s.space.id,operator,review);
    const secret=(await s.repo.system(s.space.id,sql=>sql.query<{secret:string}>('SELECT secret FROM team_connections WHERE tenant_id=$1',[s.space.id]))).rows[0].secret;
    assert.ok(!secret.includes(review.token));const payload=JSON.parse(open(secret,s.key));assert.equal(payload.kind,'private-production-readonly');assert.equal(payload.authorizedPortalId,'123');
    assert.ok(!JSON.stringify(await s.repo.overview(s.space.id,operator)).includes(review.token));assert.equal((await s.repo.overview(other.id,operator)).connection,null);
    const synthetic=makeFixture();synthetic.source.accountId='123';await assert.rejects(s.repo.importSnapshot(s.space.id,operator,synthetic),/portal real/);assert.equal((await s.repo.records(s.space.id,operator)).length,0);
    const before=s.calls();await assert.rejects(s.oauth.connectPrivateProduction(s.space.id,operator,review),/Desconecta/);assert.equal(s.calls(),before);
    assert.equal((await s.oauth.context(s.space.id,'42')).contactId,'42');
    s.type('DEVELOPER_TEST');await assert.rejects(s.oauth.capture(s.space.id),/tipo de cuenta/);
    await s.repo.system(s.space.id,sql=>sql.query('UPDATE team_connections SET secret=$2 WHERE tenant_id=$1',[s.space.id,seal(JSON.stringify({...payload,authorizedPortalId:'456'}),s.key)]));
    const prior=s.calls();await assert.rejects(s.oauth.context(s.space.id,'42'),/portal y modo/);assert.equal(s.calls(),prior);
  }finally{await s.db.close();}
});

test('HubSpot real local: rechaza portales o tipos distintos sin conservar la clave',async()=>{
  const s=await setup();try{
    s.portal('456');await assert.rejects(s.oauth.connectPrivateProduction(s.space.id,operator,review),/otro portal/);
    s.portal('123');s.type('SANDBOX');await assert.rejects(s.oauth.connectPrivateProduction(s.space.id,operator,review),/tipo de cuenta/);
    assert.equal((await s.repo.overview(s.space.id,operator)).connection,null);
  }finally{await s.db.close();}
});

test('HubSpot real local: impide mezclar ensayos y vuelve a comprobar el espacio tras la lectura remota',async()=>{
  const s=await setup();try{
    const historical=await s.repo.createSpace(operator,'Ensayo anterior');await s.repo.importSnapshot(historical.id,operator,makeFixture());
    await assert.rejects(s.oauth.connectPrivateProduction(historical.id,operator,review),/espacio nuevo/);assert.equal(s.calls(),0);
    s.duringAccount(async()=>{await s.repo.importSnapshot(s.space.id,operator,makeFixture());});
    await assert.rejects(s.oauth.connectPrivateProduction(s.space.id,operator,review),/espacio nuevo/);
    assert.equal((await s.repo.overview(s.space.id,operator)).connection,null);assert.equal((await s.repo.records(historical.id,operator)).length,62);assert.equal((await s.repo.records(s.space.id,operator)).length,62);
  }finally{await s.db.close();}
});

test('HubSpot real local: admite reconexión de su historial y rechaza cualquier captura de otro portal',async()=>{
  const s=await setup();try{
    const snapshot=makeFixture();snapshot.version=3;snapshot.source={...snapshot.source,kind:'hubspot',accountId:'123',environment:'production',isTestData:false,accountType:'STANDARD'};
    await s.repo.importSnapshot(s.space.id,operator,snapshot);
    await s.repo.system(s.space.id,sql=>sql.query('INSERT INTO team_captures VALUES($1,$2,$3::jsonb,now())',[s.space.id,randomUUID(),JSON.stringify(snapshot)]));
    await s.oauth.connectPrivateProduction(s.space.id,operator,review);await s.repo.disconnectHubspot(s.space.id,operator);
    await s.oauth.connectPrivateProduction(s.space.id,operator,review);await s.repo.disconnectHubspot(s.space.id,operator);
    const other=await s.repo.createSpace(operator,'Captura ajena');
    await s.repo.system(other.id,sql=>sql.query('INSERT INTO team_captures VALUES($1,$2,$3::jsonb,now())',[other.id,randomUUID(),JSON.stringify({...snapshot,source:{...snapshot.source,accountId:'456'}})]));
    const before=s.calls();await assert.rejects(s.oauth.connectPrivateProduction(other.id,operator,review),/espacio nuevo/);assert.equal(s.calls(),before);
  }finally{await s.db.close();}
});
