import test from 'node:test';
import assert from 'node:assert/strict';
import { makeFixture, makeDemoSpec } from '../shared/fixtures.js';
import { planDrill } from '../server/drill-plan.js';
import { assessDrill, summarizeCapture } from '../server/assessment.js';
import { Store } from '../server/store.js';
import { Continuity } from '../server/continuity.js';
import type { DrillReport } from '../shared/operations.js';
import { drillReportHtml } from '../server/drill-report.js';
import { TECHNICAL_DRILL_CHECKS } from '../shared/drill-evidence.js';

const now=Date.parse('2026-10-24T16:00:00Z');
function report(captureId:string,id='report',at=now):DrillReport{
  return {id,captureId,startedAt:new Date(at-1000).toISOString(),completedAt:new Date(at).toISOString(),passed:true,isolated:true,
    durationMs:1000,dataSource:'Conjunto ficticio',limitations:[],checks:TECHNICAL_DRILL_CHECKS.map(label=>({label,passed:true,detail:'Verificado'}))};
}
test('el diagnóstico nunca reutiliza el éxito de otra captura y exige renovarlo a los 30 días',()=>{
  const snapshot=makeFixture(),summary=summarizeCapture('current',snapshot);
  assert.equal(assessDrill(summary,[],[report('previous')],now).status,'untested');
  assert.equal(assessDrill(summary,[],[report('current')],now).status,'passed');
  assert.equal(assessDrill(summary,[],[report('current','old',now-31*86400_000)],now).status,'expired');
  assert.equal(assessDrill(summary,[],[report('current','future',now+1000)],now).status,'expired');
  assert.equal(assessDrill(summary,['Falta una oportunidad'],[report('current')],now).status,'blocked');
});
test('el último resultado fallido de la misma captura invalida un éxito anterior',()=>{
  const summary=summarizeCapture('current',makeFixture()),failed=report('current','failed');failed.passed=false;failed.checks[3]={...failed.checks[3],passed:false,detail:'No se conservó la etapa.'};
  const result=assessDrill(summary,[],[failed,report('current','old')],now);
  assert.equal(result.status,'failed');assert.equal(result.reportId,'failed');assert.deepEqual(result.issues,['No se conservó la etapa.']);
  const forged=report('current');forged.checks[4].passed=false;
  assert.equal(assessDrill(summary,[],[forged],now).status,'failed');
});
test('el simulacro cambia valores, avanza a una etapa posterior válida y crea una tarea pendiente antes de completarla',()=>{
  const snapshot=makeFixture();snapshot.records.find(r=>r.entity==='contacts')!.values.phone='600 123 456';
  const before=JSON.stringify(snapshot),spec=makeDemoSpec(snapshot),plan=planDrill(spec,snapshot.records,now);
  assert.deepEqual(plan.issues,[]);assert.ok(plan.contact&&plan.deal&&plan.task);
  assert.notEqual(plan.contact.value,'600 123 456');
  const deal=snapshot.records.find(r=>r.id===plan.deal!.id&&r.entity==='deals')!;
  assert.ok(spec.stages.findIndex(s=>s.id===plan.deal!.value)>spec.stages.findIndex(s=>s.id===deal.values.dealstage));
  assert.notEqual(plan.task.values[plan.task.statusField],plan.task.done);assert.equal(JSON.stringify(snapshot),before);
});
test('una captura sin oportunidades conserva sus datos y explica qué falta para el simulacro',()=>{
  const snapshot=makeFixture();snapshot.records=snapshot.records.filter(r=>r.entity!=='deals');
  const plan=planDrill(makeDemoSpec(snapshot),snapshot.records,now);
  assert.equal(plan.deal,null);assert.ok(plan.issues.some(issue=>issue.includes('Añade una oportunidad')));
  const spec=makeDemoSpec(makeFixture());spec.entities.find(e=>e.id==='tasks')!.fields.find(f=>f.key==='status')!.options=[{id:'NOT_COMPLETED',label:'Sin completar'},{id:'pending',label:'Pendiente'}];
  const task=planDrill(spec,makeFixture().records,now);assert.equal(task.task,null);assert.ok(task.issues.some(issue=>issue.includes('completado reconocible')));
  const readonly=makeDemoSpec(makeFixture());readonly.entities.find(e=>e.id==='tasks')!.fields.find(f=>f.key==='subject')!.readOnly=true;
  assert.equal(planDrill(readonly,makeFixture().records,now).task,null);
});
test('el resumen de la última captura no confunde sus recuentos con el espacio activo',()=>{
  const store=new Store(':memory:'),snapshot=makeFixture();store.importSnapshot(snapshot);store.saveGeneration(makeDemoSpec(snapshot),{provider:'demo',model:null,generatedAt:new Date().toISOString(),prompt:'',approved:false});store.activate();
  const continuity=new Continuity(store,'.'),first=store.captures()[0].id;store.set('drills',[report(first)]);
  const next=makeFixture('distribution');next.capturedAt=new Date(Date.now()+1000).toISOString();next.records.push({...next.records.find(r=>r.entity==='contacts')!,id:'contact-extra'});next.manifest.expectedCounts.contacts++;
  store.addCapture(next);const status=continuity.status();assert.equal(status.latestCapture!.records,63);assert.equal(status.latestCapture!.counts.contacts,25);assert.equal(store.records().length,62);
  assert.equal(status.readiness.status,'untested');assert.equal(status.readiness.reportId,null);
  const serialized=JSON.stringify(status.latestCapture);assert.ok(!serialized.includes('email'));assert.ok(!serialized.includes('firstname'));store.close();
});

test('el informe legible escapa contenido importado y nunca completa recuentos con otra captura',()=>{
  const snapshot=makeFixture();snapshot.name='<script>alert("crm")</script>';
  const html=drillReportHtml(report('current'),summarizeCapture('current',snapshot));
  assert.ok(!html.includes('<script>'));assert.ok(html.includes('&lt;script&gt;'));assert.ok(!html.includes('src="http'));
  assert.ok(html.includes('24</td>'));assert.ok(html.includes('Sin certificados, SLA'));
  assert.ok(!html.includes('lucia.martin@example.com'));
  const absent=drillReportHtml(report('deleted'),null);assert.ok(absent.includes('ya no está en el historial'));assert.ok(!absent.includes('Agencia Norte'));
});
