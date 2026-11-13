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
import type { ContinuityEvidenceApiResponse } from '../../shared/continuity-evidence-api.js';
import type { PassportInputs, SourceInput } from '../../shared/continuity-passport.js';

// DOM real (Chromium) del PASAPORTE (unidad 214) con un arnés mínimo: el componente real, el modelo real y la evidencia de copia del servicio REAL de continuidad
// (createBaseApp + registerContinuityEvidenceApi, datos ficticios). NO es la App ni Integraciones: el pasaporte todavía no tiene consumidor montado (ver el traspaso).
const repo = process.cwd(), root = path.resolve(process.env.PLANB_PP214_ROOT ?? path.join(repo, 'tests', '.tmp', 'pp214-' + randomUUID().slice(0, 8)));
const NOW = Date.parse('2026-11-05T12:00:00.000Z'), T = (minutes: number) => new Date(NOW - minutes * 60_000).toISOString();
const ENTRY = `import { createRoot } from 'react-dom/client';
import { ContinuityPassport } from ${JSON.stringify(path.join(repo, 'src', 'ContinuityPassport.tsx').replace(/\\/g, '/'))};
import { buildPassport } from ${JSON.stringify(path.join(repo, 'shared', 'continuity-passport.ts').replace(/\\/g, '/'))};
import ${JSON.stringify(path.join(repo, 'src', 'styles.css').replace(/\\/g, '/'))}; import ${JSON.stringify(path.join(repo, 'src', 'design-system.css').replace(/\\/g, '/'))}; import ${JSON.stringify(path.join(repo, 'src', 'planb-ui.css').replace(/\\/g, '/'))};
const w = window as any; w.__actions = []; w.__downloads = [];
const input = JSON.parse(decodeURIComponent(location.hash.slice(1)));
const manual = new URLSearchParams(location.search).get('download') === 'native';
createRoot(document.getElementById('root')!).render(<main style={{ padding: 16, maxWidth: 900 }}><ContinuityPassport passport={buildPassport(input)} onAction={action => w.__actions.push(action)} {...(manual ? {} : { onDownload: (file: any) => w.__downloads.push(file) })} /></main>);
`;
let server: Server, base = '';
async function evidence(): Promise<ContinuityEvidenceApiResponse> {
  const { app, store } = await createBaseApp({ dbPath: ':memory:', root: '.', staticDir: 'none' });
  try {
    const snapshot = makeFixture('agency'); snapshot.capturedAt = T(45);
    store.importSnapshot(snapshot); store.saveGeneration(makeDemoSpec(snapshot), { provider: 'demo', model: null, generatedAt: T(44), prompt: '', approved: false }); store.activate();
    registerContinuityEvidenceApi(app, store, () => NOW); await app.ready();
    return (await app.inject({ url: '/api/v7/continuity/evidence', headers: { host: '127.0.0.1:4513', origin: 'http://127.0.0.1:4513' } })).json() as ContinuityEvidenceApiResponse;
  } finally { await app.close(); }
}
test.beforeAll(async () => {
  fs.mkdirSync(path.join(root, 'out'), { recursive: true }); fs.writeFileSync(path.join(root, 'entry.tsx'), ENTRY);
  await build({ entryPoints: [path.join(root, 'entry.tsx')], bundle: true, outdir: path.join(root, 'out'), format: 'iife', jsx: 'automatic', logLevel: 'error', loader: { '.png': 'dataurl', '.svg': 'dataurl', '.woff2': 'dataurl', '.woff': 'dataurl' }, define: { 'process.env.NODE_ENV': '"production"' } });
  const html = '<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Pasaporte</title><link rel="stylesheet" href="/out/entry.css"></head><body><div id="root"></div><script src="/out/entry.js"></script></body></html>';
  server = createServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://x');
    if (url.pathname === '/') { response.setHeader('content-type', 'text/html; charset=utf-8'); response.end(html); return; }
    const file = path.join(root, 'out', path.basename(url.pathname));
    if (url.pathname.startsWith('/out/') && fs.existsSync(file)) { response.setHeader('content-type', file.endsWith('.css') ? 'text/css' : 'text/javascript'); response.end(fs.readFileSync(file)); return; }
    response.statusCode = 404; response.end('');
  });
  await new Promise<void>(ok => server.listen(0, '127.0.0.1', ok)); base = 'http://127.0.0.1:' + (server.address() as AddressInfo).port;
});
test.afterAll(async () => { await new Promise<void>(ok => server.close(() => ok())); });

const read = <V,>(value: V, at: string | null = T(1)): SourceInput<V> => ({ status: 'read', at, value });
const none = <V,>(): SourceInput<V> => ({ status: 'not-provided', at: null, value: null });
const hubspotStale = { format: 'planb-hubspot-read-check-api-v1', configured: true, portal: { id: '12345', mode: 'rehearsal' }, consent: { reads: 5, writes: 0, freshnessMinutes: 15, allowed: true, reason: null }, running: null,
  view: { state: 'saved_unchecked', fresh: false, label: 'x', detail: 'caducó', environment: 'rehearsal', checkedAt: T(40) },
  evidence: { checkedAt: T(40), freshUntil: T(25), state: 'partial', environment: 'rehearsal', accountType: 'SANDBOX', portalId: '12345', objects: [{ entity: 'contacts', outcome: 'readable', httpStatus: 200 }, { entity: 'companies', outcome: 'readable', httpStatus: 200 }, { entity: 'deals', outcome: 'forbidden', httpStatus: 403 }, { entity: 'tasks', outcome: 'readable', httpStatus: 200 }], retryAfterSeconds: null, requests: 5, truncated: 0, blocked: 0, durationMs: 700, message: 'x' },
  invalidated: null, issue: null, message: null } as unknown as NonNullable<PassportInputs['hubspot']['value']>;
async function inputs(over: Partial<PassportInputs> = {}): Promise<PassportInputs> {
  return { now: NOW, installId: 'a1b2c3d4-0000-4000-8000-000000000001', copy: read(await evidence()), hubspot: read(hubspotStale), work: read({ status: 'read', at: T(2), counts: { drafts: 1, unknownOutcome: 2, settled: 3, otherContext: 0, unreadable: 0 } }),
    relay: read({ rehearsedAt: T(30), captureId: null, outcome: 'completed', destinationOpened: true, wrongIdRejected: true, reconciledOnce: true, included: ['tareas locales', 'historial'], notInherited: ['aprobaciones ejecutables'] }), ...over };
}
async function open(page: Page, input: PassportInputs, size = { width: 1440, height: 900 }, query = '') {
  await page.setViewportSize(size);
  await page.route('**/*', route => new URL(route.request().url()).origin === base ? route.fallback() : route.abort());
  await page.goto(base + '/' + query + '#' + encodeURIComponent(JSON.stringify(input))); await expect(page.getByRole('heading', { name: 'Pasaporte de continuidad', level: 2 })).toBeVisible();
}
const passport = (page: Page) => page.locator('.cpp');
const overflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
const shot = async (page: Page, name: string, testInfo: { attach: (n: string, o: { path: string; contentType: string }) => Promise<void> }) => { const file = path.join(root, name + '.png'); await page.screenshot({ path: file }); await testInfo.attach(name, { path: file, contentType: 'image/png' }); };

test('hoja completa a 1440: las cinco preguntas, primer dato visible y resto plegado, próximo paso con acción, caducado visible y sin red ni errores', async ({ page }, testInfo) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(String(error))); page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await open(page, await inputs());
  for (const q of ['¿De qué copia dispongo?', '¿Qué lectura del CRM se comprobó y cuándo?', '¿Qué trabajo local queda pendiente?', '¿Qué se ensayó al exportar y recuperar?', '¿Qué no se ha demostrado?']) await expect(page.getByRole('heading', { name: q, level: 3 })).toBeVisible();
  await expect(passport(page)).toContainText('Próximo paso:'); await expect(passport(page).locator('.cpp-next')).toContainText('Comprobar la lectura de HubSpot');
  await expect(page.locator('[data-section="read"] .cpp-chip-expired').first()).toHaveText('caducado'); await expect(page.locator('[data-section="read"]')).toContainText('caducó');
  await expect(page.locator('[data-section="copy"] .cpp-claim').first()).toHaveAttribute('data-basis', 'observed'); await expect(page.locator('[data-section="work"]')).toContainText('2 guardados por comprobar');
  await expect(page.locator('[data-section="unproven"] .cpp-claim').first()).toHaveAttribute('data-basis', 'unverified');
  await page.getByRole('button', { name: 'Abrir Integraciones' }).click(); expect(await page.evaluate(() => (window as any).__actions)).toEqual(['open-integrations']);
  expect(await overflow(page)).toBe(true); await shot(page, 'passport-1440', testInfo); expect(errors).toEqual([]);
});

test('datos AUSENTES: todo «sin comprobar», sin cifras inventadas, próximo paso = preparar la copia', async ({ page }) => {
  await open(page, { now: NOW, installId: null, copy: none(), hubspot: none(), work: none(), relay: none() });
  await expect(page.locator('.cpp-claim[data-basis="observed"]')).toHaveCount(0); await expect(page.locator('[data-section="work"] .cpp-claim').first()).toContainText('Sin comprobar'); await expect(passport(page).locator('.cpp-next')).toContainText('Preparar o activar una copia local');
  await expect(page.locator('[data-section="work"]')).not.toContainText(/\b0 /);
  await expect(page.getByRole('button', { name: 'Abrir la preparación' })).toBeVisible();
});

test('CONTENIDO HOSTIL y textos largos: se muestra como texto, no crea elementos, no rompe el diseño y las rutas del equipo no aparecen', async ({ page }) => {
  const long = 'palabra'.repeat(800);
  await open(page, await inputs({ relay: read({ rehearsedAt: T(30), captureId: null, outcome: 'completed', destinationOpened: true, wrongIdRejected: true, reconciledOnce: true, included: ['<img src=x onerror="window.__pwned=1">', '"><script>window.__pwned=2</script>', 'C:\\Users\\iresh\\secreto\\clave.txt', long], notInherited: [] }) }), { width: 390, height: 900 });
  await passport(page).locator('[data-section="rehearsal"] summary').click();
  expect(await page.evaluate(() => (window as any).__pwned)).toBeUndefined(); await expect(passport(page).locator('img, script, iframe')).toHaveCount(0);
  await expect(passport(page).locator('[data-section="rehearsal"]')).toContainText('<img src=x'); await expect(passport(page)).not.toContainText('iresh'); await expect(passport(page)).not.toContainText('clave.txt');
  expect(await overflow(page)).toBe(true);
});

for (const width of [390, 320]) test('MÓVIL ' + width + ' px: sin desbordamiento, controles ≥ 44 px y manejo por teclado (Tab, Enter en el próximo paso y en los plegables)', async ({ page }, testInfo) => {
  await open(page, await inputs(), { width, height: 900 });
  expect(await overflow(page)).toBe(true);
  const next = page.getByRole('button', { name: 'Abrir Integraciones' }); const box = await next.boundingBox(); expect(box!.height).toBeGreaterThanOrEqual(43);
  const summary = page.locator('[data-section="work"] summary'); await summary.focus(); await page.keyboard.press('Enter'); await expect(page.locator('[data-section="work"] details')).toHaveAttribute('open', '');
  await page.keyboard.press('Enter'); await expect(page.locator('[data-section="work"] details')).not.toHaveAttribute('open', '');
  await next.focus(); await page.keyboard.press('Enter'); expect(await page.evaluate(() => (window as any).__actions)).toEqual(['open-integrations']);
  await page.locator('.cpp-prov summary').click(); await expect(page.getByRole('button', { name: 'Descargar HTML' })).toBeVisible(); const dl = await page.getByRole('button', { name: 'Descargar JSON' }).boundingBox(); expect(dl!.height).toBeGreaterThanOrEqual(43);
  expect(await overflow(page)).toBe(true); await shot(page, 'passport-' + width, testInfo);
});

test('EXPORTACIÓN manual (descarga real del navegador): HTML y JSON salen de la lista blanca, sin credenciales, fichas ni rutas; no se envía nada a ningún sitio', async ({ page }) => {
  await open(page, await inputs(), { width: 1440, height: 900 }, '?download=native'); await page.locator('.cpp-prov summary').click();
  const [htmlDownload] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Descargar HTML' }).click()]); expect(htmlDownload.suggestedFilename()).toBe('pasaporte-continuidad-2026-11-05.html');
  const html = fs.readFileSync((await htmlDownload.path())!, 'utf8'); expect(html).toContain('Pasaporte de continuidad'); expect(html).not.toMatch(/<script|https?:\/\//i); expect(html).toMatch(/Content-Security-Policy/);
  const [jsonDownload] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Descargar JSON' }).click()]); const json = JSON.parse(fs.readFileSync((await jsonDownload.path())!, 'utf8'));
  expect(json.format).toBe('planb-continuity-passport-v1'); expect(Object.keys(json).sort()).toEqual(['format', 'generatedAt', 'identity', 'mixedContexts', 'nextStep', 'notice', 'provenance', 'sections']);
  expect(JSON.stringify(json)).not.toMatch(/token|password|Bearer|\.planb-key|AppData/i); await expect(passport(page).locator('.cpp-notice')).toContainText('No se envió a ningún sitio');
});

test('COPIAS DISTINTAS: un ensayo hecho con otra captura se separa y no acredita la copia actual', async ({ page }) => {
  await open(page, await inputs({ relay: read({ rehearsedAt: T(30), captureId: 'capture:' + 'f'.repeat(64), outcome: 'completed', destinationOpened: true, wrongIdRejected: true, reconciledOnce: true, included: [], notInherited: [] }) }));
  await expect(passport(page).locator('.cpp-banner')).toContainText('más de una copia'); await passport(page).locator('[data-section="rehearsal"] summary').first().click();
  await expect(passport(page).locator('[data-section="rehearsal"]')).toContainText('OTRA captura'); await expect(passport(page).locator('[data-section="rehearsal"] .cpp-chip-expired')).toBeVisible();
});
