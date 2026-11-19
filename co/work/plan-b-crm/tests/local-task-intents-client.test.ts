import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createBaseApp } from '../server/app.js';
import { makeDemoSpec, makeFixture } from '../shared/fixtures.js';
import { registerTaskIntents } from '../server/task-intents-api.js';
import { currentTaskIntentScope } from '../server/task-intents-service.js';
import { readTaskRevision, writeTaskRevision } from '../server/task-revision.js';
import { TASK_INTENTS_PATH as PATH, TaskIntentExecution } from '../shared/task-intents.js';
import { createTaskIntentsClient, type ExecuteInput } from '../src/local-task-intents-client.js';

// CLIENTE A4 (unidad CLAUDE-A4-CLIENT-STRATEGY). Dos tipos de evidencia, declaradas aparte:
//  · SERVICIO DEL AUTOR (316, EN REVISIÓN, NO ACEPTADO): el cliente habla con `registerTaskIntents` real (SQLite en memoria, escritor contado) a través de un `fetch` que entrega a `app.inject`. Prueba la forma de las
//    peticiones y de las respuestas válidas; no sustituye la aceptación de 316 ni la del montaje (318).
//  · TRANSPORTES FALSOS: respuestas construidas a mano para los fallos que el servicio no reproduce (sin respuesta, cuerpo detenido, contrato ajeno, recibo de otro intento…).
// Datos ficticios; sin red; ningún navegador.
process.env.NODE_ENV = 'test';
const at = '2026-11-09T11:00:00.000Z';
type Call = { method: string; path: string; body: unknown };
async function rig(t: TestContext) {
  const f = await createBaseApp({ dbPath: ':memory:', root: '.', staticDir: 'none' }); t.after(() => f.app.close());
  const snapshot = makeFixture('agency'); f.store.importSnapshot(snapshot);
  f.store.saveGeneration(makeDemoSpec(snapshot), { provider: 'demo', model: null, prompt: '', generatedAt: at, approved: false }); f.store.activate();
  let writers = 0; registerTaskIntents(f.app, f.store, { now: () => at, writer: (...args) => { writers++; return writeTaskRevision(...args); } });
  const calls: Call[] = [];
  const fetcher: typeof fetch = async (input, init) => {
    const url = new URL(String(input), 'http://127.0.0.1'), method = init?.method ?? 'GET'; calls.push({ method, path: url.pathname, body: init?.body ? JSON.parse(String(init.body)) : null });
    const r = await f.app.inject({ method: method as 'GET', url: url.pathname + url.search, headers: { host: '127.0.0.1', 'content-type': 'application/json' }, payload: init?.body as string | undefined });
    return new Response(r.body, { status: r.statusCode, headers: { 'content-type': 'application/json' } });
  };
  const scope = () => currentTaskIntentScope(f.store);
  const input = (values: Record<string, string> = { notes: 'ficción A4 cliente' }, extra: Partial<ExecuteInput> = {}): ExecuteInput =>
    ({ scope: scope(), attemptId: randomUUID(), taskId: 'task-2', expectedRevision: readTaskRevision(f.store, 'task-2').revision, values, ...extra });
  return { ...f, fetcher, calls, scope, input, writers: () => writers, posts: () => calls.filter(c => c.method === 'POST') };
}
const stream = (chunks: (() => Uint8Array | null)[], onCancel?: () => void) => { let i = 0; return new ReadableStream<Uint8Array>({ pull(controller) { const next = chunks[i++]?.(); if (next === undefined || next === null) { if (next === null) return new Promise<void>(() => undefined); controller.close(); return; } controller.enqueue(next); }, cancel() { onCancel?.(); } }); };
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const events = () => { const target = new EventTarget(); const seen: string[] = []; target.addEventListener('planb:locked', () => seen.push('locked')); (globalThis as { window?: unknown }).window = target; return { seen, off: () => { delete (globalThis as { window?: unknown }).window; } }; };

test('execute: UN POST con el ID dado y los seis campos de identidad, pin, revisión y solo los campos cambiados; onDispatch va justo antes del transporte', async t => {
  const r = await rig(t), order: string[] = [], request = r.input({ notes: 'solo este campo' });
  const client = createTaskIntentsClient({ fetch: (i, init) => { order.push('fetch'); return r.fetcher(i, init); } });
  const result = await client.execute(request, { onDispatch: () => order.push('dispatch') });
  assert.equal(result.kind, 'execution'); assert.deepEqual(order, ['dispatch', 'fetch']);
  assert.equal(r.posts().length, 1); const [post] = r.posts(); assert.equal(post!.path, PATH + '/attempts');
  const body = post!.body as Record<string, unknown>; assert.deepEqual(Object.keys(body).sort(), ['attemptId', 'contextRevision', 'expectedRevision', 'identity', 'taskId', 'values']);
  assert.deepEqual(Object.keys(body.identity as object).sort(), ['accountId', 'capturedAt', 'captureStartedAt', 'generatedAt', 'instanceId', 'snapshotId'].sort()); assert.equal(body.attemptId, request.attemptId, 'el ID no se sustituye'); assert.deepEqual(body.values, { notes: 'solo este campo' });
  if (result.kind === 'execution') { assert.equal(result.execution.created, true); assert.equal(result.execution.operation.outcome, 'acknowledged'); assert.equal(result.execution.operation.attemptId, request.attemptId); assert.equal(result.execution.writeResult?.changed, true); }
  assert.equal(r.writers(), 1);
});

test('NO DESPACHADO: la puerta lanza, la entrada es inválida o la señal ya estaba cancelada → cero POST y onDispatch no se cruza cuando no procede', async t => {
  const r = await rig(t), client = createTaskIntentsClient({ fetch: r.fetcher });
  const gate = await client.execute(r.input(), { onDispatch: () => { throw new Error('el gestor terminó'); } }); assert.deepEqual([gate.kind, (gate as { cause?: string }).cause], ['not-dispatched', 'gate-closed']);
  let crossed = 0;
  const invalid = await client.execute(r.input(undefined, { attemptId: 'no-es-uuid' }), { onDispatch: () => { crossed++; } }); assert.deepEqual([invalid.kind, (invalid as { cause?: string }).cause], ['not-dispatched', 'invalid-request']);
  const empty = await client.execute(r.input({}), { onDispatch: () => { crossed++; } }); assert.equal(empty.kind, 'not-dispatched');
  const controller = new AbortController(); controller.abort(); const cancelled = await client.execute(r.input(), { onDispatch: () => { crossed++; } }, controller.signal); assert.deepEqual([cancelled.kind, (cancelled as { cause?: string }).cause], ['not-dispatched', 'cancelled']);
  assert.equal(crossed, 0); assert.equal(r.calls.length, 0, 'cero peticiones'); assert.equal(r.writers(), 0); assert.equal(r.store.changesCount, 0);
});

test('INCIERTO tras despachar: sin respuesta, plazo (aunque el transporte ignore la cancelación), cuerpo detenido, cuerpo excesivo y cancelación → un solo POST, nunca reenvío ni «no enviado»', async t => {
  const r = await rig(t);
  const run = async (fetchImpl: typeof fetch, options: { timeoutMs?: number; signal?: AbortSignal } = {}) => {
    const calls: string[] = []; const client = createTaskIntentsClient({ fetch: (i, init) => { calls.push(String(init?.method)); return fetchImpl(i, init); }, writeTimeoutMs: options.timeoutMs ?? 40 });
    const result = await client.execute(r.input(), { onDispatch: () => calls.push('gate') }, options.signal); await new Promise(resolve => setTimeout(resolve, 80)); return { result, calls };
  };
  const lost = await run(() => Promise.reject(new TypeError('red'))); assert.deepEqual([lost.result.kind, (lost.result as { cause?: string }).cause], ['uncertain', 'no-response']); assert.deepEqual(lost.calls, ['gate', 'POST']);
  const never = await run(() => new Promise<Response>(() => undefined)); assert.deepEqual([never.result.kind, (never.result as { cause?: string }).cause], ['uncertain', 'timeout']); assert.deepEqual(never.calls, ['gate', 'POST']);
  const stalled = await run(() => Promise.resolve(new Response(stream([() => null]), { status: 200 }))); assert.deepEqual([stalled.result.kind, (stalled.result as { cause?: string }).cause], ['uncertain', 'timeout']);
  let cancelled = false; const big = await run(() => Promise.resolve(new Response(stream([() => new Uint8Array(300_000), () => new Uint8Array(300_000), () => null], () => { cancelled = true; }), { status: 200 })), { timeoutMs: 500 });
  assert.deepEqual([big.result.kind, (big.result as { cause?: string }).cause], ['uncertain', 'unreadable']); assert.equal(cancelled, true, 'el límite de bytes corta la lectura');
  const controller = new AbortController(), pending = run(() => new Promise<Response>(() => undefined), { timeoutMs: 5000, signal: controller.signal }); setTimeout(() => controller.abort(), 10);
  const aborted = await pending; assert.deepEqual([aborted.result.kind, (aborted.result as { cause?: string }).cause], ['uncertain', 'cancelled']); assert.deepEqual(aborted.calls, ['gate', 'POST']);
  for (const message of [lost, never, stalled, big, aborted].map(x => (x.result as { message: string }).message)) assert.match(message, /No se sabe si/); assert.equal(r.calls.length, 0);
});

test('un 503 genérico DESPUÉS del despacho no se presenta como «no enviado»; 5xx, 409 de cambio de intento y códigos desconocidos tampoco; 401 emite planb:locked y queda incierto', async t => {
  const r = await rig(t), hook = events(); t.after(hook.off);
  const respond = async (response: Response) => { const calls: string[] = []; const result = await createTaskIntentsClient({ fetch: () => { calls.push('POST'); return Promise.resolve(response); } }).execute(r.input()); return { result, calls }; };
  for (const [status, body] of [[503, { error: 'x', details: { code: 'TASK_INTENT_STORAGE_UNAVAILABLE' } }], [503, { error: 'x' }], [500, { error: 'x' }], [502, { error: 'x' }], [409, { error: 'x', details: { code: 'TASK_INTENT_CHANGED' } }], [409, { error: 'x', details: { code: 'CODIGO_AJENO' } }], [418, { error: 'x' }]] as const) {
    const { result, calls } = await respond(json(status, body)); assert.equal(result.kind, 'uncertain', status + ' ' + JSON.stringify(body)); assert.equal(calls.length, 1, 'sin reenvío');
    assert.doesNotMatch((result as { message: string }).message, /no se envió nada\./i); assert.doesNotMatch((result as { message: string }).message, /CODIGO_AJENO|TASK_INTENT_STORAGE/);
  }
  const locked = await respond(json(401, { error: 'x' })); assert.deepEqual([locked.result.kind, (locked.result as { cause?: string }).cause], ['uncertain', 'locked']); assert.deepEqual(hook.seen, ['locked']);
  const context = await respond(json(409, { error: 'x', details: { code: 'TASK_INTENT_CONTEXT_CHANGED' } })); assert.deepEqual([context.result.kind, (context.result as { cause?: string }).cause], ['uncertain', 'context-changed']);
});

test('RECHAZO sin efecto: solo estados y códigos cerrados anteriores al escritor (409 de revisión o ID reutilizado, 413, 422, 404 sin ruta, 403 sin ensayo) y con texto propio', async t => {
  const r = await rig(t);
  const run = async (status: number, details: unknown) => createTaskIntentsClient({ fetch: () => Promise.resolve(json(status, { error: 'TEXTO DEL SERVIDOR', details })) }).execute(r.input());
  for (const [status, code] of [[409, 'TASK_REVISION_CHANGED'], [409, 'TASK_INTENT_REUSED'], [409, 'TASK_INTENT_CAPACITY'], [413, null], [422, null], [404, null], [403, 'TASK_INTENT_FICTION_ONLY'], [400, null]] as const) {
    const result = await run(status, code ? { code } : { fieldErrors: {} }); assert.equal(result.kind, 'rejected', status + ' ' + code); assert.equal((result as { status: number }).status, status); assert.doesNotMatch((result as { message: string }).message, /TEXTO DEL SERVIDOR/);
  }
  const conflict = await run(409, { code: 'TASK_REVISION_CHANGED' }); assert.match((conflict as { message: string }).message, /cambió mientras la revisabas/);
});

test('contratos ajenos: formato distinto, campo extra, recibo de otro intento, otra tarea u otro contexto → incierto (nunca confirmación); el replay válido se acepta como replay', async t => {
  const r = await rig(t), request = r.input(), client = createTaskIntentsClient({ fetch: r.fetcher });
  const first = await client.execute(request); assert.equal(first.kind, 'execution');
  const valid = (first as { execution: TaskIntentExecution }).execution;
  const respondWith = async (value: unknown, req = request) => createTaskIntentsClient({ fetch: () => Promise.resolve(json(200, value)) }).execute(req);
  const cause = (result: Awaited<ReturnType<typeof respondWith>>) => result.kind === 'uncertain' ? result.cause : result.kind;
  assert.equal(cause(await respondWith({ ...valid, format: 'planb-task-intent-execution-v2' })), 'incompatible');
  assert.equal(cause(await respondWith({ ...valid, extra: true })), 'incompatible');
  assert.equal(cause(await respondWith({ ...valid, operation: { ...valid.operation, attemptId: randomUUID() } })), 'mismatched-receipt');
  assert.equal(cause(await respondWith({ ...valid, operation: { ...valid.operation, taskId: 'task-3' }, writeResult: null, writeResultOmitted: 'not-retained' })), 'mismatched-receipt');
  assert.equal(cause(await respondWith({ ...valid, operation: { ...valid.operation, scope: { ...valid.operation.scope, contextRevision: 'a'.repeat(64) } } })), 'mismatched-receipt');
  assert.equal(cause(await respondWith(null)), 'incompatible');
  const replay = await client.execute(request); assert.equal(replay.kind, 'execution'); assert.equal((replay as { execution: TaskIntentExecution }).execution.replayed, true); assert.equal((replay as { execution: TaskIntentExecution }).execution.writeResult, null);
  assert.equal(r.writers(), 1, 'el replay no llama al escritor'); assert.equal(r.store.changesCount, 1);
});

test('DETALLE VENCIDO (409 con metadatos): se valida el resumen y que sea del mismo intento; no hay base ni parche; un resumen ajeno es incierto', async t => {
  const r = await rig(t), request = r.input(), client = createTaskIntentsClient({ fetch: r.fetcher }), first = await client.execute(request); assert.equal(first.kind, 'execution');
  const operation = (first as { execution: TaskIntentExecution }).execution.operation;
  const expired = (op: unknown) => createTaskIntentsClient({ fetch: () => Promise.resolve(json(409, { error: 'x', details: { code: 'TASK_INTENT_DETAIL_EXPIRED', replayed: true, operation: op } })) }).execute(request);
  const ok = await expired({ ...operation, detailAvailable: false }); assert.equal(ok.kind, 'detail-expired'); assert.equal((ok as { operation: { detailAvailable: boolean } }).operation.detailAvailable, false);
  assert.equal((await expired({ ...operation, attemptId: randomUUID() })).kind, 'uncertain'); assert.equal((await expired({ nope: true })).kind, 'uncertain');
});

test('GET: lista, detalle y comprobar leen con la identidad serializada y el pin, validan ámbito/intento y no escriben nunca; 404, 401 y 409 de contexto se distinguen de un fallo', async t => {
  const r = await rig(t), hook = events(); t.after(hook.off); const client = createTaskIntentsClient({ fetch: r.fetcher });
  const request = r.input(); assert.equal((await client.execute(request)).kind, 'execution'); const before = r.store.changesCount, writers = r.writers(), posts = r.posts().length;
  const list = await client.list(request.scope, { limit: 5 }); assert.equal(list.kind, 'ok'); if (list.kind === 'ok') { assert.equal(list.value.entries.length, 1); assert.equal(list.value.entries[0]!.attemptId, request.attemptId); }
  const detail = await client.detail(request.attemptId, request.scope); assert.equal(detail.kind, 'ok'); if (detail.kind === 'ok') assert.deepEqual(detail.value.payload?.values, { notes: 'ficción A4 cliente' });
  const check = await client.check(request.attemptId, request.scope); assert.equal(check.kind, 'ok'); if (check.kind === 'ok') { assert.equal(check.value.evidence, 'applied'); assert.equal(check.value.operation.provenance, 'server-ack'); }
  const reads = r.calls.slice(1); assert.equal(reads.length, 3); assert.ok(reads.every(c => c.method === 'GET'));
  assert.equal(r.store.changesCount, before); assert.equal(r.writers(), writers); assert.equal(r.posts().length, posts);
  assert.equal((await client.detail(randomUUID(), request.scope)).kind, 'not-found');
  const stale = { ...request.scope, contextRevision: 'b'.repeat(64) }; assert.equal((await client.list(stale)).kind, 'context-changed');
  const locked = await createTaskIntentsClient({ fetch: () => Promise.resolve(json(401, {})) }).check(request.attemptId, request.scope); assert.equal(locked.kind, 'locked'); assert.deepEqual(hook.seen, ['locked']);
  const other = await createTaskIntentsClient({ fetch: () => Promise.resolve(json(200, { ...(check as { value: object }).value, operation: { ...(check as { value: { operation: object } }).value.operation, attemptId: randomUUID() } })) }).check(request.attemptId, request.scope);
  assert.deepEqual([other.kind, (other as { cause?: string }).cause], ['unavailable', 'mismatched-receipt']);
  const slow = await createTaskIntentsClient({ fetch: () => new Promise<Response>(() => undefined), readTimeoutMs: 30 }).list(request.scope); assert.deepEqual([slow.kind, (slow as { cause?: string }).cause], ['unavailable', 'timeout']);
});

test('aceptar y dejar de seguir: bodies con secuencia y revisión observadas; el recibo debe ser del mismo intento y desenlace; un 409 conserva el intento', async t => {
  const r = await rig(t), request = r.input(), client = createTaskIntentsClient({ fetch: r.fetcher });
  // Intento pendiente sin asentar: el escritor devuelve un fallo que el servicio traduce a «intento sin asentar».
  const f = await createBaseApp({ dbPath: ':memory:', root: '.', staticDir: 'none' }); t.after(() => f.app.close());
  const snapshot = makeFixture('agency'); f.store.importSnapshot(snapshot); f.store.saveGeneration(makeDemoSpec(snapshot), { provider: 'demo', model: null, prompt: '', generatedAt: at, approved: false }); f.store.activate();
  registerTaskIntents(f.app, f.store, { now: () => at, afterPersist: async () => { throw new Error('fallo de persistencia simulado'); } });
  const fetcher: typeof fetch = async (input, init) => { const url = new URL(String(input), 'http://127.0.0.1'); const x = await f.app.inject({ method: (init?.method ?? 'GET') as 'GET', url: url.pathname + url.search, headers: { host: '127.0.0.1', 'content-type': 'application/json' }, payload: init?.body as string | undefined }); return new Response(x.body, { status: x.statusCode }); };
  const pending = createTaskIntentsClient({ fetch: fetcher }), scope = currentTaskIntentScope(f.store), attemptId = randomUUID();
  const executed = await pending.execute({ scope, attemptId, taskId: 'task-2', expectedRevision: readTaskRevision(f.store, 'task-2').revision, values: { notes: 'pendiente' } });
  assert.equal(executed.kind, 'execution'); const op = (executed as { execution: TaskIntentExecution }).execution.operation; assert.equal(op.phase, 'attempt'); assert.equal(f.store.changesCount, 0);
  const stale = await pending.accept(attemptId, scope, { seq: op.seq, taskRevision: readTaskRevision(f.store, 'task-2').revision }); assert.equal(stale.kind, 'conflict', 'sin evidencia aplicada no se acepta');
  const wrongSeq = await pending.abandon(attemptId, scope, { seq: op.seq + 5 }); assert.equal(wrongSeq.kind, 'conflict');
  const closed = await pending.abandon(attemptId, scope, { seq: op.seq }); assert.equal(closed.kind, 'ok'); if (closed.kind === 'ok') { assert.equal(closed.detail.operation.outcome, 'abandoned'); assert.equal(closed.detail.operation.provenance, null); }
  assert.equal(f.store.changesCount, 0, 'dejar de seguir no deshace ni escribe la tarea');
  assert.equal((await client.accept(randomUUID(), request.scope, { seq: 1, taskRevision: 'c'.repeat(64) })).kind, 'not-found');
  const mismatch = await createTaskIntentsClient({ fetch: () => Promise.resolve(json(200, { format: 'planb-task-intent-detail-v1', operation: op, payload: null, payloadIssue: 'detail-expired' })) }).abandon(attemptId, scope, { seq: 1 });
  assert.equal(mismatch.kind, 'uncertain', 'un recibo que no es «abandoned» no se acepta');
});
