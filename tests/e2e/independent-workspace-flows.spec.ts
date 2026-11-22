import { test, expect, type Page, type APIRequestContext } from '@playwright/test';
import { resolve } from 'node:path';
import { makeFixture } from '../../shared/fixtures.js';

// CLAUDE-QA-060 · flujos independientes en Chromium real contra un servidor base aislado con datos ficticios (puerto propio, red externa bloqueada).
// Una sola copia activa para todo el fichero (modo serie): 30 «Qrz», 25 «Wvx», 53 oportunidades sin próxima acción y 61 tareas vencidas.
// Las respuestas tardías son VÁLIDAS (misma captura) y el transporte retenido ignora la señal de cancelación solo en esa petición.
test.describe.configure({ mode: 'serial' });

const password = 'fixture-qa060-password', output = resolve(process.env.PLANB_EVIDENCE_DIR || 'test-results');
const OPPS = 53, TASKS = 61;

async function seed(request: APIRequestContext) {
  const snapshot = makeFixture();
  snapshot.records = snapshot.records.filter(r => r.entity !== 'deals' && r.entity !== 'tasks');
  const contactBase = snapshot.records.find(r => r.entity === 'contacts')!;
  for (const [prefix, token, count] of [['q', 'Qrz', 30], ['wvx', 'Wvx', 25]] as const) for (let i = 1; i <= count; i++) {
    const record = structuredClone(contactBase), n = String(i).padStart(2, '0');
    record.id = prefix + '-' + n; record.values = { firstname: token + ' ' + n, lastname: 'Prueba', email: prefix + n + '@example.com', phone: '700 000 ' + n };
    snapshot.records.push(record);
  }
  const dealBase = makeFixture().records.find(r => r.entity === 'deals')!, taskBase = makeFixture().records.find(r => r.entity === 'tasks')!;
  for (let i = 1; i <= OPPS; i++) {
    const record = structuredClone(dealBase), last = i === OPPS;
    record.id = last ? 'zz-ultima' : 'opp-' + String(i).padStart(2, '0'); record.values = { dealname: last ? 'Zzultima oportunidad' : 'Opp059 ' + String(i).padStart(2, '0'), amount: 100 + i, dealstage: 'contact' };
    snapshot.records.push(record);
  }
  for (let i = 1; i <= TASKS; i++) {
    const record = structuredClone(taskBase); record.id = 'task-' + String(i).padStart(2, '0'); record.values = { subject: 'Tarea Núñez ' + String(i).padStart(2, '0'), due_date: '2020-01-01', status: 'pending' };
    snapshot.records.push(record);
  }
  // QA079 · F2: una empresa cuyo nombre solo tiene espacios (se activa; un nombre «» no) para comprobar su título en la interfaz real.
  snapshot.records.push({ entity: 'companies', id: 'qaf-blank-079', values: { name: '   ', domain: 'qaf079.example' } });
  snapshot.name = 'QA060 · flujos independientes'; snapshot.links = []; snapshot.manifest.expectedLinks = 0;
  for (const entity of snapshot.entities) snapshot.manifest.expectedCounts[entity.id] = snapshot.records.filter(r => r.entity === entity.id).length;
  const gate = await request.get('/api/v2/auth/status').then(r => r.json());
  expect((await request.post('/api/v2/auth/' + (gate.configured ? 'login' : 'setup'), { data: { password } })).ok()).toBeTruthy();
  for (const [url, data] of [['/api/import/snapshot', { snapshot, replace: true }], ['/api/generate', { mode: 'demo' }], ['/api/activate', { reviewed: true }]] as const) expect((await request.post(url, { data })).ok(), url).toBeTruthy();
}
test.beforeAll(async ({ playwright }) => {
  const baseURL = test.info().project.use.baseURL!, allowed = process.env.QA079_WS_URL ?? 'http://127.0.0.1:4398'; if (baseURL !== allowed || ['4331', '4334'].includes(new URL(baseURL).port) || new URL(baseURL).hostname !== '127.0.0.1') throw Error('Usa el servidor aislado (' + allowed + '); nunca 4331/4334.');   // QA079: origen configurable por QA079_WS_URL
  const request = await playwright.request.newContext({ baseURL }); await seed(request); await request.dispose();
});

async function enter(page: Page, hold = false) {
  const errors: string[] = [], outside: string[] = [], writes: string[] = [], apiGets: string[] = [];
  page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });
  page.on('request', r => { const url = new URL(r.url()); if (url.pathname.startsWith('/api/')) { if (r.method() !== 'GET') writes.push(r.method() + ' ' + url.pathname); else apiGets.push(url.pathname + url.search); } });
  await page.route('**/*', route => { const url = new URL(route.request().url()); if (url.hostname !== '127.0.0.1') { outside.push(url.origin); return route.abort(); } return route.fallback(); });
  if (hold) await page.addInitScript(() => {
    // Transporte de ensayo: la petición «retenida» se envía de verdad al servidor, pero ignora la señal y su respuesta solo llega al pulsar liberar.
    const w = window as any, original = w.fetch.bind(w); w.__hold = null; w.__held = 0;
    w.fetch = (input: any, init: any) => {
      const url = typeof input === 'string' ? input : input.url;
      if (w.__hold && url.includes(w.__hold)) { w.__hold = null; w.__held++; const { signal: _ignored, ...rest } = init || {}; const real = original(input, rest); return new Promise((ok, fail) => { w.__release = () => real.then(ok, fail); }); }
      return original(input, init);
    };
  });
  const gate = await page.request.get('/api/v2/auth/status').then(r => r.json());
  expect((await page.request.post('/api/v2/auth/' + (gate.configured ? 'login' : 'setup'), { data: { password } })).ok()).toBeTruthy();
  await page.goto('/'); await page.getByRole('button', { name: 'Continuidad', exact: true }).click(); await expect(page.getByRole('heading', { name: 'Continuidad', exact: true })).toBeVisible();
  return { errors, outside, writes, apiGets };
}
async function openSearch(page: Page) {
  await page.getByRole('button', { name: 'Buscar en toda la copia', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Buscar en toda la copia', exact: true }); await expect(dialog).toBeVisible();
  const input = dialog.getByRole('searchbox', { name: 'Buscar en toda la copia' }); await expect(input).toBeFocused();
  return { dialog, input, results: dialog.locator('.workspace-search-results'), status: dialog.getByRole('status') };
}
const done = (x: { errors: string[]; outside: string[]; writes?: string[] }) => { expect(x.errors, 'sin errores de página ni de consola').toEqual([]); expect(x.outside, 'sin peticiones externas').toEqual([]); if (x.writes) expect(x.writes, 'sin escrituras').toEqual([]); };

// ------------------------------------------------------------------ búsqueda
test('búsqueda: una respuesta VÁLIDA y antigua que llega tarde (transporte sin cancelación) no sustituye al resultado actual ni deja un spinner', async ({ page }) => {
  const watch = await enter(page, true), { dialog, input, results, status } = await openSearch(page);
  await page.evaluate(() => { (window as any).__hold = 'q=qrz'; });
  await input.fill('qrz'); await expect.poll(() => page.evaluate(() => (window as any).__held), { message: 'la consulta «qrz» quedó retenida' }).toBe(1);
  await input.fill('wvx'); await expect(status).toHaveText('1–20 de 25 resultados'); await expect(dialog.getByRole('listitem').first()).toContainText('Wvx');
  await page.evaluate(() => (window as any).__release()); await page.waitForTimeout(600);   // llega la respuesta válida de «qrz» (30 resultados, misma captura)
  await expect(status, 'sigue el resultado de la consulta actual').toHaveText('1–20 de 25 resultados'); await expect(dialog.getByRole('listitem').first()).toContainText('Wvx'); await expect(dialog.getByText('Qrz 01')).toHaveCount(0);
  await expect(results).toHaveAttribute('aria-busy', 'false'); await expect(dialog.getByRole('alert')).toHaveCount(0); await expect(dialog.getByText('Buscando en la copia local…')).toHaveCount(0);
  await expect(dialog).toBeVisible();
  done(watch); expect(watch.writes).toEqual([]);
});

test('búsqueda: abrir un resultado cuya respuesta llega tarde, tras cambiar la consulta, no abre la ficha vieja', async ({ page }) => {
  const watch = await enter(page, true), { dialog, input, status } = await openSearch(page);
  await input.fill('wvx'); await expect(status).toHaveText('1–20 de 25 resultados');
  await page.evaluate(() => { (window as any).__hold = '/api/v2/search-record'; });
  await dialog.getByRole('listitem').first().getByRole('button').click(); await expect.poll(() => page.evaluate(() => (window as any).__held)).toBe(1);
  await expect(dialog.getByText('Abriendo el registro actual…')).toBeVisible();
  await input.fill('qrz'); await expect(status).toHaveText('1–20 de 30 resultados');
  await page.evaluate(() => (window as any).__release()); await page.waitForTimeout(600);
  await expect(dialog, 'la apertura tardía no cierra la búsqueda ni navega').toBeVisible(); await expect(status).toHaveText('1–20 de 30 resultados'); await expect(page.locator('.drawer-shade')).toHaveCount(0);
  await expect(dialog.getByText('Abriendo el registro actual…')).toHaveCount(0); await expect(dialog.getByRole('alert')).toHaveCount(0);
  done(watch);
});

test('búsqueda: paginar tras cambiar los datos usa la revisión antigua → 409 visible y «Reintentar» recupera la primera página', async ({ page }) => {
  const watch = await enter(page), { dialog, input, status } = await openSearch(page);
  await input.fill('wvx'); await expect(status).toHaveText('1–20 de 25 resultados');
  const edit = await page.request.patch('/api/records/contacts/wvx-01', { data: { values: { phone: '700 999 999' } } }); expect(edit.ok(), 'edición ficticia previa').toBeTruthy(); watch.writes.length = 0;
  await dialog.getByRole('button', { name: 'Siguiente', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('La copia cambió durante la búsqueda'); await expect(dialog.getByRole('listitem')).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Reintentar búsqueda', exact: true }).click();
  await expect(status).toHaveText('1–20 de 25 resultados'); await expect(dialog.getByRole('alert')).toHaveCount(0);
  done(watch); expect(watch.writes).toEqual([]);
});

test('búsqueda: un 404 del servicio antiguo no se presenta como «sin resultados»', async ({ page }) => {
  const watch = await enter(page); await page.route('**/api/v2/search?*', route => route.fulfill({ status: 404, json: { error: 'Operación no disponible en esta aplicación.' } }));
  const { dialog, input } = await openSearch(page); await input.fill('wvx');
  await expect(dialog.getByRole('alert')).toContainText('no incluye la búsqueda global'); await expect(dialog.getByText('No hay resultados para esta búsqueda.')).toHaveCount(0);
  done(watch);
});

// ------------------------------------------------------------------ Hoy
// La antigua cola de Hoy (WorkQueue: «Lista de prioridades» y «Lista de compromisos», páginas de 20 y aviso de listTotals de
// /api/v4/today) se retiró en 7fcb771. Hoy es ahora LocalOperations (/api/v7/local-operations): tareas por estado, filtros con
// recuento, una sola regla de vencidas, «Despachar» junto al filtro Vencidas, un solo botón relleno y estado y fecha en una celda (9e1ad41).
test('Hoy: las tareas vencidas con una sola regla, «Despachar» junto a su filtro, un botón relleno, estado y fecha en una celda, búsqueda local sin releer y sin desbordamiento en 1440, 390 y 320', async ({ page }) => {
  const watch = await enter(page);
  await page.getByRole('button', { name: 'Hoy', exact: true }).click(); await expect(page.getByRole('heading', { name: 'Hoy', exact: true })).toBeVisible();
  const hoy = page.locator('section.lop'), table = hoy.getByRole('table', { name: 'Tareas de Hoy por estado' }), rows = table.locator('li[role="row"]');
  await expect(rows).toHaveCount(TASKS);
  // Una sola regla de vencidas: las 61 tareas del 01/01/2020 son vencidas en el filtro, en su grupo y en «Todas».
  const filters = hoy.getByRole('group', { name: 'Filtrar las tareas mostradas' }), overdue = filters.getByRole('button', { name: /^Vencidas/ });
  await expect(filters.getByRole('button', { name: /^Todas/ }).locator('.oc-count')).toHaveText(String(TASKS)); await expect(overdue.locator('.oc-count')).toHaveText(String(TASKS));
  await expect(table.getByRole('heading', { name: 'Vencidas · ' + TASKS, exact: true })).toBeVisible();
  // «Despachar» va justo después del filtro Vencidas y dice cuántas despacha.
  const dispatch = filters.getByRole('button', { name: 'Despachar las ' + TASKS + ' tareas vencidas de la copia, una a una', exact: true });
  await expect(dispatch).toBeVisible(); await expect(overdue.locator('xpath=following-sibling::*[1]')).toHaveClass(/lop-dispatch/);
  // Un solo botón relleno en la vista.
  await expect(hoy.locator('.button.primary')).toHaveCount(1); await expect(hoy.locator('.button.primary')).toHaveText('Organizar mi jornada');
  // Estado y fecha en una celda: tres columnas, y la fecha de una vencida lleva su tono y los días de retraso.
  await expect(table.getByRole('columnheader')).toHaveCount(3); await expect(rows.first().getByRole('cell')).toHaveCount(3);
  const due = rows.first().locator('.oc-due'); await expect(due).toHaveAttribute('data-tone', 'danger'); await expect(due).toHaveText(/ · \d+ d$/);
  // La búsqueda filtra lo mostrado en el navegador: no relee la lista ni la cola.
  const reads = () => watch.apiGets.filter(url => url.startsWith('/api/v7/local-operations')).length, before = reads();
  const search = hoy.getByRole('searchbox', { name: 'Buscar en las tareas mostradas' });
  await search.fill('task-61'); await expect(rows).toHaveCount(1); await expect(rows.first()).toContainText('Tarea Núñez 61');
  await search.fill('zzzz-no-existe'); await expect(rows).toHaveCount(0); await expect(hoy.getByText('No hay coincidencias entre las tareas mostradas.')).toBeVisible();
  await search.fill(''); await overdue.click(); await expect(overdue).toHaveAttribute('aria-pressed', 'true'); await expect(rows).toHaveCount(TASKS);
  await overdue.click(); await expect(filters.getByRole('button', { name: /^Todas/ })).toHaveAttribute('aria-pressed', 'true');
  expect(reads(), 'buscar y filtrar no releen Hoy').toBe(before);
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 900 }); await hoy.scrollIntoViewIfNeeded(); await page.screenshot({ path: resolve(output, 'hoy-' + width + '.png') });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'sin scroll horizontal de página a ' + width).toBeTruthy();
    const beyond = await hoy.evaluate(root => [...root.querySelectorAll('.oc-filters *, .lop-queue-heading *, .lop-search *')].filter(e => e.getBoundingClientRect().right > innerWidth + 1).map(e => e.tagName.toLowerCase() + '.' + (e as HTMLElement).className).slice(0, 5));
    expect(beyond, 'filtros, acciones y búsqueda dentro del viewport a ' + width).toEqual([]); await expect(dispatch, '«Despachar» visible a ' + width).toBeVisible();
  }
  done(watch); expect(watch.writes).toEqual([]);
});

test('búsqueda QA060-F2: una ficha con nombre en blanco aparece con su ID como título (no un botón vacío) y se puede abrir con teclado', async ({ page }) => {
  const watch = await enter(page), { dialog, input, status } = await openSearch(page);
  await input.fill('qaf079'); await expect(status).toHaveText('1–1 de 1 resultados');
  const hit = dialog.getByRole('listitem').first().getByRole('button'); await expect(hit, 'el título identifica la ficha por su ID').toContainText('qaf-blank-079');
  const title = (await hit.locator('.workspace-search-hit-title').innerText()).trim(); expect(title, 'el título no está vacío').not.toBe(''); expect(title).toContain('qaf-blank-079');
  await hit.focus(); await page.keyboard.press('Enter'); await expect(dialog).toBeHidden();   // la ficha se abre; no se guarda nada
  done(watch); expect(watch.writes).toEqual([]);
});
