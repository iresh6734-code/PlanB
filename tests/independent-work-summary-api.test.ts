import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createBaseApp } from '../server/app.js';
import { registerWorkSummaryApi, type WorkSummaryApiOptions } from '../server/work-summary-api.js';
import { makeDemoSpec, makeFixture } from '../shared/fixtures.js';
import { KEY_PREFIX } from '../shared/task-intent-journal.js';
import { WORK_SUMMARY_ROUTE, WorkSummarySchema } from '../shared/work-summary.js';

process.env.NODE_ENV = 'test';
const PRIVATE = 'RESUMEN-INDEPENDIENTE: valor ficticio que no debe publicarse';
const PASSWORD = 'solo-ficcion-resumen-independiente-283';
const gate = () => {
  let release!: () => void;
  const promise = new Promise<void>(resolve => { release = resolve; });
  return { promise, release };
};
async function rig(options: WorkSummaryApiOptions, seed = true) {
  const root = fs.mkdtempSync(path.resolve('tests/.tmp/summary-independent-'));
  const r = await createBaseApp({ root, dbPath: ':memory:', staticDir: root });
  if (seed) {
    const snapshot = makeFixture('agency');
    r.store.importSnapshot(snapshot);
    r.store.saveGeneration(makeDemoSpec(snapshot), { provider: 'demo', model: null, generatedAt: '2026-11-07T09:00:00Z', prompt: '', approved: false });
    r.store.activate();
  }
  registerWorkSummaryApi(r.app, r.store, options);
  return r;
}
type Rig = Awaited<ReturnType<typeof rig>>;
const digest = (r: Rig) => {
  const tables = r.store.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all() as { name: string }[];
  const rows = tables.map(({ name }) => [name, r.store.db.prepare('SELECT * FROM "' + name.replaceAll('"', '""') + '"').all().map(row => JSON.stringify(row)).sort()]);
  return createHash('sha256').update(JSON.stringify(rows)).digest('hex');
};

test('independiente: un lector que falla tras bloqueo y login nuevos no publica siquiera el ámbito anterior', { timeout: 20_000 }, async () => {
  const entered = gate(), held = gate();
  const r = await rig({ covers: () => true, readEntries: async () => { entered.release(); await held.promise; throw new Error(PRIVATE); } });
  try {
    const setup = await r.app.inject({ method: 'POST', url: '/api/v2/auth/setup', payload: { password: PASSWORD } });
    assert.equal(setup.statusCode, 200);
    const cookie = String(setup.headers['set-cookie']).split(';')[0];
    const pending = r.app.inject({ method: 'GET', url: WORK_SUMMARY_ROUTE, headers: { cookie } });
    await entered.promise;
    assert.equal((await r.app.inject({ method: 'POST', url: '/api/v2/auth/lock', headers: { cookie } })).statusCode, 200);
    assert.equal((await r.app.inject({ method: 'POST', url: '/api/v2/auth/login', payload: { password: PASSWORD } })).statusCode, 200);
    const before = digest(r);
    held.release();
    const response = await pending;
    assert.equal(response.statusCode, 401);
    assert.deepEqual(Object.keys(response.json()), ['error']);
    assert.doesNotMatch(response.body, /capture:|counts|RESUMEN-INDEPENDIENTE/);
    assert.equal(response.headers['cache-control'], 'no-store');
    assert.equal(digest(r), before);
  } finally { held.release(); await r.app.close(); }
});

test('independiente: si falla la lectura después de cambiar de copia, el 503 antiguo se sustituye por conflicto', { timeout: 20_000 }, async () => {
  const entered = gate(), held = gate();
  const r = await rig({ covers: () => true, readEntries: async () => { entered.release(); await held.promise; throw new Error(PRIVATE); } });
  try {
    const pending = r.app.inject({ method: 'GET', url: WORK_SUMMARY_ROUTE });
    await entered.promise;
    const old = r.store.generation!;
    r.store.set('generation', { ...old, generatedAt: '2026-11-07T10:00:00Z' });
    const before = digest(r);
    held.release();
    const response = await pending;
    assert.equal(response.statusCode, 409);
    assert.deepEqual(Object.keys(response.json()), ['error']);
    assert.doesNotMatch(response.body, /capture:|counts|RESUMEN-INDEPENDIENTE/);
    assert.equal(digest(r), before);
  } finally { held.release(); await r.app.close(); }
});

test('independiente: sin copia activa, ni siquiera un diario existente convierte la ausencia de ámbito en ceros', { timeout: 20_000 }, async () => {
  let consulted = 0;
  const r = await rig({ covers: () => { consulted++; return true; }, readEntries: async () => { consulted++; throw new Error(PRIVATE); } }, false);
  try {
    r.store.set(KEY_PREFIX + 'orphan', PRIVATE);
    const before = digest(r);
    const response = await r.app.inject({ method: 'GET', url: WORK_SUMMARY_ROUTE });
    const body = WorkSummarySchema.parse(response.json());
    assert.equal(response.statusCode, 200);
    assert.deepEqual(body.scope, { kind: 'none', context: null });
    assert.equal(body.coverage, 'none');
    assert.equal(body.counts, null);
    assert.equal(body.quarantine, null);
    assert.equal(consulted, 0);
    assert.equal(digest(r), before);
  } finally { await r.app.close(); }
});

test('independiente: un adaptador con datos fuera de contrato falla cerrado, sin filtrar campos ni afirmar vacío', { timeout: 20_000 }, async () => {
  const r = await rig({ covers: () => true, readEntries: async () => [{ key: KEY_PREFIX + 'item', raw: null, extra: PRIVATE }] });
  try {
    const before = digest(r);
    const response = await r.app.inject({ method: 'GET', url: WORK_SUMMARY_ROUTE });
    const body = WorkSummarySchema.parse(response.json());
    assert.equal(response.statusCode, 503);
    assert.equal(body.status, 'unavailable');
    assert.equal(body.counts, null);
    assert.equal(body.quarantine, null);
    assert.equal(body.coverage, 'none');
    assert.doesNotMatch(response.body, /RESUMEN-INDEPENDIENTE|extra/);
    assert.equal(digest(r), before);
  } finally { await r.app.close(); }
});
