import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRescueReport, escapeHtml, renderReportHtml, serializeReport, type ReportInput } from '../shared/rescue-report.js';
import type { RecoveryPlan } from '../shared/operations.js';
import { envelope, newRoom, viewOf, workLocally } from './helpers/rescue-room-harness.js';
// Informe de hechos: separa comprobado, declarado y pendiente; nunca convierte una incertidumbre en éxito ni un plan en resultado.
const ctx = { workspaceId: 'espacio-uno-0001', accountId: 'demo', captureId: 'c', captureRevision: 'a'.repeat(64) };
const state = (stage = 'return-partial'): ReportInput['state'] => ({ format: 'planb-rescue-room-v1', version: 5, incidentId: 'incidente-0001', context: ctx, stage: stage as never, openedAt: '2026-11-02T07:00:00Z', incidentStartedAt: '2026-11-01T23:00:00Z', incidentHours: 8, horizonHours: 24, budgetMinutes: 60, estimates: { a: 30 }, notes: {}, blocked: {}, selectedTaskId: null, crmOnline: true, faults: { lostAck: false }, returnPlanId: 'p', closedAt: null, closeNote: '' });
const op = (over: Record<string, unknown>) => ({ id: 'o', entity: 'tasks', localId: 'l', remoteId: null, kind: 'create', label: 'Tarea', fields: [], references: [], remoteVersion: null, status: 'pending', error: null, ...over });
const input = (ops: unknown[], extra: Partial<ReportInput> = {}): ReportInput => ({ generatedAt: '2026-11-02T08:00:00Z', state: state(), capture: { name: 'C', capturedAt: '2026-11-01T22:00:00Z', records: 62, counts: { tasks: 18 } }, queue: { totalTasks: 18, completedTasks: 4, knownOpenTasks: 14, unknownStatusTasks: 0, totalQueued: 14, returned: 14, truncated: false },
  plan: { budgetMinutes: 60, usedMinutes: 30, remainingMinutes: 30, included: [{ id: 'a', label: 'A', bucket: 'overdue', minutes: 30, startMinute: 0, endMinute: 30 }], excluded: [], considered: 14, notConsidered: 0, unknownEstimates: 13, method: 'm', limitations: [] }, journal: [], returnPlan: { id: 'p', accountId: 'demo', createdAt: 'x', revision: 'r', status: 'partial', operations: ops, source: 'simulation', warning: '', approvedAt: null } as unknown as RecoveryPlan, simulator: null, localChanges: [], ...extra });
const lines = (r: ReturnType<typeof buildRescueReport>, id: string) => r.sections.find(s => s.id === id)!.lines;

test('una operación incierta es pendiente, nunca éxito; una verificada es comprobada y se cuenta aparte', () => {
  const r = buildRescueReport(input([op({ id: 'u', label: 'Incierta', status: 'uncertain', error: 'Puede haberse aplicado' }), op({ id: 'v', label: 'Verificada', status: 'applied', remoteId: 'crm-task-0001' })]));
  assert.deepEqual(lines(r, 'uncertain').map(l => [l.label, l.evidence]), [['Incierta', 'pendiente']]); assert.ok(lines(r, 'sends').some(l => l.label === 'Verificada' && l.evidence === 'comprobado'));
  assert.equal(lines(r, 'sends')[0].value, '1 de 2 (simulador)'); assert.ok(!lines(r, 'uncertain').some(l => l.evidence === 'comprobado'));
});

test('que las tareas quepan en el plan no se presenta como hecho; el trabajo completado se cuenta desde cambios locales', () => {
  const r = buildRescueReport(input([], { localChanges: [{ entity: 'tasks', recordId: 't', operation: 'update', at: 'x', fields: ['status'], completed: true }, { entity: 'tasks', recordId: 'n', operation: 'create', at: 'x', fields: ['status', 'subject'], completed: false }] }));
  const plan = lines(r, 'plan'); assert.equal(plan[1].evidence, 'declarado'); assert.match(plan[1].value, /1 \(30 min estimados de 60\)/);
  assert.match(plan.find(l => /no es que se hayan hecho/.test(l.label))!.value, /completadas en la copia local: 1/);
});

test('los límites no demostrados siempre constan: negocio, HubSpot real, RTO, ahorro y auditoría', () => {
  const r = buildRescueReport(input([])); const text = r.notProven.join(' ');
  for (const needle of ['negocio se haya recuperado', 'HubSpot real', 'RTO', 'Ahorro', 'multiusuario']) assert.match(text, new RegExp(needle, 'i'), needle);
  assert.match(r.measures.note, /No es una prueba de usuario ni un RTO/); assert.equal(r.banner, 'Ensayo · datos ficticios · no conecta con HubSpot');
});

test('tiempo de usuario y tiempos técnicos van separados y no se suman', () => {
  const journal = [{ at: '2026-11-02T07:00:00Z', data: {} }, { at: '2026-11-02T07:00:10Z', data: { durationMs: 40 }, kind: 'apply-attempted' }] as never;
  const r = buildRescueReport(input([], { journal })); assert.equal(r.measures.userWallClockMs, 10_000); assert.deepEqual(r.measures.technical, [{ label: 'apply-attempted', ms: 40 }]);
});

test('HTML: contenido malicioso como dato, sin scripts ni enlaces activos, con CSP restrictiva', () => {
  const evil = '<script>alert(1)</script> & "x" \'y\' <img src=//evil.example/x>';
  const html = renderReportHtml(buildRescueReport(input([op({ label: evil, status: 'uncertain', error: evil, fields: [{ field: 'f', label: evil, base: evil, local: evil, remote: evil, conflict: true, decision: null }] })])));
  assert.ok(!/<script[ >]|<img |<a |<link|<iframe|onerror|javascript:/i.test(html)); assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;')); assert.ok(html.includes('default-src \'none\''));
  assert.equal((html.match(/https?:\/\//g) ?? []).length, 0, 'ninguna URL remota'); assert.equal(escapeHtml(`<>&"'`), '&lt;&gt;&amp;&quot;&#39;');
});

test('el JSON del informe es estable y no contiene rutas privadas', () => {
  const a = serializeReport(buildRescueReport(input([]))), b = serializeReport(buildRescueReport(input([]))); assert.equal(a, b); assert.ok(!/[A-Z]:\\|\/Users\//.test(a));
});

test('informe de una sala real tras el trabajo local: hechos comprobados desde el Store, no desde el plan', async () => {
  const room = newRoom(); await workLocally(room); const r = room.report();
  assert.equal(lines(r, 'local').length, 3); assert.ok(lines(r, 'local').every(l => l.evidence === 'comprobado'));
  assert.match(lines(r, 'plan').find(l => /no es que se hayan hecho/.test(l.label))!.value, /completadas en la copia local: 1/); assert.equal(r.closed, false);
  assert.match(lines(r, 'sends')[0].evidence, /pendiente/); assert.equal(viewOf(room).stage, 'local-work'); void envelope; room.close();
});
