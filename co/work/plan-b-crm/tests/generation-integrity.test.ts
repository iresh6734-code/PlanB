import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash,randomUUID} from 'node:crypto';
import {createBaseApp} from '../server/app.js';
import {AppError,type Store} from '../server/store.js';
import {makeFixture,makeDemoSpec} from '../shared/fixtures.js';
import {INVALID_RECOVERY_MESSAGE} from '../shared/recovery-integrity.js';
import type {ProviderSettings,AiConfig} from '../server/provider.js';
import type {generateWithAI} from '../server/ai.js';
const {registerGenerator}=await import(pathToFileURL(process.env.GENERATOR109_MODULE??path.resolve('server/generator.ts')).href) as typeof import('../server/generator.js');
const headers={host:'127.0.0.1:4531',origin:'http://127.0.0.1:4531'};
function gate<T=void>(){let resolve!:(value:T)=>void,reject!:(error:unknown)=>void;const promise=new Promise<T>((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};}
function ledger(store:Store){const names=(store.db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all() as {name:string}[]).map(r=>r.name);return Object.fromEntries(names.map(name=>[name,createHash('sha256').update(JSON.stringify(store.db.prepare('SELECT * FROM "'+name+'" ORDER BY rowid').all())).digest('hex')]));}
function corrupt(store:Store){store.db.prepare("INSERT INTO meta(key,value) VALUES('recoveryPlan',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run('{invalid-generation109');}
async function fixture(active=true,generate?:typeof generateWithAI,useDefault=false){
  const root=path.resolve('tests/.tmp/generation109-'+randomUUID()),base=await createBaseApp({root,dbPath:':memory:',staticDir:path.join(root,'no-assets')});
  const snap=makeFixture();base.store.importSnapshot(snap);base.store.saveGeneration(makeDemoSpec(snap),{provider:'demo',model:null,generatedAt:new Date().toISOString(),prompt:'',approved:false});if(active)base.store.activate();
  const config:AiConfig={preset:'ollama',baseUrl:'http://127.0.0.1:0/v1',model:'fictional-generator109',apiKey:'',inputUsdPerMillion:0,outputUsdPerMillion:0,outputMode:'json_schema',maxOutputTokens:1024};
  const calls={config:0,generate:0},providers={read(){calls.config++;return config;},public(){return null;},save(){throw Error('not used');}} as unknown as ProviderSettings;
  registerGenerator(base.app,base.store,providers,useDefault?undefined:async(...args)=>{calls.generate++;if(!generate)throw Error('Unexpected generation: fixture has no provider');return generate(...args);});
  const post=(mode:'demo'|'ai'='demo')=>base.app.inject({method:'POST',url:'/api/generate',headers,payload:{mode,prompt:'Instrucción ficticia109'}});
  return {...base,calls,providers,post};
}
function invalid(r:Awaited<ReturnType<Awaited<ReturnType<typeof fixture>>['post']>>){assert.equal(r.statusCode,409);assert.equal(r.json().error,INVALID_RECOVERY_MESSAGE);assert.equal(r.json().details.code,'RECOVERY_PLAN_INVALID');assert.ok(!r.body.includes('invalid-generation109'));}

for(const active of [true,false])for(const mode of ['demo','ai'] as const){
  test((active&&mode==='demo'?'F4 · demo bloqueada':'barrera inicial · '+mode)+' · '+(active?'copia activa':'propuesta sin activar')+' conserva todas las tablas y no lee configuración ni genera',async()=>{
    const f=await fixture(active);try{corrupt(f.store);const before=ledger(f.store);const r=await f.post(mode);invalid(r);assert.deepEqual(ledger(f.store),before);assert.deepEqual(f.calls,{config:0,generate:0});}finally{await f.app.close();}
  });
}
test('control demo · guarda una propuesta sin modificar registros, historial o la aplicación activa y no invoca IA',async()=>{
  const f=await fixture();try{const before=ledger(f.store),spec=f.store.spec;const r=await f.post();assert.equal(r.statusCode,200);assert.equal(r.json().generation.provider,'demo');assert.match(r.json().note,/No se ha llamado a una IA/);assert.equal(f.store.candidate?.generation?.approved,false);assert.deepEqual(f.store.spec,spec);const after=ledger(f.store);for(const table of Object.keys(before).filter(t=>t!=='meta'))assert.equal(after[table],before[table],table);assert.deepEqual(f.calls,{config:1,generate:0});}finally{await f.app.close();}
});
test('control generador inyectado · espera resultado y guarda los metadatos de la configuración ficticia',async()=>{
  const arrived=gate(),held=gate<ReturnType<typeof makeDemoSpec>>();const f=await fixture(true,async(store,snapshot,prompt,config)=>{assert.equal(store,f.store);assert.equal(prompt,'Instrucción ficticia109');assert.equal(config?.model,'fictional-generator109');assert.equal(snapshot.id,f.store.snapshot?.id);arrived.resolve();return held.promise;});
  try{const request=f.post('ai').then(r=>r);await Promise.race([arrived.promise,request.then(()=>{throw Error('Request ended before generator');})]);const pendingCandidate=f.store.candidate;assert.equal(pendingCandidate,null);held.resolve(makeDemoSpec(f.store.snapshot!));const r=await request;assert.equal(r.statusCode,200);assert.equal(f.store.candidate?.generation?.provider,'ai');assert.deepEqual(f.calls,{config:1,generate:1});}finally{held.resolve(makeDemoSpec(f.store.snapshot!));await f.app.close();}
});
test('dependencia por defecto · sin configuración el generador real rechaza503 sin proveedor o consumo',async()=>{
  const f=await fixture(true,undefined,true);f.providers.read=()=>{f.calls.config++;return null;};
  try{const r=await f.post('ai');assert.equal(r.statusCode,503);assert.match(r.json().error,/Configura tu proveedor/);assert.deepEqual(f.calls,{config:1,generate:0});assert.equal(f.store.db.prepare('SELECT COUNT(*) AS n FROM usage').get()!.n,0);assert.match(f.store.candidate?.error??'',/Configura tu proveedor/);}finally{await f.app.close();}
});
for(const active of [true,false])for(const controlled of [true,false]){
  test('fallo normal · '+(active?'copia activa':'sin activar')+' · '+(controlled?'AppError':'error privado')+' conserva diagnóstico permitido y permite otro intento',async()=>{
    const failure=controlled?new AppError(502,'Fallo ficticio del generador'):new Error('PRIVATE_GENERATION109');const f=await fixture(active,async()=>{throw failure;});
    try{const r=await f.post('ai');assert.equal(r.statusCode,controlled?502:500);assert.ok(!r.body.includes('PRIVATE_GENERATION109'));const message=active?f.store.candidate?.error:f.store.get('lastError',null);assert.equal(message,controlled?'Fallo ficticio del generador':'No se pudo completar la generación.');assert.equal(f.store.recoveryIntegrity().state,'none');assert.equal((await f.post()).statusCode,200);assert.equal(f.calls.generate,1);}finally{await f.app.close();}
  });
}
for(const outcome of ['success','error'] as const){
  test('corrupción durante espera · '+outcome+' devuelve409sin candidato, error persistido o escritura posterior',async()=>{
    const arrived=gate(),held=gate<ReturnType<typeof makeDemoSpec>>();const f=await fixture(true,async()=>{arrived.resolve();return held.promise;});
    try{const request=f.post('ai').then(r=>r);await Promise.race([arrived.promise,request.then(()=>{throw Error('Request ended before generator');})]);corrupt(f.store);const afterCorruption=ledger(f.store);if(outcome==='success')held.resolve(makeDemoSpec(f.store.snapshot!));else held.reject(new AppError(502,'Error tardío ficticio'));invalid(await request);assert.deepEqual(ledger(f.store),afterCorruption);assert.deepEqual(f.calls,{config:1,generate:1});}finally{held.resolve(makeDemoSpec(f.store.snapshot!));await f.app.close();}
  });
}
test('corrupción al preparar configuración · relee integridad antes de invocar el generador y no registra error',async()=>{
  const f=await fixture(true,async()=>makeDemoSpec(f.store.snapshot!));let expected:ReturnType<typeof ledger>|null=null;
  f.providers.read=()=>{f.calls.config++;corrupt(f.store);expected=ledger(f.store);return null;};
  try{invalid(await f.post('ai'));assert.ok(expected);assert.deepEqual(ledger(f.store),expected);assert.deepEqual(f.calls,{config:1,generate:0});}finally{await f.app.close();}
});
test('corrupción justo antes de la transacción de fallo · la guarda interior rechaza y conserva todas las tablas',async()=>{
  const f=await fixture(true,async()=>{throw new AppError(502,'Fallo previo a transacción');});const original=f.store.transaction.bind(f.store);let expected:ReturnType<typeof ledger>|null=null,transactions=0;
  f.store.transaction=fn=>{transactions++;corrupt(f.store);expected=ledger(f.store);return original(fn);};
  try{invalid(await f.post('ai'));assert.equal(transactions,1);assert.ok(expected);assert.deepEqual(ledger(f.store),expected);assert.equal(f.store.candidate,null);}finally{f.store.transaction=original;await f.app.close();}
});
test('exclusión mutua · una segunda generación no empieza mientras la primera espera y el cierre permite la siguiente',async()=>{
  const arrived=gate(),held=gate<ReturnType<typeof makeDemoSpec>>();const f=await fixture(true,async()=>{arrived.resolve();return held.promise;});
  try{const first=f.post('ai').then(r=>r);await Promise.race([arrived.promise,first.then(()=>{throw Error('Request ended before generator');})]);const before=ledger(f.store);const second=await f.post();assert.equal(second.statusCode,409);assert.match(second.json().error,/Hay una importación o generación en curso/);assert.deepEqual(ledger(f.store),before);assert.deepEqual(f.calls,{config:1,generate:1});held.resolve(makeDemoSpec(f.store.snapshot!));assert.equal((await first).statusCode,200);assert.equal((await f.post()).statusCode,200);assert.deepEqual(f.calls,{config:2,generate:1});}finally{held.resolve(makeDemoSpec(f.store.snapshot!));await f.app.close();}
});
