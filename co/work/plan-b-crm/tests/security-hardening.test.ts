import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes,randomUUID } from 'node:crypto';
import { mkdirSync,mkdtempSync } from 'node:fs';
import { join,resolve } from 'node:path';
import { embeddedDatabase,type TeamDatabase } from '../server/team/database.js';
import { teamSchema } from '../server/team/schema.js';
import { TeamRepository } from '../server/team/repository.js';
import { CommercialService } from '../server/team/commercial.js';
import { DemoWorkspace,GoogleWorkspace,googleScopes,type WorkspaceProvider } from '../server/team/google.js';
import { createTeamApp } from '../server/team/app.js';
import { makeFixture } from '../shared/fixtures.js';
import { SheetPreviewSchema } from '../shared/commercial.js';
import { seal } from '../server/crypto.js';
import { csvCell } from '../server/app.js';

// Hallazgos de la auditoría de seguridad independiente (CLAUDE-SEC-027). Cada prueba reproduce un fallo confirmado.
let db:TeamDatabase,repo:TeamRepository,now=Date.now();
const admin={uid:'sec-admin',email:'admin@ficticio.example'};
const DAY=86_400_000;
before(async()=>{db=await embeddedDatabase();await db.exec(teamSchema);repo=new TeamRepository(db,()=>new Date(now));});
after(async()=>db.close());
async function space(){const s=await repo.createSpace(admin,'Seguridad ficticia');await repo.importSnapshot(s.id,admin,makeFixture());return s.id;}

// ---------- A1 · el bloqueo de rutas del piloto no se evade con query ni percent-encoding ----------
test('A1 piloto local: invitaciones, miembros, dispositivos y device/* siguen bloqueados con query o percent-encoding',async()=>{
  const root=resolve('tests/.tmp');mkdirSync(root,{recursive:true});const folder=mkdtempSync(join(root,'sec-pilot-'));
  const origin='http://localhost:4334',key=randomBytes(32),password='synthetic-test-password-local';
  const {app}=await createTeamApp({db:await embeddedDatabase(),origin,localPilot:{folder,key,clock:()=>now}});
  try{
    const request=(path:string,body?:Record<string,unknown>,cookie='')=>app.inject({url:path,method:body?'POST':'GET',headers:{host:'localhost:4334',...(body?{origin}:{}),cookie},payload:body});
    const setup=await request('/api/team/local-pilot/setup',{password});assert.equal(setup.statusCode,200);const cookie=String(setup.headers['set-cookie']).split(';')[0];
    const created=await request('/api/team/spaces',{name:'Piloto ficticio'},cookie);assert.equal(created.statusCode,200);const id=created.json().id;
    const base='/api/team/spaces/'+id;
    for(const path of [base+'/devices',base+'/devices?q=1',base+'/devices/',base+'/invites?x=1',base+'/members?x=1',base+'/%69nvites',base+'/devic%65s']){
      const response=await request(path,{name:'Copia',email:'otra@ficticio.example',role:'sales'},cookie);assert.equal(response.statusCode,403,'POST '+path);
    }
    for(const path of ['/api/team/device/bootstrap','/api/team/devic%65/bootstrap','/api/team/%64evice/bootstrap','/api/team/device/bootstrap?x=1']){
      const response=await request(path,undefined,cookie);assert.equal(response.statusCode,403,'GET '+path);
    }
    assert.equal((await request(base,undefined,cookie)).statusCode,200,'la ruta normal de la empresa sigue funcionando');
  }finally{await app.close();}
});

// ---------- A4 · cuerpos inválidos o demasiado grandes ----------
test('A4 los cuerpos inválidos dan 400 y los demasiado grandes 413, sin 500 ni detalles internos',async()=>{
  const {app}=await createTeamApp({db,migrate:false,origin:'https://planb.example',verify:async()=>admin});
  try{
    const headers={authorization:'Bearer prueba','content-type':'application/json'};
    const bad=await app.inject({method:'POST',url:'/api/team/spaces',headers,payload:'{no es json'});
    assert.equal(bad.statusCode,400);assert.ok(!/FST_|SyntaxError|at /.test(bad.body));
    const huge=await app.inject({method:'POST',url:'/api/team/spaces',headers,payload:JSON.stringify({name:'x'.repeat(21_000_000)})});
    assert.equal(huge.statusCode,413);assert.ok(!/FST_|at /.test(huge.body));
    const unknown=await app.inject({method:'POST',url:'/api/team/spaces',headers,payload:JSON.stringify({name:'Ok'})});assert.equal(unknown.statusCode,200,'una petición normal no se ve afectada');
  }finally{await app.close();}
});

// ---------- B3 · accountId sin tope ----------
test('B3 el inicio OAuth de HubSpot rechaza un accountId desmesurado antes de guardar nada',async()=>{
  const id=await space();
  const {app}=await createTeamApp({db,migrate:false,origin:'https://planb.example',verify:async()=>admin});
  try{
    const post=(accountId:string)=>app.inject({method:'POST',url:'/api/team/spaces/'+id+'/oauth/hubspot/begin',headers:{authorization:'Bearer prueba'},payload:{accountId,authorizedRead:true}});
    assert.equal((await post('1'.repeat(21))).statusCode,422);assert.equal((await post('9'.repeat(5000))).statusCode,422);
    const states=await repo.system(id,sql=>sql.query('SELECT 1 FROM team_oauth_states WHERE tenant_id=$1',[id]));assert.equal(states.rows.length,0,'no se guardó ningún estado');
  }finally{await app.close();}
});

// ---------- C1 · caducidad de la aprobación y reunión futura al ejecutar ----------
async function approvedWithMeeting(service:CommercialService,id:string,startsInMs=DAY){
  const draft=await service.prepare(id,admin,'contact-1');let p=(await service.overview(id,admin)).proposals.find(x=>x.id===draft.id)!;
  await service.edit(id,admin,p.id,{...p.content,meeting:true,start:new Date(now+startsInMs).toISOString(),end:new Date(now+startsInMs+1800000).toISOString()});
  p=(await service.overview(id,admin)).proposals.find(x=>x.id===draft.id)!;await service.approve(id,admin,p.id,p.content_hash);return (await service.overview(id,admin)).proposals.find(x=>x.id===draft.id)!;
}
test('C1 una aprobación caducada (24 h) no se ejecuta y hay que volver a aprobar',async()=>{
  now=Date.now();const id=await space(),service=new CommercialService(repo,new DemoWorkspace(),true),p=await approvedWithMeeting(service,id);
  now+=25*3600_000;await assert.rejects(service.execute(id,admin,p.id,p.content_hash),(error:any)=>error.status===409&&/caduc/i.test(error.message));
  assert.equal((await service.overview(id,admin)).tasks.length,0,'no se ejecutó nada');
});
test('C1 si la reunión ya pasó al ejecutar, no se envía la invitación aunque la aprobación siga vigente',async()=>{
  now=Date.now();const id=await space(),service=new CommercialService(repo,new DemoWorkspace(),true),p=await approvedWithMeeting(service,id,3600_000);
  now+=2*3600_000;await assert.rejects(service.execute(id,admin,p.id,p.content_hash),(error:any)=>error.status===409&&/reunión ya pasó/i.test(error.message));
  assert.equal((await service.overview(id,admin)).tasks.length,0);
});
test('C1 una aprobación vigente con reunión futura se ejecuta con normalidad',async()=>{
  now=Date.now();const id=await space(),service=new CommercialService(repo,new DemoWorkspace(),true),p=await approvedWithMeeting(service,id);
  now+=3600_000;assert.equal((await service.execute(id,admin,p.id,p.content_hash)).status,'verified');
});

// ---------- C2 · fórmulas en el CSV ----------
test('C2 el CSV neutraliza celdas que una hoja de cálculo ejecutaría como fórmula',()=>{
  for(const value of ['=HYPERLINK("http://x")','+cmd|x','-2+3','@SUM(A1)','\t=1','\r=1'])assert.match(csvCell(value),/^"'/,JSON.stringify(value));
  assert.equal(csvCell('Ana'),'"Ana"');assert.equal(csvCell(null),'""');assert.equal(csvCell('{"a":1}'),'"{""a"":1}"');
  assert.equal(csvCell('-5'),'"-5"','un número negativo no es una fórmula');assert.equal(csvCell('3.14'),'"3.14"');assert.equal(csvCell('di "hola"'),'"di ""hola"""');
});

// ---------- C3 · vistas previas de Sheets acotadas ----------
test('C3 las celdas desmesuradas de una hoja se acotan y solo se conservan las 20 vistas previas pendientes más recientes',async()=>{
  const id=await space(),big=(n:number)=>'9'.repeat(n);
  const provider:WorkspaceProvider=Object.assign(new DemoWorkspace(),{sheet:async()=>[['Nombre','Apellidos','Correo','Teléfono'],['Ana',big(50000),'ana.sec@ficticio.example',big(50000)]]});
  const service=new CommercialService(repo,provider,true),selection=SheetPreviewSchema.parse({fileId:'hoja-ficticia',range:'A1:D101',mapping:{firstname:0,lastname:1,email:2,phone:3}});
  const first=await service.preview(id,admin,selection);assert.ok(first.rows[0].values.lastname.length<=100);assert.ok(first.rows[0].values.phone.length<=100);
  const ids=[first.id];for(let index=1;index<25;index++)ids.push((await service.preview(id,admin,selection)).id);
  const kept=(await repo.system(id,sql=>sql.query<{id:string}>("SELECT id FROM team_sheet_previews WHERE tenant_id=$1 AND status='review'",[id]))).rows.map(row=>row.id);
  assert.equal(kept.length,20,'nunca bloquea: se conservan las 20 más recientes');assert.ok(kept.includes(ids[24])&&!kept.includes(ids[0]),'se descartan las más antiguas');
  const other=await space();await service.preview(other,admin,selection);
});
test('C3 la lectura real de Sheets recorta cada celda',async()=>{
  const id=await space(),key=randomBytes(32),config={clientId:'c',clientSecret:'s',redirectUri:'https://planb.example/cb',encryptionKey:key};
  await repo.system(id,sql=>sql.query('INSERT INTO team_google_connections VALUES($1,$2,$3,$4,$5,$6)',[id,'g@ficticio.example','sub',randomUUID(),seal(JSON.stringify({access_token:'a',refresh_token:'r',scope:googleScopes.join(' '),expires_in:3600}),key),'2099-01-01']));
  const fetcher:typeof fetch=async()=>Response.json({values:[['x'.repeat(60000),'ok']]});
  const rows=await new GoogleWorkspace(repo,config,fetcher).sheet(id,'hoja','A1:B1');assert.ok(rows[0][0].length<=1000);assert.equal(rows[0][1],'ok');
});

// ---------- B1 · desconectar Google revoca el token en el proveedor ----------
test('B1 desconectar Google revoca el refresh token y un fallo de la revocación no impide desconectar',async()=>{
  for(const failing of [false,true]){
    const id=await space(),key=randomBytes(32),config={clientId:'c',clientSecret:'s',redirectUri:'https://planb.example/cb',encryptionKey:key};
    await repo.system(id,sql=>sql.query('INSERT INTO team_google_connections VALUES($1,$2,$3,$4,$5,$6)',[id,'g@ficticio.example','sub',randomUUID(),seal(JSON.stringify({access_token:'access-ficticio',refresh_token:'refresh-ficticio-'+failing,scope:googleScopes.join(' '),expires_in:3600}),key),'2099-01-01']));
    const calls:{url:string;method?:string;body:string}[]=[];
    const fetcher:typeof fetch=async(input,init)=>{calls.push({url:String(input),method:init?.method,body:String(init?.body??'')});if(failing)throw new Error('sin red');return new Response('',{status:200});};
    const google=new GoogleWorkspace(repo,config,fetcher);assert.deepEqual(await google.disconnect(id,admin),{disconnected:true});
    const revoke=calls.filter(call=>call.url==='https://oauth2.googleapis.com/revoke');assert.equal(revoke.length,1);assert.equal(revoke[0].method,'POST');assert.equal(new URLSearchParams(revoke[0].body).get('token'),'refresh-ficticio-'+failing);
    assert.ok(!revoke[0].body.includes('s&')&&!revoke[0].body.includes('client_secret'),'sin el secreto del cliente');
    assert.equal((await new CommercialService(repo,google).overview(id,admin)).connection,null,'la conexión se retiró aunque la revocación fallara');
  }
});

// ---------- A3 · las invitaciones caducan ----------
test('A3 una invitación caduca a los 14 días y se puede canjear antes',async()=>{
  now=Date.now();const id=await space(),fresh={uid:'invitado-reciente',email:'reciente@ficticio.example'},old={uid:'invitado-antiguo',email:'antiguo@ficticio.example'};
  await repo.invite(id,admin,fresh.email,'viewer');await repo.invite(id,admin,old.email,'manager');
  assert.equal((await repo.spaces(fresh)).length,1,'dentro de plazo se canjea');
  now+=15*DAY;assert.equal((await repo.spaces(old)).length,0,'caducada: no concede acceso');
  await repo.invite(id,admin,old.email,'viewer');assert.equal((await repo.spaces(old)).length,1,'invitar de nuevo renueva el plazo');
});

// ---------- A5 · la auditoría y los eventos no se pueden modificar con el rol acotado ----------
test('A5 el rol acotado no puede actualizar ni borrar la auditoría ni los eventos, pero sí escribir en ellos',async()=>{
  const id=await space();
  for(const table of ['team_audit','team_events']){
    await assert.rejects(repo.scoped(id,admin,'read',sql=>sql.query('DELETE FROM '+table+' WHERE tenant_id=$1',[id])),/permission denied|permiso/i,'DELETE '+table);
    await assert.rejects(repo.scoped(id,admin,'read',sql=>sql.query(table==='team_audit'?"UPDATE team_audit SET actor='x' WHERE tenant_id=$1":"UPDATE team_events SET actor='x' WHERE tenant_id=$1",[id])),/permission denied|permiso/i,'UPDATE '+table);
  }
  assert.ok((await repo.scoped(id,admin,'read',sql=>sql.query('SELECT 1 FROM team_audit WHERE tenant_id=$1',[id]))).rows.length>0,'la auditoría sigue legible');
});

test('C3 las vistas previas de más de 24 h se limpian',async()=>{
  const id=await space(),service=new CommercialService(repo,new DemoWorkspace(),true),selection=SheetPreviewSchema.parse({fileId:'ensayo-contactos',range:'A1:D101',mapping:{firstname:0,lastname:1,email:2,phone:3}});
  const old=await service.preview(id,admin,selection);
  await repo.system(id,sql=>sql.query("UPDATE team_sheet_previews SET created_at=now()-interval '25 hours' WHERE tenant_id=$1 AND id=$2",[id,old.id]));
  const fresh=await service.preview(id,admin,selection);
  const kept=(await repo.system(id,sql=>sql.query<{id:string}>("SELECT id FROM team_sheet_previews WHERE tenant_id=$1",[id]))).rows.map(row=>row.id);assert.deepEqual(kept,[fresh.id]);
});

// ---------- A5 en una base que ya tenía los permisos antiguos ----------
test('A5 al reejecutar el esquema sobre una base con los permisos antiguos se retiran UPDATE y DELETE',async()=>{
  const legacy=await embeddedDatabase();
  try{
    await legacy.exec(teamSchema);await legacy.exec('GRANT UPDATE,DELETE ON team_audit,team_events TO planb_scoped');
    const old=new TeamRepository(legacy);const id=(await old.createSpace(admin,'Base antigua')).id;
    await old.scoped(id,admin,'read',sql=>sql.query("UPDATE team_audit SET actor='x' WHERE tenant_id=$1",[id]));
    await legacy.exec(teamSchema);
    for(const sentence of ["DELETE FROM team_audit WHERE tenant_id=$1","UPDATE team_events SET actor='x' WHERE tenant_id=$1","DELETE FROM team_events WHERE tenant_id=$1"])await assert.rejects(old.scoped(id,admin,'read',sql=>sql.query(sentence,[id])),/permission denied|permiso/i,sentence);
  }finally{await legacy.close();}
});

// ---------- aprobaciones anteriores a la regla ----------
test('C1 una aprobación sin fecha (anterior a la regla) recibe fecha al migrar y deja de ser indefinida',async()=>{
  now=Date.now();const id=await space();
  await repo.system(id,sql=>sql.query("INSERT INTO team_sales_proposals(tenant_id,id,contact_id,revision,content,content_hash,status) VALUES($1,$2,'contact-1','r','{}'::jsonb,'h','approved')",[id,randomUUID()]));
  await db.exec(teamSchema);
  const rows=(await repo.system(id,sql=>sql.query<{approved_at:string|null}>("SELECT approved_at FROM team_sales_proposals WHERE tenant_id=$1 AND status='approved'",[id]))).rows;
  assert.ok(rows.length>0&&rows.every(row=>row.approved_at!==null));
});
