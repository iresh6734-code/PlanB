import { test, expect, type Page } from '@playwright/test';
import { resolve } from 'node:path';

const readyOrigin = 'http://127.0.0.1:4581';
const emptyOrigin = 'http://127.0.0.1:4582';
const evidence = process.env.PLANB_NAV117_EVIDENCE;
const browserLogs = new WeakMap<Page, { level: string; text: string; url: string }[]>();
const prep = (page: Page) => page.locator('.sidebar').getByRole('button', { name: 'Preparación', exact: true });
const sections = (page: Page) => page.getByRole('navigation', { name: 'Secciones de preparación' });
test.afterEach(async ({ page }, info) => {
  await info.attach('browser-console', { body: JSON.stringify(browserLogs.get(page) ?? [], null, 2), contentType: 'application/json' });
});

async function open(page: Page, origin = readyOrigin) {
  if (!evidence || test.info().project.use.baseURL !== readyOrigin) throw Error('Requires the private117 fixture/config; never target an existing user app.');
  const errors: string[] = [], outside: string[] = [], mutations: string[] = [];
  if (!browserLogs.has(page)) {
    const logs: { level: string; text: string; url: string }[] = []; browserLogs.set(page, logs);
    page.on('console', message => { if (['error', 'warning'].includes(message.type())) logs.push({ level: message.type(), text: message.text(), url: message.location().url }); });
  }
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => {
    if (request.url().startsWith(origin + '/api/') && !['GET', 'HEAD'].includes(request.method())) mutations.push(request.method() + ' ' + new URL(request.url()).pathname);
  });
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin !== origin) { outside.push(url.origin); return route.abort(); }
    return route.fallback();
  });
  await page.goto(origin + '/');
  await expect(page).toHaveTitle('Plan B · Tu CRM sigue contigo');
  await expect(prep(page)).toBeVisible();
  return { errors, outside, mutations };
}

test('preparation navigation remains available, collapses with keyboard, preserves the current draft and makes no writes', async ({ page }) => {
  const seen = await open(page);
  const before = await page.request.get(readyOrigin + '/api/v2/state').then(r => r.json());
  await expect(prep(page)).toHaveAttribute('aria-expanded', 'false');
  await expect(sections(page)).toHaveCount(0);
  await prep(page).focus(); await page.keyboard.press('Enter');
  await expect(prep(page)).toHaveAttribute('aria-expanded', 'true');
  await expect(sections(page).getByRole('button')).toHaveCount(3);
  await expect(page.locator('.sidebar').getByRole('button', { name: 'Exportar', exact: true })).toHaveCount(1);
  await sections(page).getByRole('button', { name: 'Procesos', exact: true }).click();
  const draft = page.getByRole('textbox', { name: '¿Qué más debe respetar la aplicación?' });
  await draft.fill('Borrador local de navegación117 sin enviar a un proveedor.');
  await prep(page).focus(); await page.keyboard.press('Space');
  await expect(prep(page)).toHaveAttribute('aria-expanded', 'false');
  await expect(sections(page)).toHaveCount(0);
  await expect(draft).toHaveValue('Borrador local de navegación117 sin enviar a un proveedor.');
  await page.keyboard.press('Tab');
  expect(await page.locator(':focus').evaluate(element => element.closest('.preparation-subnav') === null)).toBe(true);
  await prep(page).focus(); await page.keyboard.press('Enter');
  await expect(sections(page).getByRole('button', { name: 'Procesos', exact: true })).toHaveAttribute('aria-current', 'step');
  await expect(draft).toHaveValue('Borrador local de navegación117 sin enviar a un proveedor.');
  await page.screenshot({ path: resolve(evidence!, 'preparation-open-1440.png'), fullPage: false });
  await page.locator('.sidebar').getByRole('button', { name: 'Continuidad', exact: true }).click();
  await expect(prep(page)).toHaveAttribute('aria-expanded', 'false');
  await expect(sections(page)).toHaveCount(0);
  await prep(page).click();
  await expect(sections(page).getByRole('button', { name: 'Procesos', exact: true })).toHaveAttribute('aria-current', 'step');
  await sections(page).getByRole('button', { name: 'Generar', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Revisa tu aplicación.', exact: true })).toBeVisible();
  await prep(page).click();
  await page.screenshot({ path: resolve(evidence!, 'preparation-collapsed-1440.png'), fullPage: false });
  const after = await page.request.get(readyOrigin + '/api/v2/state').then(r => r.json());
  expect(after).toEqual(before);
  expect(seen.mutations).toEqual([]); expect(seen.errors).toEqual([]); expect(seen.outside).toEqual([]);
});

for (const width of [390, 320]) test(`preparation navigation at${width} fits, keeps touch targets and does not hide work navigation`, async ({ page }) => {
  await page.setViewportSize({ width, height: 950 });
  const seen = await open(page);
  await prep(page).click();
  await sections(page).getByRole('button', { name: 'Origen', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Empieza con un CRM de ensayo', exact: true })).toBeVisible();
  for (const control of [prep(page), ...await sections(page).getByRole('button').all()]) {
    const box = await control.boundingBox(); expect(box).not.toBeNull();
    expect(box!.height).toBeGreaterThanOrEqual(44); expect(box!.x).toBeGreaterThanOrEqual(0); expect(box!.x + box!.width).toBeLessThanOrEqual(width);
    expect(await control.evaluate(element => element.scrollWidth <= element.clientWidth + 1), 'el texto del control no sobresale de su propia caja').toBe(true);
  }
  const controls = [prep(page), ...await sections(page).getByRole('button').all(), page.locator('.sidebar').getByRole('button', { name: 'Abrir aplicación', exact: true }), page.locator('.sidebar').getByRole('button', { name: 'Exportar', exact: true })];
  const boxes = await Promise.all(controls.map(control => control.boundingBox()));
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
    const a = boxes[i]!, b = boxes[j]!;
    expect(a.x < b.x + b.width - 1 && b.x < a.x + a.width - 1 && a.y < b.y + b.height - 1 && b.y < a.y + a.height - 1, 'los controles de navegación no se solapan').toBe(false);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: resolve(evidence!, `preparation-open-${width}.png`), fullPage: false });
  await prep(page).focus(); await page.keyboard.press('Space');
  await expect(sections(page)).toHaveCount(0); await expect(prep(page)).toBeFocused();
  await page.locator('.sidebar').getByRole('button', { name: 'Trabajar', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Clientes', exact: true })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Secciones de trabajo' }).getByRole('button', { name: 'Clientes', exact: true })).toBeVisible();
  await expect(prep(page)).toHaveAttribute('aria-expanded', 'false');
  expect(seen.mutations).toEqual([]); expect(seen.errors).toEqual([]); expect(seen.outside).toEqual([]);
});

test('an empty copy starts collapsed and cannot navigate to processes or generation without a capture', async ({ page }) => {
  const seen = await open(page, emptyOrigin);
  await expect(prep(page)).toHaveAttribute('aria-expanded', 'false');
  await prep(page).click();
  await expect(sections(page).getByRole('button', { name: 'Origen', exact: true })).toBeEnabled();
  await expect(sections(page).getByRole('button', { name: 'Procesos', exact: true })).toBeDisabled();
  await expect(sections(page).getByRole('button', { name: 'Generar', exact: true })).toBeDisabled();
  await expect(page.locator('.sidebar').getByRole('button', { name: 'Exportar', exact: true })).toBeDisabled();
  await prep(page).click(); await expect(sections(page)).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Empieza con un CRM de ensayo', exact: true })).toBeVisible();
  expect(seen.mutations).toEqual([]); expect(seen.errors).toEqual([]); expect(seen.outside).toEqual([]);
});

test('main App: imported tasks appear in Hoy and a saved review survives a failed reload without another POST', async ({ page }) => {
  const origin = 'http://127.0.0.1:4584';
  const seen = await open(page, origin);
  await page.locator('.sidebar').getByRole('button', { name: 'Hoy', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Hoy', exact: true })).toBeVisible();
  await expect(page.getByText('Captura importada · pendiente de activar', { exact: true })).toBeVisible();
  await expect(page.locator('.lop-tasks li')).toHaveCount(14);
  await expect(page.getByRole('button', { name: 'Abrir tareas', exact: true })).toHaveCount(0);
  await page.locator('.sidebar').getByRole('button', { name: 'Agentes', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Agentes y revisiones', exact: true })).toBeVisible();
  let posts = 0, failRead = false;
  await page.route('**/api/v7/local-operations/reviews', async route => {
    posts++;
    const response = await route.fetch();
    failRead = true;
    await route.fulfill({ response });
  });
  await page.route('**/api/v7/local-operations', route => failRead ? route.fulfill({ status: 503, json: { error: 'Lectura interrumpida en el ensayo117.' } }) : route.fallback());
  await page.getByRole('button', { name: 'Revisar mi copia', exact: true }).click();
  await expect(page.locator('.lop-confirmation')).toContainText('Revisión local guardada:');
  await expect(page.locator('.lop-confirmation')).toContainText('no se pudo actualizar la pantalla');
  expect(posts).toBe(1);
  failRead = false;
  await page.getByRole('button', { name: 'Reintentar lectura', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveCount(0);
  expect(posts).toBe(1);
  await page.locator('.sidebar').getByRole('button', { name: 'Hoy', exact: true }).click();
  await expect(page.locator('.lop-confirmation')).toContainText('Revisión local guardada:');
  await expect(page.locator('.lop-tasks li')).toHaveCount(14);
  await page.screenshot({ path: resolve(evidence!, 'main-imported-today-1440.png'), fullPage: false });
  await page.getByRole('button', { name: 'Continuar preparación', exact: true }).click();
  await expect(prep(page)).toHaveAttribute('aria-expanded', 'true');
  await expect(sections(page).getByRole('button', { name: 'Origen', exact: true })).toHaveAttribute('aria-current', 'step');
  expect(seen.errors).toEqual([]); expect(seen.outside).toEqual([]);
  expect(seen.mutations).toEqual(['POST /api/v7/local-operations/reviews']);
});

test('main App: active Hoy opens the actual task and opportunity workspaces; empty Hoy has a preparation action', async ({ page }) => {
  const seen = await open(page);
  await page.locator('.sidebar').getByRole('button', { name: 'Hoy', exact: true }).click();
  await expect(page.locator('.lop-tasks li')).toHaveCount(14);
  await page.getByRole('button', { name: 'Abrir tareas', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Tareas', exact: true })).toBeVisible();
  await expect(page.locator('.workspace tbody tr')).toHaveCount(18);
  await page.locator('.sidebar').getByRole('button', { name: 'Agentes', exact: true }).click();
  await page.getByRole('button', { name: 'Abrir oportunidades', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Oportunidades', exact: true })).toBeVisible();
  await page.locator('.sidebar').getByRole('button', { name: 'Buscar en toda la copia', exact: true }).click();
  const search = page.getByRole('dialog', { name: 'Buscar en toda la copia', exact: true });
  await search.getByRole('searchbox', { name: 'Buscar en toda la copia' }).fill('Lucía');
  const target = search.getByRole('button').filter({ hasText: 'ID contact-1' });
  await expect(target).toBeVisible(); await target.click();
  await expect(search).toHaveCount(0);
  await expect(page.getByRole('dialog', { name: 'Lucía Martín', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Cerrar edición', exact: true }).click();
  expect(seen.errors).toEqual([]); expect(seen.outside).toEqual([]); expect(seen.mutations).toEqual([]);
  await page.unrouteAll({ behavior: 'wait' });
  const empty = await open(page, emptyOrigin);
  await page.locator('.sidebar').getByRole('button', { name: 'Hoy', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Hoy', exact: true })).toBeVisible();
  await expect(page.getByText('Sin captura', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Continuar preparación', exact: true }).click();
  await expect(prep(page)).toHaveAttribute('aria-expanded', 'true');
  expect(empty.errors).toEqual([]); expect(empty.outside).toEqual([]); expect(empty.mutations).toEqual([]);
});

test('main App: Integraciones reads actual local contracts, keeps rehearsals folded and fits beside the real navigation', async ({ page }) => {
  const seen = await open(page);
  await page.locator('.sidebar').getByRole('button', { name: 'Integraciones', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Integraciones', exact: true })).toBeVisible();
  await expect(page.locator('.lint-row')).toHaveCount(6);
  await expect(page.getByRole('button', { name: 'Conectar HubSpot', exact: true })).toBeVisible();
  await expect(page.getByText('Espacio de equipo sin configurar', { exact: true })).toHaveCount(5);
  await expect(page.locator('.lint-next a')).toHaveCount(0);
  expect(await page.locator('.lint-rehearsal').evaluate(element => (element as HTMLDetailsElement).open)).toBe(false);
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const box = await page.locator('.lint').boundingBox(); expect(box!.x).toBeGreaterThanOrEqual(0); expect(box!.x + box!.width).toBeLessThanOrEqual(width);
    await page.screenshot({ path: resolve(evidence!, `main-integrations-${width}.png`), fullPage: false });
  }
  const disclosure = page.getByText('Ver capacidades de ensayo', { exact: true });
  await disclosure.focus(); await page.keyboard.press('Enter');
  await expect(page.locator('.lint-rehearsal-body')).toBeVisible();
  await page.keyboard.press('Space'); await expect(page.locator('.lint-rehearsal-body')).toBeHidden();
  expect(seen.errors).toEqual([]); expect(seen.outside).toEqual([]); expect(seen.mutations).toEqual([]);
});

test('main App: the integration callback opens the existing HubSpot dialog without submitting credentials', async ({ page }) => {
  const origin = 'http://127.0.0.1:4585';
  const seen = await open(page, origin);
  const setup = await page.request.post(origin + '/api/v2/auth/setup', { data: { password: 'fiction-only-connect117-password' } });
  expect(setup.status()).toBe(200);
  await page.reload();
  await page.locator('.sidebar').getByRole('button', { name: 'Integraciones', exact: true }).click();
  await page.getByRole('button', { name: 'Conectar HubSpot', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Conectar HubSpot', exact: true });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel('Service Key o token de lectura', { exact: true })).toHaveValue('');
  expect(seen.mutations.filter(request => request.includes('/connection'))).toEqual([]);
  await dialog.getByRole('button', { name: 'Cerrar', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(seen.errors).toEqual([]); expect(seen.outside).toEqual([]);
});
