import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {embeddedDatabase,type TeamDatabase} from '../server/team/database.js';
import {teamSchema} from '../server/team/schema.js';
import {TeamRepository} from '../server/team/repository.js';
import {TeamOAuth} from '../server/team/oauth.js';
import {makeFixture} from '../shared/fixtures.js';
import {open} from '../server/crypto.js';
let db:TeamDatabase,repo:TeamRepository;
const user={uid:'oauth-isolation-contract',email:'oauth@example.test'};
before(async()=>{db=await embeddedDatabase();await db.exec(teamSchema);repo=new TeamRepository(db);});
after(async()=>{await db?.close();});
async function setup(type='STANDARD'){
  const space=await repo.createSpace(user,'OAuth isolated'),key=randomBytes(32);let calls=0,onAccount:(()=>Promise<void>)|undefined,triggered=false;
  const fetcher:typeof fetch=async(input,init)=>{
    calls++;const path=new URL(String(input)).pathname;assert.equal(init?.redirect,'error');
    if(path==='/oauth/v3/token'){assert.equal(init?.method,'POST');return Response.json({access_token:'synthetic-oauth-access',refresh_token:'synthetic-oauth-refresh',expires_in:1800,hub_id:123,scopes:['oauth','crm.objects.contacts.read']});}
    assert.equal(init?.method??'GET','GET');
    if(path.includes('account-info')){if(!triggered){triggered=true;await onAccount?.();}return Response.json({portalId:123,accountType:type});}
    return Response.json({results:[]});
  };
  const oauth=new TeamOAuth(repo,{clientId:'contract-client',clientSecret:'contract-secret',redirectUri:'https://contract.example/team/oauth/hubspot/callback',encryptionKey:key},fetcher);
  return {space,oauth,key,calls:()=>calls,duringRead:(fn:()=>Promise<void>)=>{onAccount=fn;},begin:()=>oauth.begin(space.id,user,'123')};
}
test('OAuth STANDARD: espacio vacío, credencial cifrada y state de un solo uso',async()=>{
  const s=await setup(),start=await s.begin();await s.oauth.complete(s.space.id,user,start.state,'synthetic-code');
  const row=(await repo.system(s.space.id,sql=>sql.query<{secret:string;account_id:string}>('SELECT secret,account_id FROM team_connections WHERE tenant_id=$1',[s.space.id]))).rows[0];
  assert.equal(row.account_id,'123');assert.ok(!row.secret.includes('synthetic-oauth-access'));assert.equal(JSON.parse(open(row.secret,s.key)).access_token,'synthetic-oauth-access');
  const before=s.calls();await assert.rejects(s.oauth.complete(s.space.id,user,start.state,'same-code'),/caducó/);assert.equal(s.calls(),before);
});
test('OAuth STANDARD: rechaza historial de ensayo y conserva los registros',async()=>{
  const s=await setup();await repo.importSnapshot(s.space.id,user,makeFixture());const start=await s.begin();
  await assert.rejects(s.oauth.complete(s.space.id,user,start.state,'code'),/espacio nuevo/);
  assert.equal((await repo.overview(s.space.id,user)).connection,null);assert.equal((await repo.records(s.space.id,user)).length,62);
});
test('OAuth STANDARD: rechaza captura de otro portal aunque no haya filas locales',async()=>{
  const s=await setup(),snapshot=makeFixture();snapshot.version=3;snapshot.source={...snapshot.source,kind:'hubspot',isTestData:false,environment:'production',accountType:'STANDARD',accountId:'456'};
  await repo.system(s.space.id,sql=>sql.query('INSERT INTO team_captures VALUES($1,$2,$3::jsonb,now())',[s.space.id,randomUUID(),JSON.stringify(snapshot)]));const start=await s.begin();
  await assert.rejects(s.oauth.complete(s.space.id,user,start.state,'code'),/espacio nuevo/);assert.equal((await repo.overview(s.space.id,user)).connection,null);
});
test('OAuth STANDARD: detecta importación de ensayo durante la comprobación remota',async()=>{
  const s=await setup(),start=await s.begin();s.duringRead(()=>repo.importSnapshot(s.space.id,user,makeFixture()).then(()=>{}));
  await assert.rejects(s.oauth.complete(s.space.id,user,start.state,'code'),/espacio nuevo/);assert.equal((await repo.overview(s.space.id,user)).connection,null);assert.equal((await repo.records(s.space.id,user)).length,62);
});
test('OAuth STANDARD: mismo historial de producción admite conexión y renovación revisada',async()=>{
  const s=await setup(),snapshot=makeFixture();snapshot.version=3;snapshot.source={...snapshot.source,kind:'hubspot',isTestData:false,environment:'production',accountType:'STANDARD',accountId:'123'};await repo.importSnapshot(s.space.id,user,snapshot);
  for(let i=0;i<2;i++){const start=await s.begin();await s.oauth.complete(s.space.id,user,start.state,'code');}
  assert.equal((await repo.overview(s.space.id,user)).connection?.account_id,'123');assert.equal((await repo.records(s.space.id,user)).length,62);
});
test('OAuth: no sustituye otro portal ni guarda autorización retirada durante lectura',async()=>{
  const s=await setup();await repo.system(s.space.id,sql=>sql.query('INSERT INTO team_connections VALUES($1,$2,$3,$4,$5,now(),now())',[s.space.id,'456','STANDARD','readonly','synthetic-unchanged-secret']));const start=await s.begin();
  await assert.rejects(s.oauth.complete(s.space.id,user,start.state,'code'),/otro portal/);const prior=(await repo.system(s.space.id,sql=>sql.query<{secret:string}>('SELECT secret FROM team_connections WHERE tenant_id=$1',[s.space.id]))).rows[0];assert.equal(prior.secret,'synthetic-unchanged-secret');
  const cancelled=await setup(),cancelStart=await cancelled.begin();cancelled.duringRead(()=>repo.disconnectHubspot(cancelled.space.id,user).then(()=>{}));await assert.rejects(cancelled.oauth.complete(cancelled.space.id,user,cancelStart.state,'code'),/retirada/);assert.equal((await repo.overview(cancelled.space.id,user)).connection,null);
});
test('OAuth: no consume el state desde otra empresa y conserva modo de ensayo',async()=>{
  const s=await setup('DEVELOPER_TEST'),snapshot=makeFixture();snapshot.source.accountId='123';await repo.importSnapshot(s.space.id,user,snapshot);const start=await s.begin(),other=await repo.createSpace(user,'Other company');
  await assert.rejects(s.oauth.complete(other.id,user,start.state,'code'),/caducó/);assert.equal(s.calls(),0);await s.oauth.complete(s.space.id,user,start.state,'code');assert.equal((await repo.overview(s.space.id,user)).connection?.account_id,'123');assert.equal((await repo.overview(other.id,user)).connection,null);
});
