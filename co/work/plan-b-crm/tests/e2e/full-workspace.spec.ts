import { test, expect } from '@playwright/test';
import { resolve } from 'node:path';
import { menuGroup, openSection } from './menu';

test('CRM completo: conserva apartados y permite ir y volver del piloto con protección de borradores', async ({ page, baseURL }) => {
  // Nunca preparar datos sobre la instalación del usuario.
  expect(baseURL).toBe('http://127.0.0.1:4356');
  const origin = baseURL!, pilot = 'http://localhost:4334', crm = 'http://127.0.0.1:4331';
  const gate = await page.request.get(origin + '/api/v2/auth/status').then(r => r.json());
  await page.request.post(origin + '/api/v2/auth/' + (gate.configured ? 'login' : 'setup'), { data: { password: 'solo-prueba-local-2026' } });
  expect((await page.request.post(origin + '/api/import/fixture', { data: { profile: 'agency', replace: true } })).ok()).toBeTruthy();
  expect((await page.request.post(origin + '/api/generate', { data: { mode: 'demo' } })).ok()).toBeTruthy();
  expect((await page.request.post(origin + '/api/activate', { data: { reviewed: true } })).ok()).toBeTruthy();
  const errors: string[] = [], outside: string[] = [], writes: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  const content = { recipient: 'prueba@example.invalid', subject: 'Borrador de prueba', body: 'Contenido inicial', meeting: false, start: '2027-01-01T10:00:00Z', end: '2027-01-01T10:30:00Z', timeZone: 'Europe/Madrid', email: false, document: false, spreadsheet: false, documentTitle: 'Documento', documentBody: 'Texto' };
  await page.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    if (![origin, pilot, crm].includes(url.origin)) { outside.push(url.origin); return route.abort(); }
    if (url.origin === origin) return route.continue();
    if (url.origin === pilot && url.pathname.startsWith('/api/')) {
      if (request.method() !== 'GET') { writes.push(url.pathname); return route.fulfill({ status: 400, json: { error: 'Escritura bloqueada.' } }); }
      let data: unknown;
      if (url.pathname === '/api/team/config') data = { localPilot: true, demo: false, firebase: null, users: [], oauthConfigured: false };
      else if (url.pathname === '/api/team/local-pilot/status') data = { authenticated: true };
      else if (url.pathname === '/api/team/spaces') data = { spaces: [{ id: 'a', name: 'Piloto de prueba', role: 'admin' }] };
      else if (url.pathname.endsWith('/records')) data = { records: [] };
      else if (url.pathname === '/api/team/spaces/a') data = { space: { id: 'a', name: 'Piloto de prueba', role: 'admin' }, recordCount: 0, members: [], jobs: [], conflicts: [], devices: [], connection: null };
      else if (url.pathname.endsWith('/v6/commercial')) data = { demo: true, configured: true, connection: null, integrations: [], contacts: [], links: [], files: [], tasks: [], proposals: [{ id: 'p1', contact_id: 'c1', revision: 'r1', content, content_hash: 'h1', status: 'draft', evidence: [], error: null, created_at: '2026-10-29' }] };
      else return route.fulfill({ status: 404, json: { error: 'Ruta no prevista.' } });
      return route.fulfill({ json: data });
    }
    // Los enlaces usan sus URL reales; TODO su contenido se sirve desde el servidor de prueba.
    // No alcanza el piloto o CRM personales, incluso después de navegar a su URL.
    const headers = { ...request.headers() };
    // Este relé solo existe en el arnés: los activos se piden al origen de prueba.
    delete headers.origin; delete headers.host; delete headers.referer;
    const response = await route.fetch({ url: origin + url.pathname + url.search, headers });
    return route.fulfill({ response });
  });
  await page.goto(origin);
  // Menú de cinco lugares (CLAUDE-UI-NAV-LAB): el grupo «Clientes» sustituye a «Trabajar».
  const work = menuGroup(page, 'Clientes');
  await expect(work).toHaveAttribute('aria-expanded', 'false');
  await work.click();
  await expect(work).toHaveAttribute('aria-expanded', 'true');
  for (const name of ['Clientes', 'Empresas', 'Oportunidades', 'Tareas']) {
    const button = page.getByRole('navigation', { name: 'Clientes', exact: true }).getByRole('button', { name, exact: true });
    await button.click(); await expect(button).toHaveAttribute('aria-current', 'page');
    await expect(page.getByRole('heading', { name, exact: true }).first()).toBeVisible();
    await expect(page.locator(name === 'Oportunidades' ? '.kanban[aria-label="Tablero de oportunidades"]' : 'main table').first()).toBeVisible();
  }
  // Los otros lugares del menú; sus apartados (Cambios, Exportar, Integraciones, Preparación…) viven dentro de cada grupo.
  for (const name of ['Inicio', 'Hoy', 'Continuidad', 'Ajustes']) await expect(page.locator('.sidebar').getByRole('button', { name, exact: true }).first()).toBeVisible();
  // El enlace al espacio de equipo está en la barra superior y abre su apartado comercial.
  const commercial = page.getByRole('link', { name: 'Espacio de equipo', exact: true });
  await expect(commercial).toHaveAttribute('href', pilot + '/team?view=commercial');
  await page.screenshot({ path: resolve(process.env.PLANB_EVIDENCE_DIR || 'test-results', 'crm-completo-trabajar.png'), fullPage: true });
  await commercial.click();
  await expect(page.getByRole('heading', { name: 'Cada seguimiento, preparado.', exact: true })).toBeVisible();
  const back = page.getByRole('link', { name: 'CRM completo', exact: true });
  await expect(back).toHaveAttribute('href', crm + '/');
  await page.getByRole('navigation', { name: 'Secciones del equipo' }).getByRole('button', { name: 'Comercial', exact: true }).click();
  await page.getByLabel('Mensaje del seguimiento', { exact: true }).fill('Cambios que no deben perderse');
  page.once('dialog', dialog => void dialog.dismiss()); await back.click();
  await expect(page.getByLabel('Mensaje del seguimiento', { exact: true })).toHaveValue('Cambios que no deben perderse');
  expect(page.url()).toContain('/team?view=commercial');
  page.once('dialog', dialog => void dialog.accept()); await back.click();
  await expect(page.getByRole('button', { name: 'Continuidad', exact: true })).toBeVisible();
  expect(page.url()).toBe(crm + '/');
  await openSection(page, 'Clientes');
  await expect(page.getByRole('navigation', { name: 'Clientes', exact: true })).toBeVisible();
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 950 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBeTruthy();
    await expect(commercial).toBeVisible();
  }
  expect(errors).toEqual([]); expect(outside).toEqual([]); expect(writes).toEqual([]);
});
