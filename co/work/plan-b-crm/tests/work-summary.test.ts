import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { WORK_SUMMARY_ROUTE, MAX_EXPORT_BYTES, parseWorkSummary, situationOf, needsAttention, toWorkSource, workSummaryExport, workSummaryToHtml, workSummaryToJson, workSummaryFileName, type WorkSummary } from '../shared/work-summary.js';
import { loadWorkSummary } from '../src/work-summary-client.js';
import { buildPassport } from '../shared/continuity-passport.js';
import { buildImpactMap } from '../shared/impact-map.js';

// Unidad 255. Contrato PROPUESTO del resumen público del diario (208 de Claude A), su adaptador, el cliente y la exportación. El endpoint real aún no existe: el cliente se prueba con un fetch SUSTITUIDO.
const CTX = 'capture:' + 'a'.repeat(64), OTHER = 'capture:' + 'b'.repeat(64), AT = '2026-11-06T09:00:00.000Z';
const base = (over: Record<string, unknown> = {}) => ({ format: 'planb-work-summary-v1', status: 'read', scope: { kind: 'active-copy', context: CTX }, at: AT, origin: 'work-journal', provenance: 'durable', coverage: 'complete', counts: { drafts: 0, unknownOutcome: 0, settled: 0, otherContext: 0 }, quarantine: { unreadable: 0 }, ...over });
const parse = (raw: unknown) => parseWorkSummary(raw);
const ok = (raw: unknown): WorkSummary => { const value = parse(raw); assert.ok(value, JSON.stringify(raw)); return value!; };
const reply = (body: unknown, status = 200, extra: Record<string, string> = {}) => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...extra } });

const VARIANTS = {
  empty: base(),
  pending: base({ counts: { drafts: 2, unknownOutcome: 1, settled: 5, otherContext: 1 } }),
  unreadableOnly: base({ coverage: 'partial', quarantine: { unreadable: 3 } }),
  uncovered: base({ coverage: 'none', counts: null, quarantine: null }),
  unavailable: base({ status: 'unavailable', coverage: 'none', counts: null, quarantine: null }),
  noScope: base({ status: 'unavailable', scope: { kind: 'none', context: null }, coverage: 'none', counts: null, quarantine: null }),
};

test('CONTRATO: las cinco situaciones se distinguen por el contrato y «sin cobertura» o «no disponible» NUNCA son cero', () => {
  const s = Object.fromEntries(Object.entries(VARIANTS).map(([k, v]) => [k, ok(v)])) as Record<keyof typeof VARIANTS, WorkSummary>;
  assert.deepEqual([situationOf(s.empty), situationOf(s.pending), situationOf(s.unreadableOnly), situationOf(s.uncovered), situationOf(s.unavailable)], ['empty', 'pending', 'unreadable', 'uncovered', 'unavailable']);
  assert.equal(new Set(Object.values(s).map(situationOf)).size, 5,'vacía, con trabajo, ilegible, sin cobertura y no disponible son cinco situaciones distintas');
  assert.deepEqual([needsAttention(s.empty), needsAttention(s.pending), needsAttention(s.unreadableOnly), needsAttention(s.uncovered), needsAttention(s.unavailable)], [false, true, true, false, false]);
  assert.equal(s.uncovered.counts, null); assert.equal(s.unavailable.counts, null);
  assert.equal(situationOf(ok(base({ counts: { drafts: 0, unknownOutcome: 0, settled: 7, otherContext: 4 } }))), 'empty', 'lo resuelto y lo de otra copia no son trabajo pendiente');
});

test('CONTRATO estricto: campos de más, formato ajeno, fechas inválidas e incoherencias semánticas se rechazan', () => {
  assert.equal(parse({ ...base(), extra: 1 }), null); assert.equal(parse({ ...base(), format: 'otro' }), null); assert.equal(parse({ ...base(), at: 'ayer' }), null); assert.equal(parse(null), null); assert.equal(parse('x'), null);
  assert.equal(parse({ ...base(), counts: { drafts: 1, unknownOutcome: 0, settled: 0, otherContext: 0, taskIds: ['t1'] } }), null, 'ni ids de tarea ni campos nuevos');
  assert.equal(parse(base({ counts: { drafts: -1, unknownOutcome: 0, settled: 0, otherContext: 0 } })), null); assert.equal(parse(base({ counts: { drafts: 1.5, unknownOutcome: 0, settled: 0, otherContext: 0 } })), null);
  assert.equal(parse(base({ scope: { kind: 'active-copy', context: 'instalacion:123' } })), null, 'solo la notación de captura, nunca la instalación');
  assert.equal(parse(base({ status: 'unavailable' })), null, 'no disponible con recuentos'); assert.equal(parse(base({ coverage: 'none' })), null, 'sin cobertura con recuentos (desconocido ≠ cero)');
  assert.equal(parse(base({ counts: null, quarantine: null })), null, 'con cobertura sin recuentos'); assert.equal(parse(base({ quarantine: { unreadable: 2 } })), null, 'completa con cuarentena');
  assert.equal(parse(base({ coverage: 'partial' })), null, 'parcial sin cuarentena'); assert.equal(parse(base({ scope: { kind: 'none', context: CTX } })), null); assert.equal(parse(base({ provenance: 'adivinada' })), null);
  assert.deepEqual(ok(VARIANTS.noScope).scope, { kind: 'none', context: null });
});

test('ADAPTADOR a la fuente del hub: usa el contexto del ÁMBITO (no el esperado), la cuarentena viaja como `unreadable` y lo desconocido queda `null` sin inventar cero; alimenta pasaporte y mapa', () => {
  const pending = toWorkSource(ok(VARIANTS.pending)); assert.deepEqual([pending.status, pending.context, pending.value!.counts], ['read', CTX, { drafts: 2, unknownOutcome: 1, settled: 5, otherContext: 1, unreadable: 0 }]);
  const partial = toWorkSource(ok(VARIANTS.unreadableOnly)); assert.equal(partial.value!.counts!.unreadable, 3);
  const uncovered = toWorkSource(ok(VARIANTS.uncovered)); assert.deepEqual([uncovered.status, uncovered.value!.coverage, uncovered.value!.counts], ['read', 'none', null], 'una lectura correcta sin cobertura conserva su causa');
  for (const key of ['unavailable', 'noScope'] as const) { const source = toWorkSource(ok(VARIANTS[key])); assert.deepEqual([source.status, source.value!.counts], ['unavailable', null], key); }
  const other = toWorkSource(ok(base({ scope: { kind: 'active-copy', context: OTHER } }))); assert.equal(other.context, OTHER, 'no se rellena con la captura esperada');
  const now = Date.parse(AT) + 60_000, passport = buildPassport({ now, installId: null, copy: { status: 'not-provided', at: null, value: null }, hubspot: { status: 'not-provided', at: null, value: null }, work: { status: pending.status, at: pending.at, value: pending.value }, relay: { status: 'not-provided', at: null, value: null } });
  assert.match(passport.sections.find(s => s.key === 'work')!.claims.map(c => c.text).join(' '), /2 borradores recuperables sin enviar/);
  const map = buildImpactMap({ now, expectedContext: CTX, copy: { status: 'not-provided', at: null, value: null, context: null }, inventory: { status: 'not-provided', at: null, value: null, context: null }, comparison: { status: 'not-provided', at: null, value: null, context: null }, queue: { status: 'not-provided', at: null, value: null, context: null }, work: pending, hubspot: { status: 'not-provided', at: null, value: null }, relay: { status: 'not-provided', at: null, value: null, context: null } });
  assert.equal(map.rows.find(r => r.id === 'work:uncertain')!.status, 'attention'); assert.equal(map.rows.find(r => r.id === 'work:uncertain')!.action, 'open-today');
  const otherMap = buildImpactMap({ now, expectedContext: CTX, copy: { status: 'not-provided', at: null, value: null, context: null }, inventory: { status: 'not-provided', at: null, value: null, context: null }, comparison: { status: 'not-provided', at: null, value: null, context: null }, queue: { status: 'not-provided', at: null, value: null, context: null }, work: other, hubspot: { status: 'not-provided', at: null, value: null }, relay: { status: 'not-provided', at: null, value: null, context: null } });
  assert.ok(otherMap.rows.some(r => r.id === 'other-context:work'), 'un resumen de otra captura se declara aparte y no alimenta el mapa');
});

test('EXPORTACIÓN: lista blanca exacta, JSON acotado y determinista, HTML autocontenido y escapado; nombre y aviso que no se confunden con una cápsula restaurable; sin texto de borradores, parches ni personas', () => {
  const summary = ok(VARIANTS.pending), e = workSummaryExport(summary);
  assert.deepEqual(Object.keys(e).sort(), ['counts', 'format', 'generatedFrom', 'limits', 'notice', 'quarantine', 'situation']); assert.deepEqual(Object.keys(e.generatedFrom).sort(), ['at', 'coverage', 'format', 'origin', 'provenance', 'scope', 'status']);
  const json = workSummaryToJson(summary); assert.ok(new TextEncoder().encode(json).length <= MAX_EXPORT_BYTES); assert.equal(workSummaryToJson(summary), json, 'determinista'); assert.equal(JSON.parse(json).generatedFrom.scope.context, 'capture:aaaaaaaa', 'etiqueta corta, no la clave completa');
  assert.ok(!json.includes('a'.repeat(32)), 'la clave completa de captura no sale');
  const html = workSummaryToHtml(summary); assert.doesNotMatch(html, /<script|<img|<link|<iframe|<form|https?:\/\//i); assert.match(html, /Content-Security-Policy[^>]*default-src 'none'/); assert.match(html, /no se puede restaurar/);
  for (const text of [json, html]) assert.doesNotMatch(text, /task-|\bpatch\b|borrador de|@|contraseña|C:\\|\/Users\//i);
  assert.equal(workSummaryFileName(summary, 'json'), 'resumen-trabajo-local-2026-11-06.json'); assert.equal(workSummaryFileName(summary, 'html'), 'resumen-trabajo-local-2026-11-06.html'); assert.doesNotMatch(workSummaryFileName(summary, 'json'), /capsula|copia|rescate|restaur/i);
  for (const key of Object.keys(VARIANTS) as (keyof typeof VARIANTS)[]) { const v = ok(VARIANTS[key]); assert.ok(workSummaryToJson(v).length > 0); assert.match(workSummaryToHtml(v), /<h1>Resumen del trabajo local<\/h1>/); }
  assert.match(workSummaryToHtml(ok(VARIANTS.uncovered)), /desconocidos \(no son cero\)/); assert.doesNotMatch(workSummaryToHtml(ok(VARIANTS.uncovered)), /<table>/);
  assert.match(workSummaryToHtml(ok(VARIANTS.unreadableOnly)), /cobertura parcial/); assert.match(workSummaryToJson(ok(VARIANTS.unreadableOnly)), /cotas|pueden ser mayores/);
});

test('CLIENTE: un GET, 401 = bloqueado, 404 = «no registrada en esta versión», 500/red = no disponible, formato inválido o enorme = inválido (nunca cero), sin reintento y con cancelación', async () => {
  const spy = (response: () => Response) => { const calls: { url: string; method: string }[] = []; return { calls, fetcher: (async (input: string, init?: RequestInit) => { calls.push({ url: String(input), method: init?.method ?? 'GET' }); return response(); }) as unknown as typeof fetch }; };
  const good = spy(() => reply(VARIANTS.pending)), read = await loadWorkSummary({ fetcher: good.fetcher }); assert.equal(read.kind, 'read'); assert.deepEqual(good.calls, [{ url: WORK_SUMMARY_ROUTE, method: 'GET' }]);
  const kinds = async (response: () => Response) => { const s = spy(response); const r = await loadWorkSummary({ fetcher: s.fetcher }); assert.equal(s.calls.length, 1, 'sin reintento'); return r.kind; };
  assert.equal(await kinds(() => reply({ error: 'secreto-xyz' }, 401)), 'locked'); assert.equal(await kinds(() => reply({}, 404)), 'not-registered'); assert.equal(await kinds(() => reply({}, 500)), 'failed');
  assert.equal(await kinds(() => reply({ ...VARIANTS.empty, extra: 1 })), 'invalid'); assert.equal(await kinds(() => reply('<html>')), 'invalid'); assert.equal(await kinds(() => reply('x'.repeat(200_000))), 'failed'); assert.equal(await kinds(() => reply(VARIANTS.empty, 200, { 'content-length': '999999' })), 'failed');
  assert.deepEqual(await loadWorkSummary({ fetcher: (async () => { throw new Error('ECONNRESET secreto'); }) as unknown as typeof fetch }), { kind: 'failed' });
  const abort = new AbortController(); abort.abort(); await assert.rejects(loadWorkSummary({ signal: abort.signal, fetcher: (async () => { throw new DOMException('x', 'AbortError'); }) as unknown as typeof fetch }), /cancelada/i);
});

// ── R2 (dictamen independiente 262): el cliente respeta la cancelación aunque el transporte ignore la señal ───────────────────────────────────────────────────────────────────────────────────────────────
const abortError = { name: 'AbortError' };
test('R2·1 CANCELADO ANTES: una señal ya abortada exige AbortError y no entra en el transporte (cero llamadas)', async () => {
  const controller = new AbortController(); controller.abort(); let calls = 0;
  await assert.rejects(loadWorkSummary({ signal: controller.signal, fetcher: (async () => { calls++; return reply(VARIANTS.pending); }) as unknown as typeof fetch }), abortError); assert.equal(calls, 0);
});
test('R2·2 CANCELADO MIENTRAS ESPERA: un transporte que IGNORA la señal y entrega después un 200 válido, un 401, un 404 o un 500 nunca produce read/locked/not-registered/failed', async () => {
  for (const [label, answer] of [['200', () => reply(VARIANTS.pending)], ['401', () => reply({ error: 'x' }, 401)], ['404', () => reply({}, 404)], ['500', () => reply({}, 500)], ['inválido', () => reply({ ...VARIANTS.empty, extra: 1 })]] as const) {
    const controller = new AbortController(); let deliver!: (response: Response) => void;
    const pending = loadWorkSummary({ signal: controller.signal, fetcher: (() => new Promise<Response>(resolve => { deliver = resolve; })) as unknown as typeof fetch });
    controller.abort(); deliver(answer()); await assert.rejects(pending, abortError, label);
  }
});
test('R2·3 CANCELADO CON EL CUERPO A MEDIAS: se libera el lector, se cancela el flujo y no se devuelve nada (el cuerpo recibido se descarta)', async () => {
  const bytes = new TextEncoder().encode(JSON.stringify(VARIANTS.pending)), controller = new AbortController(); let cancelled = false, sent = 0; let release!: () => void; const gate = new Promise<void>(resolve => { release = resolve; });
  const stream = new ReadableStream<Uint8Array>({ async pull(c) { if (sent === 0) { c.enqueue(bytes.slice(0, 30)); sent = 1; return; } await gate; c.enqueue(bytes.slice(30)); c.close(); }, cancel() { cancelled = true; } });
  const response = new Response(stream, { status: 200, headers: { 'content-type': 'application/json' } });
  const pending = loadWorkSummary({ signal: controller.signal, fetcher: (async () => response) as unknown as typeof fetch });
  await new Promise(resolve => setTimeout(resolve, 20)); controller.abort(); release();
  await assert.rejects(pending, abortError); assert.equal(cancelled, true, 'el flujo se canceló'); assert.equal(response.body!.locked, false, 'el lector se liberó');
});
test('R2·4 CANCELADO JUSTO AL TERMINAR: si la señal se aborta mientras se lee el último fragmento no se publica el resumen, y un cuerpo ya completo con la señal vigente sí', async () => {
  const controller = new AbortController(), response = reply(VARIANTS.pending); let calls = 0;
  const fetcher = (async () => { calls++; controller.abort(); return response; }) as unknown as typeof fetch;   // se cancela entre el envío y la lectura
  await assert.rejects(loadWorkSummary({ signal: controller.signal, fetcher }), abortError); assert.equal(calls, 1);
  const live = await loadWorkSummary({ signal: new AbortController().signal, fetcher: (async () => reply(VARIANTS.pending)) as unknown as typeof fetch }); assert.equal(live.kind, 'read');
});
test('R2·5 CONTROL: con la señal vigente se conservan ámbito, recuentos y una sola GET sin reintento; 401, 404 y 500 siguen siendo categorías del transporte', async () => {
  let calls = 0; const methods: string[] = [];
  const read = await loadWorkSummary({ signal: new AbortController().signal, fetcher: (async (_url: string, init?: RequestInit) => { calls++; methods.push(init?.method ?? 'GET'); return reply(VARIANTS.pending); }) as unknown as typeof fetch });
  assert.equal(calls, 1); assert.deepEqual(methods, ['GET']); assert.equal(read.kind, 'read'); if (read.kind === 'read') { assert.equal(read.summary.scope.context, CTX); assert.deepEqual(read.summary.counts, { drafts: 2, unknownOutcome: 1, settled: 5, otherContext: 1 }); }
  const kinds: string[] = []; for (const status of [401, 404, 500]) kinds.push((await loadWorkSummary({ signal: new AbortController().signal, fetcher: (async () => reply({}, status)) as unknown as typeof fetch })).kind); assert.deepEqual(kinds, ['locked', 'not-registered', 'failed']);
});

test('contrato estático: el consumidor no usa almacenamiento ni credenciales, no importa estado privado del diario y la tarjeta no inventa enlaces', () => {
  const component = fs.readFileSync('src/WorkSummary.tsx', 'utf8').replace(/\/\/.*$/gm, ''), client = fs.readFileSync('src/work-summary-client.ts', 'utf8').replace(/\/\/.*$/gm, ''), shared = fs.readFileSync('shared/work-summary.ts', 'utf8').replace(/\/\/.*$/gm, '');
  for (const text of [component, client, shared]) { assert.ok(!/localStorage|sessionStorage|indexedDB|document\.cookie|Authorization|token/i.test(text), 'sin almacenamiento ni credenciales'); assert.ok(!/task-intent-journal|local-operations\.js|TaskIntent/.test(text), 'sin importar el diario ni su estado privado'); }
  assert.match(component, /onOpenToday\?: \(\) => void/); assert.match(component, /else setHint\('Abre '/,'sin enlace, se explica en lugar de simular un botón'); assert.match(component, /generation\.current === mine/);
});
