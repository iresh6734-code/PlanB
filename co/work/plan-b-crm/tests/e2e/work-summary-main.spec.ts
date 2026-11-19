import { test, expect, type Page } from '@playwright/test';
import { build as viteBuild } from 'vite';
import react from '@vitejs/plugin-react';
import { build as bundle } from 'esbuild';
import { spawn, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import { randomBytes, createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { Store } from '../../server/store.js';
import { makeFixture, makeDemoSpec } from '../../shared/fixtures.js';
import { WORK_SUMMARY_ROUTE, WorkSummarySchema } from '../../shared/work-summary.js';

process.env.NODE_ENV = 'test';
const repo = process.cwd();
const root = fs.mkdtempSync(path.resolve('tests/.tmp/summary-main284-'));
const install = path.join(root, 'installation'), data = path.join(install, 'data');
const password = 'ficticia-main-summary-284-pruebas';
let child: ChildProcess | undefined, origin = '', writes = 0, external = 0;
let beforeDigest = '';
const pageErrors: string[] = [];
const gate = () => { let release!: () => void; const promise = new Promise<void>(resolve => { release = resolve; }); return { promise, release }; };
const sha = (p: string) => createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const databaseDigest = () => {
  const db = new DatabaseSync(path.join(data, 'planb.sqlite'), { readOnly: true });
  try {
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all() as { name: string }[];
    return createHash('sha256').update(JSON.stringify(tables.map(({ name }) => [name, db.prepare('SELECT * FROM "' + name.replaceAll('"', '""') + '"').all().map(row => JSON.stringify(row)).sort()]))).digest('hex');
  } finally { db.close(); }
};

test.beforeAll(async () => {
  fs.mkdirSync(install); fs.mkdirSync(data); fs.mkdirSync(path.join(root, 'tmp'));
  const main = fs.readFileSync(path.join(repo, 'server/main.ts'), 'utf8');
  expect(main.split('registerWorkSummaryApi(app, store, { covers: () => false });')).toHaveLength(2);
  const previousNodeEnv = process.env.NODE_ENV;
  try {
    // The server/seed need the test key. The shipped UI must use React's production runtime, not test-mode StrictMode effects.
    process.env.NODE_ENV = 'production';
    await viteBuild({ root: repo, mode: 'production', configFile: false, envDir: path.join(root, 'empty-env'), base: './', plugins: [react()], logLevel: 'error', build: { outDir: path.join(install, 'dist'), emptyOutDir: false, minify: false } });
  } finally { if (previousNodeEnv === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previousNodeEnv; }
  const assets = path.join(install, 'dist/assets');
  const client = fs.readdirSync(assets).filter(name => name.endsWith('.js')).map(name => fs.readFileSync(path.join(assets, name), 'utf8')).join('\n');
  expect(client).not.toContain('react-dom-client.development.js');
  fs.writeFileSync(path.join(root, 'client-mode.json'), JSON.stringify({ mode: 'production', developmentRuntime: false }));
  await bundle({ entryPoints: [path.join(repo, 'server/main.ts')], outfile: path.join(install, 'build/server.mjs'), bundle: true, platform: 'node', format: 'esm', logLevel: 'error', banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" } });
  fs.copyFileSync(path.join(repo, 'scripts/block-external.cjs'), path.join(install, 'build/block-external.cjs'));
  fs.writeFileSync(path.join(data, '.planb-key'), JSON.stringify({ kind: 'test', data: randomBytes(32).toString('base64') }), { flag: 'wx' });
  const store = new Store(path.join(data, 'planb.sqlite'));
  try { const snapshot = makeFixture('agency'); store.importSnapshot(snapshot); store.saveGeneration(makeDemoSpec(snapshot), { provider: 'demo', model: null, generatedAt: '2026-11-08T09:00:00Z', prompt: '', approved: false }); store.activate(); }
  finally { store.close(); }
  const probe = createServer(); await new Promise<void>(resolve => probe.listen(0, '127.0.0.1', resolve));
  const port = (probe.address() as { port: number }).port; await new Promise<void>(resolve => probe.close(() => resolve())); origin = 'http://127.0.0.1:' + port;
  const allowed = new Set(['path', 'systemroot', 'windir', 'comspec', 'pathext', 'lang', 'tz']);
  const env = { ...Object.fromEntries(Object.entries(process.env).filter(([key]) => allowed.has(key.toLowerCase()))), NODE_ENV: 'test', PLANB_PORT: String(port), PLANB_DATA_DIR: data, TEMP: path.join(root, 'tmp'), TMP: path.join(root, 'tmp'), TMPDIR: path.join(root, 'tmp') };
  child = spawn(process.execPath, ['--require', path.join(install, 'build/block-external.cjs'), path.join(install, 'build/server.mjs')], { cwd: install, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '';
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('main no arrancó: ' + output)), 60000);
    child!.stdout!.on('data', value => { output += String(value); if (output.includes('Abre ' + origin)) { clearTimeout(timer); resolve(); } });
    child!.stderr!.on('data', value => { output += String(value); });
    child!.once('exit', code => { clearTimeout(timer); reject(new Error('main terminó ' + code + ': ' + output)); });
  });
  fs.writeFileSync(path.join(root, 'process.json'), JSON.stringify({ pid: child.pid, origin, binary: sha(path.join(install, 'build/server.mjs')) }));
});
test.afterAll(async () => {
  if (child && child.exitCode === null && child.signalCode === null) { const current = child; const closed = new Promise<void>(resolve => current.once('close', () => resolve())); current.kill(); await closed; }
  fs.writeFileSync(path.join(root, 'closed.json'), JSON.stringify({ pid: child?.pid, exitCode: child?.exitCode, signal: child?.signalCode, at: new Date().toISOString() }));
});
test.beforeEach(async ({ page }) => {
  writes = 0; external = 0; pageErrors.length = 0;
  page.on('pageerror', error => pageErrors.push(String(error)));
  await page.route('**/*', route => {
    if (new URL(route.request().url()).origin !== origin) { external++; return route.abort(); }
    if (!['GET', 'HEAD'].includes(route.request().method())) { writes++; return route.abort(); }
    return route.fallback();
  });
  const status = await page.request.get(origin + '/api/v2/auth/status').then(r => r.json()) as { configured: boolean };
  expect((await page.request.post(origin + '/api/v2/auth/' + (status.configured ? 'login' : 'setup'), { headers: { origin }, data: { password } })).status()).toBe(200);
  beforeDigest = databaseDigest();
});
test.afterEach(async ({ page }) => { await page.unrouteAll({ behavior: 'ignoreErrors' }); expect(writes).toBe(0); expect(external).toBe(0); expect(pageErrors).toEqual([]); expect(databaseDigest()).toBe(beforeDigest); });
async function open(page: Page) { await page.goto(origin); await expect(page).toHaveTitle('Plan B · Tu CRM sigue contigo'); await page.locator('.sidebar').getByRole('button', { name: 'Continuidad', exact: true }).click(); await page.getByRole('tab', { name: 'Evidencia e impacto', exact: true }).click(); }
const card = (page: Page) => page.getByTestId('work-summary');
const settled = (page: Page) => expect(card(page)).toHaveAttribute('aria-busy', 'false');

test('main registra una sola lectura protegida y la App comparte desconocido con el pasaporte, sin sondeo propio', async ({ page }) => {
  expect((await fetch(origin + WORK_SUMMARY_ROUTE)).status).toBe(401);
  const response = await page.request.get(origin + WORK_SUMMARY_ROUTE); expect(response.status()).toBe(200); expect(response.headers()['cache-control']).toBe('no-store');
  const s = WorkSummarySchema.parse(await response.json()); expect(s.coverage).toBe('none'); expect(s.counts).toBeNull(); expect(s.quarantine).toBeNull(); expect(s.provenance).toBe('durable');
  let reads = 0; page.on('request', request => { if (new URL(request.url()).pathname === WORK_SUMMARY_ROUTE) reads++; });
  await open(page); await settled(page); await expect(card(page)).toHaveAttribute('data-situation', 'uncovered'); await expect(card(page)).toContainText('desconocido, no es cero'); await expect(card(page).locator('.wks-counts')).toHaveCount(0);
  expect(reads).toBe(1); await card(page).getByRole('button', { name: 'Leer de nuevo', exact: true }).click(); await settled(page); expect(reads).toBe(2);
  await page.waitForTimeout(3000); expect(reads).toBe(2);
});

test('el trabajo espera al pin de evidencia autorizada, no acredita una respuesta por adelantado', async ({ page }) => {
  const held = gate(); let requested = 0, waiting = 0, evidencePin: string | null = null, workPin: string | null = null;
  page.on('request', request => { if (new URL(request.url()).pathname === WORK_SUMMARY_ROUTE) requested++; });
  await page.route('**/api/v7/continuity/evidence**', async route => { waiting++; const response = await route.fetch(); const body = await response.json(); expect(body.available).toBe(true); evidencePin = body.context.captureId; await held.promise; await route.fulfill({ response }); });
  await page.route('**' + WORK_SUMMARY_ROUTE, async route => { const response = await route.fetch(); workPin = WorkSummarySchema.parse(await response.json()).scope.context; await route.fulfill({ response }); });
  try { await open(page); await expect.poll(() => waiting).toBeGreaterThan(0); await expect(page.getByTestId('work-summary-awaiting-context')).toBeVisible(); expect(requested).toBe(0); held.release(); await settled(page); expect(requested).toBe(1); expect(evidencePin).toMatch(/^capture:[a-f0-9]{64}$/); expect(workPin).toBe(evidencePin); }
  finally { held.release(); }
});

test('resumen de otra captura: tarjeta y pasaporte no presentan sus cifras como actuales', async ({ page }) => {
  await page.route('**' + WORK_SUMMARY_ROUTE, async route => {
    const response = await route.fetch(), body = await response.json();
    await route.fulfill({ response, json: { ...body, scope: { kind: 'active-copy', context: 'capture:' + 'f'.repeat(64) }, coverage: 'complete', counts: { drafts: 91, unknownOutcome: 0, settled: 0, otherContext: 0 }, quarantine: { unreadable: 0 } } });
  });
  await open(page); await settled(page); await expect(card(page)).toContainText('otra copia'); await expect(card(page).locator('.wks-counts')).toHaveCount(0); await expect(page.locator('.cph')).not.toContainText('91 borradores');
});

test('releer evidencia retira la consulta anterior incluso si el transporte ignora AbortSignal', async ({ page }) => {
  await page.addInitScript(route => {
    const original = window.fetch.bind(window);
    (window as unknown as { workResponses: number }).workResponses = 0;
    window.fetch = (input, init) => {
      const matched = String(input).includes(route), pending = original(input, matched ? { ...init, signal: undefined } : init);
      return matched ? pending.then(response => { (window as unknown as { workResponses: number }).workResponses++; return response; }) : pending;
    };
  }, WORK_SUMMARY_ROUTE);
  const held = gate(); let reads = 0;
  await page.route('**' + WORK_SUMMARY_ROUTE, async route => {
    reads++; const response = await route.fetch();
    if (reads !== 1) return route.fulfill({ response });
    const body = await response.json(); await held.promise;
    await route.fulfill({ response, json: { ...body, coverage: 'complete', counts: { drafts: 91, unknownOutcome: 0, settled: 0, otherContext: 0 }, quarantine: { unreadable: 0 } } });
  });
  try {
    await open(page); await expect.poll(() => reads).toBe(1); await expect(page.locator('.cph')).toHaveAttribute('aria-busy', 'false');
    await page.locator('.cph').getByRole('button', { name: 'Leer el estado guardado', exact: true }).click();
    await expect.poll(() => reads).toBe(2); await settled(page); await expect(card(page)).toHaveAttribute('data-situation', 'uncovered'); held.release();
    await page.waitForFunction(() => (window as unknown as { workResponses: number }).workResponses === 2);
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => resolve())));
    await expect(card(page).locator('.wks-counts')).toHaveCount(0); await expect(page.locator('.cph')).not.toContainText('91 borradores');
  } finally { held.release(); }
});

for (const [status, situation] of [[401, 'locked'], [404, 'not-registered'], [503, 'failed']] as const) test('HTTP ' + status + ': ausencia o fallo no se convierten en cero', async ({ page }) => {
  await page.route('**' + WORK_SUMMARY_ROUTE, route => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify({ error: 'Respuesta ficticia para probar transporte' }) }));
  await open(page); await settled(page); await expect(card(page)).toHaveAttribute('data-situation', situation); await expect(card(page).locator('.wks-counts')).toHaveCount(0);
});

test('descarga manual sin datos privados, teclado y 320px; sigue sin escrituras', async ({ page }) => {
  await open(page); await settled(page); await page.setViewportSize({ width: 320, height: 720 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const reread = card(page).getByRole('button', { name: 'Leer de nuevo', exact: true }); await reread.focus(); await page.keyboard.press('Enter'); await settled(page);
  await card(page).getByText('Descargar este resumen', { exact: true }).click();
  const download = page.waitForEvent('download'); await card(page).getByRole('button', { name: 'Descargar JSON', exact: true }).click();
  const file = await download; const saved = path.join(root, 'summary-export.json'); await file.saveAs(saved);
  const text = fs.readFileSync(saved, 'utf8'); expect(Buffer.byteLength(text)).toBeLessThan(8192); expect(text).not.toMatch(/task-2|expectedRevision|baseline|password|patch|notes/); expect(JSON.parse(text).counts).toBeNull();
  await page.screenshot({ path: path.join(root, 'summary-320.png'), fullPage: true });
});
