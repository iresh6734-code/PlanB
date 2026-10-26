import test from 'node:test';
import assert from 'node:assert/strict';
import { makeFixture } from '../shared/fixtures.js';
import { Store } from '../server/store.js';
import { defineRehearsal, seedRehearsal, checkRehearsal } from '../scripts/return-rehearsal.js';

function schema(){
  const s=makeFixture();s.version=2;s.source={kind:'hubspot',accountId:'149623339',isTestData:true,accountType:'DEVELOPER_TEST',description:'Esquema sintético de prueba.'};
  s.pipelines=[{id:'4252418259',label:'[FICTICIO] Plan B · Nuevos clientes'}];s.stages=s.stages.map((stage,i)=>({...stage,label:i===0?'Contacto inicial':stage.label,pipelineId:'4252418259'}));
  s.entities.find(e=>e.id==='contacts')!.fields.find(f=>f.key==='email')!.required=false;
  s.entities.find(e=>e.id==='deals')!.fields.push({key:'pipeline',label:'Proceso',type:'enum',required:true,readOnly:false,referenceEntity:null,options:s.pipelines});
  const task=s.entities.find(e=>e.id==='tasks')!;for(const f of task.fields){if(f.key==='subject')f.key='hs_task_subject';if(f.key==='due_date'){f.key='hs_timestamp';f.type='datetime';}if(f.key==='status'){f.key='hs_task_status';f.options=[{id:'NOT_STARTED',label:'Pendiente'},{id:'COMPLETED',label:'Completada'}];}}
  task.displayField='hs_task_subject';task.columns=task.columns.map(k=>({subject:'hs_task_subject',due_date:'hs_timestamp',status:'hs_task_status'}[k]??k));
  for(const r of s.records){if(r.entity==='deals')r.values.pipeline='4252418259';if(r.entity==='tasks'){r.values.hs_task_subject=r.values.subject;delete r.values.subject;r.values.hs_timestamp=String(r.values.due_date)+'T10:00:00.000Z';delete r.values.due_date;r.values.hs_task_status=r.values.status==='completed'?'COMPLETED':'NOT_STARTED';delete r.values.status;}}
  return s;
}
test('ensayo crea solo cuatro fichas nuevas y no copia los registros originales',()=>{
  const definition=defineRehearsal(schema(),'qa-123456',new Date('2026-10-26T12:00:00Z')),store=new Store(':memory:');
  try{const records=seedRehearsal(store,definition);assert.equal(definition.baseline.records.length,0);assert.equal(definition.schemaCapturedAt.length>0,true);assert.equal(store.records().length,4);assert.equal(store.changesCount,4);assert.equal(store.pendingChangesCount,4);assert.equal(store.get('hubspotConnection',null),null);
    assert.equal(records.company.values.domain,'planb-qa-123456.invalid');assert.equal(records.contact.values.email,undefined);assert.equal(records.task.values.hs_timestamp,'2026-10-28T10:00:00.000Z');assert.ok(store.records().every(r=>r.id.startsWith('local-')));assert.throws(()=>seedRehearsal(store,definition),/carpeta vacía/);
  }finally{store.close();}
});
test('el caso concreto pasa altas, relaciones, actualizaciones y repetición sin cerrar cambios reales',async()=>{
  const definition=defineRehearsal(schema(),'qa-123456'),store=new Store(':memory:');
  try{seedRehearsal(store,definition);const before=store.bundle(),report=await checkRehearsal(store,definition);assert.equal(report.passed,true);assert.equal(report.hubspotWrites,0);assert.equal(report.liveApi,false);assert.equal(report.simulatedCreates,4);assert.equal(report.simulatedUpdates,2);assert.equal(report.simulatedRelations,5);assert.equal(report.duplicateBlocked,true);assert.ok(report.proposedCreates.every(o=>o.remoteIdPending));assert.ok(!JSON.stringify(report).includes('99000000000'));assert.deepEqual(store.records(),before.records);assert.deepEqual(store.changes(),before.changes);assert.equal(store.pendingChangesCount,4);assert.equal(store.get('returnComplete',false),false);
  }finally{store.close();}
});
test('el ensayo rechaza otro portal, producción y cambios de etapas o estados',()=>{
  for(const alter of [(s:ReturnType<typeof schema>)=>{s.source.accountId='999';},(s:ReturnType<typeof schema>)=>{s.source.accountType='STANDARD';},(s:ReturnType<typeof schema>)=>{s.stages[0].label='Otra';},(s:ReturnType<typeof schema>)=>{s.entities.find(e=>e.id==='tasks')!.fields.find(f=>f.key==='hs_task_status')!.readOnly=true;}]){const s=schema();alter(s);assert.throws(()=>defineRehearsal(s,'qa-123456'));}
});
