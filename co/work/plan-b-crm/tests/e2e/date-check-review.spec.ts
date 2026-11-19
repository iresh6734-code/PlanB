import { expect, test, type Page } from '@playwright/test';
import { build } from 'esbuild';
import { spawn, type ChildProcess } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// «REVISAR UNA DECISIÓN» EN NAVEGADOR REAL (unidad CLAUDE-OPUS-DATE-CHECK-REVIEW).
// Servidor REAL (createBaseApp + mountDateCheck + mountDateCheckReview) en proceso propio, SQLite de archivo cifrado, reloj fijo y red exterior bloqueada.
// Las dos decisiones se crean por las rutas públicas de Comprobar una fecha (ya probadas en su propio recorrido). Después, en la pantalla: cierre cumplido, cierre con
// proveedor tarde perdiendo el acuse y repitiendo con la misma clave, REINICIO del proceso y reapertura. Capturas en PLANB_REVIEW_SHOTS.

// La decisión se toma el lunes 9 (reloj del caso) y el desenlace se registra el viernes 20: cada montaje con su reloj.
const REPO = process.cwd(), NOW = '2026-11-20T10:00:00.000Z', DECIDED = '2026-11-09T08:30:00.000Z';
const WORK = fs.mkdtempSync(path.join(os.tmpdir(), 'planb-date-check-review-e2e-'));
const SHOTS = process.env.PLANB_REVIEW_SHOTS ?? path.join(WORK, 'shots');
const url = (relative: string) => JSON.stringify(pathToFileURL(path.join(REPO, relative)).href);
const SERVER = `import fs from 'node:fs';
import { createBaseApp } from ${url('server/app.ts')};
import { mountDateCheck } from ${url('server/date-check-mount.ts')};
import { mountDateCheckReview } from ${url('server/date-check-review-mount.ts')};
import { makeDemoSpec, makeFixture } from ${url('shared/fixtures.ts')};
const dir = process.env.CASE_DIR!, NOW = Date.parse(${JSON.stringify(NOW)}), DECIDED = Date.parse(${JSON.stringify(DECIDED)});
const { app, store } = await createBaseApp({ root: ${JSON.stringify(REPO)}, dbPath: dir + '/data.sqlite', staticDir: process.env.STATIC_DIR! });
mountDateCheck(app, store, { clock: () => DECIDED });
mountDateCheckReview(app, store, { clock: () => NOW });
if (!store.snapshot) {
  const snapshot = makeFixture('agency');
  store.importSnapshot(snapshot, false);
  store.saveGeneration(makeDemoSpec(snapshot), { provider: 'demo', model: null, generatedAt: new Date(NOW).toISOString(), prompt: '', approved: false });
  store.activate();
}
app.addHook('onResponse', async (request, reply) => { fs.appendFileSync(dir + '/requests.jsonl', JSON.stringify({ method: request.method, path: request.url.split('?')[0], status: reply.statusCode }) + '\\n'); });
await app.listen({ port: 0, host: '127.0.0.1' });
console.log('LISTENING ' + (app.server.address() as { port: number }).port);
`;

let child: ChildProcess | null = null, origin = '';
const caseDir = path.join(WORK, 'case'), staticDir = path.join(WORK, 'dist');
async function startServer() {
  child = spawn(process.execPath, ['--require', path.join(REPO, 'scripts', 'block-external.cjs'), '--import', 'tsx', path.join(WORK, 'server.mts')], {
    cwd: REPO, env: { ...process.env, CASE_DIR: caseDir, STATIC_DIR: staticDir, NODE_ENV: 'test', NO_COLOR: '1' }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  origin = await new Promise<string>((resolve, reject) => {
    let output = '';
    const timer = setTimeout(() => reject(new Error('El servidor del arnés no arrancó: ' + output)), 60_000);
    child!.stdout!.on('data', chunk => { output += chunk; const match = /LISTENING (\d+)/.exec(output); if (match) { clearTimeout(timer); resolve('http://127.0.0.1:' + match[1]); } });
    child!.stderr!.on('data', chunk => { output += chunk; });
    child!.on('exit', code => { clearTimeout(timer); reject(new Error('El servidor del arnés terminó (' + code + '): ' + output)); });
  });
}
async function stopServer() {
  if (!child) return;
  child.removeAllListeners('exit');
  const done = new Promise(resolve => child!.once('exit', resolve));
  child.kill();
  await done; child = null;
}
const writes = () => fs.readFileSync(path.join(caseDir, 'requests.jsonl'), 'utf8').trim().split('\n').map(line => JSON.parse(line) as { method: string; path: string; status: number })
  .filter(line => line.method !== 'GET').map(line => `${line.method} ${line.path.replace(/[0-9a-f-]{36}/, ':id')} ${line.status}`);
const noOverflow = async (page: Page) => expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);

test.use({ timezoneId: 'Europe/Madrid', locale: 'es-ES' });
test.setTimeout(300_000);
test.beforeAll(async () => {
  fs.mkdirSync(caseDir, { recursive: true }); fs.mkdirSync(staticDir, { recursive: true }); fs.mkdirSync(SHOTS, { recursive: true });
  fs.writeFileSync(path.join(caseDir, '.planb-key'), JSON.stringify({ kind: 'test', data: randomBytes(32).toString('base64') }), { flag: 'wx' });
  fs.writeFileSync(path.join(WORK, 'server.mts'), SERVER);
  await build({
    entryPoints: { page: path.join(REPO, 'tests', 'e2e', 'date-check-review-page.tsx') }, bundle: true, format: 'esm', outdir: staticDir, jsx: 'automatic', logLevel: 'error',
    define: { 'process.env.NODE_ENV': '"production"' }, loader: { '.woff2': 'file', '.woff': 'file', '.svg': 'file', '.png': 'file' },
  });
  fs.writeFileSync(path.join(staticDir, 'index.html'), '<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Revisar una decisión · arnés</title><link rel="stylesheet" href="/page.css"></head><body><div id="root"></div><script type="module" src="/page.js"></script></body></html>');
  await startServer();
});
test.afterAll(async () => { await stopServer(); fs.rmSync(caseDir, { recursive: true, force: true }); });

const FORM = { title: 'Instalar 12 equipos VRF · Oficinas Lumen', requestedAt: '2026-11-13T15:00:00.000Z', durationMinutes: 360, skill: 'vrf', materialKey: 'almacen-sur/sku-vrf-12k', quantity: 12 };
const BOTH = 'alt-o-franja-cruz-jueves+o-frioval-jueves';
async function decide(page: Page, pin: string, title: string) {
  const form = { ...FORM, title }, id = randomUUID();
  const view = await (await page.request.post(origin + '/api/v7/date-check/analyze', { data: { contextRevision: pin, form } })).json();
  expect((await page.request.post(origin + '/api/v7/date-check/checks', { data: { contextRevision: pin, id, form, inputRevision: view.inputRevision } })).status()).toBe(201);
  expect((await page.request.post(`${origin}/api/v7/date-check/checks/${id}/confirm`, { data: { contextRevision: pin, inputRevision: view.inputRevision, alternativeId: BOTH, operationId: randomUUID(), owner: 'Marta (ficción)', nextStep: 'Pedir a Frioval que confirme la entrega.', dueAt: '2026-11-10T17:00:00Z' } })).status()).toBe(201);
}

test('dos cierres de una decisión, el contrafactual aparte del desenlace y la reapertura tras reiniciar', async ({ page }) => {
  const external: string[] = [], consoleErrors: string[] = [];
  page.on('request', request => { if (!request.url().startsWith(origin)) external.push(request.url()); });
  page.on('console', message => { if (message.type() === 'error' && !/Failed to load resource/.test(message.text())) consoleErrors.push(message.text()); });
  page.on('pageerror', error => consoleErrors.push(String(error)));
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(origin + '/');
  const pin = (await (await page.request.get(origin + '/api/v2/state')).json()).workspaceSearchContext.contextRevision as string;
  await decide(page, pin, 'Lumen · cierre cumplido');
  await decide(page, pin, 'Lumen · proveedor tarde');
  const before = writes().length;
  await page.reload();
  const view = page.locator('.drv');
  await expect(view.getByRole('heading', { name: 'Revisar una decisión', level: 2 })).toBeVisible();

  // Cierre cumplido.
  await view.getByRole('button', { name: 'Lumen · cierre cumplido' }).click();
  const detail = view.locator('.drv-detail');
  await expect(detail.getByRole('heading', { name: 'Lumen · cierre cumplido' })).toBeFocused();
  await expect(detail).toContainText(/Fecha que se podía ofrecer\s*viernes, 13 de noviembre.*16:00/);
  await expect(detail).toContainText(/Revisión comparada\s*[0-9a-f]{12} · lunes, 9 de noviembre.*9:30/);
  expect(writes().length, 'abrir no escribe').toBe(before);
  await detail.getByRole('button', { name: 'Se cumplieron las condiciones' }).click();
  await expect(detail.locator('.drv-verdict')).toHaveText('Se cumplió la fecha ofrecida, con las condiciones que la sostenían.');
  await expect(detail.locator('.drv-table')).toContainText('Se cumplió');
  await expect(detail).toContainText(/Desenlace observado\s*viernes, 13 de noviembre.*14:20/);
  await page.screenshot({ path: path.join(SHOTS, '1440-01-cumplido.png'), fullPage: true });

  // Cierre con proveedor tarde, perdiendo el acuse: se repite con la misma clave.
  await view.getByRole('button', { name: 'Lumen · proveedor tarde' }).click();
  await expect(detail.getByRole('heading', { name: 'Lumen · proveedor tarde' })).toBeFocused();
  await page.route('**/api/v7/date-check-review/decisions/*/outcome', async route => { await route.fetch(); await route.abort('failed'); }, { times: 1 });
  await detail.getByRole('button', { name: 'El proveedor llegó tarde' }).click();
  await expect(view.getByRole('alert')).toContainText('No sabemos si se registró');
  await detail.getByRole('button', { name: 'Repetir con la misma clave' }).click();
  await expect(detail.locator('.drv-verdict')).toHaveText('La fecha ofrecida no se cumplió.');
  const row = detail.getByRole('row', { name: /Frioval confirma/ });
  await expect(row).toContainText('Ocurrió más tarde');
  await expect(row).toContainText('4 d 1 h más tarde');
  await expect(row).toContainText('purchasing-fixture · fixture-compras · albarán ALB-5602');
  await expect(detail.getByRole('row', { name: /Cruz vuelve/ })).toContainText('registro parcial');
  await expect(detail.locator('.drv-compare')).toContainText(/Proyección con lo observado\s*martes, 17 de noviembre.*9:30/);
  await expect(detail.locator('.drv-compare')).toContainText(/Desenlace observado\s*martes, 17 de noviembre.*10:10/);
  await expect(detail).toContainText('3 d 19 h 40 min después de lo previsto');
  await expect(detail).toContainText('3 d 19 h se explican por: Frioval confirma las 4 unidades para el jueves 12 a las 10:00.');
  await expect(detail.locator('.drv-residual')).toHaveText('Quedan 40 min por comprobar: ningún hecho registrado los explica.');
  expect(writes().slice(before)).toEqual([
    'POST /api/v7/date-check-review/decisions/:id/outcome 201', 'POST /api/v7/date-check-review/decisions/:id/outcome 201', 'POST /api/v7/date-check-review/decisions/:id/outcome 200',
  ]);
  await page.screenshot({ path: path.join(SHOTS, '1440-02-proveedor-tarde.png'), fullPage: true });

  // REINICIO del proceso: se reabre igual y sin escribir.
  await stopServer(); await startServer();
  await page.goto(origin + '/');
  const afterRestart = writes().length;
  await expect(view.locator('.drv-list')).toContainText('La fecha ofrecida no se cumplió.');
  await view.getByRole('button', { name: 'Lumen · proveedor tarde' }).click();
  await expect(detail.locator('.drv-residual')).toHaveText('Quedan 40 min por comprobar: ningún hecho registrado los explica.');
  await expect(detail.getByRole('button', { name: 'El proveedor llegó tarde' })).toHaveCount(0);
  expect(writes().length).toBe(afterRestart);

  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await noOverflow(page);
    await page.screenshot({ path: path.join(SHOTS, `${width}-proveedor-tarde.png`), fullPage: true });
  }
  expect(external).toEqual([]);
  expect(consoleErrors).toEqual([]);
});
