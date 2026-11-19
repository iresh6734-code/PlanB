import { expect, test, type Page } from '@playwright/test';
import { menuGroup, menuItem, openSection } from './menu';
import react from '@vitejs/plugin-react';
import { spawn, type ChildProcess } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'vite';

// «COMPROBAR UNA FECHA» Y «REVISAR UNA DECISIÓN» DENTRO DE LA APP COMPILADA (unidad CLAUDE-OPUS-DATE-CHECK-HOST-MOUNT).
// Cliente: la App REAL (index.html → src/main.tsx → App.tsx) compilada con vite a una carpeta temporal; no se toca dist/ ni build/.
// Servidor: createBaseApp con los mismos montajes de ficción que server/main.ts (que no se puede arrancar aquí: bloquea la instancia y sirve dist/).
// Recorrido: navegación → Comprobar una fecha → resultado del caso Almacén Sur → siguiente paso → Revisar una decisión → desenlace → reinicio → reapertura.

const REPO = process.cwd(), NOW = '2026-11-11T15:00:00.000Z';
const WORK = fs.mkdtempSync(path.join(os.tmpdir(), 'planb-date-check-app-'));
const SHOTS = process.env.PLANB_DATE_CHECK_APP_SHOTS ?? path.join(WORK, 'shots');
const url = (relative: string) => JSON.stringify(pathToFileURL(path.join(REPO, relative)).href);
const SERVER = `import fs from 'node:fs';
import { createBaseApp } from ${url('server/app.ts')};
import { mountCommitmentRadar } from ${url('server/commitment-radar-mount.ts')};
import { mountOperationalRehearsal } from ${url('server/operational-rehearsal-mount.ts')};
import { mountDateCheck } from ${url('server/date-check-mount.ts')};
import { mountDateCheckReview } from ${url('server/date-check-review-mount.ts')};
import { makeDemoSpec, makeFixture } from ${url('shared/fixtures.ts')};
const dir = process.env.CASE_DIR!, NOW = Date.parse(${JSON.stringify(NOW)});
const { app, store } = await createBaseApp({ root: ${JSON.stringify(REPO)}, dbPath: dir + '/data.sqlite', staticDir: process.env.STATIC_DIR!, taskRevisions: true });
mountCommitmentRadar(app, store, { clock: () => NOW });
mountOperationalRehearsal(app, store, { clock: () => NOW });
mountDateCheck(app, store, { clock: () => NOW });
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
    const timer = setTimeout(() => reject(new Error('El servidor no arrancó: ' + output)), 60_000);
    child!.stdout!.on('data', chunk => { output += chunk; const match = /LISTENING (\d+)/.exec(output); if (match) { clearTimeout(timer); resolve('http://127.0.0.1:' + match[1]); } });
    child!.stderr!.on('data', chunk => { output += chunk; });
    child!.on('exit', code => { clearTimeout(timer); reject(new Error('El servidor terminó (' + code + '): ' + output)); });
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
  .filter(line => line.method !== 'GET' && line.path.startsWith('/api/v7/date-check')).map(line => `${line.method} ${line.path.replace(/[0-9a-f-]{36}/, ':id')} ${line.status}`);
const noOverflow = async (page: Page) => expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);

test.use({ timezoneId: 'Europe/Madrid', locale: 'es-ES' });
test.setTimeout(300_000);
test.beforeAll(async () => {
  fs.mkdirSync(caseDir, { recursive: true }); fs.mkdirSync(SHOTS, { recursive: true });
  fs.writeFileSync(path.join(caseDir, '.planb-key'), JSON.stringify({ kind: 'test', data: randomBytes(32).toString('base64') }), { flag: 'wx' });
  fs.writeFileSync(path.join(WORK, 'server.mts'), SERVER);
  await build({ root: REPO, configFile: false, envDir: path.join(WORK, 'empty-env'), base: './', mode: 'production', plugins: [react()], logLevel: 'error', build: { outDir: staticDir, emptyOutDir: true, minify: false } });
  await startServer();
});
test.afterAll(async () => { await stopServer(); fs.rmSync(caseDir, { recursive: true, force: true }); });

test('desde la navegación de la App: comprobar el viernes, confirmar, revisar el desenlace y reabrir tras reiniciar', async ({ page }) => {
  const external: string[] = [], consoleErrors: string[] = [];
  page.on('request', request => { if (!request.url().startsWith(origin)) external.push(request.url()); });
  page.on('console', message => { if (message.type() === 'error' && !/Failed to load resource/.test(message.text())) consoleErrors.push(message.text()); });
  page.on('pageerror', error => consoleErrors.push(String(error)));
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(origin + '/');
  // «Comprobar una fecha» vive en el grupo Laboratorio (CLAUDE-UI-NAV-LAB): se despliega primero.
  await menuGroup(page, 'Laboratorio').click();
  const nav = menuItem(page, 'Comprobar una fecha');
  await expect(nav).toBeEnabled();
  await nav.click();
  await expect(nav).toHaveAttribute('aria-current', 'page');
  const screen = page.locator('.dc');
  await expect(screen.getByRole('heading', { name: 'Comprobar una fecha', level: 2 })).toBeVisible();
  await expect(page.locator('.drv').getByRole('heading', { name: 'Revisar una decisión', level: 2 })).toBeVisible();
  await page.screenshot({ path: path.join(SHOTS, 'app-1440-01-entrada.png') });

  await screen.getByRole('button', { name: 'Comprobar' }).click();
  await expect(screen.locator('.dc-summary .dc-verdict')).toHaveText(/^Con lo que hay, no\. Se puede prometer si se confirma: Frioval/, { timeout: 60_000 });
  await expect(screen.locator('.dc-summary')).toContainText(/martes, 17 de noviembre.*15:30/);
  await page.screenshot({ path: path.join(SHOTS, 'app-1440-02-resultado.png'), fullPage: true });

  const form = screen.locator('.dc-confirm');
  await form.getByLabel('Responsable').fill('Marta (ficción)');
  await form.getByRole('button', { name: 'Confirmar' }).click();
  await expect(screen.locator('.dc-receipt')).toContainText('Marta (ficción)');

  // La decisión aparece en «Revisar una decisión», debajo, en la misma página.
  // Sin recargar: al volver a la lista (aquí con el botón Actualizar) aparece la decisión recién confirmada.
  const review = page.locator('.drv');
  await review.getByRole('button', { name: 'Actualizar' }).click();
  await review.getByRole('button', { name: 'Instalar 12 equipos VRF · Oficinas Lumen' }).click();
  await review.getByRole('button', { name: 'El proveedor llegó tarde' }).click();
  await expect(review.locator('.drv-verdict')).toHaveText('La fecha ofrecida no se cumplió.');
  await expect(review.locator('.drv-residual')).toHaveText('Quedan 40 min por comprobar: ningún hecho registrado los explica.');
  expect(writes()).toEqual([
    'POST /api/v7/date-check/analyze 200', 'POST /api/v7/date-check/checks 201', 'POST /api/v7/date-check/checks/:id/confirm 201',
    'POST /api/v7/date-check-review/decisions/:id/outcome 201',
  ]);
  await page.screenshot({ path: path.join(SHOTS, 'app-1440-03-revision.png'), fullPage: true });

  // Reinicio del proceso: desde la navegación se reencuentran la comprobación y su revisión, sin escribir.
  await stopServer(); await startServer();
  await page.goto(origin + '/');
  const before = writes().length;
  await openSection(page, 'Comprobar una fecha');
  await expect(screen.locator('.dc-saved')).toContainText('con siguiente paso · vigente');
  await review.getByRole('button', { name: 'Instalar 12 equipos VRF · Oficinas Lumen' }).click();
  await expect(review.locator('.drv-residual')).toHaveText('Quedan 40 min por comprobar: ningún hecho registrado los explica.');
  expect(writes().length).toBe(before);

  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await noOverflow(page);
    await page.screenshot({ path: path.join(SHOTS, `app-${width}.png`), fullPage: true });
  }
  expect(external).toEqual([]);
  expect(consoleErrors).toEqual([]);
});
