import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { Store } from '../server/store.js';
import { makeFixture, makeDemoSpec } from '../shared/fixtures.js';
import { bundleRevision, confirmRecoveryCopy, exportSummary, recoveryCopyStatus, rememberExport } from '../server/recovery-copy.js';
import { Continuity } from '../server/continuity.js';
import { createBaseApp } from '../server/app.js';
import { decodePortable, encodePortable } from '../server/crypto.js';
function prepare(store:Store){const snapshot=makeFixture();store.importSnapshot(snapshot);store.saveGeneration(makeDemoSpec(snapshot),{provider:'demo',model:null,prompt:'',generatedAt:new Date().toISOString(),approved:false});store.activate();return snapshot;}

test('custodia: exporta A activa aunque exista B reciente y lo identifica',()=>{
  const store=new Store(':memory:');try{
    const original=prepare(store),next=structuredClone(original);next.id='capture-b';next.capturedAt=new Date(Date.parse(original.capturedAt)+60000).toISOString();store.addCapture(next);
    const summary=exportSummary(store);assert.equal(summary.captureId,original.id+':'+original.capturedAt);assert.equal(summary.latestCaptureId,next.id+':'+next.capturedAt);assert.equal(summary.differsFromLatest,true);
    assert.equal(bundleRevision({...store.bundle(),exportedAt:'otra fecha'}),summary.revision);
    rememberExport(store,store.bundle(),'archivo-ficticio');confirmRecoveryCopy(store,summary.revision);assert.equal(recoveryCopyStatus(store)?.current,true);
    store.saveRecord('contacts',{phone:'600222333'},'contact-1');const status=recoveryCopyStatus(store)!;assert.equal(status.current,false);assert.equal(status.confirmedAt,undefined);assert.ok(status.previousConfirmedAt);
    assert.throws(()=>confirmRecoveryCopy(store,summary.revision),{status:409});
    rememberExport(store,store.bundle(),'segunda-copia');assert.equal(recoveryCopyStatus(store)?.confirmedAt,undefined);confirmRecoveryCopy(store,exportSummary(store).revision);assert.ok(recoveryCopyStatus(store)?.confirmedAt);
  }finally{store.close();}
});
test('custodia: una confirmación histórica sin revisión nunca se presenta vigente',()=>{
  const store=new Store(':memory:');try{prepare(store);store.set('recoveryCopy',{exportedAt:'2026-10-01',confirmedAt:'2026-10-01'});assert.equal(recoveryCopyStatus(store)?.current,false);assert.equal(recoveryCopyStatus(store)?.confirmedAt,undefined);assert.throws(()=>confirmRecoveryCopy(store),{status:409});}finally{store.close();}
});
test('custodia: API vincula archivo, contenido, hash y rechazo de una revisión anterior',async()=>{
  const {app,store}=await createBaseApp({dbPath:':memory:',root:'.',staticDir:'no-static'});try{
    prepare(store);const summary=(await app.inject({url:'/api/v4/export-summary'})).json(),password='clave-sintetica-exportacion';
    const download=await app.inject({method:'POST',url:'/api/v2/export/encrypted',payload:{password,revision:summary.revision}});assert.equal(download.statusCode,200);
    const bundle=decodePortable(download.body,password) as ReturnType<Store['bundle']>;assert.equal(bundleRevision(bundle),summary.revision);
    assert.equal(recoveryCopyStatus(store)?.artifactHash,createHash('sha256').update(download.body).digest('hex'));
    const confirm=()=>app.inject({method:'POST',url:'/api/v3/recovery-copy/confirm',payload:{storedSeparately:true,revision:summary.revision}});
    assert.equal((await confirm()).statusCode,200);store.saveRecord('contacts',{phone:'600222333'},'contact-1');assert.equal((await confirm()).statusCode,409);
    assert.equal((await app.inject({method:'POST',url:'/api/v2/export/encrypted',payload:{password,revision:summary.revision}})).statusCode,409);
    assert.equal((await app.inject({url:'/api/v2/continuity'})).json().recoveryCopy.confirmedAt,undefined);
  }finally{await app.close();}
});
test('custodia: un ZIP en preparación no puede sustituir la copia de una revisión posterior', async t => {
  const parent = path.resolve('tests/.tmp');
  mkdirSync(parent, { recursive: true });
  const root = mkdtempSync(path.join(parent, 'export-package-373-'));
  mkdirSync(path.join(root, 'dist'));
  mkdirSync(path.join(root, 'runtime-assets', 'node_modules'), { recursive: true });
  writeFileSync(path.join(root, 'runtime.mjs'), '// Archivo ficticio del ensayo');
  writeFileSync(path.join(root, 'launch.cjs'), '// Iniciador ficticio del ensayo');
  writeFileSync(path.join(root, 'dist', 'index.html'), '<title>Exportación de ensayo</title>');
  const { app, store } = await createBaseApp({ dbPath: ':memory:', root, staticDir: path.join(root, 'dist') });
  t.after(() => app.close());
  prepare(store);
  const original = store.bundle.bind(store);
  const initial = bundleRevision(original());
  const password = 'contrasena-ficticia-373';
  const zip = (revision: string) => app.inject({
    method: 'POST', url: '/api/v2/export/package', payload: { password, revision },
  });
  const changed = t.mock.method(store, 'bundle', () => {
    const before = original();
    // The first route read selects the bundle. This edit runs once compression yields.
    queueMicrotask(() => {
      store.saveRecord('contacts', { phone: '910000373' }, 'contact-1');
      const updated = original();
      rememberExport(store, updated, encodePortable(updated, password));
      confirmRecoveryCopy(store, bundleRevision(updated));
    });
    return before;
  }, { times: 1 });

  const stale = await zip(initial);
  assert.equal(changed.mock.callCount(), 1);
  assert.equal(stale.statusCode, 409);
  assert.match(stale.json().error, /El espacio cambió/);
  assert.equal(stale.headers['content-disposition'], undefined);
  const revision = bundleRevision(original());
  const newerCopy = recoveryCopyStatus(store);
  assert.notEqual(revision, initial);
  assert.equal(newerCopy?.revision, revision);
  assert.equal(newerCopy?.current, true);
  assert.ok(newerCopy?.confirmedAt);

  const current = await zip(revision);
  assert.equal(current.statusCode, 200);
  assert.equal(current.headers['content-type'], 'application/zip');
  assert.equal(current.rawPayload.subarray(0, 4).toString('hex'), '504b0304');
  assert.equal(recoveryCopyStatus(store)?.artifactHash, createHash('sha256').update(current.rawPayload).digest('hex'));
});
test('operación: fallo previo a crear trabajo queda visible y un éxito posterior lo resuelve',async()=>{
  const store=new Store(':memory:');try{
    const snapshot=prepare(store),continuity=new Continuity(store,'.',false,async()=>snapshot);
    continuity.configureSchedule(true);continuity.tick();const failed=continuity.status();assert.ok(failed.operations?.lastAttempt);assert.match(failed.operations?.error?.message??'',/iniciar/);assert.equal(failed.jobs.length,0);
    continuity.connection=()=>({token:'credencial-sintetica',accountId:snapshot.source.accountId,mode:'test'});
    store.set('schedule',{...failed.schedule,lastAttempt:null});continuity.tick();
    for(let i=0;i<100&&continuity.jobs.list()[0]?.status!=='succeeded';i++)await new Promise(resolve=>setTimeout(resolve,5));
    assert.equal(continuity.jobs.list()[0].status,'succeeded');assert.equal(continuity.status().operations?.error,null);assert.ok(continuity.status().operations?.lastSuccess);
    store.set('disconnected',true);assert.equal(continuity.status().operations?.paused,true);
  }finally{store.close();}
});
