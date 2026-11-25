// Plan B Verifica · expediente, versiones, preguntas, paquete del comprador y cierre en el servidor local (Mega Plan 3,
// fases 1 y 3), con los archivos de la empresa de ejemplo y sin red.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createBaseApp } from '../server/app.js';
import { registerVerificaEngagements, type VerificaEngagementOptions } from '../server/verifica/engagements.js';
import { exampleFiles } from '../scripts/verifica-ejemplo.js';
import { verifyPackage } from '../shared/verifica/paquete.js';
import { fingerprintOf } from '../shared/verifica/report.js';
import { buildTrapCompany } from '../shared/verifica/empresa-con-trampas.js';
import { fakeHubspot, FAKE_PORTAL } from './helpers/fake-hubspot.js';
import { buildClosureRecord, verifyClosureRecord } from '../shared/verifica/expediente.js';
import { latestEquivalence } from '../server/verifica/equivalence-store.js';

process.env.NODE_ENV = 'test';
const files = exampleFiles(true);
const SALT = 'f'.repeat(64);

async function rig(options: VerificaEngagementOptions = {}) {
  const root = fs.mkdtempSync(path.resolve('tests/.tmp/verifica-expediente-'));
  const r = await createBaseApp({ root, dbPath: ':memory:', staticDir: root });
  let clock = Date.parse('2026-11-24T10:00:00.000Z');
  registerVerificaEngagements(r.app, r.store, { now: () => new Date(clock += 1000).toISOString(), cleanRoom: { salt: SALT }, watchIntervalMs: 3_600_000, ...options });
  return r;
}
type Rig = Awaited<ReturnType<typeof rig>>;
const call = async (r: Rig, method: 'GET' | 'POST' | 'PUT' | 'DELETE', url: string, payload?: unknown) => {
  const res = await r.app.inject(payload === undefined ? { method, url: '/api/verifica' + url } : { method, url: '/api/verifica' + url, payload: payload as object });
  return { status: res.statusCode, body: res.headers['content-type']?.toString().includes('json') && res.body ? JSON.parse(res.body) : res.body, text: res.body };
};
async function ready(r: Rig, name = 'Distribuidora del norte', withInvoices = true) {
  const id = (await call(r, 'POST', '/engagements', { name })).body.engagement.id as string;
  const upload = (role: string, file: string) => call(r, 'PUT', `/engagements/${id}/sources/${role}`, { text: files.get(file)!, fileName: file });
  assert.equal((await upload('previous', 'antes.json')).status, 200);
  assert.equal((await upload('latest', 'ahora.json')).status, 200);
  if (withInvoices) assert.equal((await upload('invoices', 'facturas.csv')).status, 200);
  assert.equal((await upload('declarations', 'declaraciones.json')).status, 200);
  return id;
}

test('Verifica · expediente: la cadena está íntegra, cada emisión la ancla y un retoque se detecta', async () => {
  const r = await rig();
  const id = await ready(r);
  assert.equal((await call(r, 'POST', `/engagements/${id}/clean-room`)).status, 200);
  const view = (await call(r, 'GET', `/engagements/${id}/expediente`)).body;
  assert.ok(view.verification.intact, JSON.stringify(view.verification.first));
  assert.deepEqual(view.entries.map((e: { event: string }) => e.event), ['source-stored', 'source-stored', 'source-stored', 'source-stored', 'report-issued']);
  assert.deepEqual(view.anchors, [{ sequence: 5, ok: true }]);
  // Alguien retoca una entrada en la base: la cadena lo dice.
  const key = 'verifica:ledger:' + id;
  const entries = r.store.get<{ data: { role?: string } }[]>(key, []);
  entries[1].data.role = 'invoices';
  r.store.set(key, entries);
  const touched = (await call(r, 'GET', `/engagements/${id}/expediente`)).body;
  assert.equal(touched.verification.intact, false);
  assert.equal(touched.verification.first.code, 'altered');
  // Alguien recorta la cola y rehace la cadena: el ancla de la emisión ya no coincide.
  r.store.set(key, entries.slice(0, 2));
  const cut = (await call(r, 'GET', `/engagements/${id}/expediente`)).body;
  assert.deepEqual(cut.anchors, [{ sequence: 5, ok: false }]);
});

test('Verifica · versiones: la segunda emisión se compara con la primera y dice qué fuente lo explica', async () => {
  const r = await rig();
  const id = await ready(r, 'Imprenta del este', false);
  assert.equal((await call(r, 'POST', `/engagements/${id}/clean-room`)).status, 200);
  assert.equal((await call(r, 'GET', `/engagements/${id}/issues`)).body.comparison, null);
  assert.equal((await call(r, 'PUT', `/engagements/${id}/sources/invoices`, { text: files.get('facturas.csv')!, fileName: 'facturas.csv' })).status, 200);
  assert.equal((await call(r, 'POST', `/engagements/${id}/clean-room`)).status, 200);
  const { versions, comparison } = (await call(r, 'GET', `/engagements/${id}/issues`)).body;
  assert.equal(versions.length, 2);
  assert.ok(!('reportJson' in versions[0]), 'la lista no devuelve el informe entero');
  const won = comparison.findings.find((f: { rule: string }) => f.rule === 'won-without-invoice');
  assert.deepEqual(won.explainedBy, ['invoices']);
});

test('Verifica · preguntas: respuesta declarada en el expediente; una respuesta con un nombre del CRM no se guarda', async () => {
  const r = await rig();
  const id = await ready(r);
  assert.equal((await call(r, 'GET', `/engagements/${id}/questions`)).body.questions.length, 0, 'sin emitir, sin preguntas');
  assert.equal((await call(r, 'POST', `/engagements/${id}/clean-room`)).status, 200);
  const { questions } = (await call(r, 'GET', `/engagements/${id}/questions`)).body;
  assert.ok(questions.length > 0);
  const rule = questions[0].id;
  const name = buildTrapCompany({ traps: true }).latest.companies[0].name;
  const leak = await call(r, 'PUT', `/engagements/${id}/answers/${rule}`, { text: 'Lo firmó ' + name + ' en octubre.' });
  assert.equal(leak.status, 422);
  assert.match(leak.body.error, /seudónimos/);
  assert.ok(!JSON.stringify(leak.body).includes(name), 'el error no repite el nombre');
  const ok = await call(r, 'PUT', `/engagements/${id}/answers/${rule}`, { text: 'Son pedidos firmados en octubre; adjuntamos los contratos.' });
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  assert.equal(ok.body.answers.basis, 'declared');
  const again = (await call(r, 'GET', `/engagements/${id}/questions`)).body;
  assert.equal(again.answers.answers.length, 1);
  const events = (await call(r, 'GET', `/engagements/${id}/expediente`)).body.entries.map((e: { event: string }) => e.event);
  assert.equal(events.at(-1), 'answer-declared');
  assert.equal((await call(r, 'PUT', `/engagements/${id}/answers/bulk-deletion`, { text: 'x' })).status, questions.some((q: { id: string }) => q.id === 'bulk-deletion') ? 200 : 409);
});

test('Verifica · paquete del comprador: solo lo compartible, verificable sin conexión y con la cabeza del expediente', async () => {
  const r = await rig();
  const id = await ready(r);
  assert.equal((await call(r, 'POST', `/engagements/${id}/package`, {})).status, 409, 'sin informe no hay paquete');
  assert.equal((await call(r, 'POST', `/engagements/${id}/clean-room`)).status, 200);
  const rule = (await call(r, 'GET', `/engagements/${id}/questions`)).body.questions[0].id;
  await call(r, 'PUT', `/engagements/${id}/answers/${rule}`, { text: 'Respuesta declarada.' });
  assert.equal((await call(r, 'POST', `/engagements/${id}/package`, { watch: true })).status, 409, 'sin vigilancia no hay parte');
  const res = await call(r, 'POST', `/engagements/${id}/package`, { answers: true });
  assert.equal(res.status, 200);
  const pkg = JSON.parse(res.text);
  assert.ok(verifyPackage(pkg).intact);
  assert.deepEqual(pkg.documents.map((d: { kind: string }) => d.kind), ['report', 'answers']);
  const ledger = (await call(r, 'GET', `/engagements/${id}/expediente`)).body.entries;
  assert.equal(pkg.ledgerHead.sequence, ledger.at(-2).sequence, 'la cabeza de antes de emitir el paquete');
  assert.equal(ledger.at(-1).event, 'package-issued');
  for (const banned of [SALT, 'Distribuidora del norte', 'vfk1-', ...JSON.parse(files.get('ahora.json')!).companies.slice(0, 20).map((c: { name: string }) => c.name)]) {
    assert.ok(!res.text.includes(banned), 'el paquete no lleva ' + banned.slice(0, 20));
  }
});

test('Verifica · la equivalencia requiere su huella y las solicitudes anteriores pueden omitirla', async () => {
  const r = await rig();
  const id = await ready(r);
  await call(r, 'POST', `/engagements/${id}/clean-room`);
  assert.equal((await call(r, 'POST', `/engagements/${id}/package`, { equivalence: { fingerprint: 'a'.repeat(64), reviewed: true } })).status, 409, 'sin informe de equivalencia no hay paquete con equivalencia');
  const previousClient = await call(r, 'POST', `/engagements/${id}/package`, { equivalence: true });
  assert.equal(previousClient.status, 409);
  assert.match(previousClient.body.error, /confirma la huella/);
  const ledger = (await call(r, 'GET', `/engagements/${id}/expediente`)).body.entries;
  assert.equal(ledger.at(-1).event, 'report-issued', 'un intento fallido no emite paquete');
  for (const entry of ledger) for (const ref of entry.refs ?? []) assert.ok(ref.kind !== 'equivalence' && ref.kind !== 'equivalence-report', 'sin equivalencia previa nada queda anclado');
  // Lo guardado con el formato de 0b5e3f0 ({ report, json }) se sigue leyendo como informe.
  r.store.set('verifica:equivalence:' + id, { report: 'f'.repeat(64), json: JSON.stringify({ fingerprint: 'f'.repeat(64) }) });
  assert.equal(latestEquivalence(r.store, id)?.fingerprint, 'f'.repeat(64));
  const omitted = await call(r, 'POST', `/engagements/${id}/package`, { equivalence: false });
  assert.equal(omitted.status, 200);
  assert.deepEqual(JSON.parse(omitted.text).documents.map((doc: { kind: string }) => doc.kind), ['report']);
});

test('Verifica · cierre: hay que escribir el nombre, se borra todo lo del encargo y queda un acta mínima', async () => {
  const r = await rig();
  const id = await ready(r);
  const other = await ready(r, 'Otro encargo');
  assert.equal((await call(r, 'POST', `/engagements/${id}/clean-room`)).status, 200);
  assert.equal((await call(r, 'POST', `/engagements/${id}/close`, { confirmName: 'otro nombre' })).status, 422);
  const before = (r.store.db.prepare('SELECT count(*) AS n FROM meta WHERE key LIKE ?').get('%' + id + '%') as { n: number }).n;
  const closed = await call(r, 'POST', `/engagements/${id}/close`, { confirmName: 'Distribuidora del norte' });
  assert.equal(closed.status, 200, JSON.stringify(closed.body));
  const { closure } = closed.body;
  assert.equal(closure.deleted.rows, before);
  assert.ok(closure.ledgerIntact);
  assert.equal(closure.ledgerHead.sequence, 5);
  assert.equal(closure.terminalEntry.event, 'engagement-closed');
  assert.equal(closure.terminalEntry.sequence, 6);
  assert.equal(closure.terminalEntry.previous, closure.ledgerHead.fingerprint);
  assert.equal(verifyClosureRecord(closure, closure.fingerprint), true);
  const { fingerprint, ...body } = closure;
  assert.equal(fingerprint, fingerprintOf(body));
  const { terminalEntry, scopeFingerprint, ...legacy } = body;
  assert.ok(verifyClosureRecord({ ...legacy, fingerprint: fingerprintOf(legacy) }), 'las actas anteriores conservan su comprobación');
  const altered = { ...body, terminalEntry: { ...terminalEntry, sequence: 7 } };
  assert.equal(verifyClosureRecord({ ...altered, fingerprint: fingerprintOf(altered) }), false, 'recalcular la huella externa no corrige un eslabón incoherente');
  assert.equal(verifyClosureRecord(buildClosureRecord({ ...legacy, deleted: { ...legacy.deleted, rows: before + 1 } })), false);
  const left = r.store.db.prepare('SELECT key FROM meta WHERE key LIKE ?').all('%' + id + '%') as { key: string }[];
  assert.deepEqual(left.map(k => k.key), [], 'ninguna clave del encargo; el acta va en la lista común de cierres');
  assert.ok(!JSON.stringify(r.store.get('verifica:closures', null)).includes('Distribuidora'), 'el acta no guarda el nombre');
  assert.equal((await call(r, 'GET', `/engagements/${id}`)).status, 404);
  assert.equal((await call(r, 'GET', `/engagements/${other}`)).status, 200, 'el otro encargo sigue intacto');
  assert.equal((await call(r, 'GET', '/closures')).body.closures.length, 1);
});

test('Verifica · el cierre rechaza un alcance desfasado y revierte un fallo al guardar su acta', async () => {
  const r = await rig();
  try {
    const id = await ready(r);
    const other = await ready(r, 'Otro encargo');
    const foreignKey = `verifica:record:${other}:captura:${id}`;
    r.store.set(foreignKey, 'evidencia ficticia de otro encargo');
    const base = `/engagements/${id}`;
    const before = (await call(r, 'GET', base + '/expediente')).body.closureScope;
    assert.equal((await call(r, 'POST', base + '/clean-room')).status, 200);
    const denied = await call(r, 'POST', base + '/close', { confirmName: 'Distribuidora del norte', scopeFingerprint: before.fingerprint });
    assert.equal(denied.status, 409);
    const scope = (await call(r, 'GET', base + '/expediente')).body.closureScope;
    assert.notEqual(scope.fingerprint, before.fingerprint);
    r.store.db.exec(`CREATE TEMP TRIGGER fallar_acta_cierre BEFORE INSERT ON meta WHEN NEW.key = 'verifica:closures'
      BEGIN SELECT RAISE(ABORT, 'fallo de ensayo'); END;`);
    const confirm = () => call(r, 'POST', base + '/close', { confirmName: 'Distribuidora del norte', scopeFingerprint: scope.fingerprint });
    assert.equal((await confirm()).status, 500);
    assert.deepEqual((await call(r, 'GET', base + '/expediente')).body.closureScope, scope);
    assert.deepEqual((await call(r, 'GET', '/closures')).body.closures, []);
    r.store.db.exec('DROP TRIGGER fallar_acta_cierre');
    const finished = await confirm();
    assert.equal(finished.status, 200, finished.text);
    assert.equal(finished.body.closure.scopeFingerprint, scope.fingerprint);
    assert.deepEqual(finished.body.closure.deleted, { rows: scope.rows, byKind: scope.byKind });
    assert.equal(r.store.get(foreignKey, null), 'evidencia ficticia de otro encargo');
  } finally { await r.app.close(); }
});

test('Verifica · capturas: mientras hay una lectura de HubSpot en marcha no se cambian a mano', async () => {
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const fake = fakeHubspot(buildTrapCompany({ traps: true }).latest);
  const r = await rig({ hubspotFetch: (async (input: string | URL | Request, init?: RequestInit) => { await gate; return fake.fetcher(input, init); }) as typeof fetch });
  const id = (await call(r, 'POST', '/engagements', { name: 'Lectura en marcha' })).body.engagement.id;
  assert.equal((await call(r, 'POST', `/engagements/${id}/read`, { mode: 'test', portalId: FAKE_PORTAL, token: 'pat-eu1-prueba-falsa-0000', target: 'latest', confirmFullRead: true })).status, 202);
  const put = await call(r, 'PUT', `/engagements/${id}/sources/latest`, { text: files.get('ahora.json')!, fileName: 'ahora.json' });
  assert.equal(put.status, 409);
  assert.equal((await call(r, 'DELETE', `/engagements/${id}/sources/previous`)).status, 409);
  assert.equal((await call(r, 'PUT', `/engagements/${id}/sources/declarations`, { text: files.get('declaraciones.json')!, fileName: 'declaraciones.json' })).status, 200, 'las demás fuentes sí');
  assert.equal((await call(r, 'POST', `/engagements/${id}/close`, { confirmName: 'Lectura en marcha' })).status, 409);
  release();
});
