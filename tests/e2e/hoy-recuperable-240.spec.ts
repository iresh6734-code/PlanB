import { test, expect, type Locator, type Page, type Route } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { HoyHarness, claimRoot, gate, ficha, nav, openTask, openToday, resultados, taskButton } from './hoy-recuperable-harness';

// SONDAS DE APP DE HOY (encargo 240 · Claude A, R2). Tres clases de prueba, para no confundir lo que falta con un fallo del arnés:
//  · CONTROL  → PASA siempre que el arnés funcione, antes y después de los montajes: raíz propia, copia privada y manifiesto, clave de ensayo, reinicio con PID distinto y recibos de cierre,
//               aplicación de un PATCH real y su CONTRAPRUEBA (un PATCH rechazado antes de escribir cuenta como petición pero no como aplicación). Si un CONTROL falla, ninguna sonda vale.
//  · SONDA    → FALLA mientras falte la función y solo por ella: cada una declara con `missing(...)` qué espera, y todo lo anterior a esa barrera (incluida la APLICACIÓN observada del efecto)
//               debe pasar. Cuando la función se monta, la sonda pasa sin tocarla; lo que escribe después de su primera barrera se afina con el montaje.
//  · Una sonda NO se «arregla» para que pase: pasa cuando existe la función.
// La App se compila desde una copia privada y cotejada del corte; el servidor arranca DESDE esa copia con SQLite de archivo, entorno mínimo, clave de ensayo nueva por caso, 127.0.0.1 y red exterior bloqueada.
const harness = new HoyHarness();
test.setTimeout(120_000);
test.beforeAll(async () => { await harness.prepare(); });
test.beforeEach(() => { harness.reset(); });   // un caso NUEVO: directorio de datos nuevo; nada se borra
test.afterEach(async ({ page }) => { await page.unrouteAll({ behavior: 'ignoreErrors' }).catch(() => undefined); await harness.stop(); });
test.afterAll(() => { harness.assertAllClosed(); });   // recibo de cierre de CADA proceso y ninguno sigue vivo

/** Primera barrera de una sonda: la función debe VERSE. Si falta, el mensaje lo dice con el nombre de la función. */
const missing = (locator: Locator, what: string) => expect(locator, 'FUNCIÓN AUSENTE: ' + what).toBeVisible({ timeout: 4_000 });
const saveButton = (page: Page) => ficha(page).getByRole('button', { name: /Guardar cambios|Guardando/ });
const isTaskPatch = (route: Route) => route.request().method() === 'PATCH' && /\/api\/(records\/tasks|v7\/task-revision)\/task-2$/.test(new URL(route.request().url()).pathname);
/**
 * Pierde el ACUSE de un PATCH de task-2 SEPARANDO tres hechos: (1) RECEPCIÓN: el servidor responde (`received` guarda el estado HTTP real); (2) APLICACIÓN: se observa después en el servidor, no aquí;
 * (3) CORTE hacia el navegador: la respuesta se descarta con `connectionreset`. La barrera se libera siempre en `finally` (`release`).
 */
async function loseAck(page: Page) {
  const barrier = gate(), received: number[] = [];
  await page.route('**/api/**', async route => {
    if (!isTaskPatch(route)) return route.fallback();
    let response; try { response = await route.fetch(); } catch { await route.abort().catch(() => undefined); return; }
    received.push(response.status()); await barrier.promise; await route.abort('connectionreset').catch(() => undefined);
  });
  return { release: barrier.release, received: () => [...received] };
}
async function completeTask2(page: Page) { await openTask(page, 'task-2'); await ficha(page).getByRole('combobox', { name: 'Estado *', exact: true }).selectOption('completed'); }
/** Recorrido común de la sonda A4 y de su contraprueba: guarda, el servidor responde, se OBSERVA la aplicación y solo entonces se corta el acuse. Devuelve la evidencia de aplicación. */
async function lostAckUntilApplied(page: Page) {
  await harness.start(page); await openToday(page, harness.origin);
  const homonymBefore = (await harness.state()).task3!, held = await loseAck(page);
  try {
    await completeTask2(page); await saveButton(page).click();
    await expect.poll(() => held.received().length, { message: 'el servidor respondió al PATCH' }).toBe(1);
    const applied = await harness.assertApplied({ taskId: 'task-2', expected: { status: 'completed' }, homonymId: 'task-3', homonymBefore });   // APLICACIÓN observada ANTES de cortar nada
    return { applied, homonymBefore, received: held.received(), held };
  } catch (error) { held.release(); throw error; }
}

// ── CONTROLES ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
test('CONTROL · la App compilada carga, Hoy lista las tareas ficticias, lee la cola estructurada UNA vez al abrirse y no escribe nada (sucesor A3 del control de línea base «Hoy no la lee»)', async ({ page }) => {
  await harness.start(page); await openToday(page, harness.origin);
  await expect(taskButton(page, 'task-2')).toBeVisible(); await expect(taskButton(page, 'task-3')).toBeVisible();
  await expect.poll(() => harness.counts().workQueueReads, { message: 'Hoy lee la cola estructurada junto con su lista' }).toBe(1);
  expect(harness.counts().attempts, 'abrir Hoy no escribe').toBe(0);
});
test('CONTROL · el servidor tiene el endpoint de revisiones habilitado y entrega el token de UNA lectura', async ({ request }) => {
  await harness.start();
  const response = await request.get(harness.origin + '/api/v7/task-revision/task-2'); expect(response.status()).toBe(200);
  const body = await response.json() as { format: string; revision: string; record: { id: string } }; expect(body.format).toBe('planb-task-revision-v1'); expect(body.record.id).toBe('task-2'); expect(body.revision).toMatch(/^[a-f0-9]{64}$/);
  expect(harness.counts().attempts).toBe(0);
});
test('CONTROL · un guardado desde la ficha se aplica por UNA sola ruta (condicionada o anterior): 1 PATCH aplicado, 1 fila del ID exacto y la homónima intacta; indica qué ruta usa', async ({ page }, testInfo) => {
  await harness.start(page); await openToday(page, harness.origin); const homonymBefore = (await harness.state()).task3!;
  await openTask(page, 'task-2'); await ficha(page).getByRole('combobox', { name: 'Estado *', exact: true }).selectOption('completed'); await saveButton(page).click();
  await expect(taskButton(page, 'task-2')).toHaveCount(0, { timeout: 10_000 });
  const evidence = await harness.assertApplied({ taskId: 'task-2', expected: { status: 'completed' }, homonymId: 'task-3', homonymBefore }), counts = harness.counts();
  expect({ attempts: counts.attempts, applied: counts.applied, otherPatches: counts.otherPatches, rows: evidence.rows.length }).toEqual({ attempts: 1, applied: 1, otherPatches: 0, rows: 1 });
  expect(counts.conditionedPatches + counts.legacyPatches, 'una sola ruta').toBe(1);
  testInfo.annotations.push({ type: 'ruta de guardado', description: counts.conditionedPatches ? 'condicionada (A2 montada)' : 'anterior (línea base)' });
});
test('CONTROL · reiniciar el proceso reutiliza la base del MISMO caso: otro PID (aunque el puerto se repita), recibo de cierre del anterior, mismo estado y misma fila, cero escrituras nuevas', async ({ request }) => {
  const first = await harness.start(); const token = (await (await request.get(harness.origin + '/api/v7/task-revision/task-3')).json() as { revision: string }).revision;
  expect((await request.patch(harness.origin + '/api/v7/task-revision/task-3', { data: { expectedRevision: token, values: { notes: 'Antes del reinicio' } } })).status()).toBe(200);
  const before = await harness.state(), attempts = harness.counts().attempts;
  const { before: closed, after } = await harness.restart();
  expect(after.pid).not.toBe(first.pid); expect(closed.pid).toBe(first.pid); expect(harness.closes.some(receipt => receipt.pid === first.pid)).toBe(true);
  expect(await harness.state(), 'misma base, misma fila de historial').toEqual(before); expect(harness.counts().attempts, 'el arranque no escribe').toBe(attempts);
  const starts = fs.readFileSync(path.join(harness.caseDir, 'starts.jsonl'), 'utf8').split('\n').filter(Boolean).map(line => JSON.parse(line) as { pid: number; runId: string });
  expect(starts.map(entry => entry.pid)).toEqual([first.pid, after.pid]); expect(starts.every(entry => entry.runId === harness.runId)).toBe(true);
});
test('CONTROL · la raíz es propia: rechaza un destino preexistente ajeno, uno fuera del padre y uno que sale por «..»; el ajeno sintético no se toca', () => {
  const parent = path.join(process.cwd(), 'tests', '.tmp'), foreign = path.join(parent, 'hoy240-ajeno-' + randomUUID().slice(0, 8)); fs.mkdirSync(foreign);
  try {
    fs.writeFileSync(path.join(foreign, 'dato-ajeno.txt'), 'no tocar', { flag: 'wx' });
    expect(() => claimRoot(parent, foreign), 'preexistente').toThrow(/ya existe y no la creó/);
    expect(() => claimRoot(parent, path.join(os.tmpdir(), 'hoy240-fuera-' + randomUUID().slice(0, 8))), 'fuera del padre').toThrow(/fuera del padre/);
    expect(() => claimRoot(parent, path.join(parent, '..', 'hoy240-sale-' + randomUUID().slice(0, 8))), 'por ..').toThrow(/fuera del padre/);
    expect(() => claimRoot(path.join(os.tmpdir()), undefined), 'padre fuera de tests/').toThrow(/dentro de tests/);
    expect(fs.readFileSync(path.join(foreign, 'dato-ajeno.txt'), 'utf8')).toBe('no tocar'); expect(fs.readdirSync(foreign)).toEqual(['dato-ajeno.txt']);
  } finally { fs.unlinkSync(path.join(foreign, 'dato-ajeno.txt')); fs.rmdirSync(foreign); }   // solo lo que creó ESTA prueba, sin borrado recursivo
});
test('CONTROL · el corte que se ejecuta está acreditado: manifiesto de fuentes de cliente, de servidor y de activos coteja el checkout; el servidor corre desde la copia privada y con clave de ensayo nueva', async ({ request }) => {
  const manifest = JSON.parse(fs.readFileSync(path.join(harness.dir, 'manifest.json'), 'utf8')) as { runId: string; counts: Record<string, number>; hashes: Record<string, Record<string, string>> };
  expect(manifest.runId).toBe(harness.runId); expect(manifest.counts.client).toBeGreaterThan(100); expect(manifest.counts.server).toBeGreaterThan(30); expect(manifest.counts.assets).toBeGreaterThan(3);
  for (const file of ['src/App.tsx', 'src/LocalTaskFocus.tsx', 'public/favicon.svg', 'index.html']) expect(manifest.hashes.client[file], file).toBe(createHash('sha256').update(fs.readFileSync(path.join(process.cwd(), file))).digest('hex'));
  for (const file of ['server/app.ts', 'server/task-revision.ts', 'shared/fixtures.ts', 'scripts/block-external.cjs']) expect(manifest.hashes.server[file], file).toBe(createHash('sha256').update(fs.readFileSync(path.join(process.cwd(), file))).digest('hex'));
  expect(Object.keys(manifest.hashes.assets).every(file => file.startsWith('dist/'))).toBe(true);
  await harness.start(); expect((await request.get(harness.origin + '/api/health')).status()).toBe(200);
  const key = JSON.parse(fs.readFileSync(path.join(harness.caseDir, '.planb-key'), 'utf8')) as { kind: string; data: string }; expect(key.kind).toBe('test'); expect(Buffer.from(key.data, 'base64').length).toBe(32);
  const line = harness.requests().find(entry => entry.path === '/api/health')!; expect(line.runId).toBe(harness.runId); expect(line.pid).toBe(harness.starts.at(-1)!.pid);
  expect(fs.existsSync(path.join(harness.dir, 'priv', 'server', 'app.ts')), 'el servidor es la copia privada').toBe(true);
});
test('CONTROL · CONTRAPRUEBA del 500: un PATCH rechazado ANTES de escribir cuenta como petición pero NO satisface la aplicación; el caso real con éxito sí', async ({ request }) => {
  harness.failFirstPatchOnNextStart(); await harness.start(); harness.failFirstPatchOnNextStart(false);
  const homonymBefore = (await harness.state()).task3!, token = (await (await request.get(harness.origin + '/api/v7/task-revision/task-2')).json() as { revision: string }).revision;
  const rejected = await request.patch(harness.origin + '/api/v7/task-revision/task-2', { data: { expectedRevision: token, values: { status: 'completed' } } }); expect(rejected.status()).toBe(500);
  expect({ attempts: harness.counts().attempts, applied: harness.counts().applied }, 'el servidor contó la petición').toEqual({ attempts: 1, applied: 0 }); expect((await harness.state()).changes).toBe(0);
  await expect(harness.assertApplied({ taskId: 'task-2', expected: { status: 'completed' }, homonymId: 'task-3', homonymBefore })).rejects.toThrow(/Aplicación NO acreditada/);
  const ok = await request.patch(harness.origin + '/api/v7/task-revision/task-2', { data: { expectedRevision: token, values: { status: 'completed' } } }); expect(ok.status()).toBe(200);   // el rechazo previo no escribió: el mismo token sirve
  const evidence = await harness.assertApplied({ taskId: 'task-2', expected: { status: 'completed' }, homonymId: 'task-3', homonymBefore }); expect(evidence.received).toEqual([200]); expect(evidence.rows).toHaveLength(1);
  expect({ attempts: harness.counts().attempts, applied: harness.counts().applied }).toEqual({ attempts: 2, applied: 1 });
});
test('CONTROL · la contraprueba del 500 también corta el RECORRIDO de la sonda A4: falla en la aplicación, antes del reinicio y de la barrera de producto', async ({ page }) => {
  harness.failFirstPatchOnNextStart();
  try { await expect(lostAckUntilApplied(page)).rejects.toThrow(/Aplicación NO acreditada/); } finally { harness.failFirstPatchOnNextStart(false); }
  expect(harness.counts()).toMatchObject({ attempts: 1, applied: 0 }); expect(harness.counts().applied).toBe(0); expect((await harness.state()).changes).toBe(0); expect(harness.starts.filter(start => start.case === harness.starts.at(-1)!.case)).toHaveLength(1);   // no hubo reinicio
});

// ── SONDAS A2 · guardado condicionado, comparador, «Por decidir» ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────
test('CONTROL A2 · guardar desde la ficha sale por el endpoint CONDICIONADO: 1 PATCH condicionado, 0 legados, 1 fila de historial', async ({ page }) => {
  await harness.start(page); await openToday(page, harness.origin); await openTask(page, 'task-2'); await ficha(page).getByRole('combobox', { name: 'Estado *', exact: true }).selectOption('completed'); await saveButton(page).click();
  await expect(taskButton(page, 'task-2')).toHaveCount(0, { timeout: 10_000 });
  await expect.poll(() => harness.counts().conditionedPatches, { message: 'FUNCIÓN AUSENTE: guardado condicionado a la revisión desde la ficha (estrategia 233 montada en host y ficha)', timeout: 4_000 }).toBe(1);
  const counts = harness.counts(), state = await harness.state(); expect({ legacy: counts.legacyPatches, history: state.changes }).toEqual({ legacy: 0, history: 1 });
});
test('CONTROL A2 · dos pestañas sobre la misma revisión: gana una, la otra recibe un 409 SIN escritura y se abre el comparador desde la ficha', async ({ page, context }) => {
  await harness.start(page); await openToday(page, harness.origin);
  const other = await context.newPage(); await harness.guard(other); await openToday(other, harness.origin);
  await completeTask2(page); await openTask(other, 'task-2');                                    // las dos pestañas abren la MISMA revisión
  await saveButton(page).click(); await expect.poll(() => harness.counts().applied, { timeout: 10_000 }).toBe(1);   // la pestaña A gana: UN efecto aplicado
  await other.getByRole('textbox', { name: /Notas/ }).fill('Mi nota desde la otra pestaña'); await saveButton(other).click();                          // la B edita OTRO campo sobre la revisión que abrió
  await missing(other.getByRole('heading', { name: /Revisa qué mantener de/ }), 'comparador de conflicto (TaskConflictReview) abierto desde un 409 real de la ficha');
  const counts = harness.counts(); expect({ conflicts: counts.conflicts409, legacy: counts.legacyPatches, attempts: counts.attempts, applied: counts.applied }).toEqual({ conflicts: 1, legacy: 0, attempts: 2, applied: 1 });
  // Después (A2): elegir por campo, previsualizar y volver con cero escrituras; un segundo clic explícito = TRES intentos y DOS efectos (264), con 2 filas de historial.
});
test('CONTROL A2 · tras perder un acuse, Resultados ofrece el filtro «Por decidir» con el intento exacto', async ({ page }) => {
  await harness.start(page); await openToday(page, harness.origin); const held = await loseAck(page);
  try {
    await completeTask2(page); await saveButton(page).click(); await expect.poll(() => held.received().length).toBe(1);
    await page.keyboard.press('Escape'); await expect(ficha(page)).toHaveCount(0);
  } finally { held.release(); }
  await expect(resultados(page)).toContainText('sin saber si se aplicó');                                  // esto sí existe hoy (219/171)
  await missing(resultados(page).getByRole('button', { name: 'Por decidir' }).or(resultados(page).getByRole('tab', { name: 'Por decidir' })).or(resultados(page).getByRole('radio', { name: 'Por decidir' })), 'filtro «Por decidir» en Resultados');
});

// ── SONDAS A3 · cola estructurada y Jornada en Hoy ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// A3 está montada (CLAUDE-HOY-COLA-JORNADA-A3): estas dos sondas pasaron a ser CONTROLES de regresión sin cambiar su cuerpo; su corte rojo anterior queda en los informes de 240.
test('CONTROL A3 · Hoy lee la cola estructurada (GET /api/v7/local-operations/work) además de ofrecer Agentes y revisiones', async ({ page }) => {
  await harness.start(page); await openToday(page, harness.origin);
  await expect.poll(() => harness.counts().workQueueReads, { message: 'FUNCIÓN AUSENTE: Hoy consume la cola estructurada de 230', timeout: 4_000 }).toBeGreaterThanOrEqual(1);
});
test('CONTROL A3 · Hoy ofrece «Organizar mi jornada» y la Jornada de continuidad con la misma navegación a la ficha', async ({ page }) => {
  await harness.start(page); await openToday(page, harness.origin);
  const open = page.getByRole('button', { name: 'Organizar mi jornada' }); await missing(open, 'entrada «Organizar mi jornada» en Hoy');
  await open.click(); await missing(page.getByRole('heading', { name: 'Jornada de continuidad' }), 'Jornada de continuidad (ContinuityDay) montada en Hoy');
});

// ── SONDAS A4 · recuperar el trabajo tras reiniciar ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
test('SONDA A4 · perder un acuse con la aplicación ACREDITADA, REINICIAR el proceso y volver: mismo efecto y misma fila, cero PATCH nuevos, y «Trabajo por recuperar» con el intento exacto', async ({ page }) => {
  const { applied, homonymBefore, received, held } = await lostAckUntilApplied(page);
  try {
    expect(received, 'RECEPCIÓN: el servidor respondió con éxito al PATCH de la tarea exacta').toEqual([200]);
    expect(applied.rows, 'APLICACIÓN: una fila de historial de ESE ID').toHaveLength(1); expect(applied.task).toMatchObject({ status: 'completed' });
    await page.keyboard.press('Escape');                                                                 // el acuse sigue sin llegar: se corta DESPUÉS de observar la aplicación
  } finally { held.release(); }
  await expect(resultados(page)).toContainText('sin saber si se aplicó');
  const attemptsBefore = harness.counts().attempts;
  const { before, after } = await harness.restart(page); expect(after.pid, 'el reinicio se acredita por el PID, no por el puerto').not.toBe(before.pid);
  await page.goto(harness.origin); await nav(page, 'Hoy').click(); await expect(page.getByRole('heading', { name: 'Hoy', exact: true })).toBeVisible();
  const again = await harness.assertApplied({ taskId: 'task-2', expected: { status: 'completed' }, homonymId: 'task-3', homonymBefore });
  expect(again.row, 'la MISMA fila de historial tras el reinicio').toEqual(applied.row); expect(again.rows).toEqual(applied.rows); expect(again.historyTotal).toBe(applied.historyTotal);
  expect(harness.counts().attempts, 'ni el reinicio ni la recarga producen PATCH').toBe(attemptsBefore); expect(again.homonym, 'la homónima sigue intacta').toEqual(homonymBefore);
  const recover = page.getByRole('region', { name: /Trabajo por recuperar/ }).or(page.getByRole('heading', { name: /Trabajo por recuperar/ }));
  await missing(recover, 'superficie «Trabajo por recuperar» junto a Resultados, alimentada por el cuaderno de intenciones persistido (208)');
  // Con el montaje (A4): el intento se identifica por su ID exacto (no por el primer texto que coincide), «Abrir la tarea» lleva a task-2 y comprobar por lectura no añade ningún PATCH.
  await expect(page.getByRole('button', { name: /Abrir la tarea Llamar a Ana \(ID task-2\)/ }).first()).toBeVisible();
});
test('SONDA A4 (ruta PROPUESTA, no acordada) · el resumen público de trabajo existe: GET /api/v7/local-operations/work-summary → planb-work-summary-v1', async ({ request }) => {
  await harness.start();
  const response = await request.get(harness.origin + '/api/v7/local-operations/work-summary');
  expect(response.status(), 'FUNCIÓN AUSENTE: resumen público del diario 208 para Continuidad (contrato propuesto por Claude B, pendiente de acuerdo)').toBe(200);
  expect(((await response.json()) as { format: string }).format).toBe('planb-work-summary-v1');
});
