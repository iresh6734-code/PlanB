import { test, expect, type Locator, type Page, type Route } from '@playwright/test';
import { spawn, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import { existsSync, mkdirSync, readdirSync, rmdirSync, unlinkSync } from 'node:fs';
import { join, resolve } from 'node:path';
// RESCUE-115 · DOM real de las lagunas de 106 (ampliación de QA por su misma autora; Chromium headless limpio de Playwright, sin Edge ni lector de pantalla).
// Cada prueba lanza SU servidor (puerto libre, red externa bloqueada) y elimina sus ficheros conocidos al terminar (sin borrado recursivo).
const REPO = resolve('.'), DIST = process.env.PLANB_RESCUE_DIST!, EVIDENCE = process.env.PLANB_RESCUE_EVIDENCE ?? resolve('test-results', 'rescue115');
mkdirSync(EVIDENCE, { recursive: true });
const freePort = () => new Promise<number>((ok, fail) => { const s = createServer(); s.once('error', fail); s.listen(0, '127.0.0.1', () => { const p = (s.address() as { port: number }).port; s.close(() => ok(p)); }); });
const dispose = (root: string) => { if (!existsSync(root)) return; for (const n of ['.instance', '.planb-key', 'crm-sim.json', 'crm-sim.json.tmp', 'planb.sqlite', 'planb.sqlite-wal', 'planb.sqlite-shm', 'rescue-room.marker.json']) { try { unlinkSync(join(root, n)); } catch { /* ausente */ } } try { if (!readdirSync(root).length) rmdirSync(root); } catch { /* conservada */ } };
type Server = { port: number; root: string; url: string; proc: ChildProcess; stop: () => Promise<void> };
async function start(): Promise<Server> {
  if (!DIST) throw new Error('Falta PLANB_RESCUE_DIST.'); const port = await freePort();
  const proc = spawn(process.execPath, ['--require', join(REPO, 'scripts', 'block-external.cjs'), '--import', 'tsx', 'scripts/demo-rescue-room.ts', '--port', String(port), '--dist', DIST, '--now', '2026-11-02T07:00:00.000Z'], { cwd: REPO, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = ''; proc.stdout!.on('data', d => { out += d; }); proc.stderr!.on('data', d => { out += d; }); const exited = new Promise<void>(r => proc.once('exit', () => r()));
  const deadline = Date.now() + 40_000;
  for (;;) {
    const m = /Carpeta del ensayo: (.+)/.exec(out);
    if (m) { try { if ((await fetch('http://127.0.0.1:' + port + '/api/rescue/health')).ok) { const root = m[1].trim(); return { port, root, url: 'http://127.0.0.1:' + port, proc, stop: async () => { proc.kill(); await exited; dispose(root); } }; } } catch { /* aún no */ } }
    if (proc.exitCode !== null) throw new Error('La demo terminó: ' + out.slice(-500)); if (Date.now() > deadline) { proc.kill(); throw new Error('La demo no arrancó: ' + out.slice(-500)); }
    await new Promise(r => setTimeout(r, 200));
  }
}
const api = async (s: Server, path: string) => (await fetch(s.url + path)).json() as Promise<any>;
async function guard(page: Page, s: Server) {
  const errors: string[] = [], outside: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.route('**/*', route => { const u = new URL(route.request().url()); if (u.origin !== s.url) { outside.push(u.origin); return route.abort(); } return route.fallback(); });
  return { errors, outside };
}
const notice = (page: Page) => page.locator('.rr-live');
const noOverflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
const offenders = (page: Page) => page.evaluate(() => [...document.querySelectorAll('body *')].filter(e => { const el = e as HTMLElement, cs = getComputedStyle(el); return el.scrollWidth > el.clientWidth + 1 && el.clientWidth > 0 && cs.overflowX === 'visible' && !el.closest('.rr-scroll') && !(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement); }).slice(0, 8).map(e => e.tagName.toLowerCase() + '.' + String((e as HTMLElement).className).slice(0, 30) + ' «' + (e.textContent ?? '').slice(0, 24) + '»'));
const task = (page: Page, id: string) => page.getByRole('button', { name: new RegExp('\\(' + id + '\\)$') });

test('DOM · guardado CONFIRMADO y recarga fallida: la UI distingue ambos, no repite el POST, conserva el borrador nuevo y se recupera', async ({ page }) => {
  test.setTimeout(120_000); const s = await start(); const seen = await guard(page, s); let posts = 0, failState = false, stateCalls = 0;
  await page.route('**/api/rescue/edit', async (route: Route) => { posts++; const real = await route.fetch(); failState = true; await route.fulfill({ response: real }); }); // el POST real y su acuse pasan; solo falla la recarga posterior
  await page.route('**/api/rescue/state', route => { stateCalls++; return failState ? route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'Fallo de ensayo al recargar la sala.', code: 'INTERNAL' }) }) : route.continue(); });
  await page.goto(s.url); await page.getByRole('button', { name: 'Elegir un plan de 60 minutos' }).click(); await expect(page.getByRole('heading', { name: 'Estado: Trabajo local' })).toBeVisible();
  await task(page, 'task-4').click(); await page.getByRole('combobox', { name: /Estado/ }).selectOption('completed'); await page.getByRole('button', { name: 'Revisar el cambio' }).click();
  await page.getByRole('button', { name: 'Confirmar y guardar en la copia local' }).click();
  await expect(notice(page)).toContainText('Cambio local guardado y confirmado'); await expect(notice(page)).toContainText('Guardado correcto, pero no se pudo recargar la sala');
  expect(posts, 'un único POST de edición').toBe(1); const direct = await api(s, '/api/rescue/state'); expect(direct.localChanges, 'un único cambio en el Store').toHaveLength(1);
  await expect(page.getByRole('button', { name: 'Confirmar y guardar en la copia local' }), 'la UI no vuelve a ofrecer el envío ya confirmado').toHaveCount(0);
  await page.getByLabel('Nota operativa').fill('borrador nuevo tras el guardado'); await expect(page.getByLabel('Nota operativa')).toHaveValue('borrador nuevo tras el guardado');
  // una acción nueva sobre la sala sin refrescar usa la versión antigua: conflicto explicado, sin perder el borrador y sin nuevo POST de edición
  await page.getByRole('button', { name: 'Guardar nota' }).click(); await expect(page.getByRole('alert')).toContainText('La sala cambió'); await expect(page.getByLabel('Nota operativa')).toHaveValue('borrador nuevo tras el guardado');
  failState = false; await page.getByRole('button', { name: 'Actualizar la sala' }).click(); await expect(page.getByRole('alert')).toHaveCount(0); await expect(page.getByLabel('Nota operativa')).toHaveValue('borrador nuevo tras el guardado');
  await page.getByRole('button', { name: 'Guardar nota' }).click(); await expect(notice(page)).toContainText('Nota guardada');
  expect(posts, 'ninguna repetición del POST de edición').toBe(1); expect((await api(s, '/api/rescue/state')).localChanges).toHaveLength(1);
  expect(seen.errors).toEqual([]); expect(seen.outside).toEqual([]); expect(stateCalls).toBeGreaterThan(2); await s.stop();
});

// El componente NO permite solapar lecturas desde la interfaz: durante una acción (busy) los controles se deshabilitan y «Actualizar la sala» sustituye la pantalla por una carga.
// Por eso una respuesta antigua no puede competir con una acción nueva de la persona; estas pruebas fijan esa propiedad estructural con una respuesta RETENIDA de verdad
// (con y sin transporte que ignore AbortSignal). El descarte por ticket del cliente se prueba aparte (tests/rescue-room-client.test.ts, nivel cliente).
for (const ignoreAbort of [false, true]) test('DOM · con una lectura retenida no hay interacción posible que la compita; al entregarla la ficha y la versión son las actuales' + (ignoreAbort ? ' (transporte que IGNORA AbortSignal)' : ''), async ({ browser }) => {
  test.setTimeout(120_000); const s = await start(); const a = await (await browser.newContext()).newPage(), b = await (await browser.newContext()).newPage(); await guard(a, s); const seen = await guard(b, s);
  if (ignoreAbort) await b.addInitScript(() => { const native = window.fetch.bind(window); window.fetch = (input: RequestInfo | URL, init?: RequestInit) => { const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url; return native(input, url.includes('/api/rescue/state') && init ? { ...init, signal: null } : init); }; });
  await a.goto(s.url); await b.goto(s.url); await expect(b.getByRole('heading', { name: 'Estado: Preparando el plan' })).toBeVisible(); await expect(a.getByRole('heading', { name: 'Estado: Preparando el plan' })).toBeVisible();
  await b.getByRole('button', { name: 'Elegir un plan de 60 minutos' }).click(); await expect(b.getByRole('heading', { name: 'Estado: Trabajo local' })).toBeVisible();
  // 1) lectura retenida tras una acción: todo lo accionable queda deshabilitado
  let held = false, release!: () => void; const gate = new Promise<void>(r => { release = r; }), heldVersion: number[] = [];
  await b.route('**/api/rescue/state', async route => { if (!held) { held = true; const real = await route.fetch(); heldVersion.push((await real.json()).version); await gate; try { await route.fulfill({ response: real }); } catch { /* abortada */ } } else await route.continue(); });
  await task(b, 'task-5').click(); await expect.poll(() => held).toBe(true);
  await expect(task(b, 'task-7'), 'durante la lectura en vuelo no se puede cambiar de ficha').toBeDisabled(); await expect(b.getByRole('button', { name: 'Cargar estimaciones del guion' })).toBeDisabled();
  // mientras tanto OTRA pestaña cambia la sala (la respuesta retenida queda realmente antigua)
  await a.reload(); await expect(a.getByRole('heading', { name: 'Estado: Trabajo local' })).toBeVisible(); await a.getByRole('button', { name: 'Cargar estimaciones del guion' }).click(); await expect(notice(a)).toContainText('Estimaciones del guion cargadas');
  release(); await expect(b.getByRole('heading', { name: 'Tarea task-5' })).toBeVisible(); const versionNow = (await api(s, '/api/rescue/state')).version;
  expect(heldVersion[0], 'la respuesta retenida era de una versión anterior a la actual de la sala').toBeLessThan(versionNow);
  // 2) la pestaña B, con vista antigua, recibe conflicto; «Actualizar la sala» muestra una carga sin controles accionables y luego el estado actual
  await b.getByLabel('Nota operativa').fill('borrador previo al conflicto'); await b.getByRole('button', { name: 'Guardar nota' }).click(); await expect(b.getByRole('alert')).toContainText('La sala cambió');
  held = false; const gate2 = new Promise<void>(r => { release = r; }); await b.unroute('**/api/rescue/state');
  await b.route('**/api/rescue/state', async route => { if (!held) { held = true; const real = await route.fetch(); await gate2; try { await route.fulfill({ response: real }); } catch { /* abortada */ } } else await route.continue(); });
  await b.getByRole('button', { name: 'Actualizar la sala' }).click(); await expect.poll(() => held).toBe(true);
  await expect(b.getByText('Abriendo la sala de rescate…')).toBeVisible(); await expect(b.getByRole('button'), 'la pantalla de carga no ofrece acciones').toHaveCount(0);
  release(); await expect(b.getByRole('heading', { name: 'Tarea task-5' })).toBeVisible(); await expect(b.locator('.rr-prov')).toContainText('Versión de la sala' + versionNow);
  await expect(b.getByLabel('Nota operativa'), 'el borrador previo sigue en el componente tras la recarga completa').toHaveValue('borrador previo al conflicto');
  await b.getByRole('button', { name: 'Guardar nota' }).click(); await expect(notice(b)).toContainText('Nota guardada'); expect(seen.errors).toEqual([]); expect(seen.outside).toEqual([]); await s.stop();
});

/** Avanza con Tab hasta que el foco llega al elemento (prueba que es alcanzable sin ratón). */
async function reach(page: Page, target: Locator, max = 160) {
  for (let i = 0; i < max; i++) { if (await target.evaluate(el => el === document.activeElement).catch(() => false)) return i; await page.keyboard.press('Tab'); }
  throw new Error('No se alcanzó con el teclado: ' + target);
}
async function typeInto(page: Page, field: Locator, text: string) { await reach(page, field); await page.keyboard.press('Control+A'); await page.keyboard.type(text); }

test('DOM · teclado completo SIN ratón: plan, selección, fecha inválida, corrección, guardado, conflicto, conciliación y descarga', async ({ page }) => {
  test.setTimeout(240_000); const s = await start(); const seen = await guard(page, s); await page.goto(s.url);
  const press = async (loc: Locator, key = 'Enter') => { await reach(page, loc); await page.keyboard.press(key); };
  await press(page.getByRole('button', { name: 'Elegir un plan de 60 minutos' })); await expect(page.getByRole('heading', { name: 'Estado: Trabajo local' })).toBeVisible();
  await press(page.getByRole('button', { name: 'Cargar estimaciones del guion' })); await expect(page.getByText('3 tareas caben en 60 min')).toBeVisible();
  await press(task(page, 'task-5')); await expect(page.getByRole('heading', { name: 'Tarea task-5' })).toBeFocused();
  const date = page.getByLabel('Fecha límite', { exact: true }).first(); await typeInto(page, date, 'mañana por la tarde'); await press(page.getByRole('button', { name: 'Revisar el cambio' }));
  await expect(page.getByText('Introduce una fecha válida.')).toBeVisible(); await expect(date).toHaveAttribute('aria-invalid', 'true');
  const describedBy = await date.getAttribute('aria-describedby'); expect(describedBy, 'el campo apunta a su error').toBeTruthy(); await expect(page.locator('#' + describedBy)).toContainText('fecha válida'); await expect(date, 'el texto inválido se conserva').toHaveValue('mañana por la tarde');
  await typeInto(page, date, '2026-11-06'); await press(page.getByRole('button', { name: 'Revisar el cambio' })); await expect(page.getByText('due_date: 2026-11-02 → 2026-11-06')).toBeVisible();
  await press(page.getByRole('button', { name: 'Confirmar y guardar en la copia local' })); await expect(notice(page)).toContainText('Cambio local guardado y confirmado');
  await typeInto(page, page.getByLabel('Asunto', { exact: true }).last(), 'Confirmar entrega con el cliente'); await typeInto(page, page.getByLabel('Fecha límite', { exact: true }).last(), '2026-11-04'); await press(page.getByRole('button', { name: 'Crear tarea local' })); await expect(notice(page)).toContainText('Tarea creada');
  await press(page.getByRole('button', { name: 'Simular la vuelta del CRM' }).first()); await expect(notice(page)).toContainText('El CRM simulado ha vuelto');
  await press(page.getByRole('button', { name: 'Preparar el retorno' }).first()); await expect(page.locator('tr.conflict')).toHaveCount(1);
  const group = page.getByRole('group', { name: /Decisión para .*Fecha límite/ }); await expect(group, 'el grupo de decisión tiene nombre accesible').toBeVisible();
  await press(page.getByRole('radio', { name: 'Conservar lo local' }), 'Space'); await expect(notice(page)).toContainText('Decisión registrada'); await expect(page.getByRole('radio', { name: 'Conservar lo local' })).toBeChecked();
  await press(page.getByLabel('Perder el acuse del próximo create'), 'Space'); await expect(notice(page)).toContainText('Armado');
  await press(page.getByRole('button', { name: 'Aprobar lo revisado' }).first()); await expect(notice(page)).toContainText('Plan aprobado');
  await press(page.getByRole('button', { name: 'Aplicar (simulado)' })); await expect(notice(page)).toContainText('Resultado incierto');
  // un error útil mueve el foco a la alerta
  await typeInto(page, page.getByLabel('ID remoto a comprobar'), 'crm-task-9999'); await press(page.getByRole('button', { name: 'Conciliar con este ID' }));
  const alert = page.getByRole('alert'); await expect(alert).toBeVisible(); await expect(alert, 'el foco va a la alerta tras el error').toBeFocused();
  await press(page.getByRole('button', { name: 'Buscar candidatos en el CRM simulado' })); await press(page.getByRole('button', { name: 'Usar este ID' }));
  await press(page.getByRole('button', { name: 'Conciliar con este ID' })); await expect(notice(page)).toContainText('Conciliado sin repetir el envío');
  await press(page.getByRole('button', { name: 'Aprobar lo revisado' }).first()); await press(page.getByRole('button', { name: 'Aplicar (simulado)' }));
  await expect(page.getByRole('heading', { name: 'Estado: Devolución simulada verificada' })).toBeVisible(); await press(page.getByRole('button', { name: 'Cerrar el ensayo' }).first());
  await expect(page.getByRole('heading', { name: 'Estado: Ensayo cerrado' })).toBeVisible();
  const link = page.getByRole('link', { name: 'Descargar el informe' }); await reach(page, link); const [download] = await Promise.all([page.waitForEvent('download'), page.keyboard.press('Enter')]);
  expect(download.suggestedFilename()).toBe('informe-rescate.html'); const direct = await api(s, '/api/rescue/state'); expect(direct.crm.stats.calls.create).toBe(1); expect(direct.crm.stats.duplicateCreates).toBe(0);
  expect(seen.errors).toEqual([]); expect(seen.outside).toEqual([]); await s.stop();
});

const toUncertain = async (page: Page, subject: string) => {
  await page.getByRole('button', { name: 'Elegir un plan de 60 minutos' }).click(); await page.getByRole('button', { name: 'Cargar estimaciones del guion' }).click();
  await task(page, 'task-4').click(); await page.getByRole('combobox', { name: /Estado/ }).selectOption('completed'); await page.getByRole('button', { name: 'Revisar el cambio' }).click(); await page.getByRole('button', { name: 'Confirmar y guardar en la copia local' }).click(); await expect(notice(page)).toContainText('guardado y confirmado');
  await task(page, 'task-5').click(); await page.getByLabel('Fecha límite', { exact: true }).first().fill('2026-11-06'); await page.getByRole('button', { name: 'Revisar el cambio' }).click(); await page.getByRole('button', { name: 'Confirmar y guardar en la copia local' }).click(); await expect(notice(page)).toContainText('guardado y confirmado');
  await page.getByLabel('Asunto', { exact: true }).last().fill(subject); await page.getByLabel('Fecha límite', { exact: true }).last().fill('2026-11-04'); await page.getByRole('button', { name: 'Crear tarea local' }).click(); await expect(notice(page)).toContainText('Tarea creada');
  await page.getByRole('button', { name: 'Simular la vuelta del CRM' }).first().click(); await expect(notice(page)).toContainText('ha vuelto'); await page.getByRole('button', { name: 'Preparar el retorno' }).first().click(); await expect(page.locator('tr.conflict')).toHaveCount(1);
  await page.getByRole('radio', { name: 'Conservar lo local' }).click(); await expect(notice(page)).toContainText('Decisión registrada'); await page.getByLabel('Perder el acuse del próximo create').click(); await expect(notice(page)).toContainText('Armado');
  await page.getByRole('button', { name: 'Aprobar lo revisado' }).first().click(); await page.getByRole('button', { name: 'Aplicar (simulado)' }).click(); await expect(notice(page)).toContainText('Resultado incierto');
};

for (const width of [1440, 390, 320]) test((width < 1000 ? 'DEFECTO · ' : 'DOM · ') + 'capturas ' + width + ' px del estado más exigente (conflicto + incierto): sin desbordamiento, objetivos ≥ 44 px y foco visible', async ({ page }) => {
  test.setTimeout(180_000); const s = await start(); const seen = await guard(page, s); await page.setViewportSize({ width, height: 900 }); await page.goto(s.url);
  await toUncertain(page, 'Confirmar entrega con el cliente');
  await page.screenshot({ path: join(EVIDENCE, 'followup-' + width + '-conflicto-incierto.png'), fullPage: true });
  await page.locator('#rr-return').screenshot({ path: join(EVIDENCE, 'followup-' + width + '-retorno-detalle.png') });
  const widths = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth, [...document.querySelectorAll('.rr-sr')].map(e => Math.round(e.getBoundingClientRect().right))] as [number, number, number[]]);
  expect(widths[0] <= widths[1] + 1, 'sin desbordamiento horizontal de la página en el retorno: scrollWidth ' + widths[0] + ' > innerWidth ' + widths[1] + '; leyendas .rr-sr (posición absoluta) a la derecha: ' + JSON.stringify(widths[2])).toBe(true);
  await expect(page.getByRole('heading', { name: /Resultado incierto: / })).toBeVisible(); for (const name of ['Conciliar con este ID', 'Buscar candidatos en el CRM simulado']) expect((await page.getByRole('button', { name }).boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await page.keyboard.press('Tab'); await expect(page.locator(':focus')).toBeVisible();
  expect(seen.errors).toEqual([]); expect(seen.outside).toEqual([]); await s.stop();
});

for (const width of [1440, 390, 320]) test('DEFECTO · ' + width + ' px: un asunto de 300 caracteres sin espacios no debe desbordar la página (diario, plan, alerta)', async ({ page }) => {
  test.setTimeout(120_000); const s = await start(); await guard(page, s); await page.setViewportSize({ width, height: 900 }); await page.goto(s.url);
  await page.getByRole('button', { name: 'Elegir un plan de 60 minutos' }).click(); await expect(page.getByRole('heading', { name: 'Estado: Trabajo local' })).toBeVisible();
  await page.getByLabel('Asunto', { exact: true }).last().fill('S'.repeat(300)); await page.getByLabel('Fecha límite', { exact: true }).last().fill('2026-11-04'); await page.getByRole('button', { name: 'Crear tarea local' }).click(); await expect(notice(page)).toContainText('Tarea creada');
  await page.route('**/api/rescue/estimates-script', route => route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'Error ' + 'x'.repeat(1400), code: 'INTERNAL' }) }));
  await page.getByRole('button', { name: 'Cargar estimaciones del guion' }).click(); await expect(page.getByRole('alert').first()).toBeVisible();
  await page.screenshot({ path: join(EVIDENCE, 'followup-' + width + '-texto-largo.png'), fullPage: true });
  expect(await noOverflow(page), 'sin desbordamiento horizontal de la página: ' + JSON.stringify(await offenders(page))).toBe(true); await s.stop();
});
