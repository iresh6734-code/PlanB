import test from 'node:test';
import assert from 'node:assert/strict';
import { TECHNICAL_DRILL_CHECKS, inspectDrillEvidence } from '../shared/drill-evidence.js';
import { assessDrill, summarizeCapture } from '../server/assessment.js';
import { drillReportHtml } from '../server/drill-report.js';
import { makeFixture } from '../shared/fixtures.js';
import type { DrillReport } from '../shared/operations.js';
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { makeDemoSpec } from '../shared/fixtures.js';
import { build } from 'esbuild';
import { createBaseApp } from '../server/app.js';

const now=Date.parse('2026-11-04T12:00:00Z');
const capture=()=>summarizeCapture('capture201',makeFixture());
const report=():DrillReport=>({id:'report201',captureId:'capture201',startedAt:new Date(now-1000).toISOString(),completedAt:new Date(now).toISOString(),durationMs:1000,passed:true,isolated:true,dataSource:'Ficción',limitations:[],environment:'test',checks:TECHNICAL_DRILL_CHECKS.map(label=>({label,passed:true,detail:'Ensayo técnico'}))});

test('201 accepts the five legacy worker identities independently of order; no input mutation',()=>{
  const value=report();value.checks.reverse();const before=JSON.stringify(value);
  assert.equal(inspectDrillEvidence(value,capture()).passed,true);
  assert.equal(assessDrill(capture(),[],[value],now).status,'passed');
  assert.match(drillReportHtml(value,capture()),/Simulacro superado/);
  assert.equal(JSON.stringify(value),before);
});

test('201 rejects duplicate, missing, extra or unrecognized check identities',()=>{
  const duplicate=report();duplicate.checks=duplicate.checks.map(()=>({...duplicate.checks[0]}));
  const missing=report();missing.checks.pop();const extra=report();extra.checks.push({...extra.checks[0]});
  const unknown=report();unknown.checks[2].label='Otro proceso no ejecutado';
  for(const value of [duplicate,missing,extra,unknown]){
    const result=inspectDrillEvidence(value,capture());assert.equal(result.passed,false);assert.match(result.issues.join(' '),/cinco comprobaciones distintas/);
    assert.equal(assessDrill(capture(),[],[value],now).status,'failed');
    assert.doesNotMatch(drillReportHtml(value,capture()),/Simulacro superado/);
  }
});

test('201 rejects malformed booleans, check arrays, dates and durations without throwing',()=>{
  const invalid:unknown[]=[null,[],{},'report'];
  for(const patch of [{passed:'true'},{isolated:1},{checks:null},{checks:[null]},{startedAt:'yesterday'},{completedAt:'2026-02-30T12:00:00Z'},{durationMs:-1},{durationMs:NaN},{durationMs:Infinity}])invalid.push({...report(),...patch});
  for(const value of invalid){assert.equal(inspectDrillEvidence(value).passed,false);assert.doesNotThrow(()=>assessDrill(capture(),[],[value],now));assert.doesNotMatch(drillReportHtml(value as DrillReport,capture()),/Simulacro superado/);}
  assert.equal(assessDrill(capture(),[],{reports:[report()]},now).status,'failed');
});

test('201 rejects a completion preceding its start in diagnosis and HTML',()=>{
  const value=report();value.startedAt=new Date(now+1).toISOString();
  assert.equal(assessDrill(capture(),[],[value],now).status,'failed');
  const html=drillReportHtml(value,capture());assert.doesNotMatch(html,/Simulacro superado/);assert.match(html,/finalización es anterior/);
});

test('201 a failed newest report does not fall back to an older success',()=>{
  const latest=report();latest.id='failed201';latest.checks[4].passed=false;latest.checks[4].detail='No persistió la tarea';
  const status=assessDrill(capture(),[],[latest,{...report(),id:'older201'}],now);
  assert.equal(status.status,'failed');assert.equal(status.reportId,'failed201');assert.deepEqual(status.issues,['No persistió la tarea']);
  const unreadable={...report(),checks:null};assert.equal(assessDrill(capture(),[],[unreadable,report()],now).status,'failed');
});

test('201 aggregate failure or lack of isolation cannot be upgraded by five passing checks',()=>{
  for(const value of [{...report(),passed:false},{...report(),isolated:false}]){
    assert.equal(inspectDrillEvidence(value).passed,false);assert.equal(assessDrill(capture(),[],[value],now).status,'failed');assert.doesNotMatch(drillReportHtml(value,capture()),/Simulacro superado/);
  }
});

test('201 capture and explicit environment are bound; legacy environment absence is not invented',()=>{
  const foreign={...capture(),id:'other201'};assert.equal(inspectDrillEvidence(report(),foreign).passed,false);
  assert.equal(assessDrill(foreign,[],[report()],now).status,'untested');
  const production={...capture(),environment:'production' as const};assert.equal(assessDrill(production,[],[report()],now).status,'failed');
  const html=drillReportHtml(report(),production);assert.doesNotMatch(html,/Simulacro superado/);assert.match(html,/entorno del informe no coincide/);
  const legacy=report();delete legacy.environment;assert.equal(inspectDrillEvidence(legacy,capture()).passed,true);
  assert.match(drillReportHtml(legacy,capture()),/Entorno no indicado/);
});

test('201 HTML never attributes a foreign capture name/counts to a historical result',()=>{
  const foreign={...capture(),id:'foreign201',name:'FOREIGN-CAPTURE-SENTINEL-201',counts:{contacts:99991,companies:99992,deals:99993,tasks:99994}};
  const html=drillReportHtml(report(),foreign);assert.doesNotMatch(html,/FOREIGN-CAPTURE-SENTINEL-201|99991|99992|99993|99994/);assert.match(html,/no corresponde a este informe/);
  // It is still the original historical report, not evidence for the foreign capture.
  assert.match(html,/Simulacro superado/);assert.match(html,/capture201/);
  const absent=drillReportHtml(report(),null);assert.match(absent,/ya no está en el historial/);assert.match(absent,/Simulacro superado/);
});

test('201 preserves expiry boundaries, future result and preparation issues',()=>{
  const value=report(),day=86400_000;
  assert.equal(assessDrill(capture(),[],[value],now+30*day).status,'passed');
  assert.equal(assessDrill(capture(),[],[value],now+30*day+1).status,'expired');
  assert.equal(assessDrill(capture(),[],[value],now-1).status,'expired');
  assert.equal(assessDrill(capture(),['Falta una oportunidad'],[value],now).status,'blocked');
  assert.equal(assessDrill(null,[],[value],now).status,'empty');
});

test('201 HTML escapes text and never reflects unknown metadata or invalid raw data',()=>{
  const value={...report(),dataSource:'<img src=x onerror=alert(1)>',privateToken:'DO-NOT-REFLECT-201'};
  value.checks[2].passed=false;value.checks[2].detail='<script>bad()</script>';
  const html=drillReportHtml(value,capture());assert.doesNotMatch(html,/<script>|<img|DO-NOT-REFLECT-201/);assert.match(html,/&lt;script&gt;/);assert.match(html,/&lt;img/);
  assert.doesNotMatch(drillReportHtml({...value,checks:null} as unknown as DrillReport,capture()),/onerror|DO-NOT-REFLECT-201|bad\(\)/);
});

test('201 normal continuity and report routes reject a repeated check without changing the stored report',async()=>{
  const root=fileURLToPath(new URL('../',import.meta.url));
  const {app,store}=await createBaseApp({dbPath:':memory:',root,staticDir:join(root,'tests','.tmp','no-drill201-assets')});
  try{
    store.importSnapshot(makeFixture());
    const captureId=store.captures()[0].id, completedAt=new Date().toISOString();
    const good={...report(),id:'older201',captureId,startedAt:completedAt,completedAt,durationMs:0};
    const duplicate={...good,id:'invalid201',checks:good.checks.map(()=>({...good.checks[0]}))};
    store.set('drills',[duplicate,good]);
    const get=(url:string)=>app.inject({method:'GET',url,headers:{host:'localhost'}});
    const status=await get('/api/v2/continuity');assert.equal(status.statusCode,200);
    assert.equal(status.json().readiness.status,'failed');assert.equal(status.json().readiness.reportId,'invalid201');
    assert.match(status.json().readiness.issues.join(' '),/cinco comprobaciones distintas/);
    const html=await get('/api/v2/drills/invalid201/report?format=html');assert.equal(html.statusCode,200);
    assert.match(String(html.headers['content-disposition']),/attachment/);
    assert.match(html.body,/Hay procesos por revisar/);assert.doesNotMatch(html.body,/Simulacro superado/);
    const historical=await get('/api/v2/drills/older201/report?format=html');assert.equal(historical.statusCode,200);assert.match(historical.body,/Simulacro superado/);
    assert.deepEqual(store.get('drills',[]),[duplicate,good]);assert.equal(store.changesCount,0);
  }finally{await app.close();}
});

test('201 compiled worker emits the accepted identities and a valid report from a new fictional disk copy',async()=>{
  const root=fileURLToPath(new URL('../',import.meta.url));mkdirSync(join(root,'tests','.tmp'),{recursive:true});
  const folder=mkdtempSync(join(root,'tests','.tmp','d201-worker-')),scratch=join(folder,'scratch');mkdirSync(scratch);
  const preload=join(folder,'fixture-key.cjs'),worker=join(folder,'drill.mjs');
  // Precreate a NEW test key before Store opens its newly-created drill directory.
  // No existing key, crypto function, environment profile or DPAPI is accessed.
  writeFileSync(preload,`const fs=require('node:fs'),p=require('node:path'),c=require('node:crypto'),original=fs.mkdtempSync,base=${JSON.stringify(scratch)};fs.mkdtempSync=function(...args){const folder=original.apply(this,args);if(p.dirname(p.resolve(folder))===base&&p.basename(folder).startsWith('drill-'))fs.writeFileSync(p.join(folder,'.planb-key'),JSON.stringify({kind:'test',data:c.randomBytes(32).toString('base64')}),{flag:'wx'});return folder;};require('node:module').syncBuiltinESMExports();`);
  await build({entryPoints:[join(root,'server','drill-worker.ts')],bundle:true,platform:'node',format:'esm',packages:'external',outfile:worker,metafile:true}).then(result=>writeFileSync(join(folder,'metafile.json'),JSON.stringify(result.metafile,null,2)));
  const snapshot=makeFixture(),bundle={format:'planb-continuity-v1',exportedAt:new Date().toISOString(),snapshot,spec:makeDemoSpec(snapshot),generation:{provider:'demo',model:null,generatedAt:new Date().toISOString(),prompt:'',approved:true},records:snapshot.records,changes:[]};
  const env={...Object.fromEntries(Object.entries(process.env).filter(([key])=>['path','systemroot','windir','comspec','pathext','temp','tmp','tmpdir','lang','tz'].includes(key.toLowerCase()))),NODE_ENV:'test'};
  const child=spawnSync(process.execPath,['--require',join(root,'scripts','block-external.cjs'),'--require',preload,worker],{cwd:root,env,input:JSON.stringify({bundle,captureId:'capture201',scratch}),encoding:'utf8',timeout:30_000,windowsHide:true,maxBuffer:1_000_000});
  writeFileSync(join(folder,'worker-stderr.log'),child.stderr??'');assert.equal(child.error,undefined);assert.equal(child.status,0,child.stderr);
  const actual=JSON.parse(child.stdout) as DrillReport;writeFileSync(join(folder,'worker-report.json'),JSON.stringify(actual,null,2));
  assert.deepEqual(actual.checks.map(check=>check.label),[...TECHNICAL_DRILL_CHECKS]);assert.equal(actual.passed,true);assert.equal(actual.isolated,true);
  assert.equal(inspectDrillEvidence(actual,capture()).passed,true);assert.equal(assessDrill(capture(),[],[actual]).status,'passed');assert.match(drillReportHtml(actual,capture()),/Simulacro superado/);
  assert.deepEqual(readdirSync(scratch),[],'the worker cleaned only its own drill directory');
  let absent=false;try{process.kill(child.pid,0);}catch(error){absent=(error as NodeJS.ErrnoException).code==='ESRCH';}assert.equal(absent,true,'own worker PID no longer exists');
  assert.match(readFileSync(preload,'utf8'),/kind:'test'/);assert.equal(resolve(folder).startsWith(resolve(root,'tests','.tmp')+ (process.platform==='win32'?'\\':'/')),true);
});
