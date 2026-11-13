import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { decodePortable } from '../../server/crypto.js';
import { bundleRevision } from '../../server/recovery-copy.js';
import type { ContinuityBundle } from '../../shared/model.js';

const localPassword = 'fixture-search053-password', recoveryPassword = 'fixture-export054-password';
const checkbox = 'He revisado la captura y los cambios incluidos en esta descarga.';
async function open(page: Page) {
  const errors: string[] = [], outside: string[] = [], exports: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('request', request => { if (/\/api\/v2\/export\//.test(request.url())) exports.push(request.url()); });
  await page.route('**/*', route => { const url = new URL(route.request().url()); if (url.hostname !== '127.0.0.1') { outside.push(url.origin); return route.abort(); } return route.fallback(); });
  const status = await page.request.get('/api/v2/auth/status').then(r => r.json());
  expect((await page.request.post('/api/v2/auth/' + (status.configured ? 'login' : 'setup'), { data: { password: localPassword } })).ok()).toBeTruthy();
  await page.goto('/'); await expect(page).toHaveTitle('Plan B · Tu CRM sigue contigo');
  await page.getByRole('button', { name: 'Exportar', exact: true }).click();
  const view = page.locator('.export-page'); await expect(view.getByRole('heading', { name: 'Tu copia, contigo.' })).toBeVisible();
  await expect(view.getByRole('heading', { name: 'Qué contiene esta descarga' })).toBeVisible();
  return { view, errors, outside, exports };
}
async function passwords(page: Page) {
  await page.getByLabel('Contraseña de recuperación', { exact: true }).fill(recoveryPassword);
  await page.getByLabel('Repite la contraseña', { exact: true }).fill(recoveryPassword);
}

test('export review: controls require current content, explicit review and matching passwords; real encrypted download matches the reviewed revision', async ({ page }, info) => {
  const { view, errors, outside, exports } = await open(page), button = view.getByRole('button', { name: 'Solo copia cifrada', exact: true });
  await expect(button).toBeDisabled(); await passwords(page); await expect(button).toBeDisabled();
  await view.getByLabel(checkbox, { exact: true }).check(); await expect(button).toBeEnabled();
  await view.getByLabel('Repite la contraseña', { exact: true }).fill('different-fixture-value'); await expect(button).toBeDisabled();
  await passwords(page);
  const summary = await page.request.get('/api/v4/export-summary').then(r => r.json());
  const [download] = await Promise.all([page.waitForEvent('download'), button.click()]);
  const output = info.outputPath('fixture-encrypted-copy.json'); await download.saveAs(output);
  const raw = await readFile(output, 'utf8'), bundle = decodePortable(raw, recoveryPassword) as ContinuityBundle;
  expect(bundleRevision(bundle)).toBe(summary.revision); expect(bundle.records.length).toBe(summary.records);
  expect(bundle.snapshot.id + ':' + bundle.snapshot.capturedAt).toBe(summary.captureId);
  await expect(view.getByRole('status')).toContainText('preparado para descargar');
  await expect(view.getByRole('status')).toContainText('No se ha verificado una restauración');
  await expect(view.getByRole('status')).not.toContainText('Descarga completada');
  await expect(view.getByLabel('Contraseña de recuperación', { exact: true })).toHaveValue('');
  await expect(view.getByLabel('Repite la contraseña', { exact: true })).toHaveValue('');
  await expect(view.getByLabel(checkbox, { exact: true })).not.toBeChecked(); await expect(button).toBeDisabled();
  await expect(view.getByText(/Falta confirmar que la guardaste fuera/)).toBeVisible();
  expect(exports).toHaveLength(1); expect(outside).toEqual([]); expect(errors).toEqual([]);
});

test('export review: a changed revision is rejected, never silently retried, and requires a fresh review', async ({ page }) => {
  const { view, exports } = await open(page); await passwords(page); await view.getByLabel(checkbox, { exact: true }).check();
  const old = await page.request.get('/api/v4/export-summary').then(r => r.json());
  expect((await page.request.patch('/api/records/contacts/contact-1', { data: { values: { phone: 'changed-for-export054-' + old.revision.slice(0, 12) } } })).ok()).toBeTruthy();
  await view.getByRole('button', { name: 'Solo copia cifrada', exact: true }).click();
  await expect(view.getByRole('alert')).toContainText('El espacio cambió');
  await expect(view.getByLabel(checkbox, { exact: true })).not.toBeChecked();
  await expect(view.getByRole('button', { name: 'Solo copia cifrada', exact: true })).toBeDisabled();
  expect(exports).toHaveLength(1);
  const summary = await page.request.get('/api/v4/export-summary').then(r => r.json()); expect(summary.revision).not.toBe(old.revision);
  await expect(view.getByText('Revisión: ' + summary.revision.slice(0, 12), { exact: false })).toBeVisible();
});

test('export review: custody is declared only for the current revision and historical confirmation is not promoted', async ({ page }) => {
  const { view } = await open(page), summary = await page.request.get('/api/v4/export-summary').then(r => r.json());
  expect((await page.request.post('/api/v2/export/encrypted', { data: { password: recoveryPassword, revision: summary.revision } })).ok()).toBeTruthy();
  expect((await page.request.post('/api/v3/recovery-copy/confirm', { data: { storedSeparately: true, revision: summary.revision } })).ok()).toBeTruthy();
  await view.getByRole('button', { name: 'Actualizar contenido', exact: true }).click();
  await expect(view.getByText(/Confirmaste que guardaste esta revisión por separado/)).toBeVisible();
  await expect(view.getByText(/Es una declaración tuya/)).toBeVisible();
  await page.request.patch('/api/records/contacts/contact-1', { data: { values: { phone: 'after-custody-export054' } } });
  await view.getByRole('button', { name: 'Actualizar contenido', exact: true }).click();
  await expect(view.getByText(/confirmación histórica/)).toBeVisible();
  await expect(view.getByText(/Confirmaste que guardaste esta revisión por separado/)).toHaveCount(0);
});

test('export review: summary error blocks download, custody failure stays explicit, mobile and keyboard remain usable', async ({ page }) => {
  await page.route('**/api/v4/export-summary', route => route.fulfill({ status: 404, json: { error: 'No disponible.' } }));
  const status = await page.request.get('/api/v2/auth/status').then(r => r.json()); await page.request.post('/api/v2/auth/' + (status.configured ? 'login' : 'setup'), { data: { password: localPassword } });
  await page.goto('/'); await page.getByRole('button', { name: 'Exportar', exact: true }).click(); const view = page.locator('.export-page');
  await expect(view.getByRole('alert')).toContainText('no permite revisar el contenido');
  await passwords(page); await expect(view.getByRole('button', { name: 'Solo copia cifrada', exact: true })).toBeDisabled();
  await page.unroute('**/api/v4/export-summary');
  await page.route('**/api/v2/continuity', route => route.fulfill({ status: 503, json: { error: 'Solo ensayo.' } }));
  await view.getByRole('button', { name: 'Actualizar contenido', exact: true }).click();
  await expect(view.getByRole('heading', { name: 'Qué contiene esta descarga' })).toBeVisible();
  await expect(view.getByText(/No se pudo consultar la custodia/)).toBeVisible();
  await view.getByLabel(checkbox, { exact: true }).focus(); await page.keyboard.press('Space'); await expect(view.getByLabel(checkbox, { exact: true })).toBeChecked();
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 950 }); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
    await page.screenshot({ path: resolve(process.env.PLANB_EVIDENCE_DIR!, 'export054-' + width + '.png'), fullPage: false });
  }
});

test('export review: refreshing content clears prior review and a real 401 locks the app without exposing export values', async ({ page }) => {
  const { view } = await open(page); await passwords(page); await view.getByLabel(checkbox, { exact: true }).check();
  await view.getByRole('button', { name: 'Actualizar contenido', exact: true }).click(); await expect(view.getByLabel(checkbox, { exact: true })).not.toBeChecked();
  await expect(view.getByRole('button', { name: 'Solo copia cifrada', exact: true })).toBeDisabled();
  await view.getByLabel(checkbox, { exact: true }).check(); await page.request.post('/api/v2/auth/lock', { data: {} });
  await view.getByRole('button', { name: 'Solo copia cifrada', exact: true }).click();
  await expect(view).toBeHidden(); await expect(page.getByRole('heading', { name: 'Tu copia está protegida' })).toBeVisible();
  await expect(page.getByText('Qué contiene esta descarga')).toHaveCount(0);
});
