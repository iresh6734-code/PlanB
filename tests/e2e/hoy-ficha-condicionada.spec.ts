import { test, expect, type Page, type Route } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { HoyHarness, ficha, gate, openTask, openToday, resultados, taskButton } from './hoy-recuperable-harness';

// A2 · GUARDADO CONDICIONADO Y COMPARADOR EN LA FICHA DE LA APP REAL (unidad CLAUDE-HOY-FICHA-CONDICIONADA-A2). Reutiliza el arnés CLAUDE-HOY-APP-PROBES-A SIN modificarlo (lo extiende por herencia
// solo para añadir una ruta de ayuda que cambia la generación). Todo pasa por la App compilada, la barra lateral, Hoy y la ficha reales contra un servidor real con `taskRevisions`,
// SQLite de archivo, 127.0.0.1 y red exterior bloqueada. Los recuentos de PATCH condicionados, PATCH legados, 409 y filas de historial salen DEL SERVIDOR, no de la interfaz.
// Los fallos que no pueden producirse de forma determinista con el servidor real (401/404/422/500) se inyectan con page.route SIN dejar pasar la petición: el servidor no llega a verla y
// el registro del servidor demuestra que NO hubo ningún PATCH legado ni de otro tipo.
const EXTRA = `app.post('/__h/regenerate', async () => { const snapshot: any = store.snapshot; store.saveGeneration(makeDemoSpec(snapshot), { provider: 'demo', model: null, generatedAt: new Date().toISOString(), prompt: '', approved: false }); store.activate(); return { ok: true }; });\n`;
class Harness extends HoyHarness {
  override async prepare() {
    await super.prepare();
    const file = path.join(this.root, 'server.mts'), source = fs.readFileSync(file, 'utf8');
    if (!source.includes('await app.listen(')) throw new Error('El servidor del arnés cambió: no se encuentra el punto de extensión.');
    fs.writeFileSync(file, source.replace('await app.listen(', EXTRA + 'await app.listen('));
  }
  async regenerate() { expect((await fetch(this.origin + '/__h/regenerate', { method: 'POST' })).ok).toBe(true); }
}
const harness = new Harness();
test.setTimeout(120_000);
test.beforeAll(async () => { await harness.prepare(); });
test.beforeEach(() => { harness.reset(); });
test.afterEach(async ({ page }) => { await page.unrouteAll({ behavior: 'ignoreErrors' }).catch(() => undefined); await harness.stop(); });

const dlg = (page: Page) => page.getByRole('dialog');   // sin nombre: el título de la ficha es el asunto y puede cambiar
const field = (page: Page, label: string) => dlg(page).getByRole('textbox', { name: label });
const due = (page: Page) => dlg(page).getByLabel('Fecha límite');
const save = (page: Page) => dlg(page).getByRole('button', { name: /Guardar cambios|Guardando/ });
const comparator = (page: Page) => page.getByRole('region', { name: /Revisa qué mantener de/ });
const banner = (page: Page) => dlg(page).locator('#ltf-banner');
async function second(context: import('@playwright/test').BrowserContext) { const other = await context.newPage(); await harness.guard(other); await openToday(other, harness.origin); return other; }
/** Escritura aplicada por una pestaña "ganadora": cambia las notas y la fecha límite de task-2 y guarda (un PATCH condicionado aplicado). La tarea sigue en la cola de Hoy. */
async function winnerWrites(page: Page) { await openTask(page, 'task-2'); await due(page).fill('2026-11-20'); await field(page, 'Notas').fill('Nota de A'); await save(page).click(); await expect(dlg(page).locator('#ltf-ack')).toContainText('Cambios guardados'); }
const snapshotCounts = async () => { const counts = harness.counts(), state = await harness.state(); return { conditioned: counts.conditionedPatches, legacy: counts.legacyPatches, conflicts: counts.conflicts409, other: counts.otherPatches, history: state.changes }; };

test('RECUENTO · dos pestañas: 2 PATCH condicionados (1 aplicado, 1 409) y 1 fila ANTES de decidir; elegir, previsualizar y volver no escriben; el segundo clic = 3 PATCH condicionados, 2 aplicaciones y 2 filas', async ({ page, context }) => {
  await harness.start(page); await openToday(page, harness.origin); const other = await second(context);
  await openTask(other, 'task-2');                                                                  // la pestaña B abre la MISMA revisión
  await winnerWrites(page);                                                                         // la A gana
  await field(other, 'Notas').fill('Nota de B'); await field(other, 'Asunto').fill('Asunto de B'); await save(other).click();   // la B edita sobre la revisión que abrió: colisiona en Notas; su Asunto no lo tocó nadie
  await expect(comparator(other)).toBeVisible();
  expect(await snapshotCounts(), 'antes de resolver: un aplicado + un 409; cero PATCH legados').toEqual({ conditioned: 2, legacy: 0, conflicts: 1, other: 0, history: 1 });
  const stateAfterConflict = await harness.state(); expect(stateAfterConflict.task2).toMatchObject({ subject: 'Llamar a Ana', notes: 'Nota de A', due_date: '2026-11-20' }); // el 409 no escribió nada de B
  // El comparador muestra los tres valores, conserva el cambio ajeno y deja decidir lo que colisiona.
  await expect(comparator(other)).toContainText('Cambio ajeno'); await expect(comparator(other)).toContainText('Fecha límite'); await expect(comparator(other)).toContainText('Conflicto: decide'); await expect(comparator(other)).toContainText('Tu cambio');
  await expect(other.locator('#tcr-title')).toBeFocused();                                          // foco útil al abrir
  await other.getByRole('radiogroup', { name: 'Qué mantener en Notas' }).getByLabel('Mantener mi propuesta').check();
  expect((await snapshotCounts()).conditioned, 'elegir no escribe').toBe(2);
  await other.getByRole('button', { name: /Preparar el nuevo guardado/ }).click();
  await expect(banner(other)).toContainText('Propuesta preparada con tus decisiones'); await expect(banner(other)).toBeFocused();   // vuelve a la ficha con foco en el aviso
  expect(await snapshotCounts(), 'previsualizar/volver no escribe').toEqual({ conditioned: 2, legacy: 0, conflicts: 1, other: 0, history: 1 });
  await expect(due(other)).toHaveValue('2026-11-20'); await expect(field(other, 'Notas')).toHaveValue('Nota de B'); await expect(field(other, 'Asunto')).toHaveValue('Asunto de B');   // cambio ajeno conservado + mi decisión + mi otro cambio
  await save(other).click(); await expect(dlg(other).locator('#ltf-ack')).toContainText('Cambios guardados');                 // SEGUNDO acto explícito
  expect(await snapshotCounts(), 'confirmada la propuesta: tres PATCH condicionados, dos aplicados, dos filas').toEqual({ conditioned: 3, legacy: 0, conflicts: 1, other: 0, history: 2 });
  expect((await harness.state()).task2).toMatchObject({ subject: 'Asunto de B', notes: 'Nota de B', due_date: '2026-11-20' });
});

test('COMPARADOR con teclado y foco: elegir con la barra espaciadora, «Volver al formulario» conserva el borrador con 0 PATCH y un botón para volver a comparar; el foco vuelve al aviso', async ({ page, context }) => {
  await harness.start(page); await openToday(page, harness.origin); const other = await second(context);
  await openTask(other, 'task-2'); await winnerWrites(page);
  await field(other, 'Notas').fill('Nota de B'); await save(other).click(); await expect(comparator(other)).toBeVisible();
  const before = await snapshotCounts();
  const mine = other.getByRole('radiogroup', { name: 'Qué mantener en Notas' }).getByLabel('Mantener mi propuesta'); await mine.focus(); await other.keyboard.press('Space'); await expect(mine).toBeChecked();
  await other.getByRole('button', { name: 'Volver al formulario' }).focus(); await other.keyboard.press('Enter');
  await expect(banner(other)).toContainText('Tu borrador se conserva'); await expect(banner(other)).toBeFocused(); await expect(field(other, 'Notas')).toHaveValue('Nota de B');
  expect(await snapshotCounts(), 'volver al formulario no escribe').toEqual(before);
  await banner(other).getByRole('button', { name: 'Comparar con la versión actual' }).click(); await expect(comparator(other)).toBeVisible(); expect(await snapshotCounts()).toEqual(before);
  // Cerrar con el comparador abierto NO pierde el borrador en silencio: pide confirmar.
  await other.keyboard.press('Escape'); await expect(other.locator('#ltf-discard')).toBeVisible(); expect(await snapshotCounts()).toEqual(before);
});

test('SEGUNDO CONFLICTO: tras preparar la propuesta otra edición cambia la tarea; confirmar da otro 409, la intención se conserva y se decide sobre la versión NUEVA', async ({ page, context }) => {
  await harness.start(page); await openToday(page, harness.origin); const other = await second(context); const third = await second(context);
  await openTask(other, 'task-2'); await winnerWrites(page);
  await field(other, 'Notas').fill('Nota de B'); await save(other).click(); await expect(comparator(other)).toBeVisible();
  await other.getByRole('radiogroup', { name: 'Qué mantener en Notas' }).getByLabel('Mantener mi propuesta').check(); await other.getByRole('button', { name: /Preparar el nuevo guardado/ }).click(); await expect(banner(other)).toContainText('Propuesta preparada');
  await openTask(third, 'task-2'); await due(third).fill('2026-11-25'); await save(third).click(); await expect(dlg(third).locator('#ltf-ack')).toContainText('Cambios guardados');   // C cambia la tarea
  await save(other).click(); await expect(comparator(other)).toBeVisible();                           // otro 409 → vuelve a pedir decisión sobre la versión nueva
  await expect(comparator(other)).toContainText('Fecha límite'); await expect(comparator(other)).toContainText('Cambio ajeno');
  const counts = await snapshotCounts(); expect(counts).toMatchObject({ conditioned: 4, legacy: 0, conflicts: 2, history: 2 });   // A aplica (1), B 409 (2), C aplica (3), B 409 otra vez (4): dos aplicados, dos filas
  expect((await harness.state()).task2).toMatchObject({ due_date: '2026-11-25', notes: 'Nota de A', subject: 'Llamar a Ana' });  // lo de B sigue sin escribirse
  await other.getByRole('button', { name: /Preparar el nuevo guardado/ }).click(); await expect(banner(other)).toContainText('Propuesta preparada'); await save(other).click();
  await expect(dlg(other).locator('#ltf-ack')).toContainText('Cambios guardados');
  expect((await harness.state()).task2).toMatchObject({ due_date: '2026-11-25', notes: 'Nota de B' }); expect((await snapshotCounts()).legacy).toBe(0);
});

test('GENERACIÓN: cambia la copia ANTES de enviar → «no enviado» con 0 PATCH; cambia DURANTE el envío → 409 y el comparador explica que no se puede combinar y conserva lo escrito', async ({ page }) => {
  await harness.start(page); await openToday(page, harness.origin); await openTask(page, 'task-2'); await field(page, 'Notas').fill('Escrito antes de regenerar');
  await harness.regenerate(); await save(page).click();
  await expect(banner(page)).toContainText('ya no corresponde a la copia actual'); expect((await snapshotCounts()).conditioned).toBe(0); await expect(field(page, 'Notas')).toHaveValue('Escrito antes de regenerar');
  await page.keyboard.press('Escape'); await page.getByRole('button', { name: 'Descartar y volver a Hoy' }).click(); await expect(ficha(page)).toHaveCount(0);
  // Durante el envío: la comprobación de contexto ya pasó; el servidor cambia de generación justo antes de recibir el PATCH.
  await page.reload(); await openToday(page, harness.origin); await openTask(page, 'task-2'); await field(page, 'Notas').fill('Escrito durante el envío');
  let regenerated = false; await page.route('**/api/v7/task-revision/task-2', async (route: Route) => { if (route.request().method() === 'PATCH' && !regenerated) { regenerated = true; await harness.regenerate(); } await route.fallback(); });
  await save(page).click(); await expect(page.getByRole('heading', { name: 'No se puede combinar esta tarea' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'No se puede combinar esta tarea' })).toContainText('Escrito durante el envío');   // lo escrito se conserva a la vista
  const counts = await snapshotCounts(); expect(counts).toMatchObject({ conditioned: 1, legacy: 0, conflicts: 1, history: 0 });
  await page.getByRole('button', { name: 'Volver al formulario' }).click(); await expect(field(page, 'Notas')).toHaveValue('Escrito durante el envío'); expect((await snapshotCounts()).conditioned).toBe(1);
});

test('NO-OP: sin cambios locales NO sale ninguna petición; un PATCH sin efecto que llega al servidor devuelve `unchanged` y no añade historial', async ({ page }) => {
  await harness.start(page); await openToday(page, harness.origin); await openTask(page, 'task-3');
  await field(page, 'Notas').fill('Temporal'); await field(page, 'Notas').fill('Nota inicial');   // vuelve al valor original
  await expect(save(page)).toHaveAttribute('aria-disabled', 'true'); await save(page).click({ force: true }); await page.waitForTimeout(400);
  expect(await snapshotCounts(), 'ni un PATCH ni historial').toEqual({ conditioned: 0, legacy: 0, conflicts: 0, other: 0, history: 0 });
  const view = await (await page.request.get(harness.origin + '/api/v7/task-revision/task-3')).json() as { revision: string };
  const response = await page.request.patch(harness.origin + '/api/v7/task-revision/task-3', { data: { expectedRevision: view.revision, values: { notes: 'Nota inicial' } } });
  expect(response.status()).toBe(200); const body = await response.json() as { changed: boolean; current: { revision: string } };
  expect({ changed: body.changed, sameToken: body.current.revision === view.revision }).toEqual({ changed: false, sameToken: true });
  expect(await snapshotCounts(), 'una petición sin cambio efectivo conserva la respuesta unchanged y el historial intacto').toEqual({ conditioned: 1, legacy: 0, conflicts: 0, other: 0, history: 0 });
});

for (const [code, expected] of [[401, /bloqueada/], [404, /ya no existe/], [422, /Datos no válidos|Valor no permitido/], [500, /No se sabe si el guardado llegó/]] as const) {
  test('ERROR ' + code + ' del endpoint condicionado: se conserva el borrador y NO hay ningún PATCH legado ni reenvío por otra ruta', async ({ page }) => {
    await harness.start(page); await openToday(page, harness.origin); await openTask(page, 'task-2'); await field(page, 'Notas').fill('Mi borrador');
    let attempts = 0;
    await page.route('**/api/v7/task-revision/task-2', route => { if (route.request().method() !== 'PATCH') return route.fallback(); attempts++; return route.fulfill({ status: code, contentType: 'application/json', body: JSON.stringify(code === 422 ? { error: 'Datos no válidos', details: { notes: 'Valor no permitido' } } : { error: code === 401 ? 'Sesión no válida' : code === 404 ? 'No existe' : 'Fallo interno' }) }); });
    await save(page).click(); await expect(dlg(page)).toContainText(expected);
    expect(attempts, 'un único intento condicionado').toBe(1); expect(await snapshotCounts(), 'el servidor no vio ningún PATCH, ni legado ni de otro tipo').toMatchObject({ conditioned: 0, legacy: 0, other: 0, history: 0 });
    if (code === 401 || code === 422) await expect(field(page, 'Notas')).toHaveValue('Mi borrador');   // 404 y 500 sustituyen el formulario (tarea ausente / resultado incierto); el borrador sigue en la operación
  });
}

test('LECTURA FALLIDA al abrir: la ficha lo dice, no hay PATCH y NO se lee ni guarda por la ruta anterior', async ({ page }) => {
  await harness.start(page); await openToday(page, harness.origin);
  await page.route('**/api/v7/task-revision/task-2', route => route.request().method() === 'GET' ? route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"Fallo interno"}' }) : route.fallback());
  await taskButton(page, 'task-2').focus(); await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog').getByText('No se pudo abrir la tarea')).toBeVisible();
  const lines = harness.requests(); expect(lines.some(line => line.path.startsWith('/api/records/tasks/')), 'ninguna lectura ni escritura por la ruta anterior').toBe(false); expect((await snapshotCounts()).conditioned).toBe(0);
});

test('HOMÓNIMAS: dos tareas con el mismo asunto; guardar task-3 va a /task-revision/task-3 con su propio token y no toca task-2', async ({ page }) => {
  await harness.start(page); await openToday(page, harness.origin); await openTask(page, 'task-3'); await field(page, 'Notas').fill('Solo la tres'); await save(page).click();
  await expect(ficha(page).locator('#ltf-ack')).toContainText('Cambios guardados');
  const lines = harness.requests().filter(line => line.method === 'PATCH'); expect(lines.map(line => line.path)).toEqual(['/api/v7/task-revision/task-3']);
  const state = await harness.state(); expect(state.task3).toMatchObject({ notes: 'Solo la tres' }); expect(state.task2).toMatchObject({ notes: 'Nota inicial' });
});

test('RESULTADOS → intento exacto: un rechazo por revisión que llega con la ficha CERRADA se recupera desde «Resultados» abriendo el comparador, sin sobrescribir', async ({ page, context }) => {
  await harness.start(page); await openToday(page, harness.origin); const other = await second(context);
  await openTask(other, 'task-2'); await winnerWrites(page);
  const barrier = gate(); let held = 0;
  await other.route('**/api/v7/task-revision/task-2', async route => { if (route.request().method() !== 'PATCH') return route.fallback(); held++; await barrier.promise; await route.fallback(); });
  await field(other, 'Notas').fill('Nota de B'); await save(other).click(); await expect.poll(() => held).toBe(1);
  try { await other.keyboard.press('Escape'); await expect(ficha(other)).toHaveCount(0); } finally { barrier.release(); }
  const surface = resultados(other); await expect(surface).toContainText('no se aplicó'); await surface.locator('summary').filter({ hasText: 'Lo que escribiste (solo en esta ventana)' }).click();
  await surface.getByRole('button', { name: /Abrir la tarea: / }).first().click();
  await expect(comparator(other)).toBeVisible(); expect(await snapshotCounts(), 'recuperar no escribe: el PATCH de B se aplicó 0 veces').toMatchObject({ conditioned: 2, legacy: 0, conflicts: 1, history: 1 });
  expect((await harness.state()).task2).toMatchObject({ notes: 'Nota de A' });
});

for (const width of [390, 320]) {
  test('COMPARADOR EN LA APP a ' + width + ' px: sin desbordamiento, objetivos táctiles, decidir y confirmar solo con teclado y foco útil al abrir y al volver', async ({ page, context }, testInfo) => {
    await harness.start(page); await openToday(page, harness.origin, { width, height: 800 }); const desktop = await second(context); await desktop.setViewportSize({ width: 1440, height: 900 });
    const overflow = (target: Page) => target.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    await openTask(page, 'task-2'); await winnerWrites(desktop);                                       // la pestaña de escritorio gana; la estrecha abrió la misma revisión
    await field(page, 'Notas').fill('Nota de B con un texto bastante largo para comprobar que se pliega sin desbordar a ' + width + ' píxeles'); await field(page, 'Asunto').fill('Asunto de B'); await save(page).click();
    await expect(comparator(page)).toBeVisible(); await expect(page.locator('#tcr-title')).toBeFocused();
    expect(await overflow(page), 'sin desbordamiento horizontal con el comparador').toBeLessThanOrEqual(0);
    const choices = page.locator('.tcr-choice'); expect(await choices.count()).toBeGreaterThan(0);
    for (const box of await choices.evaluateAll(nodes => nodes.map(node => { const r = node.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height) }; }))) expect(box.h, 'objetivo táctil de la opción ≥ 40 px').toBeGreaterThanOrEqual(40);
    // Solo teclado: Tab hasta la opción de Notas, Espacio, Tab hasta «Preparar el nuevo guardado», Enter.
    const mine = page.getByRole('radiogroup', { name: 'Qué mantener en Notas' }).getByLabel('Mantener mi propuesta'); await mine.focus(); await page.keyboard.press('Space'); await expect(mine).toBeChecked();
    const prepare = page.getByRole('button', { name: /Preparar el nuevo guardado/ }); for (let i = 0; i < 12 && !(await prepare.evaluate(node => node === document.activeElement)); i++) await page.keyboard.press('Tab');
    await expect(prepare).toBeFocused(); const shot = path.join(harness.caseDir, 'comparador-' + width + '.png'); await page.screenshot({ path: shot, fullPage: false }); await testInfo.attach('comparador-' + width, { path: shot, contentType: 'image/png' });
    await page.keyboard.press('Enter'); await expect(banner(page)).toContainText('Propuesta preparada'); await expect(banner(page)).toBeFocused();
    expect(await overflow(page), 'sin desbordamiento al volver al formulario').toBeLessThanOrEqual(0); expect(await snapshotCounts(), 'decidir y volver no escribe').toMatchObject({ conditioned: 2, legacy: 0, conflicts: 1, history: 1 });
    await save(page).click(); await expect(dlg(page).locator('#ltf-ack')).toContainText('Cambios guardados'); expect(await snapshotCounts()).toMatchObject({ conditioned: 3, legacy: 0, conflicts: 1, history: 2 });
  });
}
