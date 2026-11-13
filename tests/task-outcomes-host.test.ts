import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { registerHooks } from 'node:module';
import { makeFixture } from '../shared/fixtures.js';
import type { TaskContext } from '../shared/local-task-focus.js';
import { OutcomeRefreshError, type TaskSaveOperation } from '../shared/task-save-outcome.js';
import type { SaveOutcome } from '../src/local-task-focus-client.js';
import { createTaskSaveOutcomes, type SaveStrategy, type SubmitInput } from '../src/task-save-outcome.js';

// Unidad U2-171 · pruebas Node de la LÓGICA del propietario del gestor (consumidor de confirmación, resumen, recuento tras bloquear) usando el gestor REAL de
// 136/170 con una estrategia que devuelve cada resultado. Un render de servidor no prueba foco, geometría ni interacción: el montaje en la App real,
// contra el servidor real, está en tests/e2e/task-d7-real-app.spec.ts.
registerHooks({ load: (url, context, next) => url.endsWith('.css') ? { format: 'module', source: '', shortCircuit: true } : next(url, context) });
const { addLockSummary, byAttention, confirmationConsumer, summarizeOutcomes } = await import('../src/TaskOutcomesHost.js');

const context: TaskContext = { instanceId: 'i-1', snapshotId: 's-1', snapshotName: 'Copia', capturedAt: '2026-11-02T09:00:00Z', captureStartedAt: null, accountId: null, generatedAt: null, ready: true, runtime: false, isTestData: true };
const snapshot = makeFixture('agency');
const task = (id: string) => snapshot.records.find(r => r.entity === 'tasks' && r.id === id)!;
const entity = { id: 'tasks' as const, label: 'Tareas', singular: 'Tarea', displayField: 'subject', columns: ['subject'], fields: [{ key: 'notes', label: 'Notas', type: 'text' as const, required: false, readOnly: false, options: [], referenceEntity: null }] };
const input = (id: string, extra: Partial<SubmitInput> = {}): SubmitInput => ({ taskId: id, taskLabel: 'Tarea ' + id, baseline: task(id), entity, patch: { notes: 'x' }, context, ...extra });
const gate = () => { let release!: () => void; const promise = new Promise<void>(resolve => { release = resolve; }); return { promise, release }; };
const saved = (id: string): SaveOutcome => ({ kind: 'saved', record: { ...task(id), values: { ...task(id).values, notes: 'x' } } });
const SECRET = 'secreto-del-error@ejemplo.invalid';
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
/** Estrategia con barreras: cada tarea espera a que se libere su puerta antes de devolver su resultado (ya despachada). */
function rig() {
  const gates = new Map<string, ReturnType<typeof gate>>(), dispatches: string[] = [];
  const outcomes = new Map<string, SaveOutcome>();
  const strategy: SaveStrategy = {
    save: async (request, hooks) => { hooks.onDispatch(); dispatches.push(request.taskId); await gates.get(request.taskId)?.promise; return outcomes.get(request.taskId) ?? saved(request.taskId); },
    verify: async () => ({ kind: 'unknown' }),
  };
  return { gates, dispatches, outcomes, strategy, hold: (id: string) => { const g = gate(); gates.set(id, g); return g; } };
}

test('consumidor de confirmación: estado padre PRIMERO y Hoy DESPUÉS; sin Hoy montada solo lee el estado', async () => {
  const calls: string[] = [];
  const today = { reload: async () => { calls.push('hoy'); }, mounted: () => true };
  await confirmationConsumer(async () => { calls.push('estado'); }, today)(null, {} as TaskSaveOperation);
  assert.deepEqual(calls, ['estado', 'hoy']);
  calls.length = 0; await confirmationConsumer(async () => { calls.push('estado'); }, null)(null, {} as TaskSaveOperation);
  assert.deepEqual(calls, ['estado'], 'sin vista de Hoy no se recarga nada más');
});

test('causas CERRADAS: un fallo del estado (state) o de la lista de Hoy (list) no copia nunca el mensaje del error ajeno; si el estado falla, Hoy ni se intenta', async () => {
  let reloads = 0;
  const today = { reload: async () => { reloads++; throw new Error('GET /api/v7/local-operations falló con ' + SECRET); }, mounted: () => true };
  const stateFails = confirmationConsumer(async () => { throw new Error('Otra consulta sustituyó esta lectura. ' + SECRET); }, today);
  await assert.rejects(stateFails(null, {} as TaskSaveOperation), (error: unknown) => error instanceof OutcomeRefreshError && error.refreshCause === 'state' && !String(error.message).includes(SECRET));
  assert.equal(reloads, 0, 'si falla el estado de la App no se lee la cola');
  const listFails = confirmationConsumer(async () => undefined, today);
  await assert.rejects(listFails(null, {} as TaskSaveOperation), (error: unknown) => error instanceof OutcomeRefreshError && error.refreshCause === 'list' && !String(error.message).includes(SECRET));
  assert.equal(reloads, 1);
});

test('Hoy se desmonta DURANTE su recarga: se da por buena (el siguiente montaje lee de nuevo); si sigue montada, el fallo es de la lista', async () => {
  let mounted = true;
  const today = { reload: async () => { mounted = false; throw new Error('La lectura fue sustituida por otra.'); }, mounted: () => mounted };
  await confirmationConsumer(async () => undefined, today)(null, {} as TaskSaveOperation);
  const stillThere = { reload: async () => { throw new Error('503'); }, mounted: () => true };
  await assert.rejects(confirmationConsumer(async () => undefined, stillThere)(null, {} as TaskSaveOperation), (error: unknown) => (error as OutcomeRefreshError).refreshCause === 'list');
});

test('gestor real + consumidor de la App: confirmado → estado y lista leídos → cola «ok»; un fallo de CADA lectura se queda en la operación con su causa y el guardado sigue confirmado', async () => {
  for (const [name, readState, reload, cause] of [
    ['estado', async () => { throw new Error('x'); }, async () => undefined, 'state'],
    ['lista', async () => undefined, async () => { throw new Error('y'); }, 'list'],
  ] as const) {
    const r = rig(), manager = createTaskSaveOutcomes({ strategy: r.strategy });
    manager.setOnConfirmed(confirmationConsumer(readState, { reload, mounted: () => true }));
    const sub = manager.submit(input('task-2')); assert.equal(sub.kind, 'started'); await (sub as Extract<typeof sub, { kind: 'started' }>).done; await manager.whenIdle();
    const op = manager.list()[0]!; assert.equal(op.status, 'confirmed', name); assert.equal(op.queue.status, 'failed', name); assert.equal(op.queue.cause, cause, name);
    // Reintentar la actualización SOLO lee: ni un solo envío más.
    manager.setOnConfirmed(confirmationConsumer(async () => undefined, { reload: async () => undefined, mounted: () => true }));
    await manager.retryQueue(op.attemptId).catch(() => undefined); await manager.whenIdle();
    assert.equal(manager.list()[0]!.queue.status, 'ok', name); assert.equal(r.dispatches.length, 1, 'un único envío en toda la vida de la operación');
  }
});

test('sustituir el consumidor MIENTRAS recarga: el resultado del anterior —bueno o malo— nunca se atribuye al nuevo (la cola solo es «ok» cuando LEYÓ el consumidor vigente)', async () => {
  const r = rig(), manager = createTaskSaveOutcomes({ strategy: r.strategy });
  const slowOld = gate(); let oldFinished = 0, newCalls = 0;
  manager.setOnConfirmed(confirmationConsumer(async () => { await slowOld.promise; oldFinished++; }, null));       // «Hoy» de antes: lenta
  const sub = manager.submit(input('task-2')); await (sub as Extract<typeof sub, { kind: 'started' }>).done; await tick();
  assert.equal(manager.list()[0]!.queue.status, 'updating');
  // Hoy se remonta: otro consumidor. La lectura vieja termina DESPUÉS y bien, pero no cuenta.
  const slowNew = gate();
  manager.setOnConfirmed(confirmationConsumer(async () => { newCalls++; await slowNew.promise; }, null));
  slowOld.release(); await tick(); await tick();
  assert.equal(oldFinished, 1); assert.equal(newCalls, 1);
  assert.equal(manager.list()[0]!.queue.status, 'updating', 'el éxito del consumidor anterior no resuelve la recarga del nuevo');
  slowNew.release(); await manager.whenIdle(); assert.equal(manager.list()[0]!.queue.status, 'ok');
  // El caso contrario: el consumidor anterior FALLA tarde; tampoco se atribuye.
  const r2 = rig(), m2 = createTaskSaveOutcomes({ strategy: r2.strategy }), lateFail = gate();
  m2.setOnConfirmed(confirmationConsumer(async () => { await lateFail.promise; throw new Error('fallo tardío del anterior'); }, null));
  const sub2 = m2.submit(input('task-2')); await (sub2 as Extract<typeof sub2, { kind: 'started' }>).done; await tick();
  m2.setOnConfirmed(confirmationConsumer(async () => undefined, null)); lateFail.release(); await m2.whenIdle();
  assert.equal(m2.list()[0]!.queue.status, 'ok', 'el fallo tardío del consumidor anterior no marca fallida la recarga del nuevo');
  assert.equal(r2.dispatches.length, 1);
});

test('dispose antes y después del despacho: recuento exacto, lo despachado no se cancela ni se anuncia como cancelado y su resultado tardío no llama a nadie', async () => {
  const r = rig(), manager = createTaskSaveOutcomes({ strategy: r.strategy }); let consumerCalls = 0;
  manager.setOnConfirmed(async () => { consumerCalls++; });
  const sent = r.hold('task-2'); const a = manager.submit(input('task-2')) as Extract<ReturnType<typeof manager.submit>, { kind: 'started' }>; await tick();
  assert.deepEqual(r.dispatches, ['task-2']);                                  // ya salió
  const summary = manager.dispose();
  assert.deepEqual(summary, { notDispatched: 0, dispatched: 1 }, 'lo despachado se cuenta como despachado, nunca como cancelado');
  sent.release(); const finished = await a.done; await manager.whenIdle();
  assert.equal(finished.status, 'confirmed', 'el resultado real del envío ya despachado se conserva');
  assert.equal(consumerCalls, 0, 'tras terminar al propietario no se llama a ningún consumidor');
  assert.equal(r.dispatches.length, 1, 'ningún envío nuevo');
  assert.deepEqual(manager.dispose(), summary, 'idempotente');
  assert.equal(manager.submit(input('task-3')).kind, 'refused');
});

test('dispose con la comprobación previa en curso: cuenta como NO despachado, jamás sale un PATCH aunque la comprobación termine después, y no se anuncia como enviado', async () => {
  const gatePre = gate(), sent: string[] = [];
  const strategy: SaveStrategy = { save: async (request, hooks) => { await gatePre.promise; hooks.onDispatch(); sent.push(request.taskId); return saved(request.taskId); }, verify: async () => ({ kind: 'unknown' }) };
  const manager = createTaskSaveOutcomes({ strategy }); const sub = manager.submit(input('task-2')) as Extract<ReturnType<typeof manager.submit>, { kind: 'started' }>;
  assert.deepEqual(manager.dispose(), { notDispatched: 1, dispatched: 0 });
  gatePre.release(); const op = await sub.done; await manager.whenIdle();
  assert.equal(op.status, 'not_sent'); assert.deepEqual(sent, [], 'la puerta de despacho rechazó: ningún envío'); assert.equal(op.detail.kind, 'disposed');
});

test('un propietario nuevo empieza VACÍO: bloquear y desbloquear no hereda operaciones ni mezcla propietarios', async () => {
  const r = rig(), first = createTaskSaveOutcomes({ strategy: r.strategy }); const g = r.hold('task-2');
  const s = first.submit(input('task-2')) as Extract<ReturnType<typeof first.submit>, { kind: 'started' }>; await tick();
  assert.equal(first.dispose().dispatched, 1);
  const second = createTaskSaveOutcomes({ strategy: r.strategy });
  assert.deepEqual(second.list(), [], 'el propietario nuevo no ve nada del anterior');
  const sub = second.submit(input('task-2')); assert.equal(sub.kind, 'started', 'la misma tarea no queda «ocupada» por el propietario anterior');
  g.release(); await s.done; await (sub as Extract<typeof sub, { kind: 'started' }>).done;
  assert.equal(first.list().length, 1); assert.equal(second.list().length, 1);
});

test('resumen de la superficie: lo pendiente primero, recuentos exactos y etiqueta honesta', async () => {
  const r = rig(), manager = createTaskSaveOutcomes({ strategy: r.strategy });
  r.outcomes.set('task-2', { kind: 'uncertain', message: 'sin acuse' }); r.outcomes.set('task-3', saved('task-3'));
  r.outcomes.set('task-4', { kind: 'invalid', fields: { notes: 'mal' }, message: 'Datos no válidos' });
  manager.setOnConfirmed(async () => undefined);
  for (const id of ['task-3', 'task-2', 'task-4']) { const sub = manager.submit(input(id)) as Extract<ReturnType<typeof manager.submit>, { kind: 'started' }>; await sub.done; }
  await manager.whenIdle();
  const ops = manager.list(), summary = summarizeOutcomes(ops);
  assert.deepEqual({ total: summary.total, unresolved: summary.unresolved, rejected: summary.rejected, confirmed: summary.confirmed, sending: summary.sending, attention: summary.attention }, { total: 3, unresolved: 1, rejected: 1, confirmed: 1, sending: 0, attention: true }); assert.equal(summary.accepted, 0);
  assert.equal(summary.label, '1 guardado sin saber si se aplicó · 1 guardado que no se aplicó · 1 confirmado por el servidor');
  assert.equal(byAttention(ops)[0]!.status, 'uncertain', 'lo que necesita atención va primero');
  assert.deepEqual(byAttention(ops).map(op => op.status).slice(-1), ['confirmed'], 'lo confirmado y al día queda al final');
  assert.equal(summarizeOutcomes([]).label, ''); assert.equal(summarizeOutcomes([]).total, 0);
  const onlyConfirmed = summarizeOutcomes(ops.filter(op => op.status === 'confirmed')); assert.equal(onlyConfirmed.attention, false);
});

test('PROCEDENCIA (dictamen 209 F1): una lectura ACEPTADA por la persona no se cuenta como confirmada por el servidor; el fallo de recarga es otra dimensión y no cambia el origen', async () => {
  const r = rig(), manager = createTaskSaveOutcomes({ strategy: { ...r.strategy, verify: async () => ({ kind: 'read', evidence: 'applied', record: { ...task('task-2'), values: { ...task('task-2').values, notes: 'x' } } }) } });
  r.outcomes.set('task-2', { kind: 'uncertain', message: 'sin acuse' }); r.outcomes.set('task-3', saved('task-3'));
  manager.setOnConfirmed(async () => { throw new OutcomeRefreshError('list'); });             // la lista falla en TODAS: segunda dimensión
  const a = manager.submit(input('task-2')) as Extract<ReturnType<typeof manager.submit>, { kind: 'started' }>; await a.done; await manager.verify(a.attemptId); assert.equal(manager.accept(a.attemptId), true);
  const b = manager.submit(input('task-3')) as Extract<ReturnType<typeof manager.submit>, { kind: 'started' }>; await b.done; await manager.whenIdle();
  const summary = summarizeOutcomes(manager.list());
  assert.deepEqual({ confirmed: summary.confirmed, accepted: summary.accepted, queueFailed: summary.queueFailed }, { confirmed: 1, accepted: 1, queueFailed: 2 }, 'cada procedencia por su lado; la lista fallida cuenta aparte en ambas');
  assert.equal(summary.label, '2 listas sin actualizar · 1 confirmado por el servidor · 1 lectura aceptada por ti');
  const onlyAccepted = summarizeOutcomes(manager.list().filter(op => op.status === 'accepted')); assert.doesNotMatch(onlyAccepted.label, /confirmad/); assert.match(onlyAccepted.label, /aceptada por ti/);
});

test('recuento tras bloquear: se acumula, ignora los ceros y NO contiene textos', () => {
  assert.equal(addLockSummary(null, { notDispatched: 0, dispatched: 0 }), null);
  const one = addLockSummary(null, { notDispatched: 1, dispatched: 2 }); assert.deepEqual(one, { notDispatched: 1, dispatched: 2 });
  assert.deepEqual(addLockSummary(one, { notDispatched: 0, dispatched: 0 }), one);
  assert.deepEqual(addLockSummary(one, { notDispatched: 2, dispatched: 1 }), { notDispatched: 3, dispatched: 3 });
  assert.deepEqual(Object.keys(one!).sort(), ['dispatched', 'notDispatched'], 'solo cifras');
});

test('contrato de montaje (estático): un propietario por montaje, sin singleton; Hoy lo recibe por contexto y se lo pasa a la ficha; la superficie vive fuera de Hoy', () => {
  const host = fs.readFileSync('src/TaskOutcomesHost.tsx', 'utf8'), app = fs.readFileSync('src/App.tsx', 'utf8'), today = fs.readFileSync('src/LocalOperations.tsx', 'utf8');
  assert.equal((host.match(/createTaskSaveOutcomes\(/g) ?? []).length, 2, 'solo dos creaciones, ambas dentro del host: al montar y, si el bloqueo no se completa, un propietario NUEVO (nunca se reactiva el sellado)');
  assert.match(host, /entry\.reported = true[\s\S]*?const next = createTaskSaveOutcomes\(/, 'resume() cierra el anterior y empieza otro (A2: con la misma estrategia que el primero)');
  assert.doesNotMatch(host.replace(/\/\/.*$/gm, ''), /^(export )?(const|let) \w+ = createTaskSaveOutcomes/m, 'sin gestor a nivel de módulo');
  assert.match(host, /const summary = entry\.controller\.dispose\(\);/, 'dispose antes de soltar al propietario');
  assert.ok(host.indexOf('entry.controller.dispose()') < host.indexOf('setController(null); setToday(null)'), 'primero dispose, luego se suelta al propietario');
  assert.match(app, /<TaskOutcomesHost refreshState=\{refresh\}/); assert.match(app, /<TaskOutcomesSurface\/>/);
  assert.ok(app.indexOf('<TaskOutcomesSurface/>') < app.indexOf('<LocalOperations'), 'la superficie está en el contenido principal, no dentro de Hoy');
  assert.match(today, /outcomes=\{outcomes\?\.controller\}/, 'la ficha recibe EXACTAMENTE la instancia del propietario');
  // A2: el modo de guardado es una decisión del HOST (por defecto condicionado) y viaja con el propietario; ambos puntos de creación usan la misma estrategia.
  assert.match(host, /saveMode = 'revised'/, 'por defecto, guardado condicionado a la revisión');
  assert.equal((host.match(/modeRef\.current \? \{ strategy: revisionStrategy\(\) \} : undefined/g) ?? []).length, 2, 'los dos propietarios (montaje y resume) eligen la estrategia por el mismo modo');
  assert.match(host, /import \{ revisionStrategy \} from '\.\/task-revision-strategy\.js'/); assert.match(today, /revised=\{outcomes\?\.revised\}/, 'la ficha recibe el modo del propietario');
  assert.doesNotMatch(host.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, ''), /legacyStrategy|saveTask\(/, 'el host no importa la ruta anterior: el modo anterior es solo la ausencia de estrategia');
  assert.doesNotMatch(today, /createTaskSaveOutcomes/, 'Hoy no crea gestores');
  assert.doesNotMatch(fs.readFileSync('src/LocalTaskFocus.tsx', 'utf8'), /TaskOutcomesHost/, 'la ficha no depende del host');
});
