import test from 'node:test';
import assert from 'node:assert/strict';
import { RescueRoom } from '../server/rescue-room.js';
import { buildResponseQueue } from '../shared/response-queue.js';
import { TMP, clock, envelope, newRoom, track, viewOf, workLocally } from './helpers/rescue-followup-harness.js';
// RESCUE-115 · límite de 200 tareas e informe. El plan NO es global: estas pruebas documentan el alcance real y que UI/informe lo declaran, sin editar la cola existente.
const big = () => track(RescueRoom.create(TMP, { clock, extraTasks: 400 }));
const line = (report: ReturnType<RescueRoom['report']>, section: string, label: RegExp) => report.sections.find(s => s.id === section)!.lines.find(l => label.test(l.label));

test('LÍMITE · la primera tarea con estimación viable está DESPUÉS de la posición 200: el plan no la considera y lo declara (no finge planificación global)', async () => {
  const room = big(); const state = room.ledger.inspect().state!;
  const full = buildResponseQueue({ spec: room.store.spec!, records: room.store.records(), evaluatedAt: clock(), horizonHours: state.horizonHours, limit: 200 });
  const visible = new Set(full.items.map(i => i.id)); assert.equal(full.summary.totalQueued > 400, true); assert.equal(full.summary.truncated, true);
  const hidden = room.store.records('tasks').find(r => !visible.has(r.id) && r.values.status === 'pending')!; assert.ok(hidden, 'hay tareas abiertas fuera de las 200 visibles');
  await room.choosePlan({ ...envelope(room), budgetMinutes: 480 }); await room.setEstimate({ ...envelope(room), taskId: hidden.id, minutes: 10 });
  const v = viewOf(room); assert.equal(v.plan!.included.length, 0, 'la única tarea estimada y viable no aparece en el plan');
  assert.equal(v.plan!.notConsidered, full.summary.totalQueued - 200); assert.ok(v.plan!.notConsidered > 200);
  assert.ok(v.plan!.limitations.some(l => /200/.test(l)), 'la limitación de 200 se declara en el propio plan'); assert.equal(v.queue.summary.truncated, true);
  assert.ok(v.queue.items.every(i => i.id !== hidden.id), 'la tarea oculta no está en la lista visible');
  room.close();
});

test('LÍMITE · los recuentos de 10.000 registros cubren todo el inventario pero NO demuestran planificación global', () => {
  const room = track(RescueRoom.create(TMP, { clock, extraTasks: 9938 })); const v = viewOf(room);
  assert.equal(v.capture.records, 10_000); assert.equal(v.queue.summary.totalTasks, 9956); assert.equal(v.queue.summary.returned, 200); assert.ok(v.queue.summary.totalQueued > v.queue.summary.returned * 40);
  assert.equal(v.plan, null, 'sin tiempo elegido no hay plan'); room.close();
});

test('INFORME · con la cola truncada el inventario lo dice y el plan declarado no se presenta como global', async () => {
  const room = big(); await room.choosePlan({ ...envelope(room), budgetMinutes: 120 }); const report = room.report();
  const inv = line(report, 'inventory', /Cola visible/)!; assert.match(inv.value, /truncada.*solo considera las visibles/i); assert.equal(inv.evidence, 'comprobado'); room.close();
});

test('INFORME · creadas y completadas se cuentan por separado (una creación con estado «pendiente» no es una tarea completada)', async () => {
  const room = newRoom(); await workLocally(room); const report = room.report();
  const completed = line(report, 'plan', /no es que se hayan hecho/)!; assert.match(completed.value, /completadas en la copia local: 1/);
  const local = report.sections.find(s => s.id === 'local')!.lines; assert.equal(local.length, 3); assert.equal(local.filter(l => /^create:/.test(l.value)).length, 1, 'una creación'); assert.equal(local.filter(l => /^update:/.test(l.value)).length, 2); room.close();
});

test('INFORME · estimaciones declaradas frente a hechos comprobados: las estimaciones nunca figuran como «comprobado»', async () => {
  const room = newRoom(); await workLocally(room); const report = room.report(); const plan = report.sections.find(s => s.id === 'plan')!.lines;
  assert.ok(plan.filter(l => /Tiempo disponible|Tareas que caben|Excluidas/.test(l.label)).every(l => l.evidence === 'declarado')); assert.ok(report.sections.find(s => s.id === 'local')!.lines.every(l => l.evidence === 'comprobado')); room.close();
});

test('INFORME · inciertas frente a verificadas: una operación incierta no suma a las verificadas ni figura como éxito', async () => {
  const room = newRoom(); await workLocally(room); await room.crmReturn(envelope(room)); const planId = ((await room.prepareReturn(envelope(room))).result as { planId: string }).planId;
  const op = viewOf(room).returnPlan!.operations.find(o => o.fields.some(f => f.conflict))!;
  await room.decide({ ...envelope(room), planId, decisions: [{ operationId: op.id, field: 'due_date', decision: 'local' }] }); await room.armLostAck({ ...envelope(room), armed: true });
  await room.approve({ ...envelope(room), planId }); await room.apply({ ...envelope(room), planId }); const report = room.report();
  assert.equal(report.sections.find(s => s.id === 'sends')!.lines[0].value, '2 de 3 (simulador)', 'solo las dos actualizaciones verificadas'); const u = report.sections.find(s => s.id === 'uncertain')!.lines;
  assert.equal(u.length, 1); assert.equal(u[0].evidence, 'pendiente'); assert.match(u[0].value, /incierto/i); assert.equal(report.closed, false); room.close();
});

test('MEJORA PENDIENTE · el informe debe separar «aprobado» de «enviado»: tras aprobar y antes de aplicar, una línea debe decir que está aprobado y NO enviado', async () => {
  const room = newRoom(); await workLocally(room); await room.crmReturn(envelope(room)); const planId = ((await room.prepareReturn(envelope(room))).result as { planId: string }).planId;
  const op = viewOf(room).returnPlan!.operations.find(o => o.fields.some(f => f.conflict))!;
  await room.decide({ ...envelope(room), planId, decisions: [{ operationId: op.id, field: 'due_date', decision: 'local' }] }); await room.approve({ ...envelope(room), planId });
  const text = room.report().sections.flatMap(s => s.lines).map(l => l.label + ' ' + l.value).join('\n');
  assert.match(text, /aprobad[oa]/i, 'el informe no refleja que el plan está aprobado'); assert.doesNotMatch(text, /1 de 3 \(simulador\)/); assert.match(text, /0 de 3 \(simulador\)/, 'ninguna operación verificada: lo aprobado no es lo enviado'); room.close();
});

test('INFORME · cerrar el ensayo no borra pendientes ni se presenta como recuperación del negocio', async () => {
  const room = newRoom(); await workLocally(room); await room.crmReturn(envelope(room)); await room.prepareReturn(envelope(room)); await room.closeIncident({ ...envelope(room), note: 'cierre con pendientes' });
  const report = room.report(); assert.equal(report.closed, true); assert.match(report.notProven.join(' '), /negocio se haya recuperado/);
  assert.ok(report.sections.find(s => s.id === 'sends')!.lines.some(l => /pendiente de enviar/.test(l.value)), 'las operaciones sin enviar siguen constando como pendientes'); assert.equal(room.localChanges().length, 3); room.close();
});
