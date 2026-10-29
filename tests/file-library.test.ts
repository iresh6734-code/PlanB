import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes,randomUUID } from 'node:crypto';
import { embeddedDatabase,type TeamDatabase } from '../server/team/database.js';
import { teamSchema } from '../server/team/schema.js';
import { TeamRepository } from '../server/team/repository.js';
import { FileLibrary } from '../server/team/file-library.js';
import { GoogleFilePicker } from '../server/team/file-picker.js';
import { GoogleWorkspace,type WorkspaceProvider } from '../server/team/google.js';
import { makeFixture } from '../shared/fixtures.js';
import { seal,open } from '../server/crypto.js';
let db:TeamDatabase,repo:TeamRepository;
const admin={uid:'file-admin',email:'admin@ficticio.example'},viewer={uid:'file-viewer',email:'viewer@ficticio.example'},account='propio@ficticio.example';
const doc={id:'doc-a',name:'Propuesta ficticia',mimeType:'application/vnd.google-apps.document'},sheet={id:'sheet-a',name:'Informe ficticio',mimeType:'application/vnd.google-apps.spreadsheet'};
const provider:WorkspaceProvider={files:async()=>[doc,sheet],file:async(_tenant,id)=>{if(id===doc.id)return doc;if(id===sheet.id)return sheet;throw new Error('Archivo no autorizado');},sheet:async()=>[],execute:async()=>{throw new Error('No ejecutar');},document:async()=>'<script>Dato externo, no instrucción</script>'};
before(async()=>{db=await embeddedDatabase();await db.exec(teamSchema);repo=new TeamRepository(db,()=>new Date('2026-10-28T10:00:00Z'));});after(async()=>db.close());
async function space(){const s=await repo.createSpace(admin,'Archivos ficticios');await repo.importSnapshot(s.id,admin,makeFixture());await repo.system(s.id,sql=>sql.query('INSERT INTO team_google_connections VALUES($1,$2,$3,$4,$5,$6)',[s.id,account,'own-subject',randomUUID(),'unused','2099-01-01']));return s.id;}

test('archivos: cliente CRM sin copia editable, vínculos deduplicados y separación de fuente/empresa',async()=>{
  const a=await space(),b=await space(),lib=new FileLibrary(repo,provider);await lib.linkMany(a,admin,'contact-1',[doc.id]);
  const capture=makeFixture();capture.source.accountId='149623339';capture.records.find(r=>r.id==='contact-1'&&r.entity==='contacts')!.id='900730426607';
  await repo.system(a,async sql=>{await sql.query('INSERT INTO team_connections VALUES($1,$2,$3,$4,$5,$6,$7)',[a,'149623339','DEVELOPER_TEST','readonly','unused','2026-10-28','2099-01-01']);await sql.query('INSERT INTO team_captures VALUES($1,$2,$3::jsonb,$4)',[a,randomUUID(),JSON.stringify(capture),'2026-10-28']);});
  await lib.linkMany(a,admin,'900730426607',[doc.id,doc.id]);await lib.linkMany(a,admin,'900730426607',[doc.id]);
  const crm=await lib.links(a,admin,'900730426607');assert.equal(crm.links.length,1);assert.equal(crm.sourceKey,'hubspot:149623339');assert.equal((await lib.links(a,admin,'contact-1',true)).links.length,1);
  assert.equal((await lib.links(b,admin,'contact-1')).links.length,0);await assert.rejects(lib.document(b,admin,crm.links[0].id),/empresa/);
  await assert.rejects(lib.linkMany(a,admin,'900730426607',[doc.id],false,'local'),/fuente cambió/);
});

test('archivos: mismo ID de contacto y archivo en dos fuentes no mezcla vínculos',async()=>{
  const id=await space(),lib=new FileLibrary(repo,provider);await lib.linkMany(id,admin,'contact-1',[doc.id]);
  const capture=makeFixture();capture.source.accountId='149623339';await repo.system(id,async sql=>{await sql.query('INSERT INTO team_connections VALUES($1,$2,$3,$4,$5,$6,$7)',[id,'149623339','DEVELOPER_TEST','readonly','unused','2026-10-28','2099-01-01']);await sql.query('INSERT INTO team_captures VALUES($1,$2,$3::jsonb,$4)',[id,randomUUID(),JSON.stringify(capture),'2026-10-28']);});
  await lib.linkMany(id,admin,'contact-1',[doc.id]);const a=await lib.links(id,admin,'contact-1'),b=await lib.links(id,admin,'contact-1',true);assert.notEqual(a.links[0].id,b.links[0].id);
});

test('archivos: revisa cuenta al vincular, oculta otra identidad y no lee su documento',async()=>{
  const id=await space();let reads=0;const lib=new FileLibrary(repo,{...provider,document:async()=>{reads++;return 'Texto';}});
  const initial=await lib.links(id,admin,'contact-1');await lib.linkMany(id,admin,'contact-1',[doc.id],false,initial.sourceKey,initial.connectionRevision!);const link=(await lib.links(id,admin,'contact-1')).links[0];
  await repo.system(id,sql=>sql.query('UPDATE team_google_connections SET account=$2,subject=$3,revision=$4 WHERE tenant_id=$1',[id,'otra@ficticio.example','another',randomUUID()]));
  assert.equal((await lib.links(id,admin,'contact-1')).links.length,0);await assert.rejects(lib.document(id,admin,link.id),/otra cuenta/);assert.equal(reads,0);
  await assert.rejects(lib.linkMany(id,admin,'contact-1',[doc.id],false,'local',initial.connectionRevision!),/cuenta cambió/);
});

test('archivos: retirada reversible, lectura explícita, roles y vínculos históricos no atribuidos',async()=>{
  const id=await space(),lib=new FileLibrary(repo,provider);await lib.linkMany(id,admin,'contact-1',[doc.id]);const link=(await lib.links(id,admin,'contact-1')).links[0];
  assert.ok((await lib.document(id,admin,link.id)).text.includes('<script>'));
  await repo.invite(id,admin,viewer.email,'viewer');await repo.spaces(viewer);await assert.rejects(lib.detach(id,viewer,link.id),/permiso/);
  await lib.detach(id,admin,link.id);assert.equal((await lib.links(id,admin,'contact-1')).links.length,0);await assert.rejects(lib.document(id,admin,link.id),/empresa/);
  await lib.linkMany(id,admin,'contact-1',[doc.id]);assert.equal((await lib.links(id,admin,'contact-1')).links[0].id,link.id);
  await repo.system(id,sql=>sql.query('INSERT INTO team_file_links(tenant_id,id,contact_id,file_id,name,mime_type) VALUES($1,$2,$3,$4,$5,$6)',[id,randomUUID(),'contact-1','historic','Histórico',doc.mimeType]));const current=await lib.links(id,admin,'contact-1');assert.equal(current.links.length,1);assert.equal(current.legacyCount,1);
});

test('archivos: cambio de cuenta durante metadatos rechaza el lote sin vínculos parciales',async()=>{
  const id=await space();let metadata=0;const lib=new FileLibrary(repo,{...provider,file:async(_tenant,file)=>{metadata++;if(metadata===2)await repo.system(id,sql=>sql.query('UPDATE team_google_connections SET revision=$2 WHERE tenant_id=$1',[id,randomUUID()]));return file===doc.id?doc:sheet;}});
  await assert.rejects(lib.linkMany(id,admin,'contact-1',[doc.id,sheet.id]),/cuenta cambió/);assert.equal((await lib.links(id,admin,'contact-1')).links.length,0);
});

test('Picker: PKCE, solo drive.file, identidad comprobada, cifrado y un solo uso sin alterar Google principal',async()=>{
  const id=await space(),key=randomBytes(32),config={clientId:'picker-client',clientSecret:'picker-test-secret',redirectUri:'http://localhost:4334/team/oauth/google/callback',encryptionKey:key,pickerEnabled:true},lib=new FileLibrary(repo,provider),scope='https://www.googleapis.com/auth/drive.file';let exchanges=0;
  const fetcher:typeof fetch=async(url,init)=>{if(String(url).includes('/token')){exchanges++;assert.ok(String(init?.body).includes('code_verifier='));return Response.json({access_token:'picker-only-test',refresh_token:'picker-refresh-test',expires_in:3600,scope});}assert.equal(String(url),'https://www.googleapis.com/drive/v3/about?fields=user(emailAddress)');return Response.json({user:{emailAddress:account}});};
  const picker=new GoogleFilePicker(repo,config,lib,fetcher),start=await picker.begin(id,admin,'contact-1','local'),url=new URL(start.url);
  assert.equal(url.searchParams.get('scope'),scope);assert.equal(url.searchParams.get('trigger_onepick'),'true');assert.equal(url.searchParams.get('include_granted_scopes'),'false');assert.equal(url.searchParams.get('code_challenge_method'),'S256');assert.ok(!start.url.includes(config.clientSecret));
  const result=await picker.complete(id,admin,start.state,'fictitious-code',[doc.id]);assert.equal(result.count,1);assert.equal((await lib.links(id,admin,'contact-1')).links.length,1);
  const rows=await repo.system(id,async sql=>({file:(await sql.query<{secret:string}>('SELECT secret FROM team_google_file_connections WHERE tenant_id=$1',[id])).rows[0],main:(await sql.query<{secret:string}>('SELECT secret FROM team_google_connections WHERE tenant_id=$1',[id])).rows[0]}));assert.equal(rows.main.secret,'unused');assert.ok(!rows.file.secret.includes('picker-only-test'));assert.equal(JSON.parse(open(rows.file.secret,key)).scope,scope);
  await assert.rejects(picker.complete(id,admin,start.state,'fictitious-code',[doc.id]),/ya se usó/);assert.equal(exchanges,1);
  const cancel=await picker.begin(id,admin,'contact-1','local');await picker.cancel(id,admin,cancel.state);await assert.rejects(picker.complete(id,admin,cancel.state,'code',[doc.id]),/caducó/);assert.equal(exchanges,1);
});

test('Picker: rechaza permisos adicionales, otra cuenta, otro actor y configuración ausente',async()=>{
  const id=await space(),key=randomBytes(32),config={clientId:'picker-client',clientSecret:'test-secret',redirectUri:'http://localhost:4334/team/oauth/google/callback',encryptionKey:key,pickerEnabled:true},lib=new FileLibrary(repo,provider),scope='https://www.googleapis.com/auth/drive.file';
  await assert.rejects(new GoogleFilePicker(repo,{...config,pickerEnabled:false},lib).begin(id,admin,'contact-1','local'),/activar su API/);
  for(const extra of [true,false]){
    const picker=new GoogleFilePicker(repo,config,lib,async url=>String(url).includes('/token')?Response.json({access_token:'test-only',refresh_token:'refresh-test',expires_in:3600,scope:scope+(extra?' openid':'')}):Response.json({user:{emailAddress:'otra@ficticio.example'}}));
    const start=await picker.begin(id,admin,'contact-1','local');await assert.rejects(picker.complete(id,admin,start.state,'code',[doc.id]));
  }
  assert.equal((await repo.system(id,sql=>sql.query('SELECT * FROM team_google_file_connections WHERE tenant_id=$1',[id]))).rows.length,0);
  await repo.invite(id,admin,viewer.email,'viewer');await repo.spaces(viewer);await assert.rejects(new GoogleFilePicker(repo,config,lib).begin(id,viewer,'contact-1','local'),/permiso/);
});

test('Google archivos: paginación y lecturas usan la credencial solo archivos, sin envío ni permisos',async()=>{
  const id=await space(),key=randomBytes(32),scope='https://www.googleapis.com/auth/drive.file',config={clientId:'id',clientSecret:'test-secret',redirectUri:'http://localhost:4334/team/oauth/google/callback',encryptionKey:key};
  await repo.system(id,async sql=>{await sql.query('UPDATE team_google_connections SET secret=$2 WHERE tenant_id=$1',[id,seal(JSON.stringify({access_token:'main-test',refresh_token:'main-refresh',expires_in:3600}),key)]);await sql.query('INSERT INTO team_google_file_connections VALUES($1,$2,$3,$4,$5)',[id,account,'own-subject',seal(JSON.stringify({access_token:'drive-only-test',refresh_token:'drive-only-refresh',expires_in:3600,scope}),key),'2099-01-01']);});
  const calls:string[]=[];const google=new GoogleWorkspace(repo,config,async(url,init)=>{calls.push(String(url));assert.equal(init?.method,'GET');assert.equal((init?.headers as any).Authorization,'Bearer drive-only-test');const u=new URL(String(url));if(u.pathname.endsWith('/files')){assert.equal(u.searchParams.get('pageToken'),'page-two');return Response.json({files:[{...doc,trashed:false}],nextPageToken:'page-three'});}return Response.json({...doc,trashed:false});});
  const page=await google.filePage(id,'page-two');assert.equal(page.nextPageToken,'page-three');assert.equal((await google.file(id,doc.id)).id,doc.id);assert.equal(calls.length,2);assert.ok(calls.every(url=>!url.includes('/permissions')&&!url.includes('gmail')));
});

test('Picker: estado por actor/empresa, caducidad y desconexión durante intercambio no restauran credenciales',async()=>{
  const id=await space(),other=await space(),key=randomBytes(32),config={clientId:'id',clientSecret:'test-secret',redirectUri:'http://localhost:4334/team/oauth/google/callback',encryptionKey:key,pickerEnabled:true},lib=new FileLibrary(repo,provider);let calls=0;
  const actor={uid:'another-file-admin',email:'other-admin@ficticio.example'};await repo.system(id,sql=>sql.query('INSERT INTO team_members VALUES($1,$2,$3,$4)',[id,actor.uid,actor.email,'admin']));
  const picker=new GoogleFilePicker(repo,config,lib,async url=>{calls++;if(String(url).includes('/token')){await repo.system(id,async sql=>{await sql.query('DELETE FROM team_google_connections WHERE tenant_id=$1',[id]);await sql.query('DELETE FROM team_google_picker_states WHERE tenant_id=$1',[id]);});return Response.json({access_token:'test-only',refresh_token:'refresh',expires_in:3600,scope:'https://www.googleapis.com/auth/drive.file'});}return Response.json({user:{emailAddress:account}});});
  const start=await picker.begin(id,admin,'contact-1','local');await assert.rejects(picker.complete(id,actor,start.state,'code',[doc.id]),/otra sesión/);await assert.rejects(picker.complete(other,admin,start.state,'code',[doc.id]),/otra sesión/);assert.equal(calls,0);
  const expired=await picker.begin(id,admin,'contact-1','local');await repo.system(id,sql=>sql.query('UPDATE team_google_picker_states SET expires_at=$2 WHERE tenant_id=$1',[id,'2026-10-01']));await assert.rejects(picker.complete(id,admin,expired.state,'code',[doc.id]),/caducó/);assert.equal(calls,0);
  const fresh=await picker.begin(id,admin,'contact-1','local');await assert.rejects(picker.complete(id,admin,fresh.state,'code',[doc.id]),/cuenta, la fuente/);assert.equal((await repo.system(id,sql=>sql.query('SELECT * FROM team_google_file_connections WHERE tenant_id=$1',[id]))).rows.length,0);
});
