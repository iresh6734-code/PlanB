import { expect, test, type Page } from '@playwright/test';
import react from '@vitejs/plugin-react';
import { spawn, type ChildProcess } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'vite';

// «ENSAYAR MI SEMANA» DENTRO DE LA APP COMPILADA (unidad CLAUDE-FABLE-OPERATIONAL-HOST-MOUNT).
// Cliente: la App REAL (index.html → src/main.tsx → App.tsx) compilada con vite a una carpeta temporal; no se toca dist/ ni build/.
// Servidor: createBaseApp con los mismos dos montajes que server/main.ts y server/runtime.ts (que no se pueden arrancar aquí porque bloquean la instancia y sirven dist/).
// SQLite de archivo con clave de prueba, reloj fijo, red exterior bloqueada. Recorrido: navegación → Radar → ficha → «Ensayar mi semana» → decisión → reinicio.

const REPO = process.cwd(), NOW = '2026-11-11T15:00:00.000Z', FOCUS = 'ms-installation-hubspot', TITLE = 'Instalación de 12 equipos en Almacén Norte';
const WORK = fs.mkdtempSync(path.join(os.tmpdir(), 'planb-rehearsal-app-'));
const SHOTS = process.env.PLANB_REHEARSAL_SHOTS ?? path.join(WORK, 'shots');
const url = (relative: string) => JSON.stringify(pathToFileURL(path.join(REPO, relative)).href);
const SERVER = `import fs from 'node:fs';
import { createBaseApp } from ${url('server/app.ts')};
import { mountCommitmentRadar } from ${url('server/commitment-radar-mount.ts')};
import { mountOperationalRehearsal } from ${url('server/operational-rehearsal-mount.ts')};
import { makeDemoSpec, makeFixture } from ${url('shared/fixtures.ts')};
const dir = process.env.CASE_DIR!, NOW = Date.parse(${JSON.stringify(NOW)});
const { app, store } = await createBaseApp({ root: ${JSON.stringify(REPO)}, dbPath: dir + '/data.sqlite', staticDir: process.env.STATIC_DIR!, taskRevisions: true });
mountCommitmentRadar(app, store, { clock: () => NOW });
mountOperationalRehearsal(app, store, { clock: () => NOW });
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
  .filter(line => line.method !== 'GET' && (line.path.startsWith('/api/v7/commitment') || line.path.startsWith('/api/v7/operational-rehearsal'))).map(line => `${line.method} ${line.path} ${line.status}`);

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

async function openFicha(page: Page) {
  await page.goto(origin + '/');
  await page.getByRole('button', { name: 'Radar', exact: true }).click();
}
const ficha = (page: Page) => page.getByRole('dialog');

test('desde la navegación de la App: Radar → ficha → «Ensayar mi semana» → decisión → reinicio', async ({ page }) => {
  const external: string[] = [], errors: string[] = [];
  page.on('request', request => { if (!request.url().startsWith('http://127.0.0.1:') && !request.url().startsWith('data:')) external.push(request.url()); });
  page.on('pageerror', error => errors.push(String(error)));
  await page.setViewportSize({ width: 1440, height: 900 });

  // Los puntos de entrada reales montan lo mismo que este servidor.
  for (const entry of ['server/main.ts', 'server/runtime.ts']) {
    const source = fs.readFileSync(path.join(REPO, entry), 'utf8');
    expect(source, entry).toContain('mountCommitmentRadar(app, store);');
    expect(source, entry).toContain('mountOperationalRehearsal(app, store);');
  }

  await openFicha(page);
  await expect(page.getByRole('button', { name: 'Radar', exact: true })).toHaveAttribute('aria-current', 'page');
  await expect(page.getByRole('heading', { name: 'Radar de compromisos' })).toBeVisible();
  expect(writes()).toEqual([]);
  await page.getByRole('button', { name: 'Activar el escenario de ensayo' }).click();
  await page.getByRole('button', { name: 'Abrir ' + TITLE + ' (ID ' + FOCUS + ')' }).click();
  // La acción secundaria está en la ficha del compromiso.
  const action = ficha(page).getByRole('button', { name: 'Ensayar mi semana' });
  await expect(action).toBeVisible();
  await page.screenshot({ path: path.join(SHOTS, 'app-1440-01-ficha.png') });
  await action.focus(); await page.keyboard.press('Enter');
  await expect(ficha(page)).toHaveCount(0);
  const view = page.locator('.or');
  await expect(view.getByRole('heading', { name: 'Ensayar mi semana', level: 2 })).toBeVisible();
  await expect(view.getByRole('heading', { name: TITLE })).toBeVisible();
  await expect(view.locator('.or-verdict').first()).toContainText('Llega tarde');
  await expect(page.getByRole('button', { name: 'Radar', exact: true })).toHaveAttribute('aria-current', 'page');

  await view.getByRole('button', { name: 'Ensayar', exact: true }).click();
  const results = view.locator('.or-results');
  await expect(results.getByRole('heading', { name: 'Resultado del ensayo' })).toBeFocused({ timeout: 60_000 });
  await expect(results.locator('.or-card')).toHaveCount(5);
  await page.screenshot({ path: path.join(SHOTS, 'app-1440-02-ensayo.png'), fullPage: true });
  expect(writes().filter(line => !line.includes('/analyze'))).toEqual(['POST /api/v7/commitment-radar/activate 201']);

  await results.locator('.or-card').filter({ hasText: 'Usar equipos equivalentes del Almacén Sur' }).getByRole('radio').check();
  const decision = results.locator('.or-decision');
  await decision.getByLabel('Quién se encarga').fill('Marta (ficción)');
  await decision.getByLabel('Siguiente paso concreto').fill('Confirmar con Almacén Sur que los equipos equivalentes están el martes.');
  await decision.getByLabel('Para cuándo').fill('2026-11-12T11:00');
  await decision.getByRole('button', { name: 'Confirmar decisión' }).click();
  await expect(results.locator('.or-receipt').getByRole('heading', { name: 'Decisión registrada' })).toBeFocused({ timeout: 60_000 });
  expect(writes().filter(line => line.includes('/decisions'))).toEqual([`POST /api/v7/commitments/${FOCUS}/decisions 200`]);

  // De vuelta al Radar: la ficha muestra la decisión y el compromiso sigue en riesgo (decidir no lo resuelve).
  await view.getByRole('button', { name: 'Volver al compromiso' }).click();
  await page.getByRole('button', { name: 'Abrir ' + TITLE + ' (ID ' + FOCUS + ')' }).click();
  await expect(ficha(page).locator('.cr-summary')).toContainText('Responsable: Marta (ficción)');
  await expect(ficha(page).locator('.cr-summary')).toContainText('Confirmar con Almacén Sur');
  await page.screenshot({ path: path.join(SHOTS, 'app-1440-03-ficha-con-decision.png') });

  // Reinicio en proceso nuevo: desde la App se reencuentran la decisión y el ensayo, y arrancar o navegar no escriben.
  const before = writes().length;
  await stopServer(); await startServer();
  await openFicha(page);
  await page.getByRole('button', { name: 'Abrir ' + TITLE + ' (ID ' + FOCUS + ')' }).click();
  await expect(ficha(page).locator('.cr-summary')).toContainText('Responsable: Marta (ficción)');
  await ficha(page).getByRole('button', { name: 'Ensayar mi semana' }).click();
  const again = page.locator('.or');
  await expect(again.locator('.or-saved li')).toContainText('Usar equipos equivalentes del Almacén Sur · con decisión registrada · histórico');
  await again.getByRole('button', { name: /Reabrir/ }).click();
  await expect(again.locator('.or-reopened dl > div > dt')).toHaveText(['Ensayo (hipotético)', 'Decisión', 'Resultado observado']);
  expect(writes().length).toBe(before);
  await page.screenshot({ path: path.join(SHOTS, 'app-1440-04-reinicio.png'), fullPage: true });

  // 390 y 320 dentro de la App: el ensayo no desborda en horizontal.
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 800 });
    // Tras el primer ensayo el botón pasa a llamarse «Ensayar de nuevo».
    await again.getByRole('button', { name: /^Ensayar( de nuevo)?$/ }).click();
    await expect(again.getByRole('status')).toHaveText('Ensayo terminado.', { timeout: 60_000 });
    await expect(again.locator('.or-card')).toHaveCount(5);
    expect(await again.evaluate(node => node.scrollWidth - node.clientWidth)).toBeLessThanOrEqual(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
    await page.screenshot({ path: path.join(SHOTS, `app-${width}-ensayo.png`), fullPage: true });
  }
  expect(writes().filter(line => line.includes('/decisions')).length).toBe(1);
  expect(external).toEqual([]);
  expect(errors).toEqual([]);
});
