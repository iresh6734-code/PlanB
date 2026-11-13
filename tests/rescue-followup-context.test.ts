import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRescueFixture, captureRevision } from '../server/rescue-room.js';
import { RescueError } from '../shared/rescue-room.js';
import { NOW, envelope, newRoom, rejects, viewOf, workLocally } from './helpers/rescue-followup-harness.js';
// RESCUE-115 · contexto, idempotencia y autorización. Ampliación de QA de 106 por su misma autora; las hipótesis de CODEX-RESCUE-REVIEW-113 (replay que
// salta el contexto) se contrastan aquí con una reproducción propia, sin presuponer su dictamen. Los casos «DEFECTO ·» afirman el comportamiento CORRECTO
// y por tanto FALLAN mientras el defecto exista: no se convierten en TODO/skip (ver informe y traspaso).
const wrongRevision = { captureRevision: 'f'.repeat(64) };

test('DEFECTO · un replay con la clave correcta pero con el contexto de OTRA captura no debe obtener el éxito guardado', async () => {
  const room = newRoom(), env = envelope(room, 'k-contexto-replay-1');
  await room.choosePlan({ ...env, budgetMinutes: 60 });
  const foreign = { ...env, context: { ...env.context, ...wrongRevision } };
  // Idempotencia (misma operación) no es autorización de contexto: quien no pertenece al contexto no debe recibir el acuse de una operación suya.
  await rejects(room.choosePlan({ ...foreign, budgetMinutes: 60 }), 'CONTEXT_MISMATCH'); room.close();
});

test('DEFECTO · el replay con el contexto de OTRA sala (otro workspaceId) no obtiene el acuse de la operación original', async () => {
  const a = newRoom(), b = newRoom(), env = envelope(a, 'k-contexto-replay-2');
  await a.choosePlan({ ...env, budgetMinutes: 30 });
  // La clave solo existe en A; B no la conoce: es un caso de control (debe rechazar por contexto, no por azar).
  await rejects(b.choosePlan({ ...env, budgetMinutes: 30 }), 'CONTEXT_MISMATCH');
  // Y el contexto de B enviado a A con la clave de A tampoco debe devolver el éxito de A.
  await rejects(a.choosePlan({ ...envelope(b, 'k-contexto-replay-2'), budgetMinutes: 30 }), 'CONTEXT_MISMATCH'); a.close(); b.close();
});

test('el mismo caso con una clave NUEVA sí se rechaza por contexto: la autorización de contexto funciona en la ruta no repetida', async () => {
  const room = newRoom(); await room.choosePlan({ ...envelope(room), budgetMinutes: 60 });
  const env = envelope(room); await rejects(room.choosePlan({ ...env, context: { ...env.context, ...wrongRevision }, budgetMinutes: 30 }), 'CONTEXT_MISMATCH');
  assert.equal(viewOf(room).budgetMinutes, 60, 'nada se aplicó'); room.close();
});

test('un acuse repetido lleva SU versión, no la actual: no se presenta un acuse antiguo como el estado vigente', async () => {
  const room = newRoom(), env = envelope(room, 'k-acuse-antiguo-1');
  const first = await room.choosePlan({ ...env, budgetMinutes: 60 });
  await room.setEstimate({ ...envelope(room), taskId: 'task-2', minutes: 20 }); await room.saveNote({ ...envelope(room), taskId: 'task-2', text: 'otra versión' });
  const again = await room.choosePlan({ ...env, budgetMinutes: 60 });
  assert.equal(again.replayed, true); assert.equal(again.version, first.version); assert.ok(again.version < viewOf(room).version, 'el acuse es de una versión anterior y se identifica como repetición');
  room.close();
});

test('la clave está ligada a ruta y contenido: otra ruta o payload con la misma clave se rechaza (422) y no cambia nada', async () => {
  const room = newRoom(), env = envelope(room, 'k-ligada-0001'); await room.choosePlan({ ...env, budgetMinutes: 60 }); const v = viewOf(room).version;
  await rejects(room.setEstimate({ ...env, taskId: 'task-2', minutes: 20 }), 'IDEMPOTENCY_KEY_REUSED'); await rejects(room.choosePlan({ ...env, budgetMinutes: 61 }), 'IDEMPOTENCY_KEY_REUSED');
  assert.equal(viewOf(room).version, v); room.close();
});

test('la revisión de captura depende del CONTENIDO: mismo ID y fecha con otros datos ⇒ otra revisión y el contexto forjado con el workspace ajeno se rechaza', async () => {
  const a = newRoom(), { snapshot } = buildRescueFixture(NOW), alt = structuredClone(snapshot); alt.records[0].values = { ...alt.records[0].values, name: 'Mismo ID, otro contenido' };
  assert.equal(alt.id, snapshot.id); assert.equal(alt.capturedAt, snapshot.capturedAt); assert.notEqual(captureRevision(alt), viewOf(a).context.captureRevision);
  const b = newRoom();
  assert.equal(viewOf(a).context.captureRevision, viewOf(b).context.captureRevision, 'dos salas con el mismo contenido comparten revisión (mismo fixture y reloj)');
  const forged = { ...envelope(b), context: { ...viewOf(b).context, captureRevision: captureRevision(alt) } };
  await rejects(b.choosePlan({ ...forged, budgetMinutes: 30 }), 'CONTEXT_MISMATCH'); a.close(); b.close();
});

test('salas con las mismas entidades e IDs no comparten decisiones: decidir en A deja B sin decidir y sin poder aprobar', async () => {
  const a = newRoom(), b = newRoom(); const prepare = async (r: typeof a) => { await workLocally(r); await r.crmReturn(envelope(r)); return ((await r.prepareReturn(envelope(r))).result as { planId: string }).planId; };
  const [pa, pb] = [await prepare(a), await prepare(b)];
  const conflict = (r: typeof a) => viewOf(r).returnPlan!.operations.find(o => o.fields.some(f => f.conflict))!;
  assert.equal(conflict(a).localId, conflict(b).localId, 'mismos IDs de registro en dos espacios'); assert.notEqual(conflict(a).id, conflict(b).id, 'operaciones distintas');
  await a.decide({ ...envelope(a), planId: pa, decisions: [{ operationId: conflict(a).id, field: 'due_date', decision: 'local' }] });
  assert.equal(conflict(b).fields.find(f => f.conflict)!.decision, null, 'B no hereda la decisión de A');
  await assert.rejects(b.approve({ ...envelope(b), planId: pb }), /conflictos/i);
  await rejects(b.decide({ ...envelope(a), planId: pb, decisions: [{ operationId: conflict(b).id, field: 'due_date', decision: 'local' }] }), 'CONTEXT_MISMATCH');
  assert.ok(new RescueError(400, 'X', 'x') instanceof Error); a.close(); b.close();
});

test('una aprobación y una orden del origen no se ejecutan en otra sala aunque compartan el ID nominal del plan', async () => {
  const a = newRoom(), b = newRoom(); for (const r of [a, b]) { await workLocally(r); await r.crmReturn(envelope(r)); await r.prepareReturn(envelope(r)); }
  const planA = viewOf(a).returnPlan!.id; await rejects(b.apply({ ...envelope(b), planId: planA }), 'PLAN_STALE'); await rejects(b.approve({ ...envelope(b), planId: planA }), 'PLAN_STALE');
  assert.equal(b.crm.stats().calls.update, 0); a.close(); b.close();
});
