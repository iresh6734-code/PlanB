import test from 'node:test';
import assert from 'node:assert/strict';
import { makeFixture, makeDemoSpec } from '../shared/fixtures.js';
import { SnapshotSchema, MAX_RECORDS } from '../shared/model.js';
import { Store } from '../server/store.js';
import { readonlyFetch, inspectConnection } from '../server/connection.js';
import { hubspotRemote } from '../server/hubspot-remote.js';
import { Recovery, simulatedRemote, type Remote } from '../server/recovery.js';
import { verifyManualRecovery } from '../server/manual-recovery.js';
import { runtimeZip } from '../server/exporter.js';
import { createBaseApp } from '../server/app.js';

function prepare(){
  const store=new Store(':memory:'),snapshot=makeFixture(),spec=makeDemoSpec(snapshot);
  snapshot.version=3;snapshot.source={kind:'hubspot',accountId:'123',isTestData:false,environment:'production',accountType:'STANDARD',description:'Prueba sintética de contrato; no contiene clientes reales.'};
  spec.version=3;store.importSnapshot(snapshot);store.saveGeneration(spec,{provider:'demo',model:null,prompt:'',generatedAt:new Date().toISOString(),approved:false});store.activate();store.set('sessionId','production-test');return store;
}
function reader(store:Store):Remote{
  return {source:'hubspot',accountId:'123',readOnly:true,async verify(){},async read(entity,id){return store.record(entity,id);},async hasRelation(){return true;},async create(){throw new Error('No puede escribir');},async update(){throw new Error('No puede escribir');},async relate(){throw new Error('No puede escribir');}};
}
test('v3 distingue producción de ensayo conservando los formatos antiguos',()=>{
  const snapshot=makeFixture();assert.equal(SnapshotSchema.safeParse(snapshot).success,true);
  snapshot.source.isTestData=false;assert.equal(SnapshotSchema.safeParse(snapshot).success,false);
  snapshot.version=3;snapshot.source={...snapshot.source,kind:'hubspot',environment:'production',accountType:'STANDARD'};assert.equal(SnapshotSchema.safeParse(snapshot).success,true);
  snapshot.source.isTestData=true;assert.equal(SnapshotSchema.safeParse(snapshot).success,false);
});
test('transporte de lectura bloquea escrituras incluso con una clave amplia',async()=>{
  let calls=0;const read=readonlyFetch(async()=>{calls++;return Response.json({});});
  for(const [method,path] of [['POST','/crm/v3/objects/contacts'],['PATCH','/crm/v3/objects/contacts/1'],['PUT','/crm/v4/objects/contacts/1/associations/default/companies/2'],['DELETE','/crm/v3/objects/contacts/1']])await assert.rejects(read('https://api.hubapi.com'+path,{method}),/solo permite lecturas/);
  await assert.rejects(read('https://otro.example/crm/v3/objects/contacts'),/solo permite lecturas/);assert.equal(calls,0);
  await read('https://api.hubapi.com/crm/v3/objects/contacts/search',{method:'POST'});assert.equal(calls,1);
});
test('conexión verifica el portal antes de consultar esquemas',async()=>{
  let calls=0;await assert.rejects(inspectConnection({token:'ficticio-no-secreto',accountId:'123',mode:'production_readonly',confirmedProduction:true},async()=>{calls++;return Response.json({portalId:456,accountType:'STANDARD'});}),/otro portal/);assert.equal(calls,1);
});
test('adaptador remoto de lectura no envía altas, cambios o relaciones',async()=>{
  const store=prepare();let calls=0;const remote=hubspotRemote('ficticio-no-secreto','123',store.spec!,async()=>{calls++;return Response.json({});},true);
  await assert.rejects(remote.create('contacts',{},'test'),/solo permite lecturas/);await assert.rejects(remote.update('contacts','1',{}),/solo permite lecturas/);await assert.rejects(remote.relate('contacts','1','companies','2'),/solo permite lecturas/);assert.equal(calls,0);store.close();
});
test('exportar no cierra pendientes; comprobación manual exige coincidencia y sobrevive restauración',async()=>{
  const store=prepare();store.saveRecord('contacts',{phone:'600999888'},'contact-1');const engine=new Recovery(store),base=reader(store);
  const remote:Remote={...base,async read(entity,id){const record=store.record(entity,id);return record?{...record,values:{...record.values,phone:'otro'}}:null;}};
  assert.equal(store.bundle().returnState?.watermark,0);
  assert.equal((await verifyManualRecovery(store,remote,{revision:engine.revision(),mapping:[]})).passed,false);assert.equal(store.pendingChangesCount,1);
  const ok=await verifyManualRecovery(store,base,{revision:engine.revision(),mapping:[]});assert.equal(ok.passed,true);assert.equal(ok.report?.method,'manual_verified');assert.equal(store.pendingChangesCount,0);
  const restored=new Store(':memory:');restored.restoreBundle(store.bundle());assert.equal(restored.pendingChangesCount,0);assert.equal(restored.get<any>('manualRecoveryReport',null).method,'manual_verified');restored.close();store.close();
});
test('altas manuales necesitan un ID y relaciones confirmadas',async()=>{
  const store=prepare(),record=store.saveRecord('tasks',{subject:'Alta ficticia',due_date:'2026-11-12',status:'pending',contact_id:'contact-1'}),engine=new Recovery(store);
  const remote:Remote={...reader(store),async read(entity,id){return id==='987'?{...record,id:'987'}:null;},async hasRelation(){return false;}};
  assert.equal((await verifyManualRecovery(store,remote,{revision:engine.revision(),mapping:[]})).passed,false);
  const input={revision:engine.revision(),mapping:[{entity:'tasks' as const,localId:record.id,remoteId:'987'}]};
  assert.equal((await verifyManualRecovery(store,remote,input)).passed,false);remote.hasRelation=async()=>true;assert.equal((await verifyManualRecovery(store,remote,input)).passed,true);assert.equal(store.pendingChangesCount,0);store.close();
});
test('edición concurrente invalida comprobación sin cerrar pendientes',async()=>{
  const store=prepare();store.saveRecord('contacts',{phone:'600999888'},'contact-1');const engine=new Recovery(store),remote={...reader(store),async verify(){store.saveRecord('contacts',{phone:'600888777'},'contact-1');}};
  await assert.rejects(verifyManualRecovery(store,remote,{revision:engine.revision(),mapping:[]}),/ediciones locales nuevas/);assert.equal(store.pendingChangesCount,2);store.close();
});
test('producción rechaza IA, paquete sin cifrar y devolución automática',async()=>{
  const store=prepare();store.saveRecord('contacts',{phone:'600999888'},'contact-1');const remote={...simulatedRemote(store),source:'hubspot' as const};
  await assert.rejects(new Recovery(store).preview(remote),/comprobación manual/);await assert.rejects(new Recovery(store).apply('cualquiera',remote),/bloqueadas/);
  await assert.rejects(runtimeZip(store.bundle(),'.'),/requieren cifrado/);store.close();
});
test('todas las entradas de captura aplican el máximo total',()=>{
  const snapshot=makeFixture(),template=snapshot.records[0];for(let n=snapshot.records.length;n<=MAX_RECORDS;n++)snapshot.records.push({...template,id:'extra-'+n});
  assert.equal(SnapshotSchema.safeParse(snapshot).success,false);const store=new Store(':memory:');assert.throws(()=>store.addCapture(snapshot),/10.000/);assert.throws(()=>store.importSnapshot(snapshot),/formato/);store.close();
});
test('restaurar no autoriza otro portal y diagnóstico no expone fichas ni conexión',async()=>{
  const store=prepare(),{app,store:target}=await createBaseApp({dbPath:':memory:',root:'.',staticDir:'no-static'});
  target.set('connectionPublic',{accountId:'456',mode:'production_readonly'});assert.throws(()=>target.restoreBundle(store.bundle()),/otro portal/);target.set('hubspotConnection','SECRETO-SINTETICO-NO-DEBE-SALIR');
  const response=await app.inject({url:'/api/v3/diagnostics'});assert.equal(response.statusCode,200);assert.ok(!response.body.includes('SECRETO'));assert.ok(!response.body.includes('Lucía'));await app.close();store.close();
});
