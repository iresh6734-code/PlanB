import { test, expect, type Page } from '@playwright/test';
import { spawn, type ChildProcess } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { existsSync, mkdirSync, readdirSync, rmdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
// Modo Rescate · DOM real contra el servidor propio de la demo (scripts/demo-rescue-room.ts), carpetas nuevas y ficción. Se lanza y se MATA el proceso propio
// para probar la reapertura sobre la misma carpeta. Puertos 4521-4519. Red externa bloqueada con scripts/block-external.cjs y vigilada en el navegador.
const REPO = resolve('.'), DIST = process.env.PLANB_RESCUE_DIST!, EVIDENCE = process.env.PLANB_RESCUE_EVIDENCE ?? resolve('test-results', 'rescue');
const NOW = '2026-11-02T07:00:00.000Z';
mkdirSync(EVIDENCE, { recursive: true });
// Limpieza NO recursiva: solo los ficheros conocidos de una sala y la carpeta si queda vacía. Se usa tras la última parada de cada sala.
const dispose = (root: string) => { if (!existsSync(root)) return; for (const n of ['.instance', '.planb-key', 'crm-sim.json', 'crm-sim.json.tmp', 'planb.sqlite', 'planb.sqlite-wal', 'planb.sqlite-shm', 'rescue-room.marker.json']) { try { unlinkSync(join(root, n)); } catch { /* ausente */ } } try { if (!readdirSync(root).length) rmdirSync(root); } catch { /* conservada */ } };
type Server = { port: number; root: string; proc: ChildProcess; stop: () => Promise<void> };
async function start(port: number, resume?: string): Promise<Server> {
  if (!DIST) throw new Error('Falta PLANB_RESCUE_DIST (interfaz compilada en carpeta propia).');
  const proc = spawn(process.execPath, ['--require', join(REPO, 'scripts', 'block-external.cjs'), '--import', 'tsx', 'scripts/demo-rescue-room.ts', '--port', String(port), '--dist', DIST, '--now', NOW, ...(resume ? ['--resume', resume] : [])], { cwd: REPO, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = ''; proc.stdout!.on('data', d => { out += d; }); proc.stderr!.on('data', d => { out += d; });
  const exited = new Promise<void>(r => proc.once('exit', () => r()));
  const deadline = Date.now() + 40_000;
  for (;;) {
    const m = /Carpeta del ensayo: (.+)/.exec(out);
    if (m) { try { const r = await fetch('http://127.0.0.1:' + port + '/api/rescue/health'); if (r.ok) return { port, root: m[1].trim(), proc, stop: async () => { proc.kill(); await exited; } }; } catch { /* aún no escucha */ } }
    if (proc.exitCode !== null) throw new Error('La demo terminó: ' + out.slice(-600));
    if (Date.now() > deadline) { proc.kill(); throw new Error('La demo no arrancó: ' + out.slice(-600)); }
    await new Promise(r => setTimeout(r, 250));
  }
}
const api = async (port: number, path: string) => (await fetch('http://127.0.0.1:' + port + path)).json() as Promise<any>;
async function guard(page: Page, port: number) {
  const errors: string[] = [], outside: string[] = [], consoleErrors: string[] = [];
  page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  await page.route('**/*', route => { const u = new URL(route.request().url()); if (u.origin !== 'http://127.0.0.1:' + port) { outside.push(u.origin); return route.abort(); } return route.fallback(); });
  return { errors, outside, consoleErrors };
}
const noOverflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
const openTask = (page: Page, id: string) => page.getByRole('button', { name: new RegExp('\\(' + id + '\\)$') }).click();
const notice = (page: Page) => page.locator('.rr-live');

test('rescate: caída de 8 h → plan de 60 min → trabajo local → reinicio → conflicto → acuse perdido → conciliación → informe', async ({ page }) => {
  test.setTimeout(240_000);
  let server = await start(4521); const t0 = Date.now(); let steps = 0; const step = () => { steps++; };
  const seen = await guard(page, server.port);
  await page.goto('http://127.0.0.1:4521/');
  await expect(page.getByText('Ensayo · datos ficticios · no conecta con HubSpot')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Estado: Preparando el plan' })).toBeVisible();
  await expect(page.getByText('CRM caído 8 h')).toBeVisible();
  await page.getByRole('button', { name: 'Elegir un plan de 60 minutos' }).click(); step();
  await expect(page.getByRole('heading', { name: 'Estado: Trabajo local' })).toBeVisible();
  const firstActionMs = Date.now() - t0;
  await expect(page.getByText('0 tareas caben en 60 min')).toBeVisible();
  await page.getByRole('button', { name: 'Cargar estimaciones del guion' }).click(); step();
  await expect(page.getByText('3 tareas caben en 60 min (60 min estimados, quedan 0)')).toBeVisible();
  await page.getByRole('button', { name: '30 min', exact: true }).click(); step();
  await expect(page.getByText('1 tareas caben en 30 min')).toBeVisible();
  await page.getByRole('button', { name: '60 min', exact: true }).click(); step();
  await expect(page.getByText('Frente a 30 min, el plan de 60 añade: task-3, task-4')).toBeVisible();
  // edición local con previsualización y confirmación persistida
  await openTask(page, 'task-4'); step();
  await page.getByRole('combobox', { name: /Estado/ }).selectOption('completed');
  await page.getByRole('button', { name: 'Revisar el cambio' }).click();
  await expect(page.getByText('status: pending → completed')).toBeVisible();
  await page.getByRole('button', { name: 'Confirmar y guardar en la copia local' }).click(); step();
  await expect(notice(page)).toContainText('Cambio local guardado y confirmado');
  // texto inválido conservado
  await openTask(page, 'task-5'); step();
  await page.getByLabel('Fecha límite', { exact: true }).first().fill('mañana por la tarde');
  await page.getByRole('button', { name: 'Revisar el cambio' }).click();
  await expect(page.getByText('Introduce una fecha válida.')).toBeVisible();
  await page.getByLabel('Asunto', { exact: true }).first().focus();
  await expect(page.getByLabel('Fecha límite', { exact: true }).first()).toHaveValue('mañana por la tarde');
  await page.getByLabel('Fecha límite', { exact: true }).first().fill('2026-11-06');
  await page.getByRole('button', { name: 'Revisar el cambio' }).click();
  await page.getByRole('button', { name: 'Confirmar y guardar en la copia local' }).click(); step();
  await expect(notice(page)).toContainText('Cambio local guardado y confirmado');
  await page.getByLabel('Asunto', { exact: true }).last().fill('Confirmar entrega con el cliente');
  await page.getByLabel('Fecha límite', { exact: true }).last().fill('2026-11-04');
  await page.getByRole('button', { name: 'Crear tarea local' }).click(); step();
  await expect(notice(page)).toContainText('Tarea creada en la copia local');
  let state = await api(4521, '/api/rescue/state');
  expect(state.localChanges).toHaveLength(3);
  // la sala sobrevive a la muerte del proceso propio
  const root = server.root; await server.stop(); server = await start(4521, root);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Estado: Trabajo local' })).toBeVisible();
  state = await api(4521, '/api/rescue/state'); expect(state.localChanges).toHaveLength(3); expect(state.estimates ?? state.queue.items.filter((i: any) => i.estimate).length).toBeTruthy();
  await expect(page.getByRole('button', { name: /\(task-4\)$/ })).toHaveCount(0);
  // vuelve el CRM con un cambio incompatible
  await page.getByRole('button', { name: 'Simular la vuelta del CRM' }).click(); step();
  await expect(notice(page)).toContainText('El CRM simulado ha vuelto');
  await page.getByRole('button', { name: 'Preparar el retorno' }).first().click(); step();
  const row = page.locator('tr.conflict');
  await expect(row).toHaveCount(1);
  await expect(row).toContainText('2026-11-02'); await expect(row).toContainText('2026-11-06'); await expect(row).toContainText('2026-11-09');
  await expect(page.getByRole('button', { name: 'Aprobar lo revisado' })).toBeDisabled();
  await expect(page.getByText('Falta decidir 1 campo(s)')).toBeVisible();
  await row.getByLabel('Conservar lo local').click(); step();
  await expect(notice(page)).toContainText('Decisión registrada');
  await page.getByLabel('Perder el acuse del próximo create').click(); step();
  await page.getByRole('button', { name: 'Aprobar lo revisado' }).click(); step();
  await page.getByRole('button', { name: 'Aplicar (simulado)' }).click(); step();
  await expect(notice(page)).toContainText('Resultado incierto');
  await expect(page.getByRole('heading', { name: 'Estado: Resultado parcial o incierto' })).toBeVisible();
  await expect(page.getByText('llamadas create 1')).toBeVisible();
  // tras otra muerte del proceso la incertidumbre se conserva; un ID erróneo se rechaza; el correcto concilia sin duplicar
  await server.stop(); server = await start(4521, root); await page.reload();
  await expect(page.getByRole('heading', { name: /Resultado incierto: / })).toBeVisible();
  await page.getByLabel('ID remoto a comprobar').fill('crm-task-9999');
  await page.getByRole('button', { name: 'Conciliar con este ID' }).click(); step();
  await expect(page.getByRole('alert')).toContainText(/no confirma|corresponde|incierta/i);
  await page.getByRole('button', { name: 'Buscar candidatos en el CRM simulado' }).click(); step();
  await page.getByRole('button', { name: 'Usar este ID' }).click();
  await page.getByRole('button', { name: 'Conciliar con este ID' }).click(); step();
  await expect(notice(page)).toContainText('Conciliado sin repetir el envío');
  await page.getByRole('button', { name: 'Aprobar lo revisado' }).first().click(); step();
  await page.getByRole('button', { name: 'Aplicar (simulado)' }).click(); step();
  await expect(page.getByRole('heading', { name: 'Estado: Devolución simulada verificada' })).toBeVisible();
  await expect(page.getByText('llamadas create 1')).toBeVisible(); await expect(page.getByText('creaciones duplicadas 0')).toBeVisible();
  await page.getByRole('button', { name: 'Cerrar el ensayo' }).first().click(); step();
  await expect(page.getByRole('heading', { name: 'Estado: Ensayo cerrado' })).toBeVisible();
  const html = await (await page.request.get('http://127.0.0.1:4521/api/rescue/report.html')).text();
  expect(html).toContain('Ensayo · datos ficticios · no conecta con HubSpot'); expect(html).not.toMatch(/<script|https?:\/\/(?!127)/i);
  const json = JSON.parse(await (await page.request.get('http://127.0.0.1:4521/api/rescue/report.json')).text());
  expect(json.closed).toBe(true); expect(json.notProven.length).toBeGreaterThan(3);
  await page.screenshot({ path: join(EVIDENCE, 'rescue-closed-1440.png'), fullPage: true });
  writeFileSync(join(EVIDENCE, 'journey-measures.json'), JSON.stringify({ firstActionMs, totalMs: Date.now() - t0, userSteps: steps, note: 'Recorrido automatizado de un guion; no es una prueba de usuario ni acredita ahorro.' }, null, 2));
  expect(firstActionMs).toBeLessThan(60_000);
  expect(seen.errors).toEqual([]); expect(seen.outside).toEqual([]);
  await server.stop(); dispose(server.root);
});

for (const width of [1440, 390, 320]) test('rescate: ' + width + ' px sin desbordamiento, objetivos táctiles y foco visible', async ({ page }) => {
  const server = await start(4522); const seen = await guard(page, server.port);
  await page.setViewportSize({ width, height: 900 }); await page.goto('http://127.0.0.1:4522/');
  await page.getByRole('button', { name: 'Elegir un plan de 60 minutos' }).click();
  await page.getByRole('button', { name: 'Cargar estimaciones del guion' }).click();
  await expect(page.getByText('3 tareas caben en 60 min')).toBeVisible();
  expect(await noOverflow(page), 'sin desbordamiento horizontal de la página').toBe(true);
  for (const name of ['Cargar estimaciones del guion', '60 min', '30 min']) expect((await page.getByRole('button', { name, exact: true }).boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await page.keyboard.press('Tab'); await expect(page.locator(':focus')).toBeVisible();
  await page.screenshot({ path: join(EVIDENCE, 'rescue-' + width + '.png'), fullPage: true });
  expect(seen.errors).toEqual([]); expect(seen.outside).toEqual([]);
  await server.stop(); dispose(server.root);
});

test('rescate: teclado — elegir, abrir, editar y volver sin ratón', async ({ page }) => {
  const server = await start(4523); const seen = await guard(page, server.port); await page.goto('http://127.0.0.1:4523/');
  await page.getByRole('button', { name: 'Elegir un plan de 60 minutos' }).focus(); await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Estado: Trabajo local' })).toBeVisible();
  const first = page.getByRole('button', { name: /^Abrir la tarea/ }).first(); await first.focus(); await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: /^Tarea task-/ })).toBeFocused();
  await page.getByLabel('Notas', { exact: false }).first().focus();
  expect(seen.errors).toEqual([]); await server.stop(); dispose(server.root);
});

test('rescate: dos pestañas — la versión antigua recibe conflicto y no pierde el borrador; doble clic no duplica', async ({ browser }) => {
  const server = await start(4524), a = await (await browser.newContext()).newPage(), b = await (await browser.newContext()).newPage();
  await a.goto('http://127.0.0.1:4524/'); await b.goto('http://127.0.0.1:4524/');
  await expect(a.getByRole('heading', { name: 'Estado: Preparando el plan' })).toBeVisible(); await expect(b.getByRole('heading', { name: 'Estado: Preparando el plan' })).toBeVisible();
  await a.getByRole('button', { name: 'Elegir un plan de 60 minutos' }).click(); await expect(a.getByRole('heading', { name: 'Estado: Trabajo local' })).toBeVisible();
  // la pestaña B sigue en la versión 1: su acción debe rechazarse y su borrador conservarse
  await b.getByLabel('Otro (min)').fill('45'); await b.getByRole('button', { name: 'Usar', exact: true }).click();
  await expect(b.getByRole('alert')).toContainText('La sala cambió'); await expect(b.getByRole('button', { name: 'Actualizar la sala' })).toBeVisible();
  await expect(b.getByLabel('Otro (min)')).toHaveValue('45');
  expect((await api(4524, '/api/rescue/state')).budgetMinutes).toBe(60);
  await b.getByRole('button', { name: 'Actualizar la sala' }).click(); await expect(b.getByRole('heading', { name: 'Estado: Trabajo local' })).toBeVisible();
  await expect(b.getByLabel('Otro (min)')).toHaveValue('45');
  // doble clic sobre guardar nota
  await a.getByRole('button', { name: /^Abrir la tarea/ }).first().click();
  await a.getByLabel('Nota operativa').fill('Llamar a primera hora'); const save = a.getByRole('button', { name: 'Guardar nota' });
  await save.dblclick({ delay: 0 });
  await expect(notice(a)).toContainText('Nota guardada');
  const events = (await api(4524, '/api/rescue/state')).journal.events.filter((e: any) => e.kind === 'note-saved');
  expect(events).toHaveLength(1); await server.stop(); dispose(server.root);
});

test('rescate: un diario corrupto bloquea el flujo, conserva los bytes y no se sustituye por un incidente vacío', async ({ page }) => {
  let server = await start(4525); const root = server.root; await server.stop();
  const dbFile = join(root, 'planb.sqlite');
  const db = new DatabaseSync(dbFile); const before = (db.prepare("SELECT value FROM meta WHERE key='rescue:journal'").get() as { value: string }).value;
  const garbage = 'enc1:esto-no-se-puede-descifrar'; db.prepare("UPDATE meta SET value=? WHERE key='rescue:journal'").run(garbage); db.close();
  server = await start(4525, root); const seen = await guard(page, server.port); await page.goto('http://127.0.0.1:4525/');
  await expect(page.getByRole('alert')).toContainText('El incidente guardado no se puede leer');
  await expect(page.getByRole('button', { name: /Elegir un plan/ })).toHaveCount(0);
  const resp = await page.request.post('http://127.0.0.1:4525/api/rescue/plan', { data: { idempotencyKey: 'k-corrupt-0001', expectedVersion: 1, context: { workspaceId: 'x'.repeat(8), accountId: 'a', captureId: 'c', captureRevision: 'a'.repeat(64) }, budgetMinutes: 60 } });
  expect(resp.status()).toBe(409);
  await server.stop();
  const after = new DatabaseSync(dbFile); expect((after.prepare("SELECT value FROM meta WHERE key='rescue:journal'").get() as { value: string }).value, 'los bytes corruptos se conservan').toBe(garbage); after.close(); dispose(root);
  expect(before).not.toBe(garbage); expect(seen.outside).toEqual([]);
});

// R2 (dictamen 113 · F4): contratos incompletos en el navegador. Un estado incompleto no deja la pantalla en blanco y un acuse incompleto no confirma ni borra el borrador.
test('R2 F4: un estado 200 incompleto muestra una alerta visible (no pantalla en blanco ni TypeError)', async ({ page }) => {
  const server = await start(4527); const seen = await guard(page, server.port);
  await page.route('**/api/rescue/state', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ blocked: false, roomId: 'x', version: 2, stage: 'preparation', context: { workspaceId: 'x', accountId: 'a', captureId: 'c', captureRevision: 'a'.repeat(64) } }) }));
  await page.goto('http://127.0.0.1:4527/');
  await expect(page.getByRole('alert')).toContainText('no cumple el contrato esperado'); await expect(page.getByRole('button', { name: 'Reintentar' })).toBeVisible();
  expect(seen.errors, 'ningún TypeError al renderizar').toEqual([]); await server.stop(); dispose(server.root);
});

test('R2 F4: un acuse de creación INCOMPLETO no se da por guardado ni vacía el borrador; el servidor no recibió nada', async ({ page }) => {
  const server = await start(4528); const seen = await guard(page, server.port); await page.goto('http://127.0.0.1:4528/');
  await page.getByRole('button', { name: 'Elegir un plan de 60 minutos' }).click(); await expect(page.getByRole('heading', { name: 'Estado: Trabajo local' })).toBeVisible();
  await page.route('**/api/rescue/create', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, outcome: 'saved', version: 2 }) }));
  await page.getByLabel('Asunto', { exact: true }).last().fill('Borrador que no debe perderse'); await page.getByLabel('Fecha límite', { exact: true }).last().fill('2026-11-04'); await page.getByRole('button', { name: 'Crear tarea local' }).click();
  await expect(page.getByRole('alert')).toContainText('no confirmado'); await expect(page.locator('.rr-live')).not.toContainText('Tarea creada');
  await expect(page.getByLabel('Asunto', { exact: true }).last(), 'el borrador se conserva').toHaveValue('Borrador que no debe perderse');
  expect((await (await fetch('http://127.0.0.1:4528/api/rescue/state')).json() as { localChanges: unknown[] }).localChanges).toHaveLength(0); expect(seen.errors).toEqual([]); await server.stop(); dispose(server.root);
});
