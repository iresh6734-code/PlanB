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
  await page.goto('/'); await page.getByRole('button', { name: 'Continuidad', exact: true }).click(); await expect(page.getByRole('heading', { name: 'Tu negocio puede seguir.' })).toBeVisible();
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
async function today(page: Page) {
  await page.getByRole('button', { name: 'Hoy', exact: true }).click(); await expect(page.getByRole('heading', { name: 'Tu día, con un siguiente paso.', exact: true })).toBeVisible();
  const priorities = page.getByRole('region', { name: 'Lista de prioridades', exact: true }), commitments = page.getByRole('region', { name: 'Lista de compromisos', exact: true });
  await expect(priorities.locator('.work-queue-count')).toHaveText('1–5 de ' + OPPS + ' prioridades'); await expect(commitments.locator('.work-queue-count')).toHaveText('1–5 de ' + TASKS + ' tareas');
  return { priorities, commitments };
}

test('Hoy: totales y filas completas, páginas de 20 hasta el último elemento, búsqueda por ID/acentos sin peticiones, página antigua acotada y foco al limpiar', async ({ page }) => {
  const watch = await enter(page), { priorities, commitments } = await today(page);
  await expect(priorities.getByRole('listitem')).toHaveCount(5); await expect(priorities.getByText(/No se ha podido comprobar/)).toHaveCount(0);
  await priorities.getByRole('button', { name: 'Ver las ' + OPPS + ' prioridades' }).click();
  await expect(priorities.getByRole('listitem')).toHaveCount(20); await expect(priorities.locator('.work-queue-count')).toHaveText('1–20 de ' + OPPS + ' prioridades'); await expect(priorities.getByText('Página 1 de 3')).toBeVisible();
  const next = priorities.getByRole('button', { name: 'Siguiente', exact: true }), previous = priorities.getByRole('button', { name: 'Anterior', exact: true });
  await expect(previous).toBeDisabled(); await next.click(); await next.click();
  await expect(priorities.getByText('Página 3 de 3')).toBeVisible(); await expect(priorities.getByRole('listitem')).toHaveCount(OPPS - 40); await expect(next).toBeDisabled();
  await expect(priorities.getByRole('listitem').last()).toContainText('Zzultima oportunidad'); await expect(priorities.getByRole('listitem').last()).toContainText('ID zz-ultima');
  // La búsqueda es local: ninguna petición, ningún cambio de orden.
  const requestsBefore = watch.apiGets.length, search = priorities.getByRole('searchbox', { name: 'Buscar prioridades' });
  await search.fill('opp-07'); await expect(priorities.getByRole('listitem')).toHaveCount(1); await expect(priorities.locator('.work-queue-count')).toHaveText('1–1 de 1 prioridades · ' + OPPS + ' recibidas en total');
  await expect(priorities.getByText(/Página \d de \d/), 'una página antigua no deja una vista vacía').toHaveCount(0);
  await search.fill('OPP059 5'); await expect(priorities.locator('.work-queue-count')).toHaveText(/de \d+ prioridades/);
  await search.fill('zzzz-no-existe'); await expect(priorities.locator('.work-queue-count')).toContainText('No hay prioridades que coincidan.'); await expect(priorities.getByRole('listitem')).toHaveCount(0);
  const clear = priorities.getByRole('button', { name: 'Limpiar búsqueda' }); await clear.click(); await expect(search).toBeFocused(); await expect(search).toHaveValue(''); await expect(priorities.locator('.work-queue-count')).toHaveText('1–20 de ' + OPPS + ' prioridades');
  expect(watch.apiGets.length, 'filtrar no hace peticiones').toBe(requestsBefore);
  // Tareas: 61 compromisos; búsqueda con acentos por etiqueta y por ID.
  await commitments.getByRole('button', { name: 'Ver las ' + TASKS + ' tareas' }).click(); await expect(commitments.getByText('Página 1 de 4')).toBeVisible();
  const tasks = commitments.getByRole('searchbox', { name: 'Buscar tareas' }); await tasks.fill('nunez 61'); await expect(commitments.getByRole('listitem')).toHaveCount(1); await expect(commitments.getByRole('listitem')).toContainText('ID task-61');
  await tasks.fill('NÚÑEZ'); await expect(commitments.locator('.work-queue-count')).toContainText('de ' + TASKS + ' tareas');
  done(watch); expect(watch.writes).toEqual([]);
});

test('Hoy: servidor anterior sin listTotals o con totales inconsistentes avisa y no afirma que sean todas', async ({ page }) => {
  for (const [name, mutate, expected] of [
    ['sin listTotals', (d: any) => { delete d.listTotals; }, new RegExp('Se muestran ' + OPPS + ' recibidas\\.')],
    ['total mayor que lo recibido', (d: any) => { d.listTotals = { opportunities: 70, tasks: TASKS }; }, new RegExp('Se muestran ' + OPPS + ' recibidas de 70 indicadas')],
    ['total menor que lo recibido', (d: any) => { d.listTotals = { opportunities: 20, tasks: TASKS }; }, new RegExp('Se muestran ' + OPPS + ' recibidas\\.')],
  ] as const) {
    const fresh = await page.context().newPage(); const watch = await enter(fresh);
    await fresh.route('**/api/v4/today', async route => { const response = await route.fetch(); const body = await response.json(); mutate(body); await route.fulfill({ response, json: body }); });
    await fresh.getByRole('button', { name: 'Hoy', exact: true }).click();
    const priorities = fresh.getByRole('region', { name: 'Lista de prioridades', exact: true });
    await expect(priorities.getByText(/No se ha podido comprobar que estén todas las prioridades/), name).toBeVisible(); await expect(priorities.getByText(expected), name).toBeVisible();
    await expect(priorities.getByText(/Actualiza Plan B antes de dar la lista por completa/)).toBeVisible();
    await expect(fresh.getByRole('region', { name: 'Lista de compromisos', exact: true }).getByText(/No se ha podido comprobar/), 'las tareas, coherentes, no avisan').toHaveCount(name === 'sin listTotals' ? 1 : 0);
    done(watch); await fresh.close();
  }
});

test('Hoy: controles táctiles, teclado y sin desbordamiento en 1440, 390 y 320', async ({ page }) => {
  const watch = await enter(page); await today(page); const priorities = page.getByRole('region', { name: 'Lista de prioridades', exact: true });
  await priorities.getByRole('button', { name: 'Ver las ' + OPPS + ' prioridades' }).click();
  const search = priorities.getByRole('searchbox', { name: 'Buscar prioridades' }); await search.fill('opp'); await expect(priorities.getByRole('button', { name: 'Limpiar búsqueda' })).toBeVisible();
  const sizes: Record<string, number> = {};
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 900 }); await priorities.scrollIntoViewIfNeeded(); await page.screenshot({ path: resolve(output, 'hoy-' + width + '.png') });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'sin scroll horizontal de página a ' + width).toBeTruthy();
    // Lo que importa al usuario: nada recortado por la región ni fuera del viewport. (El relleno transparente de «Ver oportunidad» puede rebasar 8 px el fondo de la región a 1440: observación, no defecto visible.)
    const overflow = await priorities.evaluate(root => { const clipped = getComputedStyle(root).overflowX !== 'visible', box = root.getBoundingClientRect(); return { clipped, beyondViewport: [...root.querySelectorAll('*')].filter(e => e.getBoundingClientRect().right > innerWidth + 1).map(e => e.tagName.toLowerCase() + '.' + (e as HTMLElement).className).slice(0, 5), paddingSlack: Math.max(0, root.scrollWidth - root.clientWidth), box: Math.round(box.width) }; });
    expect(overflow.clipped, 'región sin recorte horizontal a ' + width + ': ' + JSON.stringify(overflow)).toBe(false); expect(overflow.beyondViewport, 'nada fuera del viewport a ' + width + ': ' + JSON.stringify(overflow)).toEqual([]);
    sizes['holgura@' + width] = overflow.paddingSlack;
    // En móvil el texto de «Ver oportunidad» se oculta con font-size:0 (regla preexistente): el botón debe conservar su nombre accesible.
    await expect(priorities.getByRole('button', { name: 'Ver oportunidad' }), 'botones con nombre accesible a ' + width).toHaveCount(20);
    for (const name of ['Siguiente', 'Anterior', 'Limpiar búsqueda', 'Mostrar menos']) { const box = await priorities.getByRole('button', { name, exact: true }).boundingBox(); expect(box, name).not.toBeNull(); sizes[name + '@' + width] = Math.round(box!.height); }
  }
  console.log('# alturas medidas (px): ' + JSON.stringify(sizes));
  for (const [key, height] of Object.entries(sizes).filter(([k]) => !k.startsWith('holgura'))) expect(height, 'objetivo táctil ≥ 44 px: ' + key).toBeGreaterThanOrEqual(44);
  // Teclado: Tab llega al botón de página y Enter lo activa.
  await page.setViewportSize({ width: 1440, height: 900 }); await search.fill(''); await search.focus(); await page.keyboard.press('Tab');
  await priorities.getByRole('button', { name: 'Siguiente', exact: true }).focus(); await page.keyboard.press('Enter'); await expect(priorities.getByText('Página 2 de 3')).toBeVisible();
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
