import test from 'node:test';
import assert from 'node:assert/strict';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {ContinuityLab, replaceSyntheticCapture} from '../src/ContinuityLab.js';
import {evaluateContinuityScenario, type ContinuityLabInput} from '../shared/continuity-lab.js';

// CODEX-LAB-REVIEW-099: own fictional data, independent of the author's demo cases.
// Server rendering and pure transforms only; this does not exercise browser hooks/CSS/focus.
const minute=60_000,now=Date.UTC(2026,10,1,10);
function input(captureId='audit-current'):ContinuityLabInput {
  const scope=()=>({spaceId:'audit-space',sourceKey:'audit-source',captureId});
  return {scope:scope(),evaluatedAt:now,scenario:'device-loss',outageDurationMs:120*minute,
    objectives:{maxDataAgeMs:60*minute,maxRecoveryMs:10*minute,maxEvidenceAgeMs:60*minute},
    snapshot:{scope:scope(),capturedAt:now-45*minute,verifiedAt:now-44*minute},localRuntime:'available',recoveryKit:'available',
    backup:{scope:scope(),createdAt:now-43*minute,verifiedAt:now-42*minute},
    localDrill:{scope:scope(),startedAt:now-40*minute,completedAt:now-35*minute,outcome:'passed'},
    restoreDrill:{scope:scope(),startedAt:now-30*minute,completedAt:now-25*minute,outcome:'passed'},
    workload:{scope:scope(),tasks:[{id:'audit-overdue',status:'open',dueAt:now-1},{id:'audit-start',status:'open',dueAt:now},{id:'audit-end',status:'open',dueAt:now+120*minute},{id:'audit-after',status:'open',dueAt:now+120*minute+1},{id:'audit-null',status:'open',dueAt:null},{id:'audit-done',status:'done',dueAt:now}]}};
}
const render=(value:ContinuityLabInput|null)=>renderToStaticMarkup(createElement(ContinuityLab,{input:value,onInputChange(){}}));
test('099 independent ordinary capture has a measured ready result and exact task interval',()=>{
  const value=input(),before=structuredClone(value),r=evaluateContinuityScenario(value);assert.equal(r.status,'ready');assert.deepEqual(r.exposure,{overdueTasks:1,tasksDueDuringOutage:2,tasksWithoutDate:1,openTasks:5});assert.deepEqual(value,before);
  const html=render(value);assert.match(html,/data-status="ready"/);assert.match(html,/no ejecuta recuperación/);assert.match(html,/ambos límites incluidos/);
});
test('099 ordinary capture replacement preserves old evidence bytes and removes its applicability',()=>{
  const value=input(),before=structuredClone(value),next=replaceSyntheticCapture(value,40*minute);assert.deepEqual(value,before);assert.notEqual(next.scope.captureId,value.scope.captureId);assert.deepEqual(next.backup,value.backup);assert.deepEqual(next.localDrill,value.localDrill);assert.deepEqual(next.restoreDrill,value.restoreDrill);assert.deepEqual(next.workload,value.workload);assert.equal(evaluateContinuityScenario(next).status,'unproven');assert.equal(evaluateContinuityScenario(next).exposure,null);
});
test('099 all provenance dimensions independently prevent foreign evidence from making a device ready',()=>{
  for(const key of ['spaceId','sourceKey','captureId'] as const){const value=input();for(const record of [value.backup!,value.localDrill!,value.restoreDrill!,value.workload!])record.scope[key]='foreign-'+key;assert.equal(evaluateContinuityScenario(value).status,'unproven');assert.match(render(value),/Evidencia de otra captura, no cuenta/);}
});
test('099 missing measurements, zero measured recovery, and a genuinely empty inventory stay distinct',()=>{
  const empty=input();empty.workload=null;empty.restoreDrill=null;let html=render(empty);assert.match(html,/data-testid="exposure-missing"/);assert.match(html,/data-measure="recovery" data-state="missing"/);assert.doesNotMatch(html,/data-testid="open"/);
  const zero=input();zero.workload!.tasks=[];zero.restoreDrill!.completedAt=zero.restoreDrill!.startedAt;html=render(zero);assert.match(html,/data-testid="open">0</);assert.match(html,/data-measure="recovery" data-state="measured"/);assert.match(html,/>0 min</);
});
test('099 invalid task input keeps the simulation warning and has no result verdict',()=>{
  const value=input();value.workload!.tasks[1].id=value.workload!.tasks[0].id;const html=render(value);assert.match(html,/no ejecuta recuperación/);assert.match(html,/data-state="engine-error"/);assert.doesNotMatch(html,/data-state="result"/);
});
test('099 new capture must not collide with an already present foreign evidence generation',()=>{
  const value=input('audit-r2');for(const record of [value.backup!,value.localDrill!,value.restoreDrill!,value.workload!])record.scope.captureId='audit-r3';const before=structuredClone(value);assert.equal(evaluateContinuityScenario(value).status,'unproven');
  const next=replaceSyntheticCapture(value,45*minute);assert.deepEqual(value,before);assert.deepEqual(next.backup,value.backup);assert.deepEqual(next.restoreDrill,value.restoreDrill);assert.deepEqual(next.workload,value.workload);assert.notEqual(next.scope.captureId,'audit-r3','new identity must not resurrect foreign records');assert.equal(evaluateContinuityScenario(next).status,'unproven');
});
test('099 valid opaque IDs with a large numeric suffix must still produce a different capture identity',()=>{
  const value=input('audit-r9007199254740992');assert.equal(evaluateContinuityScenario(value).status,'ready');const next=replaceSyntheticCapture(value,45*minute);assert.notEqual(next.scope.captureId,value.scope.captureId,'Number rounding must not reuse the previous capture identity');assert.equal(evaluateContinuityScenario(next).status,'unproven');
});
