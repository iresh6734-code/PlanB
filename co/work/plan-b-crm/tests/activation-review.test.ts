import test from 'node:test';
import assert from 'node:assert/strict';
import { createBaseApp } from '../server/app.js';
import { makeFixture, makeDemoSpec } from '../shared/fixtures.js';
import { preparationTarget } from '../shared/activation-review.js';

function prepare(store:Awaited<ReturnType<typeof createBaseApp>>['store'],profile:'agency'|'distribution'='agency',activate=false) {
  const snapshot=makeFixture(profile);store.importSnapshot(snapshot);store.saveGeneration(makeDemoSpec(snapshot),{provider:'demo',model:null,generatedAt:new Date().toISOString(),prompt:'',approved:false});if(activate)store.activate();return snapshot;
}
const commit=(revision:string)=>({method:'POST' as const,url:'/api/v4/activate-reviewed',payload:{reviewed:true,revision}});

test('preview targets the actual pending candidate rather than the older active schema, without exposing record values',async()=>{
  const {app,store}=await createBaseApp({dbPath:':memory:',root:'.',staticDir:'none'});try{
    prepare(store,'agency',true);prepare(store,'distribution');const before=store.bundle();const review=(await app.inject({url:'/api/v4/activation-review'})).json();
    assert.equal(review.kind,'candidate');assert.equal(review.target.snapshot.name,'Distribuidora Atlas');assert.ok(review.target.spec.entities[0].fields.some((f:any)=>f.key==='customer_code'));assert.equal(store.spec!.title,'Agencia Norte');assert.equal(review.canActivate,true);
    assert.deepEqual(review.target.snapshot.records,[]);assert.deepEqual(review.target.snapshot.links,[]);assert.ok(!JSON.stringify(review).includes('lucia.martin@example.com'));assert.deepEqual(store.records(),before.records);assert.deepEqual(store.changes(),before.changes);
    const state=(await app.inject({url:'/api/v2/state'})).json();assert.equal(preparationTarget(state).spec!.title,'Distribuidora Atlas');
  }finally{await app.close();}
});
test('a matching reviewed revision activates exactly its candidate and cannot be reused after activation',async()=>{
  const {app,store}=await createBaseApp({dbPath:':memory:',root:'.',staticDir:'none'});try{
    prepare(store,'agency',true);const target=prepare(store,'distribution');const preview=(await app.inject({url:'/api/v4/activation-review'})).json();const response=await app.inject(commit(preview.revision));
    assert.equal(response.statusCode,200);assert.equal(response.json().reviewedRevision,preview.revision);assert.equal(store.snapshot!.id,target.id);assert.equal(store.spec!.title,'Distribuidora Atlas');assert.equal(store.candidate,null);assert.equal((await app.inject(commit(preview.revision))).statusCode,409);
  }finally{await app.close();}
});
test('candidate schema mutation after review is rejected before activation and preserves active records/history',async()=>{
  const {app,store}=await createBaseApp({dbPath:':memory:',root:'.',staticDir:'none'});try{
    prepare(store,'agency',true);prepare(store,'distribution');const preview=(await app.inject({url:'/api/v4/activation-review'})).json(),before=store.bundle();
    const next=structuredClone(store.candidate!.spec!);next.description='Changed after explicit review';store.saveGeneration(next,{...store.candidate!.generation!,generatedAt:'2026-10-30T12:00:00Z'});
    assert.equal((await app.inject(commit(preview.revision))).statusCode,409);assert.equal(store.spec!.title,'Agencia Norte');assert.deepEqual(store.records(),before.records);assert.deepEqual(store.changes(),before.changes);assert.ok(store.candidate);
  }finally{await app.close();}
});
test('editing current data after review invalidates approval, including when changes count is otherwise not a target selector',async()=>{
  const {app,store}=await createBaseApp({dbPath:':memory:',root:'.',staticDir:'none'});try{
    prepare(store,'agency',true);const snapshot=store.snapshot!;store.saveGeneration(makeDemoSpec(snapshot),{provider:'demo',model:null,generatedAt:new Date().toISOString(),prompt:'',approved:false});
    const review=(await app.inject({url:'/api/v4/activation-review'})).json();store.saveRecord('contacts',{phone:'fixture-mutation066'},'contact-1');const before=store.bundle();assert.equal((await app.inject(commit(review.revision))).statusCode,409);assert.deepEqual(store.records(),before.records);assert.deepEqual(store.changes(),before.changes);
    const refreshed=(await app.inject({url:'/api/v4/activation-review'})).json();assert.notEqual(refreshed.revision,review.revision);assert.equal((await app.inject(commit(refreshed.revision))).statusCode,200);assert.equal(store.record('contacts','contact-1')!.values.phone,'fixture-mutation066');
  }finally{await app.close();}
});
test('candidate missing spec or failed generation never falls back to a valid active application',async()=>{
  const {app,store}=await createBaseApp({dbPath:':memory:',root:'.',staticDir:'none'});try{
    prepare(store,'agency',true);store.importSnapshot(makeFixture('distribution'));const review=(await app.inject({url:'/api/v4/activation-review'})).json();assert.equal(review.kind,'candidate');assert.equal(review.target.spec,null);assert.equal(review.canActivate,false);assert.equal((await app.inject(commit(review.revision))).statusCode,409);
    store.failGeneration('Fixture candidate failed');const failed=(await app.inject({url:'/api/v4/activation-review'})).json();assert.equal(failed.target.error,'Fixture candidate failed');assert.equal(failed.target.spec,null);assert.equal(failed.canActivate,false);assert.equal(store.spec!.title,'Agencia Norte');
  }finally{await app.close();}
});
test('replacing records still needs the existing replacement consent and rejects later local changes',async()=>{
  const {app,store}=await createBaseApp({dbPath:':memory:',root:'.',staticDir:'none'});try{
    prepare(store,'agency',true);store.saveRecord('contacts',{phone:'before-review'},'contact-1');const snap=makeFixture('distribution');store.importSnapshot(snap,true);store.saveGeneration(makeDemoSpec(snap),{provider:'demo',model:null,generatedAt:new Date().toISOString(),prompt:'',approved:false});
    const review=(await app.inject({url:'/api/v4/activation-review'})).json();assert.equal(review.localChanges,1);assert.equal(review.replacesRecords,true);assert.equal(review.replacementConfirmed,true);assert.equal(review.canActivate,true);
    store.saveRecord('contacts',{phone:'after-review'},'contact-1');assert.equal((await app.inject(commit(review.revision))).statusCode,409);const next=(await app.inject({url:'/api/v4/activation-review'})).json();assert.equal(next.canActivate,false);assert.equal((await app.inject(commit(next.revision))).statusCode,409);assert.equal(store.record('contacts','contact-1')!.values.phone,'after-review');assert.equal(store.changesCount,2);
  }finally{await app.close();}
});
test('continuity session and an in-flight return remain blockers, with no provider calls',async()=>{
  const {app,store}=await createBaseApp({dbPath:':memory:',root:'.',staticDir:'none'});try{
    prepare(store);for(const key of ['continuitySession','returnBusy']){store.set(key,true);const review=(await app.inject({url:'/api/v4/activation-review'})).json();assert.equal(review.canActivate,false);assert.equal((await app.inject(commit(review.revision))).statusCode,409);assert.equal(store.ready,false);store.set(key,null);}
  }finally{await app.close();}
});
test('revision/check/activation have no async gap: queued changes run after a successful synchronous commit',async()=>{
  const {app,store}=await createBaseApp({dbPath:':memory:',root:'.',staticDir:'none'});try{
    prepare(store);const review=(await app.inject({url:'/api/v4/activation-review'})).json();let invoked=false;const activate=store.activate.bind(store);store.activate=()=>{invoked=true;activate();queueMicrotask(()=>store.set('lastError','queued after activation'));};
    const response=await app.inject(commit(review.revision));assert.equal(response.statusCode,200);assert.equal(invoked,true);assert.equal(store.ready,true);assert.equal(store.get('lastError',''),'queued after activation');
  }finally{await app.close();}
});
test('new review endpoints preserve auth/Host/Origin/no-store and reject malformed commits; runtime is excluded',async()=>{
  const {app,store}=await createBaseApp({dbPath:':memory:',root:'.',staticDir:'none'});try{
    prepare(store);assert.equal((await app.inject({url:'/api/v4/activation-review',headers:{host:'outside.invalid'}})).statusCode,403);assert.equal((await app.inject({url:'/api/v4/activation-review',headers:{origin:'https://outside.invalid'}})).statusCode,403);
    const review=await app.inject({url:'/api/v4/activation-review'});assert.equal(review.headers['cache-control'],'no-store');for(const payload of [{reviewed:false,revision:review.json().revision},{reviewed:true,revision:'bad'},{reviewed:true,revision:review.json().revision,extra:true}])assert.equal((await app.inject({method:'POST',url:'/api/v4/activate-reviewed',payload})).statusCode,422);
    await app.inject({method:'POST',url:'/api/v2/auth/setup',payload:{password:'fiction-local-activation066'}});assert.equal((await app.inject({url:'/api/v4/activation-review'})).statusCode,401);assert.equal((await app.inject(commit(review.json().revision))).statusCode,401);
  }finally{await app.close();}
  const runtime=await createBaseApp({dbPath:':memory:',root:'.',staticDir:'none',runtime:true});try{assert.equal((await runtime.app.inject({url:'/api/v4/activation-review'})).statusCode,403);assert.equal((await runtime.app.inject(commit('1'.repeat(64)))).statusCode,403);}finally{await runtime.app.close();}
});
