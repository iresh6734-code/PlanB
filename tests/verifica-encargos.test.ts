// Plan B Verifica · encargos en el servidor local (fase D, corte 1). Lo que la pantalla guarda y enseña tiene que
// coincidir con lo que firma el informe de la sala limpia del script, huella a huella.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createBaseApp } from '../server/app.js';
import { registerVerificaEngagements, engagementInputs, type VerificaEngagementOptions } from '../server/verifica/engagements.js';
import { newSalt } from '../shared/verifica/clean-room.js';
import { newCustodyKey, openCustody } from '../shared/verifica/custody.js';
import { exampleFiles } from '../scripts/verifica-ejemplo.js';
import { runCli } from '../scripts/verifica-sala-limpia.js';
import { ENGAGEMENT_LIMITS, sourceSizeProblem, type EngagementView } from '../shared/verifica/engagement.js';
import type { VerificaReport } from '../shared/verifica/report.js';

process.env.NODE_ENV = 'test';
const AT = '2026-11-24T10:00:00.000Z';

async function rig(options: VerificaEngagementOptions = {}) {
  const root = fs.mkdtempSync(path.resolve('tests/.tmp/verifica-encargos-'));
  const r = await createBaseApp({ root, dbPath: ':memory:', staticDir: root });
  registerVerificaEngagements(r.app, r.store, { now: () => AT, ...options });
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
async function scriptReport(files: Map<string, string>, cleanRoom?: { salt: string; key: string }): Promise<VerificaReport> {
  return JSON.parse((await scriptFiles(files, cleanRoom)).get('informe.json')!) as VerificaReport;
}
async function scriptFiles(files: Map<string, string>, cleanRoom?: { salt: string; key: string }): Promise<Map<string, string>> {
  const written = new Map<string, string>();
  const code = await runCli(['--previous', 'antes.json', '--latest', 'ahora.json', '--invoices', 'facturas.csv', '--declarations', 'declaraciones.json', '--report', 'informe.json', '--custody', 'copia.json', '--key-out', 'llave.txt'], {
    out: () => {}, err: () => {},
    readText: async name => { const text = files.get(path.basename(name)); if (text === undefined) throw new Error('falta ' + name); return text; },
    writeNew: async (name, text) => { written.set(path.basename(name), text); },
    cleanRoom,
  });
  assert.equal(code, 0, 'el script escribe el informe');
  return written;
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

test('Verifica · encargos: el máximo común de una fuente se mide en bytes UTF-8 y, si se supera, no se guarda nada', async () => {
  const text = 'cliente;importe\nÑandú Españoles;10\n';
  const bytes = Buffer.byteLength(text, 'utf8');
  assert.ok(text.length < bytes, 'el texto tiene menos caracteres que bytes');
  const r = await rig({ sourceBytes: bytes - 1 }), { engagement } = await create(r);
  const refused = await upload(r, engagement.id, 'invoices', text, 'ventas.csv');
  assert.equal(refused.status, 413);
  assert.equal(refused.body.error, '«ventas.csv» ocupa ' + bytes + ' bytes y el máximo de una fuente del encargo es ' + (bytes - 1) + ' bytes. No se ha guardado nada. '
    + 'Si es un archivo, expórtalo con menos periodo u objetos; si es una lectura de HubSpot, la cuenta supera lo que admite esta versión.');
  assert.equal(r.store.get('verifica:source:' + engagement.id + ':invoices', null), null);
  assert.deepEqual(r.store.get('verifica:ledger:' + engagement.id, []), [], 'el expediente no cambia');
  const exact = await rig({ sourceBytes: bytes }), other = await create(exact);
  assert.equal((await upload(exact, other.engagement.id, 'invoices', text, 'ventas.csv')).status, 200, 'justo en el máximo, se guarda');
  const limit = ENGAGEMENT_LIMITS.sourceBytes;
  assert.match(sourceSizeProblem('X', limit + 1)!, /^X ocupa 50\.331\.649 bytes y el máximo de una fuente del encargo es 50\.331\.648 bytes\./, 'en el borde, bytes exactos');
  assert.match(sourceSizeProblem('X', limit + 4 * 1024 * 1024)!, /^X ocupa 52,0 MB y el máximo de una fuente del encargo es 48,0 MB\./);
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

const uploadAll = async (r: Rig, id: string, files: Map<string, string>) => {
  for (const [role, file] of [['previous', 'antes.json'], ['latest', 'ahora.json'], ['invoices', 'facturas.csv'], ['declarations', 'declaraciones.json']] as const) {
    assert.equal((await upload(r, id, role, files.get(file)!, file)).status, 200, role);
  }
};
const fetchText = async (r: Rig, url: string) => { const res = await r.app.inject({ method: 'GET', url: '/api/verifica' + url }); return { status: res.statusCode, body: res.body, type: String(res.headers['content-type']) }; };

test('Verifica · sala limpia: sin las dos capturas no se emite nada', async () => {
  const r = await rig(), files = exampleFiles(true), { engagement } = await create(r);
  await upload(r, engagement.id, 'latest', files.get('ahora.json')!, 'ahora.json');
  const res = await call(r, 'POST', '/engagements/' + engagement.id + '/clean-room');
  assert.equal(res.status, 409);
  assert.match(res.body.error, /falta la captura anterior/);
  assert.equal((await fetchText(r, '/engagements/' + engagement.id + '/issue/report')).status, 404);
});

test('Verifica · sala limpia: con la misma sal y llave, el informe es idéntico byte a byte al del script', async () => {
  const fixed = { salt: newSalt(), key: newCustodyKey() };
  const r = await rig({ cleanRoom: fixed }), files = exampleFiles(true), { engagement } = await create(r);
  await uploadAll(r, engagement.id, files);
  const issued = await call(r, 'POST', '/engagements/' + engagement.id + '/clean-room');
  assert.equal(issued.status, 200, JSON.stringify(issued.body));
  assert.equal(issued.body.key, fixed.key, 'la llave viaja una vez, en la respuesta de emitir');
  assert.equal(issued.body.findings, 6);
  assert.equal(issued.body.alarms, 6);
  const fromScript = await scriptFiles(files, fixed);
  const report = await fetchText(r, '/engagements/' + engagement.id + '/issue/report');
  assert.equal(report.status, 200);
  assert.match(report.type, /application\/json/);
  assert.equal(report.body, fromScript.get('informe.json'), 'mismo informe, byte a byte');
  assert.equal(issued.body.reportFingerprint, JSON.parse(report.body).fingerprint);
  // La copia (cifrada con IV propio) se abre con su llave y rehace exactamente el mismo informe.
  const custody = await fetchText(r, '/engagements/' + engagement.id + '/issue/custody');
  const opened = await openCustody(JSON.parse(custody.body), fixed.key);
  assert.equal(opened.reproduces, true);
  assert.equal(opened.rebuilt.fingerprint, issued.body.reportFingerprint);
  assert.equal(JSON.parse(custody.body).format, JSON.parse(fromScript.get('copia.json')!).format);
});

test('Verifica · sala limpia: la llave no se guarda ni vuelve a salir, y cambiar una fuente deja la emisión desfasada', async () => {
  const r = await rig(), files = exampleFiles(true), { engagement } = await create(r);
  await uploadAll(r, engagement.id, files);
  const issued = await call(r, 'POST', '/engagements/' + engagement.id + '/clean-room');
  assert.equal(issued.status, 200);
  const key: string = issued.body.key;
  assert.match(key, /^vfk1-/);
  const view = (await call(r, 'GET', '/engagements/' + engagement.id)).body;
  assert.equal(view.issue.stale, false);
  assert.equal(view.issue.reportFingerprint, issued.body.reportFingerprint);
  const everything = JSON.stringify(view) + JSON.stringify((await call(r, 'GET', '/engagements')).body)
    + (await fetchText(r, '/engagements/' + engagement.id + '/issue/report')).body + (await fetchText(r, '/engagements/' + engagement.id + '/issue/custody')).body;
  assert.ok(!everything.includes(key), 'la llave no aparece en ninguna otra respuesta');
  const rows = r.store.db.prepare('SELECT key FROM meta WHERE key LIKE ?').all('verifica:%') as { key: string }[];
  for (const row of rows) assert.ok(!JSON.stringify(r.store.get(row.key, null)).includes(key), 'ni en el almacén: ' + row.key);
  assert.equal((await call(r, 'GET', '/engagements')).body.engagements[0].issued, true);
  const changed = (await upload(r, engagement.id, 'declarations', '{"activeCustomers":300}', 'otras.json')).body;
  assert.equal(changed.issue.stale, true, 'el informe ya no corresponde a las fuentes');
  assert.equal((await call(r, 'GET', '/engagements')).body.engagements[0].issued, false);
});

test('Verifica · una fuente cambia durante el cifrado: se rechaza la emisión y se conserva la anterior', async t => {
  const r = await rig(), files = exampleFiles(true), { engagement: { id } } = await create(r);
  await uploadAll(r, id, files);
  const url = '/engagements/' + id;
  const original = await call(r, 'POST', url + '/clean-room');
  assert.equal(original.status, 200);
  const report = await fetchText(r, url + '/issue/report');
  const custody = await fetchText(r, url + '/issue/custody');

  let entered!: () => void, release!: () => void;
  const encrypting = new Promise<void>(resolve => { entered = resolve; });
  const paused = new Promise<void>(resolve => { release = resolve; });
  const subtle = globalThis.crypto.subtle;
  const encrypt = subtle.encrypt.bind(subtle);
  t.mock.method(subtle, 'encrypt', async (...args: Parameters<typeof encrypt>) => {
    entered();
    await paused;
    return encrypt(...args);
  });
  const pending = call(r, 'POST', url + '/clean-room');
  try {
    await Promise.race([encrypting, pending.then(() => { assert.fail('La emisión terminó sin llegar al cifrado.'); })]);
    assert.equal((await upload(r, id, 'declarations', '{"activeCustomers":300}')).status, 200);
  } finally {
    release();
  }
  const rejected = await pending;
  assert.equal(rejected.status, 409);
  assert.match(rejected.body.error, /las fuentes cambiaron/i);
  assert.equal(rejected.body.key, undefined);
  assert.deepEqual(await fetchText(r, url + '/issue/report'), report);
  assert.deepEqual(await fetchText(r, url + '/issue/custody'), custody);
  const view = (await call(r, 'GET', url)).body as EngagementView;
  assert.equal(view.issue?.reportFingerprint, original.body.reportFingerprint);
  assert.equal(view.issue?.stale, true);
  const retried = await call(r, 'POST', url + '/clean-room');
  assert.equal(retried.status, 200);
  assert.equal(retried.body.stale, false);
  assert.notEqual(retried.body.reportFingerprint, original.body.reportFingerprint);
});
