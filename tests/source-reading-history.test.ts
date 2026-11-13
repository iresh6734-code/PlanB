import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { randomBytes, randomUUID } from 'node:crypto';
import { createBaseApp } from '../server/app.js';
import { makeFixture, makeDemoSpec } from '../shared/fixtures.js';
import { type SourceReading } from '../shared/source-reading.js';
import { sourceHistoryResponse, SOURCE_READING_HISTORY_PATH as PATH, type SourceHistoryBinding } from '../shared/source-reading-history.js';
import { registerSourceReadingHistory, type SourceHistoryOptions } from '../server/source-reading-history.js';
import { appendSourceReading, readSourceReadingJournal, SOURCE_READING_JOURNAL_KEY as KEY } from '../server/source-reading-journal.js';
import { workspaceSearchIdentity } from '../server/workspace-search.js';

process.env.NODE_ENV = 'test';
const NOW = Date.parse('2026-11-08T10:00:00Z'), headers = { host: '127.0.0.1' };
const selected: SourceHistoryBinding['source'] = { provider: 'zendesk-fixture', accountId: 'fixture-history-a', objectType: 'ticket', mode: 'listing', target: null };
type Fixture = Awaited<ReturnType<typeof fixture>>;
const all = (f: Pick<Fixture, 'store'>) => JSON.stringify(['meta', 'records', 'changes', 'captures', 'archives', 'usage'].map(table => [table, f.store.db.prepare('SELECT * FROM ' + table + ' ORDER BY rowid').all()]));
function activate(f: Pick<Fixture, 'store'>, fiction = true) {
  const snapshot = makeFixture('agency');
  if (!fiction) { snapshot.version = 3; snapshot.source = { kind: 'hubspot', accountId: 'fiction-policy-only', isTestData: false, environment: 'production', accountType: 'STANDARD', description: 'Datos ficticios usados para comprobar rechazo' }; }
  f.store.importSnapshot(snapshot, !!f.store.snapshot); f.store.saveGeneration(makeDemoSpec(snapshot), { provider: 'demo', model: null, generatedAt: new Date(NOW).toISOString(), prompt: '', approved: false }); f.store.activate();
}
async function fixture(t: TestContext, options: { file?: string; inactive?: boolean } = {}) {
  const f = await createBaseApp({ dbPath: options.file ?? ':memory:', root: '.', staticDir: 'none' }); t.after(() => f.app.close());
  if (!options.inactive && !f.store.ready) activate(f);
  let source = structuredClone(selected), scopeRevision = 'a'.repeat(64), override: SourceHistoryOptions['scopeForRequest'] | null = null;
  const binding = (): SourceHistoryBinding => ({ instanceId: workspaceSearchIdentity(f.store)!.instanceId, contextRevision: workspaceSearchIdentity(f.store)!.contextRevision, scopeRevision, source });
  const resolver: SourceHistoryOptions['scopeForRequest'] = request => override ? override(request) : binding();
  const registration = { scopeForRequest: resolver }; registerSourceReadingHistory(f.app, f.store, registration);
  const pin = () => workspaceSearchIdentity(f.store)?.contextRevision ?? '0'.repeat(64);
  const get = (extra: Record<string, string> = {}, cookie?: string) => {
    const query = new URLSearchParams({ contextRevision: pin(), provider: source.provider, accountId: source.accountId, objectType: source.objectType, mode: source.mode,
      ...(source.target ? { role: source.target.kind, remoteId: source.target.remoteId } : {}), ...extra });
    return f.app.inject({ url: PATH + '?' + query, headers: { ...headers, ...(cookie ? { cookie } : {}) } });
  };
  const establish = async (action: 'setup' | 'login' = 'setup') => {
    const r = await f.app.inject({ method: 'POST', url: '/api/v2/auth/' + action, headers, payload: { password: 'synthetic-history298-password' } }); assert.equal(r.statusCode, 200); return String(r.headers['set-cookie']).split(';')[0]!;
  };
  return { ...f, get, pin, binding, registration, establish,
    scope: (fn: SourceHistoryOptions['scopeForRequest'] | null) => { override = fn; },
    select: (next: SourceHistoryBinding['source']) => { source = structuredClone(next); },
    scopeRevision: (next: string) => { scopeRevision = next; } };
}
function reading(id = '22', source = selected): SourceReading {
  return { format: 'planb-source-reading-v1', ...source, startedAt: new Date(NOW - 1000).toISOString(), completedAt: new Date(NOW).toISOString(), coverage: 'complete', stoppedBy: null, pages: 1, requests: 1,
    records: [{ provider: source.provider, accountId: source.accountId, objectType: source.objectType, remoteId: source.target?.remoteId ?? id, kind: source.target?.kind ?? 'support', condition: 'blocked', updatedAt: null,
      label: 'private-synthetic-history298', externalRef: 'private-external298', related: [] }], skipped: { unknownValue: 0, malformed: 0, duplicates: 0 }, retryAfterSeconds: null };
}
function append(f: Pick<Fixture, 'store'>, input = reading()) {
  const journal = readSourceReadingJournal(f.store); assert.equal(journal.status, 'ready');
  const result = appendSourceReading(f.store, { expectedRevision: journal.status === 'ready' ? journal.revision : null, reading: input }, () => NOW + 5000);
  assert.equal(result.status, 'saved'); return result;
}
const response = (r: { statusCode: number; json: () => unknown }) => { assert.equal(r.statusCode, 200); return sourceHistoryResponse.parse(r.json()); };
function cursorWith(cursor: string, extra: Record<string, unknown>) { return Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')), ...extra })).toString('base64url'); }

test('GET de ausencia no inicializa el diario ni modifica CRM; vacío local no significa proveedor vacío', async t => {
  const f = await fixture(t), before = all(f), v = response(await f.get());
  assert.equal(v.storageOnly, true); assert.match(v.notice, /local de ensayo/); assert.deepEqual(v.entries, []); assert.equal(v.journalRevision, null); assert.equal(v.page.total, 0); assert.equal(all(f), before);
  assert.equal(f.store.db.prepare('SELECT value FROM meta WHERE key=?').get(KEY), undefined);
});

test('resumen exacto sin etiquetas, valores, referencia externa o textos de registros', async t => {
  const f = await fixture(t); append(f); const before = all(f), r = await f.get(), v = response(r);
  assert.equal(v.entries[0]!.storedRecords, 1); assert.equal(v.entries[0]!.completedAt, new Date(NOW).toISOString()); assert.equal(v.entries[0]!.savedAt, new Date(NOW + 5000).toISOString());
  for (const privateText of ['private-synthetic-history298', 'private-external298', 'externalRef', 'related', 'updatedAt', 'connected', 'provider-observed']) assert.ok(!r.body.includes(privateText), privateText);
  assert.deepEqual(Object.keys(v.entries[0]!).sort(), ['sequence', 'receiptId', 'readingDigest', 'savedAt', 'startedAt', 'completedAt', 'coverage', 'stoppedBy', 'storedRecords', 'pages', 'requests', 'skipped', 'retryAfterSeconds'].sort()); assert.equal(all(f), before);
});

test('lectura fallida conserva causa y recuento null; parcial conserva su cobertura y omitidos', async t => {
  const f = await fixture(t), unavailable: SourceReading = { ...reading(), records: [], coverage: 'unavailable', stoppedBy: 'unauthorized', requests: 0, pages: 0 };
  append(f, unavailable); append(f, { ...reading(), coverage: 'partial', stoppedBy: 'page-budget', skipped: { unknownValue: 1, malformed: 0, duplicates: 0 } });
  const v = response(await f.get()); assert.deepEqual(v.entries.map(e => [e.coverage, e.storedRecords, e.stoppedBy]), [['unavailable', null, 'unauthorized'], ['partial', 1, 'page-budget']]);
});

test('la query no autoriza otra cuenta, proveedor, objeto o modo aunque haya lecturas guardadas allí', async t => {
  const f = await fixture(t); append(f); append(f, reading('22', { ...selected, accountId: 'fixture-history-b' })); const before = all(f);
  const filters: Record<string, string>[] = [{ accountId: 'fixture-history-b' }, { provider: 'pipedrive-fixture' }, { objectType: 'deal' }, { mode: 'lookup', role: 'support', remoteId: '22' }];
  for (const extra of filters) {
    const r = await f.get(extra); assert.equal(r.statusCode, 403); assert.equal(r.json().details.code, 'SOURCE_HISTORY_SCOPE'); assert.ok(!r.body.includes('entries') && !r.body.includes('journalRevision'));
  }
  assert.equal(response(await f.get()).page.total, 1); assert.equal(all(f), before);
});

test('el anfitrión fija el objetivo exacto de lookup; no se mezclan listing ni otros IDs', async t => {
  const f = await fixture(t), lookup = { ...selected, mode: 'lookup' as const, target: { kind: 'support' as const, remoteId: '22' } };
  append(f); append(f, reading('22', lookup)); append(f, reading('23', { ...lookup, target: { ...lookup.target, remoteId: '23' } })); f.select(lookup);
  const v = response(await f.get()); assert.equal(v.entries.length, 1); assert.deepEqual(v.source.target, lookup.target); assert.equal((await f.get({ remoteId: '23' })).statusCode, 403);
});

test('paginación conserva orden y revisión, con cursor ligado a fuente y tamaño de página', async t => {
  const f = await fixture(t); for (const id of ['22', '23', '24']) append(f, reading(id)); const before = all(f);
  const one = response(await f.get({ limit: '1' })), two = response(await f.get({ limit: '1', cursor: one.page.nextCursor! })), three = response(await f.get({ limit: '1', cursor: two.page.nextCursor! }));
  assert.deepEqual([one, two, three].map(v => v.entries[0]!.sequence), [1, 2, 3]); assert.equal(three.page.nextCursor, null); assert.equal(one.journalRevision, three.journalRevision); assert.equal(all(f), before);
});

test('cambiar el head entre páginas invalida el cursor en lugar de mezclar cortes', async t => {
  const f = await fixture(t); append(f); append(f, reading('23')); const one = response(await f.get({ limit: '1' })); append(f, reading('24'));
  const r = await f.get({ limit: '1', cursor: one.page.nextCursor! }); assert.equal(r.statusCode, 409); assert.ok(!r.body.includes('entries'));
});

test('cursor de otra instancia, contexto, filtro, ámbito o tamaño no continúa', async t => {
  const f = await fixture(t); append(f); append(f, reading('23')); const cursor = response(await f.get({ limit: '1' })).page.nextCursor!;
  for (const extra of [{ instanceId: randomUUID() }, { contextRevision: 'b'.repeat(64) }, { filterRevision: 'c'.repeat(64) }, { scopeRevision: 'd'.repeat(64) }, { limit: 2 }]) assert.equal((await f.get({ limit: '1', cursor: cursorWith(cursor, extra) })).statusCode, 409);
  assert.equal((await f.get({ limit: '1', cursor: cursorWith(cursor, { offset: 30 }) })).statusCode, 422);
  f.scopeRevision('e'.repeat(64)); assert.equal((await f.get({ limit: '1', cursor })).statusCode, 409);
});

test('query inválida y cursor ilegible se rechazan sin ampliar ámbito ni crear estado', async t => {
  const f = await fixture(t), before = all(f);
  const invalid: Record<string, string>[] = [{ limit: '0' }, { limit: '26' }, { limit: '2.2' }, { provider: 'zendesk' }, { accountId: 'real-company' }, { cursor: 'not-json' }, { role: 'support' }, { unexpected: 'yes' }];
  for (const extra of invalid) assert.equal((await f.get(extra)).statusCode, 422);
  assert.equal(all(f), before);
});

test('ámbito nulo deniega; callback fallido o incompatible no publica cuenta ni historial', async t => {
  const f = await fixture(t); append(f); const before = all(f);
  f.scope(() => null); assert.equal((await f.get()).statusCode, 403);
  f.scope(() => { throw Error('private-binding-failure298'); }); let r = await f.get(); assert.equal(r.statusCode, 503); assert.ok(!r.body.includes('private-binding') && !r.body.includes('entries'));
  f.scope((() => ({ invalid: true })) as unknown as SourceHistoryOptions['scopeForRequest']); r = await f.get(); assert.equal(r.statusCode, 503); assert.equal(all(f), before);
});

test('binding asíncrono rechazado no deja rechazo de promesa sin atender', async t => {
  const f = await fixture(t), errors: unknown[] = [], listener = (error: unknown) => errors.push(error); process.on('unhandledRejection', listener);
  try { f.scope((() => Promise.reject(Error('private-async298'))) as unknown as SourceHistoryOptions['scopeForRequest']); const r = await f.get(); assert.equal(r.statusCode, 503); await new Promise(resolve => setImmediate(resolve)); assert.deepEqual(errors, []); assert.ok(!r.body.includes('private-async')); } finally { process.off('unhandledRejection', listener); }
});

test('corrupción no se convierte en historial vacío ni se repara al consultar', async t => {
  const f = await fixture(t); f.store.set(KEY, null); const before = all(f), r = await f.get(); assert.equal(r.statusCode, 503); assert.ok(!r.body.includes('entries') && !r.body.includes('total')); assert.equal(all(f), before);
});

test('fallo de soporte conserva diagnóstico fijo sin filtrar el error privado', async t => {
  const f = await fixture(t); append(f); const decode = f.store.decode.bind(f.store);
  f.store.decode = <T,>(value: string): T => { if (value.includes('planb-source-reading-journal-v1')) throw Error('private-storage298'); return decode<T>(value); };
  try { const r = await f.get(); assert.equal(r.statusCode, 503); assert.ok(!r.body.includes('private-storage298')); } finally { f.store.decode = decode; }
});

test('cambio de contexto completo en resolver impide devolver el corte anterior', async t => {
  const f = await fixture(t); append(f); let calls = 0;
  f.scope(() => { const b = f.binding(); if (++calls === 2) f.store.set('sessionId', randomUUID()); return b; });
  const r = await f.get(); assert.equal(r.statusCode, 409); assert.ok(!r.body.includes('entries'));
});

test('cambio de ámbito entre lectura y publicación no devuelve la lista anterior', async t => {
  const f = await fixture(t); append(f); let calls = 0; f.scope(() => ({ ...f.binding(), scopeRevision: ++calls === 1 ? 'a'.repeat(64) : 'b'.repeat(64) }));
  const r = await f.get(); assert.equal(r.statusCode, 409); assert.ok(!r.body.includes('entries'));
});

test('cambio de head dentro del resolver final invalida el resultado ya proyectado', async t => {
  const f = await fixture(t); append(f); let calls = 0; f.scope(() => { if (++calls === 2) append(f, reading('23')); return f.binding(); });
  const r = await f.get(); assert.equal(r.statusCode, 409); assert.ok(!r.body.includes('entries'));
});

test('GET protegido exige sesión y no renueva su caducidad', async t => {
  let now = NOW; t.mock.method(Date, 'now', () => now); const f = await fixture(t); append(f); const cookie = await f.establish();
  assert.equal((await f.get()).statusCode, 401); now += 29 * 60000; const r = await f.get({}, cookie); assert.equal(r.statusCode, 200); assert.equal(r.headers['set-cookie'], undefined); now += 2 * 60000; assert.equal((await f.get({}, cookie)).statusCode, 401);
});

test('perder autorización durante el resolver no publica metadatos de lectura', async t => {
  const f = await fixture(t); append(f); const cookie = await f.establish(); let calls = 0;
  f.scope(() => { const b = f.binding(); if (++calls === 2) f.store.set('password', null); return b; }); const r = await f.get({}, cookie); assert.equal(r.statusCode, 401); assert.ok(!r.body.includes('entries') && !r.body.includes('journalRevision'));
});

test('autorización perdida al validar el objeto del ámbito también precede al error de esquema o getter', async t => {
  for (const throwing of [false, true]) {
    const f = await fixture(t); append(f); const cookie = await f.establish();
    f.scope(() => ({ ...f.binding(), get scopeRevision() { f.store.set('password', null); if (throwing) throw Error('private-scope-getter298'); return 'invalid'; } }));
    const r = await f.get({}, cookie); assert.equal(r.statusCode, 401); assert.ok(!r.body.includes('entries') && !r.body.includes('private-scope-getter'));
  }
});

test('fallo de soporte que revoca autorización devuelve401 antes del diagnóstico503', async t => {
  const f = await fixture(t); append(f); const cookie = await f.establish(), decode = f.store.decode.bind(f.store);
  f.store.decode = <T,>(value: string): T => { if (value.includes('planb-source-reading-journal-v1')) { f.store.set('password', null); throw Error('private-revocation298'); } return decode<T>(value); };
  try { const r = await f.get({}, cookie); assert.equal(r.statusCode, 401); assert.ok(!r.body.includes('entries') && !r.body.includes('private-revocation')); } finally { f.store.decode = decode; }
});

test('copia inactiva o marcada real no consulta el ámbito de fuentes de ensayo', async t => {
  const f = await fixture(t, { inactive: true }); let calls = 0; f.scope(() => { calls++; return null; }); assert.equal((await f.get()).statusCode, 409); activate(f, false); assert.equal((await f.get()).statusCode, 403); assert.equal(calls, 0);
});

test('solo GET, sin HEAD automático ni escritor; caché deshabilitada también en errores', async t => {
  const f = await fixture(t), before = all(f); const r = await f.get(); assert.equal(r.headers['cache-control'], 'no-store'); assert.equal(r.headers.pragma, 'no-cache'); assert.match(String(r.headers.vary), /cookie/i);
  for (const method of ['POST', 'PATCH', 'DELETE', 'HEAD'] as const) assert.equal((await f.app.inject({ method, url: PATH, headers })).statusCode, 404);
  const bad = await f.get({ cursor: 'invalid' }); assert.equal(bad.statusCode, 422); assert.equal(bad.headers['cache-control'], 'no-store'); assert.equal(all(f), before);
});

test('registro repetido mismo binding es inocuo; otro binding no sustituye permisos', async t => {
  const f = await fixture(t); registerSourceReadingHistory(f.app, f.store, f.registration); assert.throws(() => registerSourceReadingHistory(f.app, f.store, { scopeForRequest: () => null }), /another binding/); assert.equal((await f.get()).statusCode, 200);
});

test('archivo reiniciado conserva recibos y tiempos, y GET no cambia su fila cifrada', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'source-history298-')); fs.writeFileSync(path.join(root, '.planb-key'), JSON.stringify({ kind: 'test', data: randomBytes(32).toString('base64') }), { flag: 'wx' }); const file = path.join(root, 'data.sqlite');
  let app = await createBaseApp({ dbPath: file, root, staticDir: 'none' }); activate(app); append(app); const initial = readSourceReadingJournal(app.store); assert.equal(initial.status, 'ready'); await app.app.close();
  app = await createBaseApp({ dbPath: file, root, staticDir: 'none' }); const identity = workspaceSearchIdentity(app.store)!;
  registerSourceReadingHistory(app.app, app.store, { scopeForRequest: () => ({ instanceId: identity.instanceId, contextRevision: identity.contextRevision, scopeRevision: 'a'.repeat(64), source: selected }) });
  try { const before = all(app), query = new URLSearchParams({ contextRevision: identity.contextRevision, provider: selected.provider, accountId: selected.accountId, objectType: selected.objectType, mode: 'listing' }); const r = await app.app.inject({ url: PATH + '?' + query, headers }); const v = response(r); assert.equal(v.journalRevision, initial.status === 'ready' ? initial.revision : null); assert.equal(v.provenance, 'durable'); assert.equal(v.entries[0]!.completedAt, new Date(NOW).toISOString()); assert.equal(all(app), before); } finally { await app.app.close(); }
});
