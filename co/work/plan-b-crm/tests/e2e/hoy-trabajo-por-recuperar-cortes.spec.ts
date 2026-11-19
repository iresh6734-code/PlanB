import { test, expect, type Locator, type Page, type Route } from '@playwright/test';
import { HoyHarness, ficha, gate, nav, openTask, openToday, resultados } from './hoy-recuperable-harness';

// A4 · CUATRO CORTES (unidad CLAUDE-A4-QA-CORTES-V2). GUION CONGELADO mientras Codex decide el contrato: cada sonda ejecuta lo que el producto actual permite, comprueba los EFECTOS observables
// (PATCH recibidos por el servidor, filas de historial del ID exacto, homónima intacta, reinicio con PID distinto, cierre de procesos del arnés 293) y se detiene en una BARRERA que nombra el PRIMER paso
// ausente. Lo escrito después de la barrera es el resultado exigido cuando exista A4. Las rutas /api/v7/task-intents son la PROPUESTA de `A4-DURABLE-RECOVERY-HTTP-PROPOSAL.md` (sin acordar): si Codex decide
// otras, se cambia SOLO la constante `INTENTS`. Las sondas A4 de 240 siguen intactas y este archivo no las sustituye.
//
// Recuento esperado por corte (servidor real, SQLite de archivo, ID exacto task-2 y homónima task-3):
//  ┌────────────────────────────────┬────────┬───────────────┬──────────────────────────────────────────────────────────────┐
//  │ Corte                          │ PATCH  │ Filas task-2  │ Tras reiniciar: abrir y comprobar                             │
//  ├────────────────────────────────┼────────┼───────────────┼──────────────────────────────────────────────────────────────┤
//  │ 1 falla persistir              │ 0      │ 0             │ el borrador sigue en la ficha; 0 PATCH; «sin enviar»          │
//  │ 2 reinicio antes de aplicar    │ 0      │ 0             │ intento exacto INCIERTO; comprobar lee «sin cambio»; +0       │
//  │ 3 acuse perdido tras aplicar   │ 1      │ 1             │ intento exacto incierto; comprobar lee «aplicado»; +0         │
//  │ 4 falla la liquidación         │ 1      │ 1             │ sigue incierto (P4); comprobar lee «aplicado»; +0             │
//  └────────────────────────────────┴────────┴───────────────┴──────────────────────────────────────────────────────────────┘
const INTENTS = '/api/v7/task-intents';
const harness = new HoyHarness();
test.setTimeout(120_000);
test.beforeAll(async () => { await harness.prepare(); });
test.beforeEach(() => { harness.reset(); });
test.afterEach(async ({ page }) => { await page.unrouteAll({ behavior: 'ignoreErrors' }).catch(() => undefined); await harness.stop(); });
test.afterAll(() => { harness.assertAllClosed(); });

const missing = (locator: Locator, what: string) => expect(locator, 'FUNCIÓN AUSENTE: ' + what).toBeVisible({ timeout: 4_000 });
const saveButton = (page: Page) => ficha(page).getByRole('button', { name: /Guardar cambios|Guardando/ });
const isTask2Patch = (route: Route) => route.request().method() === 'PATCH' && /\/api\/(records\/tasks|v7\/task-revision)\/task-2$/.test(new URL(route.request().url()).pathname);
const recoverSurface = (page: Page) => page.getByRole('region', { name: /Trabajo por recuperar/ }).or(page.getByRole('heading', { name: /Trabajo por recuperar/ }));
async function completeTask2(page: Page) { await openTask(page, 'task-2'); await ficha(page).getByRole('combobox', { name: 'Estado *', exact: true }).selectOption('completed'); }
/** PRIMER PASO AUSENTE de la propuesta: el servidor ofrece la ruta de intentos. Un 404 es «capacidad sin montar». */
async function firstStep(page: Page, what: string) {
  const status = await page.evaluate(async (path: string) => (await fetch(path + '?identity=%7B%7D')).status, INTENTS);
  expect(status, 'FUNCIÓN AUSENTE (primer paso): ' + what + ' — GET ' + INTENTS + ' responde ' + status + ' (propuesta A4 sin montar)').not.toBe(404);
}
async function reopenToday(page: Page) { await page.goto(harness.origin); await nav(page, 'Hoy').click(); await expect(page.getByRole('heading', { name: 'Hoy', exact: true })).toBeVisible(); }

test('CORTE 1 · falla la persistencia previa al despacho: la ficha conserva lo escrito, «sin enviar», 0 PATCH y 0 filas', async ({ page }) => {
  await harness.start(page); await openToday(page, harness.origin); const homonym = (await harness.state()).task3!, before = (await harness.state()).history.length;
  // PARTE EJECUTABLE HOY: con la ruta de intentos ausente no hay persistencia que fallar; lo único comprobable es que abrir y editar sin guardar no escribe.
  await completeTask2(page); await page.waitForTimeout(300);
  expect(harness.counts().attempts, 'editar sin guardar: 0 PATCH').toBe(0); expect((await harness.state()).history.length).toBe(before);
  // BARRERA: gancho de servidor que haga fallar el `attempt` (p. ej. HOY_FAIL_INTENT_PERSIST=1, a ofrecer por el servidor de prueba) y la ruta que lo persiste.
  await firstStep(page, 'escritor del diario: persistir el intento antes de despachar');
  // DESPUÉS (cuando exista): guardar ⇒ 503 de persistencia ⇒ la ficha dice «sin enviar» y conserva el borrador; NUNCA hay PATCH.
  await saveButton(page).click(); await expect(ficha(page)).toContainText('sin enviar');
  expect(harness.counts().attempts).toBe(0); expect((await harness.state()).history.length).toBe(before); expect((await harness.state()).task3).toEqual(homonym);
});

test('CORTE 2 · el proceso termina después de persistir y antes de aplicar: tras reiniciar se encuentra el intento exacto, INCIERTO, y comprobar lee «sin cambio» con +0 PATCH', async ({ page }) => {
  await harness.start(page); await openToday(page, harness.origin); const homonym = (await harness.state()).task3!, rows = (await harness.state()).history.length;
  // PARTE EJECUTABLE HOY: el PATCH no llega al servidor (corte antes de aplicar); se reinicia con otro PID y la base conserva 0 efectos.
  await page.route('**/api/**', async (route: Route) => { if (isTask2Patch(route)) { await route.abort('failed'); return; } await route.fallback(); });
  await completeTask2(page); await saveButton(page).click(); await page.waitForTimeout(500);
  expect(harness.counts().attempts, 'el PATCH no llegó al servidor').toBe(0);
  const { before, after } = await harness.restart(page); expect(after.pid, 'reinicio acreditado por el PID').not.toBe(before.pid); await reopenToday(page);
  const state = await harness.state(); expect(state.history.length, 'ningún efecto en la base').toBe(rows); expect(state.task3).toEqual(homonym); expect(harness.counts().attempts).toBe(0);
  // BARRERA: primer paso ausente.
  await firstStep(page, 'diario durable que conserve el intento tras el reinicio'); await missing(recoverSurface(page), 'superficie «Trabajo por recuperar» con el intento exacto (instalación, captura, generación, tarea, intento)');
  // DESPUÉS: el intento exacto (por ID, no por el primer texto que coincide) figura INCIERTO; abrir y comprobar solo LEEN.
  await expect(page.getByRole('button', { name: /Abrir la tarea .*\(ID task-2\)/ }).first()).toBeVisible();
  await page.getByRole('button', { name: /Comprobar/ }).first().click(); await expect(recoverSurface(page)).toContainText('sin cambio');
  expect(harness.counts().attempts, 'abrir y comprobar tras reiniciar: +0 PATCH').toBe(0);
});

test('CORTE 3 · el servidor aplica y se pierde la respuesta: UN efecto; tras reiniciar el intento sigue incierto; abrir y comprobar (lee «aplicado») añaden 0 PATCH', async ({ page }) => {
  await harness.start(page); await openToday(page, harness.origin); const homonym = (await harness.state()).task3!, barrier = gate(), received: number[] = [];
  await page.route('**/api/**', async (route: Route) => { if (!isTask2Patch(route)) return route.fallback(); const response = await route.fetch(); received.push(response.status()); await barrier.promise; await route.abort('connectionreset').catch(() => undefined); });
  try {
    await completeTask2(page); await saveButton(page).click(); await expect.poll(() => received.length, { message: 'el servidor respondió al PATCH' }).toBe(1);
    const applied = await harness.assertApplied({ taskId: 'task-2', expected: { status: 'completed' }, homonymId: 'task-3', homonymBefore: homonym });   // APLICACIÓN observada ANTES de cortar el acuse
    expect(received).toEqual([200]); expect(applied.rows, 'un efecto, una fila del ID exacto').toHaveLength(1);
    await page.keyboard.press('Escape');
  } finally { barrier.release(); }
  await expect(resultados(page)).toContainText('sin saber si se aplicó'); const patches = harness.counts().attempts;
  const { before, after } = await harness.restart(page); expect(after.pid).not.toBe(before.pid); await reopenToday(page);
  const again = await harness.assertApplied({ taskId: 'task-2', expected: { status: 'completed' }, homonymId: 'task-3', homonymBefore: homonym }); expect(again.rows, 'la misma fila tras reiniciar').toHaveLength(1); expect(harness.counts().attempts, 'reiniciar y recargar: +0 PATCH').toBe(patches);
  await firstStep(page, 'diario durable + lectura por intento exacto'); await missing(recoverSurface(page), 'superficie «Trabajo por recuperar»');
  await page.getByRole('button', { name: /Abrir la tarea .*\(ID task-2\)/ }).first().click(); await expect(ficha(page)).toContainText('task-2'); await page.keyboard.press('Escape');
  await page.getByRole('button', { name: /Comprobar/ }).first().click(); await expect(recoverSurface(page)).toContainText('aplicado');
  expect(harness.counts().attempts, 'abrir y comprobar: +0 PATCH').toBe(patches); expect((await harness.state()).history.filter(row => row.recordId === 'task-2'), 'el historial conserva ese único efecto').toHaveLength(1);
});

test('CORTE 4 · falla la liquidación después del efecto: el intento sigue incierto (no «confirmado»), con la atribución correcta; tras reiniciar comprobar lee «aplicado» con +0 PATCH', async ({ page }) => {
  await harness.start(page); await openToday(page, harness.origin); const homonym = (await harness.state()).task3!;
  // PARTE EJECUTABLE HOY: el acuse llega (200) y se observa el efecto; sin diario no hay liquidación que fallar.
  await completeTask2(page); await saveButton(page).click(); await expect.poll(() => harness.counts().applied).toBe(1);
  const applied = await harness.assertApplied({ taskId: 'task-2', expected: { status: 'completed' }, homonymId: 'task-3', homonymBefore: homonym }); expect(applied.rows).toHaveLength(1);
  // BARRERA: la ruta de liquidación (settle) y un gancho de servidor que la haga fallar (p. ej. HOY_FAIL_INTENT_SETTLE=1).
  await firstStep(page, 'liquidación del intento (settle) con acuse atribuible al servidor');
  // DESPUÉS: con `settle` rechazado el registro sigue `attempt` (P4): la superficie lo muestra INCIERTO, no confirmado; un settle declarado por el navegador no prueba que el servidor aplicara.
  const patches = harness.counts().attempts; await harness.restart(page); await reopenToday(page); await missing(recoverSurface(page), 'superficie «Trabajo por recuperar»');
  await expect(recoverSurface(page)).not.toContainText('Guardado confirmado'); await page.getByRole('button', { name: /Comprobar/ }).first().click(); await expect(recoverSurface(page)).toContainText('aplicado');
  expect(harness.counts().attempts, 'comprobar: +0 PATCH').toBe(patches);
});
