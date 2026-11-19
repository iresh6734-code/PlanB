import test from 'node:test';
import assert from 'node:assert/strict';
import { createBaseApp } from '../server/app.js';
import { makeDemoSpec, makeFixture } from '../shared/fixtures.js';
import { describeOperation } from '../shared/task-save-outcome.js';
import { createTaskSaveOutcomes, legacyStrategy, type SubmitInput } from '../src/task-save-outcome.js';
import { loadRevisedTask, revisionStrategy, type RevisedTask } from '../src/task-revision-strategy.js';

// Unidad 233 · guardado condicionado en el gestor, contra el servidor REAL con revisiones (createBaseApp({ taskRevisions: true }), SQLite en memoria, 127.0.0.1). Los fallos de red se
// inyectan envolviendo `fetch` (la petición llega al servidor real y se retiene o pierde la RESPUESTA). Datos ficticios; red externa no usada.
async function rig(prepare?: (snapshot: ReturnType<typeof makeFixture>) => void) {
  const { app, store } = await createBaseApp({ dbPath: ':memory:', root: '.', staticDir: 'none', taskRevisions: true });
  const patches: { url: string; body: unknown }[] = [];
  app.addHook('preHandler', async request => { if (request.method === 'PATCH') patches.push({ url: request.url, body: request.body }); });
  const snapshot = makeFixture('agency'); prepare?.(snapshot); const seed = () => { store.importSnapshot(snapshot); store.saveGeneration(makeDemoSpec(snapshot), { provider: 'demo', model: null, generatedAt: '2026-11-02T09:00:00Z', prompt: '', approved: false }); store.activate(); }; seed();
  await app.listen({ host: '127.0.0.1', port: 0 }); const base = 'http://127.0.0.1:' + (app.server.address() as { port: number }).port;
  return { app, store, base, patches, snapshot, close: () => app.close(), regenerate: (at: string) => { store.saveGeneration(makeDemoSpec(snapshot), { provider: 'demo', model: null, generatedAt: at, prompt: '', approved: false }); store.activate(); } };
}
type Rig = Awaited<ReturnType<typeof rig>>;
const withRig = async (fn: (r: Rig) => Promise<void>, prepare?: Parameters<typeof rig>[0]) => { const r = await rig(prepare); try { await fn(r); } finally { await r.close(); } };
const gate = () => { let release!: () => void; const promise = new Promise<void>(resolve => { release = resolve; }); return { promise, release }; };
async function open(r: Rig, id: string, fetcher?: typeof fetch): Promise<Extract<RevisedTask, { kind: 'ok' }>> { const loaded = await loadRevisedTask(id, undefined, { base: r.base, fetch: fetcher }); assert.equal(loaded.kind, 'ok'); return loaded as Extract<RevisedTask, { kind: 'ok' }>; }
const input = (loaded: Extract<RevisedTask, { kind: 'ok' }>, patch: SubmitInput['patch'], extra: Partial<SubmitInput> = {}): SubmitInput => ({
  taskId: loaded.record.id, taskLabel: String(loaded.record.values.subject) + ' (' + loaded.record.id + ')', baseline: loaded.record, entity: loaded.schema!.entity, patch, context: loaded.context, revision: loaded.revision, ...extra });
const started = (s: ReturnType<ReturnType<typeof createTaskSaveOutcomes>['submit']>) => { assert.equal(s.kind, 'started'); return s as Extract<typeof s, { kind: 'started' }>; };
const conditioned = (r: Rig) => r.patches.filter(p => p.url.startsWith('/api/v7/task-revision/')), legacy = (r: Rig) => r.patches.filter(p => p.url.startsWith('/api/records/'));

test('guardado normal: UN PATCH condicionado con el token revisado y UN cambio de historial; el resultado conserva token y registro de la misma lectura; ningún PATCH por la ruta anterior', () => withRig(async r => {
  const loaded = await open(r, 'task-2'), controller = createTaskSaveOutcomes({ strategy: revisionStrategy({ base: r.base }) }), before = r.store.changes().length;
  const op = await started(controller.submit(input(loaded, { status: 'completed' }))).done;
  assert.equal(op.status, 'confirmed'); assert.equal(op.detail.kind, 'saved'); assert.ok(op.revised); assert.equal(op.revised!.changed, true); assert.notEqual(op.revised!.token, loaded.revision, 'token nuevo de la escritura');
  assert.equal(op.revised!.current.values.status, 'completed'); assert.deepEqual(op.record, op.revised!.current, 'registro y token de la MISMA lectura validada'); assert.equal(op.revision, loaded.revision, 'la operación conserva el token ORIGINAL revisado');
  assert.equal(conditioned(r).length, 1); assert.deepEqual((conditioned(r)[0].body as { expectedRevision: string }).expectedRevision, loaded.revision); assert.equal(legacy(r).length, 0); assert.equal(r.store.changes().length, before + 1);
  assert.match(describeOperation(op).lines.join(' '), /Se guardó contra la revisión que abriste/); assert.equal(describeOperation(op).title.startsWith('Guardado confirmado'), true); await controller.whenIdle();
}));

test('NO-OP: el servidor confirma que ya tenía esos valores: sin historial, sin contador y NO se anuncia como guardado ni como otra escritura', () => withRig(async r => {
  const loaded = await open(r, 'task-2'), controller = createTaskSaveOutcomes({ strategy: revisionStrategy({ base: r.base }) }), before = r.store.changes().length, count = r.store.changesCount;
  const op = await started(controller.submit(input(loaded, { status: loaded.record.values.status as string, notes: loaded.record.values.notes as string, subject: 'Otro asunto' }))).done;   // un campo distinto para que el patch no esté vacío…
  assert.equal(op.status, 'confirmed'); assert.notEqual(op.detail.kind, 'unchanged', 'con un valor distinto SÍ escribe');
  const second = await open(r, 'task-3'), noop = await started(controller.submit(input(second, { status: second.record.values.status as string, notes: second.record.values.notes as string }))).done;
  assert.equal(noop.status, 'confirmed'); assert.equal(noop.detail.kind, 'unchanged'); assert.equal(noop.revised!.changed, false); assert.equal(noop.revised!.token, second.revision, 'sin escritura el token no cambia');
  assert.equal(r.store.changes().length, before + 1, 'solo la primera escritura dejó historial'); assert.equal(r.store.changesCount, count + 1);
  const described = describeOperation(noop); assert.match(described.title, /^Sin cambios en/); assert.match(described.lines.join(' '), /no se escribió nada ni se añadió historial/); assert.doesNotMatch(described.title + described.lines.join(' '), /Guardado confirmado|Cambios guardados/);
  assert.equal(legacy(r).length, 0); await controller.whenIdle();
}));

test('DOS EDITORES desde la misma revisión: gana uno; el otro recibe conflicto SIN escritura, conserva su intención y el token original, y no hay reenvío silencioso', () => withRig(async r => {
  const a = await open(r, 'task-2'), b = await open(r, 'task-2'); assert.equal(a.revision, b.revision, 'misma revisión de partida');
  const controllerA = createTaskSaveOutcomes({ strategy: revisionStrategy({ base: r.base }) }), controllerB = createTaskSaveOutcomes({ strategy: revisionStrategy({ base: r.base }) });
  const winner = await started(controllerA.submit(input(a, { status: 'completed' }))).done; assert.equal(winner.status, 'confirmed'); const changesAfterWinner = r.store.changes().length;
  const loser = await started(controllerB.submit(input(b, { notes: 'Mi nota (editor B)' }))).done;
  assert.equal(loser.status, 'rejected'); assert.equal(loser.detail.httpStatus, 409); assert.equal(loser.detail.revisionConflict, true); assert.match(loser.detail.message, /conflicto/);
  assert.deepEqual(loser.patch, { notes: 'Mi nota (editor B)' }, 'su intención se conserva'); assert.equal(loser.revision, b.revision, 'el token original no se renueva'); assert.equal(loser.revised ?? null, null);
  assert.equal(r.store.changes().length, changesAfterWinner, 'el conflicto no escribió nada'); assert.equal(conditioned(r).length, 2, 'un PATCH por editor y NINGÚN reintento'); assert.notEqual(r.store.record('tasks', 'task-2')!.values.notes, 'Mi nota (editor B)');
  // Solo una decisión nueva (leer la versión actual) permite otro intento, con el token de ESA lectura.
  const fresh = await open(r, 'task-2'); assert.notEqual(fresh.revision, b.revision); const again = await started(controllerB.submit(input(fresh, { notes: 'Mi nota (editor B)' }))).done;
  assert.equal(again.status, 'confirmed'); assert.equal(r.store.changes().length, changesAfterWinner + 1); assert.equal(r.store.record('tasks', 'task-2')!.values.status, 'completed', 'el cambio ganador sigue ahí'); assert.equal(legacy(r).length, 0);
}));

test('cambio de GENERACIÓN: antes de enviar la comprobación de contexto lo detecta (no sale ningún PATCH); si ocurre DESPUÉS de esa comprobación, el servidor responde 409 sin escribir; en ambos casos hace falta una lectura explícita nueva', () => withRig(async r => {
  const loaded = await open(r, 'task-2'), controller = createTaskSaveOutcomes({ strategy: revisionStrategy({ base: r.base }) }), before = r.store.changes().length;
  r.regenerate('2026-11-03T09:00:00Z');
  const early = await started(controller.submit(input(loaded, { status: loaded.record.values.status as string, subject: loaded.record.values.subject as string }))).done;
  assert.equal(early.status, 'not_sent'); assert.equal(early.detail.kind, 'context-changed'); assert.equal(r.patches.length, 0); assert.equal(r.store.changes().length, before);
  // Carrera: la generación cambia entre la comprobación de contexto y la escritura (el PATCH se retiene en el navegador y llega después).
  const fresh = await open(r, 'task-2'), barrier = gate(); let reached: () => void = () => undefined; const at = new Promise<void>(resolve => { reached = resolve; });
  const held: typeof fetch = async (input, init) => { if (init?.method === 'PATCH') { reached(); await barrier.promise; } return fetch(input, init); };
  const racing = createTaskSaveOutcomes({ strategy: revisionStrategy({ base: r.base, fetch: held }) }); const sub = started(racing.submit(input(fresh, { status: 'completed' }))); await at; r.regenerate('2026-11-04T09:00:00Z'); barrier.release(); const late = await sub.done;
  assert.equal(late.status, 'rejected'); assert.equal(late.detail.revisionConflict, true); assert.equal(r.store.changes().length, before, 'el 409 no escribió'); assert.equal(legacy(r).length, 0); assert.equal(late.revision, fresh.revision, 'el token original no se renueva');
}));

test('ACUSE PERDIDO: incierto; la comprobación solo hace GET (cero PATCH nuevos), una coincidencia no prueba autoría y aceptar es una decisión humana con procedencia propia', () => withRig(async r => {
  const loaded = await open(r, 'task-2'), barrier = gate(); let methods: string[] = [];
  const lossy: typeof fetch = async (input, init) => { methods.push(init?.method ?? 'GET'); const response = await fetch(input, init); if (init?.method === 'PATCH') { await barrier.promise; throw new TypeError('acuse perdido'); } return response; };
  const controller = createTaskSaveOutcomes({ strategy: revisionStrategy({ base: r.base, fetch: lossy }) }); const sub = started(controller.submit(input(loaded, { status: 'completed' }))); barrier.release(); const op = await sub.done;
  assert.equal(op.status, 'uncertain'); assert.equal(conditioned(r).length, 1); assert.equal(r.store.changes().length, 1, 'el servidor SÍ lo aplicó'); assert.equal(op.revised ?? null, null, 'sin acuse validado no hay `revised`');
  methods = []; await controller.verify(op.attemptId); const checked = controller.get(op.attemptId)!;
  assert.deepEqual([...new Set(methods)], ['GET'], 'la comprobación solo lee'); assert.equal(conditioned(r).length, 1, 'ningún PATCH nuevo'); assert.equal(checked.evidence!.kind, 'applied');
  assert.equal(controller.get(op.attemptId)!.status, 'uncertain', 'ver coincidencia no resuelve nada por sí solo'); assert.equal(controller.accept(op.attemptId), true); const accepted = controller.get(op.attemptId)!;
  assert.equal(accepted.status, 'accepted'); assert.equal(accepted.detail.kind, 'accepted'); assert.equal(accepted.revised ?? null, null, 'aceptar una lectura no fabrica un resultado condicionado'); assert.match(describeOperation(accepted).lines.join(' '), /no se sabe si lo aplicó tu solicitud u otra edición idéntica/);
  assert.equal(r.store.changes().length, 1); await controller.whenIdle();
}));

test('422: el servidor rechaza y no escribe; los campos se conservan por clave; el token original sigue siendo el de la operación', () => withRig(async r => {
  const loaded = await open(r, 'task-2'), controller = createTaskSaveOutcomes({ strategy: revisionStrategy({ base: r.base }) }), before = r.store.changes().length;
  const op = await started(controller.submit(input(loaded, { campo_inexistente: 'x' }))).done;
  assert.ok(['rejected'].includes(op.status)); assert.equal(op.detail.httpStatus, 422); assert.equal(r.store.changes().length, before); assert.equal(op.revision, loaded.revision); assert.equal(legacy(r).length, 0);
}));

test('copia distinta al enviar (cambio de captura): «no enviado», cero PATCH, el borrador se conserva', () => withRig(async r => {
  const loaded = await open(r, 'task-2'), controller = createTaskSaveOutcomes({ strategy: revisionStrategy({ base: r.base }) });
  const next = makeFixture('agency'); next.id = r.store.snapshot!.id; next.capturedAt = '2026-11-09T09:00:00.000Z'; r.store.importSnapshot(next, true); r.store.saveGeneration(makeDemoSpec(next), { provider: 'demo', model: null, generatedAt: '2026-11-09T09:00:00Z', prompt: '', approved: false }); r.store.activate();
  const op = await started(controller.submit(input(loaded, { status: 'completed' }))).done;
  assert.equal(op.status, 'not_sent'); assert.equal(op.detail.kind, 'context-changed'); assert.equal(r.patches.length, 0); assert.deepEqual(op.patch, { status: 'completed' });
}));

test('puerta onDispatch: tras dispose() con la comprobación de contexto retenida NO sale ningún PATCH y queda «no enviado»', () => withRig(async r => {
  const loaded = await open(r, 'task-2'), barrier = gate(); let reached: () => void = () => undefined; const at = new Promise<void>(resolve => { reached = resolve; });
  const held: typeof fetch = async (input, init) => { if (!init?.method && String(input).includes('/api/health')) { reached(); await barrier.promise; } return fetch(input, init); };
  const controller = createTaskSaveOutcomes({ strategy: revisionStrategy({ base: r.base, fetch: held }) }); const sub = started(controller.submit(input(loaded, { status: 'completed' }))); await at;
  const summary = controller.dispose(); assert.deepEqual(summary, { notDispatched: 1, dispatched: 0 }); barrier.release(); const op = await sub.done;
  assert.equal(op.status, 'not_sent'); assert.equal(op.detail.kind, 'disposed'); assert.equal(r.patches.length, 0); assert.equal(r.store.changes().length, 0);
}));

test('SIN fallback a la ruta anterior: un fallo del endpoint condicionado (500, 401) no dispara ningún PATCH legacy; 401 → bloqueada; 500 → incierto', () => withRig(async r => {
  for (const [status, expected] of [[500, 'uncertain'], [401, 'rejected']] as const) {
    const loaded = await open(r, 'task-2'), failing: typeof fetch = async (input, init) => init?.method === 'PATCH' ? new Response(JSON.stringify({ error: 'x' }), { status, headers: { 'content-type': 'application/json' } }) : fetch(input, init);
    const controller = createTaskSaveOutcomes({ strategy: revisionStrategy({ base: r.base, fetch: failing }) }); const op = await started(controller.submit(input(loaded, { status: 'completed' }))).done;
    assert.equal(op.status, expected, String(status)); if (status === 401) assert.equal(op.detail.kind, 'locked'); assert.equal(legacy(r).length, 0, 'ni un PATCH por la ruta anterior'); assert.equal(r.store.changes().length, 0);
  }
}));

test('sin token o sin contexto no se envía nada (no se guarda «sin revisión» por otra vía)', () => withRig(async r => {
  const loaded = await open(r, 'task-2'), controller = createTaskSaveOutcomes({ strategy: revisionStrategy({ base: r.base }) });
  const a = await started(controller.submit(input(loaded, { status: 'completed' }, { revision: null }))).done; assert.equal(a.status, 'not_sent'); assert.match(a.detail.message, /Falta la revisión/);
  const b = await started(controller.submit(input(loaded, { notes: 'x' }, { context: { ...loaded.context, instanceId: null } }))).done; assert.equal(b.status, 'not_sent'); assert.equal(r.patches.length, 0);
}));

test('la estrategia anterior sigue igual: legacyStrategy guarda por la ruta antigua y su resultado no lleva `revised`', () => withRig(async r => {
  const loaded = await open(r, 'task-2'), controller = createTaskSaveOutcomes({ strategy: legacyStrategy({ base: r.base, fetch: (input, init) => fetch(input, init) }) });
  const op = await started(controller.submit(input(loaded, { status: 'completed' }, { revision: null }))).done; assert.equal(op.status, 'confirmed'); assert.equal(op.revised ?? null, null); assert.equal(legacy(r).length, 1); assert.equal(conditioned(r).length, 0);
  assert.doesNotMatch(describeOperation(op).lines.join(' '), /revisión que abriste/);
}));

// ── R2 · la tarea declarada y el registro revisado deben ser LA MISMA ──────────────────────────────────────────────────────────────────────
// Dos tareas HOMÓNIMAS (mismo asunto, mismo estado) para que ningún texto delate el cruce: solo los ID las distinguen. Un adaptador que mezclara la selección actual con la lectura retenida
// de otra ficha entregaría al gestor `taskId` de una y registro/token de la otra.
const homonyms = (snapshot: ReturnType<typeof makeFixture>) => {
  for (const id of ['task-1', 'task-2']) { const row = snapshot.records.find(record => record.entity === 'tasks' && record.id === id)!; row.values.subject = 'Mismo nombre ficticio'; row.values.status = 'pending'; }
};
const counting = (log: { url: string; method: string }[]): typeof fetch => (input, init) => { log.push({ url: String(input).replace(/^https?:\/\/[^/]+/, ''), method: init?.method ?? 'GET' }); return fetch(input, init); };

test('R2 · un guardado que declara task-1 con la base y el token de task-2 NO sale: cero peticiones, cero PATCH, cero historial, la intención se conserva y no hay `revised`', () => withRig(async r => {
  const loaded = await open(r, 'task-2'), log: { url: string; method: string }[] = [], controller = createTaskSaveOutcomes({ strategy: revisionStrategy({ base: r.base, fetch: counting(log) }) });
  const before = { changes: r.store.changes().length, count: r.store.changesCount, status: r.store.record('tasks', 'task-2')!.values.status, other: r.store.record('tasks', 'task-1')!.values.status };
  const op = await started(controller.submit(input(loaded, { status: 'completed' }, { taskId: 'task-1', taskLabel: 'Mismo nombre ficticio (task-1)' }))).done;
  assert.deepEqual({ status: op.status, taskId: op.taskId, requests: log, patches: r.patches.length, conditioned: conditioned(r).length, legacy: legacy(r).length }, { status: 'not_sent', taskId: 'task-1', requests: [], patches: 0, conditioned: 0, legacy: 0 }, 'ni una petición, ni siquiera de lectura');
  assert.match(op.detail.message, /no es la que abriste \(task-2\)/); assert.match(op.detail.message, /No se envió nada/); assert.equal(op.revised ?? null, null, 'sin resultado revisado'); assert.equal(op.record ?? null, null, 'ningún registro de otra tarea se atribuye al intento');
  assert.deepEqual(op.patch, { status: 'completed' }, 'la intención se conserva'); assert.equal(op.revision, loaded.revision, 'y el token original');
  assert.deepEqual({ changes: r.store.changes().length, count: r.store.changesCount, status: r.store.record('tasks', 'task-2')!.values.status, other: r.store.record('tasks', 'task-1')!.values.status }, before, 'ninguna de las dos tareas ni el historial cambió');
  await controller.whenIdle();
}, homonyms));

test('R2 · verificar con ID discrepantes devuelve «desconocido» y NO hace ninguna petición: no se lee otra tarea como evidencia', () => withRig(async r => {
  const loaded = await open(r, 'task-2'), log: { url: string; method: string }[] = [], strategy = revisionStrategy({ base: r.base, fetch: counting(log) });
  const mismatched = await strategy.verify({ ...input(loaded, { status: 'completed' }), taskId: 'task-1', revision: loaded.revision ?? null } as never);
  assert.deepEqual({ kind: mismatched.kind, requests: log }, { kind: 'unknown', requests: [] });
  // Control: con los dos IDs correctos sí lee (solo GET) y la evidencia es de la tarea correcta.
  const correct = await strategy.verify({ ...input(loaded, { status: 'completed' }), revision: loaded.revision ?? null } as never);
  assert.equal(correct.kind, 'read'); assert.ok(log.length > 0 && log.every(entry => entry.method === 'GET'), 'solo lecturas'); assert.ok(log.some(entry => entry.url.endsWith('/task-2')) && !log.some(entry => entry.url.endsWith('/task-1')), 'lee task-2, nunca task-1');
}, homonyms));

test('R2 · CONTROL positivo: con el mismo token y ambos identificadores correctos se guarda UNA vez contra /task-2 y el registro devuelto es el de la tarea del intento', () => withRig(async r => {
  const loaded = await open(r, 'task-2'), controller = createTaskSaveOutcomes({ strategy: revisionStrategy({ base: r.base }) }), before = r.store.changes().length;
  const op = await started(controller.submit(input(loaded, { status: 'completed' }))).done;
  assert.equal(op.status, 'confirmed'); assert.equal(op.record?.id, op.taskId); assert.equal(op.revision, loaded.revision);
  assert.deepEqual(conditioned(r).map(entry => entry.url), ['/api/v7/task-revision/task-2']); assert.equal(legacy(r).length, 0); assert.equal(r.store.changes().length, before + 1);
  assert.equal(r.store.record('tasks', 'task-2')!.values.status, 'completed'); assert.equal(r.store.record('tasks', 'task-1')!.values.status, 'pending', 'la homónima no se tocó'); await controller.whenIdle();
}, homonyms));

test('R2 · un registro base que no es una tarea tampoco se acepta (la vista revisada exige entidad «tasks»)', () => withRig(async r => {
  const loaded = await open(r, 'task-2'), log: { url: string; method: string }[] = [], controller = createTaskSaveOutcomes({ strategy: revisionStrategy({ base: r.base, fetch: counting(log) }) });
  const notTask = { ...loaded.record, entity: 'contacts' } as typeof loaded.record, op = await started(controller.submit(input(loaded, { status: 'completed' }, { baseline: notTask }))).done;
  assert.equal(op.status, 'not_sent'); assert.deepEqual(log, []); assert.equal(r.patches.length, 0); await controller.whenIdle();
}, homonyms));
