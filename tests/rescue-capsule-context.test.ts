import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { exportCapsule, importCapsule, inspectCapsule, loadCapsule, type Kit } from '../server/rescue-capsule.js';
import { RescueRoom } from '../server/rescue-room.js';
import { RescueError } from '../shared/rescue-room.js';
import { PASSWORD, TMP, clock, envelope, newKit, newRoom, originAt, rejects, trackFolder, viewOf } from './helpers/rescue-capsule-harness.js';
// Kit de Relevo · contexto, política por estado y atribución. El destino es OTRA sala: nada del origen (claves, aprobaciones, órdenes) se ejecuta allí por compartir un ID nominal.
const relay = async (kit: Kit, origin: RescueRoom) => {
  const e = await exportCapsule(origin, PASSWORD, kit), insp = await inspectCapsule(kit, e.name, PASSWORD);
  const imp = await importCapsule(kit, { name: e.name, password: PASSWORD, expectedSha256: insp.sha256, expectedRevision: insp.revision }); trackFolder(join(TMP, imp.destination.folder));
  const dest = RescueRoom.open(join(TMP, imp.destination.folder), { clock }); return { e, insp, imp, dest };
};
type Stage = Parameters<typeof originAt>[0];
const MATRIX: { stage: Stage; expectStage: string; plan: string | null; uncertain: number; note: string }[] = [
  { stage: 'preparation', expectStage: 'preparation', plan: null, uncertain: 0, note: 'preparación: sin trabajo ni retorno' },
  { stage: 'local-work', expectStage: 'local-work', plan: null, uncertain: 0, note: 'trabajo local conservado' },
  { stage: 'return-review', expectStage: 'return-review', plan: 'review', uncertain: 0, note: 'plan en revisión conservado' },
  { stage: 'approved', expectStage: 'return-review', plan: 'review', uncertain: 0, note: 'APROBADO: la aprobación se retira (review)' },
  { stage: 'return-partial', expectStage: 'return-partial', plan: 'partial', uncertain: 1, note: 'incierto conservado como incierto' },
  { stage: 'return-verified', expectStage: 'return-verified', plan: 'complete', uncertain: 0, note: 'verificado: nada que enviar' },
  { stage: 'closed', expectStage: 'closed', plan: 'complete', uncertain: 0, note: 'cerrado: de consulta' },
];
for (const row of MATRIX) test('política por estado · ' + row.note, async () => {
  const kit = newKit(), origin = await originAt(row.stage), before = origin.logicalDigest(); const { imp, dest, insp } = await relay(kit, origin);
  const v = viewOf(dest), o = viewOf(origin); assert.equal(v.stage, row.expectStage); assert.equal(v.returnPlan?.status ?? null, row.plan); assert.equal(v.returnPlan?.operations.filter(op => op.status === 'uncertain').length ?? 0, row.uncertain);
  assert.notEqual(v.returnPlan?.status, 'approved', 'ninguna aprobación ejecutable sobrevive'); if (v.returnPlan && v.returnPlan.status !== 'complete') assert.equal(v.returnPlan.approvedAt, null); // un plan COMPLETO conserva su fecha de aprobación solo como historia assert.equal(v.journal.total, o.journal.total + 1); assert.equal(v.version, o.version + 1);
  assert.equal(v.capture.records, o.capture.records); assert.equal(v.localChanges.length, o.localChanges.length); assert.equal(v.crm.stats.calls.create, o.crm.stats.calls.create, 'mismo efecto en el simulador'); assert.equal(v.crm.lostAckArmed, false);
  assert.equal(origin.logicalDigest(), before, 'el origen no cambia'); assert.equal(insp.summary.origin.stage, row.stage === 'approved' ? 'return-review' : row.stage);
  if (row.stage === 'approved') assert.ok(imp.retired.some(r => /Aprobación/.test(r)));
  if (row.stage === 'closed') await rejects(dest.setEstimate({ ...envelope(dest), taskId: 'task-2', minutes: 20 }), 'STAGE_BLOCKED');
  if (row.stage === 'return-partial') await assert.rejects(dest.approve({ ...envelope(dest), planId: v.returnPlan!.id }), /inciertos/i, 'no se aprueba con incertidumbre pendiente');
  if (row.stage === 'return-review') await assert.rejects(dest.apply({ ...envelope(dest), planId: v.returnPlan!.id }), /aprueba un plan vigente/, 'sin aprobar no se envía');
  dest.close(); origin.close();
});

test('las claves y los sobres del ORIGEN no se ejecutan en el destino aunque compartan el ID nominal del plan o de la operación', async () => {
  const kit = newKit(), origin = newRoom(), env = envelope(origin, 'k-origen-replay-01'); await origin.choosePlan({ ...env, budgetMinutes: 60 }); await origin.loadScriptEstimates(envelope(origin));
  const { dest } = await relay(kit, origin); const d = viewOf(dest), o = viewOf(origin); assert.notEqual(d.context.workspaceId, o.context.workspaceId); assert.equal(d.context.captureRevision, o.context.captureRevision);
  await rejects(dest.choosePlan({ ...env, budgetMinutes: 60 }), 'CONTEXT_MISMATCH');                                   // el sobre del origen
  await rejects(dest.choosePlan({ ...envelope(dest, 'k-origen-replay-01'), budgetMinutes: 60 }), 'CONTEXT_MISMATCH');   // la MISMA clave con el contexto del destino: el replay antiguo no es una operación nueva
  const before = viewOf(dest).version; const fresh = await dest.choosePlan({ ...envelope(dest, 'k-destino-nueva-1'), budgetMinutes: 30 }); assert.equal(fresh.replayed, false); assert.equal(viewOf(dest).version, before + 1); assert.equal(viewOf(origin).budgetMinutes, 60, 'el origen no se ve afectado');
  dest.close(); origin.close();
});

test('una orden del origen sobre el plan (aprobar/aplicar) no se ejecuta en el destino: el plan hereda ID pero no la aprobación', async () => {
  const kit = newKit(), origin = await originAt('approved'); const planId = viewOf(origin).returnPlan!.id; const { dest } = await relay(kit, origin);
  assert.equal(viewOf(dest).returnPlan!.id, planId, 'mismo ID nominal'); await assert.rejects(dest.apply({ ...envelope(dest), planId }), /aprueba un plan vigente/); assert.equal(dest.crm.stats().calls.update, 0);
  // La aprobación del origen se retiró: hace falta una aprobación NUEVA y explícita del destino, que queda en su propio diario.
  const eventsBefore = viewOf(dest).journal.total; await dest.approve({ ...envelope(dest), planId }); const after = viewOf(dest); assert.equal(after.returnPlan!.status, 'approved'); assert.equal(after.journal.total, eventsBefore + 1);
  assert.equal(after.journal.events[0].workspaceId, after.context.workspaceId, 'la aprobación es un hecho del destino'); assert.equal(dest.crm.stats().calls.update, 0, 'aprobar no envía nada');
  dest.close(); origin.close();
});

test('procedencia e historial: los hechos del origen conservan su espacio, el destino añade el suyo y la cadena de linajes se conserva al relevar de nuevo', async () => {
  const kit = newKit(), origin = await originAt('local-work'); const { dest, imp } = await relay(kit, origin); const ledger = dest.ledger.inspect(); assert.equal(ledger.integrity.status, 'ok');
  const originId = viewOf(origin).context.workspaceId; assert.equal(ledger.journal.filter(e => e.workspaceId === originId).length, viewOf(origin).journal.total, 'hechos antiguos atribuidos al origen'); assert.equal(ledger.journal.at(-1)!.workspaceId, imp.destination.roomId);
  assert.deepEqual(ledger.state!.lineage!.origins, [originId]); assert.equal(ledger.journal.at(-1)!.kind, 'capsule-imported');
  await dest.setEstimate({ ...envelope(dest), taskId: 'task-9', minutes: 25 }); const second = await relay(newKit(), dest);
  assert.deepEqual(second.dest.ledger.inspect().state!.lineage!.origins, [originId, imp.destination.roomId], 'linaje encadenado'); assert.equal(second.dest.ledger.inspect().integrity.status, 'ok');
  second.dest.close(); dest.close(); origin.close();
});

test('dos orígenes con las mismas entidades e IDs no comparten decisiones al relevarse: cada destino es independiente', async () => {
  const a = await originAt('return-review'), b = await originAt('return-review'), kit = newKit(); const da = await relay(kit, a), db = await relay(newKit(), b);
  const planA = viewOf(da.dest).returnPlan!, planB = viewOf(db.dest).returnPlan!, opA = planA.operations.find(o => o.fields.some(f => f.conflict))!;
  await da.dest.decide({ ...envelope(da.dest), planId: planA.id, decisions: [{ operationId: opA.id, field: 'due_date', decision: 'local' }] });
  assert.equal(viewOf(db.dest).returnPlan!.operations.flatMap(o => o.fields).find(f => f.conflict)!.decision, null, 'la decisión de un destino no pasa a otro'); await rejects(db.dest.decide({ ...envelope(da.dest), planId: planB.id, decisions: [{ operationId: opA.id, field: 'due_date', decision: 'local' }] }), 'CONTEXT_MISMATCH');
  for (const r of [da.dest, db.dest, a, b]) r.close();
});

test('el destino se crea siempre en una carpeta NUEVA: el origen no se sobrescribe y un destino fuera de tests/.tmp se rechaza', async () => {
  const kit = newKit(), origin = newRoom(), e = await exportCapsule(origin, PASSWORD, kit), insp = await inspectCapsule(kit, e.name, PASSWORD);
  await assert.rejects(importCapsule({ ...kit, destParent: join(TMP, '..') }, { name: e.name, password: PASSWORD, expectedSha256: insp.sha256, expectedRevision: insp.revision }), /DEST_NOT_ALLOWED|carpeta nueva|bajo tests/i);
  const imp = await importCapsule(kit, { name: e.name, password: PASSWORD, expectedSha256: insp.sha256, expectedRevision: insp.revision }); trackFolder(join(TMP, imp.destination.folder)); assert.notEqual(join(TMP, imp.destination.folder), origin.root);
  assert.ok(loadCapsule(kit, e.name, PASSWORD).capsule.origin.roomId === viewOf(origin).context.workspaceId); assert.ok(new RescueError(400, 'X', 'x') instanceof Error); origin.close();
});

test('un fallo de acuse ARMADO en el origen al exportar no se hereda: el destino lo desarma y el origen sigue armado', async () => {
  const kit = newKit(), origin = await originAt('return-review'); await origin.armLostAck({ ...envelope(origin), armed: true }); assert.equal(viewOf(origin).crm.lostAckArmed, true, 'control: el origen está armado');
  const { imp, dest } = await relay(kit, origin); assert.ok(imp.retired.some(r => /desarmado/i.test(r)), 'el informe de importación dice que se desarmó');
  assert.equal(viewOf(dest).crm.lostAckArmed, false); assert.equal(viewOf(origin).crm.lostAckArmed, true, 'el origen no cambia');
  dest.close(); origin.close();
});
