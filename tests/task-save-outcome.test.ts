import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { createBaseApp } from '../server/app.js';
import { registerTaskRevision } from '../server/task-revision.js';
import { makeFixture, makeDemoSpec } from '../shared/fixtures.js';
import { judgeAfterUncertain } from '../shared/local-task-focus.js';
import { canAccept, canRetry, describeOperation, OutcomeRefreshError, patchLines, REFRESH_REASONS, type TaskSaveOperation } from '../shared/task-save-outcome.js';
import { loadTask, type LoadedTask, type SaveOutcome, type Transport, type Verification } from '../src/local-task-focus-client.js';
import { createTaskSaveOutcomes, legacyStrategy, type SaveRequest, type SaveStrategy, type StrategyOutcome, type SubmitInput } from '../src/task-save-outcome.js';

// Unidad 136 (D7). Todo contra el servidor REAL (createBaseApp + Store en memoria + HTTP en 127.0.0.1, datos ficticios). Los fallos de
// red se inyectan envolviendo fetch (se deja pasar la petición al servidor real y se retiene o pierde la RESPUESTA, o se retiene la
// petición): nunca se simula el servidor. Un «arnés» no es la App real.

// Fuentes de 123 (en review) que esta unidad importa SIN modificar. Si cambian, hay que repetir esta unidad.
const SOURCES123: Record<string, string> = {
  'src/local-task-focus-client.ts': '59dda342d954b659aebb750b63bc726d3c0b382142bea0ca9baf496e779ca501',
  'shared/local-task-focus.ts': 'e41df640594532587bc0fb90a28f1a538063c5bf2e598460ce892462777358d5',
};
test('huella: esta unidad se probó contra las fuentes de 123 presentadas en su segunda versión', () => {
  for (const [file, hash] of Object.entries(SOURCES123)) assert.equal(createHash('sha256').update(fs.readFileSync(file)).digest('hex'), hash, file);
});

type Rig = Awaited<ReturnType<typeof rig>>;
async function rig(opts: { revision?: boolean } = {}) {
  const { app, store } = await createBaseApp({ dbPath: ':memory:', root: '.', staticDir: 'none' });
  const patches: { url: string; body: unknown }[] = [];
  app.addHook('preHandler', async request => { if (request.method === 'PATCH') patches.push({ url: request.url, body: request.body }); });
  if (opts.revision) registerTaskRevision(app, store);
  const snapshot = makeFixture('agency');
  for (const id of ['task-2', 'task-3']) { const task = snapshot.records.find(r => r.entity === 'tasks' && r.id === id)!; task.values.subject = 'Llamar a Ana'; task.values.due_date = id === 'task-2' ? '2026-11-05' : '2026-11-09'; }
  store.importSnapshot(snapshot); store.saveGeneration(makeDemoSpec(snapshot), { provider: 'demo', model: null, generatedAt: '2026-11-02T09:00:00Z', prompt: '', approved: false }); store.activate();
  await app.listen({ host: '127.0.0.1', port: 0 });
  const base = 'http://127.0.0.1:' + (app.server.address() as { port: number }).port;
  const transport: Transport = { fetch: (input, init) => fetch(input, init), base };
  return { app, store, base, patches, transport, close: () => app.close() };
}
const withRig = async (fn: (r: Rig) => Promise<void>, opts?: Parameters<typeof rig>[0]) => { const r = await rig(opts); try { await fn(r); } finally { await r.close(); } };
const signal = () => new AbortController().signal;
const gate = () => { let release!: () => void; const promise = new Promise<void>(resolve => { release = resolve; }); return { promise, release }; };
async function open(r: Rig, id: string): Promise<Extract<LoadedTask, { kind: 'ok' }>> { const loaded = await loadTask(id, signal(), r.transport); assert.equal(loaded.kind, 'ok'); return loaded as Extract<LoadedTask, { kind: 'ok' }>; }
const input = (loaded: Extract<LoadedTask, { kind: 'ok' }>, patch: SubmitInput['patch'], extra: Partial<SubmitInput> = {}): SubmitInput =>
  ({ taskId: loaded.record.id, taskLabel: String(loaded.record.values.subject) + ' (' + loaded.record.id + ')', baseline: loaded.record, entity: loaded.schema!.entity, patch, context: loaded.context, ...extra });
const started = (submission: ReturnType<ReturnType<typeof createTaskSaveOutcomes>['submit']>) => { assert.equal(submission.kind, 'started'); return submission as Extract<typeof submission, { kind: 'started' }>; };
/** El servidor APLICA el PATCH y la respuesta se retiene hasta soltar la barrera; luego se pierde (`lose`) o se entrega. */
function heldAck(base: Transport, lose: boolean) {
  const barrier = gate(); let applied: () => void = () => undefined; const appliedPromise = new Promise<void>(resolve => { applied = resolve; });
  const transport: Transport = { ...base, fetch: async (url, init) => {
    if (init?.method !== 'PATCH') return base.fetch(url, init);
    const response = await base.fetch(url, init); applied(); await barrier.promise;
    if (lose) throw new TypeError('acuse perdido'); return response;
  } };
  return { transport, release: barrier.release, applied: appliedPromise };
}
/** El PATCH se retiene ANTES de enviarlo (no ha llegado al servidor) y luego se pierde o se deja pasar. */
function heldRequest(base: Transport) {
  const barrier = gate(); let reached: () => void = () => undefined; const reachedPromise = new Promise<void>(resolve => { reached = resolve; });
  const transport: Transport = { ...base, fetch: async (url, init) => { if (init?.method === 'PATCH') { reached(); await barrier.promise; } return base.fetch(url, init); } };
  return { transport, release: barrier.release, reached: reachedPromise };
}
const dropPatch = (base: Transport): Transport => ({ ...base, fetch: async (url, init) => { if (init?.method === 'PATCH') throw new TypeError('la petición nunca salió'); return base.fetch(url, init); } });
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

test('la operación se registra ANTES de enviar, ligada a instalación, captura, ID de tarea e intento local', () => withRig(async r => {
  const loaded = await open(r, 'task-2'); const calls: string[] = [];
  const spy: Transport = { ...r.transport, fetch: (url, init) => { calls.push((init?.method ?? 'GET') + ' ' + new URL(String(url)).pathname); return r.transport.fetch(url, init); } };
  const controller = createTaskSaveOutcomes({ strategy: legacyStrategy(spy) });
  let first: TaskSaveOperation | undefined, callsAtFirst = -1;
  const off = controller.subscribe(() => { if (!first) { first = controller.list()[0]; callsAtFirst = calls.length; } });
  const sub = started(controller.submit(input(loaded, { notes: 'registrada' }))); off();
  assert.equal(callsAtFirst, 0, 'al registrarse todavía no había salido ninguna petición');
  assert.equal(first!.status, 'in_flight'); assert.equal(first!.phase, 'checking'); assert.equal(first!.taskId, 'task-2');
  assert.match(first!.attemptId, /^[0-9a-f-]{36}$/); assert.equal(first!.context.instanceId, loaded.context.instanceId); assert.equal(first!.context.snapshotId, loaded.context.snapshotId);
  assert.deepEqual(first!.patch, { notes: 'registrada' }); assert.equal(first!.fieldLabels.notes, 'Notas');
  const done = await sub.done; assert.equal(done.status, 'confirmed'); assert.equal(done.phase, 'done'); assert.ok(done.settledAt);
  assert.ok(calls.indexOf('PATCH /api/records/tasks/task-2') > calls.indexOf('GET /api/v2/records/tasks/task-2'), 'primero la comprobación previa, después el PATCH');
  assert.equal(r.patches.length, 1);
  // No se comparten referencias con el llamador: mutar lo que se le entregó no altera el registro del gestor.
  (loaded.record.values as Record<string, unknown>).notes = 'mutado'; assert.notEqual(controller.get(done.attemptId)!.baseline.values.notes, 'mutado');
}));

test('D7 cerrado: PATCH aplicado, ficha cerrada y acuse perdido → el gestor conserva el resultado INCIERTO, no reenvía, la verificación solo lee y aceptar es una decisión humana', () => withRig(async r => {
  const loaded = await open(r, 'task-2'), ack = heldAck(r.transport, true); let confirmed = 0;
  const controller = createTaskSaveOutcomes({ strategy: legacyStrategy(ack.transport), onConfirmed: async () => { confirmed++; await fetch(r.base + '/api/v2/records/tasks/task-2'); } });
  const sub = started(controller.submit(input(loaded, { status: 'completed' })));
  await ack.applied; assert.equal(r.store.changes().length, 1, 'el servidor ya lo aplicó');
  const unsubscribe = controller.subscribe(() => undefined); unsubscribe();                           // «la ficha se cierra»: nadie escucha
  ack.release(); const op = await sub.done;
  assert.equal(op.status, 'uncertain'); assert.notEqual(op.status as string, 'confirmed'); assert.equal(confirmed, 0);
  await sleep(300); assert.equal(r.patches.length, 1, 'sin reenvío automático'); assert.equal(controller.get(op.attemptId)!.status, 'uncertain', 'el seguimiento sigue en el propietario');
  assert.match(describeOperation(op).title, /No se sabe si se guardó/); assert.ok(patchLines(op).some(line => line.startsWith('Estado: completed')));
  const before = r.store.changes().length; await controller.verify(op.attemptId);
  const verified = controller.get(op.attemptId)!;
  assert.equal(verified.evidence?.kind, 'applied'); assert.equal(r.patches.length, 1); assert.equal(r.store.changes().length, before, 'verificar no escribe');
  assert.match(describeOperation(verified).lines.join(' '), /No distingue si los aplicó tu envío o una edición idéntica/); assert.ok(canAccept(verified));
  assert.equal(controller.accept(op.attemptId), true); await controller.whenIdle();
  const accepted = controller.get(op.attemptId)!;
  assert.equal(accepted.status, 'accepted', 'decisión humana, NO acuse del servidor'); assert.match(describeOperation(accepted).title, /aceptado por ti/); assert.equal(confirmed, 1); assert.equal(accepted.queue.status, 'ok'); assert.equal(r.patches.length, 1);
}));

test('PATCH confirmado DESPUÉS de cerrar la ficha: se notifica como confirmado y la cola se actualiza solo por lectura', () => withRig(async r => {
  const loaded = await open(r, 'task-2'), ack = heldAck(r.transport, false); const reads: string[] = [];
  const controller = createTaskSaveOutcomes({ strategy: legacyStrategy(ack.transport), onConfirmed: async record => { assert.ok(record); reads.push(record.id); const response = await fetch(r.base + '/api/v2/records/tasks/' + record.id); assert.equal(response.status, 200); } });
  const sub = started(controller.submit(input(loaded, { notes: 'tras cerrar' }))); await ack.applied;
  assert.equal(controller.get(sub.attemptId)!.phase, 'sent'); assert.equal(controller.get(sub.attemptId)!.status, 'in_flight');
  ack.release(); const op = await sub.done; await controller.whenIdle();
  assert.equal(controller.get(op.attemptId)!.status, 'confirmed'); assert.equal(controller.get(op.attemptId)!.queue.status, 'ok'); assert.deepEqual(reads, ['task-2']);
  assert.equal(r.patches.length, 1); assert.equal(r.store.changes().length, 1);
}));

test('la recarga de la cola falla: el guardado sigue CONFIRMADO; reintentar la lectura no escribe', () => withRig(async r => {
  const loaded = await open(r, 'task-2'); let failing = true, calls = 0;
  const controller = createTaskSaveOutcomes({ strategy: legacyStrategy(r.transport), onConfirmed: async () => { calls++; if (failing) throw new Error('cola caída'); } });
  const op = await started(controller.submit(input(loaded, { notes: 'x' }))).done; await controller.whenIdle();
  const after = controller.get(op.attemptId)!;
  assert.equal(after.status, 'confirmed'); assert.equal(after.queue.status, 'failed'); assert.match(describeOperation(after).lines.join(' '), /La cola de Hoy no se actualizó/);
  assert.equal(describeOperation(after).title.startsWith('Guardado confirmado'), true);
  failing = false; await controller.retryQueue(op.attemptId); assert.equal(controller.get(op.attemptId)!.queue.status, 'ok');
  assert.equal(calls, 2); assert.equal(r.patches.length, 1); assert.equal(r.store.changes().length, 1);
  // La cola que nunca responde se declara «no actualizada» a su tiempo; el guardado no cambia.
  const slow = createTaskSaveOutcomes({ strategy: legacyStrategy(r.transport), queueTimeoutMs: 40, onConfirmed: () => new Promise<void>(() => undefined) });
  const loaded2 = await open(r, 'task-3'); const op2 = await started(slow.submit(input(loaded2, { notes: 'y' }))).done; await slow.whenIdle();
  assert.equal(slow.get(op2.attemptId)!.status, 'confirmed'); assert.equal(slow.get(op2.attemptId)!.queue.status, 'failed'); assert.match(slow.get(op2.attemptId)!.queue.reason, /tardó demasiado/);
}));

test('PATCH que NUNCA llegó: no se declara guardado; la lectura dice «sin cambios»; reintentar es explícito y genera un intento nuevo', () => withRig(async r => {
  const loaded = await open(r, 'task-2'); const controller = createTaskSaveOutcomes({ strategy: legacyStrategy(dropPatch(r.transport)) });
  const op = await started(controller.submit(input(loaded, { notes: 'no llegó' }))).done;
  assert.equal(op.status, 'uncertain'); assert.equal(r.patches.length, 0); assert.equal(canRetry(op), false, 'sin evidencia no se reenvía');
  assert.deepEqual(controller.retry(op.attemptId), { kind: 'refused', reason: 'Reenviar solo es posible si consta que no se envió o la lectura la muestra sin el cambio.' });
  await controller.verify(op.attemptId); const verified = controller.get(op.attemptId)!;
  assert.equal(verified.evidence?.kind, 'unchanged'); assert.equal(verified.status, 'uncertain', 'ni siquiera «sin cambios» lo convierte en guardado'); assert.equal(canAccept(verified), false); assert.equal(r.patches.length, 0);
}));

test('reintento explícito tras «sin cambios»: nuevo intento, anterior sustituido, se parte del estado leído', () => withRig(async r => {
  const loaded = await open(r, 'task-2'); let healthy = false;
  const flaky: Transport = { ...r.transport, fetch: async (url, init) => { if (init?.method === 'PATCH' && !healthy) throw new TypeError('nunca salió'); return r.transport.fetch(url, init); } };
  const controller = createTaskSaveOutcomes({ strategy: legacyStrategy(flaky) });
  const first = await started(controller.submit(input(loaded, { notes: 'a reenviar' }))).done; await controller.verify(first.attemptId);
  assert.equal(canRetry(controller.get(first.attemptId)!), true); healthy = true;
  const retry = controller.retry(first.attemptId); assert.equal(retry.kind, 'started'); if (retry.kind !== 'started') return;
  const second = await retry.done; assert.equal(second.status, 'confirmed'); assert.equal(second.attemptNumber, 2); assert.equal(second.previousAttemptId, first.attemptId);
  assert.equal(controller.get(first.attemptId)!.supersededBy, second.attemptId); assert.equal(r.patches.length, 1); assert.equal(r.store.changes().length, 1);
  assert.equal(controller.retry(first.attemptId).kind, 'refused', 'el intento sustituido ya no se puede reenviar');
}));

test('cierre, otra tarea HOMÓNIMA y llegada tardía de la respuesta anterior: cada resultado queda unido a su ID y contexto', () => withRig(async r => {
  const a = await open(r, 'task-2'), b = await open(r, 'task-3'); assert.equal(a.record.values.subject, b.record.values.subject);
  const late = heldAck(r.transport, true); const controller = createTaskSaveOutcomes({ strategy: { save: (request, hooks) => legacyStrategy(request.taskId === 'task-2' ? late.transport : r.transport).save(request, hooks), verify: request => legacyStrategy(r.transport).verify(request) } });
  const subA = started(controller.submit(input(a, { notes: 'de A' }))); await late.applied;
  const subB = started(controller.submit(input(b, { notes: 'de B' }))); const opB = await subB.done;       // se abre otra tarea con el mismo nombre y se guarda
  assert.equal(opB.status, 'confirmed'); assert.equal(controller.get(subA.attemptId)!.status, 'in_flight');
  late.release(); const opA = await subA.done;                                                              // llega tarde (y se pierde)
  assert.equal(opA.status, 'uncertain'); assert.equal(controller.get(subB.attemptId)!.status, 'confirmed', 'la llegada tardía de A no toca a B');
  assert.notEqual(opA.attemptId, opB.attemptId); assert.equal(opA.taskId, 'task-2'); assert.equal(opB.taskId, 'task-3'); assert.notEqual(opA.taskLabel, opB.taskLabel, 'las etiquetas distinguen la ID');
  await controller.verify(opA.attemptId); assert.equal(controller.get(opA.attemptId)!.evidence?.record?.id, 'task-2'); assert.equal(controller.get(subB.attemptId)!.status, 'confirmed');
  assert.equal(r.store.record('tasks', 'task-3')!.values.notes, 'de B'); assert.equal(r.store.record('tasks', 'task-2')!.values.notes, 'de A');
}));

test('cambio de captura (mismo ID, otra fecha) o de instalación entre la operación y la comprobación: la tarea de OTRA copia no es evidencia', async () => {
  await withRig(async r => {
    const loaded = await open(r, 'task-2'), ack = heldAck(r.transport, true); const controller = createTaskSaveOutcomes({ strategy: legacyStrategy(ack.transport) });
    const sub = started(controller.submit(input(loaded, { status: 'completed' }))); await ack.applied; ack.release(); const op = await sub.done; assert.equal(op.status, 'uncertain');
    const next = makeFixture('agency'); next.id = loaded.context.snapshotId!; next.capturedAt = '2026-11-09T09:00:00.000Z';       // misma ID, otra fecha
    r.store.importSnapshot(next, true); r.store.saveGeneration(makeDemoSpec(next), { provider: 'demo', model: null, generatedAt: '2026-11-02T09:00:00Z', prompt: '', approved: false }); r.store.activate();
    const patchesBefore = r.patches.length; await controller.verify(op.attemptId); const verified = controller.get(op.attemptId)!;
    assert.equal(verified.evidence?.kind, 'context-changed'); assert.equal(canAccept(verified), false); assert.equal(canRetry(verified), false);
    assert.equal(controller.accept(op.attemptId), false); assert.equal(controller.retry(op.attemptId).kind, 'refused'); assert.equal(r.patches.length, patchesBefore);
    assert.match(describeOperation(verified).lines.join(' '), /otra copia y no sirve como evidencia/);
  });
  const one = await rig(), two = await rig();
  try {
    const loaded = await open(one, 'task-2'), ack = heldAck(one.transport, true);
    const controller = createTaskSaveOutcomes({ strategy: { save: (request, hooks) => legacyStrategy(ack.transport).save(request, hooks), verify: request => legacyStrategy(two.transport).verify(request) } });   // la comprobación apunta a OTRA instalación
    two.store.saveRecord('tasks', { status: 'completed' }, 'task-2');                                                  // que tiene, por su cuenta, el mismo valor
    const sub = started(controller.submit(input(loaded, { status: 'completed' }))); await ack.applied; ack.release(); const op = await sub.done;
    await controller.verify(op.attemptId); assert.equal(controller.get(op.attemptId)!.evidence?.kind, 'context-changed'); assert.equal(two.patches.length, 0);
  } finally { await one.close(); await two.close(); }
});

test('doble envío y dos tareas: el gestor rechaza el segundo envío de una tarea sin resolver; qué sigue dependiendo del servidor', () => withRig(async r => {
  const a = await open(r, 'task-2'), b = await open(r, 'task-3'); const barrier = heldRequest(r.transport);
  const controller = createTaskSaveOutcomes({ strategy: legacyStrategy(barrier.transport) });
  const first = controller.submit(input(a, { notes: 'uno' })), dbl = controller.submit(input(a, { notes: 'uno' }));         // doble clic / dos fichas de la misma tarea
  assert.equal(first.kind, 'started'); assert.equal(dbl.kind, 'busy'); assert.equal((dbl as { existing: TaskSaveOperation }).existing.attemptId, (first as { attemptId: string }).attemptId);
  const other = controller.submit(input(b, { notes: 'otra tarea' })); assert.equal(other.kind, 'started', 'otra tarea no queda bloqueada');
  await barrier.reached; barrier.release(); await Promise.all([(first as { done: Promise<unknown> }).done, (other as { done: Promise<unknown> }).done]);
  assert.equal(r.patches.length, 2, 'un PATCH por tarea; el doble envío no salió');
  // Tras resolverse, una edición posterior es legítima.
  const again = controller.submit(input(await open(r, 'task-2'), { notes: 'dos' })); assert.equal(again.kind, 'started'); await (again as { done: Promise<unknown> }).done; assert.equal(r.patches.length, 3);
  // Un intento INCIERTO sin resolver también bloquea el siguiente envío (no hay reenvío implícito); descartarlo es decisión de la persona.
  const lostCtl = createTaskSaveOutcomes({ strategy: legacyStrategy(dropPatch(r.transport)) }); const loaded3 = await open(r, 'task-3');
  const unc = await started(lostCtl.submit(input(loaded3, { notes: 'x' }))).done; assert.equal(unc.status, 'uncertain');
  assert.equal(lostCtl.submit(input(loaded3, { notes: 'x' })).kind, 'busy'); assert.equal(lostCtl.dismiss(unc.attemptId), true); assert.equal(lostCtl.submit(input(loaded3, { notes: 'x' })).kind, 'started');
}));

test('LÍMITE del gestor: dos propietarios (dos pestañas) guardando el mismo campo a la vez confirman los dos y gana el último; eso depende del servidor (sin CAS en la API antigua)', () => withRig(async r => {
  const a = await open(r, 'task-2'), b = await open(r, 'task-2'); let sent = 0; const barrier = gate();
  const sync: Transport = { ...r.transport, fetch: async (url, init) => { if (init?.method === 'PATCH') { if (++sent === 2) barrier.release(); await barrier.promise; } return r.transport.fetch(url, init); } };
  const one = createTaskSaveOutcomes({ strategy: legacyStrategy(sync) }), two = createTaskSaveOutcomes({ strategy: legacyStrategy(sync) });
  const [x, y] = await Promise.all([started(one.submit(input(a, { notes: 'pestaña 1' }))).done, started(two.submit(input(b, { notes: 'pestaña 2' }))).done]);
  assert.deepEqual([x.status, y.status], ['confirmed', 'confirmed']); assert.equal(r.patches.length, 2); assert.equal(r.store.changes().length, 2);
}));

test('401 / 404 / 409 / 422 / tiempo agotado: cada uno con su estado honesto; lo escrito se conserva; nada se reintenta solo', async () => {
  await withRig(async r => {
    const loaded = await open(r, 'task-2'), controller = createTaskSaveOutcomes({ strategy: legacyStrategy(r.transport) });
    const e422 = await started(controller.submit(input(loaded, { contact_id: 'contact-no-existe' }))).done;
    assert.equal(e422.status, 'rejected'); assert.equal(e422.detail.httpStatus, 422); assert.match(e422.detail.fields!.contact_id, /no existe/); assert.deepEqual(e422.patch, { contact_id: 'contact-no-existe' });
    assert.equal(r.store.changes().length, 0); assert.equal(canRetry(e422), false);
    r.store.set('returnBusy', true); const e409 = await started(controller.submit(input(loaded, { notes: 'durante la devolución' }))).done;
    assert.equal(e409.status, 'rejected'); assert.equal(e409.detail.httpStatus, 409); assert.equal(r.store.changes().length, 0); r.store.set('returnBusy', false);
    assert.equal(r.patches.length, 2, 'una petición por intento, ninguna repetición automática');
    // 404 detectado en la comprobación previa (no se envió) y 404 devuelto por el propio PATCH (se envió, el servidor rechazó).
    const l404 = await open(r, 'task-3'); r.store.db.prepare("DELETE FROM records WHERE entity='tasks' AND id='task-3'").run();
    const n404 = await started(controller.submit(input(l404, { notes: 'x' }))).done; assert.equal(n404.status, 'not_sent'); assert.equal(n404.detail.kind, 'missing');
    const l404b = await open(r, 'task-4'); const patchesBefore = r.patches.length;
    const racing: Transport = { ...r.transport, fetch: async (url, init) => { if (init?.method === 'PATCH') r.store.db.prepare("DELETE FROM records WHERE entity='tasks' AND id='task-4'").run(); return r.transport.fetch(url, init); } };
    const p404 = await started(createTaskSaveOutcomes({ strategy: legacyStrategy(racing) }).submit(input(l404b, { notes: 'x' }))).done;
    assert.equal(p404.status, 'rejected'); assert.equal(p404.detail.httpStatus, 404); assert.equal(r.patches.length, patchesBefore + 1); assert.equal(r.store.records('tasks').some(t => t.id === 'task-4'), false, 'un 404 no recrea la tarea');
  });
  await withRig(async r => {
    const loaded = await open(r, 'task-2');
    const cookie = /planb_session=[a-f0-9]+/.exec((await r.app.inject({ method: 'POST', url: '/api/v2/auth/setup', payload: { password: 'una contraseña local larga' } })).headers['set-cookie'] as string)![0];
    const n401 = await started(createTaskSaveOutcomes({ strategy: legacyStrategy(r.transport) }).submit(input(loaded, { notes: 'bloqueado' }))).done;   // sin cookie: la comprobación previa da 401
    assert.equal(n401.status, 'not_sent'); assert.equal(n401.detail.kind, 'locked'); assert.equal(r.patches.length, 0);
    const half: Transport = { ...r.transport, fetch: (url, init) => r.transport.fetch(url, init?.method === 'PATCH' ? init : { ...init, headers: { ...(init?.headers as object), Cookie: cookie } }) };   // la sesión cae entre la comprobación y el PATCH
    const p401 = await started(createTaskSaveOutcomes({ strategy: legacyStrategy(half) }).submit(input(loaded, { notes: 'bloqueado' }))).done;
    assert.equal(p401.status, 'rejected'); assert.equal(p401.detail.httpStatus, 401); assert.equal(r.store.changes().length, 0); assert.deepEqual(p401.patch, { notes: 'bloqueado' });
  });
  await withRig(async r => {
    const loaded = await open(r, 'task-2'); const slow: Transport = { ...r.transport, writeTimeoutMs: 40, readTimeoutMs: 40, fetch: (url, init) => init?.method === 'PATCH' ? new Promise<Response>(() => undefined) : r.transport.fetch(url, init) };
    const controller = createTaskSaveOutcomes({ strategy: legacyStrategy(slow) }); const op = await started(controller.submit(input(loaded, { notes: 'lento' }))).done;
    assert.equal(op.status, 'uncertain'); assert.equal(r.patches.length, 0);
    const hang: Transport = { ...slow, fetch: () => new Promise<Response>(() => undefined) };
    const verifier = createTaskSaveOutcomes({ strategy: { save: (q, h) => legacyStrategy(slow).save(q, h), verify: q => legacyStrategy(hang).verify(q) } });
    const op2 = await started(verifier.submit(input(await open(r, 'task-3'), { notes: 'lento 2' }))).done; await verifier.verify(op2.attemptId);
    assert.equal(verifier.get(op2.attemptId)!.evidence?.kind, 'unknown'); assert.equal(verifier.get(op2.attemptId)!.status, 'uncertain', 'una lectura que agota su tiempo no resuelve nada');
  });
});

test('cancelar la interfaz ≠ deshacer el PATCH; desmontar no detiene el seguimiento; recargar la app lo pierde (límite real)', () => withRig(async r => {
  const loaded = await open(r, 'task-2'), abort = new AbortController(); let dispatchedAbort = false;
  const transport: Transport = { ...r.transport, fetch: (url, init) => { if (init?.method === 'PATCH' && !dispatchedAbort) { dispatchedAbort = true; abort.abort(); } return r.transport.fetch(url, init); } };
  const controller = createTaskSaveOutcomes({ strategy: legacyStrategy(transport) });
  const op = await started(controller.submit(input(loaded, { notes: 'abortada tras salir' }, { signal: abort.signal }))).done;
  assert.equal(op.status, 'confirmed', 'abortar tras enviar no cancela ni cambia el resultado'); assert.equal(r.store.changes().length, 1);
  const pre = new AbortController(); pre.abort();
  const before = await started(controller.submit(input(await open(r, 'task-3'), { notes: 'abortada antes' }, { signal: pre.signal }))).done; assert.equal(before.status, 'not_sent'); assert.equal(r.patches.length, 1);
  let notified = 0; const unsubscribe = controller.subscribe(() => { notified++; }); unsubscribe(); const seen = notified;
  await controller.verify('no-existe'); assert.equal(notified, seen, 'sin suscriptores no se notifica a nadie, pero el estado sigue en el gestor'); assert.equal(controller.list().length, 2);
  assert.equal(createTaskSaveOutcomes({ strategy: legacyStrategy(r.transport) }).list().length, 0, 'un gestor nuevo (recarga/cierre de la app) no recuerda nada: el seguimiento es solo memoria');
}));

test('tope de operaciones: solo se descartan las resueltas; las que necesitan atención no se pierden', () => withRig(async r => {
  const controller = createTaskSaveOutcomes({ strategy: legacyStrategy(r.transport), maxOperations: 2 });
  for (let i = 0; i < 3; i++) await started(controller.submit(input(await open(r, 'task-' + (2 + i)), { notes: 'n' + i }))).done;
  assert.ok(controller.list().length <= 2); assert.ok(controller.list().every(op => op.status === 'confirmed'));
  const lost = createTaskSaveOutcomes({ strategy: legacyStrategy(dropPatch(r.transport)), maxOperations: 1 });
  for (const id of ['task-2', 'task-3']) await started(lost.submit(input(await open(r, id), { notes: 'z' }))).done;
  assert.equal(lost.list().length, 2, 'dos inciertas superan el tope y ninguna se pierde');
}));

test('el propietario sobrevive a la navegación: un guardado confirmado SIN vista de Hoy espera; al registrarse la vista solo se LEE la cola (una vez) y no se reescribe', () => withRig(async r => {
  const loaded = await open(r, 'task-2'); const reads: string[] = [];
  const controller = createTaskSaveOutcomes({ strategy: legacyStrategy(r.transport) });                      // Hoy no está montada: no hay onConfirmed
  const op = await started(controller.submit(input(loaded, { notes: 'sin vista de Hoy' }))).done; await controller.whenIdle();
  let current = controller.get(op.attemptId)!;
  assert.equal(current.status, 'confirmed'); assert.equal(current.queue.status, 'idle'); assert.match(current.queue.reason, /esperando una vista de Hoy/); assert.match(describeOperation(current).lines.join(' '), /se actualizará cuando vuelvas/);
  controller.setOnConfirmed(async record => { assert.ok(record); reads.push(record.id); await fetch(r.base + '/api/v2/records/tasks/' + record.id); });   // el usuario vuelve a Hoy
  await controller.whenIdle(); current = controller.get(op.attemptId)!;
  assert.equal(current.queue.status, 'ok'); assert.deepEqual(reads, ['task-2']); assert.equal(r.patches.length, 1);
  controller.setOnConfirmed(null); controller.setOnConfirmed(async () => { reads.push('otra vez'); });      // volver a montar no repite lecturas ya hechas
  await controller.whenIdle(); assert.deepEqual(reads, ['task-2']);
}));

// ---------------------------------------------------------------------------------------------------------------------------
// R2 de 147 (F1): `retry` debe compartir con `submit` la MISMA exclusión por tarea y copia. Casos causales: fallan con la versión anterior.
/** La primera lectura (comprobación previa) recibe un 503 ficticio; el resto llega al servidor real. */
const failFirstRead = (base: Transport): Transport => { let failed = false; return { ...base, fetch: async (url, init) => { if (!failed && (init?.method ?? 'GET') === 'GET') { failed = true; return Response.json({ error: 'fallo ficticio de la comprobación' }, { status: 503 }); } return base.fetch(url, init); } }; };
const snapshotOf = (c: ReturnType<typeof createTaskSaveOutcomes>) => JSON.stringify(c.list());

test('F1: intento A «no enviado» + intento B nuevo en vuelo + reintentar A → BUSY: ningún segundo PATCH, A y B intactos; B confirma y no hay dos cambios', () => withRig(async r => {
  const loaded = await open(r, 'task-2'), barrier = heldRequest(failFirstRead(r.transport)); const controller = createTaskSaveOutcomes({ strategy: legacyStrategy(barrier.transport) });
  const a = await started(controller.submit(input(loaded, { notes: 'A-antiguo' }))).done; assert.equal(a.status, 'not_sent'); assert.equal(r.patches.length, 0);
  const b = started(controller.submit(input(loaded, { status: 'completed' }))); await barrier.reached;                // B (comprobada) llega al transporte y queda retenido
  assert.equal(controller.submit(input(loaded, { notes: 'C' })).kind, 'busy', 'control: submit respeta la exclusión');
  const before = snapshotOf(controller); const retry = controller.retry(a.attemptId);
  assert.equal(retry.kind, 'busy', 'retry debe compartir la exclusión de submit'); assert.equal((retry as { existing: TaskSaveOperation }).existing.attemptId, b.attemptId);
  assert.equal(snapshotOf(controller), before, 'el rechazo no registra un intento nuevo ni altera A (supersededBy) ni B');
  assert.equal(controller.get(a.attemptId)!.supersededBy, null); assert.equal(controller.get(a.attemptId)!.status, 'not_sent');
  barrier.release(); const done = await b.done; await controller.whenIdle();
  assert.equal(done.status, 'confirmed'); assert.equal(r.patches.length, 1, 'un solo PATCH'); assert.equal(r.store.changes().length, 1);
  assert.equal(canRetry(controller.get(a.attemptId)!), true, 'A sigue siendo reintentable cuando B se resuelve');
}));

test('F1: el intento nuevo está INCIERTO (sin resolver) → reintentar el antiguo «no enviado» también es busy', () => withRig(async r => {
  const loaded = await open(r, 'task-2'); let phase: 'preflight' | 'lost' = 'preflight';
  const flaky: Transport = { ...r.transport, fetch: async (url, init) => {
    if (phase === 'preflight' && (init?.method ?? 'GET') === 'GET') { phase = 'lost'; return Response.json({ error: 'x' }, { status: 503 }); }
    if (init?.method === 'PATCH') throw new TypeError('nunca salió'); return r.transport.fetch(url, init); } };
  const controller = createTaskSaveOutcomes({ strategy: legacyStrategy(flaky) });
  const a = await started(controller.submit(input(loaded, { notes: 'A' }))).done; assert.equal(a.status, 'not_sent');
  const b = await started(controller.submit(input(loaded, { status: 'completed' }))).done; assert.equal(b.status, 'uncertain');
  const before = snapshotOf(controller); assert.equal(controller.retry(a.attemptId).kind, 'busy'); assert.equal(snapshotOf(controller), before); assert.equal(r.patches.length, 0);
  assert.equal(controller.dismiss(b.attemptId), true);                                                                // la persona resuelve la incierta…
  assert.equal(controller.retry(a.attemptId).kind, 'started', '…y entonces sí puede reintentar A');
}));

test('F1: dos clics de reintento sobre el mismo intento, y dos intentos «no enviados» de la misma tarea: solo uno avanza', () => withRig(async r => {
  const loaded = await open(r, 'task-2'); let failing = true;                                                         // mientras `failing`, toda comprobación previa falla (503 ficticio)
  const failTwice: Transport = { ...r.transport, fetch: async (url, init) => { if (failing && (init?.method ?? 'GET') === 'GET') return Response.json({ error: 'x' }, { status: 503 }); return r.transport.fetch(url, init); } };
  const barrier = heldRequest(failTwice); const controller = createTaskSaveOutcomes({ strategy: legacyStrategy(barrier.transport) });
  const a1 = await started(controller.submit(input(loaded, { notes: 'uno' }))).done; const a2 = await started(controller.submit(input(loaded, { status: 'completed' }))).done;
  assert.deepEqual([a1.status, a2.status], ['not_sent', 'not_sent']); failing = false;
  const first = controller.retry(a1.attemptId); assert.equal(first.kind, 'started');
  assert.equal(controller.retry(a1.attemptId).kind, 'refused', 'segundo clic sobre el mismo intento: ya sustituido');
  const other = controller.retry(a2.attemptId); assert.equal(other.kind, 'busy', 'otro intento no enviado de la misma tarea: busy'); assert.equal(controller.get(a2.attemptId)!.supersededBy, null);
  await barrier.reached; barrier.release(); await (first as { done: Promise<unknown> }).done; await controller.whenIdle(); assert.equal(r.patches.length, 1);
}));

test('F1: otra TAREA o otra COPIA (contexto distinto) sí pueden avanzar mientras tanto; solo se excluye la misma tarea y copia', () => withRig(async r => {
  const a2 = await open(r, 'task-2'), a3 = await open(r, 'task-3'), barrier = heldRequest(failFirstRead(r.transport)); const controller = createTaskSaveOutcomes({ strategy: legacyStrategy(barrier.transport) });
  const notSent = await started(controller.submit(input(a2, { notes: 'A' }))).done; assert.equal(notSent.status, 'not_sent');
  const other = started(controller.submit(input(a3, { notes: 'otra tarea' }))); await barrier.reached;                // task-3 retenida
  const retry = controller.retry(notSent.attemptId); assert.equal(retry.kind, 'started', 'task-2 no depende de task-3');
  barrier.release(); await Promise.all([other.done, (retry as { done: Promise<unknown> }).done]); assert.equal(r.patches.length, 2);
  // Misma tarea con OTRA copia (contexto distinto): otra clave, no hay exclusión.
  const ctl2 = createTaskSaveOutcomes({ strategy: legacyStrategy(heldRequest(r.transport).transport) });
  const held = ctl2.submit(input(a2, { notes: 'copia 1' })); assert.equal(held.kind, 'started');
  assert.equal(ctl2.submit(input(a2, { notes: 'copia 2' }, { context: { ...a2.context, capturedAt: '2031-01-01T00:00:00.000Z' } })).kind, 'started', 'otra copia no queda bloqueada');
  assert.equal(ctl2.submit(input(a2, { notes: 'copia 1 otra vez' })).kind, 'busy');
}));

test('F1: retry y submit en el MISMO turno (sin esperar) y verificar durante un reintento: una sola operación avanza y no se escribe dos veces', () => withRig(async r => {
  const loaded = await open(r, 'task-2'); let failing = true;
  const transport: Transport = { ...r.transport, fetch: async (url, init) => { if (failing && (init?.method ?? 'GET') === 'GET') return Response.json({ error: 'x' }, { status: 503 }); return r.transport.fetch(url, init); } };
  const controller = createTaskSaveOutcomes({ strategy: legacyStrategy(heldRequest(transport).transport) });
  const a = await started(controller.submit(input(loaded, { notes: 'A' }))).done; assert.equal(a.status, 'not_sent'); failing = false;
  const retry = controller.retry(a.attemptId), submit = controller.submit(input(loaded, { status: 'completed' }));        // mismo turno: el registro es síncrono
  assert.equal(retry.kind, 'started'); assert.equal(submit.kind, 'busy', 'el submit posterior ve la operación que el retry acaba de registrar');
  assert.equal(controller.list().filter(op => !op.supersededBy && (op.status === 'in_flight' || op.status === 'uncertain')).length, 1);
  assert.equal(controller.retry(a.attemptId).kind, 'refused'); assert.equal(r.patches.length, 0, 'ninguna escritura aún (la primera sigue retenida)');
}));

// ---------------------------------------------------------------------------------------------------------------------------
// ADOPCIÓN DE 128 (solo lectura de sus fuentes, aceptadas). El adaptador vive aquí, en una prueba: el gestor no cambia.
interface RevisionView { revision: string; instanceId: string; captureId: string; capturedAt: string; record: { id: string; entity: string; values: Record<string, unknown> }; }
function revisionStrategy(base: Transport): SaveStrategy {
  const url = (id: string) => base.base + '/api/v7/task-revision/' + encodeURIComponent(id);
  return {
    async save(request, hooks) {
      let response: Response;
      try { hooks.onDispatch(); response = await base.fetch(url(request.taskId), { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ expectedRevision: request.revision, values: request.patch }) }); }
      catch { return { kind: 'uncertain', message: 'No llegó el acuse; no se sabe si se aplicó.' } satisfies SaveOutcome; }
      const body = await response.json().catch(() => null) as { current?: RevisionView; error?: string; details?: { code?: string } } | null;
      if (response.status === 200 && body?.current) return { kind: 'saved', record: body.current.record as never } satisfies SaveOutcome;
      if (response.status === 401) return { kind: 'locked' } satisfies SaveOutcome;
      if (response.status === 404) return { kind: 'missing' } satisfies SaveOutcome;
      if (response.status === 422) return { kind: 'invalid', fields: {}, message: body?.error ?? 'Valores no válidos.' } satisfies SaveOutcome;
      if (response.status >= 400 && response.status < 500) return { kind: 'rejected', status: response.status, message: body?.error ?? 'Rechazado.', revisionConflict: body?.details?.code === 'TASK_REVISION_CHANGED' } as SaveOutcome;
      return { kind: 'uncertain', message: 'Error del servidor (' + response.status + '); no se sabe si se aplicó.' } satisfies SaveOutcome;
    },
    async verify(request): Promise<Verification> {
      try {
        const response = await base.fetch(url(request.taskId)); if (response.status === 401) return { kind: 'locked' }; if (response.status === 404) return { kind: 'missing' }; if (!response.ok) return { kind: 'unknown' };
        const view = await response.json() as RevisionView;
        if (view.instanceId !== request.context.instanceId || view.captureId !== request.context.snapshotId || view.capturedAt !== request.context.capturedAt) return { kind: 'context-changed' };
        const record = view.record as never;
        return { kind: 'read', record, evidence: view.revision === request.revision ? 'unchanged' : judgeAfterUncertain(request.baseline, record, request.patch) };
      } catch { return { kind: 'unknown' }; }
    },
  };
}
const revisionOf = async (r: Rig, id: string) => (await (await fetch(r.base + '/api/v7/task-revision/' + id)).json()) as RevisionView;

test('128: guardar con expectedRevision confirma; un 409 de REVISIÓN se distingue de un 409 por devolución en curso; lo escrito se conserva', () => withRig(async r => {
  const loaded = await open(r, 'task-2'), view = await revisionOf(r, 'task-2'); const controller = createTaskSaveOutcomes({ strategy: revisionStrategy(r.transport) });
  const ok = await started(controller.submit(input(loaded, { notes: 'con revisión' }, { revision: view.revision }))).done; assert.equal(ok.status, 'confirmed'); assert.equal(r.store.changes().length, 1);
  // Otra edición cambia la tarea: el PATCH con la revisión antigua da 409 de revisión (antes de guardar), no una sobrescritura.
  const stale = await started(controller.submit(input(loaded, { notes: 'sobre revisión antigua' }, { revision: view.revision }))).done;
  assert.equal(stale.status, 'rejected'); assert.equal(stale.detail.httpStatus, 409); assert.equal(stale.detail.revisionConflict, true); assert.deepEqual(stale.patch, { notes: 'sobre revisión antigua' }); assert.equal(r.store.changes().length, 1);
  // Devolución en curso: también 409, pero NO de revisión.
  const fresh = await revisionOf(r, 'task-2'); r.store.set('returnBusy', true);
  const busy = await started(controller.submit(input(await open(r, 'task-2'), { notes: 'durante devolución' }, { revision: fresh.revision }))).done;
  assert.equal(busy.status, 'rejected'); assert.equal(busy.detail.httpStatus, 409); assert.notEqual(busy.detail.revisionConflict, true); r.store.set('returnBusy', false);
}, { revision: true }));

test('128: tras un acuse perdido que SÍ se aplicó, reenviar con la revisión antigua da 409 (no duplica); sin idempotencia por intención, y un valor coincidente sigue sin probar autoría', () => withRig(async r => {
  const loaded = await open(r, 'task-2'), view = await revisionOf(r, 'task-2'), ack = heldAck(r.transport, true);
  const controller = createTaskSaveOutcomes({ strategy: revisionStrategy(ack.transport) });
  const sub = started(controller.submit(input(loaded, { status: 'completed' }, { revision: view.revision }))); await ack.applied; ack.release(); const op = await sub.done;
  assert.equal(op.status, 'uncertain'); assert.equal(r.store.changes().length, 1);
  await controller.verify(op.attemptId); assert.equal(controller.get(op.attemptId)!.evidence?.kind, 'applied', 'la revisión cambió y los valores coinciden');
  assert.equal(controller.retry(op.attemptId).kind, 'refused', 'el gestor tampoco ofrece reenviar un guardado aplicado');
  // Aunque se forzara el reenvío, el servidor lo frena: la protección es de 128, no del gestor.
  const forced = await revisionStrategy(r.transport).save({ taskId: 'task-2', baseline: loaded.record, entity: loaded.schema!.entity, patch: { status: 'completed' }, context: loaded.context, revision: view.revision }, { onDispatch: () => undefined });
  assert.equal(forced.kind, 'rejected'); assert.equal((forced as { status: number }).status, 409); assert.equal(r.store.changes().length, 1);
  // Una edición idéntica de OTRA persona produce la misma evidencia «applied»: no se distingue autoría.
  const other = await open(r, 'task-3'), otherView = await revisionOf(r, 'task-3'); r.store.saveRecord('tasks', { status: 'completed' }, 'task-3');
  const c2 = createTaskSaveOutcomes({ strategy: revisionStrategy(dropPatch(r.transport)) });   // el PATCH de esta persona no llega; la otra persona ya escribió el mismo valor
  const op2 = await started(c2.submit(input(other, { status: 'completed' }, { revision: otherView.revision }))).done; await c2.verify(op2.attemptId);
  assert.equal(c2.get(op2.attemptId)!.evidence?.kind, 'applied', 'valores coincidentes y revisión distinta: aplicado por QUIEN sea');
  assert.equal(r.store.changes().filter(c => c.recordId === 'task-3').length, 1, 'el cambio lo hizo la otra persona, y la evidencia es la misma');
}, { revision: true }));

test('128: «sin cambios» (changed:false) no deja historial y no es un guardado nuevo; y 128 no cubre las rutas antiguas (siguen escribiendo sin revisión)', () => withRig(async r => {
  const loaded = await open(r, 'task-2'), view = await revisionOf(r, 'task-2');
  const noop = await fetch(r.base + '/api/v7/task-revision/task-2', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ expectedRevision: view.revision, values: { status: loaded.record.values.status } }) });
  assert.equal(noop.status, 200); assert.equal((await noop.json() as { changed: boolean }).changed, false); assert.equal(r.store.changes().length, 0);
  const legacy = await fetch(r.base + '/api/records/tasks/task-2', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ values: { notes: 'ruta antigua' } }) });
  assert.equal(legacy.status, 200, 'la ruta antigua sigue aceptando escrituras sin revisión'); assert.notEqual((await revisionOf(r, 'task-2')).revision, view.revision, 'y cambia la revisión: el siguiente guardado condicional recibe 409');
}, { revision: true }));

// ═══ 170 · ciclo de vida del gestor (dispose), sustitución del consumidor y razones seguras ═══════════════════════════════════════════
// Todas las fronteras de carrera se fijan con barreras deterministas sobre el servidor REAL; ninguna usa esperas para «dar tiempo».
const unhandled: unknown[] = []; process.on('unhandledRejection', reason => { unhandled.push(reason); });
const deferred = <T = void>() => { let resolve!: (value: T) => void, reject!: (reason: unknown) => void; const promise = new Promise<T>((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const tick = () => new Promise<void>(resolve => setImmediate(resolve));
/** Retiene la PRIMERA lectura de la comprobación previa (GET del registro) hasta soltar la barrera. */
function heldCheck(base: Transport) {
  const barrier = gate(); let reached: () => void = () => undefined; const reachedPromise = new Promise<void>(resolve => { reached = resolve; });
  const transport: Transport = { ...base, fetch: async (url, init) => { if (!init?.method && String(url).includes('/api/v2/records/tasks/')) { reached(); await barrier.promise; } return base.fetch(url, init); } };
  return { transport, release: barrier.release, reached: reachedPromise };
}
/** Estrategia que espera una barrera ANTES de comprobar o ENTRE sus comprobaciones y la escritura (como hará la de 128). */
function gatedStrategy(base: Transport, where: 'before-check' | 'before-dispatch') {
  const inner = legacyStrategy(base), barrier = gate(); let reached: () => void = () => undefined; const reachedPromise = new Promise<void>(resolve => { reached = resolve; });
  const strategy: SaveStrategy = {
    verify: request => inner.verify(request),
    save: async (request, hooks) => {
      if (where === 'before-check') { reached(); await barrier.promise; return inner.save(request, hooks); }
      // Comprobaciones reales, luego espera y SOLO entonces la escritura a través de la puerta onDispatch.
      const fresh = await loadTask(request.taskId, new AbortController().signal, base);
      if (fresh.kind !== 'ok') return { kind: 'preflight-failed', message: 'x' };
      reached(); await barrier.promise; hooks.onDispatch();
      await base.fetch(base.base + '/api/records/tasks/' + request.taskId, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ values: request.patch }) });
      return { kind: 'uncertain', message: 'El PATCH salió' };
    },
  };
  return { strategy, release: barrier.release, reached: reachedPromise };
}

test('170 dispose ANTES de comprobar: la operación queda «no enviada» (sesión terminada) y ningún PATCH sale aunque la estrategia siga después', () => withRig(async r => {
  const loaded = await open(r, 'task-2'), held = gatedStrategy(r.transport, 'before-check'); let confirmed = 0;
  const controller = createTaskSaveOutcomes({ strategy: held.strategy, onConfirmed: async () => { confirmed++; } });
  const sub = started(controller.submit(input(loaded, { notes: 'antes de comprobar' }))); await held.reached;
  const summary = controller.dispose(); assert.deepEqual(summary, { notDispatched: 1, dispatched: 0 });
  const op = controller.get(sub.attemptId)!; assert.equal(op.status, 'not_sent'); assert.equal(op.detail.kind, 'disposed'); assert.notEqual(op.phase, 'sent');
  held.release(); const done = await sub.done; await controller.whenIdle();
  assert.equal(done.status, 'not_sent'); assert.equal(done.detail.kind, 'disposed', 'la respuesta tardía de la estrategia no reescribe lo asentado');
  assert.equal(r.patches.length, 0); assert.equal(r.store.changes().length, 0); assert.equal(confirmed, 0);
}));

test('170 dispose DURANTE la comprobación (lectura retenida): no se envía nada; la lectura abortada no desemboca en un PATCH', () => withRig(async r => {
  const loaded = await open(r, 'task-2'), hold = heldCheck(r.transport);
  const controller = createTaskSaveOutcomes({ strategy: legacyStrategy(hold.transport) });
  const sub = started(controller.submit(input(loaded, { notes: 'durante la comprobación' }))); await hold.reached;
  assert.equal(controller.get(sub.attemptId)!.phase, 'checking'); assert.deepEqual(controller.dispose(), { notDispatched: 1, dispatched: 0 });
  hold.release(); const done = await sub.done;
  assert.equal(done.status, 'not_sent'); assert.equal(done.detail.kind, 'disposed'); assert.equal(r.patches.length, 0); assert.equal(r.store.changes().length, 0);
}));

test('170 dispose JUSTO ANTES del PATCH (las comprobaciones ya pasaron): la puerta de onDispatch rechaza la escritura aunque ninguna lectura siga abortable', () => withRig(async r => {
  const loaded = await open(r, 'task-2'), held = gatedStrategy(r.transport, 'before-dispatch');
  const controller = createTaskSaveOutcomes({ strategy: held.strategy });
  const sub = started(controller.submit(input(loaded, { notes: 'justo antes' }))); await held.reached;
  assert.equal(controller.get(sub.attemptId)!.phase, 'checking', 'las lecturas terminaron pero la escritura no se despachó');
  assert.deepEqual(controller.dispose(), { notDispatched: 1, dispatched: 0 }); held.release(); const done = await sub.done;
  assert.equal(done.status, 'not_sent'); assert.equal(done.detail.kind, 'disposed'); assert.equal(r.patches.length, 0); assert.equal(r.store.changes().length, 0);
}));

test('170 dispose DESPUÉS de despachar (acuse retenido, el servidor ya aplicó): NO se presenta como cancelado ni deshecho; se asienta con la verdad y sin notificar', () => withRig(async r => {
  const loaded = await open(r, 'task-2'), ack = heldAck(r.transport, false); let confirmed = 0, notified = 0;
  const controller = createTaskSaveOutcomes({ strategy: legacyStrategy(ack.transport), onConfirmed: async () => { confirmed++; } }); controller.subscribe(() => { notified++; });
  const sub = started(controller.submit(input(loaded, { status: 'completed' }))); await ack.applied;
  assert.equal(controller.get(sub.attemptId)!.phase, 'sent'); const before = notified;
  assert.deepEqual(controller.dispose(), { notDispatched: 0, dispatched: 1 });
  const mid = controller.get(sub.attemptId)!; assert.equal(mid.status, 'in_flight'); assert.equal(mid.phase, 'sent'); assert.notEqual(mid.detail.kind, 'disposed');
  ack.release(); const done = await sub.done; await controller.whenIdle();
  assert.equal(done.status, 'confirmed', 'el PATCH llegó: se registra como lo que fue'); assert.equal(r.patches.length, 1); assert.equal(r.store.changes().length, 1);
  assert.equal(confirmed, 0, 'ningún consumidor recibe el resultado de un propietario terminado'); assert.equal(notified, before, 'ni se notifica a suscriptores');
  assert.doesNotMatch(describeOperation(done).lines.join(' ') + describeOperation(done).title, /cancel|deshech|no se envi/i);
}));

test('170 dispose con el PATCH despachado y el acuse PERDIDO: queda incierto (no «cancelado»), sin reintento', () => withRig(async r => {
  const loaded = await open(r, 'task-2'), ack = heldAck(r.transport, true);
  const controller = createTaskSaveOutcomes({ strategy: legacyStrategy(ack.transport) });
  const sub = started(controller.submit(input(loaded, { status: 'completed' }))); await ack.applied; assert.deepEqual(controller.dispose(), { notDispatched: 0, dispatched: 1 });
  ack.release(); const done = await sub.done;
  assert.equal(done.status, 'uncertain'); assert.equal(r.patches.length, 1); assert.equal(r.store.changes().length, 1);
  assert.equal(controller.retry(sub.attemptId).kind, 'refused'); assert.equal(r.patches.length, 1);
}));

test('170 un PATCH despachado y retenido ANTES de llegar al servidor no se cancela al terminar: sale y se cuenta como despachado', () => withRig(async r => {
  const loaded = await open(r, 'task-2'), req = heldRequest(r.transport);
  const controller = createTaskSaveOutcomes({ strategy: legacyStrategy(req.transport) });
  const sub = started(controller.submit(input(loaded, { notes: 'ya despachado' }))); await req.reached;
  assert.deepEqual(controller.dispose(), { notDispatched: 0, dispatched: 1 }); assert.equal(r.patches.length, 0, 'aún no llegó');
  req.release(); const done = await sub.done; assert.equal(done.status, 'confirmed'); assert.equal(r.patches.length, 1);
}));

test('170 dispose es idempotente y deja al gestor cerrado: rechaza nuevas operaciones y reintentos; verificar, aceptar, reintentar la cola y registrar no hacen nada', () => withRig(async r => {
  const loaded = await open(r, 'task-2'), ack = heldAck(r.transport, true); let notified = 0, consumer = 0;
  const controller = createTaskSaveOutcomes({ strategy: legacyStrategy(ack.transport) }); controller.subscribe(() => { notified++; });
  const sub = started(controller.submit(input(loaded, { status: 'completed' }))); await ack.applied; ack.release(); const op = await sub.done; assert.equal(op.status, 'uncertain');
  const first = controller.dispose(), second = controller.dispose(); assert.equal(second, first); assert.deepEqual(first, { notDispatched: 0, dispatched: 1 });
  const after = controller.submit(input(await open(r, 'task-3'), { notes: 'tras terminar' })); assert.equal(after.kind, 'refused'); assert.match((after as { reason: string }).reason, /sesión terminó/);
  assert.equal(controller.retry(sub.attemptId).kind, 'refused');
  const calls = r.patches.length; const mark = notified;
  await controller.verify(sub.attemptId); assert.equal(controller.get(sub.attemptId)!.verifying, false); assert.equal(controller.accept(sub.attemptId), false);
  await controller.retryQueue(sub.attemptId); controller.setOnConfirmed(async () => { consumer++; }); await controller.whenIdle();
  assert.equal(consumer, 0); assert.equal(notified, mark); assert.equal(r.patches.length, calls);
  const off = controller.subscribe(() => { notified++; }); off(); off();   // suscribirse tras terminar no falla ni notifica
  assert.equal(r.patches.length, calls, 'ni una sola petición de escritura tras dispose');
}));

test('170 un gestor NUEVO empieza vacío y las respuestas tardías del anterior no lo tocan ni llaman a su consumidor', () => withRig(async r => {
  const loaded = await open(r, 'task-2'), ack = heldAck(r.transport, false); const oldReads: string[] = [], newReads: string[] = [];
  const old = createTaskSaveOutcomes({ strategy: legacyStrategy(ack.transport), onConfirmed: async record => { assert.ok(record); oldReads.push(record.id); } });
  const sub = started(old.submit(input(loaded, { status: 'completed' }))); await ack.applied; old.dispose();
  const next = createTaskSaveOutcomes({ strategy: legacyStrategy(r.transport), onConfirmed: async record => { assert.ok(record); newReads.push(record.id); } });
  assert.equal(next.list().length, 0, 'nada se hereda ni se recupera'); ack.release(); await sub.done; await old.whenIdle(); await next.whenIdle();
  assert.equal(next.list().length, 0); assert.deepEqual(newReads, []); assert.deepEqual(oldReads, []); assert.equal(r.patches.length, 1);
}));

test('170 dispose con una recarga de cola en curso: su resultado (éxito o rechazo) se ignora sin rechazos sin manejar', () => withRig(async r => {
  const loaded = await open(r, 'task-2'), hold = deferred();
  const controller = createTaskSaveOutcomes({ strategy: legacyStrategy(r.transport), onConfirmed: async () => { await hold.promise; throw new Error('tarde: http://127.0.0.1/interno'); } });
  const op = await started(controller.submit(input(loaded, { notes: 'cola' }))).done; await tick(); assert.equal(controller.get(op.attemptId)!.queue.status, 'updating');
  controller.dispose(); hold.resolve(); await controller.whenIdle(); await tick();
  assert.equal(controller.get(op.attemptId)!.queue.status, 'updating', 'el propietario terminó: nadie atribuye ese resultado'); assert.equal(r.patches.length, 1);
}));

test('170 consumidor SUSTITUIDO durante la recarga: el rechazo tardío del anterior se descarta y el nuevo hace UNA lectura (solo lecturas, un PATCH)', () => withRig(async r => {
  const loaded = await open(r, 'task-2'), oldHold = deferred(); const calls: string[] = [];
  const controller = createTaskSaveOutcomes({ strategy: legacyStrategy(r.transport), onConfirmed: async () => { calls.push('viejo'); await oldHold.promise; throw new Error('Hoy se desmontó http://x'); } });
  const op = await started(controller.submit(input(loaded, { notes: 'sustituir' }))).done; await tick(); assert.equal(controller.get(op.attemptId)!.queue.status, 'updating');
  controller.setOnConfirmed(async () => { calls.push('nuevo'); });
  await controller.whenIdle(); assert.equal(controller.get(op.attemptId)!.queue.status, 'ok', 'lo valida el consumidor ACTUAL');
  oldHold.resolve(); await controller.whenIdle(); await tick();
  const q = controller.get(op.attemptId)!.queue; assert.equal(q.status, 'ok', 'el rechazo tardío del anterior no lo estropea'); assert.equal(q.reason, ''); assert.deepEqual(calls, ['viejo', 'nuevo']); assert.equal(r.patches.length, 1);
}));

test('170 consumidor SUSTITUIDO: el ÉXITO tardío del anterior no marca «ok» mientras el nuevo no haya completado su lectura', () => withRig(async r => {
  const loaded = await open(r, 'task-2'), oldHold = deferred(), newHold = deferred();
  const controller = createTaskSaveOutcomes({ strategy: legacyStrategy(r.transport), onConfirmed: async () => { await oldHold.promise; } });
  const op = await started(controller.submit(input(loaded, { notes: 'exito tardío' }))).done; await tick();
  controller.setOnConfirmed(async () => { await newHold.promise; }); await tick();
  oldHold.resolve(); await tick(); await tick(); assert.equal(controller.get(op.attemptId)!.queue.status, 'updating', 'el éxito del consumidor antiguo no cuenta');
  newHold.resolve(); await controller.whenIdle(); assert.equal(controller.get(op.attemptId)!.queue.status, 'ok'); assert.equal(r.patches.length, 1);
}));

test('170 consumidor RETIRADO (null) a mitad de recarga: vuelve a esperar a la siguiente vista; el resultado del anterior se ignora y el siguiente consumidor lee una sola vez', () => withRig(async r => {
  const loaded = await open(r, 'task-2'), oldHold = deferred(); let again = 0;
  const controller = createTaskSaveOutcomes({ strategy: legacyStrategy(r.transport), onConfirmed: async () => { await oldHold.promise; throw new Error('desmontada'); } });
  const op = await started(controller.submit(input(loaded, { notes: 'retirada' }))).done; await tick();
  controller.setOnConfirmed(null); assert.equal(controller.get(op.attemptId)!.queue.status, 'idle'); assert.match(controller.get(op.attemptId)!.queue.reason, /esperando una vista de Hoy/);
  oldHold.resolve(); await controller.whenIdle(); await tick(); assert.equal(controller.get(op.attemptId)!.queue.status, 'idle', 'el rechazo del consumidor retirado no la marca fallida');
  const cb = async () => { again++; }; controller.setOnConfirmed(cb); controller.setOnConfirmed(cb); await controller.whenIdle();
  assert.equal(again, 1, 'registrar la misma función dos veces no duplica la lectura'); assert.equal(controller.get(op.attemptId)!.queue.status, 'ok'); assert.equal(r.patches.length, 1);
}));

test('170 sin bucles: registrar muchas veces el mismo consumidor o sucesivos consumidores no relanza lecturas ya completadas', () => withRig(async r => {
  const loaded = await open(r, 'task-2'); let a = 0, b = 0;
  const controller = createTaskSaveOutcomes({ strategy: legacyStrategy(r.transport) });
  const op = await started(controller.submit(input(loaded, { notes: 'sin bucles' }))).done;
  const cbA = async () => { a++; }, cbB = async () => { b++; };
  controller.setOnConfirmed(cbA); await controller.whenIdle(); controller.setOnConfirmed(cbA); controller.setOnConfirmed(cbB); controller.setOnConfirmed(cbA); await controller.whenIdle();
  assert.equal(a, 1); assert.equal(b, 0, 'una operación ya validada por su consumidor no se relee por cambiar de consumidor'); assert.equal(controller.get(op.attemptId)!.queue.status, 'ok'); assert.equal(r.patches.length, 1);
}));

test('170 OutcomeRefreshError conserva una causa tipada y SEGURA; cualquier otro error da texto genérico sin copiar su mensaje', () => withRig(async r => {
  const mk = async (error: unknown) => {
    const loaded = await open(r, 'task-2'); const controller = createTaskSaveOutcomes({ strategy: legacyStrategy(r.transport), onConfirmed: async () => { throw error; } });
    const op = await started(controller.submit(input(loaded, { notes: 'razón ' + Math.random() }))).done; await controller.whenIdle(); return { op: controller.get(op.attemptId)!, text: describeOperation(controller.get(op.attemptId)!).lines.join(' ') };
  };
  const state = await mk(new OutcomeRefreshError('state')); assert.equal(state.op.queue.status, 'failed'); assert.equal(state.op.queue.cause, 'state'); assert.equal(state.op.queue.reason, 'No se pudo actualizar el estado de la aplicación'); assert.match(state.text, /No se pudo actualizar el estado de la aplicación/);
  const list = await mk(new OutcomeRefreshError('list')); assert.equal(list.op.queue.cause, 'list'); assert.equal(list.op.queue.reason, 'No se pudo actualizar la lista de Hoy'); assert.match(list.text, /No se pudo actualizar la lista de Hoy/);
  for (const hostile of [new Error('GET http://127.0.0.1:4331/api/v7/local-operations → 500: {"subject":"Llamar a Ana"}'), new TypeError('Failed to fetch https://interno/x'), 'texto suelto con datos', { refreshCause: 'state' }, Object.assign(new Error('falso'), { refreshCause: 'state' }), Object.assign(new Error('x'), { name: 'OutcomeRefreshError', refreshCause: 'otra' })]) {
    const got = await mk(hostile); assert.equal(got.op.queue.status, 'failed'); assert.equal(got.op.queue.cause, 'unknown'); assert.equal(got.op.queue.reason, '');
    assert.doesNotMatch(got.text, /http|127\.0|Llamar a Ana|interno|Failed|datos|falso/); assert.match(got.text, /La cola de Hoy no se actualizó/);
  }
}));

test('170 el tiempo agotado conserva su causa propia y no depende del texto del consumidor', () => withRig(async r => {
  const loaded = await open(r, 'task-2');
  const slow = createTaskSaveOutcomes({ strategy: legacyStrategy(r.transport), queueTimeoutMs: 30, onConfirmed: () => new Promise<void>(() => undefined) });
  const op = await started(slow.submit(input(loaded, { notes: 'lento' }))).done; await slow.whenIdle(); const q = slow.get(op.attemptId)!.queue;
  assert.equal(q.status, 'failed'); assert.equal(q.cause, 'timeout'); assert.match(q.reason, /tardó demasiado/);
}));

test('170 reintentar la actualización tras un fallo tipado solo lee: ningún PATCH nuevo y la causa se limpia al lograrlo', () => withRig(async r => {
  const loaded = await open(r, 'task-2'); let failing = true;
  const controller = createTaskSaveOutcomes({ strategy: legacyStrategy(r.transport), onConfirmed: async () => { if (failing) throw new OutcomeRefreshError('state'); } });
  const op = await started(controller.submit(input(loaded, { notes: 'reintento' }))).done; await controller.whenIdle(); assert.equal(controller.get(op.attemptId)!.queue.cause, 'state'); assert.equal(r.patches.length, 1);
  failing = false; await controller.retryQueue(op.attemptId); const q = controller.get(op.attemptId)!.queue; assert.equal(q.status, 'ok'); assert.equal(q.cause, undefined); assert.equal(r.patches.length, 1); assert.equal(r.store.changes().length, 1);
}));

test('170 una estrategia que convierte el rechazo de la puerta en «incierto» (como saveTask) no hace creer que salió un PATCH', () => withRig(async r => {
  const loaded = await open(r, 'task-2'), caller = new AbortController(), barrier = gate(); let reached: () => void = () => undefined; const at = new Promise<void>(resolve => { reached = resolve; });
  // Imita a saveTask: traga cualquier error del envío y lo informa como «incierto». La señal de quien llama se aborta tras comprobar y antes de despachar.
  const swallowing: SaveStrategy = {
    verify: request => legacyStrategy(r.transport).verify(request),
    save: async (_request, hooks) => { reached(); await barrier.promise; try { hooks.onDispatch(); } catch { return { kind: 'uncertain', message: 'No llegó el acuse del servidor; no se sabe si el cambio se aplicó.' }; } return { kind: 'uncertain', message: 'x' }; },
  };
  const controller = createTaskSaveOutcomes({ strategy: swallowing });
  const sub = started(controller.submit({ ...input(loaded, { notes: 'puerta cerrada' }), signal: caller.signal })); await at; caller.abort(); barrier.release();
  const done = await sub.done;
  assert.equal(done.status, 'not_sent', 'la puerta cerró: no salió nada'); assert.notEqual(done.phase, 'sent'); assert.equal(r.patches.length, 0); assert.equal(r.store.changes().length, 0);
  assert.equal(canRetry(done), true, 'consta que no se envió: la persona puede reenviar explícitamente');
}));

test('170 dispose aborta la señal de las comprobaciones aún no despachadas y NO la de un envío ya despachado', () => withRig(async r => {
  const loaded = await open(r, 'task-2'), seen: Record<string, boolean | undefined> = {}; const barrier = gate(); let reachedA: () => void = () => undefined, reachedB: () => void = () => undefined;
  const a = new Promise<void>(resolve => { reachedA = resolve; }), b = new Promise<void>(resolve => { reachedB = resolve; });
  const strategy: SaveStrategy = {
    verify: request => legacyStrategy(r.transport).verify(request),
    save: async (request, hooks) => {
      const dispatch = request.patch.notes === 'despachada'; if (dispatch) { hooks.onDispatch(); reachedB(); } else reachedA();
      await barrier.promise; seen[String(request.patch.notes)] = request.signal?.aborted; return { kind: 'uncertain', message: 'x' };
    },
  };
  const controller = createTaskSaveOutcomes({ strategy });
  started(controller.submit(input(loaded, { notes: 'sin despachar' }))); started(controller.submit(input(await open(r, 'task-3'), { notes: 'despachada' }))); await Promise.all([a, b]);
  controller.dispose(); barrier.release(); await controller.whenIdle();
  assert.equal(seen['sin despachar'], true, 'la comprobación pendiente recibe la cancelación'); assert.equal(seen['despachada'], false, 'lo ya despachado no se aborta: no se presenta como deshecho');
}));

// ═══ 170 R2 · F1 del dictamen 195: el cierre y el resumen se fijan ANTES de ejecutar suscriptores o listeners de señal ═══════════════════
/** Estrategia sintética que cumple el contrato de `onDispatch`: cuenta las escrituras y retiene el acuse. Sirve para probar el contrato sin red. */
function countingStrategy(base: Transport) {
  const writes: string[] = [], releases: Array<() => void> = [], signals = new Map<string, AbortSignal | undefined>();
  const strategy: SaveStrategy = {
    verify: request => legacyStrategy(base).verify(request),
    save: (request, hooks) => { signals.set(request.taskId, request.signal); if (request.patch.notes === 'retener-comprobacion') return new Promise<SaveOutcome>(resolve => { releases.push(() => resolve({ kind: 'preflight-failed', message: 'cerrado' })); }); hooks.onDispatch(); writes.push(request.taskId); return new Promise<SaveOutcome>(resolve => { releases.push(() => resolve({ kind: 'uncertain', message: 'sin acuse' })); }); },
  };
  return { strategy, writes, release: () => releases.splice(0).forEach(release => release()), signals };
}

test('170R2 un suscriptor SÍNCRONO que pide otro guardado durante el cierre recibe «refused»: no hay segundo despacho y el resumen es cierto', () => withRig(async r => {
  const first = await open(r, 'task-2'), second = await open(r, 'task-3'), s = countingStrategy(r.transport); let reentered: unknown = null, calls = 0, retried: unknown = null;
  const controller = createTaskSaveOutcomes({ strategy: s.strategy });
  const sub = started(controller.submit(input(first, { notes: 'retener-comprobacion' })));
  controller.subscribe(() => { calls++; if (calls === 1) { reentered = controller.submit(input(second, { notes: 'desde el suscriptor' })); retried = controller.retry(sub.attemptId); } });
  const summary = controller.dispose();
  assert.equal((reentered as { kind: string }).kind, 'refused'); assert.match((reentered as { reason: string }).reason, /sesión terminó/); assert.equal((retried as { kind: string }).kind, 'refused');
  assert.deepEqual(summary, { notDispatched: 1, dispatched: 0 }); assert.deepEqual(s.writes, [], 'ningún despacho desde la reentrada'); assert.equal(controller.list().length, 1);
  assert.equal(calls, 1, 'un único aviso final'); s.release(); await controller.whenIdle(); assert.equal(r.patches.length, 0);
}));

test('170R2 reentrada a dispose() desde un suscriptor devuelve el MISMO resumen ya fijado (con envíos ya despachados contados)', () => withRig(async r => {
  const a = await open(r, 'task-2'), b = await open(r, 'task-3'), s = countingStrategy(r.transport); let inner: unknown = null;
  const controller = createTaskSaveOutcomes({ strategy: s.strategy });
  started(controller.submit(input(a, { notes: 'retener-comprobacion' }))); started(controller.submit(input(b, { notes: 'despachada' })));   // una sin despachar, otra ya despachada
  controller.subscribe(() => { inner = controller.dispose(); });
  const outer = controller.dispose();
  assert.deepEqual(outer, { notDispatched: 1, dispatched: 1 }); assert.equal(inner, outer, 'el mismo objeto, no uno recalculado a mitad del cierre'); assert.equal(controller.dispose(), outer);
  assert.deepEqual(s.writes, ['task-3'], 'lo ya despachado sigue siendo un envío real'); s.release(); await controller.whenIdle();
  const settled = controller.list().find(op => op.taskId === 'task-3')!; assert.equal(settled.status, 'uncertain', 'conserva su resultado real, no «cancelado»');
}));

test('170R2 un listener de AbortSignal que pide guardar o cerrar durante dispose() encuentra el gestor ya cerrado', () => withRig(async r => {
  const first = await open(r, 'task-2'), second = await open(r, 'task-3'), s = countingStrategy(r.transport); const seen: unknown[] = [];
  const controller = createTaskSaveOutcomes({ strategy: s.strategy });
  const sub = started(controller.submit(input(first, { notes: 'retener-comprobacion' })));
  s.signals.get('task-2')!.addEventListener('abort', () => { seen.push(controller.submit(input(second, { notes: 'desde la señal' })).kind, controller.dispose(), controller.retry(sub.attemptId).kind); });
  const summary = controller.dispose();
  assert.equal(seen.length, 3, 'el listener se ejecutó durante el cierre'); assert.equal(seen[0], 'refused'); assert.equal(seen[1], summary); assert.equal(seen[2], 'refused');
  assert.deepEqual(summary, { notDispatched: 1, dispatched: 0 }); assert.deepEqual(s.writes, []); s.release(); await controller.whenIdle(); assert.equal(r.patches.length, 0);
}));

test('170R2 un suscriptor que LANZA no impide asentar, abortar ni devolver el resumen', () => withRig(async r => {
  const a = await open(r, 'task-2'), s = countingStrategy(r.transport); const controller = createTaskSaveOutcomes({ strategy: s.strategy });
  const sub = started(controller.submit(input(a, { notes: 'retener-comprobacion' }))); controller.subscribe(() => { throw new Error('suscriptor roto'); });
  const summary = controller.dispose(); assert.deepEqual(summary, { notDispatched: 1, dispatched: 0 });
  assert.equal(s.signals.get('task-2')!.aborted, true, 'la comprobación se abortó a pesar del suscriptor'); assert.equal(controller.get(sub.attemptId)!.detail.kind, 'disposed');
  s.release(); await controller.whenIdle();
}));

test('170R2 el resumen cuenta cada operación una vez: sustituida no cuenta, incierta y en vuelo sí, resueltas no', () => withRig(async r => {
  const a = await open(r, 'task-2'), b = await open(r, 'task-3'), c = await open(r, 'task-4'), s = countingStrategy(r.transport); const controller = createTaskSaveOutcomes({ strategy: s.strategy });
  const one = started(controller.submit(input(a, { notes: 'despachada' }))), two = started(controller.submit(input(b, { notes: 'despachada' }))); s.release(); await one.done; await two.done;
  assert.equal(controller.get(one.attemptId)!.status, 'uncertain'); controller.dismiss(two.attemptId);
  started(controller.submit(input(c, { notes: 'retener-comprobacion' })));
  assert.deepEqual(controller.dispose(), { notDispatched: 1, dispatched: 1 }, 'la descartada no cuenta; la incierta sí; la que no salió se cuenta aparte');
  s.release(); await controller.whenIdle();
}));

test('170 el mensaje de un fallo de la lista de Hoy y el del estado de la aplicación son distintos y de redacción controlada', () => {
  const base = { status: 'confirmed', taskLabel: 'T', record: {} as never, queue: { status: 'failed', reason: '' } } as unknown as TaskSaveOperation;
  const text = (cause: 'state' | 'list' | 'timeout' | 'unknown') => describeOperation({ ...base, queue: { status: 'failed', reason: REFRESH_REASONS[cause], cause } } as TaskSaveOperation).lines.join(' ');
  assert.match(text('state'), /^El servidor devolvió.*No se pudo actualizar el estado de la aplicación\./); assert.doesNotMatch(text('state'), /lista de Hoy/);
  assert.match(text('list'), /No se pudo actualizar la lista de Hoy\./); assert.doesNotMatch(text('list'), /estado de la aplicación|La cola de Hoy no se actualizó/);
  assert.match(text('timeout'), /La cola de Hoy no se actualizó \(la actualización tardó demasiado\)/); assert.match(text('unknown'), /La cola de Hoy no se actualizó\. La tarea/);
});

// ── A4 · UUID ESTABLE (CLAUDE-A4-UUID-ESTABLE): el UUID de la operación viaja del gestor a la estrategia y a la verificación ─────────────────────────────────────────────────────────────────
// Estrategia de prueba: no toca el servidor; registra lo que recibe. Los consumidores actuales (legado y revisión) ignoran el campo y siguen cubiertos por las pruebas anteriores.
function uuidStrategy(options: { saveOutcome?: StrategyOutcome; verdict?: Verification; onSave?: (request: SaveRequest) => Promise<void> } = {}) {
  const saves: { attemptId: string | undefined; taskId: string }[] = [], verifies: { attemptId: string | undefined; taskId: string }[] = [], seenByManager: (TaskSaveOperation | undefined)[] = [];
  let controller!: ReturnType<typeof createTaskSaveOutcomes>;
  const strategy: SaveStrategy = {
    async save(request, hooks) { await options.onSave?.(request); hooks.onDispatch(); saves.push({ attemptId: request.attemptId, taskId: request.taskId }); seenByManager.push(request.attemptId ? controller.get(request.attemptId) : undefined); return options.saveOutcome ?? { kind: 'uncertain', message: 'sin acuse' }; },
    async verify(request) { verifies.push({ attemptId: request.attemptId, taskId: request.taskId }); return options.verdict ?? { kind: 'unknown' }; },
  };
  return { strategy, saves, verifies, seenByManager, bind: (c: typeof controller) => { controller = c; return c; } };
}

test('A4 · el UUID de la operación viaja a la estrategia: es el mismo que ve la superficie, existe ANTES del envío y no se genera otro', () => withRig(async r => {
  const loaded = await open(r, 'task-2'), spy = uuidStrategy(), controller = spy.bind(createTaskSaveOutcomes({ strategy: spy.strategy }));
  const sub = started(controller.submit(input(loaded, { notes: 'uuid' }))); const op = controller.list()[0];
  assert.match(sub.attemptId, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/, 'UUID del gestor'); assert.equal(op.attemptId, sub.attemptId);
  await sub.done;
  assert.equal(spy.saves.length, 1); assert.equal(spy.saves[0].attemptId, sub.attemptId, 'la estrategia recibe EXACTAMENTE el UUID de la operación'); assert.equal(spy.saves[0].taskId, 'task-2');
  assert.equal(spy.seenByManager[0]?.attemptId, sub.attemptId, 'cuando la estrategia recibe la petición, la operación con ese UUID ya está registrada'); assert.equal(spy.seenByManager[0]?.phase, 'sent', 'y su frontera de despacho ya se cruzó');
  assert.equal(controller.list().length, 1, 'un solo intento'); assert.equal(r.patches.length, 0, 'la estrategia de prueba no toca el servidor');
}));

test('A4 · un `newId` inyectado se transmite tal cual (no se normaliza ni se sustituye)', () => withRig(async r => {
  const loaded = await open(r, 'task-2'), spy = uuidStrategy(), controller = spy.bind(createTaskSaveOutcomes({ strategy: spy.strategy, newId: () => 'intento-fijo-1' }));
  const sub = started(controller.submit(input(loaded, { notes: 'x' }))); await sub.done;
  assert.equal(sub.attemptId, 'intento-fijo-1'); assert.equal(spy.saves[0].attemptId, 'intento-fijo-1');
}));

test('A4 · doble envío del mismo guardado: «ocupado», un único intento y una única llamada a la estrategia con un único UUID', () => withRig(async r => {
  const loaded = await open(r, 'task-2'), hold = gate(), spy = uuidStrategy({ onSave: () => hold.promise }), controller = spy.bind(createTaskSaveOutcomes({ strategy: spy.strategy }));
  const first = started(controller.submit(input(loaded, { notes: 'doble' }))); const second = controller.submit(input(loaded, { notes: 'doble' }));
  assert.equal(second.kind, 'busy'); assert.equal((second as { existing: TaskSaveOperation }).existing.attemptId, first.attemptId, 'el segundo clic devuelve el intento existente');
  hold.release(); await first.done;
  assert.equal(spy.saves.length, 1, 'una sola llamada'); assert.equal(controller.list().length, 1); assert.equal(spy.saves[0].attemptId, first.attemptId);
}));

test('A4 · verificar es una lectura del MISMO intento: conserva el UUID, no llama a guardar y no crea otra operación', () => withRig(async r => {
  const loaded = await open(r, 'task-2'), spy = uuidStrategy(), controller = spy.bind(createTaskSaveOutcomes({ strategy: spy.strategy }));
  const sub = started(controller.submit(input(loaded, { notes: 'v' }))); const done = await sub.done; assert.equal(done.status, 'uncertain');
  await controller.verify(sub.attemptId);
  assert.equal(spy.verifies.length, 1); assert.equal(spy.verifies[0].attemptId, sub.attemptId, 'la verificación lleva el UUID del intento comprobado'); assert.equal(spy.saves.length, 1, 'ningún guardado nuevo');
  assert.equal(controller.list().length, 1, 'ninguna operación nueva'); assert.equal(controller.get(sub.attemptId)!.attemptId, sub.attemptId);
}));

test('A4 · un reintento humano es OTRA operación con otro UUID, enlazada a la anterior; la estrategia ve el nuevo y el anterior no cambia', () => withRig(async r => {
  const loaded = await open(r, 'task-2'), spy = uuidStrategy({ verdict: { kind: 'read', evidence: 'unchanged', record: loaded.record } }), controller = spy.bind(createTaskSaveOutcomes({ strategy: spy.strategy }));
  const first = started(controller.submit(input(loaded, { notes: 'r' }))); await first.done; await controller.verify(first.attemptId); assert.ok(canRetry(controller.get(first.attemptId)!), 'la lectura sin cambio habilita el reintento explícito');
  const again = controller.retry(first.attemptId); assert.equal(again.kind, 'started'); const second = again as Extract<typeof again, { kind: 'started' }>; await second.done;
  assert.notEqual(second.attemptId, first.attemptId, 'otro UUID'); assert.deepEqual(spy.saves.map(save => save.attemptId), [first.attemptId, second.attemptId]);
  assert.equal(controller.get(second.attemptId)!.previousAttemptId, first.attemptId); assert.equal(controller.get(second.attemptId)!.attemptNumber, 2); assert.equal(controller.get(first.attemptId)!.supersededBy, second.attemptId);
}));

test('A4 · la estrategia no puede cambiar la identidad de la operación mutando su petición: el gestor conserva su UUID y la verificación usa el original', () => withRig(async r => {
  const loaded = await open(r, 'task-2'); let tampered = '';
  const strategy: SaveStrategy = { async save(request, hooks) { hooks.onDispatch(); (request as { attemptId?: string }).attemptId = 'otro-id'; tampered = 'otro-id'; return { kind: 'uncertain', message: 'sin acuse' }; }, async verify(request) { tampered += '|' + request.attemptId; return { kind: 'unknown' }; } };
  const controller = createTaskSaveOutcomes({ strategy }); const sub = started(controller.submit(input(loaded, { notes: 'm' }))); const done = await sub.done;
  assert.equal(done.attemptId, sub.attemptId); assert.notEqual(done.attemptId, 'otro-id'); await controller.verify(sub.attemptId); assert.equal(tampered, 'otro-id|' + sub.attemptId, 'verify recibe el UUID original');
}));

test('A4 · una estrategia que lanza ANTES de despachar deja la operación «sin enviar» con su UUID; ni siquiera hay un segundo intento', () => withRig(async r => {
  const loaded = await open(r, 'task-2'), saves: (string | undefined)[] = [];
  const strategy: SaveStrategy = { async save(request) { saves.push(request.attemptId); throw new Error('falla antes de despachar'); }, async verify() { return { kind: 'unknown' }; } };
  const controller = createTaskSaveOutcomes({ strategy }); const sub = started(controller.submit(input(loaded, { notes: 'n' }))); const done = await sub.done;
  assert.equal(done.status, 'not_sent'); assert.deepEqual(saves, [sub.attemptId]); assert.equal(controller.list().length, 1);
}));

test('170 sin rechazos sin manejar en ninguna frontera anterior', async () => { await tick(); await tick(); assert.deepEqual(unhandled, []); });
