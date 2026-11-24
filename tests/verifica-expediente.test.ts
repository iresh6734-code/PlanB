// Plan B Verifica · cadena privada del expediente (Mega Plan 3, fase 1). La cadena detecta una entrada retocada, insertada,
// eliminada o reordenada, y se escribe en la misma transacción que los documentos de su evento.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createBaseApp } from '../server/app.js';
import { registerVerificaEngagements } from '../server/verifica/engagements.js';
import { engagementLedger } from '../server/verifica/expediente-store.js';
import { exampleFiles } from '../scripts/verifica-ejemplo.js';
import { sha256Hex } from '../shared/sha256.js';
import type { EngagementView } from '../shared/verifica/engagement.js';
import { ledgerEntryFingerprint, LedgerInputError, nextLedgerEntry, verifyLedger, type LedgerEntry } from '../shared/verifica/expediente.js';

process.env.NODE_ENV = 'test';
const ID = '6f1c2a40-0000-4000-8000-000000000001';
const hex = (seed: string) => sha256Hex(seed);

function chain(times: string[]): LedgerEntry[] {
  const entries: LedgerEntry[] = [];
  times.forEach((at, index) => entries.push(nextLedgerEntry(entries.at(-1) ?? null, ID, at, {
    event: 'source-stored', data: { role: 'latest', origin: 'file' },
    refs: [{ kind: 'capture', role: 'latest', method: 'sha256-bytes-v1', fingerprint: hex('captura ' + index) }],
  })));
  return entries;
}
const codes = (entries: unknown[], head?: { sequence: number; fingerprint: string }) => {
  const result = verifyLedger(entries, { engagement: ID, expectedHead: head });
  return { first: result.first && [result.first.index, result.first.code], intact: result.intact };
};

test('Verifica · expediente: la cadena íntegra se verifica y el orden lo da la secuencia, no el reloj', () => {
  const entries = chain(['2026-11-24T10:00:00Z', '2026-11-24T09:00:00Z', '2026-11-24T11:00:00Z', '2026-11-24T11:00:00Z']);
  assert.deepEqual(entries.map(e => e.sequence), [1, 2, 3, 4]);
  assert.equal(entries[0].previous, null);
  assert.equal(entries[2].previous, entries[1].fingerprint);
  assert.equal(entries[1].fingerprint, ledgerEntryFingerprint(entries[1]));
  const result = verifyLedger(entries, { engagement: ID, expectedHead: { sequence: 4, fingerprint: entries[3].fingerprint } });
  assert.equal(result.intact, true, JSON.stringify(result.problems));
  assert.deepEqual(result.head, { sequence: 4, fingerprint: entries[3].fingerprint });
  assert.deepEqual(verifyLedger([], { engagement: ID }), { intact: true, entries: 0, head: null, first: null, problems: [] });
});

test('Verifica · expediente: localiza la primera entrada retocada, insertada, eliminada o reordenada', () => {
  const entries = chain(['2026-11-24T10:00:00Z', '2026-11-24T10:01:00Z', '2026-11-24T10:02:00Z', '2026-11-24T10:03:00Z']);
  const [a, b, c, d] = entries;

  const touched = { ...b, data: { ...b.data, role: 'previous' as const } };
  assert.deepEqual(codes([a, touched, c, d]), { first: [1, 'altered'], intact: false });
  const resealed = { ...touched, fingerprint: ledgerEntryFingerprint(touched) };
  assert.deepEqual(codes([a, resealed, c, d]), { first: [2, 'link'], intact: false }, 'rehacer su huella rompe el enlace siguiente');

  assert.deepEqual(codes([a, c, d]), { first: [1, 'missing'], intact: false });
  assert.deepEqual(codes([b, c, d]), { first: [0, 'missing'], intact: false });
  const forged = nextLedgerEntry(a, ID, '2026-11-24T10:00:30Z', { event: 'source-removed', data: { role: 'latest' }, refs: [] });
  assert.deepEqual(codes([a, forged, b, c, d]), { first: [2, 'out-of-order'], intact: false });
  assert.deepEqual(codes([a, c, b, d]), { first: [1, 'out-of-order'], intact: false });

  const other = chain(['2026-11-24T10:00:00Z']).map(e => {
    const moved = { ...e, engagement: '6f1c2a40-0000-4000-8000-000000000002' };
    return { ...moved, fingerprint: ledgerEntryFingerprint(moved) };
  });
  assert.deepEqual(codes(other), { first: [0, 'engagement'], intact: false });
  assert.deepEqual(codes([a, { ...b, format: 'verifica-expediente-v9' }, c]), { first: [1, 'format'], intact: false });
});

test('Verifica · expediente: una cola recortada solo se detecta con la cabeza registrada fuera', () => {
  const entries = chain(['2026-11-24T10:00:00Z', '2026-11-24T10:01:00Z', '2026-11-24T10:02:00Z']);
  const head = { sequence: 3, fingerprint: entries[2].fingerprint };
  assert.equal(codes(entries.slice(0, 2)).intact, true, 'internamente coherente');
  assert.deepEqual(codes(entries.slice(0, 2), head), { first: [2, 'truncated'], intact: false });
  const rebuilt = chain(['2026-11-24T10:00:00Z', '2026-11-24T10:01:00Z', '2026-11-24T10:02:30Z']);
  assert.deepEqual(codes(rebuilt, head), { first: [2, 'head'], intact: false }, 'una cadena rehecha entera no coincide con la cabeza');
});

test('Verifica · expediente: rechaza entradas mal formadas antes de encadenarlas', () => {
  const [a] = chain(['2026-11-24T10:00:00Z']);
  const bad = (input: Parameters<typeof nextLedgerEntry>[3], head: LedgerEntry | null = a, engagement = ID) => assert.throws(() => nextLedgerEntry(head, engagement, '2026-11-24T10:05:00Z', input), LedgerInputError);
  bad({ event: 'source-stored', refs: [{ kind: 'capture', method: 'sha256-bytes-v1', fingerprint: 'ABC' }] });
  bad({ event: 'source-stored', refs: [{ kind: 'capture', method: 'md5' as never, fingerprint: hex('x') }] });
  bad({ event: 'deleted-everything' as never, refs: [] });
  bad({ event: 'source-stored', data: { role: 'otra' as never }, refs: [] });
  bad({ event: 'source-stored', refs: [] }, a, '6f1c2a40-0000-4000-8000-000000000002');
});

async function rig() {
  const root = fs.mkdtempSync(path.resolve('tests/.tmp/verifica-expediente-'));
  const r = await createBaseApp({ root, dbPath: ':memory:', staticDir: root });
  let clock = Date.parse('2026-11-24T10:00:00.000Z');
  registerVerificaEngagements(r.app, r.store, { now: () => new Date(clock += 1000).toISOString() });
  return r;
}
type Rig = Awaited<ReturnType<typeof rig>>;
const call = async (r: Rig, method: 'GET' | 'POST' | 'PUT' | 'DELETE', url: string, payload?: Record<string, unknown>) => {
  const res = await r.app.inject(payload === undefined ? { method, url: '/api/verifica' + url } : { method, url: '/api/verifica' + url, payload });
  return { status: res.statusCode, body: res.body ? JSON.parse(res.body) : null };
};
const upload = (r: Rig, id: string, role: string, text: string, fileName: string) => call(r, 'PUT', '/engagements/' + id + '/sources/' + role, { text, fileName });

test('Verifica · expediente: fuentes y emisión quedan encadenadas con las huellas que cita el informe', async () => {
  const r = await rig(), files = exampleFiles(true);
  const { engagement: { id } } = (await call(r, 'POST', '/engagements', { name: 'Distribuidora del norte' })).body as EngagementView;
  const names = { previous: 'antes-confidencial.json', latest: 'ahora-confidencial.json', invoices: 'facturas-confidencial.csv', declarations: 'declaraciones-confidencial.json' };
  const texts = { previous: files.get('antes.json')!, latest: files.get('ahora.json')!, invoices: files.get('facturas.csv')!, declarations: files.get('declaraciones.json')! };
  for (const role of ['previous', 'latest', 'invoices'] as const) assert.equal((await upload(r, id, role, texts[role], names[role])).status, 200);
  assert.equal((await upload(r, id, 'declarations', '{"activeCustomers":300}', names.declarations)).status, 200);
  const view = (await upload(r, id, 'declarations', texts.declarations, names.declarations)).body as EngagementView;
  assert.equal((await call(r, 'DELETE', '/engagements/' + id + '/sources/invoices')).status, 200);
  assert.equal((await call(r, 'DELETE', '/engagements/' + id + '/sources/invoices')).status, 200, 'retirar lo que no está no añade nada');
  assert.equal((await upload(r, id, 'invoices', texts.invoices, names.invoices)).status, 200);
  const issued = await call(r, 'POST', '/engagements/' + id + '/clean-room');
  assert.equal(issued.status, 200, JSON.stringify(issued.body));

  const ledger = engagementLedger(r.store, id);
  assert.deepEqual(ledger.map(e => [e.event, e.data.role ?? null]), [
    ['source-stored', 'previous'], ['source-stored', 'latest'], ['source-stored', 'invoices'], ['source-stored', 'declarations'],
    ['source-stored', 'declarations'], ['source-removed', 'invoices'], ['source-stored', 'invoices'], ['report-issued', null],
  ]);
  assert.equal(verifyLedger(ledger, { engagement: id }).intact, true);
  assert.deepEqual(ledger[4].refs, [
    { kind: 'declarations', role: 'declarations', method: 'sha256-bytes-v1', fingerprint: sha256Hex(texts.declarations) },
    { kind: 'declarations', role: 'declarations', method: 'verifica-input-v1', fingerprint: (view.sources.declarations as { fingerprint: string }).fingerprint },
    { kind: 'declarations', role: 'declarations', method: 'sha256-bytes-v1', fingerprint: sha256Hex('{"activeCustomers":300}'), replaced: true },
  ]);
  assert.deepEqual(ledger[5].refs, [{ kind: 'invoices', role: 'invoices', method: 'sha256-bytes-v1', fingerprint: sha256Hex(texts.invoices), replaced: true }]);

  const report = JSON.parse((await r.app.inject({ method: 'GET', url: '/api/verifica/engagements/' + id + '/issue/report' })).body) as { fingerprint: string; sources: { role: string; fingerprint: string }[] };
  const issuedRefs = ledger[7].refs;
  assert.deepEqual(issuedRefs.filter(ref => ref.kind === 'report'), [{ kind: 'report', method: 'planb-verifica-report-v1', fingerprint: report.fingerprint }]);
  assert.deepEqual(issuedRefs.filter(ref => ref.kind === 'custody').map(ref => ref.fingerprint), [issued.body.custodyFingerprint]);
  for (const source of report.sources) {
    assert.ok(issuedRefs.some(ref => ref.role === source.role && ref.method === 'verifica-input-v1' && ref.fingerprint === source.fingerprint), 'la emisión cita la fuente ' + source.role);
  }
  const stored = JSON.stringify(ledger);
  for (const name of Object.values(names)) assert.ok(!stored.includes(name), 'sin nombres de archivo: ' + name);
  assert.ok(!stored.includes(issued.body.key), 'sin la llave de la copia');
});

test('Verifica · expediente: si no se puede escribir la entrada, tampoco se guarda la fuente', async () => {
  const r = await rig(), files = exampleFiles(true);
  const { engagement: { id } } = (await call(r, 'POST', '/engagements', { name: 'Distribuidora del norte' })).body as EngagementView;
  assert.equal((await upload(r, id, 'latest', files.get('ahora.json')!, 'ahora.json')).status, 200);
  const before = r.store.db.prepare("SELECT key, value FROM meta WHERE key LIKE 'verifica:%' ORDER BY key").all();
  r.store.db.exec(`CREATE TEMP TRIGGER stop_ledger BEFORE UPDATE ON meta
    WHEN NEW.key LIKE 'verifica:ledger:%' BEGIN SELECT RAISE(ABORT, 'fallo de guardado simulado'); END;`);
  assert.notEqual((await upload(r, id, 'previous', files.get('antes.json')!, 'antes.json')).status, 200);
  assert.notEqual((await call(r, 'DELETE', '/engagements/' + id + '/sources/latest')).status, 200);
  assert.deepEqual(r.store.db.prepare("SELECT key, value FROM meta WHERE key LIKE 'verifica:%' ORDER BY key").all(), before);
  r.store.db.exec('DROP TRIGGER stop_ledger');
  assert.equal((await upload(r, id, 'previous', files.get('antes.json')!, 'antes.json')).status, 200);
  const ledger = engagementLedger(r.store, id);
  assert.deepEqual(ledger.map(e => e.sequence), [1, 2]);
  assert.equal(verifyLedger(ledger, { engagement: id }).intact, true);
});
