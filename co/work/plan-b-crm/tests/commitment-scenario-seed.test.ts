import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { createHash,randomBytes,randomUUID } from 'node:crypto';
import { spawn,type ChildProcess } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { createBaseApp } from '../server/app.js';
import { Store } from '../server/store.js';
import { registerCommitments } from '../server/commitments.js';
import { workspaceSearchIdentity } from '../server/workspace-search.js';
import { COMMITMENT_SCENARIO_SEED_KEY as KEY,initializeCommitmentScenarioSeed,readCommitmentScenarioSeed,type ScenarioSeedResult } from '../server/commitment-scenario-seed.js';
import { createMultisystemScenario } from '../shared/commitment-multisystem-demo.js';
import { commitmentDetailResponse,commitmentPath,projectCommitmentEvidence } from '../shared/commitments.js';
import { makeDemoSpec,makeFixture } from '../shared/fixtures.js';

process.env.NODE_ENV='test';
const NOW=Date.parse('2026-11-08T10:00:00.000Z');
const ready=(value:ScenarioSeedResult)=>{assert.equal(value.status,'ready');return value as Extract<ScenarioSeedResult,{status:'ready'}>;};
const snapshotFor=(profile:'agency'|'distribution',testData:boolean)=>{const snapshot=makeFixture(profile);if(!testData){snapshot.version=3;snapshot.source={kind:'hubspot',accountId:'fixture-policy-only',isTestData:false,environment:'production',accountType:'STANDARD',description:'Datos inventados: ensayo de rechazo por política'};}return snapshot;};
const seed=(store:Store,testData=true)=>{store.set('instanceId',randomUUID());const snapshot=snapshotFor('agency',testData);store.importSnapshot(snapshot,!testData);store.saveGeneration(makeDemoSpec(snapshot),{provider:'demo',model:null,generatedAt:new Date(NOW).toISOString(),prompt:'',approved:false});store.activate();};
const memory=(testData=true)=>{const store=new Store(':memory:');seed(store,testData);return store;};
const raw=(store:Store)=>store.db.prepare('SELECT value FROM meta WHERE key=?').get(KEY)?.value;
const all=(store:Store)=>JSON.stringify(store.db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all().map(({name})=>[name,store.db.prepare('SELECT * FROM "'+String(name).replaceAll('"','""')+'"').all().map(row=>JSON.stringify(row)).sort()]));
const folder=()=>{const root=fs.mkdtempSync(path.join(tmpdir(),'scenario289-'));fs.writeFileSync(path.join(root,'.planb-key'),JSON.stringify({kind:'test',data:randomBytes(32).toString('base64')}),{flag:'wx'});return root;};

test('La lectura ausente no inicializa, escribe ni inventa un escenario',()=>{
 const store=memory();try{const before=all(store);assert.deepEqual(readCommitmentScenarioSeed(store),{status:'unavailable',reason:'not-initialized'});assert.equal(all(store),before);}finally{store.close();}
});
test('Inicialización explícita persiste solo un marcador pequeño y las lecturas futuras ignoran otro reloj',()=>{
 const store=memory();try{const before=store.db.prepare('SELECT count(*) AS n FROM meta').get()!.n;const a=ready(initializeCommitmentScenarioSeed(store,()=>NOW));assert.equal(a.created,true);assert.equal(a.provenance,'memory-only');assert.deepEqual(a.dataset,createMultisystemScenario(NOW));assert.equal(a.datasetRevision,createHash('sha256').update(JSON.stringify({commitments:a.dataset.commitments,observations:a.dataset.observations})).digest('hex'));assert.equal(store.db.prepare('SELECT count(*) AS n FROM meta').get()!.n,Number(before)+1);
  const marker=store.get<Record<string,unknown>>(KEY,{});assert.ok(JSON.stringify(marker).length<512);assert.deepEqual(Object.keys(marker).sort(),['datasetRevision','format','instanceId','scenario','seedAt']);const beforeRead=all(store);const b=ready(initializeCommitmentScenarioSeed(store,()=>{throw new Error('No debe consultar reloj nuevo');}));assert.equal(b.created,false);assert.equal(b.seedAt,a.seedAt);assert.equal(b.datasetRevision,a.datasetRevision);assert.equal(all(store),beforeRead);assert.deepEqual(ready(readCommitmentScenarioSeed(store)).dataset,a.dataset);
  a.dataset.observations[0]!.label='Cambio externo en objeto recibido';assert.notEqual(ready(readCommitmentScenarioSeed(store)).dataset.observations[0]!.label,a.dataset.observations[0]!.label);
 }finally{store.close();}
});
test('Copia inactiva, real e identidad ausente no crean ni revelan dataset',()=>{
 const empty=new Store(':memory:');try{assert.deepEqual(initializeCommitmentScenarioSeed(empty),{status:'unavailable',reason:'inactive-copy'});assert.equal(raw(empty),undefined);}finally{empty.close();}
 const real=memory(false);try{const before=all(real);assert.deepEqual(initializeCommitmentScenarioSeed(real),{status:'unavailable',reason:'not-fiction'});assert.equal(all(real),before);}finally{real.close();}
 const missing=memory();try{missing.db.prepare('DELETE FROM meta WHERE key=?').run('instanceId');const before=all(missing);assert.deepEqual(initializeCommitmentScenarioSeed(missing),{status:'unavailable',reason:'missing-identity'});assert.equal(all(missing),before);}finally{missing.close();}
});
test('Reloj inválido falla antes de escribir; un reloj válido fuera de rango del dataset tampoco deja marcador',()=>{
 for(const bad of [NaN,Infinity,-1,0,1.5,8.64e15]){const store=memory();try{const before=all(store);assert.deepEqual(initializeCommitmentScenarioSeed(store,()=>bad),{status:'unavailable',reason:'invalid-clock'},String(bad));assert.equal(all(store),before);}finally{store.close();}}
 const store=memory();try{assert.deepEqual(initializeCommitmentScenarioSeed(store,()=>{throw new Error('mensaje privado no debe viajar');}),{status:'unavailable',reason:'invalid-clock'});}finally{store.close();}
});
test('Un marcador null, de otra versión o de otra instalación se conserva sin reparación automática',()=>{
 const store=memory();try{const original=ready(initializeCommitmentScenarioSeed(store,()=>NOW)),marker=store.get<Record<string,unknown>>(KEY,{});for(const bad of [null,[],{...marker,format:'future-v9'},{...marker,instanceId:randomUUID()},{...marker,extra:true},{...marker,seedAt:'2026-02-30T00:00:00Z'},{...marker,datasetRevision:'0'.repeat(64)}]){store.set(KEY,bad);const before=all(store);assert.deepEqual(readCommitmentScenarioSeed(store),{status:'unavailable',reason:'invalid-marker'});assert.deepEqual(initializeCommitmentScenarioSeed(store,()=>NOW+60000),{status:'unavailable',reason:'invalid-marker'});assert.equal(all(store),before);}assert.ok(original.datasetRevision);}finally{store.close();}
});
test('Fila cifrada ilegible o error del soporte quedan indisponibles y se preservan byte a byte',()=>{
 const root=folder(),store=new Store(path.join(root,'data.sqlite'));try{seed(store);initializeCommitmentScenarioSeed(store,()=>NOW);store.db.prepare('UPDATE meta SET value=? WHERE key=?').run('enc1:'+Buffer.alloc(40).toString('base64'),KEY);const before=all(store);assert.deepEqual(readCommitmentScenarioSeed(store),{status:'unavailable',reason:'storage-failed'});assert.deepEqual(initializeCommitmentScenarioSeed(store),{status:'unavailable',reason:'storage-failed'});assert.equal(all(store),before);}finally{store.close();}
});
test('Fallo después de set dentro de la transacción revierte el alta y no publica ready',()=>{
 const store=memory(),set=store.set.bind(store);try{const before=all(store);store.set=(key,value)=>{set(key,value);if(key===KEY)throw new Error('fallo de ensayo privado');};assert.deepEqual(initializeCommitmentScenarioSeed(store,()=>NOW),{status:'unavailable',reason:'storage-failed'});assert.equal(all(store),before);store.set=set;assert.equal(ready(initializeCommitmentScenarioSeed(store,()=>NOW)).created,true);}finally{store.close();}
});
test('Cambiar contexto durante el reloj no acredita un escenario en el contexto anterior',()=>{
 const store=memory();try{assert.deepEqual(initializeCommitmentScenarioSeed(store,()=>{store.set('sessionId','otra-sesion-ficticia');return NOW;}),{status:'unavailable',reason:'context-changed'});assert.equal(raw(store),undefined);}finally{store.close();}
});
test('Archivo reiniciado conserva mismo dataset y el marcador no aparece en texto plano',()=>{
 const root=folder(),filename=path.join(root,'data.sqlite');let store=new Store(filename);seed(store);const first=ready(initializeCommitmentScenarioSeed(store,()=>NOW));assert.equal(first.provenance,'durable');assert.match(String(raw(store)),/^enc1:/);store.close();assert.equal(fs.readFileSync(filename).includes(Buffer.from('planb-commitment-scenario-seed-v1')),false);
 store=new Store(filename);try{const before=all(store),again=ready(initializeCommitmentScenarioSeed(store,()=>NOW+60000));assert.equal(again.created,false);assert.equal(again.datasetRevision,first.datasetRevision);assert.deepEqual(again.dataset,first.dataset);assert.equal(all(store),before);}finally{store.close();}
});
test('Cambio de copia ficticia no cambia semilla; una copia real no la revela; volver conserva revisión',()=>{
 const store=memory();try{const first=ready(initializeCommitmentScenarioSeed(store,()=>NOW));const activate=(fictitious:boolean)=>{const snapshot=snapshotFor('distribution',fictitious);store.importSnapshot(snapshot,!fictitious);store.saveGeneration(makeDemoSpec(snapshot),{provider:'demo',model:null,generatedAt:new Date(NOW+60000).toISOString(),prompt:'',approved:false});store.activate();};activate(true);assert.equal(ready(readCommitmentScenarioSeed(store)).datasetRevision,first.datasetRevision);activate(false);const before=raw(store);assert.deepEqual(readCommitmentScenarioSeed(store),{status:'unavailable',reason:'not-fiction'});assert.equal(raw(store),before);activate(true);assert.equal(ready(initializeCommitmentScenarioSeed(store,()=>NOW+120000)).datasetRevision,first.datasetRevision);}finally{store.close();}
});

test('API real: asignar, reiniciar con reloj distinto y recuperar historial; cambiar solo epoch reproduce su desaparición',async()=>{
 const root=folder(),dbPath=path.join(root,'data.sqlite');
 const open=async(liveNow:number,wrongEpoch=false)=>{const f=await createBaseApp({dbPath,root,staticDir:'none'});if(!f.store.ready)seed(f.store);const prepared=ready(initializeCommitmentScenarioSeed(f.store,()=>liveNow));registerCommitments(f.app,f.store,wrongEpoch?createMultisystemScenario(liveNow):prepared.dataset,()=>liveNow);const get=async()=>{const context=workspaceSearchIdentity(f.store)!.contextRevision;const response=await f.app.inject({url:commitmentPath+'/ms-installation-hubspot?contextRevision='+context,headers:{host:'127.0.0.1'}});assert.equal(response.statusCode,200);return commitmentDetailResponse.parse(response.json());};return{...f,get,prepared};};
 let f=await open(NOW);const first=await f.get();const response=await f.app.inject({method:'POST',url:commitmentPath+'/ms-installation-hubspot/decisions',headers:{host:'127.0.0.1'},payload:{contextRevision:first.contextRevision,expectedRevision:first.item.revision,operationId:randomUUID(),decision:{type:'assign',owner:'Responsable ficticio289',nextStep:'Revisar el pedido de ensayo',dueAt:new Date(NOW+3600000).toISOString()}}});assert.equal(response.statusCode,200);await f.app.close();
 f=await open(NOW+60000);try{const detail=await f.get();assert.equal(detail.events.length,1);assert.equal(detail.item.action?.owner,'Responsable ficticio289');const before=all(f.store);await f.get();assert.equal(all(f.store),before);}finally{await f.app.close();}
 f=await open(NOW+120000,true);try{assert.equal((await f.get()).events.length,0,'control causal: nuevo epoch, otro dataset');}finally{await f.app.close();}
 f=await open(NOW+180000);try{assert.equal((await f.get()).events.length,1,'volver al seed persistido recupera historial');const c=f.prepared.dataset.commitments.find(c=>c.id==='ms-delivery-healthy')!;assert.deepEqual(projectCommitmentEvidence(c,f.prepared.dataset.observations,NOW+25*3600000).map(x=>x.state),['stale','stale','stale'],'el reloj actual envejece evidencia sin regenerarla');}finally{await f.app.close();}
});

test('Dos procesos cooperativos: candado rechaza el segundo; tras cerrar, otro proceso conserva epoch',async()=>{
 const root=folder(),filename=path.join(root,'data.sqlite');const store=new Store(filename);seed(store);store.close();
 const imported=(p:string)=>JSON.stringify(pathToFileURL(path.resolve(p)).href);
 const code=`import {Store} from ${imported('server/store.ts')};import {lockInstance} from ${imported('server/instance.ts')};import {initializeCommitmentScenarioSeed} from ${imported('server/commitment-scenario-seed.ts')};let release;try{release=lockInstance(${JSON.stringify(root)});}catch{process.send({type:'locked'},()=>process.exit(73));await new Promise(()=>{});}const store=new Store(${JSON.stringify(filename)});const result=initializeCommitmentScenarioSeed(store,()=>Number(process.argv[1]));if(result.status!=='ready'){process.send({type:'failed',result},()=>process.exit(74));await new Promise(()=>{});}process.on('message',()=>{store.close();release();process.exit(0);});process.send({type:'ready',seedAt:result.seedAt,revision:result.datasetRevision,created:result.created});`;
 const children:ChildProcess[]=[];
 const start=(now:number)=>{const child=spawn(process.execPath,['--import','tsx','--input-type=module','-e',code,String(now)],{cwd:process.cwd(),env:process.env,windowsHide:true,stdio:['ignore','pipe','pipe','ipc']});children.push(child);return child;};
 const message=(child:ChildProcess)=>new Promise<Record<string,unknown>>((resolve,reject)=>{let stderr='';child.stderr?.on('data',chunk=>{stderr+=String(chunk);});const timeout=setTimeout(()=>reject(new Error('Worker no responde: '+stderr.slice(-2000))),20000);child.once('error',e=>{clearTimeout(timeout);reject(e);});child.once('exit',code=>{clearTimeout(timeout);reject(new Error('Worker terminó antes del mensaje: '+code+' '+stderr.slice(-2000)));});child.once('message',value=>{clearTimeout(timeout);resolve(value as Record<string,unknown>);});});
 const closed=(child:ChildProcess)=>child.exitCode!==null?Promise.resolve(child.exitCode):new Promise<number|null>(resolve=>child.once('exit',resolve));
 try{const first=start(NOW),a=await message(first);assert.equal(a.type,'ready');assert.equal(a.created,true);const other=start(NOW+60000);assert.equal((await message(other)).type,'locked');assert.equal(await closed(other),73);first.send('close');assert.equal(await closed(first),0);const restarted=start(NOW+120000),b=await message(restarted);assert.equal(b.type,'ready');assert.equal(b.created,false);assert.equal(b.seedAt,a.seedAt);assert.equal(b.revision,a.revision);restarted.send('close');assert.equal(await closed(restarted),0);}finally{for(const child of children)if(child.exitCode===null){if(child.connected)child.send('close');else child.kill();}await Promise.all(children.map(closed));}
});
