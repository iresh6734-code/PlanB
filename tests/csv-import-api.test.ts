// CLAUDE-CSV-IMPORT · Rutas reales de vista previa y aplicación sobre un almacén cifrado con datos ficticios.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import Fastify from 'fastify';
import { z } from 'zod';
import { AppError, Store } from '../server/store.js';
import { registerCsvImport } from '../server/csv-import.js';
import { makeFixture, makeDemoSpec } from '../shared/fixtures.js';

const TMP = path.resolve('tests/.tmp');
function seeded(t: test.TestContext) {
  fs.mkdirSync(TMP, { recursive: true });
  const dir = fs.mkdtempSync(path.join(TMP, 'csv-import-')), store = new Store(path.join(dir, 'planb.sqlite'));
  const snapshot = makeFixture();
  store.importSnapshot(snapshot);
  store.saveGeneration(makeDemoSpec(snapshot), { provider: 'demo', model: null, generatedAt: snapshot.capturedAt, prompt: '', approved: false });
  store.activate();
  const app = Fastify({ bodyLimit: 2_000_000 });
  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof AppError) return reply.code(error.status).send({ error: error.message, details: error.details ?? null });
    if (error instanceof z.ZodError) return reply.code(422).send({ error: 'Revisa los datos enviados.' });
    return reply.code(500).send({ error: String(error) });
  });
  registerCsvImport(app, store);
  t.after(async () => { await app.close(); store.close(); fs.rmSync(dir, { recursive: true, force: true }); });
  return { store, app };
}
const post = (app: ReturnType<typeof Fastify>, url: string, payload: object) => app.inject({ method: 'POST', url, payload });
const CSV = 'Nombre;Apellidos;Correo;Empresa\nNora;Gil;nora@ejemplo.es;Estudio Arce\nLeo;Paz;leo@ejemplo.es;\n;Sin;sin@ejemplo.es;\nPablo;Dup;pablo.garcia@example.com;';

test('vista previa no escribe; aplicar con su marca da de alta solo las filas válidas, cada una como cambio local', async t => {
  const { store, app } = seeded(t);
  const before = store.changesCount, records = store.records('contacts').length;
  const preview = await post(app, '/api/v2/import/csv/preview', { entity: 'contacts', csv: CSV });
  assert.equal(preview.statusCode, 200, preview.body);
  const p = JSON.parse(preview.body);
  assert.deepEqual([p.total, p.valid, p.invalid], [4, 2, 2]);
  assert.equal(p.mapping['Empresa'], 'company_id');
  assert.deepEqual(p.errors.map((e: { line: number }) => e.line), [4, 5]);
  assert.equal(store.changesCount, before, 'la vista previa no escribe');
  const apply = await post(app, '/api/v2/import/csv/apply', { entity: 'contacts', csv: CSV, token: p.token });
  assert.equal(apply.statusCode, 200, apply.body);
  const a = JSON.parse(apply.body);
  assert.deepEqual([a.created, a.skipped, a.failed.length], [2, 2, 0]);
  assert.equal(store.records('contacts').length, records + 2);
  assert.equal(store.changesCount, before + 2, 'un cambio local por alta');
  const nora = store.records('contacts').find(r => r.values.email === 'nora@ejemplo.es');
  assert.equal(nora?.values.company_id, 'company-1');
});

test('aplicar con una marca vieja (la copia cambió) o con otro archivo se rechaza sin escribir', async t => {
  const { store, app } = seeded(t);
  const p = JSON.parse((await post(app, '/api/v2/import/csv/preview', { entity: 'contacts', csv: CSV })).body);
  const target = store.records('contacts')[0];
  store.saveRecord('contacts', { ...target.values, phone: '600 000 777' }, target.id);
  const count = store.changesCount;
  const stale = await post(app, '/api/v2/import/csv/apply', { entity: 'contacts', csv: CSV, token: p.token });
  assert.equal(stale.statusCode, 409); assert.equal(JSON.parse(stale.body).details.code, 'STALE_PREVIEW');
  const fresh = JSON.parse((await post(app, '/api/v2/import/csv/preview', { entity: 'contacts', csv: CSV })).body);
  const other = await post(app, '/api/v2/import/csv/apply', { entity: 'contacts', csv: CSV + '\nZoe;Z;zoe@ejemplo.es;', token: fresh.token });
  assert.equal(other.statusCode, 409, 'otro archivo con la marca del primero');
  const remapped = await post(app, '/api/v2/import/csv/apply', { entity: 'contacts', csv: CSV, mapping: { Nombre: 'lastname', Apellidos: 'firstname', Correo: 'email', Empresa: null }, token: fresh.token });
  assert.equal(remapped.statusCode, 409, 'otro mapeo con la marca del primero');
  assert.equal(store.changesCount, count);
});

test('restaurar otra copia con el mismo número de registros e historial vacío invalida la marca (revisión 416/418)', async t => {
  const { store, app } = seeded(t);
  const one = 'Nombre;Correo;Empresa\nNora;nora@ejemplo.es;Estudio Arce';
  const p = JSON.parse((await post(app, '/api/v2/import/csv/preview', { entity: 'contacts', csv: one })).body);
  assert.equal(p.preview[0].values.company_id, 'company-1');
  // Copia B: misma forma y mismo conteo, otra captura y otra sesión, sin historial, y «Estudio Arce» es ahora company-2.
  const bundle = structuredClone(store.bundle());
  const swap = (records: { entity: string; id: string; values: Record<string, unknown> }[]) => records.forEach(r => {
    if (r.entity === 'companies' && r.id === 'company-1') r.values.name = 'Norte Digital';
    else if (r.entity === 'companies' && r.id === 'company-2') r.values.name = 'Estudio Arce';
  });
  swap(bundle.records); swap(bundle.snapshot.records);
  Object.assign(bundle, { sessionId: 'otra-sesion', changes: [] });
  Object.assign(bundle.snapshot, { id: 'captura-b' });
  store.restoreBundle(bundle, { replace: true });
  const records = store.records('contacts').length, changes = store.changesCount;
  assert.equal(store.records().length, bundle.records.length, 'mismo número de registros');
  const stale = await post(app, '/api/v2/import/csv/apply', { entity: 'contacts', csv: one, token: p.token });
  assert.equal(stale.statusCode, 409, stale.body); assert.equal(JSON.parse(stale.body).details.code, 'STALE_PREVIEW');
  assert.equal(store.records('contacts').length, records, 'no se dio de alta nada'); assert.equal(store.changesCount, changes, 'ni se escribió historial');
  // Con una vista previa nueva sobre B, la persona ve la empresa que corresponde y puede importar.
  const fresh = JSON.parse((await post(app, '/api/v2/import/csv/preview', { entity: 'contacts', csv: one })).body);
  assert.equal(fresh.preview[0].values.company_id, 'company-2');
  assert.equal((await post(app, '/api/v2/import/csv/apply', { entity: 'contacts', csv: one, token: fresh.token })).statusCode, 200);
});

test('R3 · restaurar una copia con la MISMA captura, fecha y sesión pero otro contenido invalida la marca (revisión 425)', async t => {
  const { store, app } = seeded(t);
  const one = 'Nombre;Correo;Empresa\nNora;nora@ejemplo.es;Estudio Arce';
  const p = JSON.parse((await post(app, '/api/v2/import/csv/preview', { entity: 'contacts', csv: one })).body);
  // Misma identidad visible (captura, fecha, sesión), mismo conteo, sin historial y la empresa sigue resolviendo igual:
  // solo cambia el contenido de OTRO registro. La marca debe caducar igualmente, porque se restauró la copia.
  const bundle = structuredClone(store.bundle());
  for (const list of [bundle.records, bundle.snapshot.records]) { const other = list.find(r => r.entity === 'contacts')!; other.values.phone = '611 000 000'; }
  store.restoreBundle(bundle, { replace: true });
  const records = store.records('contacts').length, changes = store.changesCount;
  const stale = await post(app, '/api/v2/import/csv/apply', { entity: 'contacts', csv: one, token: p.token });
  assert.equal(stale.statusCode, 409, stale.body); assert.equal(JSON.parse(stale.body).details.code, 'STALE_PREVIEW');
  assert.equal(store.records('contacts').length, records); assert.equal(store.changesCount, changes);
  const fresh = JSON.parse((await post(app, '/api/v2/import/csv/preview', { entity: 'contacts', csv: one })).body);
  assert.equal((await post(app, '/api/v2/import/csv/apply', { entity: 'contacts', csv: one, token: fresh.token })).statusCode, 200, 'una revisión nueva sí importa');
});

test('R3 · la vista previa no escribe la época en una instalación que aún no la tiene', async t => {
  const { store, app } = seeded(t);
  store.db.prepare("DELETE FROM meta WHERE key = 'copyEpoch'").run();
  assert.equal(store.get('copyEpoch', ''), '');
  assert.equal((await post(app, '/api/v2/import/csv/preview', { entity: 'contacts', csv: 'Nombre;Correo\nZoe;zoe@ejemplo.es' })).statusCode, 200);
  assert.equal(store.get('copyEpoch', ''), '', 'sigue sin época: la vista previa solo lee');
});

test('límites: cabecera obligatoria, filas máximas, campos desconocidos rechazados y nada sin activar la copia', async t => {
  const { app } = seeded(t);
  const rows = 'Nombre;Correo\n' + Array.from({ length: 1001 }, (_, i) => 'N' + i + ';n' + i + '@ejemplo.es').join('\n');
  assert.equal((await post(app, '/api/v2/import/csv/preview', { entity: 'contacts', csv: rows })).statusCode, 413);
  assert.equal((await post(app, '/api/v2/import/csv/preview', { entity: 'contacts', csv: '\n\n' })).statusCode, 422);
  assert.equal((await post(app, '/api/v2/import/csv/preview', { entity: 'otra', csv: 'a\n1' })).statusCode, 422);
  assert.equal((await post(app, '/api/v2/import/csv/apply', { entity: 'contacts', csv: 'a\n1', token: 'x' })).statusCode, 422);
  const unknownField = JSON.parse((await post(app, '/api/v2/import/csv/preview', { entity: 'contacts', csv: 'X;Nombre;Correo\n1;Ana;ana2@ejemplo.es', mapping: { X: 'inventado', Nombre: 'firstname', Correo: 'email' } })).body);
  assert.deepEqual(unknownField.ignoredColumns, ['X'], 'un campo inexistente en el mapeo se ignora, no se escribe');
});
