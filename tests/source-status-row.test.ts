import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import type { ReactNode } from 'react';
import { describeSourceStatus, type NextAction, type SourceRegistryEntry, type SourceStatusView } from '../shared/source-status.js';
import { createZendeskSource } from '../server/zendesk-source.js';
import type { StatusActionHandlers } from '../src/SourceStatusRow.js';

// FILA DE FUENTE · prueba de TEXTOS por renderizado en servidor (`renderToStaticMarkup`). OJO: SSR NO es el DOM real: no prueba foco, teclado, estado ni maquetación; eso lo hace el banco de Chromium (tests/e2e/source-status-row.spec.ts).
// Las vistas se DERIVAN con `describeSourceStatus` aceptado a partir de lecturas reales del adaptador Zendesk con `fetch` sintético: ninguna cuenta, red ni credencial reales.
// El componente importa su hoja de estilos (.css), que Node no carga: se empaqueta el componente REAL con esbuild (CSS ignorado) junto con su propio React y se importa el resultado. Es el mismo código fuente del producto.
const bundleDir = fs.mkdtempSync(path.join(os.tmpdir(), 'planb-status-row-ssr-')), bundleFile = path.join(bundleDir, 'row.mjs'), repo = process.cwd().split(path.sep).join('/');
await build({ stdin: { contents: "export { SourceStatusRow } from '" + repo + "/src/SourceStatusRow'; export { createElement } from 'react'; export { renderToStaticMarkup } from 'react-dom/server';", resolveDir: process.cwd(), loader: 'ts', sourcefile: 'row-entry.ts' }, outfile: bundleFile, bundle: true, platform: 'node', format: 'esm', jsx: 'automatic', logLevel: 'error', loader: { '.css': 'empty' }, define: { 'process.env.NODE_ENV': '"production"' }, banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" } });
const { SourceStatusRow, createElement, renderToStaticMarkup } = await import(pathToFileURL(bundleFile).href) as { SourceStatusRow: unknown; createElement: (...args: unknown[]) => ReactNode; renderToStaticMarkup: (node: unknown) => string };
process.on('exit', () => { try { fs.rmSync(bundleDir, { recursive: true, force: true }); } catch { /* no crítico */ } });
const NOW = Date.parse('2026-11-09T10:00:00.000Z'), TOKEN = 'TEST-ROW-TOKEN-77e1', SUBJECT = 'Asunto privado de Ana: factura impagada';
const iso = (ms = NOW) => new Date(ms).toISOString();
let cursorN = 0; const body = (tickets: unknown[], more = false) => new Response(JSON.stringify({ tickets, meta: { has_more: more, after_cursor: more ? 'c' + (++cursorN) : null } }), { headers: { 'content-type': 'application/json' } });
const ticket = (id: number) => ({ id, status: 'open', subject: SUBJECT, updated_at: '2026-11-09T09:00:00Z', external_id: 'PEDIDO-4821' });
const live = (fetcher: typeof fetch | null, extra: Record<string, unknown> = {}) => createZendeskSource({ mode: { kind: 'live', subdomain: 'acme-demo' }, credential: () => { if (!fetcher) throw new Error('sin credencial'); return TOKEN; }, now: () => NOW, ...(fetcher ? { fetch: fetcher } : {}), ...extra } as never);
const fixtureSource = (fetcher: typeof fetch) => createZendeskSource({ mode: { kind: 'local-test', origin: 'http://127.0.0.1:9', accountId: 'fixture-support-a' }, credential: () => TOKEN, now: () => NOW, fetch: fetcher });
const real = (over: Partial<SourceRegistryEntry> = {}): SourceRegistryEntry => ({ provider: 'zendesk', label: 'Zendesk', accountId: 'acme-demo', observedAccount: null, authorization: { authorizedAt: iso(NOW - 3_600_000), scope: 'tickets:read (declarado por el anfitrión)' }, ...over });
const fixture = (): SourceRegistryEntry => ({ provider: 'zendesk-fixture', label: 'Zendesk de ensayo', accountId: 'fixture-support-a', observedAccount: null, authorization: null });
async function views(): Promise<Record<string, SourceStatusView>> {
  let n = 0; const stall = () => new Response(new ReadableStream<Uint8Array>({ pull() { return new Promise(() => undefined); } }, { highWaterMark: 0 }), { status: 200, headers: { 'content-type': 'application/json' } });
  const out: Record<string, SourceStatusView> = {};
  out.sinCuenta = describeSourceStatus({ ...real(), accountId: null, authorization: null }, null, NOW);
  out.sinAutorizacion = describeSourceStatus(real({ authorization: null }), null, NOW);
  out.preparada = describeSourceStatus(real(), null, NOW);
  out.ensayo = describeSourceStatus(fixture(), await fixtureSource((async () => body([ticket(1), ticket(2)])) as typeof fetch).readTickets(), NOW);
  out.observada = describeSourceStatus(real({ observedAccount: { accountId: 'acme-demo', at: iso(NOW - 60_000) } }), await live((async () => body([ticket(1), ticket(2), ticket(3)])) as typeof fetch).readTickets(), NOW);
  out.antigua = describeSourceStatus(real(), await live((async () => body([ticket(1)])) as typeof fetch).readTickets(), NOW + 25 * 3_600_000);
  out.vacia = describeSourceStatus(real(), await live((async () => body([])) as typeof fetch).readTickets(), NOW);
  out.parcial = describeSourceStatus(real(), await live((async () => body([ticket(++n)], true)) as typeof fetch, { limits: { maxPages: 2 } }).readTickets(), NOW);
  out.interrumpido = describeSourceStatus(real(), await live(stall as unknown as typeof fetch, { limits: { requestTimeoutMs: 40 } }).readTickets(), NOW);
  out.error403 = describeSourceStatus(real(), await live((async () => new Response('{}', { status: 403 })) as typeof fetch).readTickets(), NOW);
  out.red = describeSourceStatus(real(), await live((async () => { throw new Error('sin red'); }) as typeof fetch).readTickets(), NOW);
  out.sinPeticion = describeSourceStatus(real(), await live(null).readTickets(), NOW);
  return out;
}
const render = (view: unknown, actions?: StatusActionHandlers, children?: ReactNode) => renderToStaticMarkup(createElement(SourceStatusRow, { view: view as SourceStatusView, actions, children }));
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/\s+/g, ' ');
const handlers = (): StatusActionHandlers => ({ 'configure-account': () => undefined, 'request-authorization': () => undefined, 'run-explicit-read': () => undefined, 'retry-later': () => undefined, 'review-permissions': () => undefined, 'review-account': () => undefined });

test('SSR · cada situación dice lo suyo: configuración, ensayo, observada, antigua, vacía, parcial, interrumpida, error y sin respuesta; el recuento nulo nunca es cero; la hora observada se conserva', async () => {
  const v = await views(), at = (name: string) => text(render(v[name]));
  assert.match(at('sinCuenta'), /Sin cuenta configurada/); assert.match(at('sinCuenta'), /Configuración preparada · sin lecturas/); assert.match(at('sinCuenta'), /Sin recibos locales: todavía no se ha intentado ninguna lectura/);
  assert.match(at('preparada'), /Cuenta configurada acme-demo \(identidad sin comprobar\)/);
  assert.match(at('ensayo'), /Ensayo · datos ficticios/); assert.match(at('ensayo'), /Lectura de ensayo .*2 registros · cobertura completa/); assert.doesNotMatch(at('ensayo'), /observada/i, 'un ensayo no se llama observado');
  assert.match(at('observada'), /Cuenta comprobada acme-demo/); assert.match(at('observada'), /Lectura observada .*\(Madrid\) · 3 registros · cobertura completa/); assert.doesNotMatch(at('observada'), /antigua/);
  assert.match(at('antigua'), /Lectura observada .*· cobertura completa · antigua/); assert.match(at('antigua'), /9\/11\/26, 11:00 \(Madrid\)/, 'conserva la hora observada, no la de ahora');
  assert.match(at('vacia'), /listado observado vacío/); assert.match(at('vacia'), /0 registros/);
  assert.match(at('parcial'), /Lectura parcial observada .*al menos 2 registros · cobertura parcial · causa: páginas sin leer/);
  assert.match(at('interrumpido'), /Intento interrumpido · recuento desconocido/); assert.match(at('interrumpido'), /sin lectura útil · recuento desconocido \(no es cero\) · causa: sin respuesta a tiempo/);
  assert.match(at('interrumpido'), /no se sabe si la fuente llegó a responder/); assert.doesNotMatch(at('interrumpido'), /no llegó respuesta|0 registros/);
  assert.match(at('error403'), /El proveedor respondió con un error · recuento desconocido/); assert.match(at('error403'), /causa: permisos insuficientes/);
  assert.match(at('red'), /Intento sin respuesta · recuento desconocido/); assert.match(at('sinPeticion'), /Intento sin petición · recuento desconocido/);
  // la frase de evidencia de SourceStatus (segunda afirmación del intento) es la que se muestra: si el módulo cambia su orden, esta prueba lo avisa
  for (const [name, evidence] of [['interrumpido', 'interrupted'], ['error403', 'error-response'], ['red', 'no-response'], ['sinPeticion', 'not-sent']] as const) { assert.equal(v[name]!.evidence, evidence, name); assert.ok(at(name).includes('Qué se intentó: ' + v[name]!.statements[1]), name); assert.match(v[name]!.statements[0]!, /^Intento de lectura sin ningún dato/, name + ': orden de las afirmaciones'); }
  for (const name of ['interrumpido', 'error403', 'red', 'sinPeticion']) { assert.doesNotMatch(at(name), /\b0 registros|sin tickets/i, name + ': un fallo no es cero'); assert.match(at(name), /recuento desconocido \(no es cero\)/, name); }
  for (const [name, view] of Object.entries(v)) { const t = at(name); assert.doesNotMatch(t.replace(/No conectado:/g, ''), /\bconectad[oa]\b|\bConectar\b/i, name + ': nada afirma ni ofrece conexión'); assert.match(t, /No conectado: este estado no prueba una conexión/, name); for (const secret of [TOKEN, SUBJECT, 'PEDIDO-4821', 'Ana']) assert.ok(!t.includes(secret) && !render(view).includes(secret), name + ' no lleva ' + secret); }
});

test('SSR · LA ACCIÓN: solo hay botón si el anfitrión aporta el manejador de ESA acción; sin él se explica qué falta; «none» nunca es una acción; los manejadores de otras acciones no se ofrecen', async () => {
  const v = await views(), expected: Record<string, NextAction> = { sinCuenta: 'configure-account', sinAutorizacion: 'request-authorization', preparada: 'run-explicit-read', antigua: 'run-explicit-read', interrumpido: 'retry-later', error403: 'review-permissions', sinPeticion: 'review-account', observada: 'none' };
  for (const [name, action] of Object.entries(expected)) {
    assert.equal(v[name]!.nextAction, action, name);
    const without = render(v[name]), withOne = render(v[name], action === 'none' ? handlers() : { [action]: () => undefined } as StatusActionHandlers), others = render(v[name], Object.fromEntries(Object.entries(handlers()).filter(([key]) => key !== action)) as StatusActionHandlers);
    if (action === 'none') { assert.doesNotMatch(without, /data-testid="status-action"/, name); assert.match(text(without), /Sin acción pendiente\./, name); assert.doesNotMatch(render(v[name], handlers()), /data-testid="status-action"/, name + ': «none» no es una acción aunque haya manejadores'); continue; }
    assert.doesNotMatch(without, /data-testid="status-action"/, name + ': sin manejador no hay botón'); assert.match(without, /data-testid="status-missing"/, name); assert.match(text(without), /todavía no tiene esa acción/, name);
    assert.match(withOne, /data-testid="status-action"/, name); assert.doesNotMatch(withOne, /data-testid="status-missing"/, name); assert.doesNotMatch(others, /data-testid="status-action"/, name + ': el manejador de otra acción no se ofrece');
  }
  assert.match(text(render(v.sinCuenta, { 'configure-account': () => undefined })), /Configurar la cuenta/); assert.match(text(render(v.preparada, { 'run-explicit-read': () => undefined })), /Leer ahora \(acción explícita\)/);
});

test('SSR · DETALLES CERRADOS por defecto: los hijos (historial) no se renderizan y el control está plegado; una vista inválida no se muestra', async () => {
  const v = await views(), marker = 'HIJO-HISTORIAL-MARCADOR';
  for (const name of Object.keys(v)) { const html = render(v[name], undefined, createElement('div', null, marker)); assert.ok(!html.includes(marker), name + ': el detalle está cerrado'); assert.match(html, /aria-expanded="false"/); assert.match(text(html), /Detalles y recibos/); assert.doesNotMatch(html, /data-testid="status-details"/); }
  for (const bad of [{ ...v.observada, connected: true }, { ...v.observada, level: 'inventado' }, { ...v.interrumpido, reading: { ...v.interrumpido!.reading!, records: 0 } }, null, 'texto']) {
    const html = render(bad, handlers(), createElement('div', null, marker)), t = text(html);
    assert.match(html, /data-state="invalid"/); assert.match(t, /no es válido y no se muestra/); assert.doesNotMatch(html, /data-testid="status-action"|status-toggle/); assert.ok(!html.includes(marker));
  }
});
