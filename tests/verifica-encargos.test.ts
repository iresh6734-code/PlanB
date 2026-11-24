// Plan B Verifica · encargos en el servidor local (fase D, corte 1). Lo que la pantalla guarda y enseña tiene que
// coincidir con lo que firma el informe de la sala limpia del script, huella a huella.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createBaseApp } from '../server/app.js';
import { registerVerificaEngagements, engagementInputs } from '../server/verifica/engagements.js';
import { exampleFiles } from '../scripts/verifica-ejemplo.js';
import { runCli } from '../scripts/verifica-sala-limpia.js';
import type { EngagementView } from '../shared/verifica/engagement.js';
import type { VerificaReport } from '../shared/verifica/report.js';

process.env.NODE_ENV = 'test';
const AT = '2026-11-24T10:00:00.000Z';

async function rig() {
  const root = fs.mkdtempSync(path.resolve('tests/.tmp/verifica-encargos-'));
  const r = await createBaseApp({ root, dbPath: ':memory:', staticDir: root });
  registerVerificaEngagements(r.app, r.store, { now: () => AT });
  return r;
}
type Rig = Awaited<ReturnType<typeof rig>>;
const call = async (r: Rig, method: 'GET' | 'POST' | 'PUT' | 'DELETE', url: string, payload?: Record<string, unknown>) => {
  const res = await r.app.inject(payload === undefined ? { method, url: '/api/verifica' + url } : { method, url: '/api/verifica' + url, payload });
  return { status: res.statusCode, body: res.body ? JSON.parse(res.body) : null };
};
const create = async (r: Rig, name = 'Distribuidora del norte') => (await call(r, 'POST', '/engagements', { name })).body as EngagementView;
const upload = (r: Rig, id: string, role: string, text: string, fileName = role + '.txt') => call(r, 'PUT', '/engagements/' + id + '/sources/' + role, { text, fileName });

/** El informe que escribe el script de la sala limpia con los mismos archivos. */
async function scriptReport(files: Map<string, string>): Promise<VerificaReport> {
  const written = new Map<string, string>();
  const code = await runCli(['--previous', 'antes.json', '--latest', 'ahora.json', '--invoices', 'facturas.csv', '--declarations', 'declaraciones.json', '--report', 'informe.json', '--custody', 'copia.json', '--key-out', 'llave.txt'], {
    out: () => {}, err: () => {},
    readText: async name => { const text = files.get(path.basename(name)); if (text === undefined) throw new Error('falta ' + name); return text; },
    writeNew: async (name, text) => { written.set(path.basename(name), text); },
  });
  assert.equal(code, 0, 'el script escribe el informe');
  return JSON.parse(written.get('informe.json')!) as VerificaReport;
}

test('Verifica · encargos: el servidor local se anuncia y crea un encargo vacío', async () => {
  const r = await rig();
  assert.deepEqual((await call(r, 'GET', '/health')).body, { ok: true, engagements: true });
  const created = await call(r, 'POST', '/engagements', { name: '  Distribuidora del norte  ' });
  assert.equal(created.status, 201);
  assert.equal(created.body.engagement.name, 'Distribuidora del norte');
  assert.deepEqual((Object.values(created.body.sources) as { status: string }[]).map(s => s.status), ['missing', 'missing', 'missing', 'missing']);
  assert.deepEqual(created.body.missing, ['Falta la captura anterior.', 'Falta la captura más reciente.']);
  const listed = (await call(r, 'GET', '/engagements')).body.engagements;
  assert.equal(listed.length, 1);
  assert.equal(listed[0].ready, false);
  assert.equal((await call(r, 'POST', '/engagements', { name: '   ' })).status, 422, 'nombre vacío');
});

test('Verifica · encargos: las huellas de la pantalla son las mismas que firma el informe del script', async () => {
  const r = await rig(), files = exampleFiles(true), { engagement } = await create(r);
  for (const [role, file] of [['previous', 'antes.json'], ['latest', 'ahora.json'], ['invoices', 'facturas.csv'], ['declarations', 'declaraciones.json']] as const) {
    const res = await upload(r, engagement.id, role, files.get(file)!, file);
    assert.equal(res.status, 200, role + ': ' + JSON.stringify(res.body));
  }
  const view = (await call(r, 'GET', '/engagements/' + engagement.id)).body as EngagementView;
  assert.deepEqual(view.missing, []);
  for (const state of Object.values(view.sources)) assert.equal(state.status, 'ok', state.role);
  const report = await scriptReport(files);
  for (const source of report.sources) {
    const shown = view.sources[source.role];
    assert.ok(shown.status === 'ok' && shown.fingerprint === source.fingerprint, source.role + ': la misma huella que el informe del script');
  }
  assert.equal((await call(r, 'GET', '/engagements')).body.engagements[0].ready, true);
  // Lo que se guarda es lo que entraría en la sala limpia: las mismas capturas y facturas.
  const inputs = engagementInputs(r.store, engagement.id).inputs;
  assert.equal(inputs.latest?.id, JSON.parse(files.get('ahora.json')!).id);
  assert.equal(inputs.invoices?.length, Number(report.sources.find(s => s.role === 'invoices')!.detail.split(' ')[0]));
});

test('Verifica · encargos: una fuente que no sirve no se guarda y se explica por qué', async () => {
  const r = await rig(), files = exampleFiles(true), { engagement } = await create(r);
  const bad = await upload(r, engagement.id, 'latest', '{"hola":"mundo"}', 'cualquiera.json');
  assert.equal(bad.status, 422);
  assert.equal(bad.body.error, 'El archivo no es una captura de Verifica.');
  assert.equal((await upload(r, engagement.id, 'latest', 'esto no es json', 'x.json')).body.error, 'El archivo no es JSON válido.');
  assert.equal((await upload(r, engagement.id, 'declarations', '{"renewalRate":3}', 'd.json')).body.error, 'El archivo: renewalRate tiene que ser un número entre 0 y 1.');
  assert.equal((await upload(r, engagement.id, 'invoices', 'una sola columna\nsin separador', 'f.csv')).status, 422);
  const view = (await call(r, 'GET', '/engagements/' + engagement.id)).body as EngagementView;
  assert.ok(Object.values(view.sources).every(s => s.status === 'missing'), 'nada guardado');
  // Las facturas esperan a la captura más reciente, porque se asignan a sus empresas.
  const waiting = (await upload(r, engagement.id, 'invoices', files.get('facturas.csv')!, 'facturas.csv')).body as EngagementView;
  assert.equal(waiting.sources.invoices.status, 'waiting');
  const ready = (await upload(r, engagement.id, 'latest', files.get('ahora.json')!, 'ahora.json')).body as EngagementView;
  assert.equal(ready.sources.invoices.status, 'ok');
  // Si la «anterior» es más nueva que la reciente, se señala y el encargo no está listo.
  const swapped = (await upload(r, engagement.id, 'previous', files.get('ahora.json')!, 'ahora.json')).body as EngagementView;
  assert.equal(swapped.sources.previous.status, 'invalid');
  assert.ok(swapped.missing.includes('La captura anterior no sirve.'));
});

test('Verifica · encargos: las respuestas no devuelven el contenido del CRM y se puede quitar una fuente', async () => {
  const r = await rig(), files = exampleFiles(true), { engagement } = await create(r);
  const latest = await upload(r, engagement.id, 'latest', files.get('ahora.json')!, 'ahora.json');
  const companyName = JSON.parse(files.get('ahora.json')!).companies[0].name as string;
  assert.ok(!JSON.stringify(latest.body).includes(companyName), 'ningún nombre del CRM en la respuesta');
  assert.ok(!JSON.stringify((await call(r, 'GET', '/engagements')).body).includes(companyName));
  const removed = (await call(r, 'DELETE', '/engagements/' + engagement.id + '/sources/latest')).body as EngagementView;
  assert.equal(removed.sources.latest.status, 'missing');
  assert.equal((await call(r, 'GET', '/engagements/00000000-0000-4000-8000-000000000000')).status, 404);
  assert.equal((await call(r, 'PUT', '/engagements/' + engagement.id + '/sources/otra', { text: 'x', fileName: 'x' })).status, 422, 'fuente desconocida');
});
