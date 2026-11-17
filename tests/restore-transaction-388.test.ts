import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { createBaseApp } from '../server/app.js';
import { bundleRevision } from '../server/recovery-copy.js';
import { Store } from '../server/store.js';
import { makeDemoSpec, makeFixture } from '../shared/fixtures.js';
import type { ContinuityBundle } from '../shared/model.js';

function activate(store: Store, id: string, accountId: string) {
  const data = makeFixture('agency');
  data.id = id;
  data.source.accountId = accountId;
  data.capturedAt = '2026-11-15T09:00:00Z';
  store.importSnapshot(data);
  store.saveGeneration(makeDemoSpec(data), {
    provider: 'demo', model: null, prompt: '', generatedAt: data.capturedAt, approved: false,
  });
  store.activate();
}

function readPersisted(filename: string) {
  const db = new DatabaseSync(filename, { readOnly: true });
  try {
    const rows = ['meta', 'records', 'changes', 'captures', 'archives', 'sqlite_sequence'].map(table =>
      db.prepare('SELECT * FROM ' + table).all().map(row => JSON.stringify(row)).sort(),
    );
    return createHash('sha256').update(JSON.stringify(rows)).digest('hex');
  } finally { db.close(); }
}

async function fixture(t: test.TestContext, options: { account?: string; sameCapture?: boolean; previousChange?: boolean } = {}) {
  const parent = path.resolve('tests/.tmp');
  mkdirSync(parent, { recursive: true });
  const root = mkdtempSync(path.join(parent, 'restore-388-'));
  writeFileSync(path.join(root, '.planb-key'), JSON.stringify({ kind: 'test', data: randomBytes(32).toString('base64') }), { flag: 'wx' });
  const file = path.join(root, 'planb.sqlite');
  const { app, store } = await createBaseApp({ dbPath: file, root, staticDir: path.join(root, 'dist') });
  t.after(() => app.close());
  activate(store, 'restore388-a', '38800');
  if (options.previousChange !== false) store.saveRecord('contacts', { phone: '910000388' }, 'contact-1');
  store.set('connectionPublic', { accountId: '38800' });
  const archiveBefore = { marker: 'archivo previo ficticio' };
  const custodyBefore = { exportedAt: '2026-11-14T09:00:00Z', restoredAt: '2026-11-14T09:01:00Z' };
  store.set('lastRestoreArchive', archiveBefore);
  store.set('recoveryCopy', custodyBefore);
  const prior = store.bundle();
  // Fill the record cache before the attempted restore.
  const previousPhone = store.record('contacts', 'contact-1')?.values.phone;

  const next = new Store(':memory:');
  let incoming: ContinuityBundle;
  try {
    activate(next, options.sameCapture ? prior.snapshot.id : 'restore388-b', options.account ?? '38800');
    next.saveRecord('contacts', { phone: '920000388' }, 'contact-1');
    incoming = next.bundle();
  } finally { next.close(); }

  const previousRows = readPersisted(file);
  const restore = (replace = true) => app.inject({
    method: 'POST',
    url: '/api/v2/restore',
    payload: { file: JSON.stringify(incoming), replace },
  });
  function unchanged() {
    assert.deepEqual(readPersisted(file), previousRows, 'todas las filas persisten byte a byte tras el rechazo');
    assert.equal(bundleRevision(store.bundle()), bundleRevision(prior));
    assert.equal(store.record('contacts', 'contact-1')?.values.phone, previousPhone);
    assert.deepEqual(store.get('lastRestoreArchive', null), archiveBefore);
    assert.deepEqual(store.get('recoveryCopy', null), custodyBefore);
  }
  function restored() {
    assert.equal(bundleRevision(store.bundle()), bundleRevision(incoming));
    assert.equal(store.record('contacts', 'contact-1')?.values.phone, '920000388');
    assert.ok(store.captures().some(item => item.id === incoming.snapshot.id + ':' + incoming.snapshot.capturedAt));
    assert.equal(bundleRevision(store.get('lastRestoreArchive', incoming)), bundleRevision(prior));
    const receipt = store.get<{ exportedAt: string; restoredAt: string } | null>('recoveryCopy', null);
    assert.equal(receipt?.exportedAt, incoming.exportedAt);
    assert.ok(receipt?.restoredAt);
  }
  return { file, store, restore, unchanged, restored, archiveBefore, custodyBefore };
}

test('388 · otro portal no sustituye el archivo anterior ni modifica el almacén', async t => {
  const context = await fixture(t, { account: '38899' });
  const reply = await context.restore();
  assert.equal(reply.statusCode, 409);
  assert.match(reply.json().error, /otro portal/);
  context.unchanged();
});

test('388 · un cambio de otra conexión requiere confirmar la sustitución bajo el bloqueo', async t => {
  const context = await fixture(t, { previousChange: false });
  const transaction = context.store.transaction.bind(context.store);
  let afterEdit: string | undefined;
  t.mock.method(context.store, 'transaction', <T>(execute: () => T): T => {
    const other = new Store(context.file);
    try {
      other.saveRecord('contacts', { phone: '930000388' }, 'contact-1');
      afterEdit = readPersisted(context.file);
    } finally { other.close(); }
    return transaction(execute);
  }, { times: 1 });

  const reply = await context.restore(false);
  assert.equal(reply.statusCode, 409);
  assert.match(reply.json().error, /confirma la sustitución/);
  assert.ok(afterEdit);
  assert.equal(readPersisted(context.file), afterEdit);
  assert.equal(context.store.record('contacts', 'contact-1')?.values.phone, '930000388');
  assert.deepEqual(context.store.get('lastRestoreArchive', null), context.archiveBefore);
  assert.deepEqual(context.store.get('recoveryCopy', null), context.custodyBefore);
});

const faults = {
  capture: 'BEFORE INSERT ON captures',
  receipt: "BEFORE INSERT ON meta WHEN NEW.key='recoveryCopy'",
  archive: "BEFORE INSERT ON meta WHEN NEW.key='lastRestoreArchive'",
};
for (const [name, condition] of Object.entries(faults)) {
  test('388 · una escritura rechazada de ' + name + ' revierte todo y admite reintento', async t => {
    const context = await fixture(t);
    context.store.db.exec("CREATE TEMP TRIGGER refuse_restore " + condition + " BEGIN SELECT RAISE(ABORT, 'fixture-388'); END");
    const reply = await context.restore();
    assert.equal(reply.statusCode, 500);
    context.unchanged();

    context.store.db.exec('DROP TRIGGER refuse_restore');
    assert.equal((await context.restore()).statusCode, 200);
    context.restored();
  });
}

for (const sameCapture of [false, true]) {
  test('388 · un exceso del límite revierte la restauración con captura ' + (sameCapture ? 'existente' : 'nueva'), async t => {
    const context = await fixture(t, { sameCapture });
    t.mock.method(context.store, 'storageBytes', () => 2 * 1024 ** 3 + 1);
    const reply = await context.restore();
    assert.equal(reply.statusCode, 507);
    assert.match(reply.json().error, /límite local de 2 GB/);
    context.unchanged();
  });
}

test('388 · la vía de arranque restaura la captura sin escribir custodia ni un archivo anterior', t => {
  const store = new Store(':memory:');
  t.after(() => store.close());
  activate(store, 'restore388-seed', '38800');
  const bundle = store.bundle();
  store.restoreBundle(bundle);
  assert.equal(bundleRevision(store.bundle()), bundleRevision(bundle));
  assert.equal(store.get('lastRestoreArchive', null), null);
  assert.equal(store.get('recoveryCopy', null), null);
});
