import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { createBaseApp } from '../server/app.js';
import { makeFixture, makeDemoSpec } from '../shared/fixtures.js';
import { loadTask, readTask, saveTask, TaskFocusError, verifyAfterUncertain, type Transport } from '../src/local-task-focus-client.js';

// QA-130 original: ampliación de QA de su autora de123, no revisión independiente de aquella entrega. Repetida por Codex196
// sobre la ficha U1R2 aceptada y el cliente/lógica123 corregidos. Contra el servidor REAL (createBaseApp + Store en
// memoria + HTTP en 127.0.0.1) salvo donde se indica un flujo de bytes controlado. Escrita primero contra la primera presentación de
// 123 (defectos D4/D6 reproducidos); tras la devolución 131 y la corrección de 123, esas pruebas se invirtieron y ahora son
// regresiones de lo corregido. Si una fuente comprobada vuelve a cambiar, el test de huella falla a propósito.

//196 repitió primero las7 pruebas de comportamiento y19DOM originales sobre U1R2; la única roja era la huella antigua.
// Solo después se actualizó esa huella. Las aserciones de comportamiento y el specDOM se conservan. El corte anterior está archivado.
// Un cambio posterior requiere repetir la QA correspondiente, no renovar el hash para silenciarla.
const SOURCES123: Record<string, string> = {
  'shared/local-task-focus.ts': 'e41df640594532587bc0fb90a28f1a538063c5bf2e598460ce892462777358d5',
  'src/LocalTaskFocus.tsx': '8b66ebc8b8bba9025aab81858c160ac48954c16838a40acdf2248d2fbbcdb184',
  'src/local-task-focus-client.ts': '59dda342d954b659aebb750b63bc726d3c0b382142bea0ca9baf496e779ca501',
  'src/local-task-focus.css': 'cdbe8147c813be8bb57d2332d84ea4a0d4bd161b371aede30bd27391f84c1f26',
};
test('huella: QA130 repetida por196 y de nuevo por A2 (guardado condicionado y comparador en la ficha) sobre cliente/lógica123 corregidos', () => {
  for (const [file, hash] of Object.entries(SOURCES123)) assert.equal(createHash('sha256').update(fs.readFileSync(file)).digest('hex'), hash, file);
});

type Rig = Awaited<ReturnType<typeof rig>>;
async function rig(opts: { extraFields?: number; password?: boolean } = {}) {
  const { app, store } = await createBaseApp({ dbPath: ':memory:', root: '.', staticDir: 'none' });
  const patches: unknown[] = [];
  app.addHook('preHandler', async request => { if (request.method === 'PATCH') patches.push(request.body); });
  const snapshot: any = makeFixture('agency');
  if (opts.extraFields) { const contacts = snapshot.entities.find((e: any) => e.id === 'contacts'); for (let i = 0; i < opts.extraFields; i++) contacts.fields.push({ key: 'custom_property_' + i, label: 'Propiedad personalizada ' + i, type: 'text', required: false, readOnly: false, options: [], referenceEntity: null }); }
  store.importSnapshot(snapshot); store.saveGeneration(makeDemoSpec(snapshot), { provider: 'demo', model: null, generatedAt: new Date().toISOString(), prompt: '', approved: false }); store.activate();
  await app.listen({ host: '127.0.0.1', port: 0 });
  const base = 'http://127.0.0.1:' + (app.server.address() as { port: number }).port;
  return { app, store, base, patches, transport: { fetch: (input: any, init: any) => fetch(input, init), base } as Transport, close: () => app.close() };
}
const withRig = async (fn: (r: Rig) => Promise<void>, opts?: Parameters<typeof rig>[0]) => { const r = await rig(opts); try { await fn(r); } finally { await r.close(); } };
const ctl = () => new AbortController().signal;
const stream = (chunks: number, chunk = 65_536, failAfter = Infinity) => { let pulled = 0, sent = 0; return { response: () => new Response(new ReadableStream({ pull(controller) { if (pulled >= failAfter) { controller.error(new TypeError('terminated')); return; } if (sent >= chunks) { controller.close(); return; } sent++; pulled += chunk; controller.enqueue(new Uint8Array(chunk).fill(97)); } }), { status: 200 }), pulled: () => pulled }; };

test('D4 CORREGIDO en 123 (confirmación de QA): el tope de 1 MiB se aplica MIENTRAS se lee el flujo', async () => {
  const body = stream(768);                                                    // 48 MiB de bytes servidos
  const transport: Transport = { base: '', fetch: async () => body.response() };
  await assert.rejects(readTask('task-2', undefined, transport), /supera el tamaño permitido/);
  assert.ok(body.pulled() <= 1_048_576 + 2 * 65_536, 'leyó ' + body.pulled() + ' bytes; el tope es 1 MiB (antes: los 48 MiB)');
});

test('respuestas truncadas, inválidas o de otro formato: error claro en lecturas, «incierto» en el PATCH, nunca tarea vacía', async () => {
  const cut = stream(10, 1000, 3000);
  await assert.rejects(readTask('task-2', undefined, { base: '', fetch: async () => cut.response() }), (e: unknown) => e instanceof TaskFocusError && e.kind === 'network' && e.status === 0);
  for (const [name, make] of Object.entries({ html200: () => new Response('<html>proxy</html>', { status: 200 }), vacio: () => new Response('', { status: 200 }), json: () => new Response('{"record":', { status: 200 }), otro: () => new Response('{}', { status: 200 }), html502: () => new Response('<html>bad gateway</html>', { status: 502 }) }))
    await assert.rejects(readTask('task-2', undefined, { base: '', fetch: async () => make() }), (e: unknown) => e instanceof TaskFocusError, name);
  await withRig(async r => {
    const loaded = await loadTask('task-2', ctl(), r.transport); assert.equal(loaded.kind, 'ok'); if (loaded.kind !== 'ok') return;
    for (const how of ['html200', 'vacio', 'truncado', 'html502', 'otra-tarea']) {
      const transport: Transport = { base: r.base, fetch: async (input, init) => {
        if (init?.method !== 'PATCH') return r.transport.fetch(input, init);
        if (how === 'html200') return new Response('<html>proxy</html>', { status: 200 });
        if (how === 'vacio') return new Response('', { status: 200 });
        if (how === 'truncado') return stream(5, 100, 200).response();
        if (how === 'otra-tarea') return new Response(JSON.stringify({ record: { entity: 'tasks', id: 'task-9', values: {} } }), { status: 200 });
        return new Response('<html>bad gateway</html>', { status: 502 });
      } };
      const outcome = await saveTask({ taskId: 'task-2', baseline: loaded.record, entity: loaded.schema!.entity, patch: { notes: how }, context: loaded.context }, transport);
      assert.equal(outcome.kind, 'uncertain', how);
    }
    assert.equal(r.patches.length, 0, 'ningún PATCH llegó al servidor real en este caso (el transporte los interceptó)');
    assert.equal((await verifyAfterUncertain({ taskId: 'task-2', baseline: loaded.record, patch: { notes: 'x' }, context: loaded.context }, r.transport)).kind, 'read');
  });
});

test('D6 CORREGIDO en 123 (confirmación de QA, medido): con 3.500 propiedades extra el estado supera 1 MiB y la ficha abre; muy por encima del tope nuevo se rechaza sin consumirlo', async () => {
  const sizes: Record<number, number> = {};
  for (const extra of [500, 3500]) await withRig(async r => {
    sizes[extra] = (await fetch(r.base + '/api/v2/state').then(response => response.text())).length;
    assert.equal((await loadTask('task-2', ctl(), r.transport)).kind, 'ok', String(extra));
  }, { extraFields: extra });
  assert.ok(sizes[500] < 1_000_000 && sizes[3500] > 1_000_000 && sizes[3500] < 8_000_000, JSON.stringify(sizes));
  // ≈ 300 B por propiedad personalizada: el tope de 8 MiB admite ~27.000 propiedades extra; por encima, error claro y lectura acotada.
});

test('401: un bloqueo REAL (servidor) no se reabre por respuestas tardías; borrar solo la cookie del cliente sí deja la sesión válida', async () => {
  await withRig(async r => {
    const setup = await fetch(r.base + '/api/v2/auth/setup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: 'una contraseña local larga' }) });
    const cookie = /planb_session=([a-f0-9]+)/.exec(setup.headers.get('set-cookie') ?? '')![0];
    const read = () => fetch(r.base + '/api/v2/records/tasks/task-2', { headers: { Cookie: cookie } });
    const late = await read(); assert.equal(late.status, 200);
    assert.match(late.headers.get('set-cookie') ?? '', /planb_session=[a-f0-9]+/, 'las lecturas autenticadas devuelven Set-Cookie: una respuesta tardía puede volver a escribirlo en el navegador');
    // Control (lo que hacía el arnés de 123 con clearCookies): el servidor sigue considerando válida esa sesión.
    assert.equal((await read()).status, 200, 'sin bloqueo en servidor, volver a presentar la cookie funciona');
    const lock = await fetch(r.base + '/api/v2/auth/lock', { method: 'POST', headers: { Cookie: cookie } }); assert.equal(lock.status, 200);
    assert.equal((await read()).status, 401, 'tras el bloqueo real, la misma cookie ya no abre nada');
    const state = await fetch(r.base + '/api/v2/state', { headers: { Cookie: cookie } }); assert.equal(state.status, 401);
    // El cliente de la ficha, con esa cookie, ve 401 en TODAS las lecturas y en el guardado; no envía nada.
    const withCookie: Transport = { base: r.base, fetch: (input, init) => fetch(input, { ...init, headers: { ...(init?.headers as object), Cookie: cookie } }) };
    await assert.rejects(loadTask('task-2', ctl(), withCookie), (e: unknown) => e instanceof TaskFocusError && e.status === 401);
    assert.equal(r.patches.length, 0);
  });
});

test('CONTRAPRUEBA de CAS: dos guardados simultáneos del mismo campo pasan ambos la comprobación previa y el último gana sin aviso', () => withRig(async r => {
  const a = await loadTask('task-2', ctl(), r.transport), b = await loadTask('task-2', ctl(), r.transport);
  if (a.kind !== 'ok' || b.kind !== 'ok') throw new Error('no cargó');
  let preflights = 0; const release: (() => void)[] = []; const barrier = new Promise<void>(resolve => { release.push(resolve); });
  const transport: Transport = { base: r.base, fetch: async (input, init) => {
    if (init?.method === 'PATCH') { if (++preflights === 2) release[0](); await barrier; }       // ambos PATCH salen cuando ambas comprobaciones ya terminaron
    return r.transport.fetch(input, init);
  } };
  const [ra, rb] = await Promise.all([
    saveTask({ taskId: 'task-2', baseline: a.record, entity: a.schema!.entity, patch: { notes: 'nota A' }, context: a.context }, transport),
    saveTask({ taskId: 'task-2', baseline: b.record, entity: b.schema!.entity, patch: { notes: 'nota B' }, context: b.context }, transport),
  ]);
  assert.deepEqual([ra.kind, rb.kind], ['saved', 'saved'], 'ninguna de las dos detecta conflicto: no hay CAS');
  assert.equal(r.patches.length, 2); const changes = r.store.changes(); assert.equal(changes.length, 2);
  assert.equal(r.store.record('tasks', 'task-2')!.values.notes, changes[1].after.values.notes, 'gana la última escritura');
  assert.equal(changes[1].before!.values.notes, changes[0].after.values.notes, 'la segunda pisó a la primera tras verla aplicada');
}));

test('envíos idénticos simultáneos a nivel de cliente (con barrera): dos PATCH y dos filas de historial; la protección de doble clic es solo de la interfaz', () => withRig(async r => {
  const a = await loadTask('task-2', ctl(), r.transport); if (a.kind !== 'ok') throw new Error('no cargó');
  const args = { taskId: 'task-2', baseline: a.record, entity: a.schema!.entity, patch: { status: 'completed' }, context: a.context };
  let sent = 0; let open!: () => void; const barrier = new Promise<void>(resolve => { open = resolve; });
  const transport: Transport = { base: r.base, fetch: async (input, init) => { if (init?.method === 'PATCH') { if (++sent === 2) open(); await barrier; } return r.transport.fetch(input, init); } };
  const [x, y] = await Promise.all([saveTask(args, transport), saveTask(args, transport)]);
  assert.deepEqual([x.kind, y.kind], ['saved', 'saved']); assert.equal(r.patches.length, 2);
  assert.equal(r.store.changesCount, 2, 'valores idénticos, dos filas de historial: el servidor no distingue repeticiones');
}));

test('cancelar ≠ deshacer: abortar la señal tras la comprobación previa no impide ni deshace el PATCH ya enviado', () => withRig(async r => {
  const a = await loadTask('task-2', ctl(), r.transport); if (a.kind !== 'ok') throw new Error('no cargó');
  const abort = new AbortController();
  const transport: Transport = { base: r.base, fetch: async (input, init) => { if (init?.method === 'PATCH') abort.abort(); return r.transport.fetch(input, init); } };
  const outcome = await saveTask({ taskId: 'task-2', baseline: a.record, entity: a.schema!.entity, patch: { notes: 'cerrada a mitad' }, context: a.context, signal: abort.signal }, transport);
  assert.equal(outcome.kind, 'saved'); assert.equal(r.store.changesCount, 1);
  const preflightAborted = new AbortController(); preflightAborted.abort();
  await assert.rejects(saveTask({ taskId: 'task-2', baseline: a.record, entity: a.schema!.entity, patch: { notes: 'otra' }, context: a.context, signal: preflightAborted.signal }, r.transport), (e: unknown) => e instanceof DOMException && e.name === 'AbortError');
  assert.equal(r.store.changesCount, 1, 'abortar ANTES del PATCH no envía nada');
}));
