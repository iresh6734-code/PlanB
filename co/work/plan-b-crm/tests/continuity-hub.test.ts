import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { cancelRelay, loadReadCheck, loadRelay, readCheckMessage, relayMessage, startReadCheck, startRelay } from '../src/continuity-hub-client.js';
import { READ_CHECK_ROUTE } from '../shared/hubspot-read-check-api.js';
import { RELAY_REHEARSAL_ROUTE, recordFromRehearsal } from '../shared/relay-rehearsal.js';

// Unidad 217. Clientes same-origin de las APIs 212 y 216 con un fetch SUSTITUIDO: parsers estrictos, 401 = bloqueada, límites, cancelación y ausencia de detalles del servidor.
const NOW = Date.parse('2026-11-05T12:00:00.000Z');
const readState = (over: Record<string, unknown> = {}) => ({ format: 'planb-hubspot-read-check-api-v1', configured: true, portal: { id: '12345', mode: 'rehearsal' }, consent: { reads: 5, writes: 0, freshnessMinutes: 15, allowed: true, reason: null }, running: null,
  view: { state: 'saved_unchecked', fresh: false, label: 'Configuración guardada · acceso sin comprobar', detail: 'x', environment: 'unknown', checkedAt: null }, evidence: null, invalidated: null, issue: null, message: null, ...over });
const relayState = (over: Record<string, unknown> = {}) => ({ format: 'planb-relay-rehearsal-api-v1', last: null, running: null, scope: { fiction: true, exportsActiveSpace: false, notProven: ['Traslado a otro ordenador'] }, issue: null, message: null, ...over });
const reply = (body: unknown, status = 200, extra: Record<string, string> = {}) => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...extra } });
const spy = (response: () => Response) => { const calls: { url: string; method: string; body: string | null }[] = []; const fetcher = (async (input: string, init?: RequestInit) => { calls.push({ url: String(input), method: init?.method ?? 'GET', body: typeof init?.body === 'string' ? init.body : null }); return response(); }) as unknown as typeof fetch; return { calls, fetcher }; };

test('GET: lee solo lo guardado (una petición, sin reintento), con el estado validado por su contrato', async () => {
  const a = spy(() => reply(readState())), r = await loadReadCheck({ fetcher: a.fetcher, now: () => new Date(NOW).toISOString() });
  assert.equal(r.status, 'read'); assert.deepEqual(a.calls.map(c => c.method + ' ' + c.url), ['GET ' + READ_CHECK_ROUTE]);
  const b = spy(() => reply(relayState())), q = await loadRelay({ fetcher: b.fetcher }); assert.equal(q.status, 'read'); assert.deepEqual(b.calls.map(c => c.method + ' ' + c.url), ['GET ' + RELAY_REHEARSAL_ROUTE]);
});

test('401 = bloqueada; respuestas que no cumplen el contrato, con campos de más, de tamaño excesivo o inválidas = «no disponible» (nunca éxito); sin reintento', async () => {
  const locked = await loadReadCheck({ fetcher: spy(() => reply({ error: 'detalle-secreto' }, 401)).fetcher }); assert.deepEqual([locked.status, locked.status === 'unavailable' ? locked.reason : ''], ['unavailable', 'locked']);
  for (const [name, response] of [['campo de más', () => reply({ ...readState(), token: 'x' })], ['formato ajeno', () => reply({ ok: true })], ['no JSON', () => reply('<html>')], ['500', () => reply(readState(), 500)], ['enorme', () => reply('x'.repeat(200_000))], ['declarado enorme', () => reply(readState(), 200, { 'content-length': '999999' })]] as const) {
    const s = spy(response), r = await loadReadCheck({ fetcher: s.fetcher }); assert.equal(r.status, 'unavailable', name); assert.equal(r.status === 'unavailable' && r.reason, 'failed', name); assert.equal(s.calls.length, 1, name + ': sin reintento');
  }
  const throwing = await loadRelay({ fetcher: (async () => { throw new Error('ECONNRESET con secreto'); }) as unknown as typeof fetch }); assert.equal(throwing.status, 'unavailable'); assert.ok(!JSON.stringify(throwing).includes('secreto'));
});

test('POST explícitos: cuerpo exacto (portal + cinco lecturas / ficción), estado devuelto con su incidencia y mensajes propios; 401 = bloqueada; cancelación propaga AbortError', async () => {
  const a = spy(() => reply(readState({ issue: 'ALREADY_RUNNING', started: false }), 202)), r = await startReadCheck('12345', { fetcher: a.fetcher });
  assert.deepEqual(a.calls.map(c => [c.method, c.url, JSON.parse(c.body!)]), [['POST', READ_CHECK_ROUTE, { portalId: '12345', authorizedReads: 5 }]]); assert.equal(r.kind, 'state'); if (r.kind === 'state') { assert.equal(r.code, 202); assert.match(readCheckMessage(r.state)!, /ya hay una comprobación en curso/i); }
  const b = spy(() => reply(relayState({ last: recordFromRehearsal({ now: NOW - 1000, result: { ok: true, wrongIdRejected: true, createCalls: 1, duplicates: 0, records: 1, finalStage: 'return-verified', capsule: { bytes: 10, sha256: 'a'.repeat(64) }, ms: { export: 1, import: 1 } } }) }))), q = await startRelay({ fetcher: b.fetcher });
  assert.deepEqual(b.calls.map(c => [c.method, c.url, JSON.parse(c.body!)]), [['POST', RELAY_REHEARSAL_ROUTE, { fiction: true }]]); assert.equal(q.kind, 'state'); if (q.kind === 'state') { assert.equal(q.state.last!.outcome, 'completed'); assert.equal(relayMessage(q.state), null); }
  assert.deepEqual(await startReadCheck('12345', { fetcher: spy(() => reply({ error: 'x' }, 401)).fetcher }), { kind: 'locked' }); assert.deepEqual(await startRelay({ fetcher: spy(() => reply({ error: 'x' }, 401)).fetcher }), { kind: 'locked' });
  const abort = new AbortController(); abort.abort(); await assert.rejects(loadReadCheck({ signal: abort.signal, fetcher: (async () => { throw new DOMException('x', 'AbortError'); }) as unknown as typeof fetch }), /cancelada/i);
});


test('DELETE explícito del ensayo: método y ruta exactos, sin cuerpo; 401 = bloqueada; la respuesta se valida por contrato', async () => {
  const a = spy(() => reply(relayState({ stopping: { since: new Date(NOW).toISOString(), reason: 'cancelled' } }), 200)), r = await cancelRelay({ fetcher: a.fetcher });
  assert.deepEqual(a.calls.map(c => [c.method, c.url, c.body]), [['DELETE', RELAY_REHEARSAL_ROUTE, null]]); assert.equal(r.kind, 'state'); if (r.kind === 'state') assert.equal(r.state.stopping!.reason, 'cancelled');
  assert.deepEqual(await cancelRelay({ fetcher: spy(() => reply({ error: 'x' }, 401)).fetcher }), { kind: 'locked' }); assert.deepEqual(await cancelRelay({ fetcher: spy(() => reply({ ok: true })).fetcher }), { kind: 'failed' });
});

test('contrato estático del consumidor (R2): abrir solo hace GET; NO hay consentimiento de lectura propio (Abrir Integraciones navega); cada fuente se publica por separado y con generación; el reloj local no pide nada', () => {
  const hub = fs.readFileSync('src/ContinuityHub.tsx', 'utf8'), client = fs.readFileSync('src/continuity-hub-client.ts', 'utf8'), code = hub.replace(/\/\/.*$/gm, '');
  assert.match(hub, /void load\(true\)/); const load = hub.slice(hub.indexOf('const load = useCallback'), hub.indexOf('useEffect(() => { alive.current = true'));
  assert.ok(load.length > 200 && !/startRelay|cancelRelay|startReadCheck/.test(load), 'la carga inicial no inicia ensayos ni comprobaciones'); assert.ok(!/Promise\.all\(/.test(load), 'ninguna fuente espera a otra: no hay Promise.all');
  for (const key of ["publish('copy'", "publish('hubspot'", "publish('relay'"]) assert.ok(load.includes(key), key + ' se publica por separado'); assert.match(load, /generation\.current === mine/);
  assert.ok(!/startReadCheck|confirm-read|Confirmar y comprobar|readCheckMessage/.test(code), 'el hub no ofrece un segundo consentimiento de lectura: eso es del panel de Integraciones'); assert.match(hub, /navigate\?\.\[action\]/);
  assert.ok(hub.includes('async function runRelay()') && hub.includes('async function runCancel()')); assert.match(hub, /Confirmar y ensayar/); assert.match(hub, /No exporta tu copia activa/);
  const clock = hub.slice(hub.indexOf('// Reloj local'), hub.indexOf('/** Relee SOLO el ensayo')); assert.ok(clock.length > 100 && !/fetch|load\(|loadReadCheck|startRelay/.test(clock), 'recalcular la vigencia no hace peticiones');
  for (const text of [code, client]) assert.ok(!/localStorage|sessionStorage|indexedDB|document\.cookie|Authorization|token/i.test(text.replace(/\/\/.*$/gm, '')), 'sin almacenamiento ni credenciales');
});
