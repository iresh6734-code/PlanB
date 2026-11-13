import test from 'node:test';
import assert from 'node:assert/strict';
import { createBaseApp } from '../server/app.js';
import { makeFixture, makeDemoSpec } from '../shared/fixtures.js';
import {
  buildPatch, changedKeys, contextKey, displayFieldValue, findConflicts, formatCivilDate, instantToLocalInput, judgeAfterUncertain, localInputToInstant,
  parseHealth, parseState, parseTaskRecord, rebaseDraft, sameValue, taskTitle, validateDraft,
} from '../shared/local-task-focus.js';
import type { CrmRecord, FieldValue } from '../shared/model.js';

// Lógica pura de la ficha de tarea sobre datos ficticios. La validación local se contrasta con el servidor real (oráculo),
// no con una copia del algoritmo. La persistencia y los fallos de red están en local-task-focus-client.test.ts y el E2E.
const snapshot = makeFixture('agency'), spec = makeDemoSpec(snapshot);
const entity = spec.entities.find(e => e.id === 'tasks')!;
const task = snapshot.records.find(r => r.entity === 'tasks' && r.id === 'task-2')! as CrmRecord;
const compact = (extra: Record<string, unknown> = {}) => ({ ...snapshot, records: [], links: [], ...extra });
const state = (over: Record<string, unknown> = {}) => ({ ready: true, runtime: false, changes: 0, spec, snapshot: compact(), ...over });

test('estado activo: contexto de la copia y esquema editable de tareas', () => {
  const parsed = parseState(state())!;
  assert.equal(parsed.context.ready, true); assert.equal(parsed.context.snapshotId, snapshot.id); assert.equal(parsed.context.isTestData, true);
  assert.equal(parsed.context.capturedAt, snapshot.capturedAt); assert.equal(parsed.context.accountId, snapshot.source.accountId); assert.equal(parsed.context.generatedAt, null, 'este estado de prueba no incluye generación');
  assert.equal(parseState(state({ generation: { generatedAt: '2026-11-02T09:00:00Z' } }))!.context.generatedAt, '2026-11-02T09:00:00Z');
  assert.equal(parsed.schema!.entity.id, 'tasks'); assert.ok(parsed.schema!.spec); assert.deepEqual(parsed.schema!.rules.map(r => r.entity), parsed.schema!.rules.map(() => 'tasks'));
});
test('copia importada sin activar: esquema de solo lectura desde la captura, sin spec', () => {
  const parsed = parseState(state({ ready: false, spec: null }))!;
  assert.equal(parsed.context.ready, false); assert.equal(parsed.schema!.spec, null); assert.equal(parsed.schema!.entity.fields.find(f => f.key === 'status')!.options.length, 2);
});
test('copia vacía, formatos incompatibles y ausencia de la entidad tareas', () => {
  assert.equal(parseState(state({ snapshot: null, spec: null, ready: false }))!.context.snapshotId, null);
  for (const bad of [null, 'x', [], {}, state({ ready: 'sí' }), state({ snapshot: { id: 4 } }), state({ spec: { nada: true } })]) assert.equal(parseState(bad), null);
  assert.equal(parseState(state({ ready: false, spec: null, snapshot: compact({ entities: snapshot.entities.filter(e => e.id !== 'tasks') }) }))!.schema, null, 'sin entidad de tareas no hay ficha');
  const noTasks = structuredClone(spec); noTasks.entities = noTasks.entities.filter(e => e.id !== 'tasks');
  assert.ok(parseState(state({ spec: noTasks }))?.schema === null || parseState(state({ spec: noTasks })) === null, 'una especificación activa sin tareas no abre ficha');
  assert.deepEqual(parseHealth({ ok: true, instanceId: 'abc' }), { instanceId: 'abc' }); assert.equal(parseHealth({ ok: false }), null); assert.deepEqual(parseHealth({ ok: true }), { instanceId: null });
});
test('identidad: otra ID u otra entidad no se aceptan como la tarea pedida', () => {
  assert.equal(parseTaskRecord({ record: task }, 'task-2')!.id, 'task-2');
  assert.equal(parseTaskRecord({ record: task }, 'task-3'), null);
  assert.equal(parseTaskRecord({ record: { ...task, entity: 'contacts' } }, 'task-2'), null);
  for (const bad of [null, {}, { record: { id: 'task-2' } }, { record: { entity: 'tasks', id: 'task-2', values: { a: {} } } }]) assert.equal(parseTaskRecord(bad, 'task-2'), null);
  const base = { instanceId: 'i', snapshotId: 'x', capturedAt: '2026-11-01T09:00:00Z', captureStartedAt: null, accountId: '65001', generatedAt: '2026-11-02T09:00:00Z' };
  assert.equal(contextKey(base), contextKey({ ...base }));
  // Cada componente de identidad cambia la clave (F2): el ID de captura por sí solo no basta.
  for (const change of [{ instanceId: 'otra' }, { snapshotId: 'y' }, { capturedAt: '2026-11-02T09:00:00Z' }, { captureStartedAt: '2026-11-01T08:00:00Z' }, { accountId: '65002' }, { generatedAt: '2026-11-03T09:00:00Z' }])
    assert.notEqual(contextKey(base), contextKey({ ...base, ...change }), JSON.stringify(change));
});
test('borrador: solo los campos editables cambiados viajan; vacío y null son lo mismo', () => {
  const draft = { ...task.values, status: 'completed', notes: '', due_date: task.values.due_date };
  assert.deepEqual(changedKeys(entity, task, draft), ['status', 'notes']); assert.deepEqual(buildPatch(entity, task, draft), { status: 'completed', notes: null });
  assert.deepEqual(buildPatch(entity, task, { ...task.values }), {}); assert.ok(sameValue(undefined, null) && sameValue('', null) && !sameValue(0, null) && !sameValue(false, null));
  const withReadOnly = structuredClone(entity); withReadOnly.fields.find(f => f.key === 'notes')!.readOnly = true;
  assert.deepEqual(changedKeys(withReadOnly, task, draft), ['status'], 'los campos de solo lectura no se envían');
});
test('validación local = validación del servidor sobre el registro fusionado (oráculo: servidor real)', async () => {
  const { app, store } = await createBaseApp({ dbPath: ':memory:', root: '.', staticDir: 'none' });
  try {
    store.importSnapshot(snapshot); store.saveGeneration(spec, { provider: 'demo', model: null, generatedAt: new Date().toISOString(), prompt: '', approved: false }); store.activate();
    const baseline = store.record('tasks', 'task-2')!;
    const patches: Record<string, FieldValue>[] = [{ subject: null }, { due_date: '2026-02-30' }, { due_date: 'mañana' }, { status: 'archivada' }, { status: null }, { desconocido: 'x' }, { status: 'completed' }, { notes: 'ok', due_date: '2026-12-31' }];
    for (const patch of patches) {
      const local = validateDraft(spec, baseline, patch);
      const response = await app.inject({ method: 'PATCH', url: '/api/records/tasks/task-2', payload: { values: patch } });
      const remote = response.statusCode === 422 ? Object.keys(response.json().details ?? {}).sort() : [];
      assert.deepEqual(Object.keys(local).sort(), remote, JSON.stringify(patch));
      if (response.statusCode === 422) for (const [key, message] of Object.entries(local)) assert.equal(response.json().details[key], message);
    }
  } finally { await app.close(); }
});
test('conflictos: solo campos que vas a enviar y que cambiaron fuera; nada si no cambió', () => {
  const current = { ...task, values: { ...task.values, status: 'completed', notes: 'ajena' } };
  assert.deepEqual(findConflicts(entity, task, current, { notes: 'mía' }).map(c => [c.key, c.label, c.baseline, c.current]), [['notes', 'Notas', task.values.notes, 'ajena']]);
  assert.deepEqual(findConflicts(entity, task, current, { due_date: '2026-12-01' }), []);
  assert.deepEqual(findConflicts(entity, task, task, { status: 'completed' }), []);
});
test('al aceptar lo actual, lo no editado toma el valor nuevo y lo editado se conserva', () => {
  const current = { ...task, values: { ...task.values, status: 'completed', notes: 'ajena' } };
  const rebased = rebaseDraft(entity, task, current, { ...task.values, notes: 'mía' });
  assert.equal(rebased.status, 'completed', 'no se pisa el estado que cambió otra persona'); assert.equal(rebased.notes, 'mía');
  assert.deepEqual(buildPatch(entity, current, rebased), { notes: 'mía' });
});
test('tras un acuse perdido: aplicado, sin cambios o divergente', () => {
  const patch = { status: 'completed' };
  assert.equal(judgeAfterUncertain(task, { ...task, values: { ...task.values, status: 'completed' } }, patch), 'applied');
  assert.equal(judgeAfterUncertain(task, task, patch), 'unchanged');
  assert.equal(judgeAfterUncertain(task, { ...task, values: { ...task.values, status: 'archivada' } }, patch), 'diverged');
});
test('fecha civil: no pasa por Date; instante ↔ datetime-local conserva el minuto', () => {
  assert.equal(formatCivilDate('2026-11-05'), '5/11/2026'); assert.equal(formatCivilDate('2026-01-01'), '1/1/2026'); assert.equal(formatCivilDate('no es fecha'), 'no es fecha');
  const iso = '2026-11-05T23:30:00.000Z', local = instantToLocalInput(iso), date = new Date(iso);
  assert.match(local, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/); assert.equal(Number(local.slice(11, 13)), date.getHours()); assert.equal(Number(local.slice(8, 10)), date.getDate());
  assert.equal(localInputToInstant(local), iso, 'ida y vuelta sin mover el instante'); assert.equal(localInputToInstant(''), null); assert.equal(instantToLocalInput('basura'), '');
});
test('presentación: valores desconocidos no se disimulan; título sin nombre usa el ID', () => {
  assert.equal(displayFieldValue(entity, 'status', 'completed'), 'Completada'); assert.match(displayFieldValue(entity, 'status', 'archivada'), /valor no reconocido/);
  assert.equal(displayFieldValue(entity, 'due_date', '2026-11-05'), '5/11/2026'); assert.equal(displayFieldValue(entity, 'notes', null), '—'); assert.equal(displayFieldValue(entity, 'contact_id', 'contact-2'), 'contacts · contact-2');
  assert.equal(taskTitle(entity, { ...task, values: { ...task.values, subject: '  ' } }), 'Tarea task-2'); assert.equal(taskTitle(entity, task), String(task.values.subject));
});
