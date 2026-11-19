import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import { randomUUID, randomBytes, createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { spawn } from 'node:child_process';
import { build } from 'esbuild';
import { Store } from '../server/store.js';
import { createBaseApp } from '../server/app.js';
import { makeFixture, makeDemoSpec } from '../shared/fixtures.js';
import { readTaskRevision, writeTaskRevision, registerTaskRevision } from '../server/task-revision.js';
import { Recovery, simulatedRemote } from '../server/recovery.js';

const headers = { host: '127.0.0.1:4611', origin: 'http://127.0.0.1:4611' }, url = '/api/v7/task-revision/task-2';
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
function digest(db: DatabaseSync) {
  const tables = (db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all() as { name: string }[]).map(row => row.name);
  return Object.fromEntries(tables.map(name => [name, hash(db.prepare('SELECT * FROM "' + name + '" ORDER BY rowid').all())]));
}
function seed(store: Store, size = 62) {
  const snapshot = makeFixture('agency');
  const template = snapshot.records.find(record => record.entity === 'tasks' && record.id === 'task-2')!;
  for (let i = snapshot.records.length; i < size; i++) snapshot.records.push({ ...structuredClone(template), id: 'extra-task129-' + i });
  snapshot.manifest.expectedCounts.tasks += size - 62;
  store.importSnapshot(snapshot);
  store.saveGeneration(makeDemoSpec(snapshot), { provider: 'demo', model: null, generatedAt: '2026-11-02T10:00:00Z', prompt: '', approved: false }); store.activate();
}
async function fixture() {
  const result = await createBaseApp({ dbPath: ':memory:', root: path.resolve('tests/.tmp/task129-' + randomUUID()), staticDir: path.resolve('tests/.tmp/no-task129-assets') });
  seed(result.store); registerTaskRevision(result.app, result.store); return result;
}
const read = (app: Awaited<ReturnType<typeof createBaseApp>>['app']) => app.inject({ method: 'GET', url, headers });
const patch = (app: Awaited<ReturnType<typeof createBaseApp>>['app'], revision: string, values: Record<string, unknown>) => app.inject({ method: 'PATCH', url, headers, payload: { expectedRevision: revision, values } });

test('content guard: eight simultaneous requests based on the same view admit one winner without losing other data', async () => {
  const { app, store } = await fixture();
  try {
    const first = (await read(app)).json(), old = store.record('tasks', 'task-2')!, beforeCount = store.changesCount;
    const results = await Promise.all(Array.from({ length: 8 }, (_, index) => patch(app, first.revision, { subject: 'Intención129-' + index })));
    assert.equal(results.filter(result => result.statusCode === 200).length, 1); assert.equal(results.filter(result => result.statusCode === 409).length, 7);
    const success = results.find(result => result.statusCode === 200)!.json();
    assert.equal(store.changesCount, beforeCount + 1); assert.equal(store.record('tasks', 'task-2')!.values.subject, success.current.record.values.subject);
    for (const [key, value] of Object.entries(old.values)) if (key !== 'subject') assert.equal(success.current.record.values[key], value);
    const after = digest(store.db), stale = await patch(app, first.revision, { status: 'completed' });
    assert.equal(stale.statusCode, 409); assert.equal(stale.json().details.code, 'TASK_REVISION_CHANGED'); assert.deepEqual(digest(store.db), after);
  } finally { await app.close(); }
});

test('legacy ABA: edits through the existing unguarded route still invalidate a reviewed task even when its value returns', async () => {
  const { app, store } = await fixture();
  try {
    const old = (await read(app)).json(), original = old.record.values.subject;
    for (const subject of ['Cambio por la ruta anterior129', original]) {
      const response = await app.inject({ method: 'PATCH', url: '/api/records/tasks/task-2', headers, payload: { values: { subject } } }); assert.equal(response.statusCode, 200);
    }
    assert.equal(store.record('tasks', 'task-2')!.values.subject, original); assert.equal(store.changesCount, 2);
    const before = digest(store.db), response = await patch(app, old.revision, { status: 'completed' });
    assert.equal(response.statusCode, 409); assert.deepEqual(digest(store.db), before);
  } finally { await app.close(); }
});

test('no-op: a current identical request changes no table; an unrelated task remains independently editable', async () => {
  const { app, store } = await fixture();
  try {
    const old = (await read(app)).json(); store.saveRecord('tasks', { subject: 'Cambió solo task-3' }, 'task-3');
    const before = digest(store.db), noOp = await patch(app, old.revision, { subject: old.record.values.subject });
    assert.equal(noOp.statusCode, 200); assert.equal(noOp.json().changed, false); assert.equal(noOp.json().current.revision, old.revision); assert.deepEqual(digest(store.db), before);
    const saved = await patch(app, old.revision, { subject: 'Ahora sí cambia task-2' }); assert.equal(saved.statusCode, 200); assert.equal(store.changesCount, 2);
  } finally { await app.close(); }
});

test('a pending candidate does not silently replace the active record; a new continuity session invalidates its token', async () => {
  const { app, store } = await fixture();
  try {
    const old = (await read(app)).json(); store.importSnapshot(makeFixture('distribution'));
    assert.ok(store.candidate); assert.equal((await read(app)).json().revision, old.revision);
    const saved = await patch(app, old.revision, { subject: 'Edición de la copia activa, no candidata' }); assert.equal(saved.statusCode, 200);
    const token = saved.json().current.revision; store.set('sessionId', randomUUID()); const before = digest(store.db);
    assert.equal((await patch(app, token, { subject: 'No guardar en otra sesión' })).statusCode, 409); assert.deepEqual(digest(store.db), before);
  } finally { await app.close(); }
});

test('validation preserves all tables for unknown fields, malformed values and dangling references', async () => {
  const { app, store } = await fixture();
  try {
    const token = (await read(app)).json().revision, before = digest(store.db);
    for (const values of [{ not_in_schema: 'x' }, { contact_id: 'missing-contact129' }, { status: 'unknown-enum129' }, { subject: 'x'.repeat(20_001) }, { subject: ['not primitive'] }]) {
      const response = await patch(app, token, values); assert.equal(response.statusCode, 422); assert.deepEqual(digest(store.db), before);
    }
    assert.equal((await patch(app, token, { subject: 'Control válido después de rechazos' })).statusCode, 200);
  } finally { await app.close(); }
});

test('a structurally valid uncertain recovery and a corrupt saved plan block both changes and no-op acknowledgements', async () => {
  const { app, store } = await fixture();
  try {
    store.saveRecord('tasks', { subject: 'Cambio pendiente de devolución' }, 'task-2');
    const engine = new Recovery(store), plan = await engine.preview(simulatedRemote(store));
    assert.equal(plan.operations.length, 1); plan.status = 'partial'; plan.approvedAt = null; plan.operations[0].status = 'uncertain'; store.set('recoveryPlan', plan);
    assert.equal(store.recoveryIntegrity().state, 'valid');
    for (const mode of ['valid-uncertain', 'invalid'] as const) {
      if (mode === 'invalid') store.set('recoveryPlan', { invalid: 'synthetic-marker129' });
      const view = (await read(app)).json(), before = digest(store.db);
      for (const values of [{ subject: 'No aplicar129' }, { subject: view.record.values.subject }]) {
        const response = await patch(app, view.revision, values); assert.equal(response.statusCode, 409); assert.doesNotMatch(response.body, /synthetic-marker129/); assert.deepEqual(digest(store.db), before);
      }
    }
  } finally { await app.close(); }
});

test('a failure after the row write inside Store.saveRecord rolls back the row and history before any confirmation', async () => {
  const { app, store } = await fixture(); const original = store.insertRecord.bind(store);
  try {
    const view = (await read(app)).json(), before = digest(store.db);
    store.insertRecord = record => { original(record); throw Error('Injected after insert, inside transaction129'); };
    const response = await patch(app, view.revision, { subject: 'Esta transacción debe revertirse' });
    assert.equal(response.statusCode, 500); assert.deepEqual(digest(store.db), before);
    store.insertRecord = original;
    const observed = (await read(app)).json(); assert.equal(observed.revision, view.revision);
    assert.equal((await patch(app, observed.revision, { subject: 'Revisión explícita tras comprobar estado intacto' })).statusCode, 200); assert.equal(store.changesCount, 1);
  } finally { store.insertRecord = original; await app.close(); }
});

test('disk reopening retains the same revision and accepts a subsequent explicit edit without an extra history entry', () => {
  const root = path.resolve('tests/.tmp/task129-disk-' + randomUUID()); fs.mkdirSync(root, { recursive: true });
  fs.writeFileSync(path.join(root, '.planb-key'), JSON.stringify({ kind: 'test', data: randomBytes(32).toString('base64') }), { flag: 'wx' });
  const file = path.join(root, 'fixture.sqlite'); let store = new Store(file);
  try {
    store.set('instanceId', randomUUID()); seed(store); const view = readTaskRevision(store, 'task-2'); store.close(); store = new Store(file);
    assert.equal(readTaskRevision(store, 'task-2').revision, view.revision); assert.equal(store.changesCount, 0);
    const saved = writeTaskRevision(store, 'task-2', { expectedRevision: view.revision, values: { subject: 'Edición explícita después de reabrir129' } });
    assert.equal(saved.changed, true); assert.equal(store.changesCount, 1);
    store.close(); store = new Store(file);
    assert.equal(readTaskRevision(store, 'task-2').revision, saved.current.revision); assert.equal(store.changesCount, 1);
    fs.writeFileSync(path.join(root, 'observed.json'), JSON.stringify({ revision: view.revision, instanceId: view.instanceId, changes: store.changesCount, keyKind: 'test' }, null, 2));
  } finally { store.close(); }
});

test('a 10000-record snapshot yields a task token without rewriting data; timing is evidence rather than a performance guarantee', t => {
  const store = new Store(':memory:');
  try {
    store.set('instanceId', randomUUID()); seed(store, 10_000); const before = digest(store.db), start = performance.now();
    const token = readTaskRevision(store, 'task-2'); assert.equal(token.record.id, 'task-2'); const elapsedMs = performance.now() - start;
    assert.equal(store.records().length, 10_000); assert.deepEqual(digest(store.db), before); t.diagnostic(JSON.stringify({ records: 10_000, elapsedMs }));
  } finally { store.close(); }
});

test('the actual principal launcher rejects a second live owner before opening its database', { timeout: 60_000 }, async () => {
  const root = path.resolve('tests/.tmp/task129-main-' + randomUUID()), data = path.join(root, 'data'); fs.mkdirSync(data, { recursive: true });
  fs.writeFileSync(path.join(data, '.planb-key'), JSON.stringify({ kind: 'test', data: randomBytes(32).toString('base64') }), { flag: 'wx' });
  const bundle = path.join(root, 'server.mjs'); await build({ absWorkingDir: process.cwd(), entryPoints: [path.resolve('server/main.ts')], outfile: bundle, bundle: true, packages: 'external', platform: 'node', format: 'esm', logLevel: 'silent' });
  const reservation = net.createServer(); await new Promise<void>(resolve => reservation.listen(0, '127.0.0.1', resolve));
  const address = reservation.address(); assert.ok(address && typeof address !== 'string'); const port = address.port; await new Promise<void>(resolve => reservation.close(() => resolve()));
  const env = { ...Object.fromEntries(Object.entries(process.env).filter(([key]) => ['path', 'systemroot', 'windir', 'comspec', 'pathext', 'temp', 'tmp', 'tmpdir', 'lang', 'tz'].includes(key.toLowerCase()))), NODE_ENV: 'test', PLANB_PORT: String(port), PLANB_DATA_DIR: data };
  function start() {
    const child = spawn(process.execPath, ['--require', path.resolve('scripts/block-external.cjs'), bundle], { cwd: root, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = ''; child.stdout.on('data', value => { output += value; }); child.stderr.on('data', value => { output += value; });
    const done = new Promise<number | null>(resolve => child.once('exit', code => { fs.writeFileSync(path.join(root, 'process-' + child.pid + '.log'), output); resolve(code); }));
    return { child, done, output: () => output };
  }
  const owner = start();
  const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
  try {
    let ready = false; const end = Date.now() + 30_000;
    while (Date.now() < end) {
      if (owner.child.exitCode !== null) throw Error('Own principal server exited: ' + owner.output());
      const endpoint = path.join(data, '.endpoint.json');
      if (fs.existsSync(endpoint)) {
        const saved = JSON.parse(fs.readFileSync(endpoint, 'utf8'));
        const health = await fetch('http://127.0.0.1:' + port + '/api/health', { signal: AbortSignal.timeout(1000) }).then(r => r.json()).catch(() => null) as { instanceId: string } | null;
        if (saved.pid === owner.child.pid && health?.instanceId === saved.instanceId) { ready = true; break; }
      }
      await pause(100);
    }
    assert.equal(ready, true, 'Own endpoint and process identity must match before the second-owner assertion');
    const db = new DatabaseSync(path.join(data, 'planb.sqlite'), { readOnly: true });
    try {
      const before = digest(db), second = start();
      const timer = setTimeout(() => second.child.kill(), 10_000);
      const code = await second.done; clearTimeout(timer);
      assert.equal(code, 1); assert.match(second.output(), /ya está abierto/); assert.deepEqual(digest(db), before);
      assert.equal(owner.child.exitCode, null);
      fs.writeFileSync(path.join(root, 'observed.json'), JSON.stringify({ ownerPid: owner.child.pid, rejectedPid: second.child.pid, port, rejectedCode: code, databaseUnchanged: true }, null, 2));
    } finally { db.close(); }
  } finally { if (owner.child.exitCode === null) owner.child.kill(); await owner.done; }
});
