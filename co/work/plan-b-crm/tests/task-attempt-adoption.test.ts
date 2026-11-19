import test from 'node:test';
import assert from 'node:assert/strict';
import type { TaskContext } from '../shared/local-task-focus.js';
import type { TaskSaveOperation } from '../shared/task-save-outcome.js';
import { resolveAdoption } from '../shared/task-attempt-adoption.js';

// Unidad 219 · regla pura de adopción del intento exacto. Sin red ni React.
const ctx = (over: Partial<TaskContext> = {}): TaskContext => ({ instanceId: 'i-1', snapshotId: 's-1', snapshotName: 'Copia A', capturedAt: '2026-11-02T09:00:00Z', captureStartedAt: null, accountId: null, generatedAt: '2026-11-02T09:00:00Z', isTestData: true, ready: true, runtime: false, ...over });
const op = (attemptId: string, over: Partial<TaskSaveOperation> = {}): TaskSaveOperation => ({
  attemptId, taskId: 'task-2', taskLabel: 'Llamar a Ana (task-2)', context: ctx(), baseline: { id: 'task-2', entity: 'tasks', values: { status: 'pending' } } as never, patch: { status: 'completed' }, fieldLabels: {}, revision: null,
  startedAt: '2026-11-05T10:00:00Z', settledAt: null, phase: 'sent', status: 'uncertain', detail: { kind: 'uncertain', message: '' }, record: null, evidence: null, verifying: false, queue: { status: 'idle', reason: '' },
  attemptNumber: 1, previousAttemptId: null, supersededBy: null, ...over,
});
const here = ctx();

test('con el intento pedido, misma tarea y misma copia: se adopta ESE intento (incierto, en curso, confirmado o aceptado), sin importar el resto', () => {
  for (const status of ['uncertain', 'in_flight', 'confirmed', 'accepted'] as const) assert.deepEqual(resolveAdoption([op('a', { status })], { taskId: 'task-2', context: here, requestedAttemptId: 'a' }), { kind: 'adopt', attemptId: 'a', otherOpen: [] }, status);
});
test('rechazado o no enviado: se restaura el borrador y el aviso se conserva (no se adopta como seguimiento)', () => {
  for (const status of ['rejected', 'not_sent'] as const) assert.deepEqual(resolveAdoption([op('a', { status })], { taskId: 'task-2', context: here, requestedAttemptId: 'a' }), { kind: 'restore-draft', attemptId: 'a' });
});
test('MISMO ID de tarea en OTRA captura (o instalación o generación): no se adopta; el aviso conserva su contexto y la tarea actual es un recorrido nuevo', () => {
  for (const other of [{ capturedAt: '2026-11-09T09:00:00Z' }, { snapshotId: 's-2' }, { instanceId: 'i-2' }, { generatedAt: '2026-11-03T09:00:00Z' }, { accountId: 'acc' }] as const) {
    const r = resolveAdoption([op('a', { context: ctx(other) })], { taskId: 'task-2', context: here, requestedAttemptId: 'a' });
    assert.equal(r.kind, 'refused', JSON.stringify(other)); if (r.kind === 'refused') { assert.equal(r.reason, 'other-copy'); assert.match(r.message, /recorrido nuevo y separado/); assert.match(r.message, /no puede confirmar ni aceptar aquel intento/); assert.equal(r.attemptId, 'a'); }
    assert.equal(resolveAdoption([op('a', { context: ctx(other) })], { taskId: 'task-2', context: here }).kind, 'none', 'tampoco se adopta sin pedirlo: es de otra copia');
  }
});
test('homónimas: otra tarea con el mismo título nunca se adopta; el ID de tarea manda', () => {
  const twin = op('t', { taskId: 'task-3', taskLabel: 'Llamar a Ana (task-3)' });
  assert.equal(resolveAdoption([twin], { taskId: 'task-2', context: here, requestedAttemptId: 't' }).kind, 'refused'); assert.equal(resolveAdoption([twin], { taskId: 'task-2', context: here }).kind, 'none');
  const r = resolveAdoption([twin], { taskId: 'task-2', context: here, requestedAttemptId: 't' }); assert.ok(r.kind === 'refused' && r.reason === 'other-task');
  assert.deepEqual(resolveAdoption([twin, op('a')], { taskId: 'task-2', context: here }), { kind: 'adopt', attemptId: 'a', otherOpen: [] }, 'entre dos homónimas solo cuenta la de SU ID');
});
test('sin intento pedido: adopta solo si hay EXACTAMENTE uno sin resolver y compatible; con varios no fuerza nada y los nombra; con ninguno, nada', () => {
  assert.equal(resolveAdoption([], { taskId: 'task-2', context: here }).kind, 'none'); assert.equal(resolveAdoption([op('a', { status: 'confirmed' })], { taskId: 'task-2', context: here }).kind, 'none', 'lo resuelto no se adopta solo');
  assert.deepEqual(resolveAdoption([op('a')], { taskId: 'task-2', context: here }), { kind: 'adopt', attemptId: 'a', otherOpen: [] });
  const two = resolveAdoption([op('a', { attemptNumber: 1 }), op('b', { attemptNumber: 2, status: 'in_flight' })], { taskId: 'task-2', context: here });
  assert.ok(two.kind === 'refused' && two.reason === 'ambiguous'); if (two.kind === 'refused') { assert.deepEqual(two.open, ['a', 'b']); assert.match(two.message, /2 guardados sin resolver/); assert.match(two.message, /No se ha enviado nada/); }
});
test('pedido uno concreto habiendo otro abierto: se adopta el pedido y se avisa de cuál otro sigue abierto', () => {
  const r = resolveAdoption([op('a'), op('b', { attemptNumber: 2 })], { taskId: 'task-2', context: here, requestedAttemptId: 'b' }); assert.deepEqual(r, { kind: 'adopt', attemptId: 'b', otherOpen: ['a'] });
  const resolved = resolveAdoption([op('a', { status: 'confirmed' }), op('b', { status: 'uncertain' })], { taskId: 'task-2', context: here, requestedAttemptId: 'a' }); assert.deepEqual(resolved, { kind: 'adopt', attemptId: 'a', otherOpen: ['b'] });
});
test('un reintento sustituye al anterior: pedir el viejo adopta el vigente; las sustituidas no cuentan como abiertas', () => {
  const old = op('a', { status: 'not_sent', supersededBy: 'b' }), next = op('b', { attemptNumber: 2, previousAttemptId: 'a', status: 'in_flight' });
  assert.deepEqual(resolveAdoption([old, next], { taskId: 'task-2', context: here, requestedAttemptId: 'a' }), { kind: 'adopt', attemptId: 'b', otherOpen: [] });
  assert.deepEqual(resolveAdoption([old, next], { taskId: 'task-2', context: here }), { kind: 'adopt', attemptId: 'b', otherOpen: [] });
  const loop = [op('x', { supersededBy: 'y' }), op('y', { supersededBy: 'x' })]; assert.doesNotThrow(() => resolveAdoption(loop, { taskId: 'task-2', context: here, requestedAttemptId: 'x' }));
});
test('un intento desaparecido (descartado o seguimiento reiniciado): se explica y no se inventa uno', () => {
  const r = resolveAdoption([op('a')], { taskId: 'task-2', context: here, requestedAttemptId: 'zzz' }); assert.ok(r.kind === 'refused' && r.reason === 'gone'); if (r.kind === 'refused') assert.match(r.message, /ya no está en el seguimiento/);
});
test('la regla no muta sus entradas', () => {
  const ops = Object.freeze([Object.freeze(op('a')), Object.freeze(op('b', { attemptNumber: 2 }))]); const snapshot = JSON.stringify(ops);
  resolveAdoption(ops, { taskId: 'task-2', context: here }); resolveAdoption(ops, { taskId: 'task-2', context: here, requestedAttemptId: 'a' }); assert.equal(JSON.stringify(ops), snapshot);
});
