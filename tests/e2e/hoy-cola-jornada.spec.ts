import { test, expect, type Page, type Route } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { HoyHarness, gate, nav } from './hoy-recuperable-harness';
import { openSection } from './menu';

// «ORGANIZAR MI JORNADA» EN HOY (unidad CLAUDE-HOY-COLA-JORNADA-A3), en la App compilada contra un servidor real con revisiones y SQLite de archivo, 127.0.0.1 y red exterior bloqueada.
// Reutiliza el arnés CLAUDE-HOY-APP-PROBES-A sin modificarlo: lo extiende por herencia para sembrar ESCENARIOS de copia (vacía, importada, activa, con relación ausente, con relación
// no comprobable, con más tareas que el límite de la cola) escribiendo `scenario.txt` en el directorio del caso, y para volver a capturar la misma copia con otra identidad.
// Todos los datos son ficticios y nuevos. Los recuentos de peticiones salen del servidor, no de la interfaz.
const SEED = `import { existsSync as scenarioExists, readFileSync as scenarioRead } from 'node:fs';
function scenarioSnapshot(name: string, capturedAt: string, id: string | null): any {
  const snapshot: any = makeFixture('agency'); snapshot.capturedAt = capturedAt; if (id) snapshot.id = id;
  const base = snapshot.records.find((r: any) => r.entity === 'tasks');
  const make = (taskId: string, subject: string, due: string, status = 'pending', contact: string | null = null, deal: string | null = null) => { const task = structuredClone(base); task.id = taskId; task.values = { subject, due_date: due, status, contact_id: contact, deal_id: deal, notes: 'Nota de ' + taskId }; return task; };
  let tasks: any[] = [];
  if (name === 'many') { for (let i = 0; i < 205; i++) tasks.push(make('masiva-' + String(i).padStart(3, '0'), 'Tarea masiva ' + String(i).padStart(3, '0'), '2020-01-' + String(i % 28 + 1).padStart(2, '0'))); }
  else tasks = [
    make('tarea-alfa', 'Alfa · Llamar a Ana', '2020-01-01'), make('tarea-beta', 'Beta · Enviar presupuesto', '2020-01-02', 'pending', null, 'deal-1'), make('tarea-gamma', 'Gamma · Revisar contrato', '2020-01-03'),
    make('tarea-delta', 'Delta · Preparar visita', '2020-01-04', 'pending', 'contact-1'), make('__proto__', 'Proto · ID especial uno', '2020-01-05'), make('constructor', 'Constructor · ID especial dos', '2020-01-06'),
    make('toString', 'ToString · ID especial tres', '2020-01-07'), make('tarea-lejana', 'Lejana · Más adelante', '2099-01-01'), make('tarea-hecha', 'Hecha · Ya completada', '2020-01-08', 'completed'),
  ];
  snapshot.records = [...snapshot.records.filter((r: any) => r.entity !== 'tasks'), ...tasks];
  snapshot.links = snapshot.links.filter((l: any) => l.fromEntity !== 'tasks');
  for (const t of tasks) { if (t.values.contact_id) snapshot.links.push({ fromEntity: 'tasks', fromId: t.id, toEntity: 'contacts', toId: t.values.contact_id, label: 'contact_id' }); if (t.values.deal_id) snapshot.links.push({ fromEntity: 'tasks', fromId: t.id, toEntity: 'deals', toId: t.values.deal_id, label: 'deal_id' }); }
  snapshot.manifest.expectedLinks = snapshot.links.length; snapshot.manifest.expectedCounts.tasks = tasks.length;
  return snapshot;
}
const scenarioName = () => scenarioRead(dir + '/scenario.txt', 'utf8').trim();
async function seedScenario(): Promise<boolean> {
  if (!scenarioExists(dir + '/scenario.txt')) return false;
  const name = scenarioName(); if (name === 'empty') return true;
  const snapshot = scenarioSnapshot(name, '2026-11-08T09:00:00.000Z', null); store.importSnapshot(snapshot); if (name === 'imported') return true;
  gen(snapshot); store.activate();
  if (name === 'day' || name === 'unverifiable') store.db.prepare('DELETE FROM records WHERE entity=? AND id=?').run('contacts', 'contact-1');
  if (name === 'unverifiable') { const next = structuredClone(store.snapshot); next.entities = next.entities.filter((e: any) => e.id !== 'deals'); store.set('snapshot', next); store.db.prepare('DELETE FROM records WHERE entity=?').run('deals'); }
  return true;
}
app.post('/__h/regenerate', async () => { const snapshot: any = store.snapshot; store.saveGeneration(makeDemoSpec(snapshot), { provider: 'demo', model: null, generatedAt: new Date().toISOString(), prompt: '', approved: false }); store.activate(); return { ok: true }; });
app.post('/__h/recapture', async () => { const next = scenarioSnapshot(scenarioName() === 'unverifiable' ? 'day' : scenarioName(), '2026-11-09T09:00:00.000Z', 'captura-otra'); store.importSnapshot(next, true); gen(next); store.activate(); return { ok: true }; });
`;
class Harness extends HoyHarness {
  override async prepare() {
    await super.prepare();
    const file = path.join(this.root, 'server.mts'), source = fs.readFileSync(file, 'utf8');
    if (!source.includes('if (!store.snapshot) {') || !source.includes('await app.listen(')) throw new Error('El servidor del arnés cambió: no se encuentran los puntos de extensión.');
    fs.writeFileSync(file, source.replace('if (!store.snapshot) {', SEED + 'if (!store.snapshot && !(await seedScenario())) {'));
  }
  /** Fija el escenario del caso ACTUAL (antes de arrancar). */
  scenario(name: 'day' | 'empty' | 'imported' | 'unverifiable' | 'many') { fs.writeFileSync(path.join(this.caseDir, 'scenario.txt'), name, { flag: 'wx' }); }
  async regenerate() { expect((await fetch(this.origin + '/__h/regenerate', { method: 'POST' })).ok).toBe(true); }
  async recapture() { expect((await fetch(this.origin + '/__h/recapture', { method: 'POST' })).ok).toBe(true); }
  /** La cola estructurada tal como la ve el servidor (para calcular el resultado esperado a partir de la fixture ACTUAL, no de cifras heredadas). */
  async queue() { return await (await fetch(this.origin + '/api/v7/local-operations/work')).json() as { phase: string; tasks: { id: string; label: string; status: string }[]; counts: Record<string, number> | null; page: Record<string, number>; identity: Record<string, unknown> | null }; }
}
const harness = new Harness();
test.setTimeout(150_000);
test.beforeAll(async () => { await harness.prepare(); });
test.beforeEach(() => { harness.reset(); });
test.afterEach(async ({ page }) => { await page.unrouteAll({ behavior: 'ignoreErrors' }).catch(() => undefined); await harness.stop(); });
test.afterAll(() => { harness.assertAllClosed(); });

const dlg = (page: Page) => page.getByRole('dialog');
const entry = (page: Page) => page.getByRole('button', { name: /^(Organizar mi jornada|Ocultar la jornada)$/ });
const region = (page: Page) => page.getByRole('region', { name: 'Organizar mi jornada' });
const summary = (page: Page) => region(page).locator('.cd-summary');
const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const field = (page: Page, id: string) => region(page).getByLabel(new RegExp('^Minutos estimados.*\\(' + escape(id) + '(-d)?\\)$')).first();
const chosenRow = (page: Page, id: string) => region(page).locator('section[aria-labelledby="cd-chosen-h"] li.cd-item').filter({ has: page.locator('code', { hasText: new RegExp('^' + escape(id) + '$') }) });
const preset = (page: Page, minutes: number) => region(page).getByRole('radio', { name: minutes + ' min' });

async function begin(page: Page, scenario: Parameters<Harness['scenario']>[0], size = { width: 1440, height: 900 }, beforeGoto?: () => Promise<void>) {
  harness.scenario(scenario); await harness.start(page); await page.setViewportSize(size); if (beforeGoto) await beforeGoto(); await page.goto(harness.origin); await expect(page).toHaveTitle('Plan B · Tu CRM sigue contigo');
  await nav(page, 'Hoy').click(); await expect(page.getByRole('heading', { name: 'Hoy', exact: true })).toBeVisible(); await expect(page.locator('.lop-context')).toBeVisible();
}
async function openDay(page: Page) { await entry(page).click(); await expect(region(page)).toBeVisible(); await expect(summary(page)).toBeVisible(); }
/** Resultado voraz de la Jornada calculado aquí, aparte del código de producto: recorre la cola en su orden, incluye lo que cabe, deja fuera lo desconocido. */
function greedy(order: string[], estimates: Map<string, number>, budget: number) { let used = 0; const chosen: string[] = []; for (const id of order) { const m = estimates.get(id); if (m === undefined || used + m > budget) continue; chosen.push(id); used += m; } return { chosen, used, free: budget - used }; }   // Map: un ID como «constructor» no hereda nada
const writes = (page: Page) => { const list: string[] = []; page.on('request', request => { if (request.method() !== 'GET') list.push(request.method() + ' ' + new URL(request.url()).pathname); }); return list; };
const ids = (queue: Awaited<ReturnType<Harness['queue']>>) => queue.tasks.filter(task => task.status === 'open').map(task => task.id);

test('ENTRADA: «Organizar mi jornada» está en Hoy, la cola estructurada se lee una vez al abrir Hoy (no al abrir la jornada), el foco pasa a la región y no se escribe nada', async ({ page }) => {
  const sent = writes(page); await begin(page, 'day');
  await expect(entry(page)).toHaveAttribute('aria-expanded', 'false'); await expect(region(page)).toHaveCount(0);
  await expect.poll(() => harness.counts().workQueueReads, 'Hoy lee la cola estructurada junto con su lista').toBe(1);
  await entry(page).focus(); await page.keyboard.press('Enter'); await expect(region(page)).toBeFocused(); await expect(entry(page)).toHaveAttribute('aria-expanded', 'true'); await expect(entry(page)).toHaveText('Ocultar la jornada');
  expect(harness.counts().workQueueReads, 'abrir la jornada reutiliza esa lectura: no pide otra').toBe(1);
  const queue = await harness.queue(); const open = queue.tasks.filter(task => task.status === 'open');
  await expect(region(page).locator('.lop-day-note')).toContainText('Cola leída'); await expect(region(page).locator('.lop-day-note')).toContainText(queue.counts!.queued + ' tareas abiertas o por revisar en la copia, ' + queue.counts!.returned + ' en esta lista');
  await expect(region(page).locator('.lop-day-coverage[data-partial]'), 'la cola completa no avisa de recorte').toHaveCount(0);
  await expect(region(page).getByRole('button', { name: /^Abrir la tarea .* \(ID .*\)$/ })).toHaveCount(open.length);   // todas en «Por decidir» (sin duración, no cuentan como cero)
  await expect(summary(page)).toContainText('En 30 min: 0 tareas (0 min estimados, 30 min libres)');
  await entry(page).focus(); await page.keyboard.press('Enter'); await expect(region(page)).toHaveCount(0); await expect(entry(page)).toBeFocused();
  expect(sent, 'ninguna escritura').toEqual([]); expect(harness.counts().attempts).toBe(0);
});

test('30 Y 60 MINUTOS con la fixture ACTUAL: el resultado coincide con el cálculo voraz sobre el orden real de la cola; subir el tiempo añade lo que cabe; nada se inventa', async ({ page }) => {
  const sent = writes(page); await begin(page, 'day'); const order = ids(await harness.queue()); await openDay(page);
  const minutes = new Map<string, number>(); [20, 25, 30, 15].forEach((m, index) => minutes.set(order[index], m));
  for (const [id, m] of minutes) await field(page, id).fill(String(m));
  const at30 = greedy(order, minutes, 30), at60 = greedy(order, minutes, 60);
  expect(at30.chosen, 'con 30 min solo cabe la primera (20): la segunda sumaría 45').toEqual([order[0]]); expect(at60.chosen, 'con 60 min caben 20 + 25 + 15').toEqual([order[0], order[1], order[3]]);
  await expect(summary(page)).toContainText('En 30 min: 1 tarea (20 min estimados, 10 min libres)');
  for (const id of at30.chosen) await expect(chosenRow(page, id)).toHaveCount(1); await expect(region(page).locator('section[aria-labelledby="cd-chosen-h"] li.cd-item')).toHaveCount(at30.chosen.length);
  await preset(page, 60).check(); await expect(summary(page)).toContainText('En 60 min: 3 tareas (60 min estimados)');
  await expect(region(page).locator('section[aria-labelledby="cd-chosen-h"] li.cd-item')).toHaveCount(at60.chosen.length); for (const id of at60.chosen) await expect(chosenRow(page, id)).toHaveCount(1);
  await expect(chosenRow(page, order[2]), 'la de 30 min no cabe: 20+25+30 > 60 y queda fuera, no se recorta').toHaveCount(0);
  await preset(page, 30).check(); await expect(summary(page)).toContainText('En 30 min: 1 tarea (20 min estimados, 10 min libres)');
  expect(sent).toEqual([]); expect(harness.counts().attempts).toBe(0);
});

test('DURACIÓN DESCONOCIDA: elegir a mano una tarea sin estimación deja el subtotal conocido y el saldo INDETERMINADO; las propuestas siguientes son provisionales y sin hora; declararla lo resuelve', async ({ page }) => {
  await begin(page, 'day'); const order = ids(await harness.queue()); await openDay(page);
  await field(page, order[0]).fill('20'); await field(page, order[2]).fill('5');
  await expect(summary(page)).toContainText('En 30 min: 2 tareas (25 min estimados, 5 min libres)'); await expect(summary(page)).toHaveAttribute('data-indeterminate', 'false');
  // Se incluye a mano la segunda (sin duración): ya no se afirma cuánto queda libre, y las propuestas automáticas pasan a provisionales.
  await region(page).getByRole('button', { name: new RegExp('^Incluir igualmente .* \\(ID ' + escape(order[1]) + '\\)$') }).click();
  await expect(summary(page)).toHaveAttribute('data-indeterminate', 'true'); await expect(summary(page)).toContainText('25 min estimados + 1 tarea sin duración: el tiempo libre es indeterminado');
  const row = chosenRow(page, order[1]); await expect(row).toContainText('Duración desconocida'); await expect(row, 'sin duración no hay minuto de inicio inventado').not.toContainText(/min libres|inicia/i);
  for (const id of [order[0], order[2]]) await expect(chosenRow(page, id)).toContainText('Provisional');
  await field(page, order[1]).fill('10'); await expect(summary(page)).toHaveAttribute('data-indeterminate', 'false'); await expect(summary(page)).not.toContainText('indeterminado');
  await expect(chosenRow(page, order[0])).not.toContainText('Provisional');
});

test('SELECCIÓN QUE EXCEDE EL TIEMPO: lo elegido y lo fijado se conserva, se avisa cuánto se pasa y no se quita nada; fijar sobrevive al cambio de tiempo', async ({ page }) => {
  await begin(page, 'day'); const order = ids(await harness.queue()); await openDay(page);
  await field(page, order[0]).fill('30'); await field(page, order[1]).fill('25');
  await expect(chosenRow(page, order[1]), 'no cabe tras la primera (30 + 25 > 30)').toHaveCount(0); await region(page).getByText(/^Fuera de la jornada/).click();
  const pick = (id: string) => region(page).getByRole('button', { name: new RegExp('^Elegir .* \\(ID ' + escape(id) + '\\)$') }).click();
  await pick(order[1]);   // elección manual: va primero (25 min) y la propuesta de 30 ya no cabe
  await expect(summary(page)).toContainText('En 30 min: 1 tarea (25 min estimados, 5 min libres)'); await expect(chosenRow(page, order[0])).toHaveCount(0);
  await pick(order[0]);   // 25 + 30 = 55 sobre 30: se incluye y se avisa, no se quita
  await expect(summary(page)).toContainText('En 30 min: 2 tareas (55 min estimados, 25 min por encima)'); await expect(summary(page)).toHaveAttribute('data-over', 'true');
  await expect(chosenRow(page, order[0]), 'la que cruza el límite avisa y no se quita').toContainText('No se ha quitado');
  await chosenRow(page, order[0]).getByRole('button', { name: /^Fijar / }).click(); await expect(chosenRow(page, order[0]).getByRole('button', { name: /^Quitar la fijación / })).toHaveAttribute('aria-pressed', 'true'); await expect(chosenRow(page, order[0])).toContainText('Fijada');
  await preset(page, 120).check(); await expect(summary(page)).toContainText('En 120 min'); await expect(chosenRow(page, order[0])).toContainText('Fijada');
  await preset(page, 30).check(); await expect(chosenRow(page, order[0])).toContainText('Fijada'); await expect(region(page).locator('.cd-warnings li[data-kind="overrun"]').first(), 'el desborde sigue avisado').toContainText('No se ha quitado');
});

test('IDs __proto__, constructor y toString: son tareas distintas, sus estimaciones no se mezclan ni se heredan, y se abren por ID EXACTO', async ({ page }) => {
  await begin(page, 'day'); const order = ids(await harness.queue()); for (const special of ['__proto__', 'constructor', 'toString']) expect(order).toContain(special);
  await openDay(page); const sent = writes(page);
  await field(page, '__proto__').fill('10'); await expect(chosenRow(page, '__proto__')).toHaveCount(1);
  for (const other of ['constructor', 'toString']) await expect(chosenRow(page, other), other + ' no hereda la estimación de __proto__').toHaveCount(0);
  await expect(summary(page)).toContainText('En 30 min: 1 tarea (10 min estimados, 20 min libres)');
  await field(page, 'constructor').fill('15'); await field(page, 'toString').fill('25');
  await expect(chosenRow(page, 'constructor')).toContainText('Estimación: 15 min'); await expect(chosenRow(page, 'toString'), '10 + 15 + 25 > 30: no cabe').toHaveCount(0); await expect(chosenRow(page, '__proto__')).toContainText('Estimación: 10 min');
  // Apertura por ID exacto desde la jornada.
  await chosenRow(page, 'constructor').getByRole('button', { name: /^Abrir la tarea / }).click();
  await expect(dlg(page)).toContainText('constructor'); await expect(dlg(page)).toContainText('Constructor · ID especial dos');
  await page.keyboard.press('Escape'); await expect(dlg(page)).toHaveCount(0); await expect(chosenRow(page, 'constructor').getByRole('button', { name: /^Abrir la tarea / })).toBeFocused();
  expect(sent, 'abrir y cerrar la ficha no escribe').toEqual([]); expect(harness.counts().attempts).toBe(0);
});

test('RELACIONES: una asociación ausente queda como «falta», no como tarea terminada; el resto no se contamina; la relación que la copia no captura es «no se puede comprobar»', async ({ page }) => {
  await begin(page, 'unverifiable'); const queue = await harness.queue(); await openDay(page);
  const delta = queue.tasks.find(task => task.id === 'tarea-delta')!, beta = queue.tasks.find(task => task.id === 'tarea-beta')!; expect(delta && beta).toBeTruthy();
  const decide = region(page).locator('section[aria-labelledby="cd-decide-h"]');
  await expect(decide).toContainText('Falta un registro relacionado: contacts · contact-1'); await expect(decide.locator('li.cd-item[data-id="tarea-delta"]')).toContainText('Comprobar las asociaciones antes de trabajarla');
  await expect(decide.locator('li.cd-item[data-id="tarea-alfa"]'), 'otra tarea no hereda la relación ausente').not.toContainText('Falta un registro relacionado');
  const work = await page.evaluate(async () => (await fetch('/api/v7/local-operations/work')).json()) as { tasks: { id: string; referenceCoverage: { missing: number; notCaptured: number }; reasonCodes: string[] }[] };
  const rowBeta = work.tasks.find(task => task.id === 'tarea-beta')!, rowDelta = work.tasks.find(task => task.id === 'tarea-delta')!;
  expect(rowDelta.referenceCoverage.missing, 'el servidor cuenta una ausente').toBe(1); expect(rowBeta.referenceCoverage, 'la entidad no capturada es «no comprobable», no «falta»').toMatchObject({ missing: 0, notCaptured: 1 });
  await expect(decide.locator('li.cd-item[data-id="tarea-beta"]'), 'Beta no se presenta como con una relación ausente').not.toContainText('Falta un registro relacionado');
  await expect(decide.locator('li.cd-item[data-id="tarea-beta"]')).toContainText('Sin duración declarada');
  const unverified = region(page).locator('.lop-day-unverified'); await expect(unverified.locator('summary')).toContainText('Asociaciones que no se pueden comprobar (1)'); await unverified.locator('summary').click();
  await expect(unverified).toContainText('Beta · Enviar presupuesto'); await expect(unverified).toContainText('1 asociación sin comprobar'); await expect(unverified).toContainText('No se tratan como ausentes ni como correctas'); await expect(unverified).not.toContainText('Delta');
});

test('COBERTURA PARCIAL: con 205 tareas la cola devuelve 200 y la jornada lo dice («no significa que las demás estén cerradas»); nunca presenta la lista como el total', async ({ page }) => {
  await begin(page, 'many'); const queue = await harness.queue(); expect(queue.counts).toMatchObject({ queued: 205, returned: 200, notReturned: 5 }); expect(queue.page).toMatchObject({ omittedByLimit: 5, omittedByBytes: 0, omittedOversize: 0 });
  await openDay(page);
  await expect(region(page).locator('.lop-day-note')).toContainText('205 tareas abiertas o por revisar en la copia, 200 en esta lista');
  const notice = region(page).locator('.lop-day-coverage[data-partial]'); await expect(notice).toContainText('Esta lista no incluye 5 tareas de tu cola'); await expect(notice).toContainText('5 tareas fuera del límite de 200 por página'); await expect(notice).toContainText('no significa que las demás estén cerradas ni que no existan');
  await region(page).getByText(/^Fuera de la jornada/).click(); await expect(region(page)).toContainText('5 tareas más no se consideran');
  await expect(region(page).locator('section[aria-labelledby="cd-decide-h"] li.cd-item')).toHaveCount(200);
});

test('FASES: copia vacía, importada sin activar y activa se distinguen; la vacía no ofrece una jornada vacía como si hubiera trabajo', async ({ page }) => {
  await begin(page, 'empty'); await expect(page.locator('.lop-context')).toContainText('Sin captura'); await expect(page.locator('.lop-prepare')).toContainText('Importa una captura');
  await expect(entry(page), 'sin captura no se ofrece una jornada vacía como si hubiera trabajo').toHaveCount(0); await expect(page.locator('.cd')).toHaveCount(0); await expect.poll(() => harness.counts().workQueueReads).toBe(1);   // la lectura ocurre y dice «vacía»
  const empty = await harness.queue(); expect(empty).toMatchObject({ phase: 'empty', identity: null, counts: null, tasks: [] });
});
test('FASES: captura importada sin activar — se puede organizar con lo importado y se explica que editar exige completar la preparación', async ({ page }) => {
  await begin(page, 'imported'); await expect(page.locator('.lop-context')).toContainText('Captura importada · pendiente de activar'); await openDay(page);
  await expect(region(page).locator('.lop-day-note')).toContainText('Captura importada, sin activar'); await expect(region(page).locator('.cd')).toBeVisible();
  expect((await harness.queue()).phase).toBe('imported'); expect(harness.counts().attempts).toBe(0);
});

test('ERROR: si falla la lectura de la cola la lista de Hoy sigue viva, el aviso ofrece reintentar y un reintento correcto lo retira; una respuesta incompatible no se acepta; un fallo posterior conserva la última lectura con aviso', async ({ page }) => {
  let mode: 'fail' | 'bad' | 'ok' = 'fail';
  await begin(page, 'day', undefined, async () => { await page.route('**/api/v7/local-operations/work', async (route: Route) => {
    if (mode === 'fail') return route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'La cola no está disponible ahora' }) });
    if (mode === 'bad') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ format: 'otro', tasks: 'no' }) });
    return route.fallback();
  }); });
  await expect(page.locator('.lop-tasks li').first(), 'la lista de Hoy no depende de la cola de la jornada').toBeVisible();
  await entry(page).click(); const alert = region(page).getByRole('alert'); await expect(alert).toContainText('La cola no está disponible ahora'); await expect(region(page).locator('.cd')).toHaveCount(0);
  mode = 'bad'; await region(page).getByRole('button', { name: 'Reintentar la lectura de la cola' }).click(); await expect(alert).toContainText('no es compatible'); await expect(region(page).locator('.cd')).toHaveCount(0);
  mode = 'ok'; await region(page).getByRole('button', { name: 'Reintentar la lectura de la cola' }).click(); await expect(region(page).locator('.cd')).toBeVisible(); await expect(region(page).getByRole('alert')).toHaveCount(0);
  // Un fallo posterior no borra lo ya leído: se sigue viendo la última lectura y el aviso lo dice.
  const order = ids(await harness.queue()); await field(page, order[0]).fill('20'); mode = 'fail'; await page.getByRole('button', { name: 'Actualizar' }).click();
  await expect(region(page).getByRole('alert')).toContainText('se muestra la última lectura'); await expect(region(page).locator('.cd')).toBeVisible(); await expect(summary(page)).toContainText('En 30 min: 1 tarea (20 min estimados, 10 min libres)');
  expect(harness.counts().attempts).toBe(0);
});

test('MISMA COPIA vs OTRA IDENTIDAD: actualizar la misma copia conserva estimaciones y elecciones; cambiar de captura con LOS MISMOS IDs reinicia la jornada', async ({ page }) => {
  await begin(page, 'day'); const order = ids(await harness.queue()); await openDay(page);
  await field(page, order[0]).fill('20'); await field(page, order[1]).fill('25'); await chosenRow(page, order[0]).getByRole('button', { name: /^Fijar / }).click(); await preset(page, 60).check();
  await expect(summary(page)).toContainText('En 60 min: 2 tareas (45 min estimados');
  await page.getByRole('button', { name: 'Actualizar' }).click(); await expect.poll(() => harness.counts().workQueueReads).toBe(2);
  await expect(summary(page), 'misma copia: se conserva').toContainText('En 60 min: 2 tareas (45 min estimados'); await expect(chosenRow(page, order[0])).toContainText('Fijada');
  const before = (await harness.queue()).identity; await harness.recapture(); const after = (await harness.queue()).identity;
  expect(after, 'la captura cambia de identidad aunque se repitan los IDs').not.toEqual(before);
  await page.getByRole('button', { name: 'Actualizar' }).click();
  await expect(summary(page), 'otra identidad: jornada nueva').toContainText('En 30 min: 0 tareas (0 min estimados, 30 min libres)'); await expect(chosenRow(page, order[0])).toHaveCount(0); await expect(preset(page, 30)).toBeChecked();
  await expect(region(page).locator('section[aria-labelledby="cd-decide-h"] li.cd-item[data-id="tarea-delta"]'), 'en la captura nueva Delta ya no tiene la relación ausente').not.toContainText('Falta un registro relacionado');
  expect(harness.counts().attempts).toBe(0);
});

test('FICHA DESDE LA JORNADA: guardar usa el guardado CONDICIONADO (0 PATCH legados); el foco vuelve al botón exacto; si la tarea se completa y sale de la cola se dice «ya no aparece» y el foco va a la región', async ({ page }) => {
  await begin(page, 'day'); const order = ids(await harness.queue()); await openDay(page);
  await field(page, order[0]).fill('20'); await field(page, order[1]).fill('10');
  const open = (id: string) => chosenRow(page, id).getByRole('button', { name: /^Abrir la tarea / });
  await open(order[0]).click(); await expect(dlg(page)).toContainText(order[0]);
  await dlg(page).getByRole('textbox', { name: 'Notas' }).fill('Nota desde la jornada'); await dlg(page).getByRole('button', { name: /Guardar cambios/ }).click();
  await expect.poll(() => harness.counts().applied).toBe(1); expect(harness.counts()).toMatchObject({ conditionedPatches: 1, legacyPatches: 0, attempts: 1 });
  await expect(dlg(page)).toHaveCount(0, { timeout: 10_000 }).catch(async () => { await page.keyboard.press('Escape'); });
  await expect(open(order[0]), 'el foco vuelve al botón exacto de la fila').toBeFocused({ timeout: 10_000 });
  expect((await harness.state()).history.some(row => row.recordId === order[0] && row.after.notes === 'Nota desde la jornada'), 'el efecto está en el historial de ESE ID').toBe(true);
  // Completar la segunda: sale de la cola y la jornada lo dice sin afirmar que «se completó» por haber desaparecido.
  await chosenRow(page, order[1]).getByRole('button', { name: /^Fijar / }).click();   // elección manual: solo estas pueden «dejar de aparecer»
  await open(order[1]).click(); await expect(dlg(page)).toContainText(order[1]);
  await dlg(page).getByRole('combobox', { name: /Estado/ }).selectOption('completed'); await dlg(page).getByRole('button', { name: /Guardar cambios/ }).click();
  await expect.poll(() => harness.counts().applied).toBe(2);
  await expect(region(page).locator('.cd-departed')).toContainText('Ya no aparecen en la cola', { timeout: 10_000 }); await expect(region(page).locator('.cd-departed')).toContainText('no demuestra que se completara');
  await expect(dlg(page)).toHaveCount(0, { timeout: 10_000 }).catch(async () => { await page.keyboard.press('Escape'); });
  await expect(region(page), 'la fila desapareció: el foco va a la región de la jornada').toBeFocused({ timeout: 10_000 }); expect(harness.counts()).toMatchObject({ legacyPatches: 0, attempts: 2 });
});

test('GUARDADO SIN RESOLVER: la tarea con un guardado incierto no se planifica sola y la jornada lo avisa; la misma ID en otra captura NO hereda ese aviso', async ({ page }) => {
  await begin(page, 'day'); const order = ids(await harness.queue()); const target = order[0]; await openDay(page); await field(page, target).fill('20');
  const barrier = gate(); await page.route('**/api/**', async (route: Route) => {
    const url = new URL(route.request().url()); if (route.request().method() !== 'PATCH' || !url.pathname.endsWith('/' + target)) return route.fallback();
    const response = await route.fetch(); await barrier.promise; void response; await route.abort('connectionreset').catch(() => undefined);
  });
  await chosenRow(page, target).getByRole('button', { name: /^Abrir la tarea / }).click(); await dlg(page).getByRole('textbox', { name: 'Notas' }).fill('Nota incierta'); await dlg(page).getByRole('button', { name: /Guardar cambios/ }).click();
  await expect.poll(() => harness.counts().attempts).toBe(1);
  try { await page.keyboard.press('Escape'); await expect(dlg(page)).toHaveCount(0); } finally { barrier.release(); }
  await expect(region(page).locator('section[aria-labelledby="cd-decide-h"] li.cd-item[data-id="' + target + '"]')).toContainText(/guardado/i, { timeout: 15_000 });
  await expect(chosenRow(page, target), 'con un guardado sin resolver no entra sola en la jornada').toHaveCount(0);
  await expect(region(page).locator('.cd-out')).toContainText(/Fuera de la jornada \(\d+\)/); await harness.recapture(); await page.getByRole('button', { name: 'Actualizar' }).click();
  await expect.poll(() => harness.counts().workQueueReads).toBeGreaterThanOrEqual(2);
  await expect(region(page).locator('section[aria-labelledby="cd-decide-h"] li.cd-item[data-id="' + target + '"]'), 'otra captura: el aviso del intento anterior no se hereda').not.toContainText(/guardado/i);
  expect(harness.counts().attempts, 'ningún reenvío automático').toBe(1);
});

test('AGENTES: la vista de Agentes y revisiones no ofrece la jornada y «Revisar mi copia» sigue guardando una revisión local', async ({ page }) => {
  await begin(page, 'day'); await openSection(page, 'Propuestas'); await expect(page.getByRole('heading', { name: 'Propuestas', exact: true })).toBeVisible(); await expect(entry(page)).toHaveCount(0);
  const reviews = writes(page); await page.getByRole('button', { name: /Revisar mi copia|Reintentar la misma revisión/ }).click(); await expect(page.locator('.lop-confirmation')).toContainText('Revisión local guardada');
  expect(reviews.filter(line => line.startsWith('POST') && line.endsWith('/api/v7/local-operations/reviews')), 'una sola revisión').toHaveLength(1);
});

// ── R2 · BARRERA DE CONTEXTO (devolución 290): el plan de otra captura no es utilizable ─────────────────────────────────────────────────────────────────────────────────────────────
// Reproducciones de Codex integradas con barreras explícitas (no solo esperas): se espera la respuesta real de Hoy y, en la tercera, la llegada real del cuerpo antiguo y dos cuadros de render.
const nextFrames = (page: Page) => page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
const hoyRefreshed = (page: Page) => page.waitForResponse(response => new URL(response.url()).pathname === '/api/v7/local-operations' && response.status() === 200);
async function plannedInOldCopy(page: Page) {
  const queue = await harness.queue(), order = ids(queue), oldId = queue.identity!.snapshotId as string; await openDay(page);
  await field(page, order[0]).fill('20'); await preset(page, 60).check(); await chosenRow(page, order[0]).getByRole('button', { name: /^Fijar / }).click(); await expect(summary(page)).toContainText('En 60 min: 1 tarea (20 min estimados'); await expect(chosenRow(page, order[0])).toContainText('Fijada');
  return { order, oldId };
}
const freshPlan = (page: Page) => expect(summary(page), 'jornada nueva: sin estimaciones ni fijados de la captura anterior').toContainText('En 30 min: 0 tareas (0 min estimados, 30 min libres)');

test('R2 · COLA 503 TRAS RECAPTURAR: Hoy ya muestra la copia nueva y la cola falla; el plan de la anterior se RETIRA (nada de acciones con IDs repetidos) y una lectura correcta empieza de cero', async ({ page }) => {
  await begin(page, 'day'); const { order, oldId } = await plannedInOldCopy(page); let mode: 'fail' | 'ok' = 'fail';
  await harness.recapture(); expect((await harness.queue()).identity!.snapshotId, 'la copia cambió de identidad').not.toBe(oldId);
  await page.route('**/api/v7/local-operations/work', route => mode === 'fail' ? route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Cola nueva no disponible (ensayo)' }) }) : route.fallback());
  const refreshed = hoyRefreshed(page); await page.getByRole('button', { name: 'Actualizar' }).click(); await refreshed;
  await expect(region(page).getByRole('alert')).toContainText('Cola nueva no disponible');
  await expect(region(page).locator('.cd'), 'el plan de la captura anterior ya no existe').toHaveCount(0); await expect(chosenRow(page, order[0])).toHaveCount(0); await expect(region(page).getByRole('button', { name: /^Abrir la tarea / })).toHaveCount(0);
  mode = 'ok'; await region(page).getByRole('button', { name: 'Reintentar la lectura de la cola' }).click(); await expect(region(page).locator('.cd')).toBeVisible(); await freshPlan(page); await expect(preset(page, 30)).toBeChecked(); await expect(region(page).getByText('Fijada')).toHaveCount(0);
  expect(harness.counts().attempts, 'sin escrituras').toBe(0);
});

test('R2 · COLA PENDIENTE con la copia nueva ya en Hoy: el plan anterior no abre tareas mientras la cola no llega; al llegar, jornada nueva', async ({ page }) => {
  await begin(page, 'day'); const { order } = await plannedInOldCopy(page); await harness.recapture(); const barrier = gate(); let held = 0;
  await page.route('**/api/v7/local-operations/work', async (route: Route) => { if (held++ > 0) return route.fallback(); await barrier.promise; await route.fallback(); });
  try {
    const refreshed = hoyRefreshed(page); await page.getByRole('button', { name: 'Actualizar' }).click(); await refreshed; await expect.poll(() => held).toBe(1);
    await expect(page.locator('.lop-tasks li').first()).toBeVisible(); await expect(chosenRow(page, order[0]), 'pendiente: ninguna acción del plan anterior').toHaveCount(0);
    await expect(region(page).getByRole('button', { name: /^Abrir la tarea / }), 'ni botones habilitados de otra captura').toHaveCount(0);
  } finally { barrier.release(); }
  await expect(region(page).locator('.cd')).toBeVisible(); await freshPlan(page);
});

test('R2 · RESPUESTA ANTIGUA RECIBIDA TARDE: el cuerpo de la cola de la captura vieja llega DESPUÉS de Hoy de la nueva y no devuelve botones ni estimaciones (se relee la correcta)', async ({ page }) => {
  await begin(page, 'day'); const { order, oldId } = await plannedInOldCopy(page);
  const workFetched = gate(), basicGate = gate(), workGate = gate(); let held = 0, oldWork: { identity: { snapshotId: string } } | null = null;
  await page.route('**/api/v7/local-operations/work', async (route: Route) => { if (held++ > 0) return route.fallback(); const response = await route.fetch(); oldWork = await response.json(); workFetched.release(); await workGate.promise; await route.fulfill({ response }).catch(() => undefined); });
  await page.route('**/api/v7/local-operations', async (route: Route) => { await basicGate.promise; await route.continue(); });
  try {
    const basicResponse = hoyRefreshed(page); await page.getByRole('button', { name: 'Actualizar' }).click(); await workFetched.promise;
    expect(oldWork!.identity.snapshotId, 'la cola retenida es de la captura vieja').toBe(oldId);
    await harness.recapture(); basicGate.release(); const next = await (await basicResponse).json() as { context: { captureId: string } }; expect(next.context.captureId, 'Hoy ya es de la captura nueva').not.toBe(oldId);
    const oldArrived = page.waitForResponse(response => new URL(response.url()).pathname === '/api/v7/local-operations/work' && response.status() === 200); workGate.release(); await oldArrived; await nextFrames(page);
    expect(await chosenRow(page, order[0]).count(), 'la respuesta vieja ya recibida no devuelve el plan ni su fijado').toBe(0); expect(await region(page).getByText('Fijada').count()).toBe(0);
    expect(await summary(page).count() === 0 || !(await summary(page).innerText()).includes('En 60 min'), 'ni el presupuesto de la captura anterior').toBe(true);
    expect(await region(page).locator('li.cd-item[data-id="tarea-delta"]').filter({ hasText: 'Falta un registro relacionado' }).count(), 'ningún dato de la captura vieja (allí Delta tenía una relación ausente; en la nueva no)').toBe(0);
  } finally { basicGate.release(); workGate.release(); }
  await expect(region(page).locator('.cd')).toBeVisible(); await freshPlan(page); await expect(region(page).getByRole('alert')).toHaveCount(0);
  await expect(region(page).locator('li.cd-item[data-id="tarea-delta"]')).not.toContainText('Falta un registro relacionado');
});

test('R2 · REFRESCO DE LA MISMA COPIA: mientras se comprueba, la jornada queda en pausa y de consulta; al confirmar, las estimaciones siguen intactas', async ({ page }) => {
  await begin(page, 'day'); const { order } = await plannedInOldCopy(page); const barrier = gate(); let held = 0;
  await page.route('**/api/v7/local-operations/work', async (route: Route) => { if (held++ > 0) return route.fallback(); await barrier.promise; await route.fallback(); });
  try {
    const refreshed = hoyRefreshed(page); await page.getByRole('button', { name: 'Actualizar' }).click(); await refreshed; await expect.poll(() => held).toBe(1);
    await expect(region(page).locator('[data-inactive="true"]')).toContainText('Comprobando que la jornada sea de la copia actual'); await expect(region(page).locator('[inert]')).toHaveCount(1);
    await expect(chosenRow(page, order[0]).getByRole('button', { name: /^Abrir la tarea / }).click({ trial: true, timeout: 700 }), 'en pausa: no se puede pulsar').rejects.toThrow();
    await expect(summary(page)).toContainText('En 60 min'); await expect(chosenRow(page, order[0])).toContainText('Fijada');
  } finally { barrier.release(); }
  await expect(region(page).locator('[inert]')).toHaveCount(0); await expect(region(page).locator('[data-inactive="true"]')).toHaveCount(0); await expect(summary(page)).toContainText('En 60 min: 1 tarea (20 min estimados'); await expect(chosenRow(page, order[0])).toContainText('Fijada');
  await chosenRow(page, order[0]).getByRole('button', { name: /^Abrir la tarea / }).click(); await expect(dlg(page)).toContainText(order[0]); expect(harness.counts().attempts).toBe(0);
});

test('R2 · BLOQUEO con una lectura de la cola en vuelo: la jornada se retira al instante y, pasado el tiempo y varios cuadros, no reaparece', async ({ page }) => {
  await begin(page, 'day'); const { order } = await plannedInOldCopy(page); const barrier = gate(); let held = 0;
  await page.route('**/api/v7/local-operations/work', async (route: Route) => { held++; const response = await route.fetch(); await barrier.promise; await route.fulfill({ response }).catch(() => undefined); });
  try {
    await page.getByRole('button', { name: 'Actualizar' }).click(); await expect.poll(() => held).toBe(1);
    await page.evaluate(() => window.dispatchEvent(new Event('planb:locked'))); await expect(region(page)).toHaveCount(0); await expect(entry(page)).toHaveText('Organizar mi jornada');
  } finally { barrier.release(); }
  await page.waitForTimeout(600); await nextFrames(page);
  await expect(region(page), 'la lectura retenida no repuebla la jornada').toHaveCount(0); await expect(page.locator('.cd')).toHaveCount(0); await expect(chosenRow(page, order[0])).toHaveCount(0);
});

// ── R3 · IDENTIDAD COMPLETA (devolución 290): misma captura y misma fecha, otra GENERACIÓN ──────────────────────────────────────────────────────────────────────────────────────────────
// La lista v1 no lleva generación, cuenta ni inicio de captura: la jornada solo se activa si la identidad vigente leída DESPUÉS de recibir la cola coincide EXACTAMENTE con la de la cola.
const identityOf = async () => (await harness.queue()).identity as { snapshotId: string; capturedAt: string; generatedAt: string | null };
const stateRead = (response: { url(): string }) => new URL(response.url()).pathname === '/api/v2/state';

test('R3 · GENERACIÓN DISTINTA, MISMA CAPTURA Y FECHA: una cola vieja que llega después de Hoy de la generación nueva no reactiva el plan; se relee y la jornada nueva sí permite planificar y abrir la tarea exacta', async ({ page }) => {
  await begin(page, 'day'); const { order } = await plannedInOldCopy(page); const before = await identityOf();
  const workFetched = gate(), basicGate = gate(), workGate = gate(); let held = 0, oldWork: { identity: { generatedAt: string | null } } | null = null;
  await page.route('**/api/v7/local-operations/work', async (route: Route) => { if (held++ > 0) return route.fallback(); const response = await route.fetch(); oldWork = await response.json(); workFetched.release(); await workGate.promise; await route.fulfill({ response }).catch(() => undefined); });
  await page.route('**/api/v7/local-operations', async (route: Route) => { await basicGate.promise; await route.continue(); });
  try {
    const basicResponse = hoyRefreshed(page); await page.getByRole('button', { name: 'Actualizar' }).click(); await workFetched.promise;
    expect(oldWork!.identity.generatedAt, 'la cola retenida es de la generación anterior').toBe(before.generatedAt);
    await harness.regenerate(); const now = await identityOf(); expect(now.snapshotId, 'misma captura').toBe(before.snapshotId); expect(now.capturedAt, 'misma fecha de captura').toBe(before.capturedAt); expect(now.generatedAt, 'otra generación').not.toBe(before.generatedAt);
    basicGate.release(); await basicResponse;
    const arrived = page.waitForResponse(response => new URL(response.url()).pathname === '/api/v7/local-operations/work' && response.status() === 200); workGate.release(); await arrived; await nextFrames(page);
    expect(await chosenRow(page, order[0]).count(), 'la cola vieja no devuelve el plan ni su fijado').toBe(0); expect(await region(page).getByText('Fijada').count()).toBe(0);
    expect(await summary(page).count() === 0 || !(await summary(page).innerText()).includes('En 60 min'), 'ni el presupuesto anterior').toBe(true);
  } finally { basicGate.release(); workGate.release(); }
  await expect(region(page).locator('.cd')).toBeVisible(); await freshPlan(page); await expect(region(page).locator('[inert]')).toHaveCount(0);
  // El contexto vigente SÍ permite planificar y abrir la tarea exacta.
  await field(page, order[0]).fill('20'); await expect(chosenRow(page, order[0])).toHaveCount(1); await chosenRow(page, order[0]).getByRole('button', { name: /^Abrir la tarea / }).click(); await expect(dlg(page)).toContainText(order[0]); expect(harness.counts().attempts).toBe(0);
});

test('R3 · COMPROBACIÓN DE IDENTIDAD PENDIENTE O CON ERROR: la cola llegó pero la identidad completa no se ha acreditado; la jornada queda de consulta y no abre tareas hasta acreditarla', async ({ page }) => {
  await begin(page, 'day'); const { order } = await plannedInOldCopy(page); let mode: 'hold' | 'fail' | 'ok' = 'hold'; const barrier = gate(); let held = 0;
  await page.route('**/api/v2/state', async (route: Route) => { if (mode === 'ok') return route.fallback(); if (mode === 'fail') return route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"x"}' }); held++; await barrier.promise; await route.fallback(); });
  try {
    const refreshed = hoyRefreshed(page); await page.getByRole('button', { name: 'Actualizar' }).click(); await refreshed; await expect.poll(() => held).toBeGreaterThan(0);
    await expect(region(page).locator('[data-inactive="true"]')).toBeVisible(); await expect(region(page).locator('[inert]')).toHaveCount(1);
    await expect(chosenRow(page, order[0]).getByRole('button', { name: /^Abrir la tarea / }).click({ trial: true, timeout: 700 }), 'pendiente: no se puede pulsar').rejects.toThrow();
  } finally { mode = 'fail'; barrier.release(); }
  await page.getByRole('button', { name: 'Actualizar' }).click(); await expect(region(page).getByRole('alert')).toContainText('No se pudo comprobar la identidad completa'); await expect(region(page).locator('[inert]')).toHaveCount(1); await expect(region(page).locator('[data-inactive="true"]')).toContainText('solo de consulta');
  mode = 'ok'; await page.getByRole('button', { name: 'Actualizar' }).click(); await expect(region(page).locator('[inert]')).toHaveCount(0); await expect(summary(page), 'misma identidad completa acreditada: se conservan las decisiones').toContainText('En 60 min: 1 tarea (20 min estimados'); await expect(chosenRow(page, order[0])).toContainText('Fijada');
});

test('R3 · TRANSPORTE TARDÍO QUE IGNORA LA CANCELACIÓN: una lectura de identidad retenida de la generación anterior llega después de la comprobación nueva y no activa nada', async ({ page }) => {
  await begin(page, 'day'); const { order } = await plannedInOldCopy(page); const fetched = gate(), workRelease = gate(); let held = 0;
  await page.route('**/api/v2/state', async (route: Route) => { if (held++ > 0) return route.fallback(); const response = await route.fetch(); fetched.release(); await workRelease.promise; await route.fulfill({ response }).catch(() => undefined); });
  try {
    await page.getByRole('button', { name: 'Actualizar' }).click(); await fetched.promise; await harness.regenerate();
    await page.getByRole('button', { name: 'Actualizar' }).click(); await expect(region(page).locator('.cd')).toBeVisible(); await freshPlan(page); await expect(region(page).locator('[inert]')).toHaveCount(0);
    const arrived = page.waitForResponse(response => stateRead(response) && response.status() === 200, { timeout: 1500 }).catch(() => null); workRelease.release(); await arrived;   // llega o la cancelación la corta: en ambos casos no debe activar nada await page.waitForTimeout(400); await nextFrames(page);
    await freshPlan(page); expect(await region(page).getByText('Fijada').count(), 'la lectura retenida no devuelve el plan anterior').toBe(0); expect(await chosenRow(page, order[0]).count()).toBe(0); await expect(region(page).locator('[inert]')).toHaveCount(0); await expect(region(page).getByRole('alert'), 'ni un aviso de la comprobación cancelada').toHaveCount(0);
  } finally { workRelease.release(); }
});

for (const width of [1440, 390, 320]) {
  test('TECLADO y ' + width + ' px: la jornada se recorre con Tab, sin desbordamiento horizontal, con objetivos táctiles y captura inspeccionable', async ({ page }, testInfo) => {
    await begin(page, 'day', { width, height: 900 }); const order = ids(await harness.queue());
    await entry(page).scrollIntoViewIfNeeded(); await page.waitForTimeout(450); const closed = path.join(harness.caseDir, 'entrada-' + width + '.png'); await page.screenshot({ path: closed }); await testInfo.attach('entrada-' + width, { path: closed, contentType: 'image/png' });   // la entrada visible, antes de abrir
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), 'cerrada: sin desbordamiento horizontal').toBeLessThanOrEqual(0);
    await entry(page).focus(); await page.keyboard.press('Space'); await expect(region(page)).toBeFocused();
    await expect(summary(page)).toBeVisible(); await expect(region(page)).toBeFocused();   // la cola ya llegó y el foco sigue en la región (no salta al cargar)
    await page.keyboard.press('Tab'); await expect(region(page).locator('input[name="cd-budget"]:focus'), 'Tab desde la región entra en el grupo de tiempos').toHaveCount(1);
    await preset(page, 30).focus(); await page.keyboard.press('ArrowRight'); await expect(preset(page, 60)).toBeChecked(); await page.keyboard.press('ArrowLeft'); await expect(preset(page, 30)).toBeChecked(); await expect(preset(page, 30)).toBeFocused();
    await field(page, order[0]).fill('20'); await field(page, order[1]).fill('25'); await preset(page, 60).check(); await page.waitForTimeout(450);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), 'sin desbordamiento horizontal').toBeLessThanOrEqual(0);
    if (width < 651) {
      const small = await region(page).locator('button, input[type="number"], .cd-preset, summary').evaluateAll(nodes => nodes.map(node => { const box = (node as HTMLElement).getBoundingClientRect(); return { name: (node.textContent || (node as HTMLInputElement).id || node.tagName).trim().slice(0, 40), h: Math.round(box.height), w: Math.round(box.width) }; }).filter(box => box.h > 0 && box.h < 32));
      expect(small, 'objetivos táctiles razonables (≥ 32 px de alto; los botones principales ≥ 44)').toEqual([]);
      for (const box of await entry(page).evaluateAll(nodes => nodes.map(node => Math.round(node.getBoundingClientRect().height)))) expect(box).toBeGreaterThanOrEqual(44);
    }
    await region(page).scrollIntoViewIfNeeded(); const shot = path.join(harness.caseDir, 'jornada-' + width + '.png'); await page.screenshot({ path: shot }); await testInfo.attach('jornada-' + width, { path: shot, contentType: 'image/png' });
    const full = path.join(harness.caseDir, 'jornada-' + width + '-completa.png'); await region(page).screenshot({ path: full }); await testInfo.attach('jornada-' + width + '-completa', { path: full, contentType: 'image/png' });
  });
}
