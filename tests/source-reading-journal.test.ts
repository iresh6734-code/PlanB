import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { randomBytes, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { Store } from '../server/store.js';
import { sourceReading, type SourceReading } from '../shared/source-reading.js';
import { makeFixture } from '../shared/fixtures.js';
import { appendSourceReading, readSourceReadingJournal, SOURCE_READING_JOURNAL_KEY as KEY, SOURCE_READING_JOURNAL_LIMITS as LIMITS, type SourceReadingAppend, type SourceReadingJournal } from '../server/source-reading-journal.js';

process.env.NODE_ENV = 'test';
const NOW = Date.parse('2026-11-08T10:00:00.000Z');
const ready = (value: SourceReadingJournal) => { assert.equal(value.status, 'ready'); return value as Extract<SourceReadingJournal, { status: 'ready' }>; };
const saved = (value: SourceReadingAppend) => { assert.equal(value.status, 'saved', JSON.stringify(value)); return value as Extract<SourceReadingAppend, { status: 'saved' }>; };
const memory = () => { const store = new Store(':memory:'); store.set('instanceId', randomUUID()); return store; };
const row = (store: Store) => (store.db.prepare('SELECT value FROM meta WHERE key=?').get(KEY) as { value: string } | undefined)?.value;
const all = (store: Store) => JSON.stringify(['meta', 'records', 'changes', 'captures', 'archives', 'usage'].map(table => [table, store.db.prepare('SELECT * FROM ' + table + ' ORDER BY rowid').all()]));
function reading(id = '22', accountId = 'fixture-source-a', completedAt = NOW): SourceReading {
  return sourceReading.parse({ format: 'planb-source-reading-v1', provider: 'zendesk-fixture', accountId, objectType: 'ticket', mode: 'listing', target: null,
    startedAt: new Date(completedAt - 1000).toISOString(), completedAt: new Date(completedAt).toISOString(), coverage: 'complete', stoppedBy: null, pages: 1, requests: 1,
    records: [{ provider: 'zendesk-fixture', accountId, objectType: 'ticket', remoteId: id, kind: 'support', condition: 'blocked', updatedAt: null, label: 'SYNTHETIC-JOURNAL-297', externalRef: null, related: [] }],
    skipped: { unknownValue: 0, malformed: 0, duplicates: 0 }, retryAfterSeconds: null });
}
function folder() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'planb-source-journal297-'));
  fs.writeFileSync(path.join(dir, '.planb-key'), JSON.stringify({ kind: 'test', data: randomBytes(32).toString('base64') }), { flag: 'wx', mode: 0o600 });
  return dir;
}

test('ausencia: leer no crea un diario ni cambia tablas; identidad ausente se distingue de historial vacío', () => {
  const store = memory(); try {
    const before = all(store); assert.deepEqual(ready(readSourceReadingJournal(store)).entries, []); assert.equal(ready(readSourceReadingJournal(store)).revision, null); assert.equal(all(store), before);
    store.db.prepare('DELETE FROM meta WHERE key=?').run('instanceId'); const missing = all(store);
    assert.deepEqual(readSourceReadingJournal(store), { status: 'unavailable', reason: 'missing-identity' });
    assert.deepEqual(appendSourceReading(store, { expectedRevision: null, reading: reading() }), { status: 'unavailable', reason: 'missing-identity' }); assert.equal(all(store), missing);
  } finally { store.close(); }
});

test('alta y replay exacto conservan recibo y fechas, incluso tras avanzar el head; no se consulta el reloj en replay', () => {
  const store = memory(); try {
    const input = reading(), a = saved(appendSourceReading(store, { expectedRevision: null, reading: input }, () => NOW));
    assert.equal(a.created, true); assert.equal(a.provenance, 'memory-only'); assert.deepEqual(a.receipt.reading, input);
    input.records[0]!.label = 'mutación del objeto original'; a.receipt.reading.records[0]!.label = 'mutación del recibo recibido';
    assert.equal(ready(readSourceReadingJournal(store)).entries[0]!.reading.records[0]!.label, 'SYNTHETIC-JOURNAL-297');
    const b = saved(appendSourceReading(store, { expectedRevision: a.revision, reading: reading('23') }, () => NOW + 1000));
    const before = all(store), replay = saved(appendSourceReading(store, { expectedRevision: null, reading: reading() }, () => { throw Error('no clock for replay'); }));
    assert.equal(replay.created, false); assert.equal(replay.receipt.receiptId, a.receipt.receiptId); assert.equal(replay.receipt.savedAt, new Date(NOW).toISOString()); assert.equal(replay.revision, b.revision); assert.equal(all(store), before);
  } finally { store.close(); }
});

test('parcial y no disponible se conservan con su causa, objetivo y fechas; no se convierten en lecturas completas vacías', () => {
  const store = memory(); try {
    const partial = { ...reading(), coverage: 'partial', stoppedBy: 'page-budget' };
    const a = saved(appendSourceReading(store, { expectedRevision: null, reading: partial }, () => NOW));
    const unavailable = { ...reading(), mode: 'lookup', target: { kind: 'support', remoteId: '99' }, records: [], coverage: 'unavailable', stoppedBy: 'unauthorized', pages: 0, requests: 0 };
    saved(appendSourceReading(store, { expectedRevision: a.revision, reading: unavailable }, () => NOW + 1000));
    const entries = ready(readSourceReadingJournal(store)).entries;
    assert.deepEqual(entries.map(e => [e.reading.coverage, e.reading.stoppedBy, e.reading.requests]), [['partial', 'page-budget', 1], ['unavailable', 'unauthorized', 0]]);
    assert.deepEqual(entries[1]!.reading.target, { kind: 'support', remoteId: '99' }); assert.equal(entries[1]!.reading.completedAt, new Date(NOW).toISOString());
  } finally { store.close(); }
});

test('cuenta, proveedor, objeto y lookup exactos permanecen separados aunque compartan el ID remoto', () => {
  const store = memory(); try {
    const one = reading(), two = reading('22', 'fixture-source-b'), three = reading(); three.provider = 'another-fixture'; three.records[0]!.provider = three.provider;
    const lookup = { ...reading(), mode: 'lookup', target: { kind: 'support', remoteId: '22' } };
    let revision: string | null = null;
    for (const input of [one, two, three, lookup]) revision = saved(appendSourceReading(store, { expectedRevision: revision, reading: input }, () => NOW)).revision;
    const entries = ready(readSourceReadingJournal(store)).entries; assert.equal(entries.length, 4); assert.equal(new Set(entries.map(e => e.readingDigest)).size, 4); assert.deepEqual(entries.map(e => e.sequence), [1, 2, 3, 4]);
  } finally { store.close(); }
});

test('guardar lecturas solo modifica su clave meta; registros, capturas, cambios y otros metadatos CRM permanecen iguales', () => {
  const store = memory(); try {
    store.importSnapshot(makeFixture('agency')); store.set('unrelated297', { note: 'fiction-only' });
    const exceptJournal = () => JSON.stringify((JSON.parse(all(store)) as [string, Record<string, unknown>[]][]).map(([table, rows]) => [table, table === 'meta' ? rows.filter(value => value.key !== KEY) : rows]));
    const before = exceptJournal(); assert.ok(store.records().length > 0);
    saved(appendSourceReading(store, { expectedRevision: null, reading: reading() }, () => NOW)); assert.equal(exceptJournal(), before);
    const after = all(store); readSourceReadingJournal(store); assert.equal(all(store), after);
  } finally { store.close(); }
});

test('dos conexiones SQLite: el escritor con head antiguo obtiene conflicto y no sobrescribe otra lectura', () => {
  const filename = path.join(folder(), 'journal.sqlite'), a = new Store(filename); a.set('instanceId', randomUUID()); const b = new Store(filename);
  try {
    assert.equal(ready(readSourceReadingJournal(a)).revision, null); assert.equal(ready(readSourceReadingJournal(b)).revision, null);
    const first = saved(appendSourceReading(a, { expectedRevision: null, reading: reading() }, () => NOW)); const before = row(a);
    assert.deepEqual(appendSourceReading(b, { expectedRevision: null, reading: reading('23') }, () => NOW), { status: 'rejected', reason: 'revision-conflict' }); assert.equal(row(a), before);
    saved(appendSourceReading(b, { expectedRevision: first.revision, reading: reading('23') }, () => NOW)); assert.equal(ready(readSourceReadingJournal(a)).entries.length, 2);
  } finally { a.close(); b.close(); }
});

test('archivo cifrado y otro proceso conservan recibos, orden y fechas sin renovar la observación', () => {
  const dir = folder(), filename = path.join(dir, 'journal.sqlite'); let store = new Store(filename); store.set('instanceId', randomUUID());
  const first = saved(appendSourceReading(store, { expectedRevision: null, reading: reading() }, () => NOW)); assert.equal(first.provenance, 'durable'); assert.match(row(store)!, /^enc1:/); store.close();
  assert.equal(fs.readFileSync(filename).includes(Buffer.from('SYNTHETIC-JOURNAL-297')), false);
  const worker = path.join(dir, 'read.mts');
  fs.writeFileSync(worker, `import {Store} from ${JSON.stringify(pathToFileURL(path.resolve('server/store.ts')).href)};import{readSourceReadingJournal}from ${JSON.stringify(pathToFileURL(path.resolve('server/source-reading-journal.ts')).href)};const s=new Store(${JSON.stringify(filename)});try{const r=readSourceReadingJournal(s);if(r.status!=='ready')throw Error('not ready');console.log(JSON.stringify({revision:r.revision,entries:r.entries,provenance:r.provenance}));}finally{s.close();}`);
  const env = { ...Object.fromEntries(Object.entries(process.env).filter(([k]) => ['path', 'systemroot', 'windir', 'comspec', 'pathext', 'temp', 'tmp', 'tmpdir', 'tsx_tsconfig_path'].includes(k.toLowerCase()))), NODE_ENV: 'test' };
  const child = spawnSync(process.execPath, ['--require', path.resolve('scripts/block-external.cjs'), '--import', 'tsx', worker], { cwd: process.cwd(), env, windowsHide: true, encoding: 'utf8', timeout: 30000 });
  assert.equal(child.status, 0, child.stderr); const result = JSON.parse(child.stdout); assert.equal(result.revision, first.revision); assert.equal(result.provenance, 'durable'); assert.deepEqual(result.entries, [first.receipt]);
  store = new Store(filename); try { const before = row(store); assert.equal(ready(readSourceReadingJournal(store)).revision, first.revision); assert.equal(row(store), before); } finally { store.close(); }
});

test('corrupción semántica se conserva y bloquea lectura/alta sin reparaciones ni llamadas de reloj', () => {
  const store = memory(); try {
    const a = saved(appendSourceReading(store, { expectedRevision: null, reading: reading() }, () => NOW)); saved(appendSourceReading(store, { expectedRevision: a.revision, reading: reading('23') }, () => NOW));
    const original = store.get<any>(KEY, null), clone = () => structuredClone(original);
    const bad: unknown[] = [null, [], { ...original, format: 'future-v9' }, { ...original, instanceId: randomUUID() }, { ...original, extra: true }];
    for (const field of ['sequence', 'previousReceipt', 'readingDigest', 'receiptId', 'savedAt']) { const value = clone(); value.entries[1][field] = field === 'sequence' ? 1 : field === 'savedAt' ? '2026-02-30T00:00:00Z' : '0'.repeat(64); bad.push(value); }
    const changed = clone(); changed.entries[0].reading.records[0].condition = 'completed'; bad.push(changed);
    const repeated = clone(); repeated.entries.push(repeated.entries[0]); bad.push(repeated);
    for (const value of bad) {
      store.set(KEY, value); const before = all(store);
      assert.deepEqual(readSourceReadingJournal(store), { status: 'unavailable', reason: 'invalid-journal' });
      assert.deepEqual(appendSourceReading(store, { expectedRevision: a.revision, reading: reading('24') }, () => { throw Error('clock must not run'); }), { status: 'unavailable', reason: 'invalid-journal' }); assert.equal(all(store), before);
    }
  } finally { store.close(); }
});

test('cifrado roto o fila plaintext nueva no se adoptan ni se reparan', () => {
  const filename = path.join(folder(), 'journal.sqlite'), store = new Store(filename); store.set('instanceId', randomUUID());
  try {
    saved(appendSourceReading(store, { expectedRevision: null, reading: reading() }, () => NOW)); const plain = JSON.stringify(store.get(KEY, null));
    for (const bad of ['enc1:' + Buffer.alloc(50).toString('base64'), plain]) { store.db.prepare('UPDATE meta SET value=? WHERE key=?').run(bad, KEY); const before = row(store); assert.deepEqual(readSourceReadingJournal(store), { status: 'unavailable', reason: 'invalid-journal' }); assert.equal(row(store), before); }
  } finally { store.close(); }
});

test('fallo tras set revierte la transacción y nunca devuelve un recibo de éxito', () => {
  const store = memory(), set = store.set.bind(store); try {
    const before = all(store); store.set = (key, value) => { set(key, value); if (key === KEY) throw Error('synthetic-private-set-failure'); };
    const result = appendSourceReading(store, { expectedRevision: null, reading: reading() }, () => NOW); assert.deepEqual(result, { status: 'unavailable', reason: 'write-uncertain' }); assert.equal(all(store), before); assert.ok(!JSON.stringify(result).includes('synthetic-private'));
  } finally { store.set = set; store.close(); }
});

test('acuse perdido después de COMMIT queda incierto y el replay recupera el recibo original sin escribir', () => {
  const store = memory(), transaction = store.transaction.bind(store); try {
    store.transaction = (<T,>(fn: () => T): T => { transaction(fn); throw Error('synthetic-private-after-commit'); });
    assert.deepEqual(appendSourceReading(store, { expectedRevision: null, reading: reading() }, () => NOW), { status: 'unavailable', reason: 'write-uncertain' });
    const persisted = ready(readSourceReadingJournal(store)); assert.equal(persisted.entries.length, 1); const before = all(store); store.transaction = transaction;
    const replay = saved(appendSourceReading(store, { expectedRevision: null, reading: reading() }, () => NOW + 60000)); assert.equal(replay.created, false); assert.equal(replay.receipt.receiptId, persisted.revision); assert.equal(all(store), before);
  } finally { store.transaction = transaction; store.close(); }
});

test('sin relectura verificable tras set no se publica éxito', () => {
  const store = memory(), set = store.set.bind(store); try {
    store.set = (key, value) => { if (key !== KEY) set(key, value); };
    assert.deepEqual(appendSourceReading(store, { expectedRevision: null, reading: reading() }, () => NOW), { status: 'unavailable', reason: 'write-uncertain' }); assert.equal(row(store), undefined);
  } finally { store.set = set; store.close(); }
});

test('reloj inválido/regresivo y lectura futura rechazan el alta sin rejuvenecer datos', () => {
  const store = memory(); try {
    const before = all(store); for (const value of [NaN, Infinity, -1, 0, 1.5, 8.64e15 + 1]) { assert.deepEqual(appendSourceReading(store, { expectedRevision: null, reading: reading() }, () => value), { status: 'rejected', reason: 'invalid-clock' }); assert.equal(all(store), before); }
    assert.deepEqual(appendSourceReading(store, { expectedRevision: null, reading: reading() }, () => NOW - 1), { status: 'rejected', reason: 'reading-from-future' });
    const a = saved(appendSourceReading(store, { expectedRevision: null, reading: reading() }, () => NOW + 1000)), after = all(store);
    assert.deepEqual(appendSourceReading(store, { expectedRevision: a.revision, reading: reading('23') }, () => NOW), { status: 'rejected', reason: 'clock-regressed' }); assert.equal(all(store), after);
  } finally { store.close(); }
});

test('cambio reentrante de identidad durante clock no deja recibo asociado a otra instalación', () => {
  const store = memory(); try {
    const before = all(store); assert.deepEqual(appendSourceReading(store, { expectedRevision: null, reading: reading() }, () => { store.set('instanceId', randomUUID()); return NOW; }), { status: 'rejected', reason: 'context-changed' }); assert.equal(all(store), before);
  } finally { store.close(); }
});

test('límite de recibos rechaza sin pruning y permite releer/repetir evidencia existente', () => {
  const store = memory(); try {
    let revision: string | null = null; for (let i = 0; i < LIMITS.entries; i++) revision = saved(appendSourceReading(store, { expectedRevision: revision, reading: reading(String(i + 1)) }, () => NOW)).revision;
    const before = all(store); assert.deepEqual(appendSourceReading(store, { expectedRevision: revision, reading: reading('999') }, () => NOW), { status: 'rejected', reason: 'journal-full' }); assert.equal(all(store), before);
    assert.equal(saved(appendSourceReading(store, { expectedRevision: null, reading: reading('1') }, () => NOW + 60000)).created, false); assert.equal(all(store), before);
  } finally { store.close(); }
});

function large(n: number, account = 'fixture-bytes'): SourceReading {
  const value = reading('1', account); const model = value.records[0]!;
  value.records = Array.from({ length: n }, (_, i) => ({ ...model, remoteId: String(i + 1), label: '漢'.repeat(160), externalRef: 'x'.repeat(120), related: Array.from({ length: 6 }, () => ({ objectType: 'organization', remoteId: 'r'.repeat(160) })) })); return sourceReading.parse(value);
}
test('límites de bytes por lectura y conjunto son rechazos completos, nunca truncamientos silenciosos', () => {
  const store = memory(); try {
    const tooBig = large(500); assert.ok(Buffer.byteLength(JSON.stringify(tooBig)) > LIMITS.readingBytes); const before = all(store);
    assert.deepEqual(appendSourceReading(store, { expectedRevision: null, reading: tooBig }, () => NOW), { status: 'rejected', reason: 'reading-too-large' }); assert.equal(all(store), before);
    let revision: string | null = null, rejected = false;
    for (let i = 0; i < 12; i++) {
      const input = large(200, 'fixture-bytes-' + i); assert.ok(Buffer.byteLength(JSON.stringify(input)) < LIMITS.readingBytes); const previous = all(store), result = appendSourceReading(store, { expectedRevision: revision, reading: input }, () => NOW);
      if (result.status === 'rejected') { assert.equal(result.reason, 'journal-too-large'); assert.equal(all(store), previous); rejected = true; break; } revision = saved(result).revision;
    }
    assert.equal(rejected, true); const journal = ready(readSourceReadingJournal(store)); assert.ok(journal.entries.length < LIMITS.entries); assert.ok(journal.entries.every(entry => entry.reading.records.length === 200));
  } finally { store.close(); }
});

test('guardar una lectura antigua después de otra nueva conserva ambos tiempos y orden de persistencia', () => {
  const store = memory(); try {
    const a = saved(appendSourceReading(store, { expectedRevision: null, reading: reading('22') }, () => NOW));
    saved(appendSourceReading(store, { expectedRevision: a.revision, reading: reading('22', 'fixture-source-a', NOW - 86400000) }, () => NOW + 1000));
    const entries = ready(readSourceReadingJournal(store)).entries; assert.equal(entries[1]!.reading.completedAt, new Date(NOW - 86400000).toISOString()); assert.equal(entries[1]!.savedAt, new Date(NOW + 1000).toISOString());
  } finally { store.close(); }
});

test('entrada o revisión inválidas no escriben ni filtran contenido del error', () => {
  const store = memory(); try { const before = all(store); assert.deepEqual(appendSourceReading(store, { expectedRevision: 'bad', reading: reading() }), { status: 'rejected', reason: 'invalid-revision' }); const bad = { ...reading(), credential: 'private-synthetic297' }; const result = appendSourceReading(store, { expectedRevision: null, reading: bad }); assert.deepEqual(result, { status: 'rejected', reason: 'invalid-reading' }); assert.ok(!JSON.stringify(result).includes('private-synthetic297')); assert.equal(all(store), before); } finally { store.close(); }
});
