import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import Fastify from 'fastify';
import { createBaseApp } from '../server/app.js';
import { registerWorkSummaryApi, type WorkSummaryApiOptions } from '../server/work-summary-api.js';
import { storeIntentStorage } from '../server/task-intent-storage.js';
import { reviewContinuityEvidence } from '../server/continuity-evidence.js';
import { createIntentJournal, currentOf, KEY_PREFIX, MAX_RECORDS, type Current, type StoredEntry } from '../shared/task-intent-journal.js';
import { parseState } from '../shared/local-task-focus.js';
import { makeFixture, makeDemoSpec } from '../shared/fixtures.js';
import { WORK_SUMMARY_ROUTE, WorkSummarySchema, type WorkSummary } from '../shared/work-summary.js';

process.env.NODE_ENV = 'test';
const CANARY = 'PrivateCanary283: solo ficción, nunca una respuesta pública';
const gate = () => { let release!: () => void; const promise = new Promise<void>(resolve => { release = resolve; }); return { promise, release }; };
async function rig(options: WorkSummaryApiOptions = { covers: () => true }, diskRoot?: string, seed = true) {
  const root = diskRoot ?? mkdtempSync(join(tmpdir(), 'planb-summary283-'));
  const original = await createBaseApp({ root, dbPath: diskRoot ? join(root, 'test.sqlite') : ':memory:', staticDir: root });
  const r = { ...original, root, cookie: '' };
  if (seed) {
    const snapshot = makeFixture('agency'); r.store.importSnapshot(snapshot);
    r.store.saveGeneration(makeDemoSpec(snapshot), { provider: 'demo', model: null, generatedAt: '2026-11-07T09:00:00Z', prompt: '', approved: false }); r.store.activate();
  }
  registerWorkSummaryApi(r.app, r.store, options);
  return r;
}
type Rig = Awaited<ReturnType<typeof rig>>;
async function current(r: Rig): Promise<Current> {
  const state = parseState((await r.app.inject({ method: 'GET', url: '/api/v2/state', headers: { cookie: r.cookie } })).json()); assert.ok(state);
  return currentOf({ ...state.context, instanceId: r.store.get('instanceId', null) });
}
async function protect(r: Rig) {
  const response = await r.app.inject({ method: 'POST', url: '/api/v2/auth/setup', payload: { password: 'ficticia-summary-283-solo-prueba' } }); assert.equal(response.statusCode, 200);
  r.cookie = String(response.headers['set-cookie']).split(';')[0];
}
const read = (r: Rig) => r.app.inject({ method: 'GET', url: WORK_SUMMARY_ROUTE, headers: { cookie: r.cookie } });
const summary = (response: Awaited<ReturnType<typeof read>>) => WorkSummarySchema.parse(response.json());
const digest = (r: Rig) => {
  const tables = r.store.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all() as { name: string }[];
  return createHash('sha256').update(JSON.stringify(tables.map(({ name }) => [name, r.store.db.prepare('SELECT * FROM "' + name.replaceAll('"', '""') + '"').all().map(row => JSON.stringify(row)).sort()]))).digest('hex');
};
function journal(r: Rig) { let n = 0; return createIntentJournal({ storage: storeIntentStorage(r.store), now: () => '2026-11-07T10:00:00.000Z', newId: () => 'case-' + ++n }); }
const draft = (scope: Current, id?: string) => ({ current: scope, taskId: 'task-2', patch: { notes: CANARY }, baseline: { notes: 'base ficticia' }, ...(id ? { id } : {}) });

test('el registro exige seguridad de createBaseApp y declaración explícita de cobertura', async () => {
  const r = await rig(); const plain = Fastify();
  try {
    assert.throws(() => registerWorkSummaryApi(plain, r.store, { covers: () => false }));
    assert.throws(() => registerWorkSummaryApi(r.app, r.store, {} as WorkSummaryApiOptions), /cobertura/);
  } finally { await plain.close(); await r.app.close(); }
});

test('una copia vacía no tiene ámbito ni recuentos y ni siquiera consulta cobertura o cuaderno', async () => {
  let calls = 0; const r = await rig({ covers: () => { calls++; return true; }, readEntries: async () => { calls++; return []; } }, undefined, false);
  try { const response = await read(r); assert.equal(response.statusCode, 200); const s = summary(response); assert.deepEqual(s.scope, { kind: 'none', context: null }); assert.equal(s.coverage, 'none'); assert.equal(s.counts, null); assert.equal(s.quarantine, null); assert.equal(calls, 0); }
  finally { await r.app.close(); }
});

test('sin escritor que cubra esta copia, vacío y entradas existentes siguen siendo desconocidos, nunca cero', async () => {
  let reads = 0; const r = await rig({ covers: () => false, readEntries: async () => { reads++; return []; } });
  try {
    assert.ok((await journal(r).saveDraft(draft(await current(r)))).ok);
    const before = digest(r), response = await read(r), s = summary(response);
    assert.equal(response.statusCode, 200); assert.equal(s.scope.kind, 'active-copy'); assert.equal(s.coverage, 'none'); assert.equal(s.counts, null); assert.equal(s.quarantine, null); assert.equal(reads, 0); assert.equal(digest(r), before);
  } finally { await r.app.close(); }
});

test('cobertura explícita y cuaderno vacío: cero observado, memoria real y ningún cambio SQLite', async () => {
  const r = await rig();
  try {
    const before = digest(r), response = await read(r), s = summary(response); assert.equal(response.statusCode, 200);
    assert.deepEqual(s.counts, { drafts: 0, unknownOutcome: 0, settled: 0, otherContext: 0 }); assert.deepEqual(s.quarantine, { unreadable: 0 }); assert.equal(s.coverage, 'complete'); assert.equal(s.provenance, 'memory-only'); assert.equal(digest(r), before);
    assert.equal(response.headers['cache-control'], 'no-store'); assert.equal(response.headers.pragma, 'no-cache'); assert.match(String(response.headers.vary), /Cookie/);
  } finally { await r.app.close(); }
});

test('pin canónico compatible con evidencia de Continuidad, no con el nombre o solo el ID de captura', async () => {
  const r = await rig();
  try {
    const s = summary(await read(r)); const evidence = reviewContinuityEvidence(r.store, { spaceId: 'summary283', scenario: 'crm-outage', outageDurationMs: 60000, objectives: { maxDataAgeMs: 86400000, maxRecoveryMs: 60000, maxEvidenceAgeMs: 86400000 } }, () => Date.parse('2030-01-01T00:00:00Z'));
    assert.equal(evidence.available, true); if (!evidence.available) return;
    assert.equal(s.scope.context, evidence.context.captureId); assert.match(s.scope.context!, /^capture:[a-f0-9]{64}$/);
  } finally { await r.app.close(); }
});

test('mezcla real: borrador, incierto, resuelto, otra generación/instalación y cuarentena; lista blanca sin datos privados', async () => {
  const r = await rig();
  try {
    const c = await current(r), j = journal(r);
    assert.ok((await j.saveDraft(draft(c))).ok);
    assert.equal((await j.attempt(draft(c), async () => ({ kind: 'unknown' }))).journaled, true);
    assert.equal((await j.attempt(draft(c), async () => ({ kind: 'ack' }))).journaled, true);
    assert.ok((await j.saveDraft(draft({ ...c, contextKey: 'otra-generación' }))).ok);
    assert.ok((await j.saveDraft(draft({ ...c, installId: 'otra-instalación' }))).ok);
    r.store.set(KEY_PREFIX + 'corrupt', CANARY);
    const before = digest(r), response = await read(r), s = summary(response);
    assert.equal(response.statusCode, 200); assert.deepEqual(s.counts, { drafts: 1, unknownOutcome: 1, settled: 1, otherContext: 2 }); assert.deepEqual(s.quarantine, { unreadable: 1 }); assert.equal(s.coverage, 'partial'); assert.equal(digest(r), before);
    assert.doesNotMatch(response.body, /PrivateCanary283|task-2|case-1|otra-generación|otra-instalación|notes|baseline|revision|contextKey|installId/);
    assert.deepEqual(Object.keys(s).sort(), ['format', 'status', 'scope', 'at', 'origin', 'provenance', 'coverage', 'counts', 'quarantine'].sort());
  } finally { await r.app.close(); }
});

test('un valor de meta ilegible se cuenta en cuarentena sin reescribirlo ni decir vacío completo', async () => {
  const r = await rig();
  try {
    r.store.db.prepare('INSERT INTO meta(key,value) VALUES(?,?)').run(KEY_PREFIX + 'broken', 'bytes sin JSON ' + CANARY);
    const before = digest(r), s = summary(await read(r)); assert.equal(s.coverage, 'partial'); assert.equal(s.quarantine!.unreadable, 1); assert.equal(s.counts!.drafts, 0); assert.equal(digest(r), before);
  } finally { await r.app.close(); }
});

test('una lectura que falla devuelve indisponible, sin detalles de excepción ni recuentos inventados', async () => {
  const r = await rig({ covers: () => true, readEntries: async () => { throw new Error(CANARY); } });
  try { const response = await read(r); assert.equal(response.statusCode, 503); const s = summary(response); assert.equal(s.status, 'unavailable'); assert.equal(s.counts, null); assert.equal(s.quarantine, null); assert.equal(s.coverage, 'none'); assert.doesNotMatch(response.body, /PrivateCanary283/); }
  finally { await r.app.close(); }
});

test('cobertura que falla o no devuelve booleano no se transforma en cobertura completa', async () => {
  for (const covers of [() => { throw new Error(CANARY); }, () => 'sí' as unknown as boolean]) {
    const r = await rig({ covers });
    try { const response = await read(r); assert.equal(response.statusCode, 503); assert.equal(summary(response).counts, null); assert.doesNotMatch(response.body, /PrivateCanary283/); }
    finally { await r.app.close(); }
  }
});

test('quota alterada y claves duplicadas del adaptador fallan cerradas, sin truncar ni dar un total falso', async () => {
  const r = await rig();
  try { for (let i = 0; i <= MAX_RECORDS; i++) r.store.set(KEY_PREFIX + i, 'corrupt'); const before = digest(r), response = await read(r); assert.equal(response.statusCode, 503); assert.equal(summary(response).counts, null); assert.equal(digest(r), before); }
  finally { await r.app.close(); }
  const dup = await rig({ covers: () => true, readEntries: async () => [{ key: KEY_PREFIX + 'same', raw: null }, { key: KEY_PREFIX + 'same', raw: null }] });
  try { const response = await read(dup); assert.equal(response.statusCode, 503); assert.equal(summary(response).counts, null); }
  finally { await dup.app.close(); }
});

test('sesión bloqueada: 401 sin leer el cuaderno, sin ámbito y con no-store', async () => {
  let calls = 0; const r = await rig({ covers: () => { calls++; return true; }, readEntries: async () => { calls++; return []; } });
  try {
    await protect(r); r.cookie = ''; const response = await read(r); assert.equal(response.statusCode, 401); assert.equal(calls, 0); assert.deepEqual(Object.keys(response.json()), ['error']); assert.equal(response.headers['cache-control'], 'no-store'); assert.match(String(response.headers.vary), /Cookie/);
  } finally { await r.app.close(); }
});

test('bloquear y abrir una sesión nueva durante la lectura no autoriza la petición original', async () => {
  const entered = gate(), held = gate(); let rows: StoredEntry[] = [];
  const r = await rig({ covers: () => true, readEntries: async () => { entered.release(); await held.promise; return rows; } });
  try {
    await protect(r); assert.ok((await journal(r).saveDraft(draft(await current(r)))).ok); rows = await storeIntentStorage(r.store).readAll();
    const pending = read(r); await entered.promise;
    assert.equal((await r.app.inject({ method: 'POST', url: '/api/v2/auth/lock', headers: { cookie: r.cookie } })).statusCode, 200);
    const login = await r.app.inject({ method: 'POST', url: '/api/v2/auth/login', payload: { password: 'ficticia-summary-283-solo-prueba' } }); assert.equal(login.statusCode, 200);
    held.release(); const response = await pending; assert.equal(response.statusCode, 401); assert.deepEqual(Object.keys(response.json()), ['error']); assert.doesNotMatch(response.body, /counts|capture:|PrivateCanary283/);
  } finally { held.release(); await r.app.close(); }
});

test('la sesión vence al preparar el cuerpo final: no publica los recuentos aunque se hayan leído', async () => {
  const originalNow = Date.now; let now = originalNow(), ticks = 0; Date.now = () => now;
  let r: Rig | undefined;
  try {
    r = await rig({ covers: () => true, clock: () => { if (++ticks === 2) now += 31 * 60000; return now; } }); await protect(r);
    const response = await read(r); assert.equal(response.statusCode, 401); assert.deepEqual(Object.keys(response.json()), ['error']);
  } finally { Date.now = originalNow; if (r) await r.app.close(); }
});

test('activar protección durante una lectura inicialmente sin contraseña invalida la autorización capturada', async () => {
  const entered = gate(), held = gate(); const r = await rig({ covers: async () => { entered.release(); await held.promise; return false; } });
  try { const pending = read(r); await entered.promise; await protect(r); held.release(); const response = await pending; assert.equal(response.statusCode, 401); assert.deepEqual(Object.keys(response.json()), ['error']); }
  finally { held.release(); await r.app.close(); }
});

test('cambio de generación mientras espera: 409, no el resumen de la copia anterior', async () => {
  const entered = gate(), held = gate(); const r = await rig({ covers: async () => { entered.release(); await held.promise; return true; } });
  try {
    const pending = read(r); await entered.promise;
    const generation = r.store.generation!; r.store.set('generation', { ...generation, generatedAt: '2026-11-07T11:00:00Z' }); held.release();
    const response = await pending; assert.equal(response.statusCode, 409); assert.deepEqual(Object.keys(response.json()), ['error']); assert.doesNotMatch(response.body, /capture:|counts/);
  } finally { held.release(); await r.app.close(); }
});

test('A→B→A en la misma conexión no publica una lectura antigua aunque el contexto final coincida', async () => {
  const entered = gate(), held = gate(); const r = await rig({ covers: () => true, readEntries: async () => { entered.release(); await held.promise; return []; } });
  try {
    const pending = read(r); await entered.promise; const old = r.store.generation!;
    r.store.set('generation', { ...old, generatedAt: '2026-11-07T11:00:00Z' }); r.store.set('generation', old); held.release();
    const response = await pending; assert.equal(response.statusCode, 409); assert.deepEqual(Object.keys(response.json()), ['error']);
  } finally { held.release(); await r.app.close(); }
});

test('otra conexión que cambia el cuaderno invalida el recuento ya leído', async () => {
  const entered = gate(), held = gate(), root = mkdtempSync(join(tmpdir(), 'planb-summary283-external-'));
  const r = await rig({ covers: () => true, readEntries: async () => { entered.release(); await held.promise; return []; } }, root);
  try {
    const pending = read(r); await entered.promise; const other = new DatabaseSync(r.store.filename);
    try { other.prepare('INSERT INTO meta(key,value) VALUES(?,?)').run(KEY_PREFIX + 'opaque', 'foreign corrupt bytes'); } finally { other.close(); }
    held.release(); assert.equal((await pending).statusCode, 409);
  } finally { held.release(); await r.app.close(); }
});

test('sobre archivo real conserva borrador e incierto al reiniciar, declara durable y no poda entradas antiguas', async () => {
  const root = mkdtempSync(join(tmpdir(), 'planb-summary283-disk-')); const first = await rig(undefined, root);
  const c = await current(first), j = journal(first); assert.ok((await j.saveDraft(draft(c))).ok); assert.equal((await j.attempt(draft(c), async () => ({ kind: 'unknown' }))).journaled, true);
  const initial = summary(await read(first)); await first.app.close();
  const next = await rig(undefined, root, false);
  try {
    const before = digest(next), response = await read(next), after = summary(response); assert.equal(response.statusCode, 200); assert.equal(after.provenance, 'durable'); assert.deepEqual(after.counts, { drafts: 1, unknownOutcome: 1, settled: 0, otherContext: 0 }); assert.deepEqual(after.counts, initial.counts); assert.deepEqual(after.scope, initial.scope); assert.equal(digest(next), before);
    assert.doesNotMatch(readFileSync(next.store.filename).toString('utf8'), /PrivateCanary283/);
  } finally { await next.app.close(); }
});

test('consulta estricta sin selectores de captura y solo GET; no existen operaciones de escritura del resumen', async () => {
  const r = await rig();
  try {
    const before = digest(r); const query = await r.app.inject({ method: 'GET', url: WORK_SUMMARY_ROUTE + '?capture=otra' }); assert.equal(query.statusCode, 422); assert.deepEqual(Object.keys(query.json()), ['error']);
    for (const method of ['POST', 'PATCH', 'DELETE', 'PUT', 'HEAD'] as const) assert.equal((await r.app.inject({ method, url: WORK_SUMMARY_ROUTE })).statusCode, 404);
    assert.equal(digest(r), before);
  } finally { await r.app.close(); }
});
