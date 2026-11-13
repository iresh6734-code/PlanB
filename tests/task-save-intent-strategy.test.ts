import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createBaseApp } from '../server/app.js';
import { makeDemoSpec, makeFixture } from '../shared/fixtures.js';
import { registerTaskIntents } from '../server/task-intents-api.js';
import { currentTaskIntentScope, type TaskIntentServiceOptions } from '../server/task-intents-service.js';
import { readTaskRevision, writeTaskRevision } from '../server/task-revision.js';
import type { TaskContext } from '../shared/local-task-focus.js';
import { OutcomeRefreshError } from '../shared/task-save-outcome.js';
import type { TaskIntentExecution } from '../shared/task-intents.js';
import { createTaskSaveOutcomes, type SaveRequest, type SubmitInput } from '../src/task-save-outcome.js';
import { createTaskSaveIntentStrategy, intentScopeFromContext, outcomeFromOperation, toStrategyOutcome, type IntentOutcome } from '../src/task-save-intent-strategy.js';

// ESTRATEGIA A4 (unidad CLAUDE-A4-CLIENT-STRATEGY): los siete estados. Evidencia declarada aparte:
//  · SERVICIO DEL AUTOR (316, EN REVISIÓN, NO ACEPTADO) real, con SQLite en memoria, escritor contado y fallos inyectados en SUS dependencias (`afterPersist`, `writer`), no con interruptores HTTP.
//    El gestor es el REAL de Hoy (`createTaskSaveOutcomes`) con el adaptador `asSaveStrategy()`.
//  · TRANSPORTES FALSOS para lo que el servicio no reproduce (respuesta grande omitida, detalle vencido, 503 genérico, 401).
// Es contrato del cliente: no prueba la App compilada ni el montaje (318). Datos ficticios; sin red.
process.env.NODE_ENV = 'test';
const at = '2026-11-09T11:00:00.000Z';
type Call = { method: string; path: string; body: unknown };
async function rig(t: TestContext, options: TaskIntentServiceOptions = {}) {
  const f = await createBaseApp({ dbPath: ':memory:', root: '.', staticDir: 'none' }); t.after(() => f.app.close());
  const snapshot = makeFixture('agency'); f.store.importSnapshot(snapshot);
  f.store.saveGeneration(makeDemoSpec(snapshot), { provider: 'demo', model: null, prompt: '', generatedAt: at, approved: false }); f.store.activate();
  let writers = 0; registerTaskIntents(f.app, f.store, { now: () => at, ...options, writer: (...args) => { writers++; return writeTaskRevision(...args); } });
  const calls: Call[] = [], hook: { before?: (call: Call) => void; after?: (call: Call, status: number) => void } = {};
  const fetcher: typeof fetch = async (input, init) => {
    const url = new URL(String(input), 'http://127.0.0.1'), method = init?.method ?? 'GET', call = { method, path: url.pathname, body: init?.body ? JSON.parse(String(init.body)) : null }; calls.push(call); hook.before?.(call);
    const r = await f.app.inject({ method: method as 'GET', url: url.pathname + url.search, headers: { host: '127.0.0.1', 'content-type': 'application/json' }, payload: init?.body as string | undefined });
    hook.after?.(call, r.statusCode); return new Response(r.body, { status: r.statusCode, headers: { 'content-type': 'application/json' } });
  };
  const scope = () => currentTaskIntentScope(f.store), taskEntity = () => f.store.spec!.entities.find(entity => entity.id === 'tasks')!;
  const context = (): TaskContext => { const s = scope(); return { instanceId: s.identity.instanceId, snapshotId: s.identity.snapshotId, snapshotName: 'Captura ficticia', capturedAt: s.identity.capturedAt, captureStartedAt: s.identity.captureStartedAt, accountId: s.identity.accountId, generatedAt: s.identity.generatedAt, isTestData: true, ready: true, runtime: false }; };
  const strategy = (fetchImpl: typeof fetch = fetcher, extra: { timeoutMs?: number } = {}) => createTaskSaveIntentStrategy({ fetch: fetchImpl, contextRevision: () => scope().contextRevision, writeTimeoutMs: extra.timeoutMs });
  const request = (patch: Record<string, string> = { notes: 'ficción A4 estrategia' }, extra: Partial<SaveRequest> = {}): SaveRequest => { const read = readTaskRevision(f.store, 'task-2'); return { taskId: 'task-2', baseline: read.record, entity: taskEntity(), patch, context: context(), revision: read.revision, attemptId: randomUUID(), ...extra }; };
  const submitInput = (patch: Record<string, string> = { notes: 'ficción A4 gestor' }): SubmitInput => { const read = readTaskRevision(f.store, 'task-2'); return { taskId: 'task-2', taskLabel: 'Tarea ficticia (task-2)', baseline: read.record, entity: taskEntity(), patch, context: context(), revision: read.revision }; };
  const posts = () => calls.filter(c => c.method === 'POST'), gets = () => calls.filter(c => c.method === 'GET');
  const gate = () => ({ onDispatch: () => undefined });
  return { ...f, fetcher, calls, hook, scope, context, strategy, request, submitInput, posts, gets, gate, writers: () => writers };
}
type Rig = Awaited<ReturnType<typeof rig>>;
const kindOf = (outcome: IntentOutcome) => outcome.kind;
const execution = async (r: Rig, request: SaveRequest) => { const response = await r.fetcher('/api/v7/task-intents/attempts', { method: 'POST', body: JSON.stringify({ ...r.scope(), attemptId: request.attemptId, taskId: request.taskId, expectedRevision: request.revision, values: request.patch }) }); return await response.json() as TaskIntentExecution; };

test('3 · ACUSE DEL SERVIDOR con writeResult: server-ack, cambio real, token y registro de la MISMA lectura; un POST, una llamada al escritor y una fila de historial', async t => {
  const r = await rig(t), request = r.request(), outcome = await r.strategy().save(request, r.gate());
  assert.equal(outcome.kind, 'acknowledged'); if (outcome.kind !== 'acknowledged') return;
  assert.equal(outcome.source, 'server-ack'); assert.equal(outcome.changed, true); assert.equal(outcome.replayed, false); assert.equal(outcome.operation.attemptId, request.attemptId, 'el ID del gestor, no otro');
  assert.equal(outcome.record?.values.notes, 'ficción A4 estrategia'); assert.equal(outcome.revised?.token, outcome.resultingRevision); assert.deepEqual(outcome.revised?.current, outcome.record);
  assert.equal(r.posts().length, 1); assert.equal(r.writers(), 1); assert.equal(r.store.changesCount, 1);
});

test('3 · el acuse se CONSERVA aunque falte writeResult: replay (no retenido) y respuesta grande omitida conservan confirmación, cambio y revisión resultante, SIN reconstruir registro ni llamar al escritor', async t => {
  const r = await rig(t), request = r.request(), strategy = r.strategy(); assert.equal((await strategy.save(request, r.gate())).kind, 'acknowledged');
  const replay = await strategy.save(request, r.gate()); assert.equal(replay.kind, 'acknowledged'); if (replay.kind !== 'acknowledged') return;
  assert.equal(replay.replayed, true); assert.equal(replay.record, null, 'no se inventa un CrmRecord'); assert.equal(replay.revised, null); assert.equal(replay.writeResultOmitted, 'not-retained'); assert.equal(replay.changed, true); assert.match(String(replay.resultingRevision), /^[a-f0-9]{64}$/);
  assert.equal(r.writers(), 1, 'el replay no vuelve a escribir'); assert.equal(r.store.changesCount, 1);
  const fresh = await execution(r, request), tooLarge = { ...fresh, created: true, replayed: false, writeResult: null, writeResultOmitted: 'response-too-large' as const };
  const omitted = await r.strategy(() => Promise.resolve(new Response(JSON.stringify(tooLarge), { status: 200 }))).save(r.request(undefined, { attemptId: request.attemptId }), r.gate());
  assert.equal(omitted.kind, 'acknowledged'); if (omitted.kind === 'acknowledged') { assert.equal(omitted.writeResultOmitted, 'response-too-large'); assert.equal(omitted.record, null); assert.equal(omitted.source, 'server-ack'); assert.equal(omitted.replayed, false); }
  // El gestor ACTUAL no puede expresar «confirmado sin registro»: el adaptador lo degrada a incierto con un texto que dice que el servidor sí confirmó (nunca a «guardado» con un registro inventado).
  const degraded = toStrategyOutcome(replay); assert.equal(degraded.kind, 'uncertain'); assert.match((degraded as { message: string }).message, /El servidor confirmó/);
});

test('3 · la RECARGA de Hoy es otra dimensión: si falla, el guardado sigue confirmado, y reintentarla solo lee (cero POST nuevos, cero escrituras)', async t => {
  const r = await rig(t); let reloads = 0, fail = true;
  const controller = createTaskSaveOutcomes({ strategy: r.strategy().asSaveStrategy(), onConfirmed: async () => { reloads++; if (fail) throw new OutcomeRefreshError('list'); } });
  const submission = controller.submit(r.submitInput()); assert.equal(submission.kind, 'started'); const op = await (submission as Extract<typeof submission, { kind: 'started' }>).done; await controller.whenIdle();
  assert.equal(controller.get(op.attemptId)!.status, 'confirmed'); assert.equal(controller.get(op.attemptId)!.queue.status, 'failed'); assert.equal(op.attemptId, (r.posts()[0]!.body as { attemptId: string }).attemptId, 'la superficie y el servidor ven el MISMO ID');
  const posts = r.posts().length, writers = r.writers(), changes = r.store.changesCount; fail = false; await controller.retryQueue(op.attemptId); await controller.whenIdle();
  assert.equal(controller.get(op.attemptId)!.status, 'confirmed'); assert.equal(controller.get(op.attemptId)!.queue.status, 'ok'); assert.equal(reloads, 2);
  assert.equal(r.posts().length, posts); assert.equal(r.writers(), writers); assert.equal(r.store.changesCount, changes);
});

test('4 · changed:false es un NO-OP confirmado por el servidor: tipo propio, sin historial ni escritura, separado del trabajo nuevo', async t => {
  const r = await rig(t), same = String(readTaskRevision(r.store, 'task-2').record.values.status), outcome = await r.strategy().save(r.request({ status: same }), r.gate());
  assert.equal(outcome.kind, 'no-op'); if (outcome.kind !== 'no-op') return;
  assert.equal(outcome.source, 'server-ack'); assert.equal(outcome.changed, false); assert.equal(outcome.revised?.changed, false); assert.equal(r.store.changesCount, 0, 'sin fila de historial');
  const adapted = toStrategyOutcome(outcome); assert.equal(adapted.kind, 'unchanged'); assert.notEqual(adapted.kind, 'saved');
});

test('2 · INCIERTO: POST despachado sin acuse válido (respuesta perdida tras aplicar) → solo consulta explícita por GET, mismo ID, sin segundo POST ni UUID nuevo', async t => {
  const r = await rig(t), request = r.request();
  const strategy = r.strategy((input, init) => r.fetcher(input, init).then(() => Promise.reject(new TypeError('se perdió el acuse'))));
  const outcome = await strategy.save(request, r.gate()); assert.equal(outcome.kind, 'uncertain'); assert.equal((outcome as { cause: string }).cause, 'no-response'); assert.match((outcome as { message: string }).message, /No se sabe si/);
  assert.equal(r.posts().length, 1); assert.equal(r.writers(), 1, 'el servidor sí aplicó'); const before = r.store.changesCount, post = r.posts().length;
  const checked = await r.strategy().check({ attemptId: request.attemptId!, context: request.context }); assert.equal(checked.kind, 'read');
  assert.equal(r.posts().length, post, 'comprobar no reenvía'); assert.equal(r.store.changesCount, before); assert.equal(r.writers(), 1); assert.ok(r.gets().length >= 1);
  if (checked.kind === 'read') {
    assert.equal(checked.evidence, 'applied'); assert.equal(checked.attribution, 'unknown'); assert.equal(checked.operation.attemptId, request.attemptId);
    assert.equal(checked.recorded.kind, 'acknowledged', 'el servidor SÍ asentó su acuse: se recupera sin imponer una incertidumbre falsa'); assert.equal((checked.recorded as { source: string }).source, 'server-ack');
  }
});

test('2 · INTENTO SIN ASENTAR (el servidor conservó la intención y no llegó a aplicar): incierto «unsettled», cero cambios; comprobar lee «unchanged» sin acuse y no hay segundo POST', async t => {
  const r = await rig(t, { afterPersist: async () => { throw new Error('fallo de persistencia simulado'); } }), request = r.request();
  const outcome = await r.strategy().save(request, r.gate()); assert.equal(outcome.kind, 'uncertain'); assert.equal((outcome as { cause: string }).cause, 'unsettled'); assert.equal(r.writers(), 0); assert.equal(r.store.changesCount, 0);
  const checked = await r.strategy().check({ attemptId: request.attemptId!, context: request.context }); assert.equal(checked.kind, 'read');
  if (checked.kind === 'read') { assert.equal(checked.evidence, 'unchanged'); assert.equal(checked.operation.outcome, null); assert.equal(checked.operation.provenance, null); assert.equal(checked.operation.acknowledgement, null); assert.equal(checked.recorded.kind, 'uncertain'); }
  assert.equal(r.posts().length, 1);
});

test('5 + 6 · lectura applied sin autoría ni acuse inventado; la aceptación HUMANA es otro tipo, con secuencia, distinto de server-ack', async t => {
  const r = await rig(t, { afterPersist: async () => { throw new Error('fallo de persistencia simulado'); } }), request = r.request(); await r.strategy().save(request, r.gate());
  // Otra persona escribe EXACTAMENTE los mismos valores por fuera del intento: la lectura coincide, pero eso no prueba que lo escribiera este intento.
  writeTaskRevision(r.store, 'task-2', { expectedRevision: request.revision!, values: request.patch });
  const checked = await r.strategy().check({ attemptId: request.attemptId!, context: request.context }); assert.equal(checked.kind, 'read'); if (checked.kind !== 'read') return;
  assert.equal(checked.evidence, 'applied'); assert.equal(checked.attribution, 'unknown'); assert.equal(checked.operation.provenance, null, 'no hay acuse del servidor'); assert.equal(checked.operation.acknowledgement, null); assert.equal(checked.recorded.kind, 'uncertain');
  const scope = r.scope(), client = (await import('../src/local-task-intents-client.js')).createTaskIntentsClient({ fetch: r.fetcher });
  const accepted = await client.accept(request.attemptId!, scope, { seq: checked.operation.seq, taskRevision: checked.taskRevision }); assert.equal(accepted.kind, 'ok');
  const again = await r.strategy().save(request, r.gate()); assert.equal(again.kind, 'accepted-read'); if (again.kind !== 'accepted-read') return;
  assert.equal(again.source, 'person-accepted-read'); assert.equal(again.seq, checked.operation.seq + 1); assert.equal(again.operation.provenance, 'person-accepted-read'); assert.equal(again.operation.acknowledgement, null);
  assert.notEqual(again.kind as string, 'acknowledged'); assert.equal(r.writers(), 0, 'ni la aceptación ni el replay llaman al escritor'); assert.equal(r.store.changesCount, 1, 'el único cambio es el de la otra persona');
});

test('7 · DETALLE VENCIDO y respuesta omitida por tamaño conservan metadatos y NO reconstruyen base ni registro', async t => {
  const r = await rig(t), request = r.request(); await r.strategy().save(request, r.gate()); const done = await execution(r, request);
  const expired = await r.strategy(() => Promise.resolve(new Response(JSON.stringify({ error: 'x', details: { code: 'TASK_INTENT_DETAIL_EXPIRED', replayed: true, operation: { ...done.operation, detailAvailable: false } } }), { status: 409 }))).save(request, r.gate());
  assert.equal(expired.kind, 'detail-expired'); if (expired.kind === 'detail-expired') { assert.equal(expired.operation.attemptId, request.attemptId); assert.equal(expired.operation.detailAvailable, false); assert.equal('record' in expired, false); }
  assert.equal(toStrategyOutcome(expired).kind, 'uncertain');
  const base = await (await r.fetcher('/api/v7/task-intents/' + request.attemptId + '/check?' + new URLSearchParams({ identity: JSON.stringify(r.scope().identity), contextRevision: r.scope().contextRevision }))).json() as { operation: unknown };
  for (const reason of ['response-too-large', 'detail-expired', 'read-failed'] as const) {
    const unavailable = { format: 'planb-task-intent-check-v1', operation: { ...(base.operation as object), detailAvailable: reason !== 'detail-expired' }, evidence: 'unavailable', readAt: at, taskRevision: null, record: null, reason };
    const verification = await r.strategy(() => Promise.resolve(new Response(JSON.stringify(unavailable), { status: 200 }))).check({ attemptId: request.attemptId!, context: request.context });
    assert.equal(verification.kind, 'unavailable', reason); if (verification.kind === 'unavailable') { assert.equal(verification.reason, reason); assert.equal(verification.operation.attemptId, request.attemptId); assert.equal('record' in verification, false); assert.equal(verification.recorded.kind, 'acknowledged'); }
  }
});

test('1 · NO ENVIADO: sin ID del gestor, ID inválido, otra tarea, sin revisión, copia no lista o sin pin → cero POST, ningún UUID nuevo y la puerta no se cruza', async t => {
  const r = await rig(t); let crossed = 0; const hooks = { onDispatch: () => { crossed++; } }, strategy = r.strategy();
  const cases: [string, SaveRequest, string][] = [
    ['sin ID', r.request(undefined, { attemptId: undefined }), 'missing-attempt-id'], ['ID no UUID', r.request(undefined, { attemptId: 'intento-1' }), 'missing-attempt-id'],
    ['otra tarea', r.request(undefined, { taskId: 'task-3' }), 'invalid-request'], ['sin revisión', r.request(undefined, { revision: null }), 'missing-revision'],
    ['copia no lista', r.request(undefined, { context: { ...r.context(), ready: false } }), 'missing-scope'], ['sin identidad', r.request(undefined, { context: { ...r.context(), instanceId: null } }), 'missing-scope'],
  ];
  for (const [name, request, cause] of cases) { const outcome = await strategy.save(request, hooks); assert.deepEqual([name, kindOf(outcome), (outcome as { cause?: string }).cause], [name, 'not-sent', cause]); }
  const noPin = await createTaskSaveIntentStrategy({ fetch: r.fetcher, contextRevision: () => null }).save(r.request(), hooks); assert.equal(noPin.kind, 'not-sent');
  assert.equal(crossed, 0); assert.equal(r.calls.length, 0, 'cero peticiones'); assert.equal(intentScopeFromContext({ ...r.context(), ready: false }, 'a'.repeat(64)), null);
});

test('1 · la PUERTA del gestor: tras dispose() lo que no se despachó no sale (cero POST, no_sent); un reintento humano es OTRA operación con otro ID enlazada, nunca un reenvío encubierto', async t => {
  const r = await rig(t), inner = r.strategy().asSaveStrategy();
  // A4 no tiene comprobación previa: el POST sale en el mismo turno que submit. Para ejercer la puerta se retrasa un turno la entrada de save (como haría una lectura previa).
  const controller = createTaskSaveOutcomes({ strategy: { ...inner, save: async (request, hooks) => { await Promise.resolve(); return inner.save(request, hooks); } } });
  const submission = controller.submit(r.submitInput()); assert.equal(submission.kind, 'started'); const summary = controller.dispose(); const op = await (submission as Extract<typeof submission, { kind: 'started' }>).done;
  assert.equal(op.status, 'not_sent'); assert.equal(summary.dispatched, 0); assert.equal(r.posts().length, 0); assert.equal(r.writers(), 0); assert.equal(r.store.changesCount, 0);
  // Reintento humano tras un intento incierto cuya lectura muestra la tarea SIN el cambio.
  const f = await rig(t, { afterPersist: async () => { if (failing) throw new Error('fallo simulado'); } }); let failing = true;
  const manager = createTaskSaveOutcomes({ strategy: f.strategy().asSaveStrategy() }), first = manager.submit(f.submitInput()); const firstOp = await (first as Extract<typeof first, { kind: 'started' }>).done;
  assert.equal(firstOp.status, 'uncertain'); await manager.verify(firstOp.attemptId); assert.equal(manager.get(firstOp.attemptId)!.evidence?.kind, 'unchanged'); assert.equal(f.posts().length, 1, 'verificar es solo lectura');
  failing = false; const second = manager.retry(firstOp.attemptId); assert.equal(second.kind, 'started'); const secondOp = await (second as Extract<typeof second, { kind: 'started' }>).done;
  assert.equal(secondOp.status, 'confirmed'); assert.notEqual(secondOp.attemptId, firstOp.attemptId); assert.equal(secondOp.previousAttemptId, firstOp.attemptId); assert.equal(manager.get(firstOp.attemptId)!.supersededBy, secondOp.attemptId);
  assert.deepEqual(f.posts().map(p => (p.body as { attemptId: string }).attemptId), [firstOp.attemptId, secondOp.attemptId], 'dos POST, cada uno con el ID de su operación'); assert.equal(f.writers(), 1); assert.equal(f.store.changesCount, 1);
});

test('2 · un 503 genérico después del despacho es INCIERTO en el gestor (nunca «no enviado»); un 401 también; verificar solo hace GET', async t => {
  const r = await rig(t);
  for (const [status, label] of [[503, '503'], [401, '401']] as const) {
    const calls: string[] = [], strategy = r.strategy(() => { calls.push('POST'); return Promise.resolve(new Response(JSON.stringify({ error: 'x', details: { code: 'TASK_INTENT_STORAGE_UNAVAILABLE' } }), { status })); });
    const controller = createTaskSaveOutcomes({ strategy: strategy.asSaveStrategy() }), submission = controller.submit(r.submitInput()), op = await (submission as Extract<typeof submission, { kind: 'started' }>).done;
    assert.equal(op.status, 'uncertain', label); assert.notEqual(op.status as string, 'not_sent'); assert.equal(calls.length, 1);
  }
  const verifier = createTaskSaveOutcomes({ strategy: r.strategy().asSaveStrategy() }), submission = verifier.submit(r.submitInput()); await (submission as Extract<typeof submission, { kind: 'started' }>).done;
  const before = r.posts().length;
  for (const op of verifier.list()) await verifier.verify(op.attemptId); assert.equal(r.posts().length, before, 'comprobar no envía');
});

test('REVISIÓN ANTIGUA (409 TASK_REVISION_CHANGED): rechazo sin efecto en el gestor, conflicto de revisión y el borrador se conserva; cero escritura', async t => {
  const r = await rig(t), input = r.submitInput({ notes: 'mi nota' }); writeTaskRevision(r.store, 'task-2', { expectedRevision: input.revision!, values: { notes: 'otra persona' } }); const before = r.store.changesCount, writers = r.writers();
  const controller = createTaskSaveOutcomes({ strategy: r.strategy().asSaveStrategy() }), submission = controller.submit(input), op = await (submission as Extract<typeof submission, { kind: 'started' }>).done;
  assert.equal(op.status, 'rejected'); assert.equal(op.detail.httpStatus, 409); assert.equal(op.detail.revisionConflict, true); assert.deepEqual(op.patch, { notes: 'mi nota' });
  assert.equal(r.store.changesCount, before); assert.equal(r.writers(), writers); assert.equal(r.posts().length, 1, 'un intento, sin reenvío');
});

test('outcomeFromOperation es total y no inventa: cada desenlace persistido produce su tipo y ninguno fabrica registro ni autoría', async t => {
  const r = await rig(t), request = r.request(); await r.strategy().save(request, r.gate()); const done = await execution(r, request), op = done.operation;
  const base = { replayed: true };
  assert.equal(outcomeFromOperation(op, base).kind, 'acknowledged');
  assert.equal(outcomeFromOperation({ ...op, acknowledgement: { changed: false, resultingRevision: op.acknowledgement!.resultingRevision } }, base).kind, 'no-op');
  assert.equal(outcomeFromOperation({ ...op, outcome: 'accepted-read', provenance: 'person-accepted-read', acknowledgement: null }, base).kind, 'accepted-read');
  assert.equal(outcomeFromOperation({ ...op, outcome: 'abandoned', provenance: null, acknowledgement: null }, base).kind, 'abandoned');
  assert.equal(outcomeFromOperation({ ...op, outcome: 'rejected', provenance: null, acknowledgement: null }, base).kind, 'closed-by-server');
  assert.equal(outcomeFromOperation({ ...op, phase: 'attempt', outcome: null, provenance: null, acknowledgement: null }, base).kind, 'uncertain');
});
