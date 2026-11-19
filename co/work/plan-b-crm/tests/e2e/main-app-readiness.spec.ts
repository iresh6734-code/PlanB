import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { startMainApp, checkCandidate, type Candidate } from '../helpers/main-app-readiness-harness.js';
import { openSection, place } from './menu';

let candidate: Candidate, imported: Awaited<ReturnType<typeof startMainApp>>, active: Awaited<ReturnType<typeof startMainApp>>;
const logs = new WeakMap<Page, { errors: string[]; outside: string[]; console: string[] }>();
test.beforeAll(async () => {
  const root = process.env.PLANB_MAIN121_CANDIDATE;
  if (!root) throw new Error('Se necesita una candidata121 congelada propia.');
  candidate = { root, source: path.join(root, 'source'), manifest: JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8')) };
  checkCandidate(candidate);
  imported = await startMainApp(candidate, false); active = await startMainApp(candidate, true);
});
test.afterAll(async () => { await imported?.close(); await active?.close(); if (candidate) checkCandidate(candidate); });
test.afterEach(async ({ page }, info) => {
  const seen = logs.get(page);
  if (seen) { await info.attach('console-network', { body: JSON.stringify(seen), contentType: 'application/json' }); expect(seen.errors).toEqual([]); expect(seen.outside).toEqual([]); }
});
async function open(page: Page, fixture = imported) {
  const seen = { errors: [] as string[], outside: [] as string[], console: [] as string[] }; logs.set(page, seen);
  page.on('pageerror', error => seen.errors.push(error.message));
  page.on('console', message => { if (['warning', 'error'].includes(message.type())) seen.console.push(message.text()); });
  await page.route('**/*', route => {
    if (new URL(route.request().url()).origin !== fixture.url) { seen.outside.push(route.request().url()); return route.abort(); }
    return route.continue();
  });
  await page.goto(fixture.url); await expect(page).toHaveTitle('Plan B · Tu CRM sigue contigo');
  await expect(page.locator('#main-content')).not.toBeEmpty();
  return seen;
}
// Lugares del menú en escritorio (menú lateral) o en el móvil (barra inferior): ver tests/e2e/menu.ts.
const nav = (page: Page, label: string) => place(page, label);
test('combined imported workflow: useful Hoy, persistent review, folded preparation and honest integrations', async ({ page }) => {
  const seen = await open(page); const posts: string[] = [];
  page.on('request', r => { if (r.method() === 'POST') posts.push(new URL(r.url()).pathname); });
  await nav(page, 'Hoy').click(); await expect(page.getByRole('heading', { name: 'Hoy', exact: true })).toBeVisible();
  await expect(page.getByText('Captura importada · pendiente de activar', { exact: true })).toBeVisible();
  await expect(page.locator('.lop-tasks li').first()).toBeVisible();
  await openSection(page, 'Propuestas'); await page.getByRole('button', { name: 'Revisar mi copia', exact: true }).click();
  await expect(page.locator('.lop-confirmation')).toContainText('Revisión local guardada');
  await page.reload(); await openSection(page, 'Propuestas');
  await expect(page.locator('.lop-confirmation')).toContainText('Revisión local guardada');
  await page.getByRole('button', { name: 'Continuar preparación', exact: true }).click();
  await expect(nav(page, 'Preparación')).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByRole('navigation', { name: 'Secciones de preparación' }).getByRole('button')).toHaveCount(3);
  await nav(page, 'Preparación').focus(); await page.keyboard.press('Space');
  await expect(nav(page, 'Preparación')).toHaveAttribute('aria-expanded', 'false');
  await nav(page, 'Integraciones').click();
  await expect(page.getByRole('heading', { name: 'Integraciones', exact: true })).toBeVisible();
  await expect(page.locator('.lint-rehearsal')).not.toHaveAttribute('open', '');
  await expect(page.locator('.lint-row[data-state="not_configured"]')).toHaveCount(5);
  await expect(page.locator('.lint-row[data-state="not_connected"]')).toHaveCount(1);
  expect(posts).toEqual(['/api/v7/local-operations/reviews']);
  expect(seen.console).toEqual([]);
});
test('active-copy callbacks open actual task and opportunity workspaces', async ({ page }) => {
  const seen = await open(page, active); await nav(page, 'Hoy').click();
  await page.getByRole('button', { name: 'Abrir tareas', exact: true }).click(); await expect(page.getByRole('heading', { name: 'Tareas', exact: true })).toBeVisible();
  await expect(page.locator('tbody tr').first()).toBeVisible();
  await openSection(page, 'Propuestas'); await page.getByRole('button', { name: 'Abrir oportunidades', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Oportunidades', exact: true })).toBeVisible(); expect(seen.console).toEqual([]);
});
for (const width of [1440, 390, 320]) test('combined navigation and integrations fit at ' + width, async ({ page }) => {
  await page.setViewportSize({ width, height: 1000 }); const seen = await open(page);
  for (const label of ['Hoy', 'Agentes', 'Preparación', 'Integraciones']) {
    await nav(page, label).click();
    const selector = label === 'Integraciones' ? '.lint' : label === 'Preparación' ? '.preparation-navigation' : '.lop';
    await expect(page.locator(selector)).toBeVisible();
    await expect(page.locator('#main-content [aria-busy="true"]')).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: path.join(candidate.root, label.toLowerCase() + '-' + width + '.png'), fullPage: false });
  }
  expect(seen.console).toEqual([]);
});
