import test from 'node:test';
import assert from 'node:assert/strict';
import { envelope, newRoom, reopen, rejects, viewOf, workLocally, days } from './helpers/rescue-room-harness.js';
// Recorrido vertical de Modo Rescate sobre salas reales: caída de 8 h → plan de 60 min → trabajo local → reinicio → CRM con cambio incompatible
// → decisión por campo → acuse perdido tras un efecto → conciliación sin duplicado. Datos ficticios; todo envío es simulado.

test('la sala abre en preparación con procedencia, banner y cola explicable', () => {
  const room = newRoom(), v = viewOf(room);
  assert.equal(v.stage, 'preparation'); assert.equal(v.banner, 'Ensayo · datos ficticios · no conecta con HubSpot');
  assert.equal(v.incident.hours, 8); assert.equal(v.capture.records, 62); assert.equal(v.queue.summary.totalTasks, 18);
  assert.equal(v.queue.summary.completedTasks, 4, 'task-1, 6, 11 y 16 vienen completadas en la captura');
  assert.equal(v.queue.items[0].bucket, 'overdue'); assert.ok(v.queue.items[0].reasons.length > 0, 'cada tarea explica su prioridad');
  assert.equal(v.plan, null, 'sin tiempo elegido no hay plan'); assert.equal(v.crm.online, false);
  room.close();
});

test('el plan de 30 y de 60 minutos difiere por la regla de cabida con estimaciones declaradas, no por magia', async () => {
  const room = newRoom();
  await room.choosePlan({ ...envelope(room), budgetMinutes: 30 });
  assert.equal(viewOf(room).plan!.included.length, 0, 'sin estimaciones declaradas nada «cabe»: una estimación ausente es desconocida, no cero');
  assert.ok(viewOf(room).plan!.excluded.every(e => e.reason === 'no-estimate' || e.reason === 'unknown-status'));
  await room.loadScriptEstimates(envelope(room));
  const p30 = viewOf(room).plan!;
  assert.deepEqual(p30.included.map(e => e.id), ['task-2'], '20 min caben; 15 más superan los 30');
  await room.choosePlan({ ...envelope(room), budgetMinutes: 60 });
  const p60 = viewOf(room).plan!;
  assert.deepEqual(p60.included.map(e => e.id), ['task-2', 'task-3', 'task-4']); assert.equal(p60.usedMinutes, 60);
  assert.equal(p60.excluded.find(e => e.id === 'task-5')!.reason, 'exceeds-remaining');
  assert.equal(p60.excluded.find(e => e.id === 'task-17')!.reason, 'no-estimate');
  room.close();
});

test('recorrido completo: conflicto, acuse perdido, reinicio, ID erróneo rechazado y un solo create en total', async () => {
  let room = newRoom();
  const created = (await workLocally(room)).recordId;
  assert.match(created, /^local-/); assert.equal(room.localChanges().length, 3);
  room = reopen(room);
  assert.equal(viewOf(room).stage, 'local-work', 'la reapertura conserva la sala sin volver a sembrarla');
  assert.equal(viewOf(room).localChanges.length, 3);
  await rejects(room.prepareReturn(envelope(room)), 'CRM_OFFLINE');
  await room.crmReturn(envelope(room));
  const prepared = await room.prepareReturn(envelope(room)), planId = (prepared.result as { planId: string }).planId;
  let plan = viewOf(room).returnPlan!;
  assert.equal(plan.operations.length, 3); assert.equal(viewOf(room).stage, 'return-review');
  const conflict = plan.operations.flatMap(o => o.fields.filter(f => f.conflict));
  assert.equal(conflict.length, 1); assert.equal(conflict[0].field, 'due_date');
  assert.deepEqual([conflict[0].base, conflict[0].local, conflict[0].remote], [days(0), days(4), days(7)], 'tres valores divergentes: capturado, local y remoto');
  await assert.rejects(room.approve({ ...envelope(room), planId }), /conflictos/i, 'sin decisión no se aprueba');
  const op = plan.operations.find(o => o.fields.some(f => f.conflict))!;
  await room.decide({ ...envelope(room), planId, decisions: [{ operationId: op.id, field: 'due_date', decision: 'local' }] });
  await room.armLostAck({ ...envelope(room), armed: true });
  await room.approve({ ...envelope(room), planId });
  const applied = await room.apply({ ...envelope(room), planId });
  assert.equal(applied.outcome, 'uncertain'); assert.equal((applied.result as { uncertain: number }).uncertain, 1);
  assert.equal(viewOf(room).stage, 'return-partial'); assert.equal(room.crm.stats().calls.create, 1); assert.equal(room.crm.stats().records, 63, 'el efecto se persistió antes de perder el acuse');
  room = reopen(room);
  plan = viewOf(room).returnPlan!; const uncertain = plan.operations.find(o => o.status === 'uncertain')!;
  assert.ok(uncertain, 'tras el reinicio la operación sigue incierta'); assert.equal(plan.status, 'partial');
  await assert.rejects(room.resolve({ ...envelope(room), planId, operationId: uncertain.id, remoteId: 'crm-task-9999' }), /no confirma|incierta|corresponde/i);
  const candidates = room.candidates(planId, uncertain.id); assert.equal(candidates.length, 1);
  await room.resolve({ ...envelope(room), planId, operationId: uncertain.id, remoteId: candidates[0].id });
  await room.approve({ ...envelope(room), planId }); const done = await room.apply({ ...envelope(room), planId });
  assert.equal((done.result as { status: string }).status, 'complete'); assert.equal(viewOf(room).stage, 'return-verified');
  assert.equal(room.crm.stats().calls.create, 1, 'la conciliación no produjo un segundo create'); assert.equal(room.crm.stats().duplicateCreates, 0); assert.equal(room.crm.stats().records, 63);
  const remote = room.crm.records('tasks'); assert.equal(remote.find(r => r.id === 'task-5')!.values.due_date, days(4), 'la decisión local se envió');
  assert.equal(remote.find(r => r.id === 'task-4')!.values.status, 'completed'); assert.equal(remote.find(r => r.id === 'task-7')!.values.notes, 'Actualizado en el CRM durante la caída.', 'el cambio remoto no editado se conserva');
  await room.closeIncident({ ...envelope(room), note: 'Fin del ensayo' }); assert.equal(viewOf(room).stage, 'closed');
  room.close();
});

// ---------------------------------------------------------------- matriz de retorno: aprobación ligada al contenido, cambios remotos, parcial y plan corrupto
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { RescueRoom } from '../server/rescue-room.js';
const prepared = async (room: RescueRoom) => { await workLocally(room); await room.crmReturn(envelope(room)); const r = await room.prepareReturn(envelope(room)); return (r.result as { planId: string }).planId; };
const conflictOp = (room: RescueRoom) => viewOf(room).returnPlan!.operations.find(o => o.fields.some(f => f.conflict))!;
const decideLocal = async (room: RescueRoom, planId: string) => room.decide({ ...envelope(room), planId, decisions: [{ operationId: conflictOp(room).id, field: 'due_date', decision: 'local' }] });
const simFile = (room: RescueRoom) => join(room.root, 'crm-sim.json');

test('la aprobación queda ligada a la revisión local: un cambio local nuevo la invalida y aplicar lo antiguo se rechaza', async () => {
  const room = newRoom(), planId = await prepared(room); await decideLocal(room, planId); await room.approve({ ...envelope(room), planId });
  assert.equal(viewOf(room).returnPlan!.status, 'approved');
  await room.editTask({ ...envelope(room), taskId: 'task-8', values: { status: 'completed' } });
  await assert.rejects(room.apply({ ...envelope(room), planId }), /vigente/); assert.equal(room.crm.stats().calls.update, 0, 'no salió ningún envío');
  await assert.rejects(room.approve({ ...envelope(room), planId }), /cambios locales nuevos/); room.close();
});

test('cambiar una decisión retira la aprobación; no se puede aplicar sin volver a aprobar', async () => {
  const room = newRoom(), planId = await prepared(room); await decideLocal(room, planId); await room.approve({ ...envelope(room), planId });
  await room.decide({ ...envelope(room), planId, decisions: [{ operationId: conflictOp(room).id, field: 'due_date', decision: 'remote' }] });
  assert.equal(viewOf(room).returnPlan!.status, 'review'); assert.equal(viewOf(room).returnPlan!.approvedAt, null);
  await assert.rejects(room.apply({ ...envelope(room), planId }), /aprueba un plan vigente/); room.close();
});

test('el CRM cambia después de revisar: no se pisa, el plan vuelve a revisión y al actualizar se recalcula', async () => {
  const room = newRoom(), planId = await prepared(room); await decideLocal(room, planId); await room.approve({ ...envelope(room), planId });
  await room.crm.update('tasks', 'task-4', { status: 'completed' }); // un campo que el plan compara (lo ajeno al plan no invalida la revisión: límite del motor)
  const res = await room.apply({ ...envelope(room), planId });
  assert.equal(viewOf(room).returnPlan!.status, 'review'); assert.equal(viewOf(room).stage, 'return-review'); assert.equal((res.result as { applied: number }).applied, 0);
  assert.equal(room.crm.records('tasks').find(r => r.id === 'task-5')!.values.due_date, days(7), 'el valor remoto de task-5 no se sobrescribió');
  await room.refresh(envelope(room)); assert.equal(viewOf(room).returnPlan!.status, 'review'); room.close();
});

test('un registro ausente en el CRM bloquea la preparación en lugar de recrearlo', async () => {
  const room = newRoom(); await workLocally(room); await room.crmReturn(envelope(room));
  const sim = JSON.parse(readFileSync(simFile(room), 'utf8')); sim.records = sim.records.filter((r: { id: string }) => r.id !== 'task-4'); writeFileSync(simFile(room), JSON.stringify(sim));
  await assert.rejects(room.prepareReturn(envelope(room)), /ausente|archivado/); assert.equal(viewOf(room).returnPlan, null, 'no queda un plan a medias'); room.close();
});

test('fallo parcial: lo ya verificado no se reenvía al reintentar tras conciliar', async () => {
  const room = newRoom(), planId = await prepared(room); await decideLocal(room, planId); await room.armLostAck({ ...envelope(room), armed: true }); await room.approve({ ...envelope(room), planId });
  await room.apply({ ...envelope(room), planId });
  const updatesAfterFirst = room.crm.stats().calls.update; assert.equal(updatesAfterFirst, 2, 'las dos actualizaciones se verificaron antes del create incierto');
  const uncertain = viewOf(room).returnPlan!.operations.find(o => o.status === 'uncertain')!; const id = room.candidates(planId, uncertain.id)[0].id;
  await room.resolve({ ...envelope(room), planId, operationId: uncertain.id, remoteId: id }); await room.approve({ ...envelope(room), planId }); await room.apply({ ...envelope(room), planId });
  assert.equal(room.crm.stats().calls.update, updatesAfterFirst, 'no se reenviaron las actualizaciones ya verificadas'); assert.equal(room.crm.stats().calls.create, 1); room.close();
});

test('control negativo del ID: un ID de otra operación se rechaza; no se aprueba ni se actualiza con un resultado incierto pendiente', async () => {
  const room = newRoom(), planId = await prepared(room); await decideLocal(room, planId); await room.armLostAck({ ...envelope(room), armed: true }); await room.approve({ ...envelope(room), planId }); await room.apply({ ...envelope(room), planId });
  const uncertain = viewOf(room).returnPlan!.operations.find(o => o.status === 'uncertain')!;
  await assert.rejects(room.resolve({ ...envelope(room), planId, operationId: uncertain.id, remoteId: 'task-4' }), /corresponde|no confirma/i);
  await assert.rejects(room.approve({ ...envelope(room), planId }), /inciertos/); await assert.rejects(room.refresh(envelope(room)), /inciertos/);
  assert.equal(room.crm.stats().calls.create, 1); room.close();
});

test('el acuse perdido se arma una vez: el siguiente create ya no falla', async () => {
  const room = newRoom(); await workLocally(room); await room.crmReturn(envelope(room)); await room.armLostAck({ ...envelope(room), armed: true });
  assert.equal(room.crm.lostAckArmed(), true);
  await assert.rejects(room.crm.create('tasks', { subject: 'x' }, 'op-1'), /acuse/); assert.equal(room.crm.lostAckArmed(), false, 'consumido');
  assert.match(await room.crm.create('tasks', { subject: 'y' }, 'op-2'), /^crm-task-/); assert.equal(room.crm.stats().calls.create, 2); room.close();
});

test('plan de devolución corrupto: se conservan sus bytes, el retorno queda bloqueado y la sala no lo sustituye', async () => {
  let room = newRoom(); const planId = await prepared(room); void planId;
  const raw = () => (room.store.db.prepare("SELECT value FROM meta WHERE key='recoveryPlan'").get() as { value: string }).value;
  room.store.db.prepare("UPDATE meta SET value=? WHERE key='recoveryPlan'").run('enc1:no-descifrable'); const garbage = raw();
  room = reopen(room); const v = viewOf(room); assert.equal(v.recoveryIntegrity.state, 'invalid'); assert.equal(v.returnPlan, null);
  await assert.rejects(room.prepareReturn(envelope(room)), /no se puede validar/); await assert.rejects(room.editTask({ ...envelope(room), taskId: 'task-9', values: { status: 'completed' } }), /no se puede validar|plan de devolución/i);
  assert.equal(raw(), garbage, 'bytes originales intactos'); room.close();
});
