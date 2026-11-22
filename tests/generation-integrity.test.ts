import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash,randomUUID} from 'node:crypto';
import {createBaseApp} from '../server/app.js';
import {AppError,type Store} from '../server/store.js';
import {makeFixture,makeDemoSpec} from '../shared/fixtures.js';
import {INVALID_RECOVERY_MESSAGE} from '../shared/recovery-integrity.js';
const {registerGenerator}=await import(pathToFileURL(process.env.GENERATOR109_MODULE??path.resolve('server/generator.ts')).href) as typeof import('../server/generator.js');
const headers={host:'127.0.0.1:4531',origin:'http://127.0.0.1:4531'};
function gate<T=void>(){let resolve!:(value:T)=>void,reject!:(error:unknown)=>void;const promise=new Promise<T>((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};}
function ledger(store:Store){const names=(store.db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all() as {name:string}[]).map(r=>r.name);return Object.fromEntries(names.map(name=>[name,createHash('sha256').update(JSON.stringify(store.db.prepare('SELECT * FROM "'+name+'" ORDER BY rowid').all())).digest('hex')]));}
function corrupt(store:Store){store.db.prepare("INSERT INTO meta(key,value) VALUES('recoveryPlan',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run('{invalid-generation109');}
// La generación con un proveedor de IA está aparcada (rama archivo/aparcado-2026-11-22); sus pruebas de integridad se archivaron con ella.
async function fixture(active=true){
  const root=path.resolve('tests/.tmp/generation109-'+randomUUID()),base=await createBaseApp({root,dbPath:':memory:',staticDir:path.join(root,'no-assets')});
  const snap=makeFixture();base.store.importSnapshot(snap);base.store.saveGeneration(makeDemoSpec(snap),{provider:'demo',model:null,generatedAt:new Date().toISOString(),prompt:'',approved:false});if(active)base.store.activate();
  registerGenerator(base.app,base.store);
  const post=(payload:Record<string,unknown>={mode:'demo'})=>base.app.inject({method:'POST',url:'/api/generate',headers,payload});
  return {...base,post};
}
function invalid(r:Awaited<ReturnType<Awaited<ReturnType<typeof fixture>>['post']>>){assert.equal(r.statusCode,409);assert.equal(r.json().error,INVALID_RECOVERY_MESSAGE);assert.equal(r.json().details.code,'RECOVERY_PLAN_INVALID');assert.ok(!r.body.includes('invalid-generation109'));}

for(const active of [true,false]){
  test((active?'F4 · demo bloqueada · copia activa':'barrera inicial · demo · propuesta sin activar')+' conserva todas las tablas',async()=>{
    const f=await fixture(active);try{corrupt(f.store);const before=ledger(f.store);invalid(await f.post());assert.deepEqual(ledger(f.store),before);}finally{await f.app.close();}
  });
}
test('IA aparcada · el modo ai y las instrucciones se rechazan sin tocar ninguna tabla',async()=>{
  const f=await fixture();try{const before=ledger(f.store);
    for(const payload of [{mode:'ai'},{mode:'ai',prompt:'Instrucción ficticia109'},{mode:'demo',prompt:'Instrucción ficticia109'}]){const r=await f.post(payload);assert.equal(r.statusCode,422,JSON.stringify(payload));}
    assert.deepEqual(ledger(f.store),before);
    for(const method of ['GET','PUT'] as const)assert.equal((await f.app.inject({method,url:'/api/settings/ai',headers,payload:method==='PUT'?{}:undefined})).statusCode,404);
  }finally{await f.app.close();}
});
test('control demo · guarda una propuesta sin modificar registros, historial o la aplicación activa y no invoca IA',async()=>{
  const f=await fixture();try{const before=ledger(f.store),spec=f.store.spec;const r=await f.post();assert.equal(r.statusCode,200);assert.equal(r.json().generation.provider,'demo');assert.match(r.json().note,/No se ha llamado a una IA/);assert.equal(f.store.candidate?.generation?.approved,false);assert.deepEqual(f.store.spec,spec);const after=ledger(f.store);for(const table of Object.keys(before).filter(t=>t!=='meta'))assert.equal(after[table],before[table],table);}finally{await f.app.close();}
});
