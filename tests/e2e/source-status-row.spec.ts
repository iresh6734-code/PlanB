import { test, expect, type Page } from '@playwright/test';
import { build as bundle } from 'esbuild';
import { createHash } from 'node:crypto';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describeSourceStatus, type SourceRegistryEntry, type SourceStatusView } from '../../shared/source-status.js';
import { createZendeskSource } from '../../server/zendesk-source.js';

process.env.NODE_ENV = 'test';
// BANCO DE DOM REAL DE LA FILA DE FUENTE (unidad Claude B · CLAUDE-SOURCE-STATUS-ROW). El componente REAL (src/SourceStatusRow.tsx) se empaqueta con esbuild y se monta en una página servida por un servidor HTTP local efímero
// (127.0.0.1, puerto libre; no 4601/4331/4334). Las vistas se DERIVAN en Node con `describeSourceStatus` aceptado a partir de lecturas reales del adaptador Zendesk con `fetch` sintético y se pasan a la página como datos: ninguna
// cuenta, red ni credencial reales. Las ACCIONES son manejadores del banco (resuelven, esperan, rechazan o lanzan); el componente no las inventa. NO es la App compilada: el montaje en Integraciones es del coordinador.
const repo = process.cwd(), root = fs.mkdtempSync(path.join(os.tmpdir(), 'planb-status-row-')), web = path.join(root, 'web');
const sha = (file: string) => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const evidence: Record<string, unknown> = {};
const NOW = Date.parse('2026-11-09T10:00:00.000Z'), TOKEN = 'TEST-ROW-TOKEN-e2e-52b1', SUBJECT = 'Asunto privado de Ana: factura impagada';
const PINNED_STATUS = 'fddfda1bd5b73d4b5a32e0eca96e6b58a9188d6b7b50be911421c37cf2a08da1';   // SourceStatus R3 aceptada
const FORBIDDEN = /\bconectar\b|conectado(?!:)|\bconectada\b/i;
const iso = (ms = NOW) => new Date(ms).toISOString();
let cursorN = 0;
const body = (tickets: unknown[], more = false) => new Response(JSON.stringify({ tickets, meta: { has_more: more, after_cursor: more ? 'c' + (++cursorN) : null } }), { headers: { 'content-type': 'application/json' } });
const ticket = (id: number) => ({ id, status: 'open', subject: SUBJECT, updated_at: '2026-11-09T09:00:00Z', external_id: 'PEDIDO-4821' });
const live = (fetcher: typeof fetch | null, extra: Record<string, unknown> = {}) => createZendeskSource({ mode: { kind: 'live', subdomain: 'acme-demo' }, credential: () => { if (!fetcher) throw new Error('sin credencial'); return TOKEN; }, now: () => NOW, ...(fetcher ? { fetch: fetcher } : {}), ...extra } as never);
const real = (over: Partial<SourceRegistryEntry> = {}): SourceRegistryEntry => ({ provider: 'zendesk', label: 'Zendesk', accountId: 'acme-demo', observedAccount: null, authorization: { authorizedAt: iso(NOW - 3_600_000), scope: 'tickets:read (declarado por el anfitrión)' }, ...over });
async function views(): Promise<Record<string, SourceStatusView>> {
  let n = 0; const stall = () => new Response(new ReadableStream<Uint8Array>({ pull() { return new Promise(() => undefined); } }, { highWaterMark: 0 }), { status: 200, headers: { 'content-type': 'application/json' } });
  const fixtureSource = createZendeskSource({ mode: { kind: 'local-test', origin: 'http://127.0.0.1:9', accountId: 'fixture-support-a' }, credential: () => TOKEN, now: () => NOW, fetch: (async () => body([ticket(1), ticket(2)])) as typeof fetch });
  const out: Record<string, SourceStatusView> = {};
  out.sinCuenta = describeSourceStatus({ ...real(), accountId: null, authorization: null }, null, NOW); out.sinAutorizacion = describeSourceStatus(real({ authorization: null }), null, NOW); out.preparada = describeSourceStatus(real(), null, NOW);
  out.ensayo = describeSourceStatus({ provider: 'zendesk-fixture', label: 'Zendesk de ensayo', accountId: 'fixture-support-a', observedAccount: null, authorization: null }, await fixtureSource.readTickets(), NOW);
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
// R2 (revisión 312 F1): variantes VÁLIDAS de una misma lectura antigua que NO cambian proveedor, cuenta, acción, hora de la lectura ni número de peticiones: lo único que cambia es otro campo semántico de la vista.
async function variants(): Promise<Record<string, SourceStatusView>> {
  const read = (extra: Record<string, unknown> = {}, tickets: unknown[] = [ticket(1)], more = false) => live((async () => body(tickets, more)) as typeof fetch, extra).readTickets();
  const later = NOW + 25 * 3_600_000, out: Record<string, SourceStatusView> = {};
  const base = await read();
  out.base = describeSourceStatus(real(), base, later);
  out.autorizacionRenovada = describeSourceStatus(real({ authorization: { authorizedAt: iso(NOW - 1_800_000), scope: 'tickets:read (declarado por el anfitrión)' } }), base, later);
  out.cuentaComprobada = describeSourceStatus(real({ observedAccount: { accountId: 'acme-demo', at: iso(NOW - 60_000) } }), base, later);
  out.otroRecuento = describeSourceStatus(real(), await read({}, [ticket(1), ticket(2), ticket(3)]), later);
  out.mismaHoraReciente = describeSourceStatus(real(), base, NOW + 60_000);
  out.listadoVacio = describeSourceStatus(real(), await read({}, []), later);
  out.parcialMismaHora = describeSourceStatus(real(), await read({ limits: { maxPages: 1 } }, [ticket(1)], true), later);
  return out;
}
let server: http.Server, origin = '', all: Record<string, SourceStatusView> = {}, more: Record<string, SourceStatusView> = {};
test.beforeAll(async () => {
  test.setTimeout(180_000);
  expect(sha(path.join(repo, 'shared', 'source-status.ts')), 'SourceStatus aceptada cambió: repetir y fijar la combinación').toBe(PINNED_STATUS);
  all = await views(); more = await variants();
  const entry = [
    "import { createRoot } from 'react-dom/client';", "import { useEffect, useState } from 'react';", "import '" + repo.split(path.sep).join('/') + "/shared/model';",
    "import '" + repo.split(path.sep).join('/') + "/src/styles.css';", "import '" + repo.split(path.sep).join('/') + "/src/design-system.css';", "import '" + repo.split(path.sep).join('/') + "/src/planb-ui.css';",
    "import { SourceStatusRow } from '" + repo.split(path.sep).join('/') + "/src/SourceStatusRow';",
    "const calls = { count: 0, probeMounts: 0, waiting: [] as Array<{ resolve: () => void; reject: () => void }> };",
    "const makeHandler = (mode: string) => () => { calls.count++; if (mode === 'throw') throw new Error('manejador roto'); if (mode === 'reject') return Promise.reject(new Error('rechazo')); if (mode === 'ok') return Promise.resolve(); return new Promise<void>((resolve, reject) => { calls.waiting.push({ resolve, reject }); }); };",
    "function Probe() { useEffect(() => { calls.probeMounts++; }, []); return <p data-testid=\"probe\">HIJO-HISTORIAL</p>; }",
    "function Host() { const [p, setP] = useState<any>(null); (window as any).harness = { set: (next: any) => setP((c: any) => ({ ...c, ...next })), unmount: () => setP(null), calls, settle: (how: string) => { for (const w of calls.waiting.splice(0)) (how === 'reject' ? w.reject : w.resolve)(); } }; if (!p) return null; const actions = p.mode && p.view && p.view.nextAction ? { [p.view.nextAction]: makeHandler(p.mode) } : undefined; return <SourceStatusRow key={p.key} view={p.view} actions={actions as any}>{p.withChildren ? <Probe /> : undefined}</SourceStatusRow>; }",
    "createRoot(document.getElementById('root')!).render(<Host />);",
  ].join('\n');
  await bundle({ stdin: { contents: entry, resolveDir: repo, sourcefile: 'status-row-harness.tsx', loader: 'tsx' }, outdir: web, bundle: true, platform: 'browser', format: 'esm', jsx: 'automatic', logLevel: 'error', minify: false, define: { 'process.env.NODE_ENV': '"production"' }, loader: { '.woff': 'file', '.woff2': 'file', '.ttf': 'file', '.svg': 'dataurl', '.png': 'dataurl' }, assetNames: '[name]-[hash]', entryNames: 'harness' });
  server = http.createServer((req, res) => {
    const name = (req.url ?? '/').split('?')[0]!;
    if (name === '/harness.html') { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'content-security-policy': "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'" }); res.end('<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Banco fila de fuente</title><link rel="stylesheet" href="/web/harness.css"></head><body><main id="root" style="padding:16px;max-width:760px;margin:0 auto"></main><script type="module" src="/web/harness.js"></script></body></html>'); return; }
    const file = path.join(web, path.basename(name)); if (name.startsWith('/web/') && fs.existsSync(file)) { res.writeHead(200, { 'content-type': file.endsWith('.css') ? 'text/css' : file.endsWith('.js') ? 'text/javascript' : 'application/octet-stream' }); res.end(fs.readFileSync(file)); return; }
    res.writeHead(404); res.end('no');
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve)); origin = 'http://127.0.0.1:' + (server.address() as AddressInfo).port;
  evidence.sources = Object.fromEntries(['src/SourceStatusRow.tsx', 'src/source-status-row.css', 'shared/source-status.ts', 'shared/source-reading.ts'].map(file => [file, sha(path.join(repo, file))])); evidence.bundle = sha(path.join(web, 'harness.js'));
});
test.afterAll(async () => { await new Promise<void>(resolve => server.close(() => resolve())); server.closeAllConnections(); fs.writeFileSync(path.join(root, 'evidence.json'), JSON.stringify(evidence, null, 2)); console.log('EVIDENCIA-FILA ' + root + '\n' + JSON.stringify(evidence)); if (!process.env.PLANB_KEEP_STATUS_ROW) { try { fs.rmSync(web, { recursive: true, force: true }); } catch { /* no crítico */ } } });

async function open(page: Page) {
  const requests: string[] = [], problems: string[] = [];
  page.on('request', request => { requests.push(new URL(request.url()).pathname); }); page.on('pageerror', error => problems.push('pageerror: ' + error.message));
  page.on('console', message => { if (message.type() === 'error' && !/Failed to load resource/.test(message.text())) problems.push('console: ' + message.text()); });
  await page.goto(origin + '/harness.html'); await page.waitForFunction(() => !!(window as unknown as { harness?: unknown }).harness);
  return { requests, problems };
}
type H = { set: (p: unknown) => void; unmount: () => void; calls: { count: number; probeMounts: number; waiting: unknown[] }; settle: (how: string) => void };
const set = (page: Page, props: Record<string, unknown>) => page.evaluate(p => (window as unknown as { harness: H }).harness.set(p), props);
const calls = (page: Page) => page.evaluate(() => { const c = (window as unknown as { harness: H }).harness.calls; return { count: c.count, probeMounts: c.probeMounts, waiting: c.waiting.length }; });
const settle = (page: Page, how = 'resolve') => page.evaluate(h => (window as unknown as { harness: H }).harness.settle(h), how);
const row = (page: Page) => page.getByTestId('source-status-row');
const id = (page: Page, name: string) => page.getByTestId(name);
const clean = (state: { requests: string[]; problems: string[] }) => { expect(state.problems, 'sin errores de página ni de consola').toEqual([]); expect(state.requests.filter(r => !/^\/(harness\.html|web\/)/.test(r)), 'el componente no hace ninguna petición').toEqual([]); };

test('cada situación se ve distinta y dice lo que se sabe: configuración, ensayo, observada, antigua, vacía, parcial, interrumpida, error, sin respuesta y sin petición; recuento desconocido ≠ cero; sin secretos ni «conectar»', async ({ page }) => {
  const state = await open(page);
  const expected: Record<string, RegExp[]> = {
    sinCuenta: [/Sin cuenta configurada/, /Configuración preparada · sin lecturas/, /Configurar la cuenta/], sinAutorizacion: [/Autorizar la lectura de esta cuenta/], preparada: [/Leer ahora \(acción explícita\)/, /Sin recibos locales/],
    ensayo: [/Ensayo · datos ficticios/, /Lectura de ensayo .*2 registros · cobertura completa/], observada: [/Cuenta comprobada acme-demo/, /Lectura observada .*3 registros · cobertura completa/, /Sin acción pendiente/],
    antigua: [/cobertura completa · antigua/, /9\/11\/26, 11:00 \(Madrid\)/, /Leer ahora/], vacia: [/listado observado vacío/, /0 registros/], parcial: [/Lectura parcial observada .*al menos 2 registros · cobertura parcial · causa: páginas sin leer/],
    interrumpido: [/Intento interrumpido · recuento desconocido/, /Qué se intentó: .*no se sabe si la fuente llegó a responder/, /causa: sin respuesta a tiempo/], error403: [/El proveedor respondió con un error · recuento desconocido/, /Revisar los permisos concedidos/],
    red: [/Intento sin respuesta · recuento desconocido/, /Qué se intentó: .*falló la red antes de recibir respuesta/], sinPeticion: [/Intento sin petición · recuento desconocido/, /Qué se intentó: No llegó a enviarse ninguna petición/],
  };
  const seen = new Set<string>();
  for (const [name, view] of Object.entries(all)) {
    await set(page, { view, mode: null, withChildren: false }); await expect(row(page)).toHaveAttribute('data-state', view.level);
    const text = await row(page).innerText(); seen.add(await id(page, 'status-headline').innerText());
    for (const pattern of expected[name] ?? []) expect(text, name).toMatch(pattern);
    expect(text.replace(/No conectado:/g, ''), name).not.toMatch(FORBIDDEN); expect(text, name).toContain('No conectado: este estado no prueba una conexión');
    for (const secret of [TOKEN, SUBJECT, 'PEDIDO-4821', 'Ana']) { expect(text, name).not.toContain(secret); expect(await row(page).innerHTML(), name).not.toContain(secret); }
    if (view.reading && view.reading.coverage === 'unavailable') { expect(text, name).toMatch(/recuento desconocido \(no es cero\)/); expect(text, name).not.toMatch(/\b0 registros/); }
    await expect(page.getByRole('button', { name: /conectar/i })).toHaveCount(0);
    // sin manejador no hay botón de acción: solo la condición que falta (o «sin acción» con none)
    await expect(id(page, 'status-action')).toHaveCount(0); if (view.nextAction === 'none') await expect(id(page, 'status-no-action')).toBeVisible(); else await expect(id(page, 'status-missing')).toContainText('todavía no tiene esa acción');
  }
  // 12 vistas, 10 titulares: «sin cuenta», «sin autorización» y «preparada» comparten «Configuración preparada · sin lecturas» y se distinguen por su siguiente paso
  expect(seen.size, 'titulares distintos por situación').toBe(10); clean(state);
});

test('la acción: un manejador concreto por acción disponible, UNA sola llamada aunque se pulse dos veces, «En curso» mientras espera, nada de éxito inventado al terminar, fallo visible y reintentable, y un resultado tardío no se aplica a otro estado', async ({ page }) => {
  const state = await open(page), run = all.preparada!;
  await set(page, { view: run, mode: 'slow', withChildren: false }); const action = id(page, 'status-action'); await expect(action).toHaveText('Leer ahora (acción explícita)'); await expect(id(page, 'status-missing')).toHaveCount(0);
  await action.dblclick(); await expect(action).toHaveText('En curso…'); await expect(action).toBeDisabled(); expect(await calls(page)).toMatchObject({ count: 1, waiting: 1 });
  await settle(page); await expect(id(page, 'status-action-finished')).toContainText('La acción terminó. Este estado solo cambia cuando se vuelve a consultar'); await expect(action).toHaveText('Leer ahora (acción explícita)'); await expect(action).toBeEnabled();
  expect((await row(page).innerText()).replace(/No conectado:/g, '')).not.toMatch(/éxito|conseguid[oa]|correctamente|conectad|completad[oa] con/i); await expect(id(page, 'status-headline')).toContainText('Configuración preparada · sin lecturas');   // el estado NO cambió por terminar la acción
  await action.click(); await expect(action).toHaveText('En curso…'); expect((await calls(page)).count).toBe(2); await settle(page, 'reject');   // rechazo asíncrono
  await expect(id(page, 'status-action-failed')).toContainText('La acción no se pudo completar'); await expect(id(page, 'status-action-finished')).toHaveCount(0); await expect(action).toBeEnabled();
  for (const mode of ['reject', 'throw']) { await set(page, { mode, view: { ...run } }); await action.click(); await expect(id(page, 'status-action-failed')).toBeVisible(); await expect(action).toBeEnabled(); }   // rechazo y excepción síncrona
  const before = (await calls(page)).count; await set(page, { mode: 'slow' }); await action.click(); await expect.poll(async () => (await calls(page)).waiting).toBe(1);
  // cambia el estado (otra lectura) mientras espera: lo que devuelva la acción anterior no se aplica al estado nuevo, y la nueva acción se puede ejecutar
  await set(page, { view: all.antigua, mode: 'slow' }); await expect(id(page, 'status-headline')).toContainText('antigua'); await expect(id(page, 'status-action')).toBeEnabled(); await settle(page); await page.waitForTimeout(250);
  await expect(id(page, 'status-action-finished')).toHaveCount(0); await expect(id(page, 'status-action-failed')).toHaveCount(0); await id(page, 'status-action').click(); expect((await calls(page)).count).toBe(before + 2);
  await settle(page, 'reject');
  // una acción que no es la siguiente no se ofrece: el manejador es del banco para view.nextAction; con «none» no hay botón aunque se pida un manejador
  await set(page, { view: all.observada, mode: 'ok' }); await expect(id(page, 'status-action')).toHaveCount(0); await expect(id(page, 'status-no-action')).toContainText('Sin acción pendiente');
  // desmontar con una acción en espera y resolverla después no produce errores
  await set(page, { view: run, mode: 'slow' }); await id(page, 'status-action').click(); await page.evaluate(() => (window as unknown as { harness: H }).harness.unmount()); await settle(page); await page.waitForTimeout(200); await expect(row(page)).toHaveCount(0);
  clean(state);
});

test('detalles y recibos: cerrados por defecto (el hijo no se monta), se abren y cierran con teclado sin perder el foco, un estado nuevo los vuelve a cerrar y el orden de tabulación es acción → detalles', async ({ page }) => {
  const state = await open(page);
  await set(page, { view: all.interrumpido, mode: null, withChildren: true }); const toggle = id(page, 'status-toggle');
  await expect(toggle).toHaveAttribute('aria-expanded', 'false'); await expect(toggle).toHaveText('Detalles y recibos'); await expect(id(page, 'status-details')).toHaveCount(0); await expect(id(page, 'probe')).toHaveCount(0); expect((await calls(page)).probeMounts).toBe(0);
  await toggle.focus(); await page.keyboard.press('Enter'); await expect(toggle).toHaveAttribute('aria-expanded', 'true'); await expect(toggle).toHaveText('Ocultar detalles y recibos'); await expect(toggle).toBeFocused();
  await expect(id(page, 'status-details')).toBeVisible(); await expect(id(page, 'probe')).toHaveText('HIJO-HISTORIAL'); expect((await calls(page)).probeMounts).toBe(1);
  await expect(id(page, 'status-details')).toContainText('Intento de lectura sin ningún dato'); await expect(id(page, 'status-details')).toContainText('Causa: sin respuesta a tiempo'); await expect(id(page, 'status-details')).toContainText('no se sabe si la fuente llegó a responder');
  expect(await toggle.getAttribute('aria-controls')).toBe(await id(page, 'status-details').getAttribute('id'));
  await page.keyboard.press('Space'); await expect(toggle).toHaveAttribute('aria-expanded', 'false'); await expect(id(page, 'probe')).toHaveCount(0); await expect(toggle).toBeFocused();
  await page.keyboard.press('Enter'); await expect(id(page, 'probe')).toBeVisible(); await set(page, { view: all.observada }); await expect(toggle).toHaveAttribute('aria-expanded', 'false'); await expect(id(page, 'probe')).toHaveCount(0);   // otro estado: vuelve a cerrarse
  // orden de tabulación con acción: botón de acción y luego «Detalles y recibos»
  await set(page, { view: all.preparada, mode: 'ok' }); await page.locator('body').click({ position: { x: 1, y: 1 } }); await page.keyboard.press('Tab'); await expect(id(page, 'status-action')).toBeFocused(); await page.keyboard.press('Tab'); await expect(toggle).toBeFocused();
  const outline = await id(page, 'status-action').evaluate(el => { (el as HTMLElement).focus(); const s = getComputedStyle(el); return s.outlineStyle !== 'none' || s.boxShadow !== 'none'; }); expect(outline, 'foco visible').toBe(true);
  clean(state);
});

test('un estado inválido no se muestra ni ofrece acciones: se declara desconocido, no cero', async ({ page }) => {
  const state = await open(page);
  for (const bad of [{ ...all.observada, connected: true }, { ...all.interrumpido, reading: { ...all.interrumpido!.reading!, records: 0 } }, { ...all.observada, level: 'inventado' }]) {
    await set(page, { view: bad, mode: 'ok', withChildren: true }); await expect(row(page)).toHaveAttribute('data-state', 'invalid'); await expect(row(page)).toContainText('El estado de esta fuente no es válido y no se muestra.'); await expect(row(page)).toContainText('se desconoce (no es cero)');
    await expect(id(page, 'status-action')).toHaveCount(0); await expect(id(page, 'status-toggle')).toHaveCount(0); await expect(id(page, 'probe')).toHaveCount(0);
  }
  clean(state);
});

test('1440, 390 y 320: sin desbordamiento horizontal con textos largos y detalles abiertos, botones táctiles de 44 px en móvil, capturas abiertas', async ({ page }) => {
  const state = await open(page), long = { ...all.interrumpido!, label: 'Zendesk de una empresa con un nombre bastante largo para comprobar el ajuste de línea', accountId: 'cuenta-con-un-identificador-muy-largo-para-comprobar-el-ajuste-de-linea-en-pantallas-estrechas' };
  await set(page, { view: long, mode: 'ok', withChildren: true }); await id(page, 'status-toggle').click(); await expect(id(page, 'status-details')).toBeVisible();
  fs.mkdirSync(path.join(root, 'shots'), { recursive: true });
  for (const [width, height] of [[1440, 900], [390, 844], [320, 700]] as const) {
    await page.setViewportSize({ width, height }); await page.waitForTimeout(100);
    const metrics = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, inner: window.innerWidth, wide: [...document.querySelectorAll('[data-testid="source-status-row"] *')].filter(el => el.getBoundingClientRect().right > window.innerWidth + 1).map(el => el.tagName + ':' + (el.textContent ?? '').slice(0, 30)) }));
    expect(metrics.scroll, width + ': sin desplazamiento horizontal').toBeLessThanOrEqual(metrics.inner); expect(metrics.wide, width + ': nada fuera de la pantalla').toEqual([]);
    if (width <= 600) for (const name of ['status-action', 'status-toggle']) { const box = await id(page, name).boundingBox(); expect(box!.height, width + ' ' + name).toBeGreaterThanOrEqual(43.5); }
    await page.screenshot({ path: path.join(root, 'shots', 'status-row-' + width + '.png'), fullPage: true });
  }
  evidence.screenshots = fs.readdirSync(path.join(root, 'shots')).map(name => [name, sha(path.join(root, 'shots', name))]); clean(state);
});

test('R2 · una autorización renovada de la misma cuenta retira la actividad y los detalles del estado anterior y su terminación tardía no aparece en el nuevo (sondas 312 F1, versión del banco propio)', async ({ page }) => {
  const state = await open(page), count = async () => (await calls(page)).count;
  expect(more.base!.provider).toBe(more.autorizacionRenovada!.provider); expect(more.base!.accountId).toBe(more.autorizacionRenovada!.accountId); expect(more.base!.nextAction).toBe(more.autorizacionRenovada!.nextAction);
  expect(more.base!.authorizedAt, 'solo cambia la autorización').not.toBe(more.autorizacionRenovada!.authorizedAt); expect(more.base!.reading!.at).toBe(more.autorizacionRenovada!.reading!.at);
  // sonda 1 · «En curso…» no sobrevive a la renovación
  await set(page, { view: more.base, mode: 'slow', withChildren: true }); const action = id(page, 'status-action'); await action.click(); await expect(action).toBeDisabled(); await expect(action).toHaveText('En curso…');
  await set(page, { view: more.autorizacionRenovada }); await expect(action).toBeEnabled(); await expect(action).not.toHaveText('En curso…'); await expect(action).toHaveAttribute('aria-busy', 'false');
  // sonda 3 · la terminación de la acción anterior no se atribuye a la vista renovada
  await settle(page); await page.waitForTimeout(200); await expect(id(page, 'status-action-finished')).toHaveCount(0); await expect(id(page, 'status-action-failed')).toHaveCount(0); await expect(action).toBeEnabled();
  expect(await count(), 'la acción anterior se llamó una vez y la renovación no la repite').toBe(1);
  // la acción del estado nuevo SÍ se puede ejecutar y se atribuye a la vista nueva
  await action.click(); await expect(action).toBeDisabled(); expect(await count()).toBe(2); await settle(page); await expect(id(page, 'status-action-finished')).toBeVisible();
  // sonda 2 · los detalles abiertos (y su hijo) pertenecían al estado anterior
  const toggle = id(page, 'status-toggle'); await toggle.click(); await expect(toggle).toHaveAttribute('aria-expanded', 'true'); await expect(id(page, 'probe')).toBeVisible();
  await set(page, { view: more.base }); await expect(toggle).toHaveAttribute('aria-expanded', 'false'); await expect(id(page, 'probe')).toHaveCount(0); await expect(id(page, 'status-details')).toHaveCount(0); await expect(id(page, 'status-action-finished')).toHaveCount(0);
  clean(state);
});

test('R2 · cualquier cambio semántico de la vista válida que conserva la hora y las peticiones es OTRO estado: cuenta comprobada, recuento, listado vacío, cobertura parcial o ya no antigua cierran detalles y actividad', async ({ page }) => {
  const state = await open(page);
  for (const name of ['autorizacionRenovada', 'cuentaComprobada', 'otroRecuento', 'mismaHoraReciente', 'listadoVacio', 'parcialMismaHora']) {
    const next = more[name]!, base = more.base!; expect(JSON.stringify(next), name + ' es otra vista').not.toBe(JSON.stringify(base)); expect(next.reading!.at, name + ': misma hora de lectura').toBe(base.reading!.at);
    await set(page, { view: base, mode: 'slow', withChildren: true, key: 'k-' + name }); await id(page, 'status-toggle').click(); await expect(id(page, 'probe')).toBeVisible();
    const before = (await calls(page)).waiting; await id(page, 'status-action').click(); await expect.poll(async () => (await calls(page)).waiting).toBe(before + 1);
    await set(page, { view: next }); await expect(id(page, 'status-toggle'), name).toHaveAttribute('aria-expanded', 'false'); await expect(id(page, 'probe'), name).toHaveCount(0);
    if (next.nextAction !== 'none') { await expect(id(page, 'status-action'), name).toBeEnabled(); await expect(id(page, 'status-action'), name).not.toHaveText('En curso…'); }
    await settle(page); await page.waitForTimeout(100); await expect(id(page, 'status-action-finished'), name).toHaveCount(0);
  }
  clean(state);
});

test('R2 · la misma vista otra vez (objeto nuevo con el mismo contenido) NO reinicia nada; volver a una vista anterior tampoco recupera su actividad ni sus detalles; una terminación tardía de A no se aplica al volver a A', async ({ page }) => {
  const state = await open(page), base = more.base!;
  await set(page, { view: base, mode: 'slow', withChildren: true }); const toggle = id(page, 'status-toggle'), action = id(page, 'status-action'); await toggle.click(); await action.click(); await expect(action).toBeDisabled();
  await set(page, { view: JSON.parse(JSON.stringify(base)) as SourceStatusView }); await expect(toggle).toHaveAttribute('aria-expanded', 'true'); await expect(action).toBeDisabled(); await expect(id(page, 'probe')).toBeVisible(); expect((await calls(page)).probeMounts, 'el hijo no se vuelve a montar').toBe(1);
  await set(page, { view: more.autorizacionRenovada }); await expect(action).toBeEnabled();
  await set(page, { view: base }); await expect(toggle).toHaveAttribute('aria-expanded', 'false'); await expect(action).toBeEnabled(); await expect(action).not.toHaveText('En curso…');
  await settle(page); await page.waitForTimeout(200); await expect(id(page, 'status-action-finished')).toHaveCount(0); await expect(id(page, 'status-action-failed')).toHaveCount(0);
  clean(state);
});

test('R2 · el anfitrión reidentifica la fila con su propia clave React cuando cambia el ámbito pero la vista y los textos visibles coinciden: la actividad y los detalles se retiran y la terminación tardía no se aplica', async ({ page }) => {
  const state = await open(page), base = more.base!;
  await set(page, { view: base, mode: 'slow', withChildren: true, key: 'instalacion-1|captura-7|generacion-3|pin-a|fuente-1' }); const action = id(page, 'status-action'); await id(page, 'status-toggle').click(); await action.click(); await expect(action).toBeDisabled();
  await set(page, { key: 'instalacion-2|captura-7|generacion-3|pin-a|fuente-1' });
  await expect(id(page, 'status-toggle')).toHaveAttribute('aria-expanded', 'false'); await expect(action).toBeEnabled(); await expect(action).not.toHaveText('En curso…'); await expect(id(page, 'probe')).toHaveCount(0);
  await settle(page); await page.waitForTimeout(200); await expect(id(page, 'status-action-finished')).toHaveCount(0); await expect(id(page, 'status-action-failed')).toHaveCount(0);
  await action.click(); await set(page, { view: JSON.parse(JSON.stringify(base)) as SourceStatusView }); await expect(action).toBeDisabled(); await settle(page);
  clean(state);
});
