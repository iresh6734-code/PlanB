import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { once } from 'node:events';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { Store } from '../server/store.js';
import { makeDemoSpec, makeFixture } from '../shared/fixtures.js';
import { TECHNICAL_DRILL_CHECKS } from '../shared/drill-evidence.js';
import type { ContinuityEvidenceApiResponse } from '../shared/continuity-evidence-api.js';

process.env.NODE_ENV='test';
const repo=process.cwd();
const route='/api/v7/continuity/evidence';
const marker='private-fiction-evidence239';
const password='fixture-password-evidence239';
const envNames=new Set(['path','systemroot','windir','comspec','pathext','temp','tmp','tmpdir','lang','tz']);
const pause=(ms:number)=>new Promise<void>(resolve=>setTimeout(resolve,ms));
async function freePort(){
  const server=createServer();server.listen(0,'127.0.0.1');await once(server,'listening');
  const address=server.address();assert.ok(address&&typeof address!=='string');
  await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
  return address.port;
}
function hashTables(filename:string){
  const sqlite=new DatabaseSync(filename,{readOnly:true});
  try{
    const tables=['meta','records','changes','captures','archives','usage'];
    return createHash('sha256').update(JSON.stringify(tables.map(table=>sqlite.prepare('SELECT * FROM '+table+' ORDER BY rowid').all()))).digest('hex');
  }finally{sqlite.close();}
}
async function stop(child:ChildProcess, terminal:Promise<unknown>){
  if(child.exitCode===null&&child.signalCode===null)child.kill('SIGTERM');
  let timer:ReturnType<typeof setTimeout>|undefined;
  try{await Promise.race([terminal,new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new Error('No terminó el servidor propio de evidencia')),7500);})]);}
  finally{clearTimeout(timer);}
}
async function start(kind:'main'|'runtime'){
  const parent=path.join(repo,'tests','.tmp');mkdirSync(parent,{recursive:true});
  const root=mkdtempSync(path.join(parent,'evidence-mount-239-'));
  const data=path.join(root,'data'),dbPath=path.join(data,'planb.sqlite');mkdirSync(data);
  writeFileSync(path.join(data,'.planb-key'),JSON.stringify({kind:'test',data:randomBytes(32).toString('base64')}),{flag:'wx'});
  const store=new Store(dbPath);
  const snapshot=makeFixture('agency');snapshot.records.find(record=>record.entity==='tasks'&&record.id==='task-2')!.values.subject=marker;
  try{
    assert.equal(store.importSnapshot(snapshot).complete,true);
    store.saveGeneration(makeDemoSpec(snapshot),{provider:'demo',model:null,prompt:'',generatedAt:new Date().toISOString(),approved:false});store.activate();
    const captureId=snapshot.id+':'+snapshot.capturedAt, at=new Date().toISOString();
    const checks=TECHNICAL_DRILL_CHECKS.map(label=>({label,passed:true,detail:'Fiction'}));
    const report={captureId,startedAt:at,completedAt:at,durationMs:0,passed:true,isolated:true,environment:'test'};
    store.set('drills',[{...report,id:'canonical',checks},{...report,id:'duplicate',checks:checks.map(()=>checks[0])}]);
  }finally{store.close();}
  const port=await freePort(),base='http://127.0.0.1:'+port;
  const configured=kind==='main'?process.env.PLANB_EVIDENCE239_MAIN:process.env.PLANB_EVIDENCE239_RUNTIME;
  const argv=configured?[path.resolve(configured)]:['--import','tsx',path.join(repo,'server',kind+'.ts')];
  const env={...Object.fromEntries(Object.entries(process.env).filter(([key])=>envNames.has(key.toLowerCase()))),NODE_ENV:'test',PLANB_PORT:String(port),PLANB_DATA_DIR:data};
  const child=spawn(process.execPath,['--require',path.join(repo,'scripts','block-external.cjs'),...argv],{cwd:root,env,windowsHide:true,stdio:['ignore','pipe','pipe']});
  const closed=once(child,'close');let log='';
  child.stdout.on('data',bytes=>{log+=String(bytes);});child.stderr.on('data',bytes=>{log+=String(bytes);});
  const close=async()=>{try{await stop(child,closed);}finally{writeFileSync(path.join(root,'process.log'),log);writeFileSync(path.join(root,'process-result.json'),JSON.stringify({kind,pid:child.pid,terminal:child.exitCode!==null||child.signalCode!==null,code:child.exitCode,signal:child.signalCode}));}};
  try{
    let healthy=false;
    for(let i=0;i<75;i++){
      if(child.exitCode!==null||child.signalCode!==null)break;
      try{const response=await fetch(base+'/api/health',{signal:AbortSignal.timeout(300)});healthy=response.ok&&!!(await response.json()).instanceId;}catch{}
      if(healthy)break;await pause(100);
    }
    assert.ok(healthy,'El servidor propio no respondió. Consulta '+root);
    const request=(url:string,init:RequestInit={})=>fetch(base+url,{...init,signal:AbortSignal.timeout(7000)});
    return{base,request,dbPath,close};
  }catch(error){await close();throw error;}
}
function cacheHeaders(reply:Response){
  assert.equal(reply.headers.get('cache-control'),'no-store');
  assert.equal(reply.headers.get('pragma'),'no-cache');
  assert.match(reply.headers.get('vary')??'',/\bCookie\b/i);
}
async function available(reply:Response){
  assert.equal(reply.status,200);
  cacheHeaders(reply);
  const body=await reply.text();assert.doesNotMatch(body,new RegExp(marker));
  const value=JSON.parse(body) as ContinuityEvidenceApiResponse;
  assert.equal(value.available,true);
  assert.ok(value.available);
  assert.equal(value.format,'planb-continuity-evidence-api-v1');
  assert.ok(!('input' in value));
  return value;
}

test('the main entry point registers protected local evidence and rejects an obsolete revision',async()=>{
  const app=await start('main');
  try{
    const health=await (await app.request('/api/health')).json();
    const first=await available(await app.request(route));
    assert.equal(first.context.spaceId,'local:'+health.instanceId);
    assert.equal(first.facts.workload.total,18);
    assert.equal(first.facts.technicalReports.stored,2);
    assert.equal(first.facts.technicalReports.matchingCaptureId,2);
    assert.equal(first.facts.technicalReports.declaredPassed,1);
    assert.equal(first.evaluation.measuredRecoveryMs,null);
    const setup=await app.request('/api/v2/auth/setup',{method:'POST',headers:{'Content-Type':'application/json',Origin:app.base},body:JSON.stringify({password})});
    assert.equal(setup.status,200);
    const cookie=setup.headers.get('set-cookie')?.split(';')[0];assert.ok(cookie);
    const blocked=await app.request(route);assert.equal(blocked.status,401);cacheHeaders(blocked);assert.ok(!('facts' in await blocked.json()));
    const foreign=await app.request(route,{headers:{Cookie:cookie,Origin:'https://unrelated.invalid'}});assert.equal(foreign.status,403);
    const before=hashTables(app.dbPath);
    const evidence=await app.request(route+'?revision='+first.context.revision,{headers:{Cookie:cookie}});
    assert.equal(evidence.headers.get('set-cookie'),null);
    assert.equal((await available(evidence)).context.revision,first.context.revision);
    assert.equal((await app.request(route,{method:'HEAD',headers:{Cookie:cookie}})).status,404);
    assert.equal(hashTables(app.dbPath),before,'GET and HEAD must not write');
    const patch=await app.request('/api/records/tasks/task-2',{method:'PATCH',headers:{Cookie:cookie,Origin:app.base,'Content-Type':'application/json'},body:JSON.stringify({values:{status:'completed'}})});
    assert.equal(patch.status,200);
    const afterWrite=hashTables(app.dbPath);
    const old=await app.request(route+'?revision='+first.context.revision,{headers:{Cookie:cookie}});
    assert.equal(old.status,409);cacheHeaders(old);
    const stale=await old.json() as ContinuityEvidenceApiResponse;
    assert.equal(stale.available,false);assert.equal(stale.issue,'SOURCE_CHANGED');assert.equal(stale.facts,null);
    const current=await available(await app.request(route,{headers:{Cookie:cookie}}));
    assert.equal(current.context.captureId,first.context.captureId);assert.notEqual(current.context.revision,first.context.revision);
    assert.equal(current.facts.workload.completed,first.facts.workload.completed+1);
    assert.equal(hashTables(app.dbPath),afterWrite);
  }finally{await app.close();}
});

test('the portable entry point does not register the main-only evidence route',async()=>{
  const app=await start('runtime');
  try{
    const state=await (await app.request('/api/v2/state')).json();
    assert.equal(state.ready,true);assert.equal(state.runtime,true);
    const response=await app.request(route);assert.equal(response.status,404);
    assert.ok(!('facts' in await response.json()));
  }finally{await app.close();}
});
