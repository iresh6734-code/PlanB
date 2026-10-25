import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { makeDemoSpec, makeFixture } from '../shared/fixtures.js';
import { reconcile, validateSpec, validateRecord, type Generation } from '../shared/model.js';
import { Store, AppError } from '../server/store.js';
import { ProviderSettings } from '../server/provider.js';
import { createBaseApp } from '../server/app.js';
import { registerGenerator } from '../server/generator.js';

export function ready(store: Store, profile: 'agency' | 'distribution' = 'agency') {
  const fixture = makeFixture(profile);
  store.importSnapshot(fixture);
  store.saveGeneration(makeDemoSpec(fixture), generation());
  store.activate(); return fixture;
}
export const generation = (): Generation => ({ provider: 'demo', model: null, generatedAt: new Date().toISOString(), prompt: '', approved: false });
const scratch = resolve('tests', '.tmp');
import { mkdirSync } from 'node:fs';
mkdirSync(scratch, { recursive: true });
test('dos configuraciones completas producen formularios, etapas y validaciones diferentes', () => {
  const a = makeFixture(), b = makeFixture('distribution');
  for (const fixture of [a, b]) {
    const report = reconcile(fixture);
    assert.equal(report.complete, true, report.errors.join('\n'));
    assert.deepEqual(Object.values(report.counts).map(c => c.actual), [24, 8, 12, 18]);
    const spec = makeDemoSpec(fixture);
    assert.deepEqual(validateSpec(spec, fixture), []);
    for (const record of fixture.records) assert.deepEqual(validateRecord(spec, record), {}, record.entity + ':' + record.id);
  }
  assert.notDeepEqual(a.entities[0].fields, b.entities[0].fields);
  assert.notDeepEqual(a.stages, b.stages);
  assert.notDeepEqual(a.rules, b.rules);
});
test('capturas parciales y referencias rotas se rechazan sin sustituir la última captura válida', () => {
  const store = new Store(':memory:'); ready(store);
  const baseline = store.snapshot!;
  const partial = structuredClone(baseline); partial.records.pop();
  assert.throws(() => store.importSnapshot(partial), /incompleta/);
  assert.equal(store.snapshot!.id, baseline.id);
  assert.equal(store.records().length, 62);
  const broken = structuredClone(baseline); broken.links[0].toId = 'missing';
  assert.equal(reconcile(broken).complete, false);
  store.close();
});
test('la especificación no puede inventar campos ni reglas importadas o de usuario sin procedencia', () => {
  const fixture = makeFixture(), spec = makeDemoSpec(fixture);
  spec.entities[0].fields.pop();
  assert.ok(validateSpec(spec, fixture).length);
  const invented = makeDemoSpec(fixture);
  invented.rules.push({ ...invented.rules[0], id: 'invented', origin: 'user', evidence: 'no consta' });
  assert.ok(validateSpec(invented, fixture, 'otra instrucción').length);
  const transition = makeDemoSpec(fixture);
  transition.rules.push({ id: 'bad-transition', entity: 'contacts', field: 'firstname', kind: 'allowed_transition', value: 'won', whenValue: 'contact', whenField: null, origin: 'user', description: 'Regla inválida', evidence: 'limitar' });
  assert.ok(validateSpec(transition, fixture, 'limitar').length);
});
test('un fallo de actualización conserva la aplicación activa y bloquea solo la candidata', () => {
  const store = new Store(':memory:'); const snapshot = ready(store);
  store.failGeneration('El proveedor falló');
  assert.equal(store.ready, true);
  assert.throws(() => store.activate());
  assert.doesNotThrow(() => store.saveRecord('contacts', { firstname: 'Ana' }, 'contact-1'));
  const invalid = makeDemoSpec(snapshot); invalid.rules[1].value = 'NaN';
  assert.throws(() => store.saveGeneration(invalid, generation()), /no está preparada/);
  assert.equal(store.ready, true); store.close();
});
test('cliente, avance de oportunidad y nueva tarea sobreviven a cerrar SQLite y trasladar el paquete', () => {
  const folder = mkdtempSync(join(scratch, 'persist-'));
  try {
    let store = new Store(join(folder, 'original.sqlite')); ready(store); store.set('disconnected', true);
    store.saveRecord('contacts', { phone: '+34 600 123 456' }, 'contact-1');
    store.saveRecord('deals', { dealstage: 'proposal', service: 'brand' }, 'deal-1');
    const task = store.saveRecord('tasks', { subject: 'Llamar sin conexión', due_date: '2026-11-10', status: 'pending', contact_id: 'contact-1', deal_id: 'deal-1', notes: 'Local' });
    assert.equal(store.changesCount, 3);
    assert.throws(() => store.importSnapshot(makeFixture('distribution')), /cambios locales/);
    store.close(); store = new Store(join(folder, 'original.sqlite'));
    assert.equal(store.record('contacts', 'contact-1')!.values.phone, '+34 600 123 456');
    assert.equal(store.record('deals', 'deal-1')!.values.dealstage, 'proposal');
    assert.equal(store.record('tasks', task.id)!.values.subject, 'Llamar sin conexión');
    const bundle = store.bundle(); store.close();
    const moved = new Store(join(folder, 'otra-carpeta', 'planb.sqlite')); moved.restoreBundle(bundle);
    assert.equal(moved.ready, true); assert.equal(moved.disconnected, true);
    assert.equal(moved.changesCount, 3); assert.equal(moved.records().length, 63);
    assert.deepEqual(moved.bundle().records, bundle.records);
    moved.close();
  } finally { rmSync(folder, { recursive: true, force: true }); }
});
test('el servidor aplica las reglas de campos, referencias y fechas y rechaza transiciones inválidas', () => {
  const store = new Store(':memory:'); ready(store);
  assert.throws(() => store.saveRecord('contacts', { email: 'roto' }, 'contact-1'), /campos/);
  assert.throws(() => store.saveRecord('contacts', { company_id: 'missing' }, 'contact-1'), /campos/);
  assert.throws(() => store.saveRecord('deals', { amount: -1 }, 'deal-1'), /campos/);
  assert.throws(() => store.saveRecord('deals', { dealstage: 'proposal', service: null }, 'deal-1'), /campos/);
  assert.throws(() => store.saveRecord('tasks', { due_date: '2026-02-30' }, 'task-1'), /campos/);
  assert.equal(store.changesCount, 0); store.close();
});
test('el presupuesto reserva antes de gastar y conserva reservas al reiniciar', () => {
  const folder = mkdtempSync(join(scratch, 'budget-'));
  try {
    let store = new Store(join(folder, 'budget.sqlite'));
    const first = store.reserveUsage(20); assert.throws(() => store.reserveUsage(6), /25 USD/);
    store.settleUsage(first, 2); store.reserveUsage(22);
    assert.throws(() => store.reserveUsage(-1), /no es válida/);
    store.close(); store = new Store(join(folder, 'budget.sqlite'));
    assert.equal(store.usage().usedUsd, 2); assert.equal(store.usage().reservedUsd, 22);
    assert.throws(() => store.reserveUsage(2), /25 USD/); store.close();
  } finally { rmSync(folder, { recursive: true, force: true }); }
});
test('API local: origen, flujo real de ensayo, desconexión y exportaciones sin credenciales', async () => {
  const folder = mkdtempSync(join(scratch, 'api-'));
  const providers = new ProviderSettings(join(folder, '.ai.local.json'));
  const { app, store } = await createBaseApp({ dbPath: ':memory:', root: resolve('.'), staticDir: join(folder, 'none'), aiPublic: () => providers.public() });
  registerGenerator(app, store, providers);
  const request = async (method: 'GET' | 'POST' | 'PUT', url: string, payload?: unknown, headers = {}) =>
    await app.inject({ method, url, payload: payload === undefined ? undefined : JSON.stringify(payload),
      headers: { host: '127.0.0.1:4317', 'content-type': 'application/json', ...headers } });
  try {
    assert.equal((await request('GET', '/api/state', undefined, { origin: 'https://evil.example' })).statusCode, 403);
    assert.equal((await request('GET', '/api/state', undefined, { host: 'evil.example' })).statusCode, 403);
    assert.equal((await request('POST', '/api/import/fixture', { profile: 'agency' })).statusCode, 200);
    assert.equal((await request('POST', '/api/generate', { mode: 'ai' })).statusCode, 503);
    assert.equal(store.ready, false);
    assert.equal((await request('POST', '/api/generate', { mode: 'demo' })).statusCode, 200);
    assert.equal((await request('POST', '/api/activate', { reviewed: false })).statusCode, 422);
    assert.equal((await request('POST', '/api/activate', { reviewed: true })).statusCode, 200);
    const config = { preset: 'custom', baseUrl: 'https://provider.example/v1', model: 'test', apiKey: 'test-only-secret-canary', inputUsdPerMillion: 1, outputUsdPerMillion: 2, outputMode: 'json_object', maxOutputTokens: 8192 };
    assert.equal((await request('PUT', '/api/settings/ai', config)).statusCode, 200);
    assert.ok(!(await request('GET', '/api/state')).body.includes(config.apiKey));
    assert.equal((await request('POST', '/api/disconnect', { disconnected: true })).statusCode, 200);
    const json = await request('GET', '/api/export/bundle'); assert.equal(json.statusCode, 200); assert.ok(!json.body.includes(config.apiKey));
    assert.equal((await request('GET', '/api/export/changes?format=csv')).headers['content-type'], 'text/csv; charset=utf-8');
    assert.equal((await request('POST', '/api/probe', {})).json().passed, true);
    assert.equal((await request('POST', '/api/import/hubspot', { accountId: '123', confirmedTestAccount: true })).statusCode, 409);
    assert.equal((await request('POST', '/api/generate', { mode: 'ai' })).statusCode, 409);
  } finally { await app.close(); rmSync(folder, { recursive: true, force: true }); }
});
