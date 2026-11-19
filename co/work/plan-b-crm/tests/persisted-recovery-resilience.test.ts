import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash,randomBytes,randomUUID} from 'node:crypto';
import type {Store as StoreType} from '../server/store.js';
import type {Remote} from '../server/recovery.js';
import type {RecoveryPlan} from '../shared/operations.js';
process.env.NODE_ENV='test';
const ROOT=path.resolve(process.env.PLANB_RESILIENCE111_ROOT??process.cwd()),load=(p:string)=>import(pathToFileURL(path.join(ROOT,p)).href);
const {Store,AppError}=await load('server/store.ts') as typeof import('../server/store.js');
const {Recovery}=await load('server/recovery.ts') as typeof import('../server/recovery.js');
const {makeFixture,makeDemoSpec}=await load('shared/fixtures.ts') as typeof import('../shared/fixtures.js');
const {createBaseApp}=await load('server/app.ts') as typeof import('../server/app.js');
const {INVALID_RECOVERY_MESSAGE}=await load('shared/recovery-integrity.ts') as typeof import('../shared/recovery-integrity.js');
const hash=(v:string|Buffer)=>createHash('sha256').update(v).digest('hex');
function seed(s:StoreType){const snap=makeFixture();s.importSnapshot(snap);s.saveGeneration(makeDemoSpec(snap),{provider:'demo',model:null,generatedAt:new Date().toISOString(),prompt:'',approved:false});s.activate();s.set('remoteMapping:simulation',{'contacts:already-local':'already-remote'});return s;}
function ledger(s:StoreType){const names=(s.db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all() as {name:string}[]).map(r=>r.name);return Object.fromEntries(names.map(n=>[n,hash(JSON.stringify(s.db.prepare('SELECT * FROM "'+n+'" ORDER BY rowid').all()))]));}
const row=(s:StoreType)=>s.db.prepare("SELECT typeof(value) AS type,hex(value) AS bytes FROM meta WHERE key='recoveryPlan'").get();
function rawPlan(s:StoreType,raw:string){s.db.prepare("INSERT INTO meta(key,value) VALUES('recoveryPlan',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(raw);}
function disk(){const root=path.resolve('tests/.tmp/resilience111-'+randomUUID());fs.mkdirSync(root,{recursive:true});fs.writeFileSync(path.join(root,'.planb-key'),JSON.stringify({kind:'test',data:randomBytes(32).toString('base64')}),{flag:'wx'});return {root,file:path.join(root,'fixture.sqlite')};}
function remote(s:StoreType,returned:unknown){
  const rows=new Map(s.snapshot!.records.map(r=>[r.entity+':'+r.id,structuredClone(r)])),calls:string[]=[],actualId=typeof returned==='string'&&returned.length?returned:'created-real111';
  const adapter:Remote={source:'simulation',accountId:s.snapshot!.source.accountId,
    async verify(){calls.push('verify');},async read(entity,id){calls.push('read:'+entity+':'+id);const r=rows.get(entity+':'+id);return r?structuredClone(r):null;},
    async create(entity,values){calls.push('create:'+entity);rows.set(entity+':'+actualId,{entity,id:actualId,values:structuredClone(values)});return returned as string;},
    async update(entity,id,values){calls.push('update:'+entity+':'+id);const r=rows.get(entity+':'+id)!;r.values={...r.values,...values};},
    async hasRelation(){calls.push('hasRelation');return true;},async relate(){calls.push('relate');}
  };return {adapter,calls,rows,actualId};
}
async function fixture(...args:unknown[]){
  const returned=args.length?args[0]:'opaque-created111',s=seed(new Store(':memory:')),r=remote(s,returned),record=s.saveRecord('contacts',{firstname:'Nueva',lastname:'Ficticia',email:'resilience111@example.test',company_id:'company-1'}),engine=new Recovery(s),plan=await engine.preview(r.adapter);r.calls.length=0;return {s,r,record,engine,plan};
}
const controlled=(e:unknown,status:number)=>e instanceof AppError&&e.status===status;
function gate(){let resolve!:()=>void;const promise=new Promise<void>(r=>{resolve=r;});return {promise,resolve};}

test('F1 · plan plaintext malformado se conserva byte a byte y abre invalid en tres reaperturas, con datos y mapas intactos',()=>{
  for(const raw of ['{malformed-private111','','{"status":"bogus"}','"private-plan111"','[]','1e999']){
    const d=disk();let s=seed(new Store(d.file));s.saveRecord('contacts',{phone:'fictional111'},'contact-1');rawPlan(s,raw);const before=ledger(s),planRow=row(s);s.close();const fileHash=hash(fs.readFileSync(d.file));
    for(let i=0;i<3;i++){assert.doesNotThrow(()=>{s=new Store(d.file);},'abrir debe conservar el plan y ofrecer diagnóstico invalid');try{assert.equal(s.recoveryIntegrity().state,'invalid');assert.equal(s.recoveryState().plan,null);assert.deepEqual(row(s),planRow);assert.deepEqual(ledger(s),before);assert.throws(()=>s.assertRecoveryIntegrity(),e=>controlled(e,409)&&e instanceof Error&&e.message===INVALID_RECOVERY_MESSAGE);}finally{s.close();}assert.equal(hash(fs.readFileSync(d.file)),fileHash);}
  }
});
test('F1 · planes plaintext válidos y null se migran a cifrado conservando su contenido y estado',async()=>{
  const f=await fixture();try{for(const value of [null,f.plan]){const d=disk();let s=seed(new Store(d.file));rawPlan(s,JSON.stringify(value));s.close();s=new Store(d.file);try{assert.equal(s.recoveryIntegrity().state,value?'valid':'none');assert.deepEqual(s.validatedRecoveryPlan(),value);const stored=s.db.prepare("SELECT value FROM meta WHERE key='recoveryPlan'").get()!.value;assert.equal(typeof stored,'string');assert.match(String(stored),/^enc1:/);}finally{s.close();}}}finally{f.s.close();}
});
test('F1 · JSON malformado en otra clave no se silencia y la migración revierte sin alterar el archivo',()=>{
  const d=disk(),s=seed(new Store(d.file));s.db.prepare("INSERT INTO meta(key,value) VALUES('unrelated-fixture111',?)").run('{not-json-other');s.close();const before=hash(fs.readFileSync(d.file));assert.throws(()=>new Store(d.file),SyntaxError);assert.equal(hash(fs.readFileSync(d.file)),before);
});
test('F1 · API consultable tras abrir plan plaintext inválido: historial legible, diagnóstico fijo y fila original conservada',async()=>{
  const d=disk(),s=seed(new Store(d.file));s.saveRecord('contacts',{phone:'history111'},'contact-1');rawPlan(s,'{PRIVATE_INVALID_PLAN111');const saved=row(s),changes=s.changes(),records=s.records();s.close();const a=await createBaseApp({root:d.root,dbPath:d.file,staticDir:path.join(d.root,'none')});
  try{const response=await a.app.inject({url:'/api/v2/changes',headers:{host:'127.0.0.1:4541'}});assert.equal(response.statusCode,200);const data=response.json();assert.equal(data.recoveryIntegrity.state,'invalid');assert.equal(data.recoveryIntegrity.message,INVALID_RECOVERY_MESSAGE);assert.equal(data.plan,null);assert.deepEqual(data.changes,changes);assert.ok(!response.body.includes('PRIVATE_INVALID_PLAN111'));assert.deepEqual(a.store.records(),records);assert.deepEqual(row(a.store),saved);}finally{await a.app.close();}
});
test('F2 · aprobación con registro local ausente rechaza con AppError409 sin cambiar ninguna tabla',async()=>{
  const f=await fixture();try{const p=structuredClone(f.plan);p.operations[0].localId='missing-local111';f.s.set('recoveryPlan',p);const before=ledger(f.s);assert.equal(f.s.recoveryIntegrity().state,'valid');assert.throws(()=>f.engine.approve(p.id),e=>controlled(e,409));assert.deepEqual(ledger(f.s),before);assert.deepEqual(f.r.calls,[]);}finally{f.s.close();}
});
test('F2 · aplicación de plan aprobado con registro ausente rechaza antes de verificar o despachar al remoto',async()=>{
  const f=await fixture();try{const p=structuredClone(f.plan);p.operations[0].localId='missing-local111';p.status='approved';p.approvedAt=new Date().toISOString();f.s.set('recoveryPlan',p);const before=ledger(f.s);await assert.rejects(f.engine.apply(p.id,f.r.adapter),e=>controlled(e,409));assert.deepEqual(f.r.calls,[]);assert.deepEqual(ledger(f.s),before);}finally{f.s.close();}
});
test('F2 · registro retirado durante verify no produce alta y queda un fallo de operación controlado sin plan inválido',async()=>{
  const f=await fixture(),arrived=gate(),held=gate();f.engine.approve(f.plan.id);f.r.adapter.verify=async()=>{f.r.calls.push('verify');arrived.resolve();await held.promise;};
  try{const running=f.engine.apply(f.plan.id,f.r.adapter);await Promise.race([arrived.promise,running.then(()=>{throw Error('apply finished before held verify');})]);f.s.db.prepare('DELETE FROM records WHERE entity=? AND id=?').run(f.record.entity,f.record.id);held.resolve();const result=await running;assert.equal(result.status,'partial');assert.equal(result.operations[0].status,'failed');assert.match(result.operations[0].error??'',/registro local/i);assert.deepEqual(f.r.calls,['verify']);assert.equal(f.s.recoveryIntegrity().state,'valid');}finally{held.resolve();f.s.close();}
});
test('F3 · tipo de ID remoto inválido o cadena vacía conserva incertidumbre, plan válido y mapa sin contaminación',async()=>{
  for(const returned of [7,0,null,undefined,{},'',true]){
    const f=await fixture(returned);try{f.engine.approve(f.plan.id);const mapping=f.s.get('remoteMapping:simulation',{}),changes=f.s.changes(),records=f.s.records();const attempt=await f.engine.apply(f.plan.id,f.r.adapter).then(value=>({value,error:null}),error=>({value:null,error}));assert.equal(f.s.recoveryIntegrity().state,'valid','una respuesta remota no puede invalidar el plan guardado');assert.equal(attempt.error,null);const result=attempt.value!;assert.equal(result.status,'partial');assert.equal(result.approvedAt,null);assert.equal(result.operations[0].status,'uncertain');assert.equal(result.operations[0].remoteId,null);assert.equal(f.s.recoveryIntegrity().state,'valid');assert.deepEqual(f.s.get('remoteMapping:simulation',{}),mapping);assert.equal(f.s.get('returnWatermark:simulation',0),0);assert.deepEqual(f.s.records(),records);assert.deepEqual(f.s.changes(),changes);assert.deepEqual(f.r.calls,['verify','create:contacts']);assert.ok(f.r.rows.has('contacts:'+f.r.actualId),'el efecto remoto ya ocurrió y no se finge deshacerlo');}finally{f.s.close();}
  }
});
test('F3 · IDs válidos 0, grandes y opacos se conservan como cadenas exactas, con verificación y finalización normales',async()=>{
  for(const id of ['0','9007199254740993','vendor:opaque-111']){const f=await fixture(id);try{f.engine.approve(f.plan.id);const result=await f.engine.apply(f.plan.id,f.r.adapter);assert.equal(result.status,'complete');assert.equal(result.operations[0].remoteId,id);assert.equal(f.s.get<Record<string,string>>('remoteMapping:simulation',{})['contacts:'+f.record.id],id);assert.ok(f.r.calls.includes('read:contacts:'+id));assert.equal(f.r.calls.filter(c=>c==='create:contacts').length,1);assert.equal(f.s.recoveryIntegrity().state,'valid');}finally{f.s.close();}}
});
test('F3 · reinicio no repite creación incierta; resolución explícita por ID leído permite terminar sin otra alta',async()=>{
  const f=await fixture(9);try{f.engine.approve(f.plan.id);const result=await f.engine.apply(f.plan.id,f.r.adapter);assert.equal(result.operations[0].status,'uncertain');const engine=new Recovery(f.s),count=f.r.calls.length;await assert.rejects(engine.apply(f.plan.id,f.r.adapter),e=>controlled(e,409));assert.throws(()=>engine.approve(f.plan.id),e=>controlled(e,409));assert.equal(f.r.calls.length,count);const resolved=await engine.resolveUncertain(f.plan.id,result.operations[0].id,f.r.actualId,f.r.adapter);assert.equal(resolved.operations[0].status,'applied');engine.approve(f.plan.id);const complete=await engine.apply(f.plan.id,f.r.adapter);assert.equal(complete.status,'complete');assert.equal(f.r.calls.filter(c=>c==='create:contacts').length,1);assert.equal(f.s.get<Record<string,string>>('remoteMapping:simulation',{})['contacts:'+f.record.id],f.r.actualId);}finally{f.s.close();}
});
test('save · decisión de tipo inválido no se persiste ni convierte un plan válido en invalid',async()=>{
  const f=await fixture();try{const op=f.plan.operations[0],before=ledger(f.s);assert.throws(()=>f.engine.decide(f.plan.id,[{operationId:op.id,field:op.fields[0].field,decision:'INVALID_PRIVATE111' as 'local'}]),e=>controlled(e,502)&&e instanceof Error&&!e.message.includes('INVALID_PRIVATE111'));assert.deepEqual(ledger(f.s),before);assert.equal(f.s.recoveryIntegrity().state,'valid');}finally{f.s.close();}
});
test('save · la corrupción justo antes de la transacción conserva el diagnósticoR1 y no se sustituye por fallo de validación nuevo',async()=>{
  const f=await fixture(),original=f.s.transaction.bind(f.s);let expected:ReturnType<typeof ledger>|null=null;
  f.s.transaction=fn=>{rawPlan(f.s,'{invalid-before-save111');expected=ledger(f.s);return original(fn);};
  try{const op=f.plan.operations[0];assert.throws(()=>f.engine.decide(f.plan.id,[{operationId:op.id,field:op.fields[0].field,decision:'local'}]),e=>controlled(e,409)&&e instanceof Error&&e.message===INVALID_RECOVERY_MESSAGE);assert.ok(expected);assert.deepEqual(ledger(f.s),expected);}finally{f.s.transaction=original;f.s.close();}
});
