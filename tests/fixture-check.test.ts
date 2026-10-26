import test from 'node:test';
import assert from 'node:assert/strict';
import { makeFixture } from '../shared/fixtures.js';
import { checkFixture, type ExpectedFixture } from '../scripts/check-fixture.js';

function input() {
  const snapshot=makeFixture();
  // Synthetic input only: this test does not provide live HubSpot evidence.
  snapshot.source={kind:'hubspot',accountId:'test-portal',isTestData:true,description:'Respuesta sintética de prueba'};
  const task=snapshot.records.find(r=>r.id==='task-1')!;
  Object.assign(task.values,{hs_task_subject:'Tarea sintética',hs_timestamp:'2026-10-26T10:00:00.000Z'});
  snapshot.entities.find(e=>e.id==='tasks')!.fields.push(
    {key:'hs_task_subject',label:'Asunto',type:'text',required:false,readOnly:false,options:[],referenceEntity:null},
    {key:'hs_timestamp',label:'Fecha',type:'datetime',required:false,readOnly:false,options:[],referenceEntity:null});
  const expected:ExpectedFixture={account:{verifiedPortalId:'test-portal'},pipelines:[],
    customProperties:[{objectType:'contacts',name:'service',options:[{value:'web',label:'Diseño web'}]}],
    companies:[{ref:'company',actualHubspotId:'company-1',properties:{name:'Estudio Arce'}}],
    contacts:[{ref:'contact',actualHubspotId:'contact-1',properties:{email:'lucia.martin@example.com'}}],deals:[],
    tasks:[{ref:'task',properties:{hs_task_subject:'Tarea sintética',hs_timestamp:'2026-10-26T10:00:00Z',hs_task_body:'Fuera del alcance importado'}}],
    associations:[{from:'company',to:'contact'},{from:'task',to:'contact'}]};
  return {snapshot,expected};
}
test('el cierre del conjunto encuentra IDs de tareas y concilia relaciones en ambos sentidos sin ocultar extras',()=>{
  const {snapshot,expected}=input(),result=checkFixture(snapshot,expected);
  assert.equal(result.passed,true);
  assert.equal(result.matched.find(r=>r.ref==='task')?.id,'task-1');
  assert.equal(result.otherRecords?.length,59);
  assert.deepEqual(result.notCaptured,['tasks.hs_task_body']);
});
test('el cierre del conjunto rechaza una hora incorrecta, un pipeline ausente y una relación sin verificar',()=>{
  for(const change of ['time','pipeline','relation','options'] as const) {
    const {snapshot,expected}=input();
    if(change==='time')snapshot.records.find(r=>r.id==='task-1')!.values.hs_timestamp='2026-10-26T11:00:00Z';
    if(change==='pipeline')expected.pipelines.push({ref:'missing',actualHubspotId:'new-pipeline',label:'Nuevos',stages:[]});
    if(change==='relation'){snapshot.links=snapshot.links.filter(l=>l.fromId!=='contact-1');snapshot.manifest.expectedLinks=snapshot.links.length;}
    if(change==='options')snapshot.entities.find(e=>e.id==='contacts')!.fields.find(f=>f.key==='service')!.options=[];
    assert.equal(checkFixture(snapshot,expected).passed,false,change);
  }
});
test('una captura ficticia o de otro portal no acredita el conjunto y no expone sus IDs',()=>{
  for(const kind of ['fixture','other-portal'] as const) {
    const {snapshot,expected}=input();
    if(kind==='fixture')snapshot.source.kind='fixture';else snapshot.source.accountId='another';
    const result=checkFixture(snapshot,expected);
    assert.equal(result.passed,false);assert.deepEqual(result.matched,[]);assert.equal(result.otherRecords,undefined);
  }
});
