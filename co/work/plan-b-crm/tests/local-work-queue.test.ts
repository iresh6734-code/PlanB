import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import Fastify from 'fastify';
import { createBaseApp } from '../server/app.js';
import { Store, AppError } from '../server/store.js';
import { makeFixture, makeDemoSpec } from '../shared/fixtures.js';
import { contextKey, parseHealth, parseState } from '../shared/local-task-focus.js';
import { LocalOperationsSchema, LocalWorkQueueSchema, WORK_QUEUE_BYTE_BUDGET, WORK_QUEUE_CLIENT_MAX_BYTES, WORK_QUEUE_REFERENCE_LIMIT } from '../shared/local-operations.js';
import { buildResponseQueue } from '../shared/response-queue.js';
import { inspectLocalOperations, inspectLocalWorkQueue, registerLocalOperations } from '../server/local-operations.js';
import { loadLocalOperations, loadLocalWorkQueue, readBoundedText } from '../src/local-operations-client.js';

// Unidad 230 · contrato de la cola de trabajo estructurada de Hoy. Aditivo: el v1 no cambia. Fixtures ficticias, sin red.
const NOW = Date.parse('2026-11-02T08:00:00Z'), clock = () => NOW;
function source(active = true) {
  const store = new Store(':memory:'); store.set('instanceId', randomUUID()); const snapshot = makeFixture('agency'); store.importSnapshot(snapshot);
  if (active) { store.saveGeneration(makeDemoSpec(snapshot), { provider: 'demo', model: null, generatedAt: '2026-11-02T07:00:00.000Z', prompt: '', approved: false }); store.activate(); }
  return store;
}
async function appFor(store: Store) {
  const app = Fastify(); app.setErrorHandler((error, _req, reply) => reply.code(error instanceof AppError ? error.status : 500).send({ error: error instanceof Error ? error.message : 'Error inesperado' }));
  registerLocalOperations(app, store, clock); await app.ready(); return app;
}

test('el recurso v1 NO cambia: mismo esquema estricto, mismas claves, y el recurso nuevo es otro formato (un cliente anterior no lo confunde)', async () => {
  const store = source(); const app = await appFor(store);
  try {
    const v1 = (await app.inject('/api/v7/local-operations')).json(); assert.equal(LocalOperationsSchema.safeParse(v1).success, true); assert.equal(v1.format, 'planb-local-operations-v1');
    assert.deepEqual(Object.keys(v1).sort(), ['context', 'counts', 'evaluatedAt', 'format', 'lastReview', 'limitations', 'reviewable', 'revision', 'tasks', 'unavailableReason'].sort());
    assert.deepEqual(Object.keys(v1.tasks[0]).sort(), ['bucket', 'due', 'dueKind', 'id', 'label', 'nextAction', 'reasons'].sort());
    const work = (await app.inject('/api/v7/local-operations/work')).json(); assert.equal(work.format, 'planb-local-work-queue-v1'); assert.equal(LocalOperationsSchema.safeParse(work).success, false, 'un cliente v1 estricto rechaza el recurso nuevo sin confundirlo');
    assert.equal(LocalWorkQueueSchema.safeParse(v1).success, false);
  } finally { await app.close(); store.close(); }
});
test('cola real: estado, referencias y orden vienen de buildResponseQueue; sin textos de presentación', () => {
  const store = source(); try {
    const work = inspectLocalWorkQueue(store, clock), real = buildResponseQueue({ spec: store.spec!, records: store.records(), evaluatedAt: NOW, horizonHours: 24, limit: 200 });
    assert.equal(LocalWorkQueueSchema.safeParse(work).success, true); assert.deepEqual(work.tasks.map(t => t.id), real.items.map(i => i.id), 'mismo orden de prioridad');
    for (const [i, item] of real.items.entries()) { const t = work.tasks[i]; assert.equal(t.status, item.status); assert.equal(t.bucket, item.bucket); assert.deepEqual(t.due, { kind: item.due.kind, value: item.due.value, localDate: item.due.localDate }); assert.deepEqual(t.reasonCodes, item.reasons.map(r => r.code)); assert.equal(t.references.length, item.references.length); }
    assert.ok(work.tasks.some(t => t.references.length > 0 && t.references.every(r => r.state === 'found')), 'las referencias existentes son «found»');
    const text = JSON.stringify(work); assert.doesNotMatch(text, /nextAction|Abrir la tarea|El día de vencimiento|Planificar esta tarea/, 'nada de textos de presentación');
    assert.deepEqual(work.counts, { tasks: real.summary.totalTasks, completed: real.summary.completedTasks, knownOpen: real.summary.knownOpenTasks, unknownStatus: real.summary.unknownStatusTasks, queued: real.summary.totalQueued, returned: real.items.length, notReturned: 0 });
  } finally { store.close(); }
});
test('la identidad coincide con la que calcula la FICHA (contextKey desde /api/health + /api/v2/state) para la misma copia', async () => {
  const { app, store } = await createBaseApp({ dbPath: ':memory:', root: '.', staticDir: 'none' });
  try {
    store.set('instanceId', randomUUID()); const snapshot = makeFixture('agency'); store.importSnapshot(snapshot);
    store.saveGeneration(makeDemoSpec(snapshot), { provider: 'demo', model: null, generatedAt: '2026-11-02T07:00:00.000Z', prompt: '', approved: false }); store.activate();
    const health = parseHealth((await app.inject('/api/health')).json()), state = parseState((await app.inject('/api/v2/state')).json()); assert.ok(health && state);
    const ficha = contextKey({ ...state.context, instanceId: health.instanceId }), work = inspectLocalWorkQueue(store, clock);
    assert.ok(work.identity); assert.equal(contextKey({ instanceId: work.identity.instanceId, snapshotId: work.identity.snapshotId, capturedAt: work.identity.capturedAt, captureStartedAt: work.identity.captureStartedAt, accountId: work.identity.accountId, generatedAt: work.identity.generatedAt }), ficha);
    assert.equal(work.identity.generatedAt, '2026-11-02T07:00:00.000Z');
  } finally { await app.close(); }
});
test('otra captura o regenerar la aplicación CAMBIA la identidad (misma tarea, otra copia)', () => {
  const store = source(); try {
    const a = inspectLocalWorkQueue(store, clock).identity!; const next = makeFixture('agency'); next.id = store.snapshot!.id; next.capturedAt = '2026-11-09T09:00:00.000Z'; store.importSnapshot(next, true); store.saveGeneration(makeDemoSpec(next), { provider: 'demo', model: null, generatedAt: '2026-11-02T07:00:00.000Z', prompt: '', approved: false }); store.activate();
    const b = inspectLocalWorkQueue(store, clock).identity!; assert.notEqual(b.capturedAt, a.capturedAt); assert.equal(b.snapshotId, a.snapshotId, 'el ID de captura puede repetirse: por eso la identidad lleva la fecha'); assert.notDeepEqual(b, a);
    store.saveGeneration(makeDemoSpec(next), { provider: 'demo', model: null, generatedAt: '2026-11-10T07:00:00.000Z', prompt: '', approved: false }); store.activate(); const c = inspectLocalWorkQueue(store, clock).identity!; assert.notEqual(c.generatedAt, b.generatedAt);
  } finally { store.close(); }
});
test('copia vacía, importada y activa: «sin captura» (counts e identidad null) ≠ cero ≠ desconocido', () => {
  const empty = new Store(':memory:'); empty.set('instanceId', randomUUID());
  try { const w = inspectLocalWorkQueue(empty, clock); assert.deepEqual({ phase: w.phase, identity: w.identity, counts: w.counts, tasks: w.tasks.length }, { phase: 'empty', identity: null, counts: null, tasks: 0 }); } finally { empty.close(); }
  const imported = source(false), active = source(true);
  try {
    const i = inspectLocalWorkQueue(imported, clock), a = inspectLocalWorkQueue(active, clock); assert.equal(i.phase, 'imported'); assert.equal(i.identity!.generatedAt, null, 'sin generación activa la fecha de generación es null, no «cero»'); assert.equal(a.phase, 'active'); assert.ok(a.identity!.generatedAt);
    assert.ok(i.counts && i.counts.tasks > 0);
    const none = source(true); const snap = structuredClone(none.snapshot!); snap.manifest.expectedCounts.tasks = 0; none.set('snapshot', snap); for (const r of none.records().filter(r => r.entity === 'tasks')) none.db.prepare('DELETE FROM records WHERE entity=? AND id=?').run('tasks', r.id);
    const zero = inspectLocalWorkQueue(none, clock); assert.deepEqual(zero.counts, { tasks: 0, completed: 0, knownOpen: 0, unknownStatus: 0, queued: 0, returned: 0, notReturned: 0 }, 'cero exacto, no null'); assert.ok(zero.identity); none.close();
  } finally { imported.close(); active.close(); }
});
test('referencias: «found», «missing» (la copia captura la entidad y falta el registro) y «not-captured» (la copia no captura esa entidad)', () => {
  const store = source(); try {
    const snapshot = structuredClone(store.snapshot!); snapshot.entities = snapshot.entities.filter(entity => entity.id !== 'deals'); store.set('snapshot', snapshot);   // la copia (con su aplicación activa) ya no captura oportunidades
    store.db.prepare('DELETE FROM records WHERE entity=?').run('deals');
    store.db.prepare('DELETE FROM records WHERE entity=? AND id=?').run('contacts', 'contact-2');                                                     // y a task-2 le falta su contacto
    const work = inspectLocalWorkQueue(store, clock), task2 = work.tasks.find(t => t.id === 'task-2')!, task3 = work.tasks.find(t => t.id === 'task-3')!;
    assert.equal(task2.references.find(r => r.entity === 'contacts')!.state, 'missing'); assert.equal(task2.references.find(r => r.entity === 'deals')!.state, 'not-captured', 'fuera del alcance: no se puede comprobar, no es «falta»');
    assert.equal(task3.references.find(r => r.entity === 'contacts')!.state, 'found'); assert.ok(task2.reasonCodes.includes('missing-reference'));
  } finally { store.close(); }
});
test('límite: con más de 200 tareas se devuelven 200 y se cuentan las NO devueltas; los recuentos cubren toda la copia', () => {
  const store = source(); try {
    const template = store.records().find(r => r.entity === 'tasks' && r.values.status !== 'completed')!;
    store.transaction(() => { for (let i = 0; i < 260; i++) store.db.prepare('INSERT INTO records(entity,id,value) VALUES(?,?,?)').run('tasks', 'extra-' + i, JSON.stringify({ ...template, id: 'extra-' + i })); });
    const work = inspectLocalWorkQueue(store, clock); assert.equal(work.tasks.length, 200); assert.equal(work.counts!.returned, 200); assert.equal(work.counts!.notReturned, work.counts!.queued - 200); assert.ok(work.counts!.notReturned > 0);
    assert.match(work.limitations.join(' '), /primeras 200 tareas/); assert.equal(LocalWorkQueueSchema.safeParse(work).success, true);
  } finally { store.close(); }
});
test('estado desconocido se distingue de abierto; no es una tarea sin urgencia', () => {
  const store = source(); try {
    const template = store.records().find(r => r.entity === 'tasks' && r.values.status !== 'completed')!;
    store.db.prepare('INSERT INTO records(entity,id,value) VALUES(?,?,?)').run('tasks', 'unk-1', JSON.stringify({ ...template, id: 'unk-1', values: { ...template.values, status: 'estado-que-no-existe' } }));
    const work = inspectLocalWorkQueue(store, clock), t = work.tasks.find(x => x.id === 'unk-1'); assert.ok(t); assert.equal(t.status, 'unknown'); assert.equal(t.bucket, 'needs-review'); assert.ok(t.reasonCodes.includes('unknown-status'));
    assert.equal(work.tasks.find(x => x.id === template.id)!.status, 'open'); assert.ok(work.counts!.unknownStatus >= 1);
  } finally { store.close(); }
});
test('HTTP: no-store, solo lectura (sin POST) y errores del servidor sin filtrar; el cliente nuevo y el anterior funcionan contra el MISMO servidor', async () => {
  const store = source(); const app = await appFor(store); const realFetch = globalThis.fetch;
  try {
    const res = await app.inject('/api/v7/local-operations/work'); assert.equal(res.statusCode, 200); assert.match(String(res.headers['cache-control']), /no-store/); assert.match(String(res.headers.vary), /Cookie/);
    assert.equal((await app.inject({ method: 'POST', url: '/api/v7/local-operations/work', payload: {} })).statusCode, 404);
    globalThis.fetch = (async (input: string | URL | Request) => { const r = await app.inject(String(input)); return new Response(r.body, { status: r.statusCode, headers: { 'content-type': 'application/json' } }); }) as typeof fetch;
    const abort = new AbortController(); const [oldClient, newClient] = await Promise.all([loadLocalOperations(abort.signal), loadLocalWorkQueue(abort.signal)]);
    assert.equal(oldClient.format, 'planb-local-operations-v1'); assert.equal(newClient.format, 'planb-local-work-queue-v1'); assert.deepEqual(newClient.tasks.map(t => t.id), oldClient.tasks.map(t => t.id), 'mismas tareas y mismo orden en los dos recursos');
    globalThis.fetch = (async () => new Response(JSON.stringify({ format: 'planb-local-work-queue-v1', extra: 1 }), { status: 200 })) as unknown as typeof fetch;
    await assert.rejects(loadLocalWorkQueue(abort.signal), /no es compatible/);
    globalThis.fetch = (async () => new Response(JSON.stringify({ error: 'No hay recurso' }), { status: 404 })) as unknown as typeof fetch;
    await assert.rejects(loadLocalWorkQueue(abort.signal), /No hay recurso/);
  } finally { globalThis.fetch = realFetch; await app.close(); store.close(); }
});
test('solo lectura: pedir la cola no cambia ningún byte de la copia', async () => {
  const store = source(); const app = await appFor(store); const dump = () => JSON.stringify(['meta', 'records', 'changes'].map(t => store.db.prepare('SELECT * FROM ' + t + ' ORDER BY rowid').all()));
  try { const before = dump(); await app.inject('/api/v7/local-operations/work'); inspectLocalWorkQueue(store, clock); assert.equal(dump(), before); assert.equal(inspectLocalOperations(store, clock).format, 'planb-local-operations-v1'); } finally { await app.close(); store.close(); }
});

// ── R2 · asociaciones, presupuesto de bytes y coherencia de fase ───────────────────────────────────────────────────────────────────────────
// Todo por la importación NORMAL de Store (importSnapshot + activate) con datos ficticios; solo la rama defensiva «not-captured» manipula las entidades (ver su prueba).
const generation = { provider: 'demo' as const, model: null, generatedAt: '2026-11-02T07:00:00.000Z', prompt: '', approved: false };
function activeStore(snapshot: ReturnType<typeof makeFixture>) {
  const store = new Store(':memory:'); store.set('instanceId', randomUUID());
  assert.equal(store.importSnapshot(snapshot).complete, true); store.saveGeneration(makeDemoSpec(snapshot), generation); store.activate(); assert.equal(store.ready, true);
  return store;
}
/** `refs` campos de referencia extra en tareas; `taskCount` tareas pendientes con vencimiento antiguo; `ghosts` de esas asociaciones (las últimas) apuntan a contactos que existen al importar y se borran DESPUÉS con `dropGhosts` (la importación normal rechaza una referencia sin destino). */
function bigSnapshot({ refs, idLength = 6, taskCount = 1, ghosts = 0, label = '' }: { refs: number; idLength?: number; taskCount?: number; ghosts?: number; label?: string }) {
  const snapshot = makeFixture('agency');
  const taskEntity = snapshot.entities.find(entity => entity.id === 'tasks')!;
  const reference = taskEntity.fields.find(field => field.type === 'reference' && field.referenceEntity === 'contacts')!;
  const keys = Array.from({ length: refs }, (_, index) => 'verified_ref_' + String(index).padStart(2, '0'));
  for (const key of keys) taskEntity.fields.push({ ...reference, key, label: key, required: false });
  const contact = snapshot.records.find(record => record.entity === 'contacts')!;
  const contactId = 'ficticio_contacto_' + 'x'.repeat(idLength);
  snapshot.records.push({ ...structuredClone(contact), id: contactId }); snapshot.manifest.expectedCounts.contacts++;
  const template = snapshot.records.find(record => record.entity === 'tasks' && record.values.status === 'pending')!;
  const ghostIds = Array.from({ length: ghosts }, (_, index) => 'fantasma_' + index + '_' + 'y'.repeat(idLength));
  for (const id of ghostIds) { snapshot.records.push({ ...structuredClone(contact), id }); snapshot.manifest.expectedCounts.contacts++; }
  const fill = (values: Record<string, unknown>) => keys.forEach((key, index) => { values[key] = index >= refs - ghosts ? ghostIds[index - (refs - ghosts)] : contactId; });
  if (taskCount === 1) fill(template.values);
  else {
    for (let index = 0; index < taskCount; index++) {
      const extra = structuredClone(template); extra.id = 'frontera-' + String(index).padStart(3, '0') + label; extra.values.due_date = '2001-01-01'; fill(extra.values); snapshot.records.push(extra);
    }
    snapshot.manifest.expectedCounts.tasks += taskCount;
  }
  return { snapshot, taskId: template.id, contactId, ghostIds };
}
const bytesOf = (value: unknown) => Buffer.byteLength(JSON.stringify(value), 'utf8');
/** `page.byteBudget` viaja DENTRO del cuerpo: el tamaño exacto de un cuerpo es el punto fijo de «presupuesto = bytes de la respuesta que ese presupuesto produce». */
function fixedPoint(store: Store, of: ReturnType<typeof inspectLocalWorkQueue>) {
  let budget = bytesOf(of), produced = inspectLocalWorkQueue(store, clock, { byteBudget: budget });
  for (let guard = 0; guard < 5 && bytesOf(produced) !== budget; guard++) { budget = bytesOf(produced); produced = inspectLocalWorkQueue(store, clock, { byteBudget: budget }); }
  assert.equal(bytesOf(produced), budget, 'convergencia del punto fijo'); return { budget, produced };
}
const fetchBody = (body: string, chunk = 0) => ({ restore: globalThis.fetch, install() {
  globalThis.fetch = (async () => {
    const encoded = new TextEncoder().encode(body), size = chunk || encoded.length;
    return new Response(new ReadableStream<Uint8Array>({ start(controller) { for (let at = 0; at < encoded.length; at += size) controller.enqueue(encoded.subarray(at, at + size)); controller.close(); } }), { status: 200 });   // sin Content-Length
  }) as typeof fetch;
} });

test('R2·1 una tarea con hasta 60 asociaciones válidas sigue legible: identidades exactas, cobertura del total y el recorte distinto de «sin asociaciones»', () => {
  const seen = new Map<number, number>();   // total de asociaciones → omitidas
  for (const refs of [4, 19, 20, 21, 25, 46, 47, 48, 49, 57]) {   // + las 2 asociaciones propias de la tarea de la fixture: totales 6…59, con 22 y 23 (20 y 21 extra), 50 (límite) y 51 (límite + 1)
    const { snapshot, taskId, contactId } = bigSnapshot({ refs }); const store = activeStore(snapshot);
    try {
      const real = buildResponseQueue({ spec: store.spec!, records: store.records(), evaluatedAt: NOW, horizonHours: 24, limit: 200 }).items.find(item => item.id === taskId)!;
      const work = inspectLocalWorkQueue(store, clock), row = work.tasks.find(task => task.id === taskId)!;
      assert.equal(LocalWorkQueueSchema.safeParse(work).success, true, refs + ' asociaciones'); assert.ok(row, 'la tarea sigue en la cola');
      assert.equal(row.referenceCoverage.total, real.references.length); seen.set(real.references.length, row.referenceCoverage.omitted); assert.equal(row.referenceCoverage.found, real.references.length);
      assert.equal(row.references.length, Math.min(real.references.length, WORK_QUEUE_REFERENCE_LIMIT));
      assert.equal(row.referenceCoverage.omitted, Math.max(0, real.references.length - WORK_QUEUE_REFERENCE_LIMIT));
      for (const reference of row.references) assert.ok(real.references.some(candidate => candidate.field === reference.field && candidate.id === reference.id && candidate.entity === reference.entity), 'identidad exacta de ' + reference.field);
      assert.ok(row.references.filter(reference => reference.field.startsWith('verified_ref_')).every(reference => reference.id === contactId), 'ningún identificador acortado');
      assert.equal(real.references.length > WORK_QUEUE_REFERENCE_LIMIT, row.referenceCoverage.omitted > 0, 'recorte ≠ ausencia de asociaciones');
      const v1 = inspectLocalOperations(store, clock); assert.ok(v1.tasks.some(task => task.id === taskId), 'el recurso v1 la sigue mostrando');
    } finally { store.close(); }
  }
  assert.equal(seen.get(22), 0); assert.equal(seen.get(23), 0); assert.equal(seen.get(50), 0, 'en el límite no se recorta'); assert.equal(seen.get(51), 1, 'un paso más y se recorta UNA, contada'); assert.equal(seen.get(59), 9);
  const { snapshot, taskId } = bigSnapshot({ refs: 0 }); const store = activeStore(snapshot);
  try { const task = inspectLocalWorkQueue(store, clock).tasks.find(item => item.id === taskId)!; assert.ok(task.referenceCoverage.total >= 0); assert.equal(task.referenceCoverage.omitted, 0, 'sin recorte'); } finally { store.close(); }
});
test('R2·1 al acotar se conservan SIEMPRE las no comprobables y el motivo se cuenta una sola vez; la cobertura suma todas', () => {
  const { snapshot, taskId, ghostIds } = bigSnapshot({ refs: 60, ghosts: 4 }); const store = activeStore(snapshot);
  try {
    for (const id of ghostIds) store.db.prepare('DELETE FROM records WHERE entity=? AND id=?').run('contacts', id);   // los contactos desaparecen de la copia tras importarla
    const row = inspectLocalWorkQueue(store, clock).tasks.find(task => task.id === taskId)!, coverage = row.referenceCoverage;
    assert.equal(coverage.missing, 4); assert.equal(coverage.total, coverage.found + coverage.missing + coverage.notCaptured); assert.ok(coverage.omitted > 0);
    assert.equal(row.references.length, WORK_QUEUE_REFERENCE_LIMIT); assert.equal(row.references.filter(reference => reference.state === 'missing').length, 4, 'las 4 ausentes viajan aunque estén al final');
    assert.ok(row.references.filter(reference => reference.state === 'missing').every(reference => reference.id.startsWith('fantasma_') && reference.label === null), 'IDs íntegros');
    assert.deepEqual(row.references.map(reference => reference.field), [...row.references.map(reference => reference.field)].sort(), 'orden original de los campos');
    assert.equal(row.reasonCodes.filter(code => code === 'missing-reference').length, 1, 'un solo motivo; cuántas, en la cobertura');
    assert.equal(new Set(row.reasonCodes).size, row.reasonCodes.length);
  } finally { store.close(); }
});
test('R2·1 homónimas, mismo ID en otra captura y referencias fuera de la copia: identidad, estado y referencias exactos', () => {
  // Homónimas: dos contactos con el MISMO nombre y distinto ID; cada tarea apunta a uno. No se funden por nombre.
  const homonyms = makeFixture('agency'); const contacts = homonyms.records.filter(record => record.entity === 'contacts'); const twin = structuredClone(contacts[0]); twin.id = contacts[0].id + '-gemelo';
  homonyms.records.push(twin); homonyms.manifest.expectedCounts.contacts++;
  const taskA = homonyms.records.find(record => record.entity === 'tasks' && record.values.status === 'pending')!; const contactKey = homonyms.entities.find(entity => entity.id === 'tasks')!.fields.find(field => field.type === 'reference' && field.referenceEntity === 'contacts')!.key; taskA.values[contactKey] = contacts[0].id;
  const taskB = structuredClone(taskA); taskB.id = taskA.id + '-b'; taskB.values[contactKey] = twin.id; homonyms.records.push(taskB); homonyms.manifest.expectedCounts.tasks++;
  let store = activeStore(homonyms);
  try {
    const work = inspectLocalWorkQueue(store, clock), ra = work.tasks.find(task => task.id === taskA.id)!.references.find(reference => reference.field === contactKey)!, rb = work.tasks.find(task => task.id === taskB.id)!.references.find(reference => reference.field === contactKey)!;
    assert.equal(ra.id, contacts[0].id); assert.equal(rb.id, twin.id); assert.equal(ra.label, rb.label, 'mismo nombre'); assert.notEqual(ra.id, rb.id, 'pero identidades distintas'); assert.equal(ra.state, 'found'); assert.equal(rb.state, 'found');
  } finally { store.close(); }
  // Mismo ID de tarea en otra captura: la identidad de la copia cambia y los datos son SOLO los de la captura activa.
  const first = makeFixture('agency'); store = activeStore(first);
  try {
    const a = inspectLocalWorkQueue(store, clock), taskId = a.tasks[0].id, dueA = a.tasks[0].due;
    const second = makeFixture('agency'); second.id = first.id + '-otra'; second.capturedAt = '2026-11-09T09:00:00.000Z';
    for (const record of second.records) if (record.entity === 'tasks' && record.id === taskId) record.values.due_date = '2031-01-01';
    store.importSnapshot(second, true); const pending = inspectLocalWorkQueue(store, clock); assert.deepEqual(pending.identity, a.identity, 'candidata pendiente: la copia activa no cambia'); assert.deepEqual(pending.tasks, a.tasks);
    store.saveGeneration(makeDemoSpec(second), generation); store.activate(); const b = inspectLocalWorkQueue(store, clock);
    assert.notEqual(b.identity!.snapshotId, a.identity!.snapshotId); assert.ok(b.tasks.some(task => task.id === taskId), 'el mismo ID de tarea existe en las dos capturas');
    assert.notDeepEqual(b.tasks.find(task => task.id === taskId)!.due, dueA, 'pero se lee SOLO la captura activa'); assert.equal(b.tasks.find(task => task.id === taskId)!.due.localDate, '2031-01-01');
    assert.notEqual(contextKey({ ...b.identity! }), contextKey({ ...a.identity! }));
  } finally { store.close(); }
  // Fuera de la copia: la importación NORMAL rechaza una referencia sin destino (también la que apunta a un ID de OTRA entidad) y conserva la captura activa;
  // «missing» solo se alcanza si un registro desaparece de la copia después de importarla (aquí, borrándolo de Store como hace la prueba de referencias).
  const outside = makeFixture('agency'); const target = outside.records.find(record => record.entity === 'tasks' && record.values.status === 'pending')!; const key = outside.entities.find(entity => entity.id === 'tasks')!.fields.find(field => field.type === 'reference' && field.referenceEntity === 'contacts')!.key;
  const deal = outside.records.find(record => record.entity === 'deals')!;
  store = activeStore(structuredClone(outside)); const before = inspectLocalWorkQueue(store, clock);
  try {
    for (const dangling of [deal.id + '__no-existe', deal.id]) {
      const broken = structuredClone(outside); broken.id = outside.id + '-roto'; broken.records.find(record => record.id === target.id && record.entity === 'tasks')!.values[key] = dangling;
      assert.throws(() => store.importSnapshot(broken, true), (error: unknown) => error instanceof AppError && error.status === 422 && /Referencia sin destino/.test(JSON.stringify((error as AppError).details ?? error.message)), 'importar ' + dangling);
      assert.deepEqual(inspectLocalWorkQueue(store, clock), before, 'la captura activa no cambia');
    }
    const contactId = String(target.values[key]); store.db.prepare('DELETE FROM records WHERE entity=? AND id=?').run('contacts', contactId);
    const row = inspectLocalWorkQueue(store, clock).tasks.find(task => task.id === target.id)!, reference = row.references.find(candidate => candidate.field === key)!;
    assert.equal(reference.state, 'missing'); assert.equal(reference.id, contactId); assert.equal(reference.label, null); assert.equal(row.referenceCoverage.missing, 1); assert.equal(row.reasonCodes.filter(code => code === 'missing-reference').length, 1);
  } finally { store.close(); }
});
test('R2·2 la primera página que produce el servidor la consume su cliente: 200 tareas, 16 asociaciones de 420 caracteres, sin Content-Length y por fragmentos', async () => {
  const { snapshot } = bigSnapshot({ refs: 16, idLength: 420, taskCount: 200 }); const store = activeStore(snapshot); const app = await appFor(store);
  try {
    const response = await app.inject('/api/v7/local-operations/work'); assert.equal(response.statusCode, 200);
    const bytes = Buffer.byteLength(response.body); const page = LocalWorkQueueSchema.parse(response.json());
    assert.ok(bytes <= WORK_QUEUE_BYTE_BUDGET, 'el cuerpo real (' + bytes + ' B) cabe en el presupuesto'); assert.ok(WORK_QUEUE_BYTE_BUDGET < WORK_QUEUE_CLIENT_MAX_BYTES, 'el presupuesto del servidor está por debajo del tope del cliente');
    assert.ok(page.page.omittedByBytes > 0, 'con esas asociaciones no caben 200 tareas: se acorta por bytes'); assert.equal(page.counts!.notReturned, page.page.omittedByLimit + page.page.omittedByBytes);
    const full = buildResponseQueue({ spec: store.spec!, records: store.records(), evaluatedAt: NOW, horizonHours: 24, limit: 200 });
    assert.deepEqual(page.tasks.map(task => task.id), full.items.slice(0, page.tasks.length).map(item => item.id), 'prefijo de la cola en el MISMO orden');
    assert.equal(page.counts!.tasks, full.summary.totalTasks, 'los recuentos cubren toda la copia'); assert.equal(page.counts!.queued, full.summary.totalQueued);
    assert.match(page.limitations.join(' '), /se acortó a \d+ tareas para no superar 900000 bytes/);
    const installed = fetchBody(response.body, 65_536); installed.install();
    try { assert.deepEqual(await loadLocalWorkQueue(new AbortController().signal), page); } finally { globalThis.fetch = installed.restore; }
    // Con 16 asociaciones de 420 caracteres cada tarea pesa ~14 KB: la página es la MÁS LARGA que cabe (añadir la siguiente la sacaría del presupuesto).
    const next = inspectLocalWorkQueue(store, clock, { byteBudget: bytes }); assert.equal(next.tasks.length, page.tasks.length);
    assert.ok(inspectLocalWorkQueue(store, clock, { byteBudget: WORK_QUEUE_CLIENT_MAX_BYTES }).tasks.length > page.tasks.length, 'con un presupuesto mayor sí caben más: el recorte lo decide el presupuesto, no un tope fijo');
  } finally { await app.close(); store.close(); }
});
test('R2·2 borde exacto del presupuesto: con el tamaño exacto cabe, con un byte menos se pierde la última tarea, y el resto del prefijo no cambia', () => {
  const { snapshot } = bigSnapshot({ refs: 3, idLength: 40, taskCount: 12 }); const store = activeStore(snapshot);
  try {
    let current = inspectLocalWorkQueue(store, clock, { byteBudget: WORK_QUEUE_CLIENT_MAX_BYTES }); assert.equal(current.page.omittedByBytes, 0); const everything = current.tasks.map(task => task.id);
    for (let step = 0; step < 6; step++) {
      const { budget: exact, produced: same } = fixedPoint(store, current), fewer = inspectLocalWorkQueue(store, clock, { byteBudget: exact - 1 });
      assert.equal(same.tasks.length, current.tasks.length, 'con el tamaño exacto cabe'); assert.equal(bytesOf(same), exact);
      assert.equal(fewer.tasks.length, current.tasks.length - 1, 'con un byte menos, una tarea menos'); assert.ok(bytesOf(fewer) <= exact - 1);
      assert.deepEqual(fewer.tasks.map(task => task.id), everything.slice(0, fewer.tasks.length), 'siempre un prefijo'); assert.equal(fewer.page.omittedByBytes, everything.length - fewer.tasks.length);
      assert.deepEqual(fewer.counts, { ...current.counts!, returned: fewer.tasks.length, notReturned: current.counts!.queued - fewer.tasks.length });
      current = fewer;
    }
    assert.throws(() => inspectLocalWorkQueue(store, clock, { byteBudget: 1_000 }), /presupuesto/, 'un presupuesto que ni el esqueleto admite falla en vez de devolver más de lo declarado');
  } finally { store.close(); }
});
test('R2·2 el presupuesto mide BYTES UTF-8, no caracteres: etiquetas con euros, ñ y emoji pesan más de lo que dicen sus caracteres', () => {
  const snapshot = makeFixture('agency'); const text = '€€€ñ😀日本語'.repeat(14);
  for (const record of snapshot.records) if (record.entity === 'tasks') for (const [key, value] of Object.entries(record.values)) if (typeof value === 'string' && key === 'subject') record.values[key] = text + record.id;
  const store = activeStore(snapshot);
  try {
    const full = inspectLocalWorkQueue(store, clock, { byteBudget: WORK_QUEUE_CLIENT_MAX_BYTES }), json = JSON.stringify(full), bytes = Buffer.byteLength(json);
    assert.ok(full.tasks.some(task => /😀/.test(task.label)) && bytes > json.length, 'hay multibyte: bytes (' + bytes + ') > caracteres (' + json.length + ')');
    const byChars = inspectLocalWorkQueue(store, clock, { byteBudget: json.length }); assert.ok(byChars.tasks.length < full.tasks.length, 'un presupuesto igual al nº de CARACTERES no admite todo el cuerpo');
    assert.ok(bytesOf(byChars) <= json.length); const { budget, produced } = fixedPoint(store, full); assert.equal(produced.tasks.length, full.tasks.length);
    assert.equal(inspectLocalWorkQueue(store, clock, { byteBudget: budget - 1 }).tasks.length, full.tasks.length - 1);
  } finally { store.close(); }
});
test('R2·2 lectura acotada del cliente: bytes UTF-8 reales, borde exacto, fragmentos que parten un carácter y Content-Length ausente o falso', async () => {
  const stream = (chunks: Uint8Array[], headers: Record<string, string> = {}, counter = { pulled: 0, cancelled: false }) => new Response(new ReadableStream<Uint8Array>({
    pull(controller) { const next = chunks[counter.pulled++]; if (next) controller.enqueue(next); else controller.close(); }, cancel() { counter.cancelled = true; },
  }), { status: 200, headers });
  const encoder = new TextEncoder(), euros = '€'.repeat(100), bytes = encoder.encode(euros);   // 300 bytes, 100 caracteres
  const split = [bytes.subarray(0, 1), bytes.subarray(1, 4), bytes.subarray(4, 150), bytes.subarray(150)];
  assert.equal(await readBoundedText(stream(split), 300), euros, 'fragmentos partidos dentro de un carácter de 3 bytes');
  await assert.rejects(readBoundedText(stream(split), 299), /tamaño permitido/, 'un byte por encima del límite, aunque tenga 100 caracteres');
  await assert.rejects(readBoundedText(stream([encoder.encode('x'.repeat(10))]), 9), /tamaño permitido/); assert.equal(await readBoundedText(stream([encoder.encode('x'.repeat(10))]), 10), 'x'.repeat(10));
  const lying = stream([bytes], { 'content-length': '10' }); await assert.rejects(readBoundedText(lying, 100), /tamaño permitido/, 'un Content-Length falso a la baja no relaja el límite');
  assert.equal(await readBoundedText(stream([bytes], { 'content-length': '5000000' }), 1_000_000), euros, 'un Content-Length falso al alza no rechaza un cuerpo válido (como exige la prueba independiente de 1.000.000 bytes)');
  const open = { pulled: 0, cancelled: false }; await assert.rejects(readBoundedText(stream(Array.from({ length: 50 }, () => new Uint8Array(100)), {}, open), 1_000), /tamaño permitido/); assert.ok(open.pulled <= 12, 'sin Content-Length corta al pasar el límite, no lee todo el cuerpo'); assert.ok(open.cancelled);
  assert.equal(await readBoundedText(new Response(null, { status: 200 }), 10), '');
});
test('R2·3 coherencia de fase e identidad: «empty» no admite identidad, recuentos ni tareas; «imported» y «active» exigen identidad y recuentos; el cliente rechaza lo contradictorio', async () => {
  const store = source(); const live = inspectLocalWorkQueue(store, clock); store.close();
  const empty = new Store(':memory:'); empty.set('instanceId', randomUUID()); const nothing = inspectLocalWorkQueue(empty, clock); empty.close();
  const invalid = (mutate: (value: Record<string, any>) => void, base: unknown = live) => { const value = structuredClone(base) as Record<string, any>; mutate(value); return LocalWorkQueueSchema.safeParse(value).success === false; };
  assert.equal(LocalWorkQueueSchema.safeParse(live).success, true); assert.equal(LocalWorkQueueSchema.safeParse(nothing).success, true); assert.deepEqual({ identity: nothing.identity, counts: nothing.counts, tasks: nothing.tasks }, { identity: null, counts: null, tasks: [] });
  assert.ok(invalid(value => { value.phase = 'empty'; }), 'empty con identidad, recuentos y tareas'); assert.ok(invalid(value => { value.phase = 'empty'; value.identity = null; value.counts = null; }), 'empty con tareas');
  assert.ok(invalid(value => { value.phase = 'empty'; value.identity = null; value.counts = null; value.tasks = []; value.page.omittedByBytes = 3; }), 'empty que declara tareas no devueltas');
  assert.ok(invalid(value => { value.phase = 'active'; }, nothing), 'active sin identidad ni recuentos'); assert.ok(invalid(value => { value.phase = 'imported'; }, nothing));
  assert.ok(invalid(value => { value.identity = null; }), 'recuentos sin identidad'); assert.ok(invalid(value => { value.counts = null; value.tasks = []; }), 'identidad sin recuentos');
  assert.ok(invalid(value => { value.counts.tasks += 1; }), 'tareas ≠ completadas + abiertas + desconocidas'); assert.ok(invalid(value => { value.counts.queued += 1; value.counts.notReturned += 1; }), 'en cola ≠ abiertas + desconocidas');
  assert.ok(invalid(value => { value.counts.returned += 1; value.counts.notReturned -= 1; }), 'devueltas ≠ longitud'); assert.ok(invalid(value => { value.page.omittedByBytes += 1; }), 'no devueltas ≠ suma de motivos');
  assert.ok(invalid(value => { value.tasks.push(structuredClone(value.tasks[0])); value.counts.returned += 1; value.counts.queued += 1; value.counts.knownOpen += 1; value.counts.tasks += 1; }), 'tarea repetida');
  assert.ok(invalid(value => { value.page.byteBudget = WORK_QUEUE_CLIENT_MAX_BYTES + 1; }), 'presupuesto declarado por encima del tope del cliente');
  assert.ok(invalid(value => { value.page.omittedOversize = value.page.omittedByBytes + 1; }), 'filas demasiado grandes > omitidas por bytes'); assert.ok(invalid(value => { value.phase = 'empty'; value.identity = null; value.counts = null; value.tasks = []; value.page.omittedByLimit = 0; value.page.omittedByBytes = 0; value.page.omittedOversize = 1; }), 'empty que declara filas demasiado grandes');
  const withReferences = live.tasks.find(task => task.references.length > 0)!, index = live.tasks.indexOf(withReferences);
  assert.ok(invalid(value => { value.tasks[index].referenceCoverage.returned += 1; }), 'cobertura ≠ referencias devueltas'); assert.ok(invalid(value => { value.tasks[index].referenceCoverage.omitted = 1; value.tasks[index].referenceCoverage.total += 1; value.tasks[index].referenceCoverage.found += 1; }), 'un recorte exige llegar al límite');
  assert.ok(invalid(value => { value.tasks[index].reasonCodes = ['later', 'later']; }), 'motivos repetidos');
  const installed = { restore: globalThis.fetch };
  try {
    for (const body of [{ ...live, phase: 'empty' }, { ...nothing, phase: 'active' }]) {
      globalThis.fetch = (async () => new Response(JSON.stringify(body), { status: 200 })) as unknown as typeof fetch; await assert.rejects(loadLocalWorkQueue(new AbortController().signal), /no es compatible/);
    }
    globalThis.fetch = (async () => new Response(JSON.stringify(live), { status: 200 })) as unknown as typeof fetch; assert.deepEqual(await loadLocalWorkQueue(new AbortController().signal), live);
    globalThis.fetch = (async () => new Response(JSON.stringify(nothing), { status: 200 })) as unknown as typeof fetch; assert.equal((await loadLocalWorkQueue(new AbortController().signal)).phase, 'empty');
  } finally { globalThis.fetch = installed.restore; }
});
test('R2 «not-captured» es una rama DEFENSIVA: la importación normal exige las cuatro entidades (422), así que solo se alcanza con una copia alterada fuera de Store', () => {
  const normal = makeFixture('agency'); normal.entities = normal.entities.filter(entity => entity.id !== 'deals');
  const store = new Store(':memory:'); store.set('instanceId', randomUUID());
  try {
    assert.throws(() => store.importSnapshot(normal), (error: unknown) => error instanceof AppError && error.status === 422 && /formato no válido/.test(error.message) && /exactly 4 items/.test(JSON.stringify(error.details)));
    assert.equal(store.snapshot, null, 'nada se importó'); assert.equal(inspectLocalWorkQueue(store, clock).phase, 'empty');
  } finally { store.close(); }
});

// ── R3 · los IDs que admite la importación no pueden hacer ilegible la cola ───────────────────────────────────────────────────────────────────
// `RecordSchema.id` y `SnapshotSchema.id/accountId` solo exigen «no vacío». El contrato ya no los acota a 1.000/500 unidades: los acota el presupuesto de la respuesta, y una fila que no cabe se
// OMITE entera (contada), nunca se trunca ni se convierte en «ausente». Matiz comprobado: una copia ACTIVA valida cada valor de campo (incluido el de una referencia) a ≤ 10.000 caracteres
// (`shared/model.ts`), mientras que el ID de un registro y una copia solo IMPORTADA no tienen tope: por eso hay pruebas por la copia activa y por la importada.
const importedStore = (snapshot: ReturnType<typeof makeFixture>) => { const store = new Store(':memory:'); store.set('instanceId', randomUUID()); assert.equal(store.importSnapshot(snapshot).complete, true); return store; };
test('R3 · un ID de contacto de 1.000, 1.001, 5.000, 10.000 (activa) y 60.000 (importada) unidades UTF-16 (y multibyte) se importa y se lee ÍNTEGRO: «found», sin 422, mismo recurso v1, cliente incluido', async () => {
  for (const [name, idLength, imported] of [['1000', 1_000 - 'ficticio_contacto_'.length, false], ['1001', 1_001 - 'ficticio_contacto_'.length, false], ['5000', 5_000, false], ['10000', 10_000 - 'ficticio_contacto_'.length, false], ['60000 (copia solo importada)', 60_000, true]] as const) {
    const { snapshot, taskId, contactId } = bigSnapshot({ refs: 1, idLength }); const store = imported ? importedStore(snapshot) : activeStore(snapshot), app = await appFor(store);
    try {
      const v1 = await app.inject('/api/v7/local-operations'); assert.equal(v1.statusCode, 200, name + ' (v1)');
      const response = await app.inject('/api/v7/local-operations/work'); assert.equal(response.statusCode, 200, name); const work = LocalWorkQueueSchema.parse(response.json());
      const reference = work.tasks.find(task => task.id === taskId)!.references.find(item => item.field === 'verified_ref_00')!;
      assert.equal(reference.id, contactId); assert.equal(reference.state, 'found'); assert.equal(reference.label !== null, true, 'se resolvió el contacto, no es «ausente»'); assert.equal(work.page.omittedOversize, 0);
      assert.equal(work.tasks.length, work.counts!.returned); assert.ok(Buffer.byteLength(response.body) <= WORK_QUEUE_BYTE_BUDGET);
      if (name === '1001') { const installed = fetchBody(response.body, 4_096); installed.install(); try { assert.deepEqual(await loadLocalWorkQueue(new AbortController().signal), work, 'el cliente recibe la identidad íntegra'); } finally { globalThis.fetch = installed.restore; } }
    } finally { await app.close(); store.close(); }
  }
  // Multibyte: 1.251 unidades UTF-16 que ocupan muchos más bytes (3 bytes por «日», 4 por «😀» = 2 unidades).
  const multi = bigSnapshot({ refs: 1 }); const wide = '日本語😀'.repeat(250) + 'x'; assert.equal(wide.length, 1_251); const contact = multi.snapshot.records.find(r => r.entity === 'contacts' && r.id === multi.contactId)!;
  const bytes = Buffer.byteLength(wide); assert.ok(bytes > 3_000); contact.id = wide; for (const r of multi.snapshot.records) if (r.entity === 'tasks' && r.id === multi.taskId) r.values.verified_ref_00 = wide;
  const store = activeStore(multi.snapshot); try { const ref = inspectLocalWorkQueue(store, clock).tasks.find(t => t.id === multi.taskId)!.references.find(r => r.field === 'verified_ref_00')!; assert.equal(ref.id, wide); assert.equal(ref.state, 'found'); } finally { store.close(); }
});
test('R3 · un ID de TAREA, de captura o de cuenta largo (admitido por la importación) tampoco rompe la cola y viaja íntegro en la identidad', () => {
  const { snapshot } = bigSnapshot({ refs: 0, taskCount: 3, label: '-' + 'z'.repeat(2_500) }); snapshot.id = 'captura-' + 'c'.repeat(20_000); snapshot.source.accountId = 'cuenta-' + 'a'.repeat(3_000);
  const store = activeStore(snapshot);
  try {
    const work = inspectLocalWorkQueue(store, clock); assert.equal(LocalWorkQueueSchema.safeParse(work).success, true);
    assert.equal(work.identity!.snapshotId, snapshot.id); assert.equal(work.identity!.accountId, snapshot.source.accountId); assert.equal(work.tasks.filter(task => task.id.length > 2_500).length, 3, 'las tres tareas de ID largo');
    assert.ok(contextKey({ ...work.identity! }).length > 0);
  } finally { store.close(); }
});
test('R3 · una fila que SOLA no cabe en el presupuesto se OMITE entera y se declara (omittedOversize ⊂ omittedByBytes); las demás siguen en su orden; ningún ID se trunca ni se fabrica', () => {
  const { snapshot, taskId, contactId } = bigSnapshot({ refs: 3, idLength: 9_900 }); const store = activeStore(snapshot);   // ~30 KB por fila, copia ACTIVA válida
  try {
    const full = inspectLocalWorkQueue(store, clock, { byteBudget: WORK_QUEUE_CLIENT_MAX_BYTES }), small = inspectLocalWorkQueue(store, clock, { byteBudget: 20_000 });
    assert.ok(full.tasks.some(task => task.id === taskId), 'con presupuesto suficiente la fila viaja');
    assert.equal(small.page.omittedOversize, 1); assert.ok(small.page.omittedByBytes >= 1); assert.equal(small.counts!.notReturned, small.page.omittedByLimit + small.page.omittedByBytes);
    assert.ok(!small.tasks.some(task => task.id === taskId), 'la fila grande no viaja'); assert.ok(small.tasks.length > 0, 'las demás siguen: una fila enorme no vacía la cola');
    assert.deepEqual(small.tasks.map(task => task.id), full.tasks.filter(task => task.id !== taskId).slice(0, small.tasks.length).map(task => task.id), 'orden de la cola conservado, sin la fila omitida');
    const body = JSON.stringify(small); assert.ok(!body.includes('x'.repeat(100)), 'ningún fragmento del ID largo (ni truncado) sale en el cuerpo'); assert.ok(Buffer.byteLength(body) <= 20_000); assert.match(small.limitations.join(' '), /no caben en el presupuesto ni solas/);
    assert.ok(small.page.omittedOversize <= small.page.omittedByBytes); assert.equal(contactId.length > 9_900, true);
  } finally { store.close(); }
});
test('R3 · con el presupuesto REAL (900.000 B) una fila con un ID de 1.000.000 de unidades (tarea en copia activa; contacto en copia solo importada) se omite por bytes y la cola sigue legible para el cliente', async () => {
  const hugeTask = bigSnapshot({ refs: 0, taskCount: 2, label: '-' + 'q'.repeat(1_000_000) }), hugeContact = bigSnapshot({ refs: 1, idLength: 1_000_000 });
  for (const [name, store, expectOmitted] of [['tarea activa', activeStore(hugeTask.snapshot), (id: string) => id.length > 1_000_000], ['contacto importado', importedStore(hugeContact.snapshot), (id: string) => id === hugeContact.taskId]] as const) {
    const app = await appFor(store);
    try {
      const v1 = await app.inject('/api/v7/local-operations'); assert.equal(v1.statusCode === 200 || name === 'tarea activa', true, name + ' (v1 puede rechazar un ID de tarea >1000: es el recurso anterior, no se toca)');
      const response = await app.inject('/api/v7/local-operations/work'); assert.equal(response.statusCode, 200, name); const bytes = Buffer.byteLength(response.body), work = LocalWorkQueueSchema.parse(response.json());
      assert.ok(bytes <= WORK_QUEUE_BYTE_BUDGET, name + ': ' + bytes + ' B'); assert.ok(work.page.omittedOversize >= 1, name); assert.ok(work.page.omittedOversize <= work.page.omittedByBytes); assert.ok(!work.tasks.some(task => expectOmitted(task.id)), name + ': la fila enorme no viaja'); assert.ok(work.tasks.length > 0, name + ': la cola sigue legible');
      assert.ok(!response.body.includes('q'.repeat(200)) && !response.body.includes('x'.repeat(200)), name + ': ni un fragmento truncado');
      const installed = fetchBody(response.body, 65_536); installed.install(); try { assert.deepEqual(await loadLocalWorkQueue(new AbortController().signal), work, name); } finally { globalThis.fetch = installed.restore; }
    } finally { await app.close(); store.close(); }
  }
});
test('R3 · si la IDENTIDAD de la copia no cabe en el presupuesto no hay respuesta honesta posible: error claro y explícito (límite documentado), no un 422 de esquema ni una identidad truncada', async () => {
  const snapshot = makeFixture('agency'); snapshot.id = 'captura-' + 'c'.repeat(950_000); const store = activeStore(snapshot), app = await appFor(store);
  try {
    assert.throws(() => inspectLocalWorkQueue(store, clock), (error: unknown) => error instanceof AppError && error.status === 500 && /identidad de esta copia no cabe/.test(error.message));
    const response = await app.inject('/api/v7/local-operations/work'); assert.equal(response.statusCode, 500); assert.match(response.json().error, /identidad de esta copia no cabe/); assert.ok(response.body.length < 500, 'el error no vuelca la identidad');
  } finally { await app.close(); store.close(); }
});
test('R3 · otros campos de la proyección frente a lo que admite la importación: etiquetas y vencimientos largos se recortan por diseño (no son identidad), la clave de campo de 100 caracteres cabe', () => {
  const snapshot = makeFixture('agency'); const task = snapshot.records.find(r => r.entity === 'tasks' && r.values.status === 'pending')!; const subjectKey = snapshot.entities.find(e => e.id === 'tasks')!.displayField;
  task.values[subjectKey] = 'a'.repeat(179) + '😀' + 'b'.repeat(4_000);                     // el par sustituto cae justo en el límite de 180
  const dueKey = Object.keys(task.values).find(key => /due/i.test(key))!; task.values[dueKey] = 'no-es-una-fecha-' + 'f'.repeat(5_000);
  const taskEntity = snapshot.entities.find(e => e.id === 'tasks')!, reference = taskEntity.fields.find(f => f.type === 'reference' && f.referenceEntity === 'contacts')!;
  const longKey = 'k' + 'y'.repeat(99); taskEntity.fields.push({ ...reference, key: longKey, label: 'Clave larga', required: false }); task.values[longKey] = snapshot.records.find(r => r.entity === 'contacts')!.id;
  const store = importedStore(snapshot);   // un vencimiento inválido no se puede ACTIVAR (shared/model.ts), pero una copia importada sí lo muestra
  try {
    const row = inspectLocalWorkQueue(store, clock).tasks.find(item => item.id === task.id)!;
    assert.ok(row.label.length <= 180 && !/[\ud800-\udbff]$/.test(row.label), 'la etiqueta se recorta sin partir el par sustituto'); assert.ok((row.due.value ?? '').length <= 100, 'el vencimiento inválido se recorta'); assert.equal(row.due.kind, 'invalid');
    assert.equal(longKey.length, 100); assert.ok(row.references.some(item => item.field === longKey && item.state === 'found'));
  } finally { store.close(); }
});
