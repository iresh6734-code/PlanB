import test from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { createBaseApp } from '../server/app.js';
import { makeDemoSpec, makeFixture } from '../shared/fixtures.js';

// Misión maestra A4: la ruta del paquete de vuelta solo LEE. Sin puertos ni red (inject), con datos ficticios en memoria.
const headers = { host: '127.0.0.1:4399' };
async function setup() {
  const { app, store } = await createBaseApp({ dbPath: ':memory:', root: resolve('.'), staticDir: resolve('tests/.tmp/a4-no-static'), runtime: false });
  const snapshot = makeFixture();
  store.importSnapshot(snapshot);
  store.saveGeneration(makeDemoSpec(snapshot), { provider: 'demo', model: null, generatedAt: new Date().toISOString(), prompt: '', approved: false });
  store.activate();
  const inject = (method: 'GET' | 'POST', url: string, payload?: object) => app.inject({ method, url, headers, ...(payload ? { payload } : {}) });
  return { app, store, inject };
}

test('A4 · paquete de vuelta: CSV atado a la revisión de la comprobación manual, sin tocar la copia ni la marca', async () => {
  const { app, store, inject } = await setup();
  try {
    const contact = store.records().find(record => record.id === 'contact-1')!;
    store.saveRecord('contacts', { ...contact.values, email: 'lucia@nuevo.example.com' }, 'contact-1');
    store.set('remoteMapping:hubspot', { 'contacts:contact-1': '5001' });
    const before = { changes: store.changesCount, watermark: store.get('returnWatermark:hubspot', 0), records: JSON.stringify(store.records()) };
    const response = await inject('POST', '/api/v3/return-package', { readHubspot: false });
    assert.equal(response.statusCode, 200, response.body);
    const pkg = response.json();
    assert.equal(pkg.identity.revision, (await inject('GET', '/api/v2/changes')).json().revision, 'misma revisión que exige /api/v3/manual-recovery/verify');
    assert.equal(pkg.identity.remoteChecked, false);
    assert.equal(pkg.files.length, 1);
    assert.equal(pkg.files[0].csv, 'Record ID,email\r\n5001,lucia@nuevo.example.com\r\n');
    assert.match(pkg.summary.join(' '), /Sin leer HubSpot/);
    assert.deepEqual({ changes: store.changesCount, watermark: store.get('returnWatermark:hubspot', 0), records: JSON.stringify(store.records()) }, before, 'generar el paquete no cambia nada');
  } finally { await app.close(); }
});

test('A4 · sin ID numérico de HubSpot la ficha queda fuera y explicada; leer HubSpot exige la conexión del portal', async () => {
  const { app, store, inject } = await setup();
  try {
    const contact = store.records().find(record => record.id === 'contact-2')!;
    store.saveRecord('contacts', { ...contact.values, phone: '600 999 999' }, 'contact-2');
    const pkg = (await inject('POST', '/api/v3/return-package', { readHubspot: false })).json();
    assert.deepEqual(pkg.files, []);
    assert.deepEqual(pkg.skipped.map((item: { localId: string; reason: string }) => item.localId + ':' + item.reason), ['contact-2:bad-id']);
    const read = await inject('POST', '/api/v3/return-package', {});
    assert.equal(read.statusCode, 422, 'por defecto se lee HubSpot y sin conexión no se inventa una comprobación');
    assert.match(read.json().error, /conexión de lectura del mismo portal/);
    assert.equal((await inject('POST', '/api/v3/return-package', { readHubspot: false, extra: 1 })).statusCode, 422, 'cuerpo estricto: la App responde 422 a una validación fallida');
  } finally { await app.close(); }
});
