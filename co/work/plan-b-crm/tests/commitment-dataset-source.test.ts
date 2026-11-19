import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createBaseApp} from '../server/app.js';
import {registerCommitments,type CommitmentDatasetProvider} from '../server/commitments.js';
import {workspaceSearchIdentity} from '../server/workspace-search.js';
import {makeDemoSpec,makeFixture} from '../shared/fixtures.js';
import {createMultisystemScenario} from '../shared/commitment-multisystem-demo.js';
import {commitmentDetailResponse,commitmentListResponse,commitmentPath,type CommitmentDataset} from '../shared/commitments.js';
const NOW=Date.parse('2026-11-08T10:00:00.000Z'),headers={host:'127.0.0.1'};
async function fixture(provider:CommitmentDataset|CommitmentDatasetProvider,clock=()=>NOW){
 const f=await createBaseApp({root:'.',dbPath:':memory:',staticDir:'none'}),snapshot=makeFixture('agency');f.store.importSnapshot(snapshot);f.store.saveGeneration(makeDemoSpec(snapshot),{provider:'demo',model:null,generatedAt:new Date(NOW).toISOString(),prompt:'',approved:false});f.store.activate();registerCommitments(f.app,f.store,provider,clock);
 const context=()=>workspaceSearchIdentity(f.store)!.contextRevision;
 const get=(id='')=>f.app.inject({url:commitmentPath+(id?'/'+id:'')+'?contextRevision='+context(),headers});
 return{...f,context,get};
}
const decision=(contextRevision:string,expectedRevision:string)=>({contextRevision,expectedRevision,operationId:randomUUID(),decision:{type:'assign',owner:'Responsable ficticio291',nextStep:'Comprobar escenario de ensayo',dueAt:new Date(NOW+3600000).toISOString()}});
const ledger=(f:Awaited<ReturnType<typeof fixture>>)=>f.store.db.prepare("SELECT key,value FROM meta WHERE key LIKE 'commitment-demo:%' ORDER BY key").all();

test('Proveedor ausente o incompatible da503fijo sin escribir ni copiar excepción',async t=>{
 for(const value of [null,{format:'other'},Promise.resolve(null)]){const f=await fixture((()=>value)as CommitmentDatasetProvider);t.after(()=>f.app.close());assert.equal((await f.get()).statusCode,503);assert.deepEqual(ledger(f),[]);}
 const f=await fixture(()=>{throw new Error('mensaje privado de ensayo');});t.after(()=>f.app.close());const r=await f.get();assert.equal(r.statusCode,503);assert.ok(!r.body.includes('mensaje privado'));
});
test('Listado llama una vez y usa un corte copiado incluso si el reloj muta la entrada',async t=>{
 const dataset=createMultisystemScenario(NOW);let calls=0;const originalTitles=dataset.commitments.map(c=>c.title);
 const f=await fixture(()=>{calls++;return dataset;},()=>{dataset.commitments[0]!.title='Otro título posterior';dataset.observations[0]!.condition='blocked';return NOW;});t.after(()=>f.app.close());
 const r=commitmentListResponse.parse((await f.get()).json());assert.equal(calls,1);assert.deepEqual(r.items.map(i=>i.title),originalTitles);assert.equal(r.items[0]!.affectedRole,'delivery');assert.deepEqual(ledger(f),[]);
});
test('Detalle y decisión capturan cada uno una única versión; no mezclan revisión, evidencia o diario',async t=>{
 const a=createMultisystemScenario(NOW),b=createMultisystemScenario(NOW+60000);let current=a,calls=0;
 const f=await fixture(()=>{calls++;return current;});t.after(()=>f.app.close());
 const first=commitmentDetailResponse.parse((await f.get('ms-installation-hubspot')).json());assert.equal(calls,1);
 const payload=decision(f.context(),first.item.revision);const write=await f.app.inject({method:'POST',url:commitmentPath+'/ms-installation-hubspot/decisions',headers,payload});assert.equal(write.statusCode,200);assert.equal(calls,2);const before=JSON.stringify(ledger(f));
 current=b;const next=commitmentDetailResponse.parse((await f.get('ms-installation-hubspot')).json());assert.equal(calls,3);assert.equal(next.events.length,0);assert.notEqual(next.item.revision,first.item.revision);
 const stale=await f.app.inject({method:'POST',url:commitmentPath+'/ms-installation-hubspot/decisions',headers,payload:decision(f.context(),write.json().revision)});assert.equal(stale.statusCode,409);assert.equal(calls,4);assert.equal(JSON.stringify(ledger(f)),before);
 current=a;assert.equal(commitmentDetailResponse.parse((await f.get('ms-installation-hubspot')).json()).events.length,1);assert.equal(calls,5);
});
test('Una decisión no cambia de corte si el reloj modifica el proveedor antes de escribir',async t=>{
 const a=createMultisystemScenario(NOW),b=createMultisystemScenario(NOW+60000);let current=a,change=false,calls=0;
 const f=await fixture(()=>{calls++;return current;},()=>{if(change)current=b;return NOW;});t.after(()=>f.app.close());const detail=commitmentDetailResponse.parse((await f.get('ms-installation-hubspot')).json());change=true;
 const r=await f.app.inject({method:'POST',url:commitmentPath+'/ms-installation-hubspot/decisions',headers,payload:decision(f.context(),detail.item.revision)});assert.equal(r.statusCode,200);assert.equal(calls,2);
 change=false;current=a;const restored=commitmentDetailResponse.parse((await f.get('ms-installation-hubspot')).json());assert.equal(restored.events.length,1);assert.equal(restored.item.action?.owner,'Responsable ficticio291');
 current=b;assert.equal(commitmentDetailResponse.parse((await f.get('ms-installation-hubspot')).json()).events.length,0);
});
test('Proveedor que cambia el contexto no publica ni escribe, también si luego falla',async t=>{
 for(const fails of [false,true]){let mutate=()=>{};const f=await fixture(()=>{mutate();if(fails)throw new Error('privado');return createMultisystemScenario(NOW);});t.after(()=>f.app.close());const pin=f.context();mutate=()=>f.store.set('sessionId','sesion-ficticia-cambiada');
 const response=await f.app.inject({url:commitmentPath+'?contextRevision='+pin,headers});assert.equal(response.statusCode,409);assert.ok(!response.body.includes('ms-installation'));assert.deepEqual(ledger(f),[]);}
});
test('Se revalida autorización original después del proveedor, incluso en error',async t=>{
 for(const fails of [false,true]){let revoke=()=>{};const f=await fixture(()=>{revoke();if(fails)throw new Error('privado');return createMultisystemScenario(NOW);});t.after(()=>f.app.close());const setup=await f.app.inject({method:'POST',url:'/api/v2/auth/setup',headers,payload:{password:'contrasena-ficticia-291'}});assert.equal(setup.statusCode,200);const cookie=String(setup.headers['set-cookie']).split(';')[0];revoke=()=>f.store.set('password',null);
 const response=await f.app.inject({url:commitmentPath+'?contextRevision='+f.context(),headers:{...headers,cookie}});assert.equal(response.statusCode,401);assert.ok(!response.body.includes('ms-installation'));assert.deepEqual(ledger(f),[]);}
});
test('Las solicitudes sin pin válido no llaman al proveedor; el modo estático conserva su validación inicial',async t=>{
 let calls=0;const f=await fixture(()=>{calls++;return createMultisystemScenario(NOW);});t.after(()=>f.app.close());assert.equal((await f.app.inject({url:commitmentPath+'?contextRevision='+'0'.repeat(64),headers})).statusCode,409);assert.equal(calls,0);
 const empty=await createBaseApp({root:'.',dbPath:':memory:',staticDir:'none'});t.after(()=>empty.app.close());assert.throws(()=>registerCommitments(empty.app,empty.store,{format:'other'}as unknown as CommitmentDataset));
});
