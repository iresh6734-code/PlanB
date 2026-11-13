import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {createBaseApp} from '../server/app.js';
import {makeFixture,makeDemoSpec} from '../shared/fixtures.js';
import type {CrmSnapshot} from '../shared/model.js';
import {DEFAULT_CONTINUITY_EVIDENCE_QUERY as defaults,type ContinuityEvidenceApiResponse} from '../shared/continuity-evidence-api.js';
const {registerContinuityEvidenceApi:register}=await import(pathToFileURL(process.env.EVIDENCE_API103_MODULE??path.resolve('server/continuity-evidence-api.ts')).href) as typeof import('../server/continuity-evidence-api.js');
const now=Date.UTC(2026,10,1,15),url='/api/v7/continuity/evidence',headers={host:'127.0.0.1:4513',origin:'http://127.0.0.1:4513'};
async function fixture(options:{empty?:boolean;runtime?:boolean;edit?:(s:CrmSnapshot)=>void;clock?:()=>number}={}){
  const parent=path.resolve('tests/.tmp/evidence103-fixtures');fs.mkdirSync(parent,{recursive:true});const root=fs.mkdtempSync(path.join(parent,'case-'));
  const {app,store}=await createBaseApp({root,dbPath:':memory:',staticDir:path.join(root,'no-assets'),runtime:options.runtime});
  if(!options.empty){const snapshot=makeFixture();snapshot.capturedAt=new Date(now-45*60_000).toISOString();options.edit?.(snapshot);store.importSnapshot(snapshot);store.saveGeneration(makeDemoSpec(snapshot),{provider:'demo',model:null,generatedAt:new Date(now).toISOString(),prompt:'',approved:false});store.activate();
    // Mirror server/runtime.ts's seed restore. A normal import above intentionally enables local services.
    if(options.runtime)store.restoreBundle(store.bundle());
  }
  let reads=0;register(app,store,()=>{reads++;return options.clock?.()??now;});await app.ready();
  return {app,store,root,reads:()=>reads,close:()=>app.close(),get:(query='',extra:Record<string,string|undefined>={})=>app.inject({url:url+query,headers:{...headers,...extra}})};
}
type Fixture=Awaited<ReturnType<typeof fixture>>;
function digest(f:Fixture){return Object.fromEntries(['meta','records','changes','captures','archives','usage'].map(t=>[t,createHash('sha256').update(JSON.stringify(f.store.db.prepare('SELECT * FROM '+t+' ORDER BY rowid').all())).digest('hex')]));}
function body(r:{json:<T>()=>T}){return r.json<ContinuityEvidenceApiResponse>();}
function good(r:{statusCode:number;json:<T>()=>T}){assert.equal(r.statusCode,200,JSON.stringify(r.json()));const b=body(r);assert.equal(b.available,true);if(!b.available)throw Error('Unavailable');return b;}
function noCache(r:{headers:Record<string,unknown>}){assert.equal(r.headers['cache-control'],'no-store');assert.equal(r.headers.pragma,'no-cache');assert.ok(String(r.headers.vary).split(',').some(x=>x.trim().toLowerCase()==='cookie'));}

test('103 discards evidence when the original session expires during calculation without renewing it',async t=>{
  let sessionTime=now,expireDuringReview=false;
  t.mock.method(Date,'now',()=>sessionTime);
  const f=await fixture({clock:()=>{
    if(expireDuringReview&&f.reads()===2)sessionTime=now+30*60_000+1;
    return sessionTime;
  }});
  try{
    const setup=await f.app.inject({method:'POST',url:'/api/v2/auth/setup',headers,payload:{password:'contraseña de prueba 103 R2'}});
    assert.equal(setup.statusCode,200);
    assert.equal(typeof setup.headers['set-cookie'],'string');
    const cookie=String(setup.headers['set-cookie']).split(';')[0];
    const before=digest(f);
    assert.equal((await f.get()).statusCode,401);
    assert.equal(f.reads(),0);
    sessionTime=now+30*60_000-1;
    expireDuringReview=true;
    const expired=await f.get('',{cookie});
    assert.equal(f.reads(),2);
    assert.equal((await f.get('',{cookie})).statusCode,401);
    assert.equal(expired.statusCode,401);
    assert.equal(expired.headers['set-cookie'],undefined);
    noCache(expired);
    assert.deepEqual(Object.keys(expired.json()),['error']);
    assert.deepEqual(digest(f),before);
  }finally{await f.close();}
});

test('103 rechecks the original session after the final identity read, before publishing facts or conflicts',async t=>{
  const boundary=now+30*60_000,foreign=randomUUID();
  let wall=now;
  t.mock.method(Date,'now',()=>wall);
  for(const drift of [false,true]){
    wall=now;
    const f=await fixture({clock:()=>wall});
    try{
      const setup=await f.app.inject({method:'POST',url:'/api/v2/auth/setup',headers,payload:{password:'contraseña ficticia de frontera 103'}});
      assert.equal(setup.statusCode,200);
      const cookie=String(setup.headers['set-cookie']).split(';')[0];
      const read=f.store.get.bind(f.store);
      let identityReads=0,expireOnLastRead=false;
      t.mock.method(f.store,'get',<T>(key:string,fallback:T):T=>{
        const value=read(key,fallback);
        if(key==='instanceId'&&++identityReads===2&&expireOnLastRead){
          wall=boundary+1;
          if(drift)return foreign as T;
        }
        return value;
      });
      wall=boundary-1;
      const before=digest(f);
      const valid=await f.get('',{cookie});
      good(valid);
      assert.equal(valid.headers['set-cookie'],undefined);
      assert.equal(identityReads,2);
      identityReads=0;
      expireOnLastRead=true;
      const expired=await f.get('',{cookie});
      assert.equal(identityReads,2);
      assert.equal((await f.get('',{cookie})).statusCode,401);
      assert.equal(expired.statusCode,401);
      assert.deepEqual(Object.keys(expired.json()),['error']);
      assert.equal(expired.headers['set-cookie'],undefined);
      noCache(expired);
      assert.deepEqual(digest(f),before);
    }finally{await f.close();}
  }
});

test('103 GET projects defaults, provenance and complete facts without internal task rows or writes',async()=>{const f=await fixture();try{const before=digest(f),r=await f.get(),b=good(r);assert.deepEqual(b.parameters,defaults);assert.equal(b.context.spaceId,'local:'+f.store.get('instanceId',''));assert.equal(b.context.view,'active-local-records');assert.equal(b.facts.workload.total,18);assert.equal(b.facts.workload.expressible,false);assert.equal(b.evaluation.exposure,null);assert.equal(b.evaluation.status,'unproven');assert.ok(!('input'in b));assert.ok(!('tasks'in b));assert.ok(!JSON.stringify(b).includes('Lucía'));noCache(r);assert.deepEqual(digest(f),before);assert.equal(f.reads(),2);assert.equal(fs.readdirSync(f.root).length,0);}finally{await f.close();}});
test('103 explicit minute boundaries and scenario are preserved rather than silently clamped',async()=>{const f=await fixture();try{const r=await f.get('?scenario=device-loss&outageMinutes=43200&maxDataAgeMinutes=43200&maxRecoveryMinutes=1&maxEvidenceAgeMinutes=129600'),b=good(r);assert.equal(b.parameters.outageMinutes,43200);assert.equal(b.parameters.maxEvidenceAgeMinutes,129600);assert.equal(b.parameters.maxRecoveryMinutes,1);assert.equal(b.evaluation.scenario,'device-loss');assert.equal(b.evaluation.measuredRecoveryMs,null);assert.equal(b.facts.export.otherDevice,'not-demonstrated');}finally{await f.close();}});
test('103 malformed, duplicate or unknown query values are rejected before reading evidence and are not echoed',async()=>{const f=await fixture();try{const before=digest(f);for(const query of ['?spaceId=DO_NOT_ECHO103','?database=DO_NOT_OPEN103','?scenario=other','?outageMinutes=0','?outageMinutes=43201','?outageMinutes=01','?outageMinutes=1e2','?outageMinutes=1.5','?outageMinutes=%201','?outageMinutes=','?outageMinutes=1&outageMinutes=2','?maxDataAgeMinutes=-1','?maxRecoveryMinutes=NaN','?maxEvidenceAgeMinutes=129601','?revision=','?revision=DO_NOT_ECHO103']){const r=await f.get(query);assert.equal(r.statusCode,422,query);assert.equal(body(r).issue,'INVALID_OPTIONS');assert.equal(body(r).facts,null);assert.ok(!r.body.includes('DO_NOT'));noCache(r);}assert.equal(f.reads(),0);assert.deepEqual(digest(f),before);}finally{await f.close();}});
test('103 GET body is rejected, and non-GET methods including implicit HEAD do not calculate evidence',async()=>{const f=await fixture();try{const r=await f.app.inject({url,method:'GET',headers:{...headers,'content-type':'application/json'},payload:JSON.stringify({spaceId:'SECRET103'})});assert.equal(r.statusCode,422);assert.equal(body(r).issue,'INVALID_OPTIONS');for(const method of ['HEAD','POST','PUT','PATCH','DELETE','OPTIONS'] as const){const r=await f.app.inject({url,method,headers});assert.equal(r.statusCode,404,method);assert.ok(!r.body.includes('planb-continuity-evidence-api-v1'));}assert.equal(f.reads(),0);}finally{await f.close();}});
test('103 password/session hooks reject unauthenticated reads before evaluation and keep 401 uncacheable',async()=>{const f=await fixture();try{const setup=await f.app.inject({url:'/api/v2/auth/setup',method:'POST',headers,payload:{password:'Fictional password 103 only'}});assert.equal(setup.statusCode,200);const cookie=String(setup.headers['set-cookie']).split(';')[0],before=digest(f);for(const extra of [{},{cookie:'planb_session='+'0'.repeat(64)}]){const r=await f.get('',extra);assert.equal(r.statusCode,401);assert.ok(!('facts'in r.json()));noCache(r);}assert.equal(f.reads(),0);const r=await f.get('',{cookie});good(r);assert.equal(r.headers['set-cookie'],undefined,'read-only request must not extend inactivity by issuing a cookie');await f.app.inject({url:'/api/v2/auth/lock',method:'POST',headers:{...headers,cookie}});const blocked=await f.get('',{cookie});assert.equal(blocked.statusCode,401);noCache(blocked);assert.deepEqual(digest(f),before);}finally{await f.close();}});
test('103 evidence GET does not keep the local password session alive through background reads',async()=>{const f=await fixture(),original=Date.now;try{const setup=await f.app.inject({url:'/api/v2/auth/setup',method:'POST',headers,payload:{password:'Fictional password 103 expiry'}}),cookie=String(setup.headers['set-cookie']).split(';')[0],at=original();Date.now=()=>at+29*60_000;good(await f.get('',{cookie}));Date.now=()=>at+31*60_000;const r=await f.get('',{cookie});assert.equal(r.statusCode,401);noCache(r);}finally{Date.now=original;await f.close();}});
test('103 host/origin protections reject external or insecure requests without evaluating a source',async()=>{const f=await fixture();try{const before=digest(f);for(const extra of [{host:'outside.invalid:4513',origin:'http://outside.invalid:4513'},{origin:'http://outside.invalid'},{origin:'https://127.0.0.1:4513'},{origin:'null'}]){const r=await f.get('',extra);assert.equal(r.statusCode,403);assert.ok(!('facts'in r.json()));noCache(r);}assert.equal(f.reads(),0);assert.deepEqual(digest(f),before);}finally{await f.close();}});
test('103 coherent pinned reads work; changes to records, selected metadata or server namespace invalidate old pins',async()=>{for(const mode of ['records','metadata','instance']){const f=await fixture();try{const first=good(await f.get());good(await f.get('?revision='+first.context.revision));if(mode==='records')f.store.saveRecord('contacts',{phone:'new-fictitious103'},'contact-1');if(mode==='metadata')f.store.set('drills',[{new:true}]);if(mode==='instance')f.store.set('instanceId',randomUUID());const before=digest(f),r=await f.get('?revision='+first.context.revision);assert.equal(r.statusCode,409,mode);const b=body(r);assert.equal(b.issue,'SOURCE_CHANGED');assert.equal(b.evaluation,null);assert.equal(b.context,null);noCache(r);assert.deepEqual(digest(f),before);const next=good(await f.get());assert.notEqual(next.context.revision,first.context.revision);}finally{await f.close();}}});
test('103 identity changed during a service read discards the result even if the bundle stayed unchanged',async()=>{let current:Fixture|undefined,calls=0;const f=await fixture({clock:()=>{if(++calls===2)current!.store.set('instanceId',randomUUID());return now;}});current=f;try{const r=await f.get();assert.equal(calls,2);assert.equal(r.statusCode,409);assert.equal(body(r).issue,'SOURCE_CHANGED');assert.equal(body(r).facts,null);assert.equal(body(r).context,null);noCache(r);}finally{await f.close();}});
test('103 missing, malformed or unreadable instance identity never accepts client-selected authority or invents an ID',async()=>{for(const mode of ['missing','malformed','unreadable']){const f=await fixture();try{if(mode==='missing')f.store.db.prepare('DELETE FROM meta WHERE key=?').run('instanceId');if(mode==='malformed')f.store.set('instanceId','DO_NOT_REFLECT103');if(mode==='unreadable')f.store.db.prepare('UPDATE meta SET value=? WHERE key=?').run('DO_NOT_REFLECT103','instanceId');const before=digest(f),r=await f.get();assert.equal(r.statusCode,503);assert.equal(body(r).issue,'SOURCE_UNREADABLE');assert.ok(!r.body.includes('DO_NOT_REFLECT103'));assert.equal(f.reads(),0);assert.deepEqual(digest(f),before);noCache(r);}finally{await f.close();}}});
test('103 no active copy, damaged return state and mismatching archive are explicit conflicts with no derived facts',async()=>{for(const mode of ['empty','plan','archive']){const f=await fixture({empty:mode==='empty'});try{if(mode==='plan')f.store.set('recoveryPlan',{id:'bad103',privateMarker:'DO_NOT_REFLECT103'});if(mode==='archive'){const s=f.store.snapshot!;s.name+=' changed';f.store.db.prepare('UPDATE captures SET payload=? WHERE id=?').run(f.store.encode(s),s.id+':'+s.capturedAt);}const before=digest(f),r=await f.get();assert.equal(r.statusCode,409,mode);const b=body(r);assert.equal(b.issue,mode==='empty'?'NO_ACTIVE_COPY':mode==='plan'?'RECOVERY_STATE_INVALID':'ARCHIVE_MISMATCH');assert.equal(b.facts,null);assert.equal(b.evaluation,null);assert.ok(!r.body.includes('DO_NOT_REFLECT103'));assert.deepEqual(digest(f),before);noCache(r);}finally{await f.close();}}});
test('103 exact 10000-row results stay complete while the HTTP response omits internal row identifiers',async()=>{const f=await fixture({edit:s=>{const template=s.records.find(r=>r.entity==='tasks')!;s.entities.find(e=>e.id==='tasks')!.fields.find(f=>f.key==='due_date')!.type='datetime';s.records=Array.from({length:10000},(_,i)=>({entity:'tasks' as const,id:'PRIVATE_ROW103_'+i,values:{...template.values,contact_id:null,deal_id:null,status:'pending',due_date:new Date(now+(i-5000)*60_000).toISOString()}}));s.links=[];s.manifest={complete:true,expectedCounts:{contacts:0,companies:0,deals:0,tasks:10000},expectedLinks:0};}});try{const before=digest(f),r=await f.get('?outageMinutes=120'),b=good(r);assert.equal(b.facts.workload.total,10000);assert.deepEqual(b.evaluation.exposure,{overdueTasks:5000,tasksDueDuringOutage:121,tasksWithoutDate:0,openTasks:10000});assert.ok(r.body.length<10000);assert.ok(!r.body.includes('PRIVATE_ROW103_'));assert.ok(!r.body.includes('task:'));assert.deepEqual(digest(f),before);}finally{await f.close();}});
test('103 runtime base app keeps the same read-only protections and never adds provider effects',async()=>{const f=await fixture({runtime:true});try{const before=digest(f),r=await f.get('?scenario=device-loss'),b=good(r);assert.equal(b.evaluation.status,'unproven');assert.equal(b.facts.technicalReports.recoveryTime,'not-measured');assert.equal(b.facts.export.artifactBytes,'not-examined');assert.equal(f.store.disconnected,true);assert.deepEqual(digest(f),before);assert.equal(fs.readdirSync(f.root).length,0);}finally{await f.close();}});
test('103 source mutations during calculation and new recovery damage remain conflicts at the HTTP boundary',async()=>{for(const mode of ['records','plan']){let current:Fixture|undefined,calls=0;const f=await fixture({clock:()=>{if(++calls===2){if(mode==='records')current!.store.saveRecord('contacts',{phone:'race103'},'contact-1');else current!.store.set('recoveryPlan',{privateMarker:'DO_NOT_REFLECT_RACE103'});}return now;}});current=f;try{const r=await f.get();assert.equal(r.statusCode,409);assert.equal(body(r).issue,mode==='records'?'SOURCE_CHANGED':'RECOVERY_STATE_INVALID');assert.equal(body(r).evaluation,null);assert.equal(body(r).facts,null);assert.ok(!r.body.includes('DO_NOT_REFLECT_RACE103'));noCache(r);}finally{await f.close();}}});
test('103 unavailable archive, invalid replay, future capture and excessive metadata have honest HTTP statuses',async()=>{for(const mode of ['missing','replay','future','large']){const f=await fixture();try{if(mode==='missing')f.store.db.prepare('DELETE FROM captures').run();if(mode==='replay'){const record=f.store.record('contacts','contact-1')!;record.values.phone='without-log103';f.store.db.prepare('UPDATE records SET value=? WHERE entity=? AND id=?').run(f.store.encode(record),'contacts','contact-1');}if(mode==='future'){const snapshot=f.store.snapshot!;snapshot.capturedAt=new Date(now+60_000).toISOString();f.store.set('snapshot',snapshot);f.store.addCapture(snapshot);}if(mode==='large')f.store.set('drills',['x'.repeat(1024*1024)]);const before=digest(f),r=await f.get();assert.equal(r.statusCode,mode==='missing'?503:409);assert.equal(body(r).issue,({missing:'SOURCE_UNREADABLE',replay:'INVALID_LOCAL_COPY',future:'FUTURE_CAPTURE',large:'EVIDENCE_LIMIT'})[mode]);assert.equal(body(r).context,null);assert.equal(body(r).parameters,null);noCache(r);assert.deepEqual(digest(f),before);}finally{await f.close();}}});
