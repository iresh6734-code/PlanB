import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';

// QA073 · TEAM069: contrato de la réplica de equipo con cliente real (TeamSyncClient + rutas Fastify) y un fetcher propio que
// jamás sale a red. Empresa UUID y tokens de 64 hex inventados. El oráculo son listas de IDs construidas aquí, no consultas a las
// funciones bajo prueba. totalRecords/recordsComplete se contrastan con lo que se guardó, no con el servidor remoto.
// Fuentes bajo prueba = QA073_ROOT (corte propio, por defecto este checkout).
const OVERRIDE = process.env.QA073_ROOT;
const ROOT = OVERRIDE ? path.resolve(OVERRIDE) : path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const load = (relative: string) => import(pathToFileURL(path.join(ROOT, relative)).href);
const { createBaseApp } = await load('server/app.ts') as typeof import('../server/app.js');
const { registerTeamSync } = await load('server/team-sync.ts') as typeof import('../server/team-sync.js');
const { makeFixture, makeDemoSpec } = await load('shared/fixtures.ts') as typeof import('../shared/fixtures.js');
const { TeamReplicaViewSchema, replicaContacts, completeReplica } = await load('shared/team-replica-view.ts') as typeof import('../shared/team-replica-view.js');

const ORIGIN = 'https://equipo.example.invalid';
const TOKEN = 'ab'.repeat(32);
const TENANT = randomUUID();
const STALE = 'La réplica cambió desde que abriste la ficha. Actualiza la copia y revisa el teléfono antes de guardarlo.';
type Row = { entity: string; id: string; version: number; value: any };
const contact = (n: number, values: Record<string, unknown> = {}): Row => ({ entity: 'contacts', id: 'c-' + String(n).padStart(3, '0'), version: 1, value: { entity: 'contacts', id: 'c-' + String(n).padStart(3, '0'), values: { firstname: 'Nombre' + n, lastname: 'Apellido' + n, email: 'c' + n + '@example.invalid', phone: '600 100 ' + String(n).padStart(3, '0'), ...values } } });
const company = (n: number): Row => ({ entity: 'companies', id: 'co-' + String(n).padStart(3, '0'), version: 1, value: { entity: 'companies', id: 'co-' + String(n).padStart(3, '0'), values: { name: 'Empresa ' + n } } });

interface Call { method: string; url: string; body: any }
/** Servidor de equipo ficticio: responde solo a través de este fetcher. Cualquier URL ajena a ORIGIN es un fallo de la prueba. */
function remote(options: { tenant?: string; records?: Row[]; cursor?: number; bootstrap?: () => Promise<Response> | Response; exchange?: (body: any, n: number) => any } = {}) {
  const calls: Call[] = []; let exchanges = 0;
  const snapshot = makeFixture('agency'); const spec = makeDemoSpec(snapshot);
  const fetcher = (async (input: any, init: any = {}) => {
    const url = String(input), body = init.body ? JSON.parse(init.body) : null;
    calls.push({ method: init.method ?? 'GET', url, body });
    assert.ok(url.startsWith(ORIGIN + '/'), 'ninguna petición puede salir de la red de la prueba: ' + url);
    if (url.endsWith('/api/team/device/bootstrap')) {
      if (options.bootstrap) return options.bootstrap();
      return new Response(JSON.stringify({ tenantId: options.tenant ?? TENANT, demo: true, blueprint: { snapshot: { ...snapshot, records: [], links: [] }, spec }, records: options.records ?? [], cursor: options.cursor ?? 5 }), { status: 200 });
    }
    if (url.endsWith('/api/team/device/exchange')) {
      const out = options.exchange ? options.exchange(body, ++exchanges) : { tenantId: options.tenant ?? TENANT, results: body.operations.map((op: any) => ({ operationId: op.id, status: 'applied', version: op.baseVersion + 1, recordId: op.recordId })), events: [], resolvedConflicts: [], cursor: (body.cursor ?? 0) + 1, hasMore: false };
      if (out instanceof Response) return out;
      return new Response(JSON.stringify(out), { status: 200 });
    }
    throw new Error('ruta no prevista ' + url);
  }) as typeof fetch;
  return { fetcher, calls };
}
async function linked(records: Row[], options: Parameters<typeof remote>[0] = {}) {
  const h = await createBaseApp({ dbPath: ':memory:', root: '.', staticDir: 'none' });
  const r = remote({ records, ...options });
  registerTeamSync(h.app, h.store, ORIGIN, false, r.fetcher);
  const setup = await h.app.inject({ method: 'POST', url: '/api/v2/auth/setup', payload: { password: 'contrasena-ficticia-qa073' } });
  const cookie = String(setup.headers['set-cookie']).split(';')[0];
  const call = (method: 'GET' | 'POST', url: string, payload?: unknown) => h.app.inject({ method, url, payload: payload as any, headers: { cookie } });
  const link = () => call('POST', '/api/v5/team-sync/link', { url: ORIGIN + '/', token: TOKEN, tenantId: options.tenant ?? TENANT });
  const status = async () => (await call('GET', '/api/v5/team-sync')).json();
  return { h, r, call, link, status, cookie, close: () => h.app.close() };
}
const stored = (t: { h: any }) => t.h.store.get('teamReplica', null) as any;
const ids = (rows: { id: string }[]) => rows.map(x => x.id);

test('R1 más de 100 fichas de otras entidades antes de 225 contactos: todos los contactos siguen accesibles; la operación pendiente se proyecta sin tocar lo guardado', async () => {
  const records = [...Array.from({ length: 130 }, (_, i) => company(i + 1)), ...Array.from({ length: 225 }, (_, i) => contact(i + 1))];
  const t = await linked(records);
  try {
    const res = await t.link(); assert.equal(res.statusCode, 200, res.body);
    const view = TeamReplicaViewSchema.parse(await t.status());
    assert.equal(view.records.length, 355); assert.equal(view.totalRecords, 355); assert.equal(view.recordsComplete, true); assert.equal(completeReplica(view), true);
    const want = Array.from({ length: 225 }, (_, i) => 'c-' + String(i + 1).padStart(3, '0'));
    const seen: string[] = []; let page = 0;
    for (;;) { const r = replicaContacts(view.records as any, '', page); seen.push(...ids(r.items)); assert.equal(r.total, 225); assert.equal(r.contacts, 225); assert.equal(r.pages, 12); if (!r.hasMore) { assert.equal(r.items.length, 5); assert.equal(r.end, 225); break; } page++; assert.ok(page < 30); }
    assert.deepEqual(seen, want, 'recorrido de páginas = los 225 contactos en orden, sin saltos ni duplicados');
    assert.deepEqual(ids(replicaContacts(view.records as any, 'c-225', 0).items), ['c-225'], 'el último ID es alcanzable por búsqueda');
    // Operación pendiente sobre el último contacto.
    const before = JSON.stringify(stored(t).records);
    const edit = await t.call('POST', '/api/v6/team-sync/edit', { entity: 'contacts', id: 'c-225', values: { phone: '911 000 225' }, revision: view.revision });
    assert.equal(edit.statusCode, 200, edit.body); assert.equal(edit.json().queued, true);
    const after = TeamReplicaViewSchema.parse(await t.status());
    assert.equal(after.pending, 1);
    assert.equal(after.records.find(r => r.id === 'c-225')!.value.values.phone, '911 000 225', 'la vista proyecta la operación pendiente');
    assert.equal(JSON.stringify(stored(t).records), before, 'lo guardado como estado remoto no cambia al consultar ni al encolar');
    for (let i = 0; i < 3; i++) await t.status();
    assert.equal(JSON.stringify(stored(t).records), before, 'consultar repetidamente no escribe');
    assert.notEqual(after.revision, view.revision, 'encolar cambia la revisión');
  } finally { await t.close(); }
});

test('R2 límite de 10.000 fichas: exactamente 10.000 se aceptan; 10.001 no se guardan; crecer por sincronización lo detiene sin perder lo anterior', async () => {
  const many = (n: number) => Array.from({ length: n }, (_, i) => contact(i + 1, { lastname: 'L' }));
  const ok = await linked(many(10000));
  try {
    const res = await ok.link(); assert.equal(res.statusCode, 200, res.body.slice(0, 200));
    const view = await ok.status(); assert.equal(view.totalRecords, 10000); assert.equal(view.records.length, 10000); assert.equal(TeamReplicaViewSchema.safeParse(view).success, true);
    // Una ficha más llegando por sincronización no se acepta y el estado guardado no cambia.
    const over = await linked(many(10000), { exchange: body => ({ tenantId: TENANT, results: [], events: [{ seq: '1', entity: 'contacts', record_id: 'c-10001', value: contact(10001).value, version: 1 }], resolvedConflicts: [], cursor: body.cursor + 1, hasMore: false }) });
    try {
      assert.equal((await over.link()).statusCode, 200);
      const snapshot = JSON.stringify(stored(over).records), cursor = stored(over).cursor;
      const sync = await over.call('POST', '/api/v5/team-sync/run', { reviewed: true });
      assert.equal(sync.statusCode, 502);
      assert.equal(JSON.stringify(stored(over).records), snapshot, 'la réplica anterior se conserva íntegra'); assert.equal(stored(over).cursor, cursor, 'el cursor no avanza');
      assert.ok(stored(over).error, 'queda un error visible');
    } finally { await over.close(); }
  } finally { await ok.close(); }
  const tooMany = await linked(many(10001));
  try {
    const res = await tooMany.link(); assert.equal(res.statusCode, 422, res.body.slice(0, 200));
    assert.equal(stored(tooMany), null, 'una réplica fuera de contrato no se guarda');
  } finally { await tooMany.close(); }
});

test('R3 metadata antigua o discordante: se acepta lo legible, se avisa y no se inventan filas', () => {
  const base = { linked: true, configured: true, origin: ORIGIN, url: ORIGIN + '/', tenantId: TENANT, records: [contact(1), contact(2)], pending: 0, conflicts: [], lastSync: null, error: null };
  const old = TeamReplicaViewSchema.safeParse(base);
  assert.equal(old.success, true, 'un servidor antiguo sin revisión/totalRecords/recordsComplete sigue siendo legible');
  assert.equal(completeReplica(old.data!), false, 'sin metadata de completitud no se afirma que esté completa');
  assert.equal(old.data!.records.length, 2);
  const discordant = TeamReplicaViewSchema.parse({ ...base, totalRecords: 3, recordsComplete: true });
  assert.equal(completeReplica(discordant), false, 'totalRecords no coincide con las filas recibidas');
  assert.equal(discordant.records.length, 2, 'no se inventan filas');
  assert.equal(completeReplica(TeamReplicaViewSchema.parse({ ...base, totalRecords: 2, recordsComplete: false })), false);
  assert.equal(completeReplica(TeamReplicaViewSchema.parse({ ...base, totalRecords: 2, recordsComplete: true })), true);
  for (const [label, bad] of [
    ['ficha duplicada', { ...base, records: [contact(1), contact(1)] }], ['identidad discordante', { ...base, records: [{ ...contact(1), id: 'otro' }] }],
    ['vinculada sin empresa', { ...base, tenantId: undefined }], ['vinculada sin destino', { ...base, url: undefined }], ['origen con credenciales', { ...base, origin: 'https://u:p@equipo.example.invalid/' }],
    ['origen http remoto', { ...base, origin: 'http://equipo.example.invalid/' }], ['revisión no hex', { ...base, revision: 'zz'.repeat(32) }], ['totalRecords negativo', { ...base, totalRecords: -1 }],
  ] as const) assert.equal(TeamReplicaViewSchema.safeParse(bad).success, false, label);
  assert.equal(TeamReplicaViewSchema.safeParse({ ...base, records: Array.from({ length: 10001 }, (_, i) => contact(i + 1)) }).success, false, '10.001 filas no son un estado válido');
});

test('R4 búsqueda por todos los términos: ID, nombre, apellido y teléfono; acentos; valores 0/false/null; páginas de 20 con contadores', () => {
  const rows: Row[] = [
    contact(1, { firstname: 'Ángela', lastname: 'Núñez', phone: '+34 600 111 222' }), contact(2, { firstname: 'Angel', lastname: 'Nunez', phone: '600 333 444' }),
    contact(3, { firstname: null, lastname: 'Sinnombre', phone: 0 }), contact(4, { firstname: false, lastname: 'Bool', phone: null }),
    contact(5, { firstname: 'María José', lastname: 'García', phone: undefined as any }), contact(6, { firstname: '0', lastname: 'Cero', phone: '' }),
    ...Array.from({ length: 30 }, (_, i) => contact(7 + i, { lastname: 'Relleno' })), company(1),
  ];
  const q = (s: string) => ids(replicaContacts(rows as any, s, 0, 50).items);
  assert.deepEqual(q('angela nunez'), ['c-001'], 'dos términos (Y) con acentos y mayúsculas');
  assert.deepEqual(q('ANGEL nunez'), ['c-001', 'c-002'], 'sin acento coincide con ambas; «angel» es prefijo de «ángela»');
  assert.deepEqual(q('600 333'), ['c-002'], 'teléfono con espacios');
  assert.deepEqual(q('+34'), ['c-001']);
  assert.deepEqual(q('c-003'), ['c-003'], 'por ID');
  assert.deepEqual(q('sinnombre 0'), ['c-003'], 'teléfono numérico 0 se busca como «0»');
  assert.deepEqual(q('bool false'), ['c-004'], 'false se busca como texto y null no rompe');
  assert.deepEqual(q('maria jose garcia'), ['c-005'], 'undefined no rompe y los acentos se pliegan');
  assert.deepEqual(q('cero'), ['c-006']);
  assert.ok(!q('null').includes('c-003') && !q('undefined').includes('c-005'), 'null/undefined no se indexan como texto');
  assert.deepEqual(q('empresa'), [], 'las empresas no son contactos');
  assert.equal(replicaContacts(rows as any, '', 0).contacts, 36);
  // Páginas de 20 con contadores correctos y último ID alcanzable.
  const p0 = replicaContacts(rows as any, '', 0), p1 = replicaContacts(rows as any, '', 1), p9 = replicaContacts(rows as any, '', 9);
  assert.deepEqual([p0.start, p0.end, p0.pages, p0.hasMore], [1, 20, 2, true]); assert.deepEqual([p1.start, p1.end, p1.hasMore], [21, 36, false]);
  assert.equal(p9.page, 1, 'una página fuera de rango se ajusta a la última válida'); assert.deepEqual(ids(p1.items).at(-1), 'c-036');
  const none = replicaContacts(rows as any, 'zzz-no-existe', 3);
  assert.deepEqual([none.total, none.start, none.end, none.page, none.items.length, none.hasMore], [0, 0, 0, 0, 0, false]);
  for (const weird of [Number.NaN, -4, 1.5, Infinity]) assert.doesNotThrow(() => replicaContacts(rows as any, '', weird as any));
});

test('R5 la revisión es estable ante lectura y lastSync y cambia con datos, outbox, cursor, empresa, destino y conflictos; no contiene el token', async () => {
  const t = await linked([contact(1), contact(2), company(1)]);
  try {
    assert.equal((await t.link()).statusCode, 200);
    const first = await t.status(); const rev = first.revision as string;
    assert.match(rev, /^[a-f0-9]{64}$/);
    assert.equal((await t.status()).revision, rev, 'lecturas repetidas');
    const raw = (await t.call('GET', '/api/v5/team-sync')).body;
    assert.ok(!raw.includes(TOKEN) && !/"token"/.test(raw), 'el token nunca aparece en la vista'); assert.ok(!/Bearer/.test(raw));
    const mutate = async (label: string, fn: (s: any) => void, expectChange: boolean) => {
      const s = JSON.parse(JSON.stringify(stored(t))); fn(s); t.h.store.set('teamReplica', s);
      const next = (await t.status()).revision; assert.equal(next !== rev, expectChange, label); t.h.store.set('teamReplica', JSON.parse(JSON.stringify(stored(t))));
    };
    const original = JSON.parse(JSON.stringify(stored(t)));
    const restore = () => t.h.store.set('teamReplica', JSON.parse(JSON.stringify(original)));
    await mutate('lastSync', s => { s.lastSync = '2030-01-01T00:00:00.000Z'; }, false); restore();
    await mutate('error', s => { s.error = 'Fallo ficticio'; }, false); restore();
    await mutate('token', s => { s.token = 'cd'.repeat(32); }, false); restore();
    await mutate('datos', s => { s.records[0].value.values.phone = '000'; }, true); restore();
    await mutate('versión de ficha', s => { s.records[0].version = 9; }, true); restore();
    await mutate('cursor', s => { s.cursor += 1; }, true); restore();
    await mutate('empresa', s => { s.tenantId = randomUUID(); }, true); restore();
    await mutate('destino', s => { s.url = 'https://otro.example.invalid/'; }, true); restore();
    await mutate('outbox', s => { s.outbox.push({ id: randomUUID(), entity: 'contacts', recordId: 'c-001', baseVersion: 1, values: { phone: '1' } }); }, true); restore();
    await mutate('conflictos', s => { s.conflicts.push({ operationId: randomUUID(), status: 'conflict', version: 1, recordId: 'c-001' }); }, true); restore();
    assert.equal((await t.status()).revision, rev, 'tras restaurar vuelve a la misma revisión (determinista)');
  } finally { await t.close(); }
});

test('R6 la ruta v6 exige la revisión exacta de apertura; 409 no muta ni hace tráfico; v5 sigue compatible sin la garantía', async () => {
  const t = await linked([contact(1), contact(2)]);
  try {
    assert.equal((await t.link()).statusCode, 200);
    const opened = (await t.status()).revision as string, calls = t.r.calls.length;
    const edit = (payload: unknown) => t.call('POST', '/api/v6/team-sync/edit', payload);
    const values = { phone: '910 000 001' };
    for (const [label, body] of [['sin revisión', { entity: 'contacts', id: 'c-001', values }], ['revisión corta', { entity: 'contacts', id: 'c-001', values, revision: opened.slice(1) }], ['revisión mayúsculas', { entity: 'contacts', id: 'c-001', values, revision: opened.toUpperCase() }], ['campo extra', { entity: 'contacts', id: 'c-001', values, revision: opened, force: true }]] as const) {
      const res = await edit(body); assert.equal(res.statusCode, 422, label + ' ' + res.body);
    }
    assert.equal(stored(t).outbox.length, 0);
    const wrong = await edit({ entity: 'contacts', id: 'c-001', values, revision: '0'.repeat(64) });
    assert.equal(wrong.statusCode, 409); assert.equal(wrong.json().error, STALE);
    assert.equal(stored(t).outbox.length, 0, '409 no muta el outbox'); assert.equal(t.r.calls.length, calls, '409 no genera tráfico remoto');
    const okRes = await edit({ entity: 'contacts', id: 'c-001', values, revision: opened });
    assert.equal(okRes.statusCode, 200, okRes.body); assert.equal(stored(t).outbox.length, 1);
    const again = await edit({ entity: 'contacts', id: 'c-002', values, revision: opened });
    assert.equal(again.statusCode, 409, 'la misma revisión de apertura no sirve tras cambiar la réplica'); assert.equal(stored(t).outbox.length, 1);
    assert.equal(t.r.calls.length, calls, 'encolar nunca llama al servidor');
    // v5 anterior: sigue funcionando sin revisión (compatibilidad, no la garantía nueva).
    const legacy = await t.call('POST', '/api/v5/team-sync/edit', { entity: 'contacts', id: 'c-002', values });
    assert.equal(legacy.statusCode, 200); assert.equal(stored(t).outbox.length, 2);
    // Reglas de edición.
    assert.equal((await edit({ entity: 'contacts', id: 'no-existe', values, revision: (await t.status()).revision })).statusCode, 404);
    assert.equal((await edit({ entity: 'contacts', id: 'c-001', values: { email: 'no-es-correo' }, revision: (await t.status()).revision })).statusCode, 422);
  } finally { await t.close(); }
});

/** Compuerta determinista: la prueba solo actúa cuando el arranque remoto YA empezó y lo libera cuando quiere. */
function gated(records: Row[]) {
  let release!: () => void, begin!: () => void;
  const open = new Promise<void>(r => { release = r; }), begun = new Promise<void>(r => { begin = r; });
  const snapshot = { ...makeFixture('agency'), records: [], links: [] }, spec = makeDemoSpec(makeFixture('agency'));
  const bootstrap = async () => { begin(); await open; return new Response(JSON.stringify({ tenantId: TENANT, demo: true, blueprint: { snapshot, spec }, records, cursor: 1 }), { status: 200 }); };
  return { bootstrap, begun, release };
}
/** Espera una promesa como máximo ms; si no termina devuelve 'PENDIENTE' en lugar de colgar la prueba. */
const within = <T>(p: Promise<T>, ms = 1500) => Promise.race([p, new Promise<'PENDIENTE'>(r => setTimeout(() => r('PENDIENTE'), ms))]);

test('R7 vinculación concurrente: un solo vuelo; error libera el vuelo; sesión de continuidad o réplica ajena durante el arranque impiden vincular', async () => {
  // Dos peticiones a la vez: la segunda llega cuando el arranque de la primera ya está en curso.
  const g1 = gated([contact(1)]);
  const a = await linked([contact(1)], { bootstrap: g1.bootstrap });
  try {
    const first = a.link(); await g1.begun;
    const second = await within(a.link());
    assert.notEqual(second, 'PENDIENTE', 'la segunda vinculación debe rechazarse de inmediato, no abrir un segundo arranque');
    assert.equal((second as any).statusCode, 409, (second as any).body);
    g1.release(); const done = await first; assert.equal(done.statusCode, 200);
    assert.equal(stored(a).records.length, 1); assert.equal(a.r.calls.filter(c => c.url.endsWith('/bootstrap')).length, 1, 'una sola petición de arranque');
  } finally { g1.release(); await a.close(); }
  // Error → libera el vuelo y se puede reintentar.
  let attempt = 0; const ok = gated([contact(1)]); ok.release();
  const b = await linked([contact(1)], { bootstrap: () => ++attempt === 1 ? new Response('{}', { status: 500 }) : ok.bootstrap() });
  try {
    const failed = await b.link(); assert.ok(failed.statusCode >= 400); assert.equal(stored(b), null, 'un error no deja réplica a medias');
    const retry = await b.link(); assert.equal(retry.statusCode, 200, 'el reintento no queda bloqueado por el vuelo anterior: ' + retry.body); assert.equal(attempt, 2);
  } finally { await b.close(); }
  // Sesión de continuidad iniciada durante el arranque.
  const g2 = gated([contact(1)]);
  const c = await linked([contact(1)], { bootstrap: g2.bootstrap });
  try {
    const p = c.link(); await g2.begun; c.h.store.set('continuitySession', { id: 'sesion-ficticia' }); g2.release();
    const res = await p; assert.equal(res.statusCode, 409, res.body); assert.equal(stored(c), null, 'no se vincula si empezó una sesión de continuidad durante el arranque');
  } finally { g2.release(); await c.close(); }
  // Otra réplica guardada mientras tanto: no se sobrescribe.
  const g3 = gated([contact(1)]);
  const d = await linked([contact(1)], { bootstrap: g3.bootstrap });
  try {
    const p = d.link(); await g3.begun;
    const foreign = { url: ORIGIN, token: 'ee'.repeat(32), tenantId: randomUUID(), spec: makeDemoSpec(makeFixture('agency')), records: [company(7)], outbox: [], conflicts: [], cursor: 99, lastSync: null, error: null };
    d.h.store.set('teamReplica', foreign); g3.release();
    const res = await p; assert.equal(res.statusCode, 409, res.body);
    assert.deepEqual(stored(d), foreign, 'la réplica ajena permanece exactamente igual');
  } finally { g3.release(); await d.close(); }
});

test('R8 arranque inválido: empresa distinta, duplicados, identidad discordante o solo origen configurado — no entra como réplica', async () => {
  const cases: [string, Parameters<typeof remote>[0], number][] = [
    ['empresa distinta de la esperada', { tenant: randomUUID() }, 403], ['duplicados', { records: [contact(1), contact(1)] }, 422],
    ['identidad discordante', { records: [{ ...contact(1), id: 'otro' }] }, 422],
  ];
  for (const [label, options, status] of cases) {
    const t = await linked([contact(1)], { ...options });
    try {
      const body = label.startsWith('empresa') ? { url: ORIGIN + '/', token: TOKEN, tenantId: TENANT } : undefined;
      const res = body ? await t.call('POST', '/api/v5/team-sync/link', body) : await t.link();
      assert.equal(res.statusCode, status, label + ': ' + res.body); assert.equal(stored(t), null, label + ': nada guardado');
    } finally { await t.close(); }
  }
  const t = await linked([contact(1)]);
  try {
    const wrongOrigin = await t.call('POST', '/api/v5/team-sync/link', { url: 'https://otro.example.invalid/', token: TOKEN, tenantId: TENANT });
    assert.equal(wrongOrigin.statusCode, 403); assert.equal(t.r.calls.length, 0, 'un origen no configurado no genera ninguna petición');
    const withQuery = await t.call('POST', '/api/v5/team-sync/link', { url: ORIGIN + '/?x=1', token: TOKEN, tenantId: TENANT });
    assert.equal(withQuery.statusCode, 403); assert.equal(t.r.calls.length, 0);
  } finally { await t.close(); }
});

test('R9 sincronización: acuse de otra empresa o de operación ajena se rechaza sin perder el outbox; un acuse válido retira solo lo reconocido', async () => {
  const run = async (exchange: (body: any) => any) => {
    const t = await linked([contact(1), contact(2)], { exchange });
    assert.equal((await t.link()).statusCode, 200);
    for (const id of ['c-001', 'c-002']) assert.equal((await t.call('POST', '/api/v5/team-sync/edit', { entity: 'contacts', id, values: { phone: '910 ' + id } })).statusCode, 200);
    const before = JSON.stringify({ o: stored(t).outbox, c: stored(t).cursor, r: stored(t).records });
    const res = await t.call('POST', '/api/v5/team-sync/run', { reviewed: true });
    return { t, res, before };
  };
  const other = await run(body => ({ tenantId: randomUUID(), results: body.operations.map((op: any) => ({ operationId: op.id, status: 'applied', version: 2, recordId: op.recordId })), events: [], cursor: 9, hasMore: false }));
  try { assert.equal(other.res.statusCode, 502); assert.equal(JSON.stringify({ o: stored(other.t).outbox, c: stored(other.t).cursor, r: stored(other.t).records }), other.before, 'otra empresa: nada cambia'); assert.equal(stored(other.t).outbox.length, 2); } finally { await other.t.close(); }
  const foreignOp = await run(() => ({ tenantId: TENANT, results: [{ operationId: randomUUID(), status: 'applied', version: 2, recordId: 'c-001' }], events: [], cursor: 9, hasMore: false }));
  try { assert.equal(foreignOp.res.statusCode, 502); assert.equal(stored(foreignOp.t).outbox.length, 2, 'un acuse de una operación que no se envió no retira nada'); assert.equal(stored(foreignOp.t).cursor, 5); } finally { await foreignOp.t.close(); }
  const partial = await run(body => ({ tenantId: TENANT, results: [{ operationId: body.operations[0].id, status: 'applied', version: 2, recordId: body.operations[0].recordId }], events: [], cursor: 9, hasMore: false }));
  try {
    assert.equal(partial.res.statusCode, 200, partial.res.body);
    const s = stored(partial.t); assert.equal(s.outbox.length, 1, 'solo se retira la operación reconocida'); assert.equal(s.outbox[0].recordId, 'c-002'); assert.equal(s.cursor, 9); assert.equal(s.error, null);
    const view = await partial.t.status(); assert.equal(view.pending, 1);
  } finally { await partial.t.close(); }
  const conflict = await run(body => ({ tenantId: TENANT, results: [{ operationId: body.operations[0].id, status: 'conflict', version: 3, recordId: body.operations[0].recordId, conflictId: randomUUID() }, { operationId: body.operations[1].id, status: 'applied', version: 2, recordId: body.operations[1].recordId }], events: [], cursor: 7, hasMore: false }));
  try { assert.equal(conflict.res.statusCode, 200); const s = stored(conflict.t); assert.equal(s.outbox.length, 0); assert.equal(s.conflicts.length, 1); assert.equal(s.conflicts[0].recordId, 'c-001'); } finally { await conflict.t.close(); }
});

test('R10 sin continuidad ni vinculación no hay intercambio: link/sync/edit/unlink respetan la sesión de continuidad y el outbox', async () => {
  const t = await linked([contact(1)]);
  try {
    assert.equal((await t.call('POST', '/api/v5/team-sync/run', { reviewed: true })).statusCode, 409, 'sin vincular no hay sincronización');
    assert.equal((await t.call('POST', '/api/v5/team-sync/edit', { entity: 'contacts', id: 'c-001', values: { phone: '1' } })).statusCode, 409);
    assert.equal((await t.link()).statusCode, 200);
    assert.equal((await t.link()).statusCode, 409, 'segunda vinculación sobre una réplica existente');
    assert.equal((await t.call('POST', '/api/v5/team-sync/edit', { entity: 'contacts', id: 'c-001', values: { phone: '910 123 456' } })).statusCode, 200);
    assert.equal((await t.call('POST', '/api/v5/team-sync/unlink', { reviewed: true })).statusCode, 409, 'con cambios pendientes no se desvincula');
    assert.ok(stored(t), 'la réplica sigue ahí');
    const calls = t.r.calls.length; t.h.store.set('continuitySession', { id: 'sesion-ficticia' });
    for (const url of ['/api/v5/team-sync/run']) assert.equal((await t.call('POST', url, { reviewed: true })).statusCode, 409);
    assert.equal(t.r.calls.length, calls, 'durante una sesión de continuidad no hay tráfico de equipo');
  } finally { await t.close(); }
});
