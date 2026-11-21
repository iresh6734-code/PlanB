import { test, expect, type Page } from '@playwright/test';
import { makeFixture } from '../../shared/fixtures.js';
import { mkdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { openSection } from './menu';

// QA073 · Recorridos en navegador real (Chromium headless de caché) con CSS global real. QA079: orígenes y carpeta de capturas configurables (QA079_MAIN, QA079_AUTH, QA079_SHOTS, QA079_E2E_RUN);
// se ejecutan con una configuración propia de Playwright (puertos 4461-4469 en QA079, nunca 4331/4334): las pruebas se niegan a correr contra 4331/4334 o contra un origen que no sea loopback. Datos ficticios, contraseña ficticia nueva en cada ejecución, red externa bloqueada.
// Todo POST con forma de proveedor/equipo se intercepta; el backend del fixture mantiene connection:null y no hay portal real.
// Límites: Chromium headless es un único motor; no hay lector de pantalla; los puntos de ruptura son 1440/390/320.
const MAIN = process.env.QA079_MAIN ?? process.env.QA073_MAIN ?? 'http://127.0.0.1:4352', AUTH = process.env.QA079_AUTH ?? process.env.QA073_AUTH ?? 'http://127.0.0.1:4353';
for (const origin of [MAIN, AUTH]) { const u = new URL(origin); if (u.hostname !== '127.0.0.1' || ['4331', '4334'].includes(u.port)) throw Error('Origen no permitido para estas pruebas: ' + origin); }
const RUN = process.env.QA079_E2E_RUN ?? 'run-' + randomUUID();   // UUID por ejecución: nunca se reutiliza ni se sobrescribe una carpeta de capturas anterior
const SHOTS = process.env.QA079_SHOTS ?? resolve('tests/.tmp/qa079-shots', RUN);
const PASSWORD = 'contrasena-ficticia-qa079-' + RUN;
const VIEWPORTS = [{ width: 1440, height: 900 }, { width: 390, height: 844 }, { width: 320, height: 640 }] as const;
mkdirSync(SHOTS, { recursive: true });

type Watch = { errors: string[]; outside: string[]; writes: string[]; consoleErrors: string[] };
function watch(page: Page, origin: string): Watch {
  const w: Watch = { errors: [], outside: [], writes: [], consoleErrors: [] };
  page.on('pageerror', e => w.errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') w.consoleErrors.push(m.text()); });
  page.on('request', r => { const u = new URL(r.url()); if (r.method() !== 'GET') w.writes.push(r.method() + ' ' + u.pathname); });
  void page.route('**/*', route => { const url = new URL(route.request().url()); if (url.origin !== origin) { w.outside.push(url.origin); return route.abort(); } return route.fallback(); });
  return w;
}
const assertOrigin = (page: Page, origin: string) => { if (new URL(page.url() === 'about:blank' ? origin : page.url()).origin !== origin) throw Error('Origen no permitido para QA073: ' + page.url()); };
async function setupBackend(page: Page, mutate: (snapshot: ReturnType<typeof makeFixture>) => void = () => {}) {
  const gate = await page.request.get(MAIN + '/api/v2/auth/status').then(r => r.json());
  expect((await page.request.post(MAIN + '/api/v2/auth/' + (gate.configured ? 'login' : 'setup'), { data: { password: PASSWORD } })).ok()).toBeTruthy();
  const snapshot = makeFixture(); mutate(snapshot);
  for (const [url, data] of [['/api/import/snapshot', { snapshot, replace: true }], ['/api/generate', { mode: 'demo' }], ['/api/activate', { reviewed: true }]] as const) {
    const res = await page.request.post(MAIN + url, { data }); expect(res.ok(), url + ' ' + (await res.text()).slice(0, 200)).toBeTruthy();
  }
}
/** Geometría de composición con CSS global: ninguna regla debe estrechar controles ni crear desbordes horizontales. */
async function geometry(page: Page, selectors: Record<string, string>) {
  return page.evaluate(sel => {
    const out: Record<string, any> = { doc: { scrollWidth: document.documentElement.scrollWidth, innerWidth: window.innerWidth } };
    for (const [name, css] of Object.entries(sel)) {
      const el = document.querySelector(css) as HTMLElement | null; if (!el) { out[name] = null; continue; }
      const r = el.getBoundingClientRect(), s = getComputedStyle(el);
      out[name] = { x: Math.round(r.x), w: Math.round(r.width), h: Math.round(r.height), hx: r.height, wx: r.width, right: Math.round(r.right), overflowY: s.overflowY, clientHeight: el.clientHeight, scrollHeight: el.scrollHeight, scrollWidth: el.scrollWidth, clientWidth: el.clientWidth };
    }
    return out;
  }, selectors);
}

test.describe.configure({ mode: 'serial' });

test('B1 relación en un Modal real: nombre accesible exacto, ID fuera de los 50, teclado y composición a 1440/390/320', async ({ page }) => {
  assertOrigin(page, MAIN); const w = watch(page, MAIN); const chosen = 'extra073-139';
  await setupBackend(page, snapshot => {
    const base = snapshot.records.find(r => r.entity === 'contacts')!;
    for (let i = 0; i < 140; i++) { const r = structuredClone(base); r.id = 'extra073-' + String(i).padStart(3, '0'); r.values.firstname = i === 139 ? 'Elegida073' : 'Relleno073 ' + String(i).padStart(3, '0'); r.values.lastname = i === 139 ? 'Última' : 'Prueba'; r.values.email = r.id + '@example.invalid'; snapshot.records.push(r); }
    snapshot.records.find(r => r.entity === 'tasks' && r.id === 'task-1')!.values.contact_id = chosen; snapshot.records.find(r => r.entity === 'tasks' && r.id === 'task-1')!.values.subject = 'Tarea principal073';
    snapshot.links = snapshot.records.flatMap(r => snapshot.entities.find(e => e.id === r.entity)!.fields.filter(f => f.type === 'reference' && r.values[f.key]).map(f => ({ fromEntity: r.entity, fromId: r.id, toEntity: f.referenceEntity!, toId: String(r.values[f.key]), label: f.key })));
    snapshot.manifest.expectedCounts.contacts = 164; snapshot.manifest.expectedLinks = snapshot.links.length;
  });
  await page.goto(MAIN + '/'); await openSection(page, 'Clientes'); await page.getByRole('button', { name: 'Tareas', exact: true }).click(); await page.getByRole('button', { name: 'Tarea principal073', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Tarea principal073', exact: true });
  const select = dialog.getByRole('combobox', { name: 'Cliente', exact: true });
  await expect(select, 'Modal real: el nombre accesible es field.label exactamente').toBeVisible(); await expect(select).toHaveValue(chosen);
  await expect(select).toHaveValue(chosen); await expect(select.locator('option:checked')).toHaveText('Elegida073 Última'); // nombre único: sin ID (CLAUDE-UI-FIXES-D4) await expect(select).toHaveAccessibleName('Cliente');
  await expect(dialog.getByText('Se muestran 50 de 164 resultados. Escribe para afinar la búsqueda.', { exact: true })).toBeVisible();
  const search = dialog.getByRole('searchbox', { name: 'Buscar relación cliente', exact: true }); await expect(search).toBeVisible();
  // Teclado: Tab llega a la búsqueda y al selector; Escape cierra el diálogo sin guardar nada.
  await search.focus(); await page.keyboard.press('Tab'); await expect(select).toBeFocused(); await page.keyboard.press('Shift+Tab'); await expect(search).toBeFocused();
  for (const viewport of VIEWPORTS) {
    await page.setViewportSize(viewport); await page.waitForTimeout(150);
    const g = await geometry(page, { picker: '[role="dialog"] .reference-picker:has(#record-contact_id)', search: '[role="dialog"] .reference-picker:has(#record-contact_id) .reference-search', select: '[role="dialog"] #record-contact_id', dialog: '[role="dialog"]', save: '[role="dialog"] button.primary' });
    console.log('QA073-B1 ' + viewport.width + ' ' + JSON.stringify(g));
    expect(g.doc.scrollWidth, viewport.width + ': sin desplazamiento horizontal de la página').toBeLessThanOrEqual(g.doc.innerWidth);
    expect(g.dialog.right, viewport.width + ': el diálogo cabe en el ancho').toBeLessThanOrEqual(g.doc.innerWidth + 1);
    expect(g.search.h, viewport.width + ': objetivo táctil del buscador ≥ 44 px').toBeGreaterThanOrEqual(44); expect(g.select.h, viewport.width + ': objetivo táctil del selector ≥ 44 px').toBeGreaterThanOrEqual(44);
    expect(g.search.w, viewport.width + ': el buscador no queda estrechado por CSS global').toBeGreaterThanOrEqual(g.picker.w * 0.9); expect(g.select.w, viewport.width + ': el selector tampoco').toBeGreaterThanOrEqual(g.picker.w * 0.9);
    expect(g.select.right, viewport.width + ': el selector no se sale del diálogo').toBeLessThanOrEqual(g.dialog.right + 1);
    await page.screenshot({ path: SHOTS + '/b1-relation-' + viewport.width + '.png' });
  }
  await page.setViewportSize(VIEWPORTS[0]);
  await page.keyboard.press('Escape'); await expect(dialog).toBeHidden();
  expect(w.errors, 'sin errores de página').toEqual([]); expect(w.outside, 'sin red externa').toEqual([]); expect(w.writes, 'abrir y mirar no escribe nada').toEqual([]);
  expect(w.consoleErrors.filter(m => !/Failed to load resource/.test(m)), 'sin errores de consola no atendidos').toEqual([]);
});

test('B2 historial: 122 operaciones por páginas de 20 sin saltos, expansión por teclado de un valor Unicode largo y composición a 1440/390/320', async ({ page }) => {
  assertOrigin(page, MAIN); const w = watch(page, MAIN);
  await setupBackend(page);
  const longValue = ('Año 😀 é ' + 'x'.repeat(300) + ' ').repeat(3) + 'COLA-ÚNICA-073';
  for (let i = 0; i < 122; i++) {
    const values = i === 50 ? { notes: longValue } : { phone: '700 000 ' + String(i).padStart(3, '0') };
    const res = await page.request.patch(MAIN + '/api/records/' + (i === 50 ? 'tasks/task-1' : 'contacts/contact-1'), { data: { values } }); expect(res.ok(), String(i)).toBeTruthy();
  }
  const oracle = await page.request.get(MAIN + '/api/v2/changes').then(r => r.json()); expect(oracle.changes.length).toBe(122);
  const expectedIds = oracle.changes.map((c: any) => String(c.id));
  await page.goto(MAIN + '/'); await page.getByRole('button', { name: /^Cambios/ }).click();
  const section = page.locator('section.change-history'); await expect(section.getByRole('heading', { name: 'Historial de operaciones' })).toBeVisible();
  await expect(section).toContainText('122 operaciones locales');
  const seen: string[] = [];
  for (let p = 0; p < 7; p++) {
    await expect(section.locator('.change-history-status p').first()).toHaveText(p === 6 ? '121–122 de 122 operaciones' : (p * 20 + 1) + '–' + (p * 20 + 20) + ' de 122 operaciones');
    seen.push(...await section.locator('details[data-change-id]').evaluateAll(els => els.map(e => e.getAttribute('data-change-id')!)));
    if (p < 6) await section.getByRole('button', { name: 'Siguiente' }).click();
  }
  await expect(section.getByRole('button', { name: 'Siguiente' })).toBeDisabled();
  expect(seen.length, 'sin saltos ni duplicados').toBe(122); expect(new Set(seen).size).toBe(122); expect([...seen].sort((a, b) => Number(a) - Number(b))).toEqual([...expectedIds].sort((a, b) => Number(a) - Number(b)));
  expect(seen[0], 'la primera de la lista es la última operación').toBe(expectedIds.at(-1));
  // Valor largo: se abre por teclado y se muestra íntegro (no una vista previa).
  await section.getByRole('searchbox').fill('cola-unica-073'); await expect(section.locator('.change-history-status p').first()).toHaveText('1–1 de 1 operaciones');
  const row = section.locator('details[data-change-id]').first(); await row.locator('summary').focus(); await page.keyboard.press('Enter'); await expect(row).toHaveAttribute('open', '');
  await expect(row.locator('code').last()).toHaveText(JSON.stringify(longValue));
  for (const viewport of VIEWPORTS) {
    await page.setViewportSize(viewport); await page.waitForTimeout(150);
    const g = await geometry(page, { section: 'section.change-history', summary: 'section.change-history details[data-change-id] summary', filters: '.change-history-filters', value: 'section.change-history details[open] code' });
    console.log('QA073-B2 ' + viewport.width + ' ' + JSON.stringify(g));
    expect(g.doc.scrollWidth, viewport.width + ': sin desplazamiento horizontal').toBeLessThanOrEqual(g.doc.innerWidth);
    expect(g.summary.h, viewport.width + ': la fila es un objetivo táctil ≥ 44 px').toBeGreaterThanOrEqual(44);
    expect(g.value.right, viewport.width + ': el valor largo se ajusta al ancho').toBeLessThanOrEqual(g.doc.innerWidth + 1);
    await page.screenshot({ path: SHOTS + '/b2-history-' + viewport.width + '.png' });
  }
  await page.setViewportSize(VIEWPORTS[0]);
  await page.getByRole('button', { name: 'Limpiar filtros' }).click(); await expect(section.getByRole('searchbox')).toBeFocused();
  expect(w.errors).toEqual([]); expect(w.outside).toEqual([]); expect(w.writes, 'consultar, buscar y paginar no escribe ni hace POST').toEqual([]);
  const after = await page.request.get(MAIN + '/api/v2/changes').then(r => r.json()); expect(after.changes.length).toBe(122); expect(after.watermark).toBe(oracle.watermark);
});

test('B3 conexión: doble clic = una inspección; 60 campos máximo con casillas reales; guardado + lectura fallida; sin scroll interno inesperado', async ({ page }) => {
  assertOrigin(page, MAIN); const w = watch(page, MAIN);
  await setupBackend(page);
  const fields = (prefix: string, n: number) => Array.from({ length: n }, (_, i) => ({ key: prefix + String(i + 1).padStart(3, '0'), label: 'Campo ' + prefix + (i + 1) }));
  const inspected = { accountId: '12345', accountType: 'DEVELOPER_TEST', mode: 'test', fields: { contacts: fields('c', 70), companies: fields('o', 3), deals: [], tasks: [] } };
  const posts: { path: string; body: any }[] = []; let refreshFails = true; let refreshCalls = 0;
  await page.route('**/api/v2/connection/inspect', async route => { posts.push({ path: 'inspect', body: route.request().postDataJSON() }); await new Promise(r => setTimeout(r, 400)); await route.fulfill({ json: inspected }); });
  await page.route('**/api/v2/connection', async route => { if (route.request().method() === 'POST') { posts.push({ path: 'save', body: route.request().postDataJSON() }); return route.fulfill({ json: { saved: true } }); } return route.fallback(); });
  await page.route('**/api/v2/state', route => { refreshCalls++; return refreshFails && posts.some(p => p.path === 'save') ? route.fulfill({ status: 503, json: { error: 'Lectura caída ficticia' } }) : route.fallback(); });
  await page.goto(MAIN + '/'); await page.getByRole('button', { name: /Configurar conexión HubSpot/ }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Conectar HubSpot' }); await expect(dialog).toBeVisible();
  await dialog.getByLabel('ID de cuenta').fill('12345'); await dialog.getByLabel('Service Key o token de lectura').fill('token-ficticio-qa073-0123456789'); await dialog.getByRole('checkbox').check();
  await dialog.getByRole('button', { name: 'Comprobar cuenta y permisos' }).dblclick();
  await expect(dialog.getByText('Portal 12345 · DEVELOPER_TEST · Ensayo')).toBeVisible(); expect(posts.filter(p => p.path === 'inspect').length, 'un doble clic real = una inspección').toBe(1);
  expect(posts[0].body.selectedFields).toEqual({}); expect(posts[0].body.mode).toBe('test');
  const boxes = dialog.locator('fieldset fieldset').first().getByRole('checkbox');
  for (let i = 0; i < 60; i++) await boxes.nth(i).check();
  await expect(dialog.getByText('60 de 60 seleccionados · 70 disponibles')).toBeVisible(); await expect(boxes.nth(60)).toBeDisabled();
  for (const viewport of VIEWPORTS) {
    await page.setViewportSize(viewport); await page.waitForTimeout(150);
    const g = await geometry(page, { outer: '[role="dialog"] fieldset.connection-dialog-fields', inner: '[role="dialog"] fieldset.connection-dialog-fields fieldset', identity: '[role="dialog"] .success-label', save: '[role="dialog"] form > button.primary' });
    console.log('QA073-B3 ' + viewport.width + ' ' + JSON.stringify(g));
    expect(g.doc.scrollWidth, viewport.width + ': sin desplazamiento horizontal').toBeLessThanOrEqual(g.doc.innerWidth);
    expect(g.outer.scrollHeight, viewport.width + ': el fieldset exterior no tiene scroll propio').toBeLessThanOrEqual(g.outer.clientHeight + 1);
    // Las listas de campos son regiones desplazables deliberadas (observación O-C1); lo que no debe ocurrir es que la identidad o las acciones queden dentro de un scroll interno.
    const trapped = await page.evaluate(() => { const hits: string[] = []; for (const css of ['[role="dialog"] .success-label', '[role="dialog"] form > button.primary']) { let el = document.querySelector(css)!.parentElement; while (el && !el.classList.contains('modal')) { const s = getComputedStyle(el); if (/(auto|scroll)/.test(s.overflowY) && el.scrollHeight > el.clientHeight + 1) { if (el.clientHeight < window.innerHeight * 0.5) hits.push(css + ' dentro de ' + el.tagName + '.' + el.className + ' (' + el.clientHeight + ' px)'); } el = el.parentElement; } } return hits; });
    expect(trapped, viewport.width + ': identidad y acción principal no quedan en un scroll interno pequeño (< 50 % del alto de la ventana); el formulario del diálogo sí puede ser el scroll principal').toEqual([]);
    expect(g.inner.clientHeight, viewport.width + ': la región de campos tiene una altura útil (≥ 200 px)').toBeGreaterThanOrEqual(200);
    expect(g.save.h, viewport.width + ': acción principal ≥ 44 px').toBeGreaterThanOrEqual(44);
    await page.screenshot({ path: SHOTS + '/b3-connection-' + viewport.width + '.png' });
  }
  await page.setViewportSize(VIEWPORTS[0]);
  await dialog.getByRole('button', { name: 'Guardar conexión' }).dblclick();
  await expect(dialog.getByRole('heading', { name: 'Conexión guardada' })).toBeVisible(); await expect(dialog.getByRole('alert')).toContainText('La conexión se guardó, pero no se pudo actualizar la pantalla.');
  const saves = posts.filter(p => p.path === 'save'); expect(saves.length, 'doble clic = un solo guardado').toBe(1); expect(saves[0].body.selectedFields.contacts.length).toBe(60);
  await expect(dialog.locator('input')).toHaveCount(0); expect(await dialog.innerHTML()).not.toContain('token-ficticio-qa073');
  await dialog.getByRole('button', { name: 'Reintentar actualización' }).click(); await expect(dialog.getByRole('alert')).toBeVisible();
  expect(posts.filter(p => p.path === 'save').length, 'el reintento solo repite la lectura').toBe(1);
  refreshFails = false; const before = refreshCalls; await dialog.getByRole('button', { name: 'Reintentar actualización' }).click(); await expect(dialog).toBeHidden(); expect(refreshCalls).toBeGreaterThan(before);
  // El backend del fixture sigue sin conexión: la interceptación no escribió nada real.
  const state = await page.request.get(MAIN + '/api/state').then(r => r.json()); expect(state.hubspotConfigured, 'el backend real no tiene conexión').toBe(false);
  expect(w.errors).toEqual([]); expect(w.outside).toEqual([]);
});

test('B5 activación: revisión exacta con backend real, casilla, 409 por cambio posterior, éxito y composición a 1440/390/320', async ({ page }) => {
  assertOrigin(page, MAIN); const w = watch(page, MAIN);
  await setupBackend(page);
  // Oráculo propio: la candidata es "Distribuidora Atlas" (captura distinta de la activa) y sus recuentos salen del fixture explícito.
  const candidateFixture = makeFixture('distribution');
  for (const [url, data] of [['/api/import/snapshot', { snapshot: candidateFixture, replace: true }], ['/api/generate', { mode: 'demo' }]] as const) expect((await page.request.post(MAIN + url, { data })).ok(), url).toBeTruthy();
  const first = await page.request.get(MAIN + '/api/v4/activation-review').then(r => r.json());
  expect(first.kind).toBe('candidate'); expect(first.target.snapshot.name).toBe(candidateFixture.name); expect(first.records).toBe(candidateFixture.records.length); expect(first.canActivate).toBe(true);
  expect(first.target.snapshot.records, 'sin registros individuales').toEqual([]); expect(first.target.snapshot.links).toEqual([]);
  await page.goto(MAIN + '/'); await page.getByRole('button', { name: 'Configurar Plan B', exact: true }).click(); await page.getByRole('button', { name: /Generar/ }).first().click();
  await expect(page.getByText('Versión candidata · todavía no sustituye la copia activa', { exact: false })).toBeVisible(); await expect(page.getByText(candidateFixture.name).first()).toBeVisible();
  await expect(page.getByText('Revisión ' + first.revision.slice(0, 12))).toBeVisible();
  const approval = page.locator('.review-approval input[type="checkbox"]'), activate = page.getByRole('button', { name: /Activar y abrir aplicación/ });
  await expect(approval).not.toBeChecked(); await expect(activate).toBeDisabled();
  for (const viewport of VIEWPORTS) {
    await page.setViewportSize(viewport); await page.waitForTimeout(150);
    const g = await geometry(page, { review: '.preparation-review-identity', approval: '.review-approval', refresh: '.preparation-review-tools button', activate: '.preparation footer button.primary' });
    console.log('QA073-B5 ' + viewport.width + ' ' + JSON.stringify(g));
    expect(g.doc.scrollWidth, viewport.width + ': sin desplazamiento horizontal').toBeLessThanOrEqual(g.doc.innerWidth);
    expect(g.approval.h, viewport.width + ': la casilla de revisión (control nuevo) ≥ 44 px').toBeGreaterThanOrEqual(44); expect(g.refresh.h, viewport.width + ': «Actualizar revisión» (control nuevo) ≥ 44 px').toBeGreaterThanOrEqual(44);
    // QA079 (O-D2 cerrada): en QA073 el botón principal medía 32/40 px; ahora debe medir ≥ 44 px (altura exacta, sin redondear) sin ocultar texto ni provocar desbordes.
    expect(g.activate.hx, viewport.width + ': botón principal «Activar y abrir aplicación» ≥ 44 px (' + g.activate.hx + ')').toBeGreaterThanOrEqual(44);
    const button = page.locator('.preparation footer button.primary'), fit = await button.evaluate(el => { const r = el.getBoundingClientRect(), range = document.createRange(); range.selectNodeContents(el); const t = range.getBoundingClientRect(); return { right: r.right, left: r.left, overflowX: el.scrollWidth - el.clientWidth, overflowY: el.scrollHeight - el.clientHeight, textInside: t.left >= r.left - 1 && t.right <= r.right + 1 && t.top >= r.top - 1 && t.bottom <= r.bottom + 1, text: (el.textContent ?? '').trim(), vw: window.innerWidth }; });
    console.log('QA079-B5 botón principal ' + viewport.width + ' ' + JSON.stringify({ h: g.activate.hx, w: g.activate.wx, ...fit }));
    expect(fit.text, viewport.width + ': el texto del botón sigue completo').toContain('Activar y abrir aplicación'); expect(fit.textInside, viewport.width + ': el texto cabe dentro del botón').toBe(true);
    expect(fit.overflowX, viewport.width + ': el botón no desborda horizontalmente').toBeLessThanOrEqual(0); expect(fit.right, viewport.width + ': el botón cabe en la pantalla').toBeLessThanOrEqual(fit.vw + 0.5); expect(fit.left).toBeGreaterThanOrEqual(-0.5);
    await page.screenshot({ path: SHOTS + '/b5-activation-' + viewport.width + '.png', fullPage: true });
  }
  await page.setViewportSize(VIEWPORTS[0]);
  // Cambio posterior a la revisión (otra candidata): confirmar con la revisión antigua debe fallar con 409 y no activar nada.
  await approval.check(); await expect(activate).toBeEnabled();
  for (const [url, data] of [['/api/import/snapshot', { snapshot: makeFixture('agency'), replace: true }], ['/api/generate', { mode: 'demo' }]] as const) expect((await page.request.post(MAIN + url, { data })).ok(), url).toBeTruthy();
  const second = await page.request.get(MAIN + '/api/v4/activation-review').then(r => r.json()); expect(second.revision).not.toBe(first.revision);
  const before = await page.request.get(MAIN + '/api/state').then(r => r.json());
  await activate.click();
  await expect(page.getByRole('alert').first()).toContainText('La preparación cambió después de revisarla'); await expect(approval).not.toBeChecked();
  const after = await page.request.get(MAIN + '/api/state').then(r => r.json());
  expect(after.candidate, 'no se activó: la candidata sigue pendiente').not.toBeNull(); expect(after.snapshot.id).toBe(before.snapshot.id); expect(after.generation.generatedAt).toBe(before.generation.generatedAt);
  expect(w.writes.filter(x => x.includes('activate')), 'solo la ruta con revisión; nunca /api/activate').toEqual(['POST /api/v4/activate-reviewed']);
  // Revisión vigente tras recargar la lectura: ahora sí se activa, con la revisión mostrada.
  await expect(page.getByText('Revisión ' + second.revision.slice(0, 12))).toBeVisible();
  await approval.check(); await activate.click();
  await expect.poll(async () => (await page.request.get(MAIN + '/api/state').then(r => r.json())).candidate, { timeout: 10000 }).toBeNull();
  const done = await page.request.get(MAIN + '/api/state').then(r => r.json()); expect(done.ready).toBe(true); expect(done.snapshot.name).toBe(makeFixture('agency').name);
  expect(w.errors).toEqual([]); expect(w.outside).toEqual([]);
  const writes = w.writes.filter(x => x.includes('activate')); expect(writes).toEqual(['POST /api/v4/activate-reviewed', 'POST /api/v4/activate-reviewed']);
});

test('B7 acceso: login real con 401 visible y reintento; acuse falso no abre; caracterización del pendiente AUTH_PARENT072 con GET de estado en 503', async ({ browser }) => {
  const gate = await browser.newContext({ viewport: VIEWPORTS[0] }); const page = await gate.newPage(); assertOrigin(page, AUTH); const w = watch(page, AUTH);
  expect((await page.request.post(AUTH + '/api/v2/auth/setup', { data: { password: PASSWORD } })).ok()).toBeTruthy(); await gate.clearCookies();
  await page.goto(AUTH + '/'); await expect(page.getByRole('heading', { name: 'Tu copia está protegida' })).toBeVisible();
  const input = page.getByLabel('Contraseña local'), submit = page.getByRole('button', { name: 'Desbloquear' });
  // 401 real visible y reintentable.
  await input.fill('contrasena-incorrecta-qa073'); await submit.click(); await expect(page.getByRole('alert')).toHaveText('Contraseña incorrecta.'); await expect(page.getByRole('heading', { name: 'Tu copia está protegida' })).toBeVisible();
  // Acuse falso: HTTP 200 con el campo del otro modo no abre la aplicación.
  await page.route('**/api/v2/auth/login', route => route.fulfill({ json: { configured: true } })); await input.fill(PASSWORD); await submit.click();
  await expect(page.getByRole('alert')).toContainText('El servidor no confirmó el desbloqueo de la copia.'); await expect(page.getByRole('heading', { name: 'Tu copia está protegida' })).toBeVisible(); await page.unroute('**/api/v2/auth/login');
  // Pendiente conocido AUTH_PARENT072: login válido + lectura posterior del estado en 503.
  let stateStatus = 0; let stateCalls = 0;
  await page.route('**/api/v2/state', route => { stateCalls++; stateStatus = 503; return route.fulfill({ status: 503, json: { error: 'Estado no disponible ficticio' } }); });
  await input.fill(PASSWORD); await submit.click(); await page.waitForTimeout(1500);
  const heading = (await page.locator('h1').count()) ? await page.locator('h1').first().textContent() : '(sin h1)'; const bodyText = (await page.locator('body').innerText()).replace(/\s+/g, ' ').slice(0, 300);
  console.log('QA073-B7 AUTH_PARENT072: estado GET ' + stateStatus + ' (' + stateCalls + ' llamadas); h1=' + heading + '; pageerrors=' + JSON.stringify(w.errors) + '; texto=' + bodyText);
  await page.screenshot({ path: SHOTS + '/b7-auth-parent072.png' });
  const auth = await page.request.get(AUTH + '/api/v2/auth/status').then(r => r.json()); expect(auth.authenticated, 'el backend sí autenticó: no es un bypass de autenticación').toBe(true);
  expect(w.outside).toEqual([]);
  // Caracterización (no garantía): se registra si el rechazo del refresco queda sin atender.
  test.info().annotations.push({ type: 'AUTH_PARENT072', description: 'pageerrors=' + w.errors.length + ' h1=' + heading });
  await gate.close();
});

test('B6 devolución manual (rama de producción CONTRAFACTUAL: solo se falsea el flag de origen mostrado): doble clic = una comprobación; el backend queda intacto', async ({ page }) => {
  assertOrigin(page, MAIN); const w = watch(page, MAIN);
  await setupBackend(page);
  for (const n of ['A', 'B']) expect((await page.request.post(MAIN + '/api/records/contacts', { data: { values: { firstname: 'Alta' + n + '073', email: n.toLowerCase() + '073@example.invalid' } } })).ok()).toBeTruthy();
  expect((await page.request.patch(MAIN + '/api/records/contacts/contact-1', { data: { values: { phone: '700 123 073' } } })).ok()).toBeTruthy();
  const real = await page.request.get(MAIN + '/api/v2/changes').then(r => r.json()); expect(real.changes.length).toBe(3); expect(real.watermark).toBe(0); expect(real.manualReport).toBeNull();
  const backendBefore = await page.request.get(MAIN + '/api/state').then(r => r.json()); expect(backendBefore.snapshot.source.isTestData, 'el backend real es de ensayo').toBe(true);
  // Contrafactual: el navegador ve isTestData:false para alcanzar la rama de producción. NO es un portal real.
  await page.route('**/api/v2/state', async route => { const res = await route.fetch(); const body = await res.json(); body.snapshot.source.isTestData = false; await route.fulfill({ response: res, json: body }); });
  const verifies: any[] = [];
  await page.route('**/api/v3/manual-recovery/verify', async route => {
    const body = route.request().postDataJSON(); verifies.push(body); await new Promise(r => setTimeout(r, 400));
    const identities = [...new Map(real.changes.map((c: any) => [JSON.stringify([c.entity, c.recordId]), c])).values()] as any[];
    await route.fulfill({ json: { passed: true, checks: identities.map(c => ({ entity: c.entity, localId: c.recordId, passed: true, reason: 'Valores y relaciones confirmados por lectura (simulado).' })), report: { id: 'informe-contrafactual-073', method: 'manual_verified', revision: real.revision, sessionId: 'sesion-contrafactual', captureId: 'captura-contrafactual', watermark: Math.max(...real.changes.map((c: any) => c.id)), verifiedAt: '2026-10-30T10:00:00.000Z', records: identities.length } } });
  });
  await page.goto(MAIN + '/'); await page.getByRole('button', { name: /^Cambios/ }).click();
  const section = page.locator('section.manual-recovery'); await expect(section.getByRole('heading', { name: 'Recuperación manual verificada' })).toBeVisible();
  await expect(section).toContainText('3 operaciones pendientes · 3 registros por comprobar');
  const boxes = section.locator('input[inputmode="numeric"]'); await expect(boxes).toHaveCount(2);
  const approval = section.getByRole('checkbox'), verify = section.getByRole('button', { name: 'Comprobar resultado en HubSpot' });
  await boxes.nth(0).fill('501'); await boxes.nth(1).fill('501'); await expect(section).toContainText('Dos altas de la misma entidad no pueden compartir el ID remoto'); await expect(approval).toBeDisabled();
  // QA079 (M1): una forma con ceros iniciales es inválida como entrada nueva en la interfaz real; no se convierte a otro ID. No se afirma nada sobre cómo la resuelve HubSpot.
  await boxes.nth(1).fill('0501'); await expect(section).toContainText('sin ceros iniciales'); await expect(approval).toBeDisabled(); await expect(verify).toBeDisabled(); await expect(boxes.nth(1)).toHaveValue('0501');
  await boxes.nth(0).fill('9007199254740992'); await boxes.nth(1).fill('9007199254740993'); await expect(section).not.toContainText('Dos altas de la misma entidad'); await expect(approval).toBeEnabled();   // IDs grandes distintos: válidos
  await expect(approval).toBeEnabled(); await approval.check(); await expect(verify).toBeEnabled();   // con los dos IDs grandes y distintos de arriba
  for (const viewport of VIEWPORTS) {
    await page.setViewportSize(viewport); await page.waitForTimeout(150);
    const g = await geometry(page, { section: 'section.manual-recovery', input: 'section.manual-recovery input[inputmode="numeric"]', verify: 'section.manual-recovery button.primary' });
    console.log('QA073-B6 ' + viewport.width + ' ' + JSON.stringify(g));
    expect(g.doc.scrollWidth, viewport.width + ': sin desplazamiento horizontal').toBeLessThanOrEqual(g.doc.innerWidth);
    expect(g.input.h, viewport.width + ': campo de ID remoto ≥ 44 px').toBeGreaterThanOrEqual(44);
    await page.screenshot({ path: SHOTS + '/b6-manual-' + viewport.width + '.png' });
  }
  await page.setViewportSize(VIEWPORTS[0]);
  await verify.dblclick(); await expect(section.getByRole('status')).toContainText('El servidor confirmó la comprobación de esta revisión.');
  expect(verifies.length, 'doble clic real = una comprobación').toBe(1); expect(verifies[0].mapping.length).toBe(2); expect(verifies[0].mapping.map((m: { remoteId: string }) => m.remoteId), 'IDs grandes exactos, como texto').toEqual(['9007199254740992', '9007199254740993']); expect(verifies[0].reviewed).toBe(true); expect(verifies[0].revision).toBe(real.revision);
  // Backend real: nada cambió (la interceptación no escribió, no hay conexión, la marca sigue en 0).
  const after = await page.request.get(MAIN + '/api/v2/changes').then(r => r.json()); expect(after.watermark).toBe(0); expect(after.manualReport).toBeNull(); expect(after.changes.length).toBe(3);
  const backendAfter = await page.request.get(MAIN + '/api/state').then(r => r.json()); expect(backendAfter.snapshot.source.isTestData).toBe(true); expect(backendAfter.hubspotConfigured).toBe(false);
  expect(w.errors).toEqual([]); expect(w.outside).toEqual([]);
  expect(w.writes.filter(x => !/manual-recovery\/verify$/.test(x)), 'la UI solo envió la comprobación interceptada').toEqual([]);
});
