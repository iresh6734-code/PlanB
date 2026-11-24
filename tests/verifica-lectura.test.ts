// Plan B Verifica · leer HubSpot desde la pantalla (fase D, corte 3), con el HubSpot simulado: lo mismo que el script,
// byte a byte, y ninguna petición si la autorización no sirve.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createBaseApp } from '../server/app.js';
import { registerVerificaEngagements, type ReadJob, type VerificaEngagementOptions } from '../server/verifica/engagements.js';
import { runCli } from '../scripts/verifica-hubspot.js';
import { buildTrapCompany } from '../shared/verifica/empresa-con-trampas.js';
import { sha256Hex } from '../shared/sha256.js';
import { fakeHubspot, FAKE_PORTAL } from './helpers/fake-hubspot.js';

process.env.NODE_ENV = 'test';
const TOKEN = 'pat-eu1-prueba-falsa-0000';
const SIGNED = new TextEncoder().encode('%PDF-1.4 autorización de lectura firmada por la cliente');
const authorizationFor = (overrides: Record<string, unknown> = {}) => ({
  kind: 'verifica-read-authorization', version: 1, portalId: FAKE_PORTAL, engagement: 'VF-2026-001',
  authorizedBy: { name: 'Ana Ruiz', role: 'Directora general', company: 'Cliente de prueba S.L.' },
  signedOn: '2000-01-01', validUntil: '2099-12-31', scope: ['owners', 'companies', 'contacts', 'deals_with_history'],
  signedDocumentSha256: sha256Hex(SIGNED), ...overrides,
});
const company = buildTrapCompany({ traps: true });
const clock = () => new Date(company.latest.capturedAt);

async function rig(options: VerificaEngagementOptions) {
  const root = fs.mkdtempSync(path.resolve('tests/.tmp/verifica-lectura-'));
  const r = await createBaseApp({ root, dbPath: ':memory:', staticDir: root });
  registerVerificaEngagements(r.app, r.store, { now: () => '2026-11-24T10:00:00.000Z', hubspotNow: clock, ...options });
  return r;
}
type Rig = Awaited<ReturnType<typeof rig>>;
const call = async (r: Rig, method: 'GET' | 'POST', url: string, payload?: Record<string, unknown>) => {
  const res = await r.app.inject(payload === undefined ? { method, url: '/api/verifica' + url } : { method, url: '/api/verifica' + url, payload });
  return { status: res.statusCode, body: res.headers['content-type']?.toString().includes('json') && res.body ? JSON.parse(res.body) : res.body, text: res.body };
};
const engagement = async (r: Rig) => (await call(r, 'POST', '/engagements', { name: 'Distribuidora del norte' })).body.engagement.id as string;
async function finished(r: Rig, id: string): Promise<ReadJob> {
  for (let i = 0; i < 500; i++) {
    const job = (await call(r, 'GET', '/engagements/' + id + '/read')).body.job as ReadJob | null;
    if (job && job.state !== 'running') return job;
    await new Promise(resolve => setTimeout(resolve, 5));
  }
  throw new Error('la lectura no terminó');
}
const clientBody = (over: Record<string, unknown> = {}) => ({
  mode: 'client', portalId: FAKE_PORTAL, token: TOKEN, target: 'latest',
  authorization: JSON.stringify(authorizationFor()), documentBase64: Buffer.from(SIGNED).toString('base64'), ...over,
});

test('Verifica · lectura desde la pantalla: en modo cliente, la misma captura y la misma acta que el script, byte a byte', async () => {
  // El script, con el HubSpot simulado.
  const files = new Map<string, string>([['autorizacion.json', JSON.stringify(authorizationFor())]]);
  const scriptFake = fakeHubspot(company.latest, { accountType: 'STANDARD' });
  const code = await runCli(['--portal', FAKE_PORTAL, '--client-authorization', 'autorizacion.json', '--authorization-document', 'firmada.pdf', '--out', 'captura.json', '--record', 'acta.json'], {
    stdin: { isTTY: false, async *[Symbol.asyncIterator]() { yield TOKEN + '\n'; } }, out: () => {}, err: () => {}, fetch: scriptFake.fetcher, now: clock,
    readText: async name => { const text = files.get(name); if (text === undefined) throw new Error('no existe'); return text; },
    readBytes: async () => SIGNED,
    writeNew: async (name, text) => { files.set(name, text); },
  });
  assert.equal(code, 0);
  // La pantalla, con otro HubSpot simulado igual.
  const fake = fakeHubspot(company.latest, { accountType: 'STANDARD' });
  const r = await rig({ hubspotFetch: fake.fetcher });
  const id = await engagement(r);
  const started = await call(r, 'POST', '/engagements/' + id + '/read', clientBody());
  assert.equal(started.status, 202);
  assert.equal(started.body.state, 'running');
  const job = await finished(r, id);
  assert.equal(job.state, 'done', job.error);
  assert.equal(job.result?.role, 'latest');
  const stored = r.store.get<{ text: string } | null>('verifica:source:' + id + ':latest', null);
  assert.equal(stored?.text, files.get('captura.json'), 'misma captura, byte a byte');
  const records = (await call(r, 'GET', '/engagements/' + id + '/records')).body.records;
  assert.equal(records.length, 1);
  const record = await call(r, 'GET', '/engagements/' + id + '/records/' + records[0].captureId);
  assert.equal(record.text, files.get('acta.json'), 'misma acta, byte a byte');
  assert.equal(job.result?.recordFingerprint, JSON.parse(files.get('acta.json')!).fingerprint);
  assert.deepEqual(fake.log.map(l => l.method + ' ' + l.url.pathname), scriptFake.log.map(l => l.method + ' ' + l.url.pathname), 'las mismas peticiones');
  // La credencial no se guarda ni sale en ninguna respuesta.
  const rows = r.store.db.prepare('SELECT key FROM meta').all() as { key: string }[];
  for (const row of rows) assert.ok(!JSON.stringify(r.store.get(row.key, null)).includes(TOKEN), 'credencial en ' + row.key);
  assert.ok(!JSON.stringify((await call(r, 'GET', '/engagements/' + id + '/read')).body).includes(TOKEN));
});

test('Verifica · lectura desde la pantalla: lo que no sirve se para antes de la primera petición', async () => {
  const fake = fakeHubspot(company.latest, { accountType: 'STANDARD' });
  const r = await rig({ hubspotFetch: fake.fetcher });
  const id = await engagement(r);
  const refused = async (body: Record<string, unknown>, pattern: RegExp) => {
    const res = await call(r, 'POST', '/engagements/' + id + '/read', body);
    assert.equal(res.status, 422, JSON.stringify(res.body));
    assert.match(res.body.error, pattern);
    assert.ok(!JSON.stringify(res.body).includes(TOKEN), 'la credencial no vuelve en el error');
  };
  await refused(clientBody({ authorization: JSON.stringify(authorizationFor({ validUntil: '2001-01-01' })) }), /caducó.*No se ha hecho ninguna petición/);
  await refused(clientBody({ documentBase64: Buffer.from('%PDF-1.4 otro').toString('base64') }), /no coincide con la huella/);
  await refused(clientBody({ portalId: '999' }), /no del 999/);
  await refused(clientBody({ documentBase64: undefined }), /necesita la autorización/);
  await refused(clientBody({ authorization: 'no es json' }), /no es JSON válido/);
  await refused(clientBody({ token: 'con espacio dentro' }), /no tiene forma válida/);
  await refused({ mode: 'test', portalId: FAKE_PORTAL, token: TOKEN, target: 'latest' }, /Confirma que autorizas/);
  assert.equal(fake.log.length, 0, 'ninguna petición a HubSpot');
  assert.equal((await call(r, 'GET', '/engagements/' + id + '/read')).body.job, null);
});

test('Verifica · lectura desde la pantalla: modo pruebas, rotación de capturas, una lectura a la vez y fallo sin guardar nada', async () => {
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const fake = fakeHubspot(company.latest);
  const held = (async (input: string | URL | Request, init?: RequestInit) => { await gate; return fake.fetcher(input, init); }) as typeof fetch;
  const r = await rig({ hubspotFetch: held });
  const id = await engagement(r);
  const body = { mode: 'test', portalId: FAKE_PORTAL, token: TOKEN, target: 'previous', confirmFullRead: true };
  assert.equal((await call(r, 'POST', '/engagements/' + id + '/read', body)).status, 202);
  assert.equal((await call(r, 'POST', '/engagements/' + id + '/read', body)).status, 409, 'una lectura a la vez');
  release();
  const first = await finished(r, id);
  assert.equal(first.state, 'done', first.error);
  assert.equal(first.result?.role, 'previous');
  assert.equal(first.result?.recordFingerprint, null, 'en modo pruebas no hay acta');
  // Segunda lectura con rotación: la reciente entra y la anterior se conserva (aquí no había reciente).
  assert.equal((await call(r, 'POST', '/engagements/' + id + '/read', { ...body, target: 'latest' })).status, 202);
  assert.equal((await finished(r, id)).state, 'done');
  const latestText = r.store.get<{ text: string } | null>('verifica:source:' + id + ':latest', null)!.text;
  assert.equal((await call(r, 'POST', '/engagements/' + id + '/read', { ...body, target: 'rotate' })).status, 202);
  assert.equal((await finished(r, id)).state, 'done');
  assert.equal(r.store.get<{ text: string } | null>('verifica:source:' + id + ':previous', null)!.text, latestText, 'la reciente pasa a anterior');
  // Una cuenta real en modo pruebas se para y no guarda nada nuevo.
  const r2 = await rig({ hubspotFetch: fakeHubspot(company.latest, { accountType: 'STANDARD' }).fetcher });
  const id2 = await engagement(r2);
  assert.equal((await call(r2, 'POST', '/engagements/' + id2 + '/read', body)).status, 202);
  const failed = await finished(r2, id2);
  assert.equal(failed.state, 'failed');
  assert.match(failed.error ?? '', /^Lectura detenida: En modo de pruebas solo se leen cuentas de pruebas/);
  assert.equal(r2.store.get('verifica:source:' + id2 + ':previous', null), null);
});

test('Verifica · lectura desde la pantalla: una captura por encima del máximo común se para sin guardar nada', async () => {
  const fake = fakeHubspot(company.latest);
  const r = await rig({ hubspotFetch: fake.fetcher, sourceBytes: 4096 });
  const id = await engagement(r);
  const body = { mode: 'test', portalId: FAKE_PORTAL, token: TOKEN, target: 'latest', confirmFullRead: true };
  assert.equal((await call(r, 'POST', '/engagements/' + id + '/read', body)).status, 202);
  const failed = await finished(r, id);
  assert.equal(failed.state, 'failed');
  assert.match(failed.error ?? '', /^Lectura detenida: La captura de HubSpot ocupa [\d.]+ bytes y el máximo de una fuente del encargo es 4\.096 bytes\. No se ha guardado nada\./);
  assert.ok(fake.log.length > 0, 'la medida es sobre la captura leída');
  assert.equal(r.store.get('verifica:source:' + id + ':latest', null), null);
  assert.deepEqual(r.store.get('verifica:ledger:' + id, []), []);
});

test('Verifica · un fallo de guardado revierte la rotación y el acta y permite reintentar', async t => {
  const fake = fakeHubspot(company.latest, { accountType: 'STANDARD' });
  let timestamp = clock().getTime();
  const r = await rig({ hubspotFetch: fake.fetcher, hubspotNow: () => new Date(timestamp), now: () => new Date(timestamp).toISOString() });
  const id = await engagement(r);
  const url = '/engagements/' + id;
  for (const target of ['previous', 'latest']) {
    timestamp += 1000;
    assert.equal((await call(r, 'POST', url + '/read', clientBody({ target }))).status, 202);
    assert.equal((await finished(r, id)).state, 'done');
  }

  // El estado de la lectura se guarda a propósito (Mega Plan 3, fase 2) y no es parte del expediente ni de sus documentos.
  const rows = () => r.store.db.prepare("SELECT key, value FROM meta WHERE key LIKE 'verifica:%' AND key NOT LIKE 'verifica:readjob:%' ORDER BY key").all();
  const before = rows();
  const entries = (await call(r, 'GET', url + '/records')).body.records;
  assert.equal(entries.length, 2);
  const latest = r.store.get('verifica:source:' + id + ':latest', null);
  const set = r.store.set.bind(r.store);
  const failure = t.mock.method(r.store, 'set', (key: string, value: unknown) => {
    if (key === 'verifica:engagements') throw new Error('fallo de escritura del encargo');
    set(key, value);
  });
  timestamp += 1000;
  assert.equal((await call(r, 'POST', url + '/read', clientBody({ target: 'rotate' }))).status, 202);
  const failed = await finished(r, id);
  assert.equal(failed.state, 'failed', failed.error);
  assert.match(failed.error ?? '', /no se pudo guardar/i);
  assert.equal(failed.result, undefined);
  assert.deepEqual(rows(), before, 'ninguna escritura parcial en el expediente');
  assert.deepEqual((await call(r, 'GET', url + '/records')).body.records, entries);

  failure.mock.restore();
  assert.equal((await call(r, 'POST', url + '/read', clientBody({ target: 'rotate' }))).status, 202);
  const retried = await finished(r, id);
  assert.equal(retried.state, 'done', retried.error);
  assert.deepEqual(r.store.get('verifica:source:' + id + ':previous', null), latest);
  assert.equal((await call(r, 'GET', url + '/records')).body.records.length, 3);
  assert.equal((await call(r, 'GET', url + '/records/' + retried.result?.captureId)).status, 200);
});
