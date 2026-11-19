import { test, expect } from '@playwright/test';

const origin = process.env.PLANB_OPERATIONS118_URL;
test.beforeEach(async ({ page }) => {
  if (!origin) throw new Error('PLANB_OPERATIONS118_URL debe apuntar al servidor ficticio propio.');
  await page.route('**/*', route => route.request().url().startsWith(origin + '/') ? route.continue() : route.abort());
  await page.goto(origin);
  await expect(page.getByRole('heading', { name: 'Hoy', exact: true })).toBeVisible();
  await expect(page.getByText('Tareas en la copia', { exact: true })).toBeVisible();
});
test('imported data shows actual tasks and preparation callback without agent simulation', async ({ page }) => {
  await expect(page.getByText('Captura importada · pendiente de activar', { exact: true })).toBeVisible();
  await expect(page.locator('.lop-tasks li').first()).toBeVisible();
  await page.getByRole('button', { name: 'Continuar preparación' }).click();
  await expect(page.getByTestId('last-action')).toHaveText('prepare');
  await page.getByRole('searchbox', { name: 'Buscar en las tareas mostradas' }).fill('no-existe-118');
  await expect(page.getByText('No hay coincidencias entre las tareas mostradas.')).toBeVisible();
});
test('local review has real receipt; failed reload never repeats POST', async ({ page }) => {
  await page.getByRole('button', { name: 'Ver Agentes', exact: true }).click();
  let posts = 0, failRead = false;
  await page.route('**/api/v7/local-operations/reviews', async route => { posts++; await route.continue(); failRead = true; });
  await page.route('**/api/v7/local-operations', route => failRead ? route.fulfill({ status: 503, json: { error: 'Lectura temporalmente indisponible' } }) : route.continue());
  await page.getByRole('button', { name: 'Revisar mi copia', exact: true }).click();
  await expect(page.locator('.lop').getByRole('status')).toContainText('Revisión local guardada');
  await expect(page.locator('.lop').getByRole('status')).toContainText('no se pudo actualizar');
  expect(posts).toBe(1);
  failRead = false; await page.getByRole('button', { name: 'Reintentar lectura', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveCount(0); expect(posts).toBe(1);
});
test('a genuine read error offers retry and recovers', async ({ page }) => {
  await page.route('**/api/v7/local-operations', route => route.fulfill({ status: 503, json: { error: 'Copia no disponible' } }));
  await page.getByRole('button', { name: 'Actualizar', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Copia no disponible');
  await page.unroute('**/api/v7/local-operations');
  await page.getByRole('button', { name: 'Reintentar lectura', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveCount(0);
});
for (const width of [1440, 390, 320]) test('responsive tasks and keyboard disclosure at ' + width, async ({ page }) => {
  await page.setViewportSize({ width, height: 950 });
  const summary = page.getByText('Cómo se calcula y qué incluye', { exact: true });
  await summary.focus(); await page.keyboard.press('Enter');
  await expect(page.locator('.lop-details')).toHaveAttribute('open', '');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const folder = process.env.PLANB_OPERATIONS118_EVIDENCE;
  if (folder) await page.screenshot({ path: folder + '/operations-' + width + '.png', fullPage: true });
});
