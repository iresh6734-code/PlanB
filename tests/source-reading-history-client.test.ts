import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createBaseApp } from '../server/app.js';
import { makeFixture, makeDemoSpec } from '../shared/fixtures.js';
import { type SourceReading } from '../shared/source-reading.js';
import { SOURCE_READING_HISTORY_NOTICE, SOURCE_READING_HISTORY_PATH, type SourceHistoryBinding, type SourceHistoryResponse } from '../shared/source-reading-history.js';
import { registerSourceReadingHistory } from '../server/source-reading-history.js';
import { appendSourceReading, readSourceReadingJournal, SOURCE_READING_JOURNAL_KEY } from '../server/source-reading-journal.js';
import { workspaceSearchIdentity } from '../server/workspace-search.js';
import { evidenceKinds } from '../shared/source-status.js';
import { EVIDENCE_TEXT, FAILURE_TEXT, answersRequest, entryFacts, headlineOf, historyIdentityKey, historyUrl, loadSourceHistory, type HistoryEntry, type HistorySource } from '../src/source-reading-history-client.js';

process.env.NODE_ENV = 'test';
// Cliente del historial (consumidor de la API 298). Las lecturas usan el GET REAL (createBaseApp + diario 297 + registerSourceReadingHistory con un ámbito ficticio inyectado) a través de un
// adaptador `fetch` sobre `app.inject`; los casos que el servidor no puede producir (respuesta de otra fuente, transporte que ignora la señal) usan un `fetch` sintético, con la etiqueta de sintético.
const NOW = Date.parse('2026-11-09T10:00:00Z'), headers = { host: '127.0.0.1' };
const selected: HistorySource = { provider: 'zendesk-fixture', accountId: 'fixture-client-a', objectType: 'ticket', mode: 'listing', target: null };
const PRIVATE = ['private-label-client', 'private-external-client', 'externalRef', 'related'];
function reading(source: HistorySource = selected, overrides: Partial<SourceReading> = {}, id = '31'): SourceReading {
  return { format: 'planb-source-reading-v1', ...source, startedAt: new Date(NOW - 1000).toISOString(), completedAt: new Date(NOW).toISOString(), coverage: 'complete', stoppedBy: null, pages: 1, requests: 1,
    records: [{ provider: source.provider, accountId: source.accountId, objectType: source.objectType, remoteId: source.target?.remoteId ?? id, kind: source.target?.kind ?? 'support', condition: 'blocked', updatedAt: null,
      label: PRIVATE[0]!, externalRef: PRIVATE[1]!, related: [] }], skipped: { unknownValue: 0, malformed: 0, duplicates: 0 }, retryAfterSeconds: null, ...overrides };
}
async function rig(t: TestContext) {
  const f = await createBaseApp({ dbPath: ':memory:', root: '.', staticDir: 'none' }); t.after(() => f.app.close());
  const snapshot = makeFixture('agency'); f.store.importSnapshot(snapshot, false); f.store.saveGeneration(makeDemoSpec(snapshot), { provider: 'demo', model: null, generatedAt: new Date(NOW).toISOString(), prompt: '', approved: false }); f.store.activate();
  let source = structuredClone(selected), scopeRevision = 'a'.repeat(64);
  const identity = () => workspaceSearchIdentity(f.store)!;
  registerSourceReadingHistory(f.app, f.store, { scopeForRequest: () => ({ instanceId: identity().instanceId, contextRevision: identity().contextRevision, scopeRevision, source } satisfies SourceHistoryBinding) });
  const fetcher = (cookie?: string): typeof fetch => async input => {
    const r = await f.app.inject({ url: String(input), headers: { ...headers, ...(cookie ? { cookie } : {}) } });
    return new Response(r.body, { status: r.statusCode, headers: { 'content-type': 'application/json' } });
  };
  const append = (input: SourceReading = reading(), at = NOW + 5000) => {
    const journal = readSourceReadingJournal(f.store); assert.equal(journal.status, 'ready');
    const result = appendSourceReading(f.store, { expectedRevision: journal.status === 'ready' ? journal.revision : null, reading: input }, () => at); assert.equal(result.status, 'saved'); return result;
  };
  return { ...f, identity, fetcher, append, pin: () => identity().contextRevision, setSource: (next: HistorySource) => { source = next; }, setScope: (next: string) => { scopeRevision = next; } };
}
type Rig = Awaited<ReturnType<typeof rig>>;
const read = async (r: Rig, extra: Partial<Parameters<typeof loadSourceHistory>[0]> = {}) => loadSourceHistory({ source: selected, contextRevision: r.pin(), fetcher: r.fetcher(), ...extra });

test('la consulta lleva EXACTAMENTE la fuente y el pin del anfitrión; un ámbito inválido no envía nada', () => {
  const pin = 'b'.repeat(64), url = historyUrl(selected, pin, 10, null)!, params = new URL(url, 'http://x').searchParams;
  assert.ok(url.startsWith(SOURCE_READING_HISTORY_PATH + '?'));
  assert.deepEqual([...params.keys()].sort(), ['accountId', 'contextRevision', 'limit', 'mode', 'objectType', 'provider']);
  const lookup: HistorySource = { ...selected, mode: 'lookup', target: { kind: 'support', remoteId: '31' } }, lp = new URL(historyUrl(lookup, pin, 5, 'abc_-')!, 'http://x').searchParams;
  assert.deepEqual([...lp.keys()].sort(), ['accountId', 'contextRevision', 'cursor', 'limit', 'mode', 'objectType', 'provider', 'remoteId', 'role']);
  assert.equal(historyUrl({ ...lookup, target: null }, pin, 5, null), null);                       // lookup sin objetivo
  assert.equal(historyUrl(selected, 'corto', 10, null), null);                                      // pin inválido
  assert.equal(historyUrl({ ...selected, provider: 'zendesk' }, pin, 10, null), null);              // proveedor que no es de ensayo
  assert.equal(historyUrl({ ...selected, accountId: 'cuenta-real' }, pin, 10, null), null);         // cuenta que no es ficticia
  assert.equal(historyUrl(selected, pin, 99, null), null);                                          // página mayor que el contrato
});

test('GET real: vacío local, un recibo y fallo sin datos conservan lo que dice el servidor; nunca etiquetas ni referencias', async t => {
  const r = await rig(t);
  const empty = await read(r); assert.equal(empty.kind, 'read'); if (empty.kind === 'read') { assert.deepEqual(empty.response.entries, []); assert.equal(empty.response.page.total, 0); assert.equal(empty.response.journalRevision, null); assert.equal(empty.response.notice, SOURCE_READING_HISTORY_NOTICE); }
  r.append(); r.append(reading(selected, { coverage: 'unavailable', stoppedBy: 'forbidden', records: [], pages: 0, requests: 1 }));
  const full = await read(r); assert.equal(full.kind, 'read'); if (full.kind !== 'read') return;
  assert.deepEqual(full.response.entries.map(e => [e.sequence, e.coverage, e.storedRecords, e.stoppedBy]), [[1, 'complete', 1, null], [2, 'unavailable', null, 'forbidden']]);
  assert.equal(full.response.provenance, 'memory-only');
  assert.ok(!JSON.stringify(full.response).includes('private'), 'la respuesta no lleva etiquetas');
  const facts = full.response.entries.map(entryFacts); assert.equal(facts[1]!.records, 'Recuento desconocido (no es cero)'); assert.equal(facts[1]!.evidenceKind, 'error-response'); assert.equal(facts[0]!.evidenceKind, 'data');
  for (const f of facts) for (const text of Object.values(f)) for (const secret of PRIVATE) assert.ok(!String(text).includes(secret));
});

test('dos páginas del GET real; el cursor viejo se invalida con un recibo nuevo, con otro ámbito o con otro pin', async t => {
  const r = await rig(t); for (let n = 0; n < 12; n++) r.append(reading(selected, {}, String(100 + n)), NOW + 5000 + n);
  const one = await read(r, { limit: 5 }); assert.equal(one.kind, 'read'); if (one.kind !== 'read') return;
  assert.equal(one.response.entries.length, 5); assert.equal(one.response.page.total, 12); assert.ok(one.response.page.nextCursor);
  const two = await read(r, { limit: 5, cursor: one.response.page.nextCursor }); assert.equal(two.kind, 'read'); if (two.kind !== 'read') return;
  assert.deepEqual(two.response.entries.map(e => e.sequence), [6, 7, 8, 9, 10]); assert.equal(two.response.journalRevision, one.response.journalRevision);
  // un recibo nuevo cambia el corte: el cursor anterior ya no sirve (409)
  r.append(reading(selected, {}, '900'), NOW + 9000); assert.equal((await read(r, { limit: 5, cursor: two.response.page.nextCursor })).kind, 'changed');
  // otro ámbito del anfitrión (scopeRevision) con un cursor de antes → 409
  const fresh = await read(r, { limit: 5 }); assert.equal(fresh.kind, 'read'); if (fresh.kind !== 'read') return;
  r.setScope('c'.repeat(64)); assert.equal((await read(r, { limit: 5, cursor: fresh.response.page.nextCursor })).kind, 'changed'); r.setScope('a'.repeat(64));
  // un cursor manipulado → 422
  assert.equal((await read(r, { limit: 5, cursor: 'AAAA' })).kind, 'bad-cursor');
  // otro tamaño de página con el cursor de antes → 409 (el servidor liga el cursor al tamaño)
  assert.equal((await read(r, { limit: 6, cursor: fresh.response.page.nextCursor })).kind, 'changed');
  // otro pin de copia → 409
  assert.equal((await read(r, { limit: 5, contextRevision: 'd'.repeat(64) })).kind, 'changed');
});

test('estados del servidor real: bloqueado 401, fuera de ámbito 403, historial no disponible 503 y ruta no registrada 404', async t => {
  const r = await rig(t); r.append();
  r.setSource({ ...selected, accountId: 'fixture-client-b' });                                      // el anfitrión autoriza OTRA cuenta; la pantalla pide la suya → 403
  const scope = await read(r); assert.equal(scope.kind, 'out-of-scope'); assert.ok(!JSON.stringify(scope).includes('entries')); r.setSource(selected);
  r.store.db.prepare('INSERT OR REPLACE INTO meta(key,value) VALUES(?,?)').run(SOURCE_READING_JOURNAL_KEY, 'no es un diario');
  assert.equal((await read(r)).kind, 'unavailable');
  const bare = await createBaseApp({ dbPath: ':memory:', root: '.', staticDir: 'none' }); t.after(() => bare.app.close());
  assert.equal((await loadSourceHistory({ source: selected, contextRevision: 'e'.repeat(64), fetcher: async input => { const x = await bare.app.inject({ url: String(input), headers }); return new Response(x.body, { status: x.statusCode }); } })).kind, 'not-registered');
  const locked = await rig(t); const set = await locked.app.inject({ method: 'POST', url: '/api/v2/auth/setup', headers, payload: { password: 'synthetic-client-password' } }); const cookie = String(set.headers['set-cookie']).split(';')[0]!;
  assert.equal((await read(locked, { fetcher: locked.fetcher(cookie) })).kind, 'read');
  assert.equal((await read(locked)).kind, 'locked');                                                  // sin la cookie de sesión
});

function synthetic(body: unknown, status = 200, extra: Record<string, string> = {}): typeof fetch { return async () => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...extra } }); }
const goodResponse = (overrides: Record<string, unknown> = {}, pin = 'f'.repeat(64)): SourceHistoryResponse => ({ format: 'planb-source-reading-history-v1', storageOnly: true, notice: SOURCE_READING_HISTORY_NOTICE, instanceId: randomUUID(),
  contextRevision: pin, scopeRevision: 'a'.repeat(64), source: selected, journalRevision: '1'.repeat(64), provenance: 'durable',
  entries: [{ sequence: 1, receiptId: '2'.repeat(64), readingDigest: '3'.repeat(64), savedAt: new Date(NOW).toISOString(), startedAt: new Date(NOW - 1000).toISOString(), completedAt: new Date(NOW).toISOString(), coverage: 'complete', stoppedBy: null, storedRecords: 1, pages: 1, requests: 1, skipped: { unknownValue: 0, malformed: 0, duplicates: 0 }, retryAfterSeconds: null }],
  page: { offset: 0, limit: 10, total: 1, nextCursor: null }, ...overrides }) as SourceHistoryResponse;

test('SINTÉTICO: una respuesta bien formada pero que NO corresponde a lo pedido no se publica', async () => {
  const pin = 'f'.repeat(64), ask = (body: unknown) => loadSourceHistory({ source: selected, contextRevision: pin, fetcher: synthetic(body) });
  assert.equal((await ask(goodResponse())).kind, 'read');
  assert.equal((await ask(goodResponse({ contextRevision: '9'.repeat(64) }))).kind, 'invalid', 'otra copia');
  assert.equal((await ask(goodResponse({ source: { ...selected, accountId: 'fixture-client-b' } }))).kind, 'invalid', 'otra cuenta');
  assert.equal((await ask(goodResponse({ source: { ...selected, objectType: 'user' } }))).kind, 'invalid', 'otro objeto');
  assert.equal((await ask(goodResponse({ source: { ...selected, mode: 'lookup', target: { kind: 'support', remoteId: '1' } } }))).kind, 'invalid', 'otro modo');
  assert.equal((await ask(goodResponse({ page: { offset: 0, limit: 25, total: 1, nextCursor: null } }))).kind, 'invalid', 'otro tamaño de página');
  assert.equal((await ask(goodResponse({ page: { offset: 3, limit: 10, total: 4, nextCursor: null } }))).kind, 'invalid', 'desplazamiento sin cursor');
  assert.equal((await ask(goodResponse({ page: { offset: 0, limit: 10, total: 1, nextCursor: 'abc' } }))).kind, 'invalid', 'cursor con nada más que leer');
  assert.equal((await ask(goodResponse({ page: { offset: 0, limit: 10, total: 9, nextCursor: null } }))).kind, 'invalid', 'faltan recibos y no hay cursor');
  assert.equal((await ask(goodResponse({ journalRevision: null }))).kind, 'invalid', 'diario sin historia con recibos');
  const e = goodResponse().entries[0]!; assert.equal((await ask(goodResponse({ entries: [e, { ...e, sequence: 1 }], page: { offset: 0, limit: 10, total: 2, nextCursor: null } }))).kind, 'invalid', 'orden roto');
  assert.equal((await ask(goodResponse({ entries: [{ ...e, coverage: 'unavailable' }] }))).kind, 'invalid', 'fallo sin datos con recuento (esquema del contrato)');
  assert.equal((await ask(goodResponse({ extra: 1 }))).kind, 'invalid', 'campo no previsto');
  assert.equal((await ask('{no es json')).kind, 'invalid');
  assert.equal((await loadSourceHistory({ source: selected, contextRevision: pin, fetcher: synthetic(goodResponse(), 200, { 'content-length': String(10 * 1024 * 1024) }) })).kind, 'failed', 'cuerpo declarado demasiado grande');
  assert.equal((await loadSourceHistory({ source: selected, contextRevision: pin, fetcher: async () => new Response(new ReadableStream({ start(c) { c.enqueue(new Uint8Array(200 * 1024)); c.close(); } }), { status: 200 }) })).kind, 'failed', 'cuerpo real demasiado grande');
  // errores del anfitrión sin código del contrato no se confunden con los estados del historial
  for (const status of [403, 409, 422, 503]) assert.equal((await loadSourceHistory({ source: selected, contextRevision: pin, fetcher: synthetic({ error: 'x' }, status) })).kind, 'failed', 'sin código: ' + status);
  assert.equal((await loadSourceHistory({ source: selected, contextRevision: pin, fetcher: synthetic({ details: { code: 'SOURCE_HISTORY_SCOPE' } }, 409) })).kind, 'failed', 'código de otro estado');
  assert.equal((await loadSourceHistory({ source: selected, contextRevision: pin, fetcher: synthetic({}, 500) })).kind, 'failed');
  assert.equal((await loadSourceHistory({ source: selected, contextRevision: pin, fetcher: async () => { throw new TypeError('red'); } })).kind, 'failed');
  let calls = 0; assert.equal((await loadSourceHistory({ source: { ...selected, provider: 'zendesk' }, contextRevision: pin, fetcher: async () => { calls++; return new Response('{}'); } })).kind, 'invalid'); assert.equal(calls, 0, 'un ámbito inválido no sale a la red');
});

test('SINTÉTICO: cancelación — una respuesta tardía tras abortar nunca se devuelve, aunque el transporte ignore la señal', async () => {
  const pin = 'f'.repeat(64), aborted = (promise: Promise<unknown>) => assert.rejects(promise, (error: unknown) => error instanceof DOMException && error.name === 'AbortError');
  // ya cancelada: no se entra en el transporte
  const pre = new AbortController(); pre.abort(); let calls = 0;
  await aborted(loadSourceHistory({ source: selected, contextRevision: pin, signal: pre.signal, fetcher: async () => { calls++; return new Response('{}'); } })); assert.equal(calls, 0);
  // se cancela durante la espera de la respuesta y el transporte la ignora: llega un 200 válido DESPUÉS
  const late = new AbortController(); let release!: (response: Response) => void;
  const slow = loadSourceHistory({ source: selected, contextRevision: pin, signal: late.signal, fetcher: () => new Promise<Response>(resolve => { release = resolve; }) });
  late.abort(); release(new Response(JSON.stringify(goodResponse()), { status: 200 })); await aborted(slow);
  // una categoría del transporte tardía (401) tampoco se devuelve
  const late401 = new AbortController(); let release2!: (response: Response) => void;
  const slow401 = loadSourceHistory({ source: selected, contextRevision: pin, signal: late401.signal, fetcher: () => new Promise<Response>(resolve => { release2 = resolve; }) });
  late401.abort(); release2(new Response('{}', { status: 401 })); await aborted(slow401);
  // se cancela a mitad del cuerpo: el flujo se cancela y no se devuelve nada
  const mid = new AbortController(); let cancelledStream = false, push!: (chunk: Uint8Array) => void;
  const body = new ReadableStream<Uint8Array>({ start(c) { push = chunk => c.enqueue(chunk); }, cancel() { cancelledStream = true; } });
  const streaming = loadSourceHistory({ source: selected, contextRevision: pin, signal: mid.signal, fetcher: async () => new Response(body, { status: 200 }) });
  await new Promise(resolve => setTimeout(resolve, 5)); push(new TextEncoder().encode('{"format"')); mid.abort(); await aborted(streaming); assert.equal(cancelledStream, true);
  // cancelación durante el cuerpo de un error con código: tampoco devuelve una categoría
  const err = new AbortController(); let pushErr!: (chunk: Uint8Array) => void; const errBody = new ReadableStream<Uint8Array>({ start(c) { pushErr = chunk => c.enqueue(chunk); } });
  const failing = loadSourceHistory({ source: selected, contextRevision: pin, signal: err.signal, fetcher: async () => new Response(errBody, { status: 409 }) });
  await new Promise(resolve => setTimeout(resolve, 5)); pushErr(new TextEncoder().encode('{"details"')); err.abort(); await aborted(failing);
});

test('presentación pura: último guardado y observación más reciente son cosas distintas; solo se afirman con el historial completo', () => {
  const base = goodResponse().entries[0]! as HistoryEntry, at = (offset: number) => new Date(NOW + offset).toISOString();
  const entries: HistoryEntry[] = [{ ...base, sequence: 1, completedAt: at(0), savedAt: at(10) }, { ...base, sequence: 2, completedAt: at(-5000), savedAt: at(20) }];
  const same = headlineOf([entries[0]!], true); assert.equal(same.sameEntry, true); assert.equal(same.lastSaved?.sequence, 1);
  const split = headlineOf(entries, true); assert.equal(split.lastSaved?.sequence, 2); assert.equal(split.latestObserved?.sequence, 1); assert.equal(split.sameEntry, false);
  assert.deepEqual(headlineOf(entries, false), { lastSaved: null, latestObserved: null, sameEntry: false, complete: false });
  assert.equal(headlineOf([], true).lastSaved, null);
  for (const [kind, text] of Object.entries(FAILURE_TEXT)) { assert.ok(!/conectar\b|conectado\b(?!:)/i.test(text.head + text.detail), kind); assert.ok(!/proveedor vac[ií]o|sin registros/i.test(text.head + text.detail), kind); }
  for (const kind of ['unavailable', 'invalid', 'failed'] as const) assert.match(FAILURE_TEXT[kind].detail, /no es cero/);
  assert.equal(answersRequest(goodResponse(), { source: selected, contextRevision: 'f'.repeat(64), limit: 10, cursor: null }), true);
});

test('R2 · EVIDENCIA POR CAUSA (SourceStatus R3): cada categoría tiene su texto; una interrupción por plazo o cancelación no niega que llegara respuesta; el fallo de red sí dice que falló antes; cero peticiones, error de la fuente y respuesta inutilizable conservan los suyos', () => {
  assert.deepEqual(Object.keys(EVIDENCE_TEXT).sort(), [...evidenceKinds].sort(), 'el cliente tiene texto para TODAS las evidencias de SourceStatus (si el módulo añade una, esta prueba y el tipo fallan)');
  const base = goodResponse().entries[0]! as HistoryEntry, failed = (stoppedBy: HistoryEntry['stoppedBy'], requests: number): HistoryEntry => ({ ...base, coverage: 'unavailable', storedRecords: null, pages: 0, requests, stoppedBy });
  const text = (stop: HistoryEntry['stoppedBy'], requests = 1) => entryFacts(failed(stop, requests));
  for (const stop of ['timeout', 'aborted'] as const) { const f = text(stop); assert.equal(f.evidenceKind, 'interrupted', stop); assert.match(f.evidence, /se interrumpió .* no se sabe si la fuente llegó a responder/, stop); assert.doesNotMatch(f.evidence, /no llegó respuesta|falló la red/i, stop); assert.equal(f.records, 'Recuento desconocido (no es cero)', stop); assert.ok(f.cause, stop); }
  const network = text('network'); assert.equal(network.evidenceKind, 'no-response'); assert.match(network.evidence, /falló la red antes de recibir respuesta/); assert.doesNotMatch(network.evidence, /interrump/i);
  assert.equal(text('timeout', 0).evidenceKind, 'not-sent'); assert.equal(text('forbidden').evidenceKind, 'error-response'); assert.equal(text('truncated').evidenceKind, 'unusable-response'); assert.equal(entryFacts(base).evidenceKind, 'data');
  assert.equal(new Set(Object.values(EVIDENCE_TEXT)).size, evidenceKinds.length, 'ningún texto se repite entre categorías');
});

test('R2 · IDENTIDAD INEQUÍVOCA: la clave que compone el montador no puede confundir dos contextos distintos aunque un valor lleve separadores', () => {
  const parts = { session: 's1', instance: 'i', context: 'c', capture: 'k', provider: 'zendesk-fixture', account: 'fixture-a', object: 'ticket', mode: 'listing', target: '' };
  const key = historyIdentityKey(parts); assert.equal(key, historyIdentityKey({ ...parts })); assert.equal(JSON.parse(key).length, 9);
  for (const [field, value] of Object.entries({ session: 's2', instance: 'j', context: 'd', capture: 'l', provider: 'pipedrive-fixture', account: 'fixture-b', object: 'deal', mode: 'lookup', target: '1' })) assert.notEqual(historyIdentityKey({ ...parts, [field]: value }), key, field);
  // un separador dentro de un valor no desplaza el reparto (con un join('|') estos pares colisionarían)
  assert.notEqual(historyIdentityKey({ ...parts, session: 'a|b', instance: 'c' }), historyIdentityKey({ ...parts, session: 'a', instance: 'b|c' }));
  assert.notEqual(historyIdentityKey({ ...parts, session: 'a"', instance: ',"c' }), historyIdentityKey({ ...parts, session: 'a', instance: '",c' }));
});
