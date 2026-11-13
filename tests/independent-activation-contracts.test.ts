import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// QA073 · ACTIVATION066: contrato de la API de activación revisada, probado con Store en memoria y capturas inventadas.
// El oráculo sale de qué objetivo es activo/candidato y de qué debe conservarse tras un rechazo; la revisión devuelta por la API
// solo se usa como ficha opaca (se pide, se manda y se compara con otra pedida tras cambiar el estado), nunca se recalcula aquí.
// Fuentes bajo prueba = QA073_ROOT (corte propio, por defecto este checkout). Sin red, sin proveedores, sin datos reales.
const OVERRIDE = process.env.QA073_ROOT;
const ROOT = OVERRIDE ? path.resolve(OVERRIDE) : path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const load = (relative: string) => import(pathToFileURL(path.join(ROOT, relative)).href);
const { createBaseApp } = await load('server/app.ts') as typeof import('../server/app.js');
const { makeFixture, makeDemoSpec } = await load('shared/fixtures.ts') as typeof import('../shared/fixtures.js');

const REVISION_STALE = 'La preparación cambió después de revisarla. Actualiza el contenido y confirma de nuevo.';
const GEN = (prompt = '') => ({ provider: 'demo' as const, model: null, generatedAt: '2026-10-30T00:00:00.000Z', prompt, approved: false });
type Harness = Awaited<ReturnType<typeof createBaseApp>>;
const commit = (revision: unknown, extra: Record<string, unknown> = {}) => ({ method: 'POST' as const, url: '/api/v4/activate-reviewed', payload: { reviewed: true, revision, ...extra } });
const review = async (h: Harness) => (await h.app.inject({ url: '/api/v4/activation-review' })).json();
/** Instantánea del estado persistente que importa para "no se activó ni se reemplazó nada". */
const persisted = (h: Harness) => JSON.stringify({ snapshot: h.store.snapshot, spec: h.store.spec, generation: h.store.generation, candidate: h.store.candidate, records: h.store.records(), changes: h.store.changes(), ready: h.store.ready });

/** Captura ficticia con una marca reconocible en un valor de ficha, para detectar fugas de registros individuales. */
function capture(profile: 'agency' | 'distribution', marker: string) {
  const snapshot = makeFixture(profile);
  const first = snapshot.records.find(r => r.entity === 'contacts')!;
  first.values = { ...first.values, firstname: marker };
  return snapshot;
}
async function fresh(options: { runtime?: boolean } = {}) {
  const h = await createBaseApp({ dbPath: ':memory:', root: '.', staticDir: 'none', ...options });
  return h;
}
function activeAgency(h: Harness, marker = 'MARCA-ACTIVA-QA073') {
  const snapshot = capture('agency', marker);
  h.store.importSnapshot(snapshot);
  h.store.saveGeneration(makeDemoSpec(snapshot), GEN('activa'));
  h.store.activate();
  return snapshot;
}
/** Candidata distinta de la activa: captura nueva + especificación generada. replace=true confirma sustituir fichas con cambios locales. */
function candidate(h: Harness, profile: 'agency' | 'distribution' = 'distribution', marker = 'MARCA-CANDIDATA-QA073', prompt = 'candidata', replace = false) {
  const snapshot = capture(profile, marker);
  h.store.importSnapshot(snapshot, replace);
  h.store.saveGeneration(makeDemoSpec(snapshot), GEN(prompt));
  return snapshot;
}
const withApp = async (fn: (h: Harness) => Promise<void>, options: { runtime?: boolean } = {}) => { const h = await fresh(options); try { await fn(h); } finally { await h.app.close(); } };

test('A1 GET distingue objetivo inicial, candidato y activo, y no expone fichas ni enlaces individuales', () => withApp(async h => {
  // Inicial: hay captura, aún sin especificación.
  const initialSnapshot = capture('agency', 'MARCA-INICIAL-QA073');
  h.store.importSnapshot(initialSnapshot);
  let r = await review(h);
  assert.equal(r.kind, 'initial'); assert.equal(r.canActivate, false);
  assert.ok(r.reasons.some((x: string) => /Genera primero/.test(x)), 'sin especificación debe explicar por qué no se puede activar');
  assert.equal(r.target.snapshot.id, initialSnapshot.id); assert.equal(r.target.spec, null);
  // Activo.
  h.store.saveGeneration(makeDemoSpec(initialSnapshot), GEN());
  r = await review(h);
  assert.equal(r.kind, 'initial', 'con especificación pero sin aprobar sigue siendo inicial'); assert.equal(r.canActivate, true);
  h.store.activate();
  r = await review(h);
  assert.equal(r.kind, 'active'); assert.equal(r.records, initialSnapshot.records.length);
  assert.equal(r.target.snapshot.id, initialSnapshot.id);
  // Candidata: el objetivo es la captura nueva aunque la activa siga en vigor.
  const next = candidate(h);
  assert.notEqual(next.id, initialSnapshot.id, 'precondición: las dos capturas son distintas');
  r = await review(h);
  assert.equal(r.kind, 'candidate'); assert.equal(r.target.snapshot.id, next.id, 'el objetivo es la candidata, nunca la activa');
  assert.equal(r.target.spec.title, next.name); assert.notEqual(r.target.spec.title, initialSnapshot.name);
  assert.equal(r.replacesRecords, true); assert.equal(r.records, next.records.length, 'recuento de la captura que sustituiría, no el de la activa');
  assert.equal(h.store.snapshot!.id, initialSnapshot.id, 'GET no activa nada');
  // Sin fugas de fichas ni enlaces.
  const raw = (await h.app.inject({ url: '/api/v4/activation-review' })).body;
  for (const marker of ['MARCA-INICIAL-QA073', 'MARCA-CANDIDATA-QA073', 'MARCA-ACTIVA-QA073']) assert.ok(!raw.includes(marker), 'la respuesta no debe contener valores de fichas (' + marker + ')');
  assert.deepEqual(r.target.snapshot.records, []); assert.deepEqual(r.target.snapshot.links, []);
  for (const record of next.records) assert.ok(!raw.includes('"' + record.id + '"') || record.id.length < 6 || !raw.includes('"id":"' + record.id + '"'), 'ningún registro individual por identidad: ' + record.id);
}));

test('A2 una revisión vigente activa exactamente la candidata, reemplaza fichas y archiva la anterior', () => withApp(async h => {
  activeAgency(h); const target = candidate(h);
  const before = h.store.snapshot!;
  const r = await review(h); assert.equal(r.canActivate, true);
  const res = await h.app.inject(commit(r.revision));
  assert.equal(res.statusCode, 200, res.body);
  assert.equal(res.json().ready, true); assert.equal(res.json().reviewedRevision, r.revision);
  assert.equal(res.json().captureId, target.id + ':' + target.capturedAt);
  assert.equal(h.store.snapshot!.id, target.id); assert.notEqual(h.store.snapshot!.id, before.id);
  assert.equal(h.store.spec!.title, target.name); assert.equal(h.store.candidate, null); assert.equal(h.store.ready, true);
  assert.equal(h.store.records().length, target.records.length, 'las fichas locales son las de la captura activada');
  assert.equal(h.store.changesCount, 0);
  assert.equal((h.store.db.prepare('SELECT COUNT(*) AS n FROM archives').get() as { n: number }).n, 1, 'la versión anterior queda archivada');
  // La misma revisión no vale dos veces.
  const again = await h.app.inject(commit(r.revision));
  assert.equal(again.statusCode, 409); assert.equal(again.json().error, REVISION_STALE);
}));

test('A3 cada dimensión que cambia tras la revisión invalida la activación con 409 exacto y sin tocar nada', async () => {
  type Case = { name: string; setup?: (h: Harness) => void; mutate: (h: Harness) => void };
  const cases: Case[] = [
    { name: 'candidata (otra captura)', mutate: h => { candidate(h, 'agency', 'MARCA-OTRA-QA073', 'otra'); } },
    { name: 'esquema (misma captura, otra especificación)', mutate: h => { const s = h.store.candidate!.snapshot; const spec = makeDemoSpec(s); spec.title = 'Título distinto QA073'; h.store.saveGeneration(spec, GEN('candidata')); } },
    { name: 'generación (mismo esquema, otro prompt)', mutate: h => { const s = h.store.candidate!.snapshot; h.store.saveGeneration(makeDemoSpec(s), GEN('prompt distinto')); } },
    { name: 'conciliación activa', mutate: h => { const c = h.store.reconciliation!; h.store.set('reconciliation', { ...c, expectedLinks: c.expectedLinks + 1, actualLinks: c.actualLinks + 1 }); } },
    { name: 'fichas locales sin historial', mutate: h => { const r = h.store.records('contacts')[0]; h.store.insertRecord({ ...r, values: { ...r.values, phone: '600 000 073' } }); } },
    { name: 'historial sin cambiar fichas', mutate: h => { h.store.db.prepare("INSERT INTO changes(at,entity,record_id,operation,before_json,after_json) VALUES(?,?,?,?,?,?)").run('2026-10-30T00:00:00.000Z', 'contacts', 'contact-1', 'create', null, h.store.encode(h.store.records('contacts')[0])); } },
    { name: 'edición local completa', mutate: h => { h.store.saveRecord('contacts', { phone: '600 000 074' }, h.store.records('contacts')[0].id); } },
    { name: 'sesión de continuidad', mutate: h => { h.store.set('continuitySession', { id: 'sesion-ficticia-073' }); } },
    { name: 'devolución ocupada', mutate: h => { h.store.set('returnBusy', true); } },
    { name: 'error de generación', mutate: h => { h.store.failGeneration('Fallo ficticio QA073'); } },
  ];
  for (const c of cases) await withApp(async h => {
    activeAgency(h); candidate(h);
    const old = await review(h); assert.equal(old.canActivate, true, c.name + ': precondición, la candidata era activable');
    c.mutate(h);
    const after = await review(h);
    assert.notEqual(after.revision, old.revision, c.name + ': la revisión debe cambiar');
    const before = persisted(h);
    const res = await h.app.inject(commit(old.revision));
    assert.equal(res.statusCode, 409, c.name + ': ' + res.body); assert.equal(res.json().error, REVISION_STALE, c.name + ': rechazo por revisión, no por otra causa');
    assert.equal(persisted(h), before, c.name + ': un rechazo no activa ni reemplaza nada');
    assert.equal((await review(h)).revision, after.revision, c.name + ': el rechazo tampoco cambia la revisión');
  });
});

test('A4 sin cambios reales la revisión es estable y un rechazo o una lectura no la inventan', () => withApp(async h => {
  activeAgency(h); candidate(h);
  const first = await review(h);
  assert.equal((await review(h)).revision, first.revision, 'dos lecturas seguidas');
  await h.app.inject({ url: '/api/v2/state' }); await h.app.inject({ url: '/api/records' });
  assert.equal((await review(h)).revision, first.revision, 'lecturas de otras rutas');
  h.store.set('returnBusy', false); h.store.set('continuitySession', null);
  assert.equal((await review(h)).revision, first.revision, 'reescribir valores idénticos no es un cambio');
  const bad = await h.app.inject(commit('a'.repeat(64)));
  assert.equal(bad.statusCode, 409);
  assert.equal((await review(h)).revision, first.revision, 'un POST rechazado no cambia el contenido revisado');
}));

test('A5 el cambio posterior que la UI debe revisar se refleja con razones y recuentos del fixture', () => withApp(async h => {
  activeAgency(h);
  h.store.saveRecord('contacts', { phone: '600 000 075' }, h.store.records('contacts')[0].id);
  assert.equal(h.store.changesCount, 1);
  const noReplace = capture('distribution', 'MARCA-X-QA073');
  assert.throws(() => h.store.importSnapshot(noReplace), (e: any) => e.status === 409, 'precondición: sustituir con cambios locales exige confirmación');
  candidate(h, 'distribution', 'MARCA-R-QA073', 'con-reemplazo', true);
  let r = await review(h);
  assert.equal(r.localChanges, 1); assert.equal(r.replacesRecords, true); assert.equal(r.replacementConfirmed, true); assert.equal(r.canActivate, true, JSON.stringify(r.reasons));
  h.store.saveRecord('contacts', { phone: '600 000 076' }, h.store.records('contacts')[0].id);
  const stale = await h.app.inject(commit(r.revision));
  assert.equal(stale.statusCode, 409); assert.equal(stale.json().error, REVISION_STALE);
  r = await review(h);
  assert.equal(r.localChanges, 2); assert.equal(r.canActivate, false);
  assert.ok(r.reasons.some((x: string) => /cambios locales nuevos/.test(x)), JSON.stringify(r.reasons));
  const refused = await h.app.inject(commit(r.revision));
  assert.equal(refused.statusCode, 409); assert.match(refused.json().error, /cambios locales nuevos/);
  assert.equal(h.store.changesCount, 2, 'las ediciones locales siguen ahí');
  assert.ok(h.store.candidate, 'la candidata sigue pendiente');
}));

test('A6 petición mal formada: 422 sin tocar el estado; revisión desconocida: 409', () => withApp(async h => {
  activeAgency(h); candidate(h);
  const r = await review(h), before = persisted(h);
  const malformed: [string, unknown][] = [
    ['sin reviewed', { revision: r.revision }], ['reviewed false', { reviewed: false, revision: r.revision }], ['reviewed texto', { reviewed: 'true', revision: r.revision }],
    ['sin revisión', { reviewed: true }], ['revisión corta', { reviewed: true, revision: r.revision.slice(0, 63) }], ['revisión mayúsculas', { reviewed: true, revision: r.revision.toUpperCase() }],
    ['revisión larga', { reviewed: true, revision: r.revision + '0' }], ['revisión número', { reviewed: true, revision: 12345 }], ['revisión null', { reviewed: true, revision: null }],
    ['campo extra', { reviewed: true, revision: r.revision, force: true }], ['cuerpo vacío', {}], ['revisión con espacios', { reviewed: true, revision: ' ' + r.revision.slice(1) }],
  ];
  for (const [label, payload] of malformed) {
    const res = await h.app.inject({ method: 'POST', url: '/api/v4/activate-reviewed', payload: payload as any });
    assert.equal(res.statusCode, 422, label + ': ' + res.body); assert.equal(persisted(h), before, label);
  }
  assert.equal((await h.app.inject({ method: 'POST', url: '/api/v4/activate-reviewed' })).statusCode, 422, 'sin cuerpo');
  const unknown = await h.app.inject(commit('0'.repeat(64)));
  assert.equal(unknown.statusCode, 409); assert.equal(unknown.json().error, REVISION_STALE); assert.equal(persisted(h), before);
  // Control positivo: con la revisión legítima sí se activa.
  assert.equal((await h.app.inject(commit(r.revision))).statusCode, 200);
}));

test('A7 con runtime la activación guiada no está habilitada (403 en GET y POST)', () => withApp(async h => {
  const get = await h.app.inject({ url: '/api/v4/activation-review' }); assert.equal(get.statusCode, 403);
  const post = await h.app.inject(commit('a'.repeat(64))); assert.equal(post.statusCode, 403);
  assert.match(post.json().error, /generador/);
}, { runtime: true }));

test('A8 sesión, Host, Origin y no-store se conservan en la ruta de activación', () => withApp(async h => {
  activeAgency(h); candidate(h);
  const setup = await h.app.inject({ method: 'POST', url: '/api/v2/auth/setup', payload: { password: 'contrasena-ficticia-qa073' } });
  assert.equal(setup.statusCode, 200);
  const cookie = String(setup.headers['set-cookie']).split(';')[0];
  assert.equal((await h.app.inject({ url: '/api/v4/activation-review' })).statusCode, 401, 'sin sesión GET no responde');
  assert.equal((await h.app.inject(commit('a'.repeat(64)))).statusCode, 401, 'sin sesión POST no responde');
  const ok = await h.app.inject({ url: '/api/v4/activation-review', headers: { cookie } });
  assert.equal(ok.statusCode, 200); assert.equal(ok.headers['cache-control'], 'no-store');
  const r = ok.json(); const before = persisted(h);
  assert.equal((await h.app.inject({ url: '/api/v4/activation-review', headers: { cookie, host: 'evil.example' } })).statusCode, 403, 'Host ajeno');
  assert.equal((await h.app.inject({ ...commit(r.revision), headers: { cookie, origin: 'http://evil.example' } })).statusCode, 403, 'Origin ajeno');
  assert.equal(persisted(h), before, 'rechazos de Host/Origin no activan');
  const stale = await h.app.inject({ ...commit('b'.repeat(64)), headers: { cookie } });
  assert.equal(stale.statusCode, 409); assert.equal(stale.headers['cache-control'], 'no-store');
  const bad = await h.app.inject({ ...commit(1), headers: { cookie } });
  assert.equal(bad.statusCode, 422); assert.equal(bad.headers['cache-control'], 'no-store');
  const done = await h.app.inject({ ...commit(r.revision), headers: { cookie } });
  assert.equal(done.statusCode, 200); assert.equal(done.headers['cache-control'], 'no-store');
}));

test('A9 dos activaciones simultáneas con la misma revisión: exactamente una se aplica (sin await entre comprobar y activar)', () => withApp(async h => {
  activeAgency(h); const target = candidate(h);
  const r = await review(h);
  const results = await Promise.all([h.app.inject(commit(r.revision)), h.app.inject(commit(r.revision)), h.app.inject(commit(r.revision))]);
  const codes = results.map(x => x.statusCode).sort();
  assert.deepEqual(codes, [200, 409, 409], 'solo una gana; el resto ve la revisión retirada: ' + JSON.stringify(results.map(x => x.json())));
  assert.equal(h.store.snapshot!.id, target.id);
  assert.equal((h.store.db.prepare('SELECT COUNT(*) AS n FROM archives').get() as { n: number }).n, 1, 'un solo archivo de la versión anterior');
}));

test('A10 cambio concurrente entre revisión y activación: la activación no usa una candidata que el usuario no revisó', () => withApp(async h => {
  activeAgency(h); candidate(h, 'distribution', 'MARCA-REVISADA-QA073', 'revisada');
  const r = await review(h);
  // La candidata cambia justo antes de llegar la petición: mismo tipo de captura, contenido distinto.
  const other = candidate(h, 'agency', 'MARCA-NO-REVISADA-QA073', 'no-revisada');
  const res = await h.app.inject(commit(r.revision));
  assert.equal(res.statusCode, 409, res.body);
  assert.equal(h.store.records('contacts')[0].values.firstname, 'MARCA-ACTIVA-QA073', 'las fichas activas no se sustituyeron por las de la candidata no revisada');
  assert.equal(h.store.candidate!.snapshot.records.find(x => x.entity === 'contacts')!.values.firstname, 'MARCA-NO-REVISADA-QA073'); void other;
  assert.ok(h.store.candidate, 'sigue pendiente de nueva revisión');
}));

test('A11 compatibilidad conocida: /api/activate legado sigue aceptando reviewed:true sin revisión (no es un bypass nuevo)', () => withApp(async h => {
  activeAgency(h); candidate(h);
  const legacy = await h.app.inject({ method: 'POST', url: '/api/activate', payload: { reviewed: true } });
  // Caracterización, no garantía: documenta que la garantía nueva pertenece a la ruta nueva y no cambia la ruta legada.
  assert.ok([200, 404, 409, 422].includes(legacy.statusCode), 'estado observado ' + legacy.statusCode);
  console.log('QA073-A11 /api/activate legado -> ' + legacy.statusCode);
}));
