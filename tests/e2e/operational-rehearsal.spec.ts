import { expect, test, type Page } from '@playwright/test';
import { build } from 'esbuild';
import { spawn, type ChildProcess } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// «ENSAYAR MI SEMANA» EN NAVEGADOR REAL (unidad CLAUDE-FABLE-OPERATIONAL-MOUNT).
// Servidor REAL (createBaseApp + mountCommitmentRadar + mountOperationalRehearsal) en proceso propio, SQLite de archivo cifrado con clave de prueba, reloj fijo y red
// exterior bloqueada. Lo único ficticio del arnés es la página anfitriona (tests/e2e/operational-rehearsal-page.tsx). NO es la App montada: prueba lo que se montará.
// Recorrido: activar el Radar → ensayar → cancelar → comparar → qué comprobar → elegir → confirmar UNA decisión → REINICIAR el proceso → reencontrar ensayo y decisión.
// Capturas a 1440, 390 y 320 en PLANB_REHEARSAL_SHOTS (por defecto, carpeta temporal del sistema).

const REPO = process.cwd(), NOW = '2026-11-11T15:00:00.000Z';
const WORK = fs.mkdtempSync(path.join(os.tmpdir(), 'planb-rehearsal-e2e-'));
const SHOTS = process.env.PLANB_REHEARSAL_SHOTS ?? path.join(WORK, 'shots');
const url = (relative: string) => JSON.stringify(pathToFileURL(path.join(REPO, relative)).href);
const SERVER = `import fs from 'node:fs';
import { createBaseApp } from ${url('server/app.ts')};
import { mountCommitmentRadar } from ${url('server/commitment-radar-mount.ts')};
import { mountOperationalRehearsal } from ${url('server/operational-rehearsal-mount.ts')};
import { makeDemoSpec, makeFixture } from ${url('shared/fixtures.ts')};
const dir = process.env.CASE_DIR!, NOW = Date.parse(${JSON.stringify(NOW)});
const { app, store } = await createBaseApp({ root: ${JSON.stringify(REPO)}, dbPath: dir + '/data.sqlite', staticDir: process.env.STATIC_DIR! });
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
const writes = () => requests().filter(line => line.method !== 'GET').map(line => `${line.method} ${line.path} ${line.status}`);

test.use({ timezoneId: 'Europe/Madrid', locale: 'es-ES' });
test.setTimeout(240_000);
test.beforeAll(async () => {
  fs.mkdirSync(caseDir, { recursive: true }); fs.mkdirSync(staticDir, { recursive: true }); fs.mkdirSync(SHOTS, { recursive: true });
  fs.writeFileSync(path.join(caseDir, '.planb-key'), JSON.stringify({ kind: 'test', data: randomBytes(32).toString('base64') }), { flag: 'wx' });
  fs.writeFileSync(path.join(WORK, 'server.mts'), SERVER);
  await build({
    entryPoints: { page: path.join(REPO, 'tests', 'e2e', 'operational-rehearsal-page.tsx') }, bundle: true, format: 'esm', outdir: staticDir, jsx: 'automatic', logLevel: 'error',
    define: { 'process.env.NODE_ENV': '"production"' }, loader: { '.woff2': 'file', '.woff': 'file', '.svg': 'file', '.png': 'file' },
  });
  fs.writeFileSync(path.join(staticDir, 'index.html'), '<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Ensayar mi semana · arnés</title><link rel="stylesheet" href="/page.css"></head><body><div id="root"></div><script type="module" src="/page.js"></script></body></html>');
  await startServer();
});
test.afterAll(async () => { await stopServer(); fs.rmSync(caseDir, { recursive: true, force: true }); });

const rehearsal = (page: Page) => page.locator('.or');
const noOverflow = async (page: Page) => expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
async function openRehearsal(page: Page) {
  await page.goto(origin + '/');
  await page.getByRole('button', { name: 'Ensayar mi semana' }).click();
  await expect(page.getByRole('heading', { name: 'Ensayar mi semana', level: 2 })).toBeVisible();
}

test('de la ficha al ensayo, a una decisión confirmada y de vuelta tras reiniciar', async ({ page }) => {
  const external: string[] = [], consoleErrors: string[] = [];
  page.on('request', request => { if (!request.url().startsWith(origin) && !request.url().startsWith('http://127.0.0.1:')) external.push(request.url()); });
  page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  page.on('pageerror', error => consoleErrors.push(String(error)));
  await page.setViewportSize({ width: 1440, height: 900 });

  // Sin escenario del Radar no hay ensayo: se dice qué falta y no se crea nada.
  await openRehearsal(page);
  await expect(rehearsal(page)).toContainText('Activa primero el escenario de ensayo del Radar');
  expect(writes()).toEqual([]);
  await page.getByRole('button', { name: 'Volver al compromiso' }).click();
  await page.getByRole('button', { name: 'Activar el escenario de ensayo' }).click();
  await expect(page.locator('.cr-item').first()).toBeVisible();

  // Entrada: primero la decisión y sus causas; el calendario queda plegado.
  await page.getByRole('button', { name: 'Ensayar mi semana' }).click();
  const view = rehearsal(page);
  await expect(view.getByRole('heading', { name: 'Instalación de 12 equipos en Almacén Norte' })).toBeVisible();
  await expect(view).toContainText('Ensayo · ficción');
  await expect(view).toContainText('12 instalaciones, 3 técnicos, 2 almacenes, 20 pedidos y 8 tickets');
  await expect(view.locator('.or-verdict').first()).toContainText('Llega tarde');
  await expect(view.locator('.or-chain li')).toHaveCount(3);
  await expect(view.locator('.or-chain')).toContainText('su técnico estaba con «Climatización urgente Hotel Faro»');
  await view.locator('.or-evidence summary').first().click();
  await expect(view.locator('.or-evidence').first()).toContainText('Leído de orders-fixture · fixture-orders-a');
  await page.screenshot({ path: path.join(SHOTS, '1440-01-entrada.png'), fullPage: true });

  // Teclado: marcar una perturbación con Espacio, lanzar con Intro y CANCELAR; los controles vuelven.
  const delay = view.getByRole('checkbox', { name: /Los equipos retenidos llegan un día más tarde/ });
  await delay.focus(); await page.keyboard.press('Space');
  await expect(delay).toBeChecked();
  await page.route('**/api/v7/operational-rehearsal/analyze', async route => { await new Promise(resolve => setTimeout(resolve, 1500)); await route.continue().catch(() => undefined); }, { times: 1 });
  await page.keyboard.press('Enter');
  const cancel = view.getByRole('button', { name: 'Cancelar' });
  await expect(cancel).toBeVisible();
  await expect(view.getByRole('button', { name: 'Ensayando…' })).toBeDisabled();
  await cancel.click();
  await expect(view.getByRole('status')).toHaveText('Cancelado. No se ha cambiado nada.');
  await expect(view.getByRole('button', { name: 'Ensayar', exact: true })).toBeEnabled();
  await expect(delay).toBeEnabled();
  await expect(view.locator('.or-results')).toHaveCount(0);

  // Ensayo con el retraso: el foco va al resultado y la cadena dice que es un supuesto.
  await view.getByRole('button', { name: 'Ensayar', exact: true }).click();
  const results = view.locator('.or-results');
  await expect(results.getByRole('heading', { name: 'Resultado del ensayo' })).toBeFocused({ timeout: 60_000 });
  await expect(results.locator('.or-diagnosis')).toContainText('Es un ensayo: no ha ocurrido.');
  await delay.focus(); await page.keyboard.press('Space');
  await expect(results).toContainText('Has cambiado lo que quieres ensayar');
  await expect(results.getByRole('radio').first()).toBeDisabled();

  // Ensayo de la semana tal como está: conflicto verificado y cinco respuestas comparables.
  await view.getByRole('button', { name: 'Ensayar de nuevo' }).click();
  await expect(results.locator('.or-conflict')).toContainText('No caben a la vez', { timeout: 60_000 });
  await expect(results.locator('.or-conflict')).toContainText('Climatización urgente Hotel Faro');
  await expect(results.locator('.or-conflict')).toContainText('Comprobado: juntos no caben, y quitando cualquiera de ellos sí.');
  await expect(results.locator('.or-card')).toHaveCount(5);
  await expect(results).toContainText('Ninguna está autorizada ni confirmada');
  await expect(results).toContainText('los mejores encontrados, no necesariamente los mejores posibles');
  const card = (name: string) => results.locator('.or-card').filter({ hasText: name });
  await expect(card('Replanificar con lo que hay')).toContainText('Quedan fuera de plazo1');
  await expect(card('Cruz aplaza la formación del jueves')).toContainText('8 h de trabajo extra');
  await expect(card('Usar equipos equivalentes del Almacén Sur')).toContainText('un material alternativo sin confirmar');
  await expect(card('Renegociar la fecha al lunes siguiente')).toContainText('nueva fecha');
  await expect(card('Usar equipos equivalentes del Almacén Sur')).toContainText('MejoraClimatización urgente Hotel Faro');
  // Comparar dos planes: sus calendarios, como lista de texto equivalente a las barras.
  for (const name of ['Replanificar con lo que hay', 'Usar equipos equivalentes del Almacén Sur']) {
    await card(name).locator('.or-timeline summary').click();
    await expect(card(name).locator('.or-row')).toHaveCount(5);
    await expect(card(name).locator('.or-row li[data-focus]').first()).toContainText('(este compromiso)');
  }
  await expect(card('Replanificar con lo que hay').locator('.or-bars').first()).toHaveAttribute('aria-hidden', 'true');
  await page.screenshot({ path: path.join(SHOTS, '1440-02-comparar.png'), fullPage: true });

  // Qué comprobar antes: sin probabilidades.
  await results.getByRole('button', { name: '¿Qué conviene comprobar antes de decidir?' }).click();
  await expect(results.locator('.or-ranking li[data-decisive]')).toContainText('¿Cuándo estarían de verdad los equipos equivalentes?', { timeout: 90_000 });
  await expect(results.locator('.or-ranking')).toContainText('No hay probabilidades');
  // Hasta aquí, ensayar, comparar y preguntar no han escrito nada salvo la activación explícita del Radar.
  expect(writes().filter(line => !line.includes('/analyze') && !line.includes('/check-first'))).toEqual(['POST /api/v7/commitment-radar/activate 201']);

  // Elegir con teclado y confirmar: formulario incompleto no envía.
  const pick = card('Usar equipos equivalentes del Almacén Sur').getByRole('radio');
  await pick.focus(); await page.keyboard.press('Space');
  await expect(pick).toBeChecked();
  const decision = results.locator('.or-decision');
  await expect(decision.getByRole('heading')).toHaveText('Siguiente paso para «Usar equipos equivalentes del Almacén Sur»');
  await decision.getByRole('button', { name: 'Confirmar decisión' }).click();
  await expect(decision.getByRole('alert')).toContainText('Escribe quién se encarga');
  expect(writes().some(line => line.includes('/decisions') || line.includes('/rehearsals'))).toBe(false);
  await decision.getByLabel('Quién se encarga').fill('Marta (ficción)');
  await decision.getByLabel('Siguiente paso concreto').fill('Confirmar con Almacén Sur que los equipos equivalentes están el martes.');
  await decision.getByLabel('Para cuándo').fill('2026-11-12T11:00');
  await decision.getByLabel('Para cuándo').press('Enter');
  const receipt = results.locator('.or-receipt');
  await expect(receipt.getByRole('heading', { name: 'Decisión registrada' })).toBeFocused({ timeout: 60_000 });
  await expect(receipt.locator('dt')).toHaveText(['Ensayo (hipotético)', 'Decisión', 'Resultado observado']);
  await expect(receipt).toContainText('Marta (ficción) se encarga de: Confirmar con Almacén Sur');
  await expect(receipt).toContainText('Todavía ninguno');
  expect(writes().filter(line => line.includes('/decisions'))).toEqual(['POST /api/v7/commitments/ms-installation-hubspot/decisions 200']);
  expect(writes().filter(line => line.includes('/rehearsals'))).toEqual([
    'POST /api/v7/operational-rehearsal/rehearsals 201', expect.stringMatching(/\/choose 200$/), expect.stringMatching(/\/decision-draft 200$/), expect.stringMatching(/\/link 200$/),
  ]);
  await expect(view.locator('.or-saved li')).toHaveCount(1);
  await expect(view.locator('.or-saved li')).toContainText('con decisión registrada · histórico');
  await page.screenshot({ path: path.join(SHOTS, '1440-03-decision.png'), fullPage: true });

  // REINICIO en proceso nuevo sobre el mismo archivo: nada se ejecuta al arrancar y todo se reencuentra.
  const before = writes().length;
  await stopServer(); await startServer();
  await openRehearsal(page);
  expect(writes().length).toBe(before);
  const again = rehearsal(page);
  await expect(again.locator('.or-saved li')).toContainText('Usar equipos equivalentes del Almacén Sur · con decisión registrada · histórico');
  await expect(again.locator('.or-results')).toHaveCount(0);
  await again.getByRole('button', { name: /Reabrir/ }).click();
  const reopened = again.locator('.or-reopened');
  await expect(reopened.getByRole('heading')).toBeFocused();
  await expect(reopened.getByRole('heading')).toContainText('borrador histórico');
  await expect(reopened.locator('dl > div > dt')).toHaveText(['Ensayo (hipotético)', 'Decisión', 'Resultado observado']);
  await expect(reopened).toContainText('Registrada en el Radar para este compromiso.');
  await expect(reopened).toContainText('Reabrirlo no vuelve a ensayar ni ejecuta nada.');
  await expect(reopened.locator('li').filter({ hasText: 'elegida' })).toContainText('Usar equipos equivalentes del Almacén Sur');
  expect(writes().length).toBe(before);
  // La decisión está en el Radar tras el reinicio, y el Radar sigue sin darlo por resuelto.
  const state = await (await fetch(origin + '/api/v2/state')).json() as { workspaceSearchContext: { contextRevision: string } };
  const detail = await (await fetch(origin + '/api/v7/commitments/ms-installation-hubspot?contextRevision=' + state.workspaceSearchContext.contextRevision)).json() as { item: { status: string; action: { owner: string } | null }; events: unknown[] };
  expect([detail.item.action?.owner, detail.events.length, detail.item.status]).toEqual(['Marta (ficción)', 1, 'at-risk']);
  await page.screenshot({ path: path.join(SHOTS, '1440-04-reinicio.png'), fullPage: true });

  // 390 y 320: mismo contenido, sin desbordamiento horizontal y con objetivos táctiles de 44 px.
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 800 });
    await openRehearsal(page);
    await rehearsal(page).getByRole('button', { name: 'Ensayar', exact: true }).click();
    const narrow = rehearsal(page).locator('.or-results');
    await expect(narrow.locator('.or-card')).toHaveCount(5, { timeout: 60_000 });
    await narrow.locator('.or-card').nth(2).getByRole('radio').check();
    await narrow.locator('.or-card').nth(2).locator('.or-timeline summary').click();
    await expect(narrow.locator('.or-decision')).toBeVisible();
    await noOverflow(page);
    for (const control of await rehearsal(page).locator('button:visible, .or-check:visible, .or-pick:visible').all()) expect((await control.boundingBox())!.height).toBeGreaterThanOrEqual(43.5);
    await page.screenshot({ path: path.join(SHOTS, `${width}-ensayo.png`), fullPage: true });
  }
  expect(writes().filter(line => line.includes('/decisions')).length).toBe(1);
  expect(external).toEqual([]);
  expect(consoleErrors).toEqual([]);
});
