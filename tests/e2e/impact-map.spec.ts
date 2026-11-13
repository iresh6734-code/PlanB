import { test, expect, type Page } from '@playwright/test';
import { build } from 'esbuild';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createBaseApp } from '../../server/app.js';
import { registerContinuityEvidenceApi } from '../../server/continuity-evidence-api.js';
import { makeDemoSpec, makeFixture } from '../../shared/fixtures.js';
import { buildResponseQueue } from '../../shared/response-queue.js';
import type { ContinuityEvidenceApiResponse } from '../../shared/continuity-evidence-api.js';
import type { ImpactInputs, ContextualSource } from '../../shared/impact-map.js';
import { queueInput } from '../../shared/impact-map.js';

// DOM real (Chromium) del MAPA DE IMPACTO (unidad 215) con un arnés mínimo: componente y modelo reales; evidencia de copia del servicio REAL de continuidad y cola REAL sobre una ficción.
// No es la App: el mapa todavía no tiene consumidor montado (ver el traspaso).
const repo = process.cwd(), root = path.resolve(process.env.PLANB_IM215_ROOT ?? path.join(repo, 'tests', '.tmp', 'im215-' + randomUUID().slice(0, 8)));
const NOW = Date.parse('2026-11-05T12:00:00.000Z'), T = (m: number) => new Date(NOW - m * 60_000).toISOString(), CTX = 'cap:agency';
const p = (f: string) => JSON.stringify(path.join(repo, f).replace(/\\/g, '/'));
const ENTRY = `import { createRoot } from 'react-dom/client';
import { ImpactMap } from ${p('src/ImpactMap.tsx')};
import { buildImpactMap } from ${p('shared/impact-map.ts')};
import ${p('src/styles.css')}; import ${p('src/design-system.css')}; import ${p('src/planb-ui.css')};
const w = window as any; w.__actions = []; w.__downloads = [];
const input = JSON.parse(decodeURIComponent(location.hash.slice(1)));
const native = new URLSearchParams(location.search).get('download') === 'native';
createRoot(document.getElementById('root')!).render(<main style={{ padding: 16, maxWidth: 900 }}><ImpactMap map={buildImpactMap(input)} onAction={a => w.__actions.push(a)} {...(native ? {} : { onDownload: (f: any) => w.__downloads.push(f) })} /></main>);
`;
let server: Server, base = '';
async function evidence(): Promise<ContinuityEvidenceApiResponse> {
  const { app, store } = await createBaseApp({ dbPath: ':memory:', root: '.', staticDir: 'none' });
  try {
    const snapshot = makeFixture('agency'); snapshot.capturedAt = T(45); store.importSnapshot(snapshot); store.saveGeneration(makeDemoSpec(snapshot), { provider: 'demo', model: null, generatedAt: T(44), prompt: '', approved: false }); store.activate();
    registerContinuityEvidenceApi(app, store, () => NOW); await app.ready();
    return (await app.inject({ url: '/api/v7/continuity/evidence', headers: { host: '127.0.0.1:4513', origin: 'http://127.0.0.1:4513' } })).json() as ContinuityEvidenceApiResponse;
  } finally { await app.close(); }
}
test.beforeAll(async () => {
  fs.mkdirSync(path.join(root, 'out'), { recursive: true }); fs.writeFileSync(path.join(root, 'entry.tsx'), ENTRY);
  await build({ entryPoints: [path.join(root, 'entry.tsx')], bundle: true, outdir: path.join(root, 'out'), format: 'iife', jsx: 'automatic', logLevel: 'error', loader: { '.png': 'dataurl', '.svg': 'dataurl', '.woff2': 'dataurl', '.woff': 'dataurl' }, define: { 'process.env.NODE_ENV': '"production"' } });
  const html = '<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Mapa</title><link rel="stylesheet" href="/out/entry.css"></head><body><div id="root"></div><script src="/out/entry.js"></script></body></html>';
  server = createServer((req, res) => { const url = new URL(req.url ?? '/', 'http://x'); if (url.pathname === '/') { res.setHeader('content-type', 'text/html; charset=utf-8'); res.end(html); return; } const f = path.join(root, 'out', path.basename(url.pathname)); if (url.pathname.startsWith('/out/') && fs.existsSync(f)) { res.setHeader('content-type', f.endsWith('.css') ? 'text/css' : 'text/javascript'); res.end(fs.readFileSync(f)); return; } res.statusCode = 404; res.end(''); });
  await new Promise<void>(ok => server.listen(0, '127.0.0.1', ok)); base = 'http://127.0.0.1:' + (server.address() as AddressInfo).port;
});
test.afterAll(async () => { await new Promise<void>(ok => server.close(() => ok())); });
const src = <V,>(value: V | null, status: 'read' | 'unavailable' | 'not-provided' = 'read'): ContextualSource<V> => ({ status, at: T(1), value, context: CTX });
async function inputs(over: Partial<ImpactInputs> = {}, dropContacts = true): Promise<ImpactInputs> {
  const snap = makeFixture('agency'), spec = makeDemoSpec(snap), queue = buildResponseQueue({ spec, records: dropContacts ? snap.records.filter(r => r.entity !== 'contacts') : snap.records, evaluatedAt: NOW, horizonHours: 24, limit: 200 });
  return { now: NOW, expectedContext: CTX, copy: src(await evidence()), inventory: src({ capturedAt: T(45), counts: { contacts: 12, companies: 0, deals: 5, tasks: 18 } }), comparison: src<ImpactInputs['comparison']['value'] & object>(null, 'not-provided'), queue: src(queueInput(queue)),
    work: src({ status: 'read', at: T(2), counts: { drafts: 1, unknownOutcome: 2, settled: 1, otherContext: 0, unreadable: 1 } }), hubspot: { status: 'not-provided', at: null, value: null }, relay: src<NonNullable<ImpactInputs['relay']['value']>>(null, 'not-provided'), evidenceLink: '#/continuidad', ...over };
}
async function open(page: Page, input: ImpactInputs, size = { width: 1440, height: 900 }, query = '') {
  await page.setViewportSize(size); await page.route('**/*', r => new URL(r.request().url()).origin === base ? r.fallback() : r.abort());
  await page.goto(base + '/' + query + '#' + encodeURIComponent(JSON.stringify(input))); await expect(page.getByRole('heading', { name: 'Mapa de impacto', level: 2 })).toBeVisible();
}
const overflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
const shot = async (page: Page, name: string, ti: { attach: (n: string, o: { path: string; contentType: string }) => Promise<void> }) => { const f = path.join(root, name + '.png'); await page.screenshot({ path: f }); await ti.attach(name, { path: f, contentType: 'image/png' }); };

test('1440: resumen de turno primero con la decisión urgente, atención visible, referencias sin comprobar sin decir «borrado», sin errores', async ({ page }, ti) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(String(e))); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await open(page, await inputs());
  const summary = page.getByTestId('shift-summary'); await expect(summary).toContainText('Primera decisión:'); await expect(summary).toContainText('Guardados por comprobar'); await expect(summary).toContainText('Queda 2 operaciones por comprobar');
  await expect(page.locator('[data-row="references:contacts"]')).toContainText('No significa que se haya borrado del CRM'); await expect(page.locator('.imp')).not.toContainText(/se borró|eliminad/i);
  await expect(page.locator('[data-row="coverage:companies"]')).toContainText('no trae registros de empresas'); await expect(page.locator('[data-row="work:unreadable"]')).toContainText('Falta: Falta una superficie');
  await page.getByRole('button', { name: 'Abrir Hoy' }).first().click(); expect(await page.evaluate(() => (window as any).__actions)).toEqual(['open-today']);
  expect(await overflow(page)).toBe(true); await shot(page, 'impact-1440', ti); expect(errors).toEqual([]);
});

for (const width of [390, 320]) test('MÓVIL ' + width + ' px: sin desbordamiento, controles ≥ 44 px y teclado en el botón y en los plegables', async ({ page }, ti) => {
  await open(page, await inputs(), { width, height: 900 }); expect(await overflow(page)).toBe(true);
  const button = page.getByRole('button', { name: 'Abrir Hoy' }).first(); expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(43);
  await button.focus(); await page.keyboard.press('Enter'); expect(await page.evaluate(() => (window as any).__actions)).toEqual(['open-today']);
  const summary = page.locator('.imp-more summary').first(); await summary.focus(); await page.keyboard.press('Enter'); await expect(page.locator('.imp-more').first()).toHaveAttribute('open', '');
  expect(await overflow(page)).toBe(true); await shot(page, 'impact-' + width, ti);
});

test('copia de OTRA captura: se declara aparte y no alimenta la cobertura; sin datos todo es «sin comprobar»', async ({ page }) => {
  const base0 = await inputs({}, false);
  await open(page, { ...base0, inventory: { ...base0.inventory, context: 'cap:otra' } });
  await expect(page.locator('[data-row="other-context:inventory"]')).toContainText('otra captura'); await expect(page.locator('.imp')).not.toContainText('12 registros');
});

test('EXPORTACIÓN manual (descarga real): HTML y JSON salen de la lista blanca con plan de relevo y sin rutas ni credenciales', async ({ page }) => {
  await open(page, await inputs(), { width: 1440, height: 900 }, '?download=native'); await page.locator('.imp-export summary').click();
  const [h] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Descargar HTML' }).click()]); expect(h.suggestedFilename()).toBe('resumen-de-turno-2026-11-05.html');
  const html = fs.readFileSync((await h.path())!, 'utf8'); expect(html).toContain('Plan de relevo'); expect(html).not.toMatch(/<script|https?:\/\//i);
  const [j] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Descargar JSON' }).click()]); const json = JSON.parse(fs.readFileSync((await j.path())!, 'utf8'));
  expect(json.format).toBe('planb-impact-map-v1'); expect(json.summary.evidenceLink).toBe('#/continuidad'); expect(JSON.stringify(json)).not.toMatch(/token|password|AppData|\.planb-key/i);
  await expect(page.locator('.imp-notice')).toContainText('No se envió a ningún sitio');
});
