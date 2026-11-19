import { expect, test, type Page } from '@playwright/test';
import { build } from 'esbuild';
import { spawn, type ChildProcess } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// «COMPROBAR UNA FECHA» EN NAVEGADOR REAL (unidad CLAUDE-OPUS-DATE-CHECK-FLOW).
// Servidor REAL (createBaseApp + mountDateCheck) en proceso propio, SQLite de archivo cifrado con clave de prueba, reloj fijo y red exterior bloqueada.
// Lo único ficticio del arnés es la página anfitriona (tests/e2e/date-check-page.tsx). NO es la App montada: prueba lo que se montará.
// Recorrido del caso Almacén Sur: pedir el viernes → ver por qué no cabe y la primera fecha → probar la llegada sola, la franja sola y las dos → abrir la evidencia →
// confirmar UN siguiente paso perdiendo el acuse y repitiendo con la misma clave → REINICIAR el proceso → reencontrarlo → revisión posterior que retira la franja.
// Capturas a 1440, 390 y 320 en PLANB_DATE_CHECK_SHOTS (por defecto, carpeta temporal del sistema).

const REPO = process.cwd(), NOW = '2026-11-11T15:00:00.000Z';
const WORK = fs.mkdtempSync(path.join(os.tmpdir(), 'planb-date-check-e2e-'));
const SHOTS = process.env.PLANB_DATE_CHECK_SHOTS ?? path.join(WORK, 'shots');
const url = (relative: string) => JSON.stringify(pathToFileURL(path.join(REPO, relative)).href);
const SERVER = `import fs from 'node:fs';
import { createBaseApp } from ${url('server/app.ts')};
import { mountDateCheck } from ${url('server/date-check-mount.ts')};
import { makeDemoSpec, makeFixture } from ${url('shared/fixtures.ts')};
const dir = process.env.CASE_DIR!, NOW = Date.parse(${JSON.stringify(NOW)});
const { app, store } = await createBaseApp({ root: ${JSON.stringify(REPO)}, dbPath: dir + '/data.sqlite', staticDir: process.env.STATIC_DIR! });
mountDateCheck(app, store, { clock: () => NOW });
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
const requests = () => fs.readFileSync(path.join(caseDir, 'requests.jsonl'), 'utf8').trim().split('\n').map(line => JSON.parse(line) as { method: string; path: string; status: number });
const writes = () => requests().filter(line => line.method !== 'GET').map(line => `${line.method} ${line.path.replace(/[0-9a-f-]{36}/, ':id')} ${line.status}`);

test.use({ timezoneId: 'Europe/Madrid', locale: 'es-ES' });
test.setTimeout(300_000);
test.beforeAll(async () => {
  fs.mkdirSync(caseDir, { recursive: true }); fs.mkdirSync(staticDir, { recursive: true }); fs.mkdirSync(SHOTS, { recursive: true });
  fs.writeFileSync(path.join(caseDir, '.planb-key'), JSON.stringify({ kind: 'test', data: randomBytes(32).toString('base64') }), { flag: 'wx' });
  fs.writeFileSync(path.join(WORK, 'server.mts'), SERVER);
  await build({
    entryPoints: { page: path.join(REPO, 'tests', 'e2e', 'date-check-page.tsx') }, bundle: true, format: 'esm', outdir: staticDir, jsx: 'automatic', logLevel: 'error',
    define: { 'process.env.NODE_ENV': '"production"' }, loader: { '.woff2': 'file', '.woff': 'file', '.svg': 'file', '.png': 'file' },
  });
  fs.writeFileSync(path.join(staticDir, 'index.html'), '<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Comprobar una fecha · arnés</title><link rel="stylesheet" href="/page.css"></head><body><div id="root"></div><script type="module" src="/page.js"></script></body></html>');
  await startServer();
});
test.afterAll(async () => { await stopServer(); fs.rmSync(caseDir, { recursive: true, force: true }); });

const screen = (page: Page) => page.locator('.dc');
// Si algo desborda, el mensaje nombra los elementos que se salen del ancho visible.
const noOverflow = async (page: Page) => {
  const report = await page.evaluate(() => {
    const width = document.documentElement.clientWidth;
    const offenders = [...document.querySelectorAll('body *')].filter(node => node.getBoundingClientRect().right > width + 1)
      .slice(0, 6).map(node => `${node.tagName.toLowerCase()}.${[...node.classList].join('.')} → ${Math.round(node.getBoundingClientRect().right)}`);
    return { excess: document.documentElement.scrollWidth - width, offenders };
  });
  expect(report.excess, report.offenders.join(' | ')).toBeLessThanOrEqual(1);
};
const BOTH_LABEL = 'Frioval confirma las 4 unidades para el jueves 12 a las 10:00 + Cruz vuelve de la formación el jueves 12 a las 13:00';
const pick = (page: Page, name: string) => screen(page).getByRole('radio', { name, exact: true });

test('del pedido del viernes a un siguiente paso confirmado, de vuelta tras reiniciar y ante una revisión posterior', async ({ page, context }) => {
  const external: string[] = [], consoleErrors: string[] = [];
  page.on('request', request => { if (!request.url().startsWith(origin)) external.push(request.url()); });
  page.on('console', message => { if (message.type() === 'error' && !/Failed to load resource/.test(message.text())) consoleErrors.push(message.text()); });
  page.on('pageerror', error => consoleErrors.push(String(error)));
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(origin + '/');
  const view = screen(page);
  await expect(view.getByRole('heading', { name: 'Comprobar una fecha', level: 2 })).toBeVisible();
  await expect(view.getByLabel('Trabajo')).toHaveValue('Instalar 12 equipos VRF · Oficinas Lumen');
  await expect(view.getByLabel('Fecha pedida')).toHaveValue('2026-11-13');
  await expect(view.getByLabel('Hora límite')).toHaveValue('16:00');
  expect(writes()).toEqual([]);
  await page.screenshot({ path: path.join(SHOTS, '1440-01-solicitud.png'), fullPage: true });

  // Teclado: del campo de unidades al botón Comprobar con Tab y lanzar con Intro. El foco va al resultado.
  await view.getByLabel('Unidades').focus();
  await page.keyboard.press('Tab');
  await expect(view.getByRole('button', { name: 'Comprobar' })).toBeFocused();
  await page.keyboard.press('Enter');
  const summary = view.locator('.dc-summary');
  await expect(summary.getByRole('heading', { name: 'Instalar 12 equipos VRF · Oficinas Lumen' })).toBeFocused({ timeout: 60_000 });
  await expect(summary).toContainText(/viernes, 13 de noviembre.*16:00/);
  await expect(summary).toContainText(/martes, 17 de noviembre.*15:30/);
  await expect(summary.locator('.dc-verdict')).toHaveText('Con lo que hay, no. Se puede prometer si se confirma: Frioval confirma las 4 unidades para el jueves 12 a las 10:00 y Cruz vuelve de la formación el jueves 12 a las 13:00.');
  await expect(summary.locator('.dc-because')).toContainText('Faltan 4 de 12 unidades de Unidad interior VRF 12 kBTU · Almacén Sur');
  await expect(summary.locator('.dc-because')).toContainText('Cruz: quedan 5 h 15 min');
  await expect(summary.locator('.dc-because')).toContainText('Lo ocupa Solar Granja Prado (2 h 45 min, protegida)');
  await expect(summary.locator('.dc-first li').first()).toContainText(/Que Frioval · 4 unidades \(fecha sin confirmar\) llegue a tiempo — antes del lunes, 16 de noviembre.*8:00/);
  expect(writes()).toEqual(['POST /api/v7/date-check/analyze 200']);
  await page.screenshot({ path: path.join(SHOTS, '1440-02-resultado.png'), fullPage: true });

  // La mejor alternativa viene elegida. Con las flechas se recorren las demás: llegada sola, franja sola.
  await expect(pick(page, BOTH_LABEL)).toBeChecked();
  const detail = view.locator('[aria-labelledby="dc-detail-title"]');
  await expect(detail).toContainText('Material: llega a tiempo');
  await expect(detail).toContainText('Personal: hay capacidad');
  await pick(page, BOTH_LABEL).focus();
  await page.keyboard.press('ArrowDown');
  await expect(pick(page, BOTH_LABEL)).not.toBeChecked();
  await expect(view.getByRole('radio', { checked: true })).toHaveCount(1);
  await pick(page, 'Frioval confirma las 4 unidades para el jueves 12 a las 10:00').check();
  await expect(detail).toContainText('Material: llega a tiempo');
  await expect(detail).toContainText('Personal: no hay capacidad');
  await pick(page, 'Cruz vuelve de la formación el jueves 12 a las 13:00').check();
  await expect(detail).toContainText('Material: no llega a tiempo');
  await expect(detail).toContainText('Personal: hay capacidad');
  await pick(page, 'Usar 4 de las unidades reservadas para el pedido 20').check();
  await expect(detail.locator('.dc-because')).toContainText('Rompería la fecha protegida de Entrega del lunes · Pedido 20 (8 equipos VRF)');
  await pick(page, BOTH_LABEL).check();

  // Cada fila de compromiso afectado abre su evidencia.
  const row = detail.getByRole('row', { name: /Entrega del lunes/ });
  await row.getByRole('button', { name: /Ver evidencia/ }).click();
  await expect(detail.getByRole('button', { name: /Ocultar evidencia de Entrega del lunes/ })).toHaveAttribute('aria-expanded', 'true');
  await expect(detail).toContainText('Reserva RES-2020: 8 uds de Unidad interior VRF 12 kBTU');
  await expect(detail).toContainText('Observado · erp-fixture · fixture-erp-sur · reservation RES-2020 · revisión erp-r812');
  await expect(view.locator('.dc-matrix')).toContainText('Frioval entrega el viernes 13 a las 11:00');
  await page.screenshot({ path: path.join(SHOTS, '1440-03-alternativa-y-evidencia.png'), fullPage: true });
  expect(writes(), 'comparar alternativas no escribe').toEqual(['POST /api/v7/date-check/analyze 200']);

  // Confirmar UN siguiente paso. Se pierde el acuse: el servidor guarda, pero la página no recibe la respuesta.
  const form = view.locator('.dc-confirm');
  await form.getByLabel('Responsable').fill('Marta (ficción)');
  await expect(form.getByLabel('Siguiente paso')).toHaveValue(/Que Frioval · 4 unidades \(fecha sin confirmar\) llegue a tiempo: antes del lunes, 16 de noviembre/);
  await page.route('**/api/v7/date-check/checks/*/confirm', async route => { await route.fetch(); await route.abort('failed'); }, { times: 1 });
  await form.getByRole('button', { name: 'Confirmar' }).click();
  await expect(view.getByRole('alert')).toContainText('No sabemos si se registró');
  await expect(form.getByLabel('Responsable')).toBeDisabled();
  await form.getByRole('button', { name: 'Repetir con la misma clave' }).click();
  const receipt = view.locator('.dc-receipt');
  await expect(receipt.getByRole('heading', { name: 'Siguiente paso registrado' })).toBeFocused();
  await expect(receipt).toContainText('Marta (ficción)');
  await expect(receipt).toContainText(/viernes, 13 de noviembre.*16:00/);
  await expect(receipt).toContainText('Confirmar: Frioval confirma las 4 unidades para el jueves 12 a las 10:00');
  expect(writes(), 'una simulación, un registro y UNA decisión; el reintento devuelve lo guardado').toEqual([
    'POST /api/v7/date-check/analyze 200', 'POST /api/v7/date-check/checks 201', 'POST /api/v7/date-check/checks/:id/confirm 201',
    'POST /api/v7/date-check/checks 200', 'POST /api/v7/date-check/checks/:id/confirm 200',
  ]);
  await page.screenshot({ path: path.join(SHOTS, '1440-04-recibo.png'), fullPage: true });

  // REINICIO del proceso: la comprobación y su decisión siguen ahí; reabrir no escribe.
  await stopServer(); await startServer();
  await page.goto(origin + '/');
  const before = writes().length;
  await view.locator('.dc-saved').getByRole('button', { name: 'Instalar 12 equipos VRF · Oficinas Lumen' }).click();
  await expect(receipt.getByRole('heading', { name: 'Siguiente paso registrado' })).toBeFocused();
  await expect(receipt).toContainText('Marta (ficción)');
  await expect(view.locator('.dc-saved')).toContainText('con siguiente paso · vigente');
  expect(writes().length).toBe(before);

  // Otra pestaña abre la misma comprobación: ve el recibo y no puede registrar un segundo paso.
  const second = await context.newPage();
  await second.goto(origin + '/');
  await screen(second).locator('.dc-saved').getByRole('button', { name: 'Instalar 12 equipos VRF · Oficinas Lumen' }).click();
  await expect(screen(second).locator('.dc-receipt')).toContainText('Marta (ficción)');
  await expect(screen(second).locator('.dc-confirm')).toHaveCount(0);
  await second.close();

  // Revisión posterior: coordinación retira la franja. Lo comparado sigue legible y queda como histórico; comprobar de nuevo ya no ofrece el viernes.
  await view.locator('.dc-demo summary').click();
  await view.getByRole('button', { name: 'Retirar la franja del jueves' }).click();
  await expect(view.locator('.dc-demo')).toContainText('Coordinación retiró la franja de Cruz del jueves.');
  await view.locator('.dc-saved').getByRole('button', { name: 'Instalar 12 equipos VRF · Oficinas Lumen' }).click();
  await expect(view.locator('.dc-summary')).toContainText('Comprobación histórica');
  await expect(view.locator('.dc-receipt')).toContainText('Marta (ficción)');
  await view.getByRole('button', { name: 'Comprobar' }).click();
  await expect(view.locator('.dc-summary .dc-verdict')).toHaveText('No se puede prometer esa fecha sin mover una fecha protegida.', { timeout: 60_000 });
  await expect(view.locator('.dc-confirm')).toBeVisible();
  await page.screenshot({ path: path.join(SHOTS, '1440-05-revision-posterior.png'), fullPage: true });

  // Anchos estrechos: sin desplazamiento horizontal.
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await noOverflow(page);
    await page.screenshot({ path: path.join(SHOTS, `${width}-resultado.png`), fullPage: true });
  }
  expect(external).toEqual([]);
  expect(consoleErrors).toEqual([]);
});
