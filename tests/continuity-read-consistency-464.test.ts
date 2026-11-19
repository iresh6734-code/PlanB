import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createBaseApp } from '../server/app.js';
import { Store } from '../server/store.js';
import { makeDemoSpec, makeFixture } from '../shared/fixtures.js';
import type { CrmSnapshot } from '../shared/model.js';

const headers = { host: '127.0.0.1:4590' };
const queue = '/api/v2/continuity/response-queue?limit=200';

async function openCopy(t: TestContext) {
  const base = path.resolve(tmpdir());
  const root = mkdtempSync(path.join(base, 'planb-continuity-464-'));
  const dbPath = path.join(root, 'planb.sqlite');
  writeFileSync(path.join(root, '.planb-key'), JSON.stringify({ kind: 'test', data: randomBytes(32).toString('base64') }));
  const { app, store } = await createBaseApp({ root, dbPath, staticDir: path.join(root, 'no-assets') });
  const writer = new Store(dbPath);
  t.after(async () => {
    writer.close();
    await app.close();
    assert.equal(path.dirname(root), base);
    assert.match(path.basename(root), /^planb-continuity-464-/);
    rmSync(root, { recursive: true, force: true });
  });
  return {
    store, writer, get: (url: string) => app.inject({ url, headers }),
    writes: () => store.db.prepare('SELECT total_changes() AS n').get()?.n,
  };
}

function makeBundle(snapshot: CrmSnapshot) {
  const store = new Store(':memory:');
  try {
    store.importSnapshot(snapshot);
    store.saveGeneration(makeDemoSpec(snapshot), {
      provider: 'demo', model: null, prompt: '', generatedAt: snapshot.capturedAt, approved: false,
    });
    store.activate();
    return store.bundle();
  } finally {
    store.close();
  }
}

test('radar: una restauración con el mismo ID y fecha no mezcla procedencia y tareas', async t => {
  const f = await openCopy(t);
  const original = makeFixture('agency');
  const updated = structuredClone(original);
  updated.source.accountId = 'restauracion-ficticia';
  const task = updated.records.find(record => record.entity === 'tasks' && record.values.status !== 'completed')!;
  task.values.subject = 'Tarea de la copia restaurada';
  f.store.restoreBundle(makeBundle(original));
  const replacement = makeBundle(updated);
  const first = await f.get(queue);
  assert.equal(first.statusCode, 200);
  assert.equal(first.json().source.accountId, original.source.accountId);

  const readRecords = f.store.records.bind(f.store);
  let restored = false;
  f.store.records = entity => {
    if (!restored) {
      restored = true;
      f.writer.restoreBundle(replacement);
    }
    return readRecords(entity);
  };
  const writes = f.writes();
  const concurrent = await f.get(queue);
  assert.equal(restored, true);
  assert.equal(concurrent.statusCode, 409, 'la procedencia anterior y los registros restaurados no forman una sola lectura');
  assert.equal(concurrent.json().source, undefined);
  assert.equal(concurrent.json().items, undefined);

  const fresh = await f.get(queue);
  assert.equal(fresh.statusCode, 200);
  assert.equal(fresh.json().source.captureId, first.json().source.captureId);
  assert.equal(fresh.json().source.accountId, updated.source.accountId);
  assert.equal(fresh.json().items.find((item: { id: string }) => item.id === task.id)?.label, task.values.subject);
  assert.equal(f.writes(), writes);
});

test('radar: la revisión cambia si cambia el portal con el mismo ID, esquema y datos', async t => {
  const f = await openCopy(t);
  const original = makeFixture('agency');
  const updated = structuredClone(original);
  updated.source.accountId = 'otro-portal-de-ensayo';
  const before = makeBundle(original), after = makeBundle(updated);
  assert.deepEqual(before.spec, after.spec);
  assert.deepEqual(before.records, after.records);
  f.store.restoreBundle(before);
  const first = await f.get(queue);
  f.writer.restoreBundle(after);
  const fresh = await f.get(queue);
  assert.equal(first.statusCode, 200);
  assert.equal(fresh.statusCode, 200);
  assert.equal(fresh.json().source.captureId, first.json().source.captureId);
  assert.notEqual(fresh.json().source.revision, first.json().source.revision);
});

test('comparador: una poda entre lecturas no publica diferencias de una pareja retirada', async t => {
  const f = await openCopy(t);
  const day = new Date().toISOString().slice(0, 10);
  const from = makeFixture('agency');
  from.capturedAt = day + 'T00:00:00.000Z';
  const to = structuredClone(from);
  to.capturedAt = day + 'T01:00:00.000Z';
  to.records.find(record => record.entity === 'contacts')!.values.phone = '600 000 464';
  const fromId = f.store.addCapture(from), toId = f.store.addCapture(to);
  const path = '/api/v2/captures/compare?from=' + encodeURIComponent(fromId) + '&to=' + encodeURIComponent(toId);
  const initial = await f.get(path);
  assert.equal(initial.statusCode, 200);
  assert.equal(initial.json().records.totalDifferences, 1);

  const readCapture = f.store.capture.bind(f.store);
  let pruned = false;
  f.store.capture = id => {
    const capture = readCapture(id);
    if (id === fromId && !pruned) {
      pruned = true;
      f.writer.pruneCaptures(Date.now() + 48 * 3600_000);
    }
    return capture;
  };
  const writes = f.writes();
  const concurrent = await f.get(path);
  assert.equal(pruned, true);
  assert.deepEqual(f.store.captures().map(capture => capture.id), [toId]);
  assert.equal(concurrent.statusCode, 409);
  assert.equal(concurrent.json().from, undefined);
  assert.equal(concurrent.json().records, undefined);
  assert.equal((await f.get(path)).statusCode, 404);
  assert.equal(f.writes(), writes);
});
