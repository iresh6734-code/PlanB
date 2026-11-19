import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { createBaseApp } from '../server/app.js';
import { Store } from '../server/store.js';
import { registerCsvImport } from '../server/csv-import.js';
import { makeFixture, makeDemoSpec } from '../shared/fixtures.js';

const CSV = 'Nombre;Apellidos;Correo;Empresa\nPrueba;Contexto;csv425@example.invalid;Estudio Arce';
function seed(store: Store, mode: 'a' | 'distinct' | 'same-ids' | 'other-source') {
  const snapshot = makeFixture('agency');
  snapshot.id = mode === 'distinct' ? 'csv425-other' : 'csv425-same';
  snapshot.capturedAt = '2026-11-17T12:00:00.000Z';
  snapshot.name = mode === 'a' ? 'Ensayo A' : 'Ensayo B';
  snapshot.source.accountId = mode === 'other-source' ? 'csv425-other-source' : 'csv425-source';
  if (mode === 'distinct') {
    snapshot.records.find(r => r.entity === 'companies' && r.id === 'company-1')!.values.name = 'Otra empresa';
    snapshot.records.find(r => r.entity === 'companies' && r.id === 'company-2')!.values.name = 'Estudio Arce';
  }
  if (mode === 'same-ids') snapshot.records.find(r => r.entity === 'companies' && r.id === 'company-2')!.values.name = 'Contexto de otra copia';
  store.importSnapshot(snapshot);
  store.saveGeneration(makeDemoSpec(snapshot), { provider: 'demo', model: null, prompt: '', generatedAt: snapshot.capturedAt, approved: false });
  store.activate();
  store.set('sessionId', mode === 'distinct' ? 'csv425-session-b' : 'csv425-same-session');
}

async function setup(t: test.TestContext) {
  const base = path.resolve('tests/.tmp'); fs.mkdirSync(base, { recursive: true });
  const dir = fs.mkdtempSync(path.join(base, 'csv425-data-'));
  fs.writeFileSync(path.join(dir, '.planb-key'), JSON.stringify({ kind: 'test', data: randomBytes(32).toString('base64') }));
  const { app, store } = await createBaseApp({ root: dir, dbPath: path.join(dir, 'planb.sqlite'), staticDir: path.join(dir, 'dist') });
  registerCsvImport(app, store); seed(store, 'a');
  t.after(async () => { await app.close(); assert.ok(path.resolve(dir).startsWith(base + path.sep)); fs.rmSync(dir, { recursive: true, force: true }); });
  const post = (url: string, payload: object) => app.inject({ method: 'POST', url, payload });
  const preview = () => post('/api/v2/import/csv/preview', { entity: 'contacts', csv: CSV });
  const apply = (token: string) => post('/api/v2/import/csv/apply', { entity: 'contacts', csv: CSV, token });
  return { store, post, preview, apply };
}

test('425 · control: vista previa sin escritura y aplicación sobre la misma copia', async t => {
  const f = await setup(t);
  const total = () => Number((f.store.db.prepare('SELECT total_changes() AS n').get() as { n: number }).n);
  const before = total(), count = f.store.records().length;
  const preview = await f.preview(); assert.equal(preview.statusCode, 200, preview.body);
  assert.equal(total(), before, 'preview no escribe siquiera metadatos');
  assert.equal(f.store.changesCount, 0);
  const applied = await f.apply(preview.json().token); assert.equal(applied.statusCode, 200, applied.body);
  assert.equal(f.store.records().length, count + 1);
  assert.equal(f.store.changesCount, 1);
  assert.equal(f.store.records('contacts').find(r => r.values.email === 'csv425@example.invalid')?.values.company_id, 'company-1');
});

for (const mode of ['distinct', 'same-ids', 'other-source'] as const) {
  test('425 · restaurar ' + mode + ' exige otra vista previa antes de importar', async t => {
    const f = await setup(t), other = new Store(':memory:');
    t.after(() => other.close()); seed(other, mode);
    const first = await f.preview(); assert.equal(first.statusCode, 200, first.body);
    assert.equal(first.json().preview[0].values.company_id, 'company-1');
    const records = f.store.records().length;
    assert.equal(other.records().length, records); assert.equal(other.changesCount, 0);
    const restored = await f.post('/api/v2/restore', { file: JSON.stringify(other.bundle()), replace: true });
    assert.equal(restored.statusCode, 200, restored.body);
    assert.equal(f.store.records().length, records); assert.equal(f.store.changesCount, 0);
    const contents = JSON.stringify(f.store.records());
    const applied = await f.apply(first.json().token);
    assert.equal(applied.statusCode, 409, 'Una restauración válida que cambia la copia debe invalidar la revisión: ' + applied.body);
    assert.equal(applied.json().details.code, 'STALE_PREVIEW');
    assert.equal(JSON.stringify(f.store.records()), contents, 'no añade ni modifica registros');
    assert.equal(f.store.changesCount, 0, 'no añade historial');
    const fresh = await f.preview(); assert.equal(fresh.statusCode, 200, fresh.body);
    const current = await f.apply(fresh.json().token); assert.equal(current.statusCode, 200, current.body);
    assert.equal(f.store.records().length, records + 1); assert.equal(f.store.changesCount, 1);
    const created = f.store.records('contacts').find(r => r.values.email === 'csv425@example.invalid');
    assert.equal(created?.values.company_id, mode === 'distinct' ? 'company-2' : 'company-1');
  });
}

test('425 · control: una edición local invalida la vista sin restaurar', async t => {
  const f = await setup(t), preview = await f.preview(); assert.equal(preview.statusCode, 200);
  const contact = f.store.records('contacts')[0]; f.store.saveRecord('contacts', { phone: '910000425' }, contact.id);
  const count = f.store.records().length, changes = f.store.changesCount;
  const applied = await f.apply(preview.json().token); assert.equal(applied.statusCode, 409);
  assert.equal(f.store.records().length, count); assert.equal(f.store.changesCount, changes);
});
