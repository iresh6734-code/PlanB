import test from 'node:test';
import assert from 'node:assert/strict';
import { createBaseApp } from '../server/app.js';
import { makeFixture, makeDemoSpec } from '../shared/fixtures.js';
import { buildPatch } from '../shared/local-task-focus.js';
import { loadTask, readTask, saveTask, verifyAfterUncertain, TaskFocusError, wroteNothing, type Transport, type LoadedTask } from '../src/local-task-focus-client.js';

// Recorrido vertical contra el servidor REAL (createBaseApp + Store en memoria + HTTP en 127.0.0.1) con datos ficticios.
// El «transporte» solo envuelve fetch para inyectar fallos de red sobre el servidor real; no sustituye al servidor.
type Rig = Awaited<ReturnType<typeof rig>>;
async function rig(profile: 'agency' | 'distribution' = 'agency', phase: 'active' | 'imported' | 'empty' = 'active') {
  const { app, store } = await createBaseApp({ dbPath: ':memory:', root: '.', staticDir: 'none' });
  const patches: { url: string; body: any }[] = [];
  app.addHook('preHandler', async request => { if (request.method === 'PATCH') patches.push({ url: request.url, body: request.body }); });
  if (phase !== 'empty') {
    const snapshot = makeFixture(profile); store.importSnapshot(snapshot);
    if (phase === 'active') { store.saveGeneration(makeDemoSpec(snapshot), { provider: 'demo', model: null, generatedAt: new Date().toISOString(), prompt: '', approved: false }); store.activate(); }
  }
  await app.listen({ host: '127.0.0.1', port: 0 });
  const base = 'http://127.0.0.1:' + (app.server.address() as { port: number }).port;
  const transport: Transport = { fetch: (input, init) => fetch(input, init), base };
  return { app, store, base, transport, patches, close: () => app.close() };
}
const withRig = async (fn: (r: Rig) => Promise<void>, ...args: Parameters<typeof rig>) => { const r = await rig(...args); try { await fn(r); } finally { await r.close(); } };
const ok = (loaded: LoadedTask) => { assert.equal(loaded.kind, 'ok'); return loaded as Extract<LoadedTask, { kind: 'ok' }>; };
const signal = () => new AbortController().signal;
const snapshotOf = (store: Rig['store']) => JSON.stringify([store.records(), store.changes()]);
// Transporte que deja pasar la petición al servidor y luego falla como si se hubiera perdido el acuse.
const lostAck = (transport: Transport, how: 'network' | '500' | 'garbled', send = true): Transport => ({ base: transport.base, fetch: async (input, init) => {
  if (init?.method !== 'PATCH') return transport.fetch(input, init);
  if (send) await transport.fetch(input, init);
  if (how === 'network') throw new TypeError('fetch failed');
  if (how === '500') return new Response(JSON.stringify({ error: 'boom' }), { status: 500 });
  return new Response('<html>proxy</html>', { status: 200 });
} });

test('recorrido vertical: abrir por ID, editar un campo permitido, PATCH confirmado, relectura y exactamente un cambio', () => withRig(async r => {
  const loaded = ok(await loadTask('task-2', signal(), r.transport));
  assert.equal(loaded.context.ready, true); assert.equal(loaded.record.id, 'task-2'); assert.equal(loaded.record.values.status, 'pending');
  assert.ok(loaded.schema?.spec, 'copia activa: hay especificación editable');
  const before = r.store.records().filter(x => x.id !== 'task-2');
  const patch = buildPatch(loaded.schema!.entity, loaded.record, { ...loaded.record.values, status: 'completed' });
  assert.deepEqual(patch, { status: 'completed' });
  const outcome = await saveTask({ taskId: 'task-2', baseline: loaded.record, entity: loaded.schema!.entity, patch, context: loaded.context }, r.transport);
  assert.equal(outcome.kind, 'saved'); assert.equal(outcome.kind === 'saved' && outcome.record.values.status, 'completed');
  assert.equal(r.patches.length, 1, 'un único PATCH'); assert.deepEqual(r.patches[0].body, { values: { status: 'completed' } }, 'solo viaja el campo cambiado');
  assert.equal((await readTask('task-2', undefined, r.transport))!.values.status, 'completed', 'la relectura conserva el valor');
  const changes = r.store.changes(); assert.equal(changes.length, 1); assert.equal(changes[0].recordId, 'task-2'); assert.equal(changes[0].entity, 'tasks'); assert.equal(changes[0].operation, 'update');
  assert.equal(changes[0].before!.values.status, 'pending'); assert.equal(changes[0].after.values.status, 'completed'); assert.equal(changes[0].after.values.subject, loaded.record.values.subject);
  assert.deepEqual(r.store.records().filter(x => x.id !== 'task-2'), before, 'ningún otro registro cambia');
}));

test('límite que justifica no reutilizar RecordDrawer: un segundo PATCH idéntico añade otra fila a changes', () => withRig(async r => {
  for (let i = 0; i < 2; i++) { const response = await fetch(r.base + '/api/records/tasks/task-2', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ values: { status: 'completed' } }) }); assert.equal(response.status, 200); }
  assert.equal(r.store.changes().length, 2, 'el servidor no detecta no-ops ni repeticiones');
}));

test('dos tareas homónimas con IDs distintos se mantienen distintas', () => withRig(async r => {
  const a = r.store.saveRecord('tasks', { subject: 'Llamar a Ana', due_date: '2026-11-05', status: 'pending' }), b = r.store.saveRecord('tasks', { subject: 'Llamar a Ana', due_date: '2026-11-06', status: 'pending' });
  const changesBefore = r.store.changesCount;
  const la = ok(await loadTask(a.id, signal(), r.transport)), lb = ok(await loadTask(b.id, signal(), r.transport));
  assert.notEqual(la.record.id, lb.record.id); assert.equal(la.record.values.due_date, '2026-11-05'); assert.equal(lb.record.values.due_date, '2026-11-06');
  const outcome = await saveTask({ taskId: b.id, baseline: lb.record, entity: lb.schema!.entity, patch: { status: 'completed' }, context: lb.context }, r.transport);
  assert.equal(outcome.kind, 'saved');
  assert.equal((await readTask(a.id, undefined, r.transport))!.values.status, 'pending', 'la homónima no se toca');
  assert.equal(r.store.changesCount, changesBefore + 1);
}));

test('misma ID en otra instalación y en otra captura: contexto distinto, no se guarda', async () => {
  const one = await rig('agency'), two = await rig('distribution');
  try {
    const a = ok(await loadTask('task-2', signal(), one.transport)), b = ok(await loadTask('task-2', signal(), two.transport));
    assert.equal(b.record.id, 'task-2'); assert.notEqual(a.context.instanceId, b.context.instanceId); assert.notEqual(a.context.snapshotId, b.context.snapshotId);
    // Contexto de A contra el servidor B: no se envía nada.
    const wrong = await saveTask({ taskId: 'task-2', baseline: a.record, entity: a.schema!.entity, patch: { status: 'completed' }, context: a.context }, two.transport);
    assert.equal(wrong.kind, 'context-changed'); assert.equal(two.patches.length, 0); assert.equal(two.store.changesCount, 0);
    // Misma instalación, otra captura activada mientras la ficha seguía abierta.
    const next = makeFixture('distribution'); next.id = 'capture-other'; next.name = 'Otra captura';
    one.store.importSnapshot(next, true); one.store.saveGeneration(makeDemoSpec(next), { provider: 'demo', model: null, generatedAt: new Date().toISOString(), prompt: '', approved: false }); one.store.activate();
    const stale = await saveTask({ taskId: 'task-2', baseline: a.record, entity: a.schema!.entity, patch: { status: 'completed' }, context: a.context }, one.transport);
    assert.equal(stale.kind, 'context-changed'); assert.equal(one.patches.length, 0); assert.equal(one.store.changesCount, 0);
    assert.notEqual(ok(await loadTask('task-2', signal(), one.transport)).context.snapshotId, a.context.snapshotId);
  } finally { await one.close(); await two.close(); }
});

test('copia importada sin activar: se lee, pero ni la ficha ni el servidor la editan', () => withRig(async r => {
  const loaded = ok(await loadTask('task-2', signal(), r.transport));
  assert.equal(loaded.context.ready, false); assert.equal(loaded.schema!.spec, null); assert.equal(loaded.schema!.entity.id, 'tasks');
  assert.equal(loaded.record.values.status, 'pending');
  const before = snapshotOf(r.store);
  const outcome = await saveTask({ taskId: 'task-2', baseline: loaded.record, entity: loaded.schema!.entity, patch: { status: 'completed' }, context: loaded.context }, r.transport);
  assert.equal(outcome.kind, 'context-changed'); assert.match(outcome.kind === 'context-changed' ? outcome.message : '', /no está activada/); assert.equal(r.patches.length, 0);
  const direct = await fetch(r.base + '/api/records/tasks/task-2', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ values: { status: 'completed' } }) });
  assert.equal(direct.status, 409, 'el servidor es quien impone la activación');
  assert.equal(snapshotOf(r.store), before);
}, 'agency', 'imported'));

test('copia vacía: sin tarea que editar y sin escritura', () => withRig(async r => {
  const loaded = await loadTask('task-1', signal(), r.transport);
  assert.equal(loaded.kind, 'empty'); assert.equal(loaded.context.snapshotId, null);
}, 'agency', 'empty'));

test('404 no recrea la tarea ni cuenta como alta', () => withRig(async r => {
  assert.equal((await loadTask('no-existe', signal(), r.transport)).kind, 'missing');
  const loaded = ok(await loadTask('task-2', signal(), r.transport));
  const records = r.store.records().length;
  r.store.db.prepare("DELETE FROM records WHERE entity='tasks' AND id='task-2'").run();
  const outcome = await saveTask({ taskId: 'task-2', baseline: loaded.record, entity: loaded.schema!.entity, patch: { status: 'completed' }, context: loaded.context }, r.transport);
  assert.equal(outcome.kind, 'missing'); assert.equal(r.patches.length, 0); assert.equal(r.store.records().length, records - 1); assert.equal(r.store.changesCount, 0);
  const direct = await fetch(r.base + '/api/records/tasks/task-2', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ values: { status: 'completed' } }) });
  assert.equal(direct.status, 404); assert.equal(r.store.records().length, records - 1, 'PATCH a un ID inexistente no crea');
}));

test('422 real del servidor: nada se escribe y se devuelven los campos afectados', () => withRig(async r => {
  const loaded = ok(await loadTask('task-2', signal(), r.transport)), before = snapshotOf(r.store);
  const outcome = await saveTask({ taskId: 'task-2', baseline: loaded.record, entity: loaded.schema!.entity, patch: { contact_id: 'contact-no-existe', status: 'archivada' }, context: loaded.context }, r.transport);
  assert.equal(outcome.kind, 'invalid'); if (outcome.kind !== 'invalid') return;
  assert.equal(r.patches.length, 1); assert.match(outcome.fields.contact_id, /no existe/); assert.match(outcome.fields.status, /opción válida/);
  assert.equal(snapshotOf(r.store), before);
}));

test('409 real (devolución en curso): no sobreescribe ni cambia el historial', () => withRig(async r => {
  const loaded = ok(await loadTask('task-2', signal(), r.transport)); r.store.set('returnBusy', true); const before = snapshotOf(r.store);
  const outcome = await saveTask({ taskId: 'task-2', baseline: loaded.record, entity: loaded.schema!.entity, patch: { status: 'completed' }, context: loaded.context }, r.transport);
  assert.deepEqual(outcome.kind === 'rejected' && outcome.status, 409); assert.ok(wroteNothing(outcome)); assert.equal(snapshotOf(r.store), before);
}));

test('401 real: con la sesión bloqueada no se envía nada y las lecturas respetan el bloqueo', () => withRig(async r => {
  const loaded = ok(await loadTask('task-2', signal(), r.transport));
  const cookie = (await r.app.inject({ method: 'POST', url: '/api/v2/auth/setup', payload: { password: 'una contraseña local larga' } })).headers['set-cookie'] as string;
  // Sin cookie, el servidor real responde 401 a toda lectura y escritura.
  const locked = await saveTask({ taskId: 'task-2', baseline: loaded.record, entity: loaded.schema!.entity, patch: { status: 'completed' }, context: loaded.context }, r.transport);
  assert.equal(locked.kind, 'locked'); assert.equal(r.patches.length, 0);
  await assert.rejects(loadTask('task-2', signal(), r.transport), (error: unknown) => error instanceof TaskFocusError && error.status === 401);
  // La sesión caduca entre la comprobación y el PATCH: las lecturas llevan cookie, el PATCH no.
  const half: Transport = { base: r.transport.base, fetch: (input, init) => r.transport.fetch(input, init?.method === 'PATCH' ? init : { ...init, headers: { ...(init?.headers as object), Cookie: cookie.split(';')[0] } }) };
  const outcome = await saveTask({ taskId: 'task-2', baseline: loaded.record, entity: loaded.schema!.entity, patch: { status: 'completed' }, context: loaded.context }, half);
  assert.equal(outcome.kind, 'locked'); assert.equal(r.store.changesCount, 0);
}));

test('acuse perdido: se declara incierto, solo se LEE y nunca se reenvía por cuenta propia', async () => {
  for (const how of ['network', '500', 'garbled'] as const) await withRig(async r => {
    const loaded = ok(await loadTask('task-2', signal(), r.transport)), patch = { status: 'completed' };
    const outcome = await saveTask({ taskId: 'task-2', baseline: loaded.record, entity: loaded.schema!.entity, patch, context: loaded.context }, lostAck(r.transport, how));
    assert.equal(outcome.kind, 'uncertain', how); assert.equal(r.patches.length, 1);
    assert.equal(r.store.changesCount, 1, 'el servidor sí lo aplicó: declarar fallo seguro habría sido falso');
    const verdict = await verifyAfterUncertain({ taskId: 'task-2', baseline: loaded.record, patch, context: loaded.context }, r.transport);
    assert.deepEqual(verdict.kind === 'read' && verdict.evidence, 'applied'); assert.equal(r.patches.length, 1, 'verificar no escribe');
  });
});

test('acuse perdido porque el PATCH nunca llegó: la lectura muestra «sin cambios» y sigue siendo una decisión humana', () => withRig(async r => {
  const loaded = ok(await loadTask('task-2', signal(), r.transport)), patch = { status: 'completed' };
  const outcome = await saveTask({ taskId: 'task-2', baseline: loaded.record, entity: loaded.schema!.entity, patch, context: loaded.context }, lostAck(r.transport, 'network', false));
  assert.equal(outcome.kind, 'uncertain'); assert.equal(r.patches.length, 0);
  const verdict = await verifyAfterUncertain({ taskId: 'task-2', baseline: loaded.record, patch, context: loaded.context }, r.transport);
  assert.deepEqual(verdict.kind === 'read' && verdict.evidence, 'unchanged');
  // Otra edición cambia el mismo campo a un tercer valor: ya no es atribuible a esta solicitud.
  r.store.saveRecord('tasks', { status: 'pending', notes: 'otra persona' }, 'task-2'); r.store.saveRecord('tasks', { due_date: '2026-12-01' }, 'task-2');
  const diverged = await verifyAfterUncertain({ taskId: 'task-2', baseline: { ...loaded.record, values: { ...loaded.record.values, status: 'archivada' } }, patch, context: loaded.context }, r.transport);
  assert.deepEqual(diverged.kind === 'read' && diverged.evidence, 'diverged');
  const unreachable = await verifyAfterUncertain({ taskId: 'task-2', baseline: loaded.record, patch, context: loaded.context }, { base: r.base, fetch: async () => { throw new TypeError('fetch failed'); } });
  assert.equal(unreachable.kind, 'unknown');
}));

test('edición concurrente: el aviso previo existe, pero NO es atómico (la API no compara versiones)', () => withRig(async r => {
  const loaded = ok(await loadTask('task-2', signal(), r.transport)), entity = loaded.schema!.entity;
  r.store.saveRecord('tasks', { status: 'completed' }, 'task-2');   // otra pestaña escribe después de abrir la ficha
  const same = await saveTask({ taskId: 'task-2', baseline: loaded.record, entity, patch: { status: 'pending', notes: 'mío' }, context: loaded.context }, r.transport);
  assert.equal(same.kind, 'conflict'); if (same.kind !== 'conflict') return;
  assert.deepEqual(same.conflicts.map(c => [c.key, c.baseline, c.current]), [['status', 'pending', 'completed']]); assert.equal(r.patches.length, 0, 'detectado antes de enviar');
  // Si solo cambio otro campo, el PATCH parcial no pisa el estado que cambió la otra pestaña.
  const other = await saveTask({ taskId: 'task-2', baseline: loaded.record, entity, patch: { notes: 'mío' }, context: loaded.context }, r.transport);
  assert.equal(other.kind, 'saved'); assert.equal(r.store.record('tasks', 'task-2')!.values.status, 'completed'); assert.equal(r.store.record('tasks', 'task-2')!.values.notes, 'mío');
  // Límite: una escritura entre la comprobación previa y el PATCH se sobrescribe sin aviso.
  const racing: Transport = { base: r.base, fetch: async (input, init) => { if (init?.method === 'PATCH') r.store.saveRecord('tasks', { notes: 'de la otra pestaña' }, 'task-2'); return r.transport.fetch(input, init); } };
  const fresh = ok(await loadTask('task-2', signal(), r.transport));
  const lost = await saveTask({ taskId: 'task-2', baseline: fresh.record, entity, patch: { notes: 'pisado' }, context: fresh.context }, racing);
  assert.equal(lost.kind, 'saved'); assert.equal(r.store.record('tasks', 'task-2')!.values.notes, 'pisado', 'última escritura gana: no hay CAS');
}));

test('respuesta de otra ID u otra entidad no abre un editor equivocado; cancelación se propaga', () => withRig(async r => {
  const wrongId: Transport = { base: r.base, fetch: async (input, init) => String(input).includes('/records/tasks/') ? new Response(JSON.stringify({ record: { entity: 'tasks', id: 'task-9', values: {} } })) : r.transport.fetch(input, init) };
  await assert.rejects(readTask('task-2', undefined, wrongId), /otro registro/);
  const wrongEntity: Transport = { base: r.base, fetch: async (input, init) => String(input).includes('/records/tasks/') ? new Response(JSON.stringify({ record: { entity: 'contacts', id: 'task-2', values: {} } })) : r.transport.fetch(input, init) };
  await assert.rejects(loadTask('task-2', signal(), wrongEntity), /otro registro/);
  const controller = new AbortController(); controller.abort();
  await assert.rejects(loadTask('task-2', controller.signal, r.transport), (error: unknown) => error instanceof DOMException && error.name === 'AbortError');
}));

test('la copia cambia entre las lecturas de estado: no se abre ninguna ficha', () => withRig(async r => {
  let states = 0;
  const flipping: Transport = { base: r.base, fetch: async (input, init) => {
    if (String(input).endsWith('/api/v2/state') && ++states === 2) { const state = await (await r.transport.fetch(input, init)).json(); state.snapshot.id = 'otra-captura'; return new Response(JSON.stringify(state)); }
    return r.transport.fetch(input, init); } };
  await assert.rejects(loadTask('task-2', signal(), flipping), (error: unknown) => error instanceof TaskFocusError && error.kind === 'context');
}));

// ---------------------------------------------------------------------------------------------------------------------------
// Regresiones causales de la corrección tras la revisión independiente 131 (F1, F2) y de los defectos D3/D4/D6 de la QA-130.
const activate = (store: Rig['store'], id: string | null, capturedAt: string) => {
  const next = makeFixture('agency'); if (id) next.id = id; next.capturedAt = capturedAt;
  store.importSnapshot(next, true); store.saveGeneration(makeDemoSpec(next), { provider: 'demo', model: null, generatedAt: '2026-11-02T09:00:00Z', prompt: '', approved: false }); store.activate();
};
const lostPatch = (transport: Transport): Transport => ({ base: transport.base, fetch: async (input, init) => { if (init?.method === 'PATCH') { await transport.fetch(input, init); throw new TypeError('lost acknowledgement'); } return transport.fetch(input, init); } });

test('F1: verificar tras un acuse perdido contra OTRA instalación (misma ID y mismo valor) da «contexto cambiado», no evidencia', async () => {
  const one = await rig(), two = await rig();
  try {
    const a = ok(await loadTask('task-2', signal(), one.transport)), b = ok(await loadTask('task-2', signal(), two.transport));
    assert.notEqual(a.context.instanceId, b.context.instanceId); assert.equal(b.record.id, 'task-2');
    two.store.saveRecord('tasks', { status: 'completed' }, 'task-2');                       // la otra instalación tiene, por su cuenta, el mismo valor
    const outcome = await saveTask({ taskId: 'task-2', baseline: a.record, entity: a.schema!.entity, patch: { status: 'completed' }, context: a.context }, lostPatch(one.transport));
    assert.equal(outcome.kind, 'uncertain'); assert.equal(one.store.changesCount, 1);
    const before = two.patches.length;
    const verdict = await verifyAfterUncertain({ taskId: 'task-2', baseline: a.record, patch: { status: 'completed' }, context: a.context }, two.transport);
    assert.equal(verdict.kind, 'context-changed', 'la coincidencia de valores de OTRA instalación no es evidencia'); assert.equal(two.patches.length, before);
    assert.equal((await verifyAfterUncertain({ taskId: 'task-2', baseline: a.record, patch: { status: 'completed' } }, two.transport)).kind, 'unknown', 'sin contexto no hay evidencia utilizable');
    assert.equal((await verifyAfterUncertain({ taskId: 'task-2', baseline: a.record, patch: { status: 'completed' }, context: a.context }, one.transport)).kind, 'read', 'en la misma copia sí se lee');
  } finally { await one.close(); await two.close(); }
});

test('F1: la captura se sustituye (mismo ID, otra fecha) entre el acuse perdido y la verificación, o entre las dos lecturas de contexto', () => withRig(async r => {
  const a = ok(await loadTask('task-2', signal(), r.transport)), patch = { status: 'completed' };
  assert.equal((await saveTask({ taskId: 'task-2', baseline: a.record, entity: a.schema!.entity, patch, context: a.context }, lostPatch(r.transport))).kind, 'uncertain');
  activate(r.store, a.context.snapshotId, '2026-11-09T09:00:00.000Z');
  assert.equal((await verifyAfterUncertain({ taskId: 'task-2', baseline: a.record, patch, context: a.context }, r.transport)).kind, 'context-changed');
  // Cambio entre las lecturas de contexto que rodean el registro: la primera es la copia abierta, la segunda ya es otra.
  const b = ok(await loadTask('task-2', signal(), r.transport)); let states = 0;
  const flipping: Transport = { base: r.base, fetch: async (input, init) => {
    if (String(input).endsWith('/api/v2/state') && ++states === 2) { const state = await (await r.transport.fetch(input, init)).json(); state.snapshot.capturedAt = '2030-01-01T00:00:00.000Z'; return new Response(JSON.stringify(state)); }
    return r.transport.fetch(input, init); } };
  assert.equal((await verifyAfterUncertain({ taskId: 'task-2', baseline: b.record, patch, context: b.context }, flipping)).kind, 'context-changed');
}));

test('F2: una captura nueva con el MISMO ID y otra fecha es otro contexto: no se guarda en ella ni se abre con la ficha anterior', () => withRig(async r => {
  const original = ok(await loadTask('task-2', signal(), r.transport));
  activate(r.store, original.context.snapshotId, '2026-11-09T09:00:00.000Z');
  const replacement = ok(await loadTask('task-2', signal(), r.transport));
  assert.equal(replacement.context.snapshotId, original.context.snapshotId, 'mismo ID de captura'); assert.notEqual(replacement.context.capturedAt, original.context.capturedAt);
  const changesBefore = r.store.changesCount;
  const outcome = await saveTask({ taskId: 'task-2', baseline: original.record, entity: original.schema!.entity, patch: { status: 'completed' }, context: original.context }, r.transport);
  assert.equal(outcome.kind, 'context-changed'); assert.equal(r.patches.length, 0); assert.equal(r.store.changesCount, changesBefore);
  const again = await saveTask({ taskId: 'task-2', baseline: replacement.record, entity: replacement.schema!.entity, patch: { status: 'completed' }, context: replacement.context }, r.transport);
  assert.equal(again.kind, 'saved', 'con el contexto vigente sí se guarda');
  let states = 0;                                                                              // sustitución entre las dos lecturas de estado de la carga
  const flipping: Transport = { base: r.base, fetch: async (input, init) => {
    if (String(input).endsWith('/api/v2/state') && ++states === 2) { const state = await (await r.transport.fetch(input, init)).json(); state.snapshot.capturedAt = '2031-01-01T00:00:00.000Z'; return new Response(JSON.stringify(state)); }
    return r.transport.fetch(input, init); } };
  await assert.rejects(loadTask('task-2', signal(), flipping), (error: unknown) => error instanceof TaskFocusError && error.kind === 'context');
}));

const flow = (chunks: number, chunk = 65_536) => { let pulled = 0, sent = 0; return { response: (headers: Record<string, string> = {}) => new Response(new ReadableStream({ pull(controller) { if (sent >= chunks) { controller.close(); return; } sent++; pulled += chunk; controller.enqueue(new Uint8Array(chunk).fill(97)); } }), { status: 200, headers }), pulled: () => pulled }; };

test('D4 corregido: el tope de tamaño se aplica MIENTRAS se lee el flujo (no se consume la respuesta entera)', async () => {
  const body = flow(768);                                                                     // 48 MiB servidos
  await assert.rejects(readTask('task-2', undefined, { base: '', fetch: async () => body.response() }), /supera el tamaño permitido/);
  assert.ok(body.pulled() <= 1_048_576 + 2 * 65_536, 'leyó ' + body.pulled() + ' bytes: el tope es 1 MiB');
  const declared = flow(768);                                                                 // Content-Length ya declara demasiado: ni se empieza a leer
  await assert.rejects(readTask('task-2', undefined, { base: '', fetch: async () => declared.response({ 'content-length': String(48 * 1024 * 1024) }) }), /supera el tamaño permitido/);
  assert.ok(declared.pulled() <= 2 * 65_536, 'con Content-Length excesivo no se lee el cuerpo (un ReadableStream pre-lee un fragmento al crearse): ' + declared.pulled());
  const state = flow(1024);                                                                   // /api/v2/state admite más (8 MiB) pero también está acotado
  await assert.rejects(loadTask('task-2', signal(), { base: '', fetch: async (input) => String(input).endsWith('/api/health') ? new Response('{"ok":true,"instanceId":null}') : state.response() }), /supera el tamaño permitido/);
  assert.ok(state.pulled() <= 8 * 1_048_576 + 2 * 65_536, 'leyó ' + state.pulled() + ' bytes: el tope del estado es 8 MiB');
});

test('D6 corregido: una instalación válida con 3.500 propiedades extra (estado > 1 MiB) ya abre la ficha', async () => {
  const { app, store } = await createBaseApp({ dbPath: ':memory:', root: '.', staticDir: 'none' });
  try {
    const snapshot: any = makeFixture('agency'), contacts = snapshot.entities.find((e: any) => e.id === 'contacts');
    for (let i = 0; i < 3500; i++) contacts.fields.push({ key: 'custom_property_' + i, label: 'Propiedad personalizada ' + i, type: 'text', required: false, readOnly: false, options: [], referenceEntity: null });
    store.importSnapshot(snapshot); store.saveGeneration(makeDemoSpec(snapshot), { provider: 'demo', model: null, generatedAt: new Date().toISOString(), prompt: '', approved: false }); store.activate();
    await app.listen({ host: '127.0.0.1', port: 0 }); const base = 'http://127.0.0.1:' + (app.server.address() as { port: number }).port;
    const bytes = (await fetch(base + '/api/v2/state').then(response => response.text())).length; assert.ok(bytes > 1_048_576 && bytes < 8_388_608, String(bytes));
    assert.equal((await loadTask('task-2', signal(), { fetch: (input, init) => fetch(input, init), base })).kind, 'ok');
  } finally { await app.close(); }
});

test('D3 corregido: lecturas y guardados tienen tiempo límite; un PATCH que agota el suyo es «incierto», no fallo', () => withRig(async r => {
  const hang: Transport = { base: r.base, readTimeoutMs: 40, writeTimeoutMs: 40, fetch: () => new Promise<Response>(() => undefined) };   // ni siquiera respeta AbortSignal
  const started = Date.now();
  await assert.rejects(readTask('task-2', undefined, hang), (error: unknown) => error instanceof TaskFocusError && error.kind === 'network' && /tardó demasiado/.test(error.message));
  await assert.rejects(loadTask('task-2', signal(), hang), /tardó demasiado/);
  assert.ok(Date.now() - started < 3000);
  const loaded = ok(await loadTask('task-2', signal(), r.transport));
  const slowPatch: Transport = { base: r.base, writeTimeoutMs: 40, fetch: async (input, init) => init?.method === 'PATCH' ? new Promise<Response>(() => undefined) : r.transport.fetch(input, init) };
  const outcome = await saveTask({ taskId: 'task-2', baseline: loaded.record, entity: loaded.schema!.entity, patch: { notes: 'lento' }, context: loaded.context }, slowPatch);
  assert.equal(outcome.kind, 'uncertain'); assert.equal(r.patches.length, 0);
  const slowPreflight: Transport = { base: r.base, readTimeoutMs: 40, fetch: async (input, init) => init?.method === 'PATCH' ? r.transport.fetch(input, init) : new Promise<Response>(() => undefined) };
  assert.equal((await saveTask({ taskId: 'task-2', baseline: loaded.record, entity: loaded.schema!.entity, patch: { notes: 'lento 2' }, context: loaded.context }, slowPreflight)).kind, 'preflight-failed');
  assert.equal(r.patches.length, 0, 'una comprobación previa que agota su tiempo no envía nada');
}));
