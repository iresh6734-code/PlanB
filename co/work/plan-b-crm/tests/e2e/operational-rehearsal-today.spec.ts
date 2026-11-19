import { expect, test, type Page } from '@playwright/test';
import { menuItem } from './menu';
import react from '@vitejs/plugin-react';
import { spawn, type ChildProcess } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'vite';

// «ENSAYAR MI SEMANA» DESDE HOY, EN LA APP COMPILADA (unidad CLAUDE-FABLE-OPERATIONAL-TODAY-ENTRY). Mismo arnés que operational-rehearsal-app.spec.ts.
// Cliente: la App REAL (index.html → src/main.tsx → App.tsx) compilada con vite a una carpeta temporal; no se toca dist/ ni build/.
// Servidor: createBaseApp con los mismos dos montajes que server/main.ts y server/runtime.ts (que no se pueden arrancar aquí porque bloquean la instancia y sirven dist/).
// SQLite de archivo con clave de prueba, reloj fijo, red exterior bloqueada. Recorrido: navegación → Radar → ficha → «Ensayar mi semana» → decisión → reinicio.

const REPO = process.cwd(), NOW = '2026-11-11T15:00:00.000Z', FOCUS = 'ms-installation-hubspot', TITLE = 'Instalación de 12 equipos en Almacén Norte';
const WORK = fs.mkdtempSync(path.join(os.tmpdir(), 'planb-rehearsal-today-'));
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

const nav = (page: Page, name: string) => page.getByRole('button', { name, exact: true });
const card = (page: Page) => page.getByRole('complementary', { name: 'Ensayar mi semana' });

test('desde Hoy: aviso del compromiso que no llega → «Ensayar mi semana» → decisión con acuse perdido y reintento sin duplicar', async ({ page }) => {
  const external: string[] = [], errors: string[] = [];
  page.on('request', request => { if (!request.url().startsWith('http://127.0.0.1:') && !request.url().startsWith('data:')) external.push(request.url()); });
  page.on('pageerror', error => errors.push(String(error)));
  await page.setViewportSize({ width: 1440, height: 900 });

  // Hoy, sin escenario del Radar: el aviso ofrece abrir el Radar y leerlo no escribe nada.
  await page.goto(origin + '/');
  await nav(page, 'Hoy').click();
  await expect(card(page)).toContainText('Activa el Radar de compromisos');
  expect(writes()).toEqual([]);
  await card(page).getByRole('button', { name: 'Abrir el Radar' }).click();
  await expect(nav(page, 'Radar')).toHaveAttribute('aria-current', 'page');
  await page.getByRole('button', { name: 'Activar el escenario de ensayo' }).click();
  await expect(page.locator('.cr-item').first()).toBeVisible();

  // Hoy, con el Radar activo: una línea dice qué compromiso no llega y ofrece ensayar. Hoy sigue debajo, intacto.
  await nav(page, 'Hoy').click();
  await expect(card(page)).toContainText(TITLE);
  await expect(card(page)).toContainText('no llega a tiempo con el plan de hoy');
  await expect(card(page)).toHaveAttribute('data-projection', 'late');
  await expect(menuItem(page, 'Tareas de hoy')).toHaveAttribute('aria-current', 'page');
  await page.screenshot({ path: path.join(SHOTS, 'hoy-1440-01-aviso.png') });
  expect(writes()).toEqual(['POST /api/v7/commitment-radar/activate 201']);
  const open = card(page).getByRole('button', { name: 'Ensayar mi semana' });
  await open.focus(); await page.keyboard.press('Enter');
  const view = page.locator('.or');
  await expect(view.getByRole('heading', { name: 'Ensayar mi semana', level: 2 })).toBeVisible();
  await expect(view.getByRole('heading', { name: TITLE })).toBeVisible();
  await expect(nav(page, 'Radar')).toHaveAttribute('aria-current', 'page');

  // Fuentes del Radar proyectadas al ensayo.
  await view.locator('.or-sources summary').click();
  await expect(view.locator('.or-sources li')).toHaveCount(3);
  await expect(view.locator('.or-sources')).toContainText('Entrega · leída (orders-fixture · fixture-orders-a · order-9001');
  await expect(view.locator('.or-sources')).toContainText('el pedido está retenido: se usa la fecha estimada de reposición');
  await expect(view.locator('.or-sources')).toContainText('Lo que una fuente no pudo leer queda como dato desconocido');
  await page.screenshot({ path: path.join(SHOTS, 'hoy-1440-02-ensayo-fuentes.png'), fullPage: true });

  // Decisión con ACUSE PERDIDO: el Radar acepta, pero la anotación en el ensayo no recibe respuesta. Reintentar continúa donde falló y no decide otra vez.
  await view.getByRole('button', { name: 'Ensayar', exact: true }).click();
  const results = view.locator('.or-results');
  await expect(results.locator('.or-card')).toHaveCount(5, { timeout: 60_000 });
  await results.locator('.or-card').filter({ hasText: 'Dividir la instalación en dos partes' }).getByRole('radio').check();
  const decision = results.locator('.or-decision');
  await decision.getByLabel('Quién se encarga').fill('Jon (ficción)');
  await decision.getByLabel('Siguiente paso concreto').fill('Cuadrar con Cruz la segunda mitad de la instalación.');
  await decision.getByLabel('Para cuándo').fill('2026-11-12T12:00');
  await page.route('**/rehearsals/*/link', route => route.abort(), { times: 1 });
  await decision.getByRole('button', { name: 'Confirmar decisión' }).click();
  await expect(decision.getByRole('alert')).toContainText('No se sabe si la decisión llegó a guardarse');
  expect(writes().filter(line => line.includes('/decisions'))).toEqual([`POST /api/v7/commitments/${FOCUS}/decisions 200`]);
  await decision.getByRole('button', { name: 'Reintentar con la misma clave' }).click();
  await expect(results.locator('.or-receipt').getByRole('heading', { name: 'Decisión registrada' })).toBeFocused({ timeout: 60_000 });
  expect(writes().filter(line => line.includes('/decisions')).length).toBe(1);
  expect(writes().filter(line => line.endsWith('/rehearsals 201')).length).toBe(1);

  // El ensayo guardado muestra a qué respuesta y con qué valores corresponde la decisión.
  await view.getByRole('button', { name: /Reabrir/ }).click();
  const reopened = view.locator('.or-reopened');
  await expect(reopened).toContainText('Registrada en el Radar para este compromiso. Jon (ficción) se encarga de: Cuadrar con Cruz');
  await expect(reopened).toContainText('Se preparó para «Dividir la instalación en dos partes».');
  await page.screenshot({ path: path.join(SHOTS, 'hoy-1440-03-decision.png'), fullPage: true });

  // Volver lleva al Radar; y desde Hoy, tras reiniciar, el aviso sigue ahí sin escribir.
  await view.getByRole('button', { name: 'Volver al compromiso' }).click();
  await expect(page.getByRole('heading', { name: 'Radar de compromisos' })).toBeVisible();
  const before = writes().length;
  await stopServer(); await startServer();
  await page.goto(origin + '/');
  await nav(page, 'Hoy').click();
  await expect(card(page)).toContainText('no llega a tiempo con el plan de hoy');
  expect(writes().length).toBe(before);
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 800 });
    await expect(card(page)).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
    expect((await card(page).getByRole('button').boundingBox())!.height).toBeGreaterThanOrEqual(43.5);
    await page.screenshot({ path: path.join(SHOTS, `hoy-${width}-aviso.png`) });
  }
  expect(external).toEqual([]);
  expect(errors).toEqual([]);
});
