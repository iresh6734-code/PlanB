import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { Store } from '../server/store.js';
import { makeFixture, makeDemoSpec } from '../shared/fixtures.js';
import { decodePortable, encodePortable } from '../server/crypto.js';
import { applyAppSpecPatch } from '../server/ai-patch.js';
import { Recovery, simulatedRemote, type Remote } from '../server/recovery.js';
import { Jobs } from '../server/jobs.js';
import { Continuity } from '../server/continuity.js';
import { createBaseApp } from '../server/app.js';
import { validateRecord } from '../shared/model.js';
const root=resolve('.'),scratch=resolve('tests/.tmp');mkdirSync(scratch,{recursive:true});
function prepare(store:Store){const snapshot=makeFixture();store.importSnapshot(snapshot);store.saveGeneration(makeDemoSpec(snapshot),{provider:'demo',model:null,generatedAt:new Date().toISOString(),prompt:'',approved:false});store.activate();return snapshot;}
test('v2: la candidata se promueve solo tras revisión y un fallo no altera la activa',()=>{
  const store=new Store(':memory:');prepare(store);const original=store.snapshot!.name;
  store.importSnapshot(makeFixture('distribution'));assert.equal(store.snapshot!.name,original);assert.equal(store.ready,true);
  store.failGeneration('Proveedor caído');assert.equal(store.ready,true);
  store.saveGeneration(makeDemoSpec(store.candidate!.snapshot),{provider:'demo',model:null,generatedAt:new Date().toISOString(),prompt:'',approved:false});
  assert.equal(store.snapshot!.name,original);store.activate();assert.equal(store.snapshot!.name,'Distribuidora Atlas');assert.equal(store.candidate,null);store.close();
});
test('v2: primera propuesta fallida nunca activa la aplicación',()=>{
  const store=new Store(':memory:');store.importSnapshot(makeFixture());store.failGeneration('falló');assert.equal(store.ready,false);assert.throws(()=>store.activate());store.close();
});
test('v2: promoción detecta ediciones posteriores a confirmar una sustitución',()=>{
  const store=new Store(':memory:');prepare(store);store.saveRecord('contacts',{phone:'1'},'contact-1');
  store.importSnapshot(makeFixture('distribution'),true);store.saveGeneration(makeDemoSpec(store.candidate!.snapshot),{provider:'demo',model:null,generatedAt:new Date().toISOString(),prompt:'',approved:false});
  store.saveRecord('contacts',{phone:'2'},'contact-1');assert.throws(()=>store.activate(),/nuevos/);assert.equal(store.record('contacts','contact-1')!.values.phone,'2');store.close();
});
test('v2: AppSpecPatch conserva campos y exige procedencia para reglas nuevas',()=>{
  const snapshot=makeFixture(),prompt='El importe mínimo es 100';
  const patch={title:null,description:null,views:[{entity:'contacts',columns:['firstname','email']}],rules:[{id:'user-min',entity:'deals',kind:'min',field:'amount',value:'100',whenField:null,whenValue:null,origin:'user',description:'Importe mínimo 100',evidence:prompt}],unsupported:[]};
  const spec=applyAppSpecPatch(snapshot,patch,prompt);assert.deepEqual(spec.entities[0].fields,snapshot.entities[0].fields);assert.equal(spec.rules.length,snapshot.rules.length+1);
  assert.throws(()=>applyAppSpecPatch(snapshot,patch,'otra instrucción'));assert.throws(()=>applyAppSpecPatch(snapshot,{...patch,views:[{entity:'contacts',columns:['inventado']}]},prompt));
});
test('v2: copia cifrada se recupera y detecta contraseña incorrecta o alteraciones',()=>{
  const store=new Store(':memory:');prepare(store);const original=store.bundle(),text=encodePortable(original,'recuperacion-segura-2026');
  assert.ok(!text.includes('Lucía'));assert.deepEqual(decodePortable(text,'recuperacion-segura-2026'),original);
  assert.throws(()=>decodePortable(text,'incorrecta'));const tampered=JSON.parse(text);tampered.data=tampered.data.slice(0,-5)+'xxxxx';assert.throws(()=>decodePortable(JSON.stringify(tampered),'recuperacion-segura-2026'));store.close();
});
test('v2: migra SQLite v1 a valores cifrados y conserva datos al reiniciar',()=>{
  const folder=mkdtempSync(join(scratch,'encryption-')),filename=join(folder,'planb.sqlite');
  try{
    const legacy=new DatabaseSync(filename);legacy.exec('CREATE TABLE meta(key TEXT PRIMARY KEY,value TEXT NOT NULL)');legacy.prepare('INSERT INTO meta VALUES(?,?)').run('test',JSON.stringify('canary-private-data'));legacy.close();
    let store=new Store(filename);assert.equal(store.get('test',''),'canary-private-data');prepare(store);store.close();
    assert.ok(!readFileSync(filename).includes(Buffer.from('canary-private-data')));assert.ok(!readFileSync(filename).includes(Buffer.from('lucia.martin@example.com')));
    store=new Store(filename);assert.equal(store.ready,true);assert.equal(store.records().length,62);store.close();
  }finally{rmSync(folder,{recursive:true,force:true,maxRetries:3});}
});
test('v2: etapas y fechas con hora se validan contra el pipeline',()=>{
  const snapshot=makeFixture();snapshot.version=2;snapshot.pipelines=[{id:'a',label:'A'},{id:'b',label:'B'}];
  snapshot.stages=snapshot.stages.map((s,i)=>({...s,pipelineId:i<2?'a':'b'}));
  snapshot.entities.find(e=>e.id==='deals')!.fields.push({key:'pipeline',label:'Proceso',type:'enum',required:true,readOnly:false,options:snapshot.pipelines,referenceEntity:null});
  const spec=makeDemoSpec(snapshot),record={...snapshot.records.find(r=>r.entity==='deals')!,values:{dealstage:'won',pipeline:'a'}};
  assert.ok(validateRecord(spec,record).dealstage);
});
test('v2: 10.000 registros producen páginas de 50 y búsqueda en menos de 2 segundos',()=>{
  const store=new Store(':memory:');prepare(store);
  store.transaction(()=>{for(let i=25;i<=9962;i++)store.insertRecord({id:'scale-'+i,entity:'contacts',values:{firstname:'Cliente '+i,lastname:'Escala',email:'scale'+i+'@example.com',phone:'600000000',company_id:'company-1',service:'web'}});});
  assert.equal(store.records().length,10000);const start=performance.now(),page=store.page('contacts','',0,50);
  assert.equal(page.records.length,50);assert.equal(page.total,9962);assert.ok(performance.now()-start<2000);
  assert.equal(store.page('contacts','Cliente 9962',0,50).records.length,1);store.close();
});
test('v2: retención conserva la captura activa',()=>{
  const store=new Store(':memory:');prepare(store);const protectedId=store.captures()[0].id;
  for(let i=0;i<45;i++){const snapshot=makeFixture();snapshot.id='capture-'+i;snapshot.capturedAt=new Date(Date.now()-(i+1)*86400_000).toISOString();store.addCapture(snapshot);}
  assert.ok(store.captures().some(c=>c.id===protectedId));assert.ok(store.captures().length<=31);store.close();
});
test('v2: devolución verifica tres operaciones y no repite lo confirmado',async()=>{
  const store=new Store(':memory:');prepare(store);store.saveRecord('contacts',{phone:'600123456'},'contact-1');store.saveRecord('deals',{dealstage:'proposal'},'deal-1');
  store.saveRecord('tasks',{subject:'Nueva local',due_date:'2026-11-12',status:'pending'});
  const remote=simulatedRemote(store),engine=new Recovery(store),plan=await engine.preview(remote);assert.equal(plan.operations.length,3);
  engine.approve(plan.id);const result=await engine.apply(plan.id,remote);assert.equal(result.status,'complete');assert.equal(store.get('returnComplete',false),false);
  assert.equal((await engine.preview(remote)).operations.length,0);store.close();
});
test('v2: conflictos y cambios remotos posteriores exigen otra revisión',async()=>{
  const store=new Store(':memory:');prepare(store);store.saveRecord('contacts',{phone:'local'},'contact-1');
  const remote=simulatedRemote(store);await remote.update('contacts','contact-1',{phone:'remote'});
  const engine=new Recovery(store),plan=await engine.preview(remote);assert.equal(plan.operations[0].fields[0].conflict,true);assert.throws(()=>engine.approve(plan.id),/conflictos/);
  engine.decide(plan.id,[{operationId:plan.operations[0].id,field:'phone',decision:'local'}]);engine.approve(plan.id);
  await remote.update('contacts','contact-1',{phone:'cambió otra vez'});
  assert.equal((await engine.apply(plan.id,remote)).status,'review');
  assert.equal((await engine.refresh(plan.id,remote)).operations[0].fields[0].remote,'cambió otra vez');store.close();
});
test('v2: creación con respuesta perdida queda incierta y nunca se repite sola',async()=>{
  const store=new Store(':memory:');prepare(store);store.saveRecord('tasks',{subject:'Nueva',due_date:'2026-11-12',status:'pending'});
  const base=simulatedRemote(store);let creates=0,createdId='';
  const remote:Remote={...base,async create(entity,values,id){creates++;createdId=await base.create(entity,values,id);throw new Error('network ended after write');}};
  const engine=new Recovery(store),plan=await engine.preview(remote);engine.approve(plan.id);
  const result=await engine.apply(plan.id,remote);assert.equal(result.operations[0].status,'uncertain');assert.equal(creates,1);assert.throws(()=>engine.approve(plan.id));
  await engine.resolveUncertain(plan.id,plan.operations[0].id,createdId,base);engine.approve(plan.id);await engine.apply(plan.id,base);assert.equal(creates,1);store.close();
});

test('v2: traslado conserva IDs devueltos y no duplica un alta ya confirmada',async()=>{
  const source=new Store(':memory:');prepare(source);const task=source.saveRecord('tasks',{subject:'Alta exportada',due_date:'2026-11-12',status:'pending'});
  const remote:Remote={...simulatedRemote(source),source:'hubspot'},first=new Recovery(source);
  const plan=await first.preview(remote);first.approve(plan.id);await first.apply(plan.id,remote);
  const target=new Store(':memory:');target.restoreBundle(decodePortable(encodePortable(source.bundle(),'contraseña-de-traslado'),'contraseña-de-traslado'));
  assert.equal(target.pendingChangesCount,0);const recovered=new Recovery(target);
  target.saveRecord('tasks',{subject:'Editada tras traslado'},task.id);
  const next=await recovered.preview(remote);assert.equal(next.operations[0].kind,'update');assert.ok(next.operations[0].remoteId);
  recovered.approve(next.id);assert.equal((await recovered.apply(next.id,remote)).status,'complete');
  assert.equal(source.get<unknown[]>('simulatedRemote',[]).length,63);source.close();target.close();
});

test('v2: exportación conserva resultados inciertos y bloquea repetición y ediciones',async()=>{
  const source=new Store(':memory:');prepare(source);source.saveRecord('tasks',{subject:'Alta incierta',due_date:'2026-11-12',status:'pending'});
  const base:Remote={...simulatedRemote(source),source:'hubspot'};let creates=0,remoteId='';
  const remote:Remote={...base,async create(entity,values,id){creates++;remoteId=await base.create(entity,values,id);throw new Error('respuesta perdida');}};
  const first=new Recovery(source),plan=await first.preview(remote);first.approve(plan.id);await first.apply(plan.id,remote);
  const target=new Store(':memory:');target.restoreBundle(source.bundle());const recovered=new Recovery(target);
  assert.equal(recovered.plan()!.operations[0].status,'uncertain');assert.throws(()=>recovered.approve(plan.id));
  assert.throws(()=>target.saveRecord('contacts',{phone:'nuevo'},'contact-1'),/devolución parcial/);
  await recovered.resolveUncertain(plan.id,plan.operations[0].id,remoteId,base);recovered.approve(plan.id);await recovered.apply(plan.id,base);
  assert.equal(creates,1);source.close();target.close();
});
test('v2: nuevas ediciones locales invalidan aprobación',async()=>{
  const store=new Store(':memory:');prepare(store);store.saveRecord('contacts',{phone:'local'},'contact-1');
  const engine=new Recovery(store),plan=await engine.preview(simulatedRemote(store));store.saveRecord('contacts',{phone:'newer'},'contact-1');assert.throws(()=>engine.approve(plan.id),/nuevos/);store.close();
});

test('v2: decisiones no pueden quitar campos obligatorios de un alta remota',async()=>{
  const store=new Store(':memory:');prepare(store);store.saveRecord('tasks',{subject:'Nueva',due_date:'2026-11-12',status:'pending'});
  const recovery=new Recovery(store),plan=await recovery.preview(simulatedRemote(store));
  recovery.decide(plan.id,[{operationId:plan.operations[0].id,field:'subject',decision:'remote'}]);
  assert.throws(()=>recovery.approve(plan.id),/registro inválido/);assert.equal(recovery.plan()!.status,'review');store.close();
});
test('v2: cancelar un trabajo conserva la copia activa',async()=>{
  const store=new Store(':memory:');prepare(store);const jobs=new Jobs(store),job=jobs.start('capture',async(_,signal)=>{await new Promise(r=>setTimeout(r,30));signal.throwIfAborted();throw new Error('unexpected');});
  jobs.cancel(job.id);await jobs.stop();assert.equal(jobs.list()[0].status,'cancelled');assert.equal(store.ready,true);store.close();
});

test('v2: captura parcial programada falla sin alterar la copia y conserva intento persistido',async()=>{
  const store=new Store(':memory:');prepare(store);const original=store.bundle();
  const partial=makeFixture();partial.manifest.expectedCounts.contacts++;
  const continuity=new Continuity(store,root,false,async()=>partial);
  continuity.connection=()=>({token:'fake-test-token',accountId:'123'});store.set('disconnected',false);continuity.configureSchedule(true);
  // Use the test portal ID expected by this injected importer; no network is contacted.
  partial.source.accountId='123';continuity.tick();
  for(let i=0;i<100&&continuity.jobs.list()[0]?.status!=='failed';i++)await new Promise(r=>setTimeout(r,5));
  assert.equal(continuity.jobs.list()[0].status,'failed');assert.ok(continuity.status().schedule.lastAttempt);
  assert.equal(store.ready,true);assert.deepEqual(store.records(),original.records);assert.equal(store.captures().length,1);
  store.set('jobs',[{id:'interrupted-test',kind:'capture',status:'running',createdAt:'2026-10-24T00:00:00Z',updatedAt:'2026-10-24T00:00:00Z',message:'capturando',progress:40}]);
  assert.equal(new Jobs(store).list()[0].status,'interrupted');await continuity.jobs.stop();store.close();
});
test('v2: sesión pausa servicios y no se cierra con cambios pendientes',()=>{
  const store=new Store(':memory:');prepare(store);const continuity=new Continuity(store,root);
  continuity.begin(store.captures()[0].id);assert.equal(store.disconnected,true);assert.ok(continuity.status().session);
  assert.throws(()=>store.importSnapshot(makeFixture('distribution'),true),/sesión de continuidad/);
  assert.throws(()=>store.saveGeneration(makeDemoSpec(store.snapshot!),{provider:'demo',model:null,generatedAt:new Date().toISOString(),prompt:'',approved:false}),/pausada/);
  assert.throws(()=>store.activate(),/sesión de continuidad/);assert.throws(()=>continuity.begin(store.captures()[0].id),/Ya hay/);
  store.saveRecord('contacts',{phone:'local'},'contact-1');assert.throws(()=>continuity.end(),/Devuelve/);assert.throws(()=>continuity.capture());store.close();
});

test('v2: devolución real controlada permite cerrar y abrir otra captura sin perder auditoría',async()=>{
  const store=new Store(':memory:');prepare(store);const continuity=new Continuity(store,root);
  continuity.begin(store.captures()[0].id);store.saveRecord('contacts',{phone:'devuelto'},'contact-1');
  const remote:Remote={...simulatedRemote(store),source:'hubspot'},recovery=new Recovery(store);
  const plan=await recovery.preview(remote);recovery.approve(plan.id);await recovery.apply(plan.id,remote);
  assert.equal(store.pendingChangesCount,0);assert.equal(store.changesCount,1);continuity.end();
  continuity.begin(store.captures()[0].id);assert.equal(store.changesCount,0);assert.equal(store.get('recoveryPlan',null),null);
  assert.ok(Number((store.db.prepare('SELECT COUNT(*) AS n FROM archives').get() as {n:number}).n)>0);store.close();
});

test('v2: restauración rechaza historial alterado y altas ausentes en el estado final',()=>{
  const source=new Store(':memory:');prepare(source);source.saveRecord('tasks',{subject:'Alta',due_date:'2026-11-12',status:'pending'});
  const bundle=source.bundle(),target=new Store(':memory:');
  assert.throws(()=>target.restoreBundle({...bundle,records:bundle.snapshot.records}),/integridad/);
  const altered=structuredClone(bundle);altered.changes[0].before=altered.changes[0].after;
  assert.throws(()=>target.restoreBundle(altered),/integridad/);target.restoreBundle(bundle);assert.equal(target.changesCount,1);
  const encrypted=JSON.parse(encodePortable(bundle,'contraseña-de-recuperacion'));
  encrypted.data=JSON.stringify(bundle);assert.throws(()=>decodePortable(JSON.stringify(encrypted),'contraseña-de-recuperacion'));
  source.close();target.close();
});
test('v2: sesión local protege datos, revoca cookies y limita intentos de contraseña',async()=>{
  const {app}=await createBaseApp({dbPath:':memory:',root,staticDir:resolve('tests/no-static')});
  const inject=async(method:'GET'|'POST',url:string,payload?:unknown,cookie?:string)=>await app.inject({method,url,payload:payload?JSON.stringify(payload):undefined,headers:{host:'127.0.0.1:4317','content-type':'application/json',...(cookie?{cookie}:{})}});
  try{
    const setup=await inject('POST','/api/v2/auth/setup',{password:'contraseña-local-segura'});assert.equal(setup.statusCode,200);const cookie=String(setup.headers['set-cookie']).split(';')[0];
    assert.equal((await inject('GET','/api/v2/state')).statusCode,401);assert.equal((await inject('GET','/api/v2/state',undefined,cookie)).statusCode,200);
    await inject('POST','/api/v2/auth/lock',{},cookie);assert.equal((await inject('GET','/api/v2/state',undefined,cookie)).statusCode,401);
    for(let i=0;i<5;i++)assert.equal((await inject('POST','/api/v2/auth/login',{password:'wrong'})).statusCode,401);
    assert.equal((await inject('POST','/api/v2/auth/login',{password:'wrong'})).statusCode,429);
  }finally{await app.close();}
});
