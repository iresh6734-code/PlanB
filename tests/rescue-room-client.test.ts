import test from 'node:test';
import assert from 'node:assert/strict';
import { RescueApiError, RescueClient, contextKey, envelopeFor, newIntentKey, type RoomView } from '../src/rescue-room-client.js';
import { newRoom, viewOf } from './helpers/rescue-room-harness.js';
// Cliente de Modo Rescate: JSON acotado, errores que no se disfrazan de éxito, lecturas obsoletas y respuestas de otro contexto.
// R2 (F4): el cliente valida el contrato COMPLETO; el fixture es la vista real de una sala (JSON), no una forma mínima inventada.
const base = (() => { const room = newRoom(); const v = JSON.parse(JSON.stringify(viewOf(room))); room.close(); return v as Record<string, any>; })(); // eslint-disable-line @typescript-eslint/no-explicit-any
const ctx = { workspaceId: base.context.workspaceId, captureRevision: base.context.captureRevision };
const view = (over: Record<string, unknown> = {}): Record<string, any> => ({ ...base, version: 3, ...over }); // eslint-disable-line @typescript-eslint/no-explicit-any
const okAck = (result: Record<string, unknown>, over: Record<string, unknown> = {}) => ({ ok: true, outcome: 'saved', replayed: false, version: 2, result, ...over });
const reply = (body: unknown, init: { status?: number; type?: string; headers?: Record<string, string> } = {}) => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status: init.status ?? 200, headers: { 'content-type': init.type ?? 'application/json; charset=utf-8', ...(init.headers ?? {}) } });
const client = (fn: (url: string, init: RequestInit) => Promise<Response>) => new RescueClient('/api/rescue', ((url: string, init: RequestInit) => fn(String(url), init)) as typeof fetch);
const defer = () => { let resolve!: (r: Response) => void; const promise = new Promise<Response>(r => { resolve = r; }); return { promise, resolve }; };

test('un estado válido se acepta; una forma inesperada no se interpreta como estado', async () => {
  assert.equal(((await client(async () => reply(view())).state()) as RoomView).version, 3);
  await assert.rejects(client(async () => reply({ blocked: false })).state(), (e: RescueApiError) => e.code === 'BAD_FORMAT');
  await assert.rejects(client(async () => reply({ blocked: false, roomId: 'x', version: 'tres', stage: 's', context: {} })).state(), (e: RescueApiError) => e.code === 'BAD_FORMAT');
  // F4: plausible pero INCOMPLETO (sin capture/queue/journal...) ya no se acepta; tampoco versiones no enteras/negativas ni colecciones de otro tipo.
  const { capture: _c, ...withoutCapture } = view(); await assert.rejects(client(async () => reply(withoutCapture)).state(), (e: RescueApiError) => e.code === 'BAD_FORMAT' && /capture/.test(e.message));
  const { queue: _q, journal: _j, ...partial } = view(); await assert.rejects(client(async () => reply({ ...partial, blocked: false, roomId: 'x', version: 2, stage: 's', context: base.context })).state(), (e: RescueApiError) => e.code === 'BAD_FORMAT');
  for (const bad of [{ version: 0 }, { version: -3 }, { version: 2.5 }, { queue: { ...(view().queue as object), items: 'no' } }, { journal: { total: 1, events: [{}] } }, { crm: { online: 'si' } }, { plan: 'x' }]) await assert.rejects(client(async () => reply(view(bad))).state(), (e: RescueApiError) => e.code === 'BAD_FORMAT', JSON.stringify(bad).slice(0, 50));
  assert.equal(((await client(async () => reply(view())).state()) as RoomView).queue.items.length, (base.queue as { items: unknown[] }).items.length, 'la vista completa real sí se acepta');
});

test('formato inválido: no JSON, JSON roto y tamaño excesivo se rechazan sin parecer éxito', async () => {
  await assert.rejects(client(async () => reply('<html>ok</html>', { type: 'text/html' })).state(), (e: RescueApiError) => e.code === 'BAD_FORMAT');
  await assert.rejects(client(async () => reply('{roto', { status: 200 })).state(), (e: RescueApiError) => e.code === 'BAD_JSON');
  await assert.rejects(client(async () => reply(view(), { headers: { 'content-length': '5000000' } })).state(), (e: RescueApiError) => e.code === 'TOO_LARGE');
  await assert.rejects(client(async () => reply(JSON.stringify({ x: 'y'.repeat(2_100_000) }))).state(), (e: RescueApiError) => e.code === 'TOO_LARGE');
  // F4: la cota es de BYTES reales, no de unidades UTF-16: 700.000 caracteres de 3 bytes (>2 MB) sin Content-Length se rechazan.
  await assert.rejects(client(async () => reply(JSON.stringify({ x: '€'.repeat(700_000) }))).state(), (e: RescueApiError) => e.code === 'TOO_LARGE', 'multibyte');
  // Y se corta la lectura: un flujo que no termina se cancela al superar el límite, sin acumularlo entero.
  let emitted = 0, cancelled = false; const infinite = new ReadableStream<Uint8Array>({ pull(c) { emitted += 100_000; c.enqueue(new Uint8Array(100_000).fill(97)); }, cancel() { cancelled = true; } });
  await assert.rejects(client(async () => new Response(infinite, { headers: { 'content-type': 'application/json' } })).state(), (e: RescueApiError) => e.code === 'TOO_LARGE'); assert.equal(cancelled, true, 'el flujo se canceló'); assert.ok(emitted < 10_000_000, 'no se leyó sin límite: ' + emitted);
});

test('errores de servidor y de red llevan su causa; una mutación sin acuse válido no se da por guardada', async () => {
  await assert.rejects(client(async () => reply({ error: 'Plan caducado', code: 'PLAN_STALE' }, { status: 409 })).mutate('apply', {}), (e: RescueApiError) => e.status === 409 && e.isConflict && /caducado/.test(e.message));
  await assert.rejects(client(async () => { throw new TypeError('fetch failed'); }).mutate('plan', {}), (e: RescueApiError) => e.code === 'NETWORK' && /se conserva/.test(e.message));
  for (const ack of [{ ok: true }, { ok: true, outcome: 'quizá', version: 2 }, { ok: false, outcome: 'saved', version: 2 }, [],
    // F4: acuses INCOMPLETOS o con números inválidos no confirman nada y el borrador se conserva (no se llega a done()).
    { ok: true, outcome: 'saved', version: 2 }, okAck({ budgetMinutes: 60 }, { replayed: undefined }), okAck({ budgetMinutes: 60 }, { version: -1 }), okAck({ budgetMinutes: 60 }, { version: 1.5 }), okAck({ budgetMinutes: 60 }, { version: '2' }), okAck(null as never), okAck({})]) await assert.rejects(client(async () => reply(ack)).mutate('plan', {}), (e: RescueApiError) => e.code === 'BAD_ACK', JSON.stringify(ack));
  await assert.rejects(client(async () => reply(okAck({ taskId: 't' }))).mutate('edit', {}), (e: RescueApiError) => e.code === 'BAD_ACK' && /changeId/.test(e.message), 'cada acción exige su resultado');
  await assert.rejects(client(async () => reply(okAck({ recordId: undefined }))).mutate('create', {}), (e: RescueApiError) => e.code === 'BAD_ACK');
  const ack = await client(async () => reply(okAck({ planId: 'p', status: 'partial', applied: 2, uncertain: 1, failed: 0 }, { outcome: 'uncertain', version: 9 }))).mutate('apply', {}); assert.equal(ack.outcome, 'uncertain');
  const sent: unknown[] = []; await client(async (_u, init) => { sent.push(JSON.parse(String(init.body))); return reply(okAck({ budgetMinutes: 60 })); }).mutate('plan', { budgetMinutes: 60 }); assert.deepEqual(sent, [{ budgetMinutes: 60 }]);
});

test('una respuesta válida pero tardía de una lectura anterior no sustituye a la actual', async () => {
  const first = defer(), second = defer(); let n = 0;
  const c = client(() => (++n === 1 ? first.promise : second.promise));
  const a = c.state(), b = c.state();
  second.resolve(reply(view({ version: 5 }))); first.resolve(reply(view({ version: 4 })));
  const [ra, rb] = await Promise.all([a, b]);
  assert.equal(ra, null, 'la lectura anterior queda descartada aunque su JSON sea válido'); assert.equal((rb as RoomView).version, 5);
});

test('una lectura nueva cancela la anterior y cancelReads aborta la pendiente', async () => {
  const signals: AbortSignal[] = []; const never = () => new Promise<Response>(() => { /* nunca responde */ });
  const c = client((_u, init) => { signals.push(init.signal as AbortSignal); return new Promise<Response>((_r, rej) => (init.signal as AbortSignal).addEventListener('abort', () => rej(Object.assign(new Error('abort'), { name: 'AbortError' })))); });
  const first = c.state(); const second = c.state(); assert.equal(signals[0].aborted, true); assert.equal(await first, null);
  c.cancelReads(); assert.equal(signals[1].aborted, true); assert.equal(await second, null); void never;
});

test('una respuesta válida de otro contexto (otro espacio o captura) se ignora', async () => {
  const other = reply(view({ context: { ...base.context, workspaceId: 'otro-espacio-0002', captureRevision: 'b'.repeat(64) } }));
  assert.equal(await client(async () => other).state(ctx), null);
  const same = await client(async () => reply(view())).state(ctx); assert.equal((same as RoomView).version, 3);
  assert.notEqual(contextKey(ctx), contextKey({ ...ctx, captureRevision: 'c'.repeat(64) }));
});

test('un estado bloqueado por integridad se distingue del vacío y se entrega tal cual', async () => {
  const blocked = await client(async () => reply({ blocked: true, roomId: 'x', integrity: { status: 'corrupt', reason: 'ilegible' } })).state();
  assert.equal((blocked as { blocked: boolean }).blocked, true);
});

test('claves de intención únicas y sobre ligado a la versión y al contexto vigentes', () => {
  assert.notEqual(newIntentKey('plan'), newIntentKey('plan')); assert.match(newIntentKey('plan'), /^plan-/);
  const v = view() as unknown as RoomView; assert.deepEqual(envelopeFor(v, 'k-12345678'), { idempotencyKey: 'k-12345678', expectedVersion: 3, context: v.context });
});

test('la previsualización y los candidatos validan la forma de la respuesta', async () => {
  const p = await client(async () => reply({ ok: false, issues: { due_date: 'x' }, diff: [], stage: 'local-work' })).preview('task-1', { due_date: 'mañana' }); assert.equal(p.ok, false);
  await assert.rejects(client(async () => reply({ candidates: 'no' })).candidates('p', 'o'), (e: RescueApiError) => e.code === 'BAD_FORMAT');
  assert.deepEqual(await client(async () => reply({ candidates: [{ id: 'crm-task-0001', summary: 's', values: {} }] })).candidates('p', 'o'), [{ id: 'crm-task-0001', summary: 's', values: {} }]);
});
