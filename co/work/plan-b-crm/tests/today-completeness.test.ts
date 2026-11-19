import test from 'node:test';
import assert from 'node:assert/strict';
import { Store } from '../server/store.js';
import { SalesAgents } from '../server/agents.js';
import { createBaseApp } from '../server/app.js';
import { makeFixture, makeDemoSpec } from '../shared/fixtures.js';
import type { CrmRecord } from '../shared/model.js';

function prepare(store:Store,deals=47,tasks=63) {
  const snapshot=makeFixture(),deal=snapshot.records.find(r=>r.entity==='deals')!,task=snapshot.records.find(r=>r.entity==='tasks')!;
  snapshot.records=snapshot.records.filter(r=>r.entity!=='deals'&&r.entity!=='tasks');
  const add=(base:CrmRecord,count:number,key:string)=>{for(let i=0;i<count;i++){
    const record=structuredClone(base);record.id='fixture059-'+base.entity+'-'+String(i).padStart(5,'0');
    for(const field of snapshot.entities.find(e=>e.id===base.entity)!.fields)if(field.type==='reference')record.values[field.key]=null;
    record.values[key]=(base.entity==='deals'?'Oportunidad':'Tarea')+' Pendiente059 '+String(i).padStart(5,'0');
    if(base.entity==='tasks'){record.values.due_date='2020-01-01';record.values.status='pending';}snapshot.records.push(record);
  }};
  add(deal,deals,'dealname');add(task,tasks,'subject');snapshot.links=[];snapshot.manifest.expectedLinks=0;
  for(const entity of snapshot.entities)snapshot.manifest.expectedCounts[entity.id]=snapshot.records.filter(r=>r.entity===entity.id).length;
  store.importSnapshot(snapshot);store.saveGeneration(makeDemoSpec(snapshot),{provider:'demo',model:null,generatedAt:'2026-10-30T10:00:00Z',prompt:'',approved:false});store.activate();return snapshot;
}
const clock=()=>new Date('2026-10-30T12:00:00Z');

test('Hoy returns every matching opportunity and commitment after the twentieth, with full totals and no writes',()=>{
  const store=new Store(':memory:');try{
    prepare(store);const agents=new SalesAgents(store,false,undefined,clock),before=store.bundle(),result=agents.today();
    assert.equal(result.opportunities.length,47);assert.equal(result.tasks.length,63);assert.deepEqual(result.listTotals,{opportunities:47,tasks:63});
    assert.equal(result.openDeals,47);assert.equal(result.overdueTasks,63);assert.equal(result.dueToday,0);
    assert.ok(result.opportunities.some(r=>r.id==='fixture059-deals-00046'));assert.ok(result.tasks.some(r=>r.id==='fixture059-tasks-00062'));
    assert.deepEqual(store.records(),before.records);assert.deepEqual(store.changes(),before.changes);assert.deepEqual(agents.overview().proposals,[]);
  }finally{store.close();}
});

test('a larger read list does not enlarge simulation batches, and later analyses reach the next unseen opportunity',()=>{
  const store=new Store(':memory:');try{
    prepare(store,47,0);const agents=new SalesAgents(store,false,undefined,clock),before=store.records();
    assert.equal(agents.run().proposals,20);assert.equal(agents.run().proposals,20);assert.equal(agents.run().proposals,7);assert.equal(agents.run().proposals,0);
    const overview=agents.overview();assert.equal(overview.proposals.length,47);assert.equal(new Set(overview.proposals.map(p=>p.dealId)).size,47);
    assert.ok(overview.proposals.every(p=>p.status==='review'&&p.approvedAt===null));assert.equal(overview.artifacts.length,0);assert.deepEqual(store.records(),before);
  }finally{store.close();}
});

test('simulation retains its global one-hundred proposal cap and never executes newly visible work automatically',()=>{
  const store=new Store(':memory:');try{
    prepare(store,125,0);const agents=new SalesAgents(store,false,undefined,clock);
    for(let i=0;i<5;i++)assert.equal(agents.run().proposals,20);
    assert.throws(()=>agents.run(),/límite de 100/);assert.equal(agents.overview().proposals.length,100);assert.equal(agents.overview().artifacts.length,0);
  }finally{store.close();}
});

test('Hoy remains complete at the ten-thousand record workspace bound',()=>{
  const store=new Store(':memory:');try{
    const base=makeFixture().records.filter(r=>r.entity!=='deals'&&r.entity!=='tasks').length;
    prepare(store,6000,10000-base-6000);const result=new SalesAgents(store,false,undefined,clock).today();
    assert.equal(store.records().length,10000);assert.equal(result.opportunities.length,6000);assert.equal(result.tasks.length,10000-base-6000);
    assert.deepEqual(result.listTotals,{opportunities:result.opportunities.length,tasks:result.tasks.length});
  }finally{store.close();}
});

test('the existing protected GET delivers complete rows; production and independent runtime remain unavailable',async()=>{
  const {app,store}=await createBaseApp({dbPath:':memory:',root:'.',staticDir:'no-static'});try{
    prepare(store);const response=await app.inject({url:'/api/v4/today'});assert.equal(response.statusCode,200);assert.equal(response.json().opportunities.length,47);assert.equal(response.json().tasks.length,63);
    await app.inject({method:'POST',url:'/api/v2/auth/setup',payload:{password:'fixture-local-today059'}});assert.equal((await app.inject({url:'/api/v4/today'})).statusCode,401);
    assert.equal(new SalesAgents(store,true).today().available,false);
    store.set('snapshot',{...store.snapshot!,source:{...store.snapshot!.source,isTestData:false}});const unavailable=new SalesAgents(store).today();assert.equal(unavailable.available,false);assert.equal(unavailable.tasks.length,0);assert.equal(unavailable.opportunities.length,0);
  }finally{await app.close();}
});
