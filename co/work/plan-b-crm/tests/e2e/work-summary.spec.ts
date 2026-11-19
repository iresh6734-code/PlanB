import { test, expect, type Page } from '@playwright/test';
import { build } from 'esbuild';
import { createServer, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

// UNIDAD 255 · DOM real (Chromium) de la tarjeta del trabajo local pendiente contra un DOBLE del endpoint (el endpoint real lo publicará la autora del diario tras aceptar 208): el contrato, el cliente y el
// componente son los REALES. Un servidor http mínimo sirve la página y la respuesta configurable del doble. No es la App ni su montaje.
const repo = process.cwd(), root = path.resolve(process.env.PLANB_WKS255_ROOT ?? path.join(repo, 'tests', '.tmp', 'wks255-' + randomUUID().slice(0, 8)));
const CTX = 'capture:' + 'a'.repeat(64), OTHER = 'capture:' + 'b'.repeat(64), AT = '2026-11-06T09:00:00.000Z';
const base = (over: Record<string, unknown> = {}) => ({ format: 'planb-work-summary-v1', status: 'read', scope: { kind: 'active-copy', context: CTX }, at: AT, origin: 'work-journal', provenance: 'durable', coverage: 'complete', counts: { drafts: 0, unknownOutcome: 0, settled: 0, otherContext: 0 }, quarantine: { unreadable: 0 }, ...over });
const VARIANTS = {
  empty: base(), pending: base({ counts: { drafts: 2, unknownOutcome: 1, settled: 5, otherContext: 1 } }), unreadable: base({ coverage: 'partial', quarantine: { unreadable: 3 } }),
  uncovered: base({ coverage: 'none', counts: null, quarantine: null }), unavailable: base({ status: 'unavailable', coverage: 'none', counts: null, quarantine: null }),
};
const p = (f: string) => JSON.stringify(path.join(repo, f).replace(/\\/g, '/'));
const ENTRY = `import { createRoot } from 'react-dom/client';
import { WorkSummary } from ${p('src/WorkSummary.tsx')};
import ${p('src/styles.css')}; import ${p('src/design-system.css')}; import ${p('src/planb-ui.css')};
const w = window as any; w.__nav = [];
const links = { onOpenToday: () => w.__nav.push('today'), onOpenRecoverable: () => w.__nav.push('recoverable') };
const rootNode = createRoot(document.getElementById('root')!);
w.__render = (props: any) => rootNode.render(<main style={{ padding: 16, maxWidth: 720 }}><WorkSummary {...(props.noLinks ? {} : links)} {...props} /></main>);
w.__render(JSON.parse(decodeURIComponent(location.hash.slice(1) || '%7B%7D')));
`;
/** Un transporte que IGNORA AbortSignal: retiene UNA respuesta y solo la entrega al «liberar». */
const HOLD = `(() => { const real = window.fetch.bind(window), w = window; w.__held = []; w.__hold = false;
  w.fetch = (input, init) => { if (w.__hold) { w.__hold = false; const rest = Object.assign({}, init || {}); delete rest.signal; return real(input, rest).then(res => new Promise(resolve => { w.__held.push(() => resolve(res)); })); } return real(input, init); };
  w.__release = () => { const next = w.__held.shift(); if (next) next(); return !!next; }; })();`;
let server: Server, origin = '', answer: { status: number; body: unknown } = { status: 200, body: VARIANTS.empty }, requests = 0;
const send = (res: ServerResponse, status: number, type: string, body: string | Buffer) => { res.statusCode = status; res.setHeader('content-type', type); res.setHeader('cache-control', 'no-store'); res.end(body); };
test.beforeAll(async () => {
  fs.mkdirSync(path.join(root, 'out'), { recursive: true }); fs.writeFileSync(path.join(root, 'entry.tsx'), ENTRY);
  await build({ entryPoints: [path.join(root, 'entry.tsx')], bundle: true, outdir: path.join(root, 'out'), format: 'iife', jsx: 'automatic', logLevel: 'error', loader: { '.png': 'dataurl', '.svg': 'dataurl', '.woff2': 'dataurl', '.woff': 'dataurl' }, define: { 'process.env.NODE_ENV': '"production"' } });
  const html = '<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Resumen</title><link rel="stylesheet" href="/out/entry.css"></head><body><div id="root"></div><script src="/out/entry.js"></script></body></html>';
  server = createServer((req, res) => {
    const url = new URL(req.url!, 'http://x');
    if (url.pathname === '/') return send(res, 200, 'text/html; charset=utf-8', html);
    if (url.pathname === '/api/v7/local-operations/work-summary') { requests++; return send(res, answer.status, 'application/json', JSON.stringify(answer.body)); }
    const file = url.pathname.startsWith('/out/') ? path.join(root, 'out', path.basename(url.pathname)) : '';
    if (file && fs.existsSync(file)) return send(res, 200, file.endsWith('.css') ? 'text/css' : 'text/javascript', fs.readFileSync(file));
    send(res, 404, 'text/plain', '');
  });
  await new Promise<void>(ok => server.listen(0, '127.0.0.1', ok)); origin = 'http://127.0.0.1:' + (server.address() as AddressInfo).port;
});
test.afterAll(async () => { server.closeAllConnections(); await new Promise<void>(ok => server.close(() => ok())); });
test.beforeEach(() => { answer = { status: 200, body: VARIANTS.empty }; requests = 0; });
const card = (page: Page) => page.getByTestId('work-summary');
async function open(page: Page, props: Record<string, unknown> = {}, size = { width: 1440, height: 900 }) {
  await page.addInitScript(HOLD); await page.setViewportSize(size); await page.route('**/*', route => new URL(route.request().url()).origin === origin ? route.fallback() : route.abort());
  await page.goto(origin + '/#' + encodeURIComponent(JSON.stringify(props))); await expect(card(page)).toBeVisible(); await expect(card(page)).toHaveAttribute('aria-busy', 'false', { timeout: 10_000 });
}
const reread = async (page: Page, status: number, body: unknown, situation: string) => { answer = { status, body }; await page.getByRole('button', { name: 'Leer de nuevo' }).click(); await expect(card(page)).toHaveAttribute('data-situation', situation, { timeout: 10_000 }); };
const overflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);

test('LAS SITUACIONES SE VEN DISTINTAS: vacía, con trabajo, ilegible, sin cobertura, no disponible, bloqueada, no registrada e inválida tienen titular y datos propios; lo desconocido nunca muestra cero', async ({ page }, ti) => {
  await open(page); const heads: Record<string, string> = {};
  const head = async (key: string) => { heads[key] = (await card(page).locator('.wks-head').innerText()).trim(); };
  await expect(card(page)).toHaveAttribute('data-situation', 'empty'); await head('empty'); await expect(card(page)).toContainText('cobertura completa'); await expect(card(page).locator('.wks-counts [data-kind="drafts"]')).toContainText('0 borradores'); await expect(page.getByRole('button', { name: 'Abrir Hoy' })).toHaveCount(0);
  await reread(page, 200, VARIANTS.pending, 'pending'); await head('pending'); await expect(card(page).locator('.wks-counts [data-kind="drafts"]')).toContainText('2 borradores recuperables sin enviar'); await expect(card(page).locator('.wks-counts [data-kind="unknown"]')).toContainText('1 guardado por comprobar'); await expect(card(page).locator('.wks-counts [data-kind="other"]')).toContainText('no se suma');
  await expect(page.getByRole('button', { name: 'Abrir Hoy' })).toBeVisible(); await expect(page.getByRole('button', { name: 'Abrir Trabajo por recuperar' })).toBeVisible(); fs.writeFileSync(path.join(root, 'wks-pending.png'), await page.screenshot());
  await reread(page, 200, VARIANTS.unreadable, 'unreadable'); await head('unreadable'); await expect(page.getByTestId('work-quarantine')).toContainText('3 entradas ilegibles'); await expect(card(page)).toContainText('como mínimo'); await expect(card(page).locator('.wks-counts [data-kind="drafts"]')).toContainText('0 borradores');
  await reread(page, 200, VARIANTS.uncovered, 'uncovered'); await head('uncovered'); await expect(card(page)).toContainText('no es cero'); await expect(card(page).locator('.wks-counts')).toHaveCount(0); await expect(card(page)).not.toContainText('0 borradores');
  await reread(page, 200, VARIANTS.unavailable, 'unavailable'); await head('unavailable'); await expect(card(page).locator('.wks-counts')).toHaveCount(0); await expect(card(page)).toContainText('no es cero');
  await reread(page, 401, { error: 'x' }, 'locked'); await head('locked'); await expect(card(page)).toContainText('bloqueado'); await expect(card(page).locator('.wks-counts')).toHaveCount(0);
  await reread(page, 404, {}, 'not-registered'); await head('not-registered'); await expect(card(page)).toContainText('todavía no ofrece'); await expect(card(page)).not.toContainText('Sin trabajo local pendiente');
  await reread(page, 200, { ...VARIANTS.empty, extra: 'campo-nuevo' }, 'invalid'); await head('invalid'); await expect(card(page)).toContainText('Se desconoce cuánto trabajo local hay');
  expect(new Set(Object.values(heads)).size, JSON.stringify(heads)).toBe(Object.keys(heads).length);
});

test('ENLACES: «Abrir Hoy» y «Abrir Trabajo por recuperar» llaman a lo que ofrece el anfitrión; sin enlace se explica en lugar de simular; la lectura repetida solo hace GET', async ({ page }) => {
  answer = { status: 200, body: VARIANTS.pending }; await open(page);
  await page.getByRole('button', { name: 'Abrir Hoy' }).click(); await page.getByRole('button', { name: 'Abrir Trabajo por recuperar' }).click(); expect(await page.evaluate(() => (window as unknown as { __nav: string[] }).__nav)).toEqual(['today', 'recoverable']);
  await page.evaluate(() => (window as unknown as { __render: (p: unknown) => void }).__render({ noLinks: true, identityKey: 'sin-enlaces' })); await expect(card(page)).toHaveAttribute('aria-busy', 'false', { timeout: 10_000 });
  await page.getByRole('button', { name: 'Abrir Hoy' }).click(); await expect(page.getByTestId('work-hint')).toContainText('Abre Hoy desde el menú'); await page.getByRole('button', { name: 'Abrir Trabajo por recuperar' }).click(); await expect(page.getByTestId('work-hint')).toContainText('Trabajo por recuperar');
  expect(await page.evaluate(() => (window as unknown as { __nav: string[] }).__nav)).toEqual(['today', 'recoverable']); expect(requests).toBeGreaterThanOrEqual(2);
});

test('OTRA COPIA: un resumen de otra captura que la esperada no se muestra como actual (ni recuentos ni descarga); sin contexto esperado se muestra su ámbito', async ({ page }) => {
  answer = { status: 200, body: VARIANTS.pending }; await open(page, { expectedContext: OTHER });
  await expect(card(page)).toContainText('de otra copia'); await expect(card(page).locator('.wks-counts')).toHaveCount(0); await expect(card(page).locator('.wks-export')).toHaveCount(0); await expect(page.getByRole('button', { name: 'Abrir Hoy' })).toHaveCount(0);
  await page.evaluate(() => (window as unknown as { __render: (p: unknown) => void }).__render({ expectedContext: 'capture:' + 'a'.repeat(64), identityKey: 'misma' })); await expect(card(page).locator('.wks-counts')).toBeVisible({ timeout: 10_000 });
});

test('DESCARGAS reales: HTML y JSON con nombre y tipo propios, sin texto de borradores ni rutas, HTML autocontenido (se abre sin red) y distinto de una cápsula restaurable', async ({ page, browser }) => {
  answer = { status: 200, body: VARIANTS.pending }; await open(page); await page.locator('.wks-export > summary').click();
  const grab = async (name: string) => { const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name }).click()]); const file = path.join(root, download.suggestedFilename()); await download.saveAs(file); return { name: download.suggestedFilename(), file, text: fs.readFileSync(file, 'utf8') }; };
  const json = await grab('Descargar JSON'), html = await grab('Descargar HTML'); expect([json.name, html.name]).toEqual(['resumen-trabajo-local-2026-11-06.json', 'resumen-trabajo-local-2026-11-06.html']);
  expect(JSON.parse(json.text).notice).toContain('no se puede restaurar'); expect(JSON.parse(json.text).counts).toEqual({ drafts: 2, unknownOutcome: 1, settled: 5, otherContext: 1 }); expect(Buffer.byteLength(json.text)).toBeLessThan(8 * 1024);
  for (const f of [json, html]) { expect(f.text).not.toMatch(/task-|contraseña|C:\\|\/Users\/|a{32}/); expect(f.text).not.toMatch(/restaurable(?! )|cápsula/i); }
  await expect(page.locator('.wks-export')).toContainText('No es una copia ni se puede restaurar'); await expect(page.locator('.wks-export [role="status"]')).toContainText('no es una copia restaurable');
  const offline = await browser.newPage(); const attempts: string[] = []; await offline.route('**/*', route => { const url = route.request().url(); if (url.startsWith('file:')) return route.continue(); attempts.push(url); return route.abort(); });
  await offline.goto('file:///' + html.file.replace(/\\/g, '/')); await expect(offline.locator('h1')).toHaveText('Resumen del trabajo local'); await expect(offline.locator('table')).toContainText('Borradores sin enviar'); expect(attempts.filter(u => !u.startsWith('file:'))).toEqual([]); await offline.close();
});

test('IDENTIDAD y RESPUESTA TARDÍA con transporte que IGNORA AbortSignal: al cambiar la clave se descarta lo anterior y la lectura tardía no sobrescribe la nueva', async ({ page }) => {
  answer = { status: 200, body: VARIANTS.empty }; await open(page);
  await page.evaluate(() => { (window as unknown as { __hold: boolean }).__hold = true; }); answer = { status: 200, body: VARIANTS.pending };
  await page.evaluate(() => (window as unknown as { __render: (p: unknown) => void }).__render({ identityKey: 'A' }));        // la lectura de A (con trabajo) queda retenida
  answer = { status: 200, body: VARIANTS.uncovered }; await page.evaluate(() => (window as unknown as { __render: (p: unknown) => void }).__render({ identityKey: 'B' }));   // B lee «sin cobertura»
  await expect(card(page)).toHaveAttribute('data-situation', 'uncovered', { timeout: 10_000 });
  expect(await page.evaluate(() => (window as unknown as { __release: () => boolean }).__release())).toBe(true); await page.waitForTimeout(400);
  await expect(card(page)).toHaveAttribute('data-situation', 'uncovered'); await expect(card(page).locator('.wks-counts')).toHaveCount(0);
});

for (const width of [390, 320]) test('MÓVIL ' + width + ' px y TECLADO: la tarjeta cabe sin desbordamiento, los controles miden ≥ 44 px y las acciones se alcanzan con Tab/Enter', async ({ page }, ti) => {
  answer = { status: 200, body: VARIANTS.pending }; await open(page, {}, { width, height: 900 }); expect(await overflow(page)).toBe(true);
  for (const name of ['Abrir Hoy', 'Abrir Trabajo por recuperar', 'Leer de nuevo']) expect((await page.getByRole('button', { name }).boundingBox())!.height, name).toBeGreaterThanOrEqual(43);
  expect((await page.locator('.wks-export > summary').boundingBox())!.height).toBeGreaterThanOrEqual(43);
  await page.getByRole('button', { name: 'Abrir Hoy' }).focus(); await page.keyboard.press('Enter'); await page.keyboard.press('Tab'); await expect(page.getByRole('button', { name: 'Abrir Trabajo por recuperar' })).toBeFocused(); await page.keyboard.press('Enter');
  expect(await page.evaluate(() => (window as unknown as { __nav: string[] }).__nav)).toEqual(['today', 'recoverable']); fs.writeFileSync(path.join(root, 'wks-' + width + '.png'), await page.screenshot());
});
