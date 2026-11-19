import { test, expect, type Page } from '@playwright/test';
import path from 'node:path';
import { startSearchKeyboardFixture } from '../helpers/workspace-search-keyboard-harness.js';
let fixture: Awaited<ReturnType<typeof startSearchKeyboardFixture>>, errors: string[], outside: string[], writes: string[];
test.beforeAll(async () => { fixture = await startSearchKeyboardFixture(); });
test.afterAll(async () => { await fixture?.close(); });
test.beforeEach(async ({ page }) => {
  errors = []; outside = []; writes = [];
  page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (['error','warning'].includes(m.type())) errors.push(m.text()); });
  page.on('request', r => { if (!['GET','HEAD'].includes(r.method())) writes.push(r.method() + ' ' + new URL(r.url()).pathname); });
  await page.route('**/*', route => { if (new URL(route.request().url()).origin !== fixture.url) { outside.push(route.request().url()); return route.abort(); } return route.fallback(); });
});
test.afterEach(async ({ page }) => { expect(errors).toEqual([]); expect(outside).toEqual([]); expect(writes).toEqual([]); expect((await page.request.get(fixture.url + '/api/v2/state').then(r => r.json())).changes).toBe(0); });
async function open(page: Page, query = 'Teclado189') {
  await page.goto(fixture.url); await expect(page).toHaveTitle('Plan B · Tu CRM sigue contigo'); await expect(page.locator('main')).toContainText('Teclado189'); expect(await page.locator('vite-error-overlay,.global-error').count()).toBe(0);
  await page.getByRole('button', { name: 'Buscar en toda la copia', exact: true }).focus(); await page.keyboard.press('Control+k'); const dialog = page.getByRole('dialog', { name: 'Buscar en toda la copia', exact: true }); await expect(dialog).toBeVisible(); const input = dialog.getByRole('searchbox'); await expect(input).toBeFocused(); await input.fill(query); const results = dialog.locator('.workspace-search-hit'); await expect(results.first()).toBeVisible(); return { dialog, input, results };
}

test('189: flechas desde el campo y resultados, Inicio/Fin y vuelta a editar', async ({ page }) => {
  const { input, results } = await open(page); await expect(results).toHaveCount(20);
  await input.press('ArrowDown'); await expect(results.first()).toBeFocused();
  await page.keyboard.press('ArrowDown'); await expect(results.nth(1)).toBeFocused(); await page.keyboard.press('End'); await expect(results.last()).toBeFocused();
  await page.keyboard.press('Home'); await expect(results.first()).toBeFocused(); await page.keyboard.press('ArrowUp'); await expect(input).toBeFocused();
  await input.press('ArrowUp'); await expect(results.last()).toBeFocused(); await page.keyboard.press('ArrowDown'); await expect(results.last()).toBeFocused();
  await input.focus(); await input.press('Home'); await expect(input).toBeFocused(); expect(await input.evaluate(el => (el as HTMLInputElement).selectionStart)).toBe(0);
  await page.keyboard.press('Escape'); await expect(page.getByRole('dialog')).toHaveCount(0); await expect(page.getByRole('button', { name: 'Buscar en toda la copia', exact: true })).toBeFocused();
});

test('189: Enter abre el segundo homónimo por ID y revisión, sin escribir', async ({ page }) => {
  const { dialog, input, results } = await open(page, 'Gemelo'); await expect(results).toHaveCount(2); await expect(results.nth(1)).toContainText('ID contact-2');
  await input.press('ArrowDown'); await page.keyboard.press('ArrowDown'); await expect(results.nth(1)).toBeFocused();
  const request = page.waitForRequest(r => new URL(r.url()).pathname === '/api/v2/search-record'); await page.keyboard.press('Enter'); const opened = new URL((await request).url()); expect(opened.searchParams.get('id')).toBe('contact-2'); expect(opened.searchParams.get('revision')).toMatch(/^[a-f0-9]{64}$/);
  await expect(dialog).toBeHidden(); const drawer = page.locator('.record-drawer'); await expect(drawer).toBeVisible(); await expect(drawer.getByRole('textbox', { name: 'Correo *', exact: true })).toHaveValue(String(fixture.contact2.values.email));
});

test('189: paginar y filtrar recorre únicamente las filas nuevas', async ({ page }) => {
  const { dialog, input, results } = await open(page); await expect(dialog.getByRole('status')).toContainText('1–20 de 25'); const oldIds = await results.locator('small').filter({ hasText: /^ID / }).allTextContents();
  await dialog.getByRole('button', { name: 'Siguiente', exact: true }).click(); await expect(dialog.getByRole('status')).toContainText('21–25 de 25'); await expect(results).toHaveCount(5); const newIds = await results.locator('small').filter({ hasText: /^ID / }).allTextContents(); expect(newIds.every(id => !oldIds.includes(id))).toBe(true);
  await input.focus(); await input.press('ArrowDown'); await expect(results.first()).toBeFocused(); await page.keyboard.press('End'); await expect(results.last()).toBeFocused();
  await dialog.getByLabel('Tipo de registro').selectOption('companies'); await expect(results).toHaveCount(1); await expect(results.first()).toContainText('ID company-1'); await input.focus(); await input.press('ArrowDown'); await expect(results.first()).toBeFocused();
});

test('189: carga retenida y teclas de edición no activan resultados anteriores', async ({ page }) => {
  const { dialog, input, results } = await open(page); await dialog.getByLabel('Tipo de registro').selectOption('companies'); await expect(results).toHaveCount(1); let release!: () => void, enter!: () => void; const held = new Promise<void>(r => { release = r; }), entered = new Promise<void>(r => { enter = r; }); let openings = 0;
  page.on('request', r => { if (new URL(r.url()).pathname === '/api/v2/search-record') openings++; });
  await page.route('**/api/v2/search?*', async route => { if (new URL(route.request().url()).searchParams.get('q') !== 'company-1') return route.fallback(); const response = await route.fetch(); enter(); await held; await route.fulfill({ response }).catch(() => {}); });
  try { await input.fill('company-1'); await entered; await expect(results).toHaveCount(0); await input.press('ArrowDown'); await expect(input).toBeFocused(); await input.press('Enter'); expect(openings).toBe(0); release(); await expect(results).toHaveCount(1);
    const consumed = await input.evaluate(el => { const e = new KeyboardEvent('keydown', { key: 'ArrowDown', isComposing: true, bubbles: true, cancelable: true }); el.dispatchEvent(e); return e.defaultPrevented; }); expect(consumed).toBe(false); await expect(input).toBeFocused();
    await input.press('Control+ArrowDown'); await expect(input).toBeFocused(); await input.press('ArrowDown'); await expect(results.first()).toBeFocused();
  } finally { release(); }
});

test('189: apertura por teclado conserva el rechazo de otra cuenta', async ({ page }) => {
  await page.route('**/api/v2/search-record?*', async route => { const response = await route.fetch(), body = await response.json(); body.source.accountId = 'foreign-fiction189'; await route.fulfill({ response, json: body }); });
  const { dialog, input, results } = await open(page, 'contact-1'); await input.press('ArrowDown'); await expect(results.first()).toBeFocused(); await page.keyboard.press('Enter'); await expect(dialog.getByRole('alert')).toContainText('no corresponde'); await expect(page.locator('.record-drawer')).toHaveCount(0);
});

test('189: foco visible, Tab y geometría1440/390/320', async ({ page }) => {
  const { dialog, input, results } = await open(page, 'Gemelo');
  for (const width of [1440,390,320]) { await page.setViewportSize({ width, height: 1000 }); await input.focus(); await input.press('ArrowDown'); await expect(results.first()).toBeFocused(); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); const box = await dialog.boundingBox(); expect(box!.x).toBeGreaterThanOrEqual(0); expect(box!.x + box!.width).toBeLessThanOrEqual(width + 1); expect((await results.first().boundingBox())!.height).toBeGreaterThanOrEqual(44); expect(await results.first().evaluate(el => getComputedStyle(el).outlineStyle)).not.toBe('none'); await page.screenshot({ path: path.join(process.env.PLANB_K189_EVIDENCE!, 'keyboard189-' + width + '.png') }); }
  await input.focus(); await page.keyboard.press('Shift+Tab'); await expect(dialog.getByRole('button', { name: 'Cerrar búsqueda global' })).toBeFocused(); await page.keyboard.press('Shift+Tab'); await expect(results.last()).toBeFocused(); await page.keyboard.press('Escape'); await expect(dialog).toBeHidden();
});
