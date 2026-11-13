import { test, expect, type Page } from '@playwright/test';
import { resolve } from 'node:path';

const password = 'fixture-search053-password';
async function open(page: Page) {
  const errors: string[] = [], outside: string[] = [], searchWrites: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.route('**/*', route => {
    const request = route.request(), url = new URL(request.url());
    if (url.hostname !== '127.0.0.1') { outside.push(url.origin); return route.abort(); }
    if (/\/api\/v2\/search/.test(url.pathname) && request.method() !== 'GET') searchWrites.push(request.method());
    return route.fallback();
  });
  const gate = await page.request.get('/api/v2/auth/status').then(r => r.json());
  const auth = await page.request.post('/api/v2/auth/' + (gate.configured ? 'login' : 'setup'), { data: { password } }); expect(auth.ok()).toBeTruthy();
  await page.goto('/'); await expect(page).toHaveTitle('Plan B · Tu CRM sigue contigo');
  await page.getByRole('button', { name: 'Continuidad', exact: true }).click(); await expect(page.getByRole('heading', { name: 'Tu negocio puede seguir.' })).toBeVisible();
  await page.getByRole('button', { name: 'Buscar en toda la copia', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Buscar en toda la copia', exact: true }); await expect(dialog).toBeVisible();
  const input = dialog.getByRole('searchbox', { name: 'Buscar en toda la copia' }); await expect(input).toBeFocused();
  return { dialog, input, errors, outside, searchWrites };
}

test('global search: real API, four entity types, complete facets, keyboard focus and mobile page bounds', async ({ page }) => {
  const { dialog, input, errors, outside, searchWrites } = await open(page);
  await input.fill('clave053'); await expect(dialog.getByRole('status')).toContainText('5 resultados');
  const results = dialog.getByRole('list', { name: 'Resultados de la búsqueda global' });
  for (const label of ['Clientes', 'Empresas', 'Oportunidades', 'Tareas']) await expect(results.getByText(label, { exact: true }).first()).toBeVisible();
  await expect(dialog.getByText(/Revisión .*Los recuentos/)).toBeVisible();
  await dialog.getByLabel('Tipo de registro').selectOption('companies'); await expect(dialog.getByRole('status')).toContainText('1 resultados');
  await expect(results.getByRole('button')).toHaveCount(1);
  await dialog.getByLabel('Tipo de registro').selectOption('all'); await expect(results.getByRole('button')).toHaveCount(5);
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 900 }); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
    const box = await dialog.boundingBox(); expect(box!.x).toBeGreaterThanOrEqual(0); expect(box!.x + box!.width).toBeLessThanOrEqual(width + 1);
    await page.screenshot({ path: resolve(process.env.PLANB_EVIDENCE_DIR!, 'search053-' + width + '.png'), fullPage: false });
  }
  await input.focus(); await page.keyboard.press('Shift+Tab'); await expect(dialog.getByRole('button', { name: 'Cerrar búsqueda global' })).toBeFocused();
  await page.keyboard.press('Shift+Tab'); await expect(results.getByRole('button').last()).toBeFocused();
  await page.keyboard.press('Escape'); await expect(dialog).toBeHidden();
  await expect(page.getByRole('button', { name: 'Buscar en toda la copia', exact: true })).toBeFocused();
  await page.keyboard.press('Control+k'); await expect(dialog).toBeVisible();
  expect(errors).toEqual([]); expect(outside).toEqual([]); expect(searchWrites).toEqual([]);
});

test('global search: homonyms open by entity and ID, with full current values instead of clipped previews', async ({ page }) => {
  const { dialog, input } = await open(page);
  await input.fill('ÁLVARO GEMELO'); await expect(dialog.getByRole('listitem')).toHaveCount(2);
  await expect(dialog.getByRole('button').filter({ hasText: 'ID contact-1' })).toBeVisible();
  await dialog.getByRole('button').filter({ hasText: 'ID contact-2' }).click();
  await expect(dialog).toBeHidden();
  const editor = page.getByRole('dialog', { name: 'Álvaro Clave053 Gemelo', exact: true }); await expect(editor).toBeVisible();
  await expect(editor.getByLabel('Teléfono', { exact: true })).toHaveValue('2'.repeat(400) + '-full-current-053');
  await editor.getByRole('button', { name: 'Cerrar edición' }).click();
  await expect(editor).toBeHidden(); await expect(page.getByRole('heading', { name: 'Clientes', exact: true })).toBeVisible();
});

test('global search: pagination and no-results state use actual counts and retain the query', async ({ page }) => {
  const { dialog, input } = await open(page);
  await input.fill('Listado053'); await expect(dialog.getByRole('status')).toContainText('1–20 de 26');
  await dialog.getByRole('button', { name: 'Siguiente', exact: true }).click(); await expect(dialog.getByRole('status')).toContainText('21–26 de 26');
  await expect(dialog.getByRole('listitem')).toHaveCount(6); await expect(dialog.getByRole('button', { name: 'Siguiente', exact: true })).toBeDisabled();
  await input.fill('sin coincidencia 053'); await expect(dialog.getByRole('status')).toHaveText('No hay resultados para esta búsqueda.');
  await expect(input).toHaveValue('sin coincidencia 053'); await expect(dialog.getByRole('listitem')).toHaveCount(0);
});

test('global search: obsolete response is discarded after query change and closing the dialog', async ({ page }) => {
  let release!: () => void; const gate = new Promise<void>(resolve => { release = resolve; }); let held = false;
  await page.route('**/api/v2/search?*', async route => {
    if (new URL(route.request().url()).searchParams.get('q') === 'antigua053') { held = true; await gate; try { await route.fulfill({ json: { source: {}, items: [{ label: 'OLD-RESULT-053' }] } }); } catch { /* browser aborted old request */ } }
    else await route.fallback();
  });
  const { dialog, input } = await open(page); await input.fill('antigua053'); await expect.poll(() => held).toBeTruthy();
  await input.fill('clave053'); await expect(dialog.getByRole('listitem')).toHaveCount(5); release();
  await expect(dialog.getByText('OLD-RESULT-053')).toHaveCount(0);
  await page.keyboard.press('Escape'); await expect(dialog).toBeHidden();
});

test('global search: stale record opening is rejected and refreshing reads the changed revision', async ({ page }) => {
  const { dialog, input } = await open(page); await dialog.getByLabel('Tipo de registro').selectOption('companies'); await input.fill('company-1');
  await expect(dialog.getByRole('listitem')).toHaveCount(1);
  const changed = await page.request.patch('/api/records/companies/company-1', { data: { values: { phone: 'fixture-change-during-search-053' } } }); expect(changed.ok()).toBeTruthy();
  await dialog.getByRole('listitem').getByRole('button').click(); await expect(dialog.getByRole('alert')).toContainText('La copia cambió');
  await expect(page.getByRole('dialog')).toHaveCount(1);
  await dialog.getByRole('button', { name: 'Actualizar resultados', exact: true }).click(); await expect(dialog.getByRole('alert')).toHaveCount(0);
  await dialog.getByRole('listitem').getByRole('button').click(); await expect(dialog).toBeHidden();
  const editor = page.getByRole('dialog'); await expect(editor.getByLabel('Teléfono', { exact: true })).toHaveValue('fixture-change-during-search-053');
});

test('global search: old-server 404 and session 401 never leave search results visible', async ({ page }) => {
  const { dialog, input } = await open(page);
  await page.route('**/api/v2/search?*', route => route.fulfill({ status: 404, json: { error: 'Operación no disponible en esta aplicación.' } }));
  await input.fill('clave053'); await expect(dialog.getByRole('alert')).toContainText('no incluye la búsqueda global'); await expect(dialog.getByRole('listitem')).toHaveCount(0);
  await page.unroute('**/api/v2/search?*'); await dialog.getByRole('button', { name: 'Reintentar búsqueda' }).click(); await expect(dialog.getByRole('listitem')).toHaveCount(5);
  await page.request.post('/api/v2/auth/lock', { data: {} });
  await dialog.getByRole('button', { name: 'Actualizar búsqueda' }).click(); await expect(dialog).toBeHidden();
  await expect(page.getByRole('heading', { name: 'Tu copia está protegida' })).toBeVisible();
  await expect(page.getByRole('list', { name: 'Resultados de la búsqueda global' })).toHaveCount(0);
});
