import { test, expect, type Page, type Route } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { HoyHarness, gate, nav, openToday, resultados } from './hoy-recuperable-harness';

// «POR DECIDIR» EN RESULTADOS (unidad CLAUDE-HOY-POR-DECIDIR-A2), en la App compilada contra un servidor real con revisiones, SQLite de archivo, 127.0.0.1 y red exterior bloqueada. Reutiliza el
// arnés CLAUDE-HOY-APP-PROBES-A sin modificarlo (lo extiende por herencia solo para añadir una ruta que cambia de captura). Los recuentos de PATCH salen del servidor.
// Mezcla: task-2 INCIERTO (el servidor aplica y la respuesta se pierde), task-3 RECHAZADO (422 que llega con la ficha cerrada), task-4 CONFIRMADO con la recarga de la lista FALLIDA y
// task-5 CONFIRMADO limpio. Todas se guardan y se cierran las fichas con el envío retenido, de modo que el resultado vive en «Resultados» y no en la ficha.
const EXTRA = `app.post('/__h/swap', async () => { const next: any = makeFixture('agency'); next.id = 'captura-otra'; next.name = 'Otra captura'; next.capturedAt = '2026-11-09T09:00:00.000Z';
  for (const id of ['task-2', 'task-3']) { const task = next.records.find((r: any) => r.entity === 'tasks' && r.id === id); task.values.subject = 'Llamar a Ana'; task.values.status = 'pending'; task.values.notes = 'Nota de la otra captura'; }
  store.importSnapshot(next, true); store.saveGeneration(makeDemoSpec(next), { provider: 'demo', model: null, generatedAt: '2026-11-09T09:30:00Z', prompt: '', approved: false }); store.activate(); return { ok: true }; });\n`;
class Harness extends HoyHarness {
  override async prepare() {
    await super.prepare();
    const file = path.join(this.root, 'server.mts'), source = fs.readFileSync(file, 'utf8');
    if (!source.includes('await app.listen(')) throw new Error('El servidor del arnés cambió: no se encuentra el punto de extensión.');
    fs.writeFileSync(file, source.replace('await app.listen(', EXTRA + 'await app.listen('));
  }
  async swapCapture() { expect((await fetch(this.origin + '/__h/swap', { method: 'POST' })).ok).toBe(true); }
}
const harness = new Harness();
test.setTimeout(150_000);
test.beforeAll(async () => { await harness.prepare(); });
test.beforeEach(() => { harness.reset(); });
test.afterEach(async ({ page }) => { await page.unrouteAll({ behavior: 'ignoreErrors' }).catch(() => undefined); await harness.stop(); });
test.afterAll(() => { harness.assertAllClosed(); });

const dlg = (page: Page) => page.getByRole('dialog');
const taskButton = (page: Page, id: string) => page.getByRole('button', { name: new RegExp('\\(ID ' + id + '\\)$') });
const noteField = (page: Page) => dlg(page).getByRole('textbox', { name: 'Notas' });
const filter = (page: Page, name: RegExp) => resultados(page).getByRole('group', { name: 'Qué resultados ver' }).getByRole('button', { name });
const item = (page: Page, id: string) => resultados(page).locator('.ltso-item[data-task="' + id + '"]');
const group = (page: Page, id: string) => resultados(page).locator('.ltso-group[data-group="' + id + '"]');
async function expand(page: Page) { const toggle = resultados(page).getByRole('button', { name: /Ver detalle|Ocultar detalle/ }); if ((await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click(); await expect(toggle).toHaveAttribute('aria-expanded', 'true'); }

type Mode = 'lose' | 'reject422' | 'confirm';
/** Guarda `notes` en la tarea y CIERRA la ficha con el envío retenido; después libera la barrera con el desenlace pedido (el servidor aplica en 'lose' y 'confirm'; en 'reject422' ni lo ve). */
async function saveClosed(page: Page, id: string, notes: string, mode: Mode) {
  const barrier = gate(); let held = 0;
  await page.route('**/api/**', async (route: Route) => {
    const url = new URL(route.request().url());
    if (route.request().method() !== 'PATCH' || !url.pathname.endsWith('/' + id)) return route.fallback();
    held++;
    if (mode === 'reject422') { await barrier.promise; await route.fulfill({ status: 422, contentType: 'application/json', body: JSON.stringify({ error: 'Datos no válidos', details: { notes: 'Valor no permitido' } }) }); return; }
    const response = await route.fetch(); await barrier.promise;
    if (mode === 'lose') await route.abort('connectionreset').catch(() => undefined); else await route.fulfill({ response }).catch(() => undefined);
  });
  await taskButton(page, id).focus(); await page.keyboard.press('Enter'); await expect(dlg(page)).toContainText(id);
  await noteField(page).fill(notes); await dlg(page).getByRole('button', { name: /Guardar cambios/ }).click(); await expect.poll(() => held).toBe(1);
  try { await page.keyboard.press('Escape'); await expect(dlg(page)).toHaveCount(0); } finally { barrier.release(); }
}
async function mix(page: Page) {
  await harness.start(page); await openToday(page, harness.origin);
  let failList = false; await page.route('**/api/v7/local-operations', route => failList ? route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"interno"}' }) : route.fallback());
  await saveClosed(page, 'task-2', 'Nota de la tarea 2', 'lose');
  await saveClosed(page, 'task-3', 'Nota de la tarea 3', 'reject422');
  failList = true; await saveClosed(page, 'task-4', 'Nota de la tarea 4', 'confirm'); await expect(resultados(page)).toContainText('lista sin actualizar'); failList = false;
  await saveClosed(page, 'task-5', 'Nota de la tarea 5', 'confirm');
  await expand(page); await expect(item(page, 'task-5')).toContainText('Guardado confirmado');
  return { setFailList: (value: boolean) => { failList = value; } };
}

test('MEZCLA: «Todos (4)» y «Por decidir (3)»; el filtro agrupa por la acción disponible y oculta el confirmado limpio; en «Todos» sí está', async ({ page }) => {
  await mix(page);
  await expect(filter(page, /^Todos \(4\)$/)).toHaveAttribute('aria-pressed', 'true'); await expect(filter(page, /^Por decidir \(3\)$/)).toHaveAttribute('aria-pressed', 'false');
  for (const id of ['task-2', 'task-3', 'task-4', 'task-5']) await expect(item(page, id)).toHaveCount(1);
  await filter(page, /Por decidir/).click(); await expect(filter(page, /Por decidir/)).toHaveAttribute('aria-pressed', 'true'); await expect(filter(page, /Por decidir/)).toBeFocused();   // el foco no salta al alternar
  await expect(group(page, 'uncertain').locator('.ltso-item')).toHaveAttribute('data-task', 'task-2'); await expect(group(page, 'rejected').locator('.ltso-item')).toHaveAttribute('data-task', 'task-3'); await expect(group(page, 'queue-failed').locator('.ltso-item')).toHaveAttribute('data-task', 'task-4');
  await expect(item(page, 'task-5'), 'el confirmado limpio no es una decisión').toHaveCount(0); await expect(group(page, 'in-flight')).toHaveCount(0);
  // Cada grupo ofrece SU acción (la acción disponible es distinta).
  await expect(item(page, 'task-2').getByRole('button', { name: /Comprobar ahora/ })).toBeVisible(); await expect(item(page, 'task-2').getByRole('button', { name: /Reintentar la actualización/ })).toHaveCount(0);
  await expect(item(page, 'task-3').getByRole('button', { name: /Abrir la tarea/ })).toBeVisible(); await expect(item(page, 'task-3').getByRole('button', { name: /Comprobar ahora/ })).toHaveCount(0);
  await expect(item(page, 'task-4').getByRole('button', { name: /Reintentar la actualización/ })).toBeVisible(); await expect(item(page, 'task-4').getByRole('button', { name: /Abrir la tarea/ })).toHaveCount(0);
  await filter(page, /Todos/).click(); await expect(item(page, 'task-5')).toHaveCount(1);
  const counts = harness.counts(); expect({ attempts: counts.attempts, applied: counts.applied, legacy: counts.legacyPatches }, 'task-3 no llegó al servidor: solo 2, 4 y 5').toEqual({ attempts: 3, applied: 3, legacy: 0 });
});

test('ABRIR DESDE EL FILTRO: lleva a la tarea e intento exactos; un 422 recupera lo escrito y no pierde el aviso; cerrar, navegar y volver conserva el filtro y los resultados', async ({ page }) => {
  await mix(page); await filter(page, /Por decidir/).click();
  await item(page, 'task-3').getByRole('button', { name: /Abrir la tarea/ }).click();
  await expect(dlg(page)).toContainText('task-3'); await expect(noteField(page)).toHaveValue('Nota de la tarea 3');                         // lo escrito, recuperado en la tarea correcta (no en la homónima task-2)
  await expect(dlg(page)).toContainText('Se restauró lo que escribiste'); await expect(dlg(page)).toContainText('El aviso sigue en «Resultados de guardado»');
  await page.keyboard.press('Escape'); await page.getByRole('button', { name: 'Descartar y volver a Hoy' }).click(); await expect(dlg(page)).toHaveCount(0);
  await expand(page); await expect(filter(page, /Por decidir/)).toHaveAttribute('aria-pressed', 'true'); await expect(item(page, 'task-3'), 'el aviso del rechazo sigue en Resultados').toHaveCount(1);
  await nav(page, 'Continuidad').click(); await nav(page, 'Hoy').click(); await expect(page.getByRole('heading', { name: 'Hoy', exact: true })).toBeVisible();
  await expand(page); await expect(filter(page, /Por decidir/)).toHaveAttribute('aria-pressed', 'true'); for (const id of ['task-2', 'task-3', 'task-4']) await expect(item(page, id)).toHaveCount(1);   // tras navegar y volver
  // Reabrir el INCIERTO desde el filtro: su intento exacto, sin escribir; comprobar es una lectura.
  const before = harness.counts().attempts; await item(page, 'task-2').getByRole('button', { name: /Abrir la tarea/ }).click();
  await expect(dlg(page)).toContainText('task-2'); await expect(dlg(page)).toContainText('No se sabe si el guardado llegó a aplicarse');
  await expect.poll(() => dlg(page).textContent().then(text => /La lectura muestra que la tarea ya tiene los valores que enviaste/.test(text ?? ''))).toBe(true);   // verificación por GET
  expect(harness.counts().attempts, 'comprobar y reabrir no añaden ningún PATCH').toBe(before);
  const applied = await harness.state(); expect(applied.task2).toMatchObject({ notes: 'Nota de la tarea 2' }); expect(applied.changes).toBe(3);   // el efecto de task-2 ya estaba; task-4 y task-5 también; task-3 nunca
});

test('MISMO ID EN OTRA CAPTURA con un resultado pendiente: abrir desde el filtro NO adopta ese intento ni escribe; y las homónimas no se confunden', async ({ page }) => {
  await harness.start(page); await openToday(page, harness.origin);
  await saveClosed(page, 'task-2', 'Nota de la tarea 2', 'lose'); await saveClosed(page, 'task-3', 'Nota de la tarea 3', 'lose');
  await expand(page); await filter(page, /Por decidir/).click(); await expect(group(page, 'uncertain').locator('.ltso-item')).toHaveCount(2);
  // Homónimas: la ficha de task-3 recupera SU intento, no el de task-2.
  await item(page, 'task-3').getByRole('button', { name: /Abrir la tarea/ }).click(); await expect(dlg(page)).toContainText('task-3'); await expect(dlg(page)).toContainText('No se sabe si el guardado llegó a aplicarse');
  await page.keyboard.press('Escape'); await expect(dlg(page)).toHaveCount(0);
  const before = harness.counts().attempts; await harness.swapCapture();
  await item(page, 'task-2').getByRole('button', { name: /Abrir la tarea/ }).click();
  await expect(dlg(page)).toContainText('task-2'); await expect(dlg(page)).toContainText('Ese resultado es de otra copia'); await expect(noteField(page)).toHaveValue('Nota de la otra captura');
  expect(harness.counts().attempts, 'no se escribió nada').toBe(before); await page.keyboard.press('Escape');
  await expect(item(page, 'task-2'), 'el resultado ajeno sigue visible: no se adoptó, no se descartó').toHaveCount(1);
});

for (const width of [390, 320]) {
  test('TECLADO y ' + width + ' px: el filtro se alcanza con Tab, alterna con Enter y Espacio sin perder el foco, sin desbordamiento y con objetivos táctiles; captura inspeccionada', async ({ page }, testInfo) => {
    await harness.start(page); await openToday(page, harness.origin, { width, height: 800 }); await saveClosed(page, 'task-2', 'Nota de la tarea 2', 'lose'); await expand(page);
    const decide = filter(page, /Por decidir/), all = filter(page, /Todos/);
    await all.focus(); await page.keyboard.press('Tab'); await expect(decide).toBeFocused(); await page.keyboard.press('Enter'); await expect(decide).toHaveAttribute('aria-pressed', 'true'); await expect(decide).toBeFocused();
    await page.keyboard.press('Shift+Tab'); await expect(all).toBeFocused(); await page.keyboard.press('Space'); await expect(all).toHaveAttribute('aria-pressed', 'true'); await expect(all).toBeFocused();
    await decide.click(); await page.waitForTimeout(450);   // las transiciones de 0,15 s terminan antes de medir colores y de la captura
    const luminance = (rgb: string) => { const [r, g, b] = (rgb.match(/\d+/g) ?? ['0', '0', '0']).slice(0, 3).map(Number).map(v => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
    for (const [color, background] of await resultados(page).locator('.ltso-chip').evaluateAll(nodes => nodes.map(node => { const style = getComputedStyle(node); return [style.color, style.backgroundColor]; }))) { const a = luminance(color), b = luminance(background); expect((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05), 'contraste del filtro ≥ 4,5:1').toBeGreaterThanOrEqual(4.5); }
    for (const box of await resultados(page).locator('.ltso-chip').evaluateAll(nodes => nodes.map(node => Math.round(node.getBoundingClientRect().height)))) expect(box, 'objetivo táctil ≥ 44 px').toBeGreaterThanOrEqual(44);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), 'sin desbordamiento horizontal').toBeLessThanOrEqual(0);
    const shot = path.join(harness.caseDir, 'por-decidir-' + width + '.png'); await resultados(page).scrollIntoViewIfNeeded(); await page.screenshot({ path: shot }); await testInfo.attach('por-decidir-' + width, { path: shot, contentType: 'image/png' });
  });
}
test('SIN DECISIONES: con solo un confirmado limpio, «Por decidir (0)» dice que no hay nada y «Todos» lo conserva', async ({ page }) => {
  await harness.start(page); await openToday(page, harness.origin); await saveClosed(page, 'task-5', 'Nota de la tarea 5', 'confirm'); await expand(page);
  await expect(filter(page, /^Por decidir \(0\)$/)).toBeVisible(); await filter(page, /Por decidir/).click(); await expect(resultados(page).locator('.ltso-empty')).toContainText('Nada por decidir ahora');
  await filter(page, /Todos/).click(); await expect(item(page, 'task-5')).toContainText('Guardado confirmado');
});

test('EN CURSO y NO ENVIADO: el envío retenido aparece en «En curso» sin contar como decisión; un guardado que no llegó a salir (falla la comprobación previa) va a «No se aplicó» con 0 PATCH', async ({ page }) => {
  await harness.start(page); await openToday(page, harness.origin);
  // En curso: el PATCH sale pero la respuesta se retiene y la ficha se cierra; la barrera se libera siempre en `finally`.
  const barrier = gate(); let held = 0;
  await page.route('**/api/**', async (route: Route) => { if (route.request().method() !== 'PATCH' || !new URL(route.request().url()).pathname.endsWith('/task-2')) return route.fallback(); held++; const response = await route.fetch(); await barrier.promise; await route.fulfill({ response }).catch(() => undefined); });
  try {
    await taskButton(page, 'task-2').focus(); await page.keyboard.press('Enter'); await noteField(page).fill('Nota en curso'); await dlg(page).getByRole('button', { name: /Guardar cambios/ }).click(); await expect.poll(() => held).toBe(1);
    await page.keyboard.press('Escape'); await expect(dlg(page)).toHaveCount(0); await expand(page);
    await expect(filter(page, /^Todos \(1\)$/)).toBeVisible(); await expect(filter(page, /^Por decidir \(0\)$/), 'en curso no es una decisión').toBeVisible();
    await filter(page, /Por decidir/).click(); await expect(group(page, 'in-flight').locator('.ltso-item')).toHaveAttribute('data-task', 'task-2'); await expect(group(page, 'in-flight')).toContainText('Nada que decidir');
  } finally { barrier.release(); }
  await expect(group(page, 'in-flight')).toHaveCount(0); await expect(resultados(page).locator('.ltso-empty')).toContainText('Nada por decidir ahora');   // confirmado limpio: ya no es una decisión
  await filter(page, /Todos/).click(); await expect(item(page, 'task-2')).toContainText('Guardado confirmado');
  // No enviado: la lectura de estado de la comprobación previa falla con la ficha ya cerrada.
  const gate2 = gate(); let reads = 0; await page.unrouteAll({ behavior: 'ignoreErrors' }); await harness.guard(page);
  await taskButton(page, 'task-3').focus(); await page.keyboard.press('Enter'); await expect(dlg(page)).toContainText('task-3'); await noteField(page).fill('Nota que no sale');
  const before = harness.counts().attempts;
  await page.route('**/api/v2/state', async route => { reads++; await gate2.promise; await route.abort('connectionreset').catch(() => undefined); });
  try { await dlg(page).getByRole('button', { name: /Guardar cambios/ }).click(); await expect.poll(() => reads).toBeGreaterThan(0); await page.keyboard.press('Escape'); await expect(dlg(page)).toHaveCount(0); } finally { gate2.release(); }
  await expect(resultados(page)).toContainText('no se aplicó'); await expand(page); await filter(page, /Por decidir/).click(); await expect(group(page, 'rejected').locator('.ltso-item')).toHaveAttribute('data-task', 'task-3');
  expect(harness.counts().attempts, 'la comprobación previa falló: no salió ningún PATCH').toBe(before);
});
