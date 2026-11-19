import { test, expect, type Page, type Locator } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const origin = process.env.PLANB_SEARCH145_ORIGIN!, evidence = process.env.PLANB_SEARCH145_EVIDENCE!;
let errors: string[], outside: string[], searchWrites: string[];
const hit = (dialog: Locator) => dialog.locator('.workspace-search-hit').filter({ hasText: /ID contact-1 ·/ });
test.beforeEach(async ({ page }) => {
  errors = []; outside = []; searchWrites = [];
  expect((await page.request.post(origin + '/__fixture/reset')).ok()).toBe(true);
  page.on('pageerror', e => errors.push(e.message));
  page.on('request', r => { if (/\/api\/v2\/search/.test(r.url()) && r.method() !== 'GET') searchWrites.push(r.method()); });
  await page.route('**/*', route => { if (new URL(route.request().url()).origin !== origin) { outside.push(route.request().url()); return route.abort(); } return route.fallback(); });
});
test.afterEach(async () => { expect(errors).toEqual([]); expect(outside).toEqual([]); expect(searchWrites).toEqual([]); });
async function open(page: Page) {
  await page.goto(origin); await expect(page).toHaveTitle('Plan B · Tu CRM sigue contigo');
  await page.getByRole('button', { name: 'Buscar en toda la copia', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Buscar en toda la copia', exact: true }); await expect(dialog).toBeVisible();
  return { dialog, input: dialog.getByRole('searchbox', { name: 'Buscar en toda la copia', exact: true }) };
}

test('real App refuses a search source from another installation even if all old identity fields match', async ({ page }) => {
  await page.route('**/api/v2/search?*', async route => { const response = await route.fetch(), body = await response.json(); body.source.instanceId = '00000000-0000-4000-8000-000000000999'; await route.fulfill({ response, json: body }); });
  const { dialog, input } = await open(page); await input.fill('contact-1');
  await expect(dialog.getByRole('alert')).toContainText('otra copia'); await expect(dialog.getByRole('listitem')).toHaveCount(0);
});

test('real App refuses an opening response with another account despite a copied valid revision and record ID', async ({ page }) => {
  await page.route('**/api/v2/search-record?*', async route => { const response = await route.fetch(), body = await response.json(); body.source.accountId = 'foreign-account145'; await route.fulfill({ response, json: body }); });
  const { dialog, input } = await open(page); await input.fill('contact-1'); await expect(hit(dialog)).toBeVisible();
  await hit(dialog).click(); await expect(dialog.getByRole('alert')).toContainText('no corresponde');
  await expect(dialog).toBeVisible(); await expect(page.getByRole('dialog')).toHaveCount(1);
});

test('a same-ID/date restored source rejects the old selection and old-context refresh until the App itself refreshes', async ({ page }) => {
  const { dialog, input } = await open(page); await input.fill('contact-1'); await expect(hit(dialog)).toBeVisible();
  const before = await page.request.get(origin + '/api/v2/state').then(r => r.json());
  expect((await page.request.post(origin + '/__fixture/change-source')).ok()).toBe(true);
  const changed = await page.request.get(origin + '/api/v2/state').then(r => r.json());
  expect(changed.snapshot.id).toBe(before.snapshot.id); expect(changed.snapshot.capturedAt).toBe(before.snapshot.capturedAt);
  expect(changed.workspaceSearchContext.contextRevision).not.toBe(before.workspaceSearchContext.contextRevision);
  await hit(dialog).click(); await expect(dialog.getByRole('alert')).toContainText('La copia cambió');
  await dialog.getByRole('button', { name: 'Actualizar resultados', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('Actualiza el espacio de trabajo'); await expect(dialog.getByRole('listitem')).toHaveCount(0);
  await page.keyboard.press('Escape'); await page.reload(); await page.getByRole('button', { name: 'Buscar en toda la copia', exact: true }).click();
  const fresh = page.getByRole('dialog', { name: 'Buscar en toda la copia' }); await fresh.getByRole('searchbox').fill('contact-1'); await expect(hit(fresh)).toBeVisible();
  await expect(fresh).toContainText('Portal fictional145-replaced'); await hit(fresh).click();
  await expect(fresh).toHaveCount(0); await expect(page.getByRole('dialog', { name: 'Álvaro Clave053 Gemelo' })).toBeVisible();
});

test('a retained opening is discarded when real App refresh changes trusted context without changing capture ID/date', async ({ page }) => {
  let release!: () => void, entered!: () => void, held = false; const gate = new Promise<void>(r => { release = r; }), pending = new Promise<void>(r => { entered = r; });
  await page.route('**/api/v2/search-record?*', async route => {
    if (!held) { held = true; const response = await route.fetch(), json = await response.json(); entered(); await gate; try { await route.fulfill({ response, json }); } catch { /* browser may already have canceled this request */ } }
    else await route.fallback();
  });
  try {
    const { dialog, input } = await open(page); await input.fill('contact-1'); await expect(hit(dialog)).toBeVisible();
    await hit(dialog).click(); await pending;
    expect((await page.request.post(origin + '/__fixture/change-source')).ok()).toBe(true);
    // Exercise the existing App auth/status refresh, with its real server still declaring this fixture open.
    await page.evaluate(() => window.dispatchEvent(new Event('planb:locked')));
    await expect(dialog).toContainText('Portal fictional145-replaced'); release(); await expect(hit(dialog)).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(1); await expect(dialog).toBeVisible();
    await page.screenshot({ path: path.join(evidence, 'search-context-refreshed.png') });
  } finally { release(); }
});

test('an old App-state response without verified identity fails closed instead of adopting the first search response', async ({ page }) => {
  let queries = 0;
  page.on('request', r => { if (new URL(r.url()).pathname === '/api/v2/search') queries++; });
  await page.route('**/api/v2/state', async route => { const response = await route.fetch(), body = await response.json(); delete body.workspaceSearchContext; await route.fulfill({ response, json: body }); });
  const { dialog, input } = await open(page); await input.fill('contact-1');
  await expect(dialog.getByRole('alert')).toContainText('no permite identificar'); expect(queries).toBe(0); await expect(dialog.getByRole('listitem')).toHaveCount(0);
  fs.writeFileSync(path.join(evidence, 'old-state-no-search.json'), JSON.stringify({ queries, rejected: true }));
});
