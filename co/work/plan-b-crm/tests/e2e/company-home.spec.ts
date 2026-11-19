import { test, expect } from '@playwright/test';
import { resolve } from 'node:path';

// Frontend real con datos aislados: ninguna llamada al piloto ni a proveedores.
const records = [
  { entity: 'contacts', id: 'contact-a', version: 2, value: { entity: 'contacts', id: 'contact-a', values: { firstname: 'Contacto', lastname: 'Prueba', email: 'prueba@example.invalid' } } },
  { entity: 'companies', id: 'company-a', version: 3, value: { entity: 'companies', id: 'company-a', values: { name: 'Empresa de prueba', domain: 'example.invalid' } } },
  { entity: 'deals', id: 'deal-a', version: 1, value: { entity: 'deals', id: 'deal-a', values: { dealname: 'Oportunidad conservada', dealstage: 'revision' } } },
  { entity: 'tasks', id: 'task-a', version: 1, value: { entity: 'tasks', id: 'task-a', values: { hs_task_subject: 'Tarea conservada', hs_task_status: 'NOT_STARTED' } } },
];

test('Empresa: navegación, registros por tipo, aislamiento y móvil en el piloto local', async ({ page }) => {
  const errors: string[] = [], external: string[] = [], writes: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    if (!['127.0.0.1', 'localhost'].includes(url.hostname)) { external.push(url.origin); return route.abort(); }
    if (!url.pathname.startsWith('/api/')) return route.continue();
    if (request.method() !== 'GET') { writes.push(url.pathname); return route.fulfill({ status: 400, json: { error: 'No se permiten escrituras en este recorrido.' } }); }
    const p = url.pathname;
    if (p === '/api/team/config') return route.fulfill({ json: { demo: false, localPilot: true, users: [], firebase: null, oauthConfigured: false } });
    if (p === '/api/team/local-pilot/status') return route.fulfill({ json: { authenticated: true } });
    if (p === '/api/team/spaces') return route.fulfill({ json: { spaces: [{ id: 'a', name: 'Espacio A', role: 'admin' }, { id: 'b', name: 'Espacio B', role: 'viewer' }] } });
    const tenant = p.includes('/spaces/b') ? 'b' : 'a';
    if (p.endsWith('/records')) return route.fulfill({ json: { records: tenant === 'a' ? records : [] } });
    if (p === '/api/team/spaces/' + tenant) return route.fulfill({ json: { space: { id: tenant, name: 'Espacio ' + tenant.toUpperCase(), role: tenant === 'a' ? 'admin' : 'viewer' }, recordCount: tenant === 'a' ? 4 : 0, members: [], devices: [], conflicts: [], jobs: tenant === 'a' ? [{ id: 'job-a', kind: 'hubspot-capture', status: 'failed', created_at: '2026-10-29T10:00:00Z', error: null }] : [], connection: tenant === 'a' ? { account_id: '123', status: 'needs_reconnect', verified_at: '2026-10-29T10:00:00Z' } : null } });
    if (p.endsWith('/v6/commercial')) return route.fulfill({ json: { demo: true, contacts: tenant === 'a' ? records.filter(r => r.entity === 'contacts').map(r => r.value) : [], proposals: [], tasks: [], connection: null, files: [], captures: [], source: { origin: 'local' }, recentChanges: [], pickerEnabled: false } });
    return route.fulfill({ status: 404, json: { error: 'Ruta no prevista en el recorrido: ' + p } });
  });
  await page.goto('/team');
  await expect(page.getByRole('heading', { name: 'Tu empresa, de un vistazo.', exact: true })).toBeVisible();
  const nav = page.getByRole('navigation', { name: 'Secciones del equipo' });
  await expect(nav.getByRole('button', { name: 'Empresa', exact: true })).toHaveAttribute('aria-current', 'page');
  await expect(nav.getByRole('button', { name: 'Equipo', exact: true })).toHaveCount(0);
  await expect(nav.getByRole('button', { name: 'Dispositivos', exact: true })).toHaveCount(0);
  await expect(page.getByText('Necesita reconectar · Portal 123', { exact: true })).toBeVisible();
  await expect(page.getByRole('definition').filter({ hasText: /^1$/ })).toHaveCount(4);
  const table = page.getByRole('region', { name: 'Lista de registros guardados' });
  for (const [tab, name] of [['Empresas', 'Empresa de prueba'], ['Oportunidades', 'Oportunidad conservada'], ['Tareas', 'Tarea conservada']]) {
    await page.getByRole('tab', { name: tab, exact: true }).click();
    await expect(table.getByRole('cell', { name, exact: true })).toBeVisible();
  }
  await page.getByLabel('Buscar en los registros guardados', { exact: true }).fill('no existe');
  await expect(page.getByRole('status')).toHaveText('Ningún registro coincide con la búsqueda.');
  await page.getByRole('tab', { name: 'Contactos', exact: true }).click();
  await page.getByRole('tab', { name: 'Contactos', exact: true }).press('ArrowRight');
  await expect(page.getByRole('tab', { name: 'Empresas', exact: true })).toBeFocused();
  await page.getByLabel('Empresa activa', { exact: true }).selectOption('b');
  await expect(page.getByText('Sin conexión en este espacio', { exact: true })).toBeVisible();
  await expect(page.getByText('No hay registros de este tipo en la copia local de esta empresa.', { exact: true })).toBeVisible();
  await expect(page.getByText('Empresa de prueba', { exact: true })).toHaveCount(0);
  await page.getByLabel('Empresa activa', { exact: true }).selectOption('a');
  await page.getByRole('button', { name: 'Contactos y fichas', exact: false }).click();
  await expect(page.getByRole('heading', { name: 'Las relaciones de tu equipo.', exact: true })).toBeVisible();
  await nav.getByRole('button', { name: 'Empresa', exact: true }).click();
  await page.getByRole('button', { name: 'Ver trabajos y resultados', exact: false }).click();
  await expect(page.getByRole('heading', { name: 'Trabajo que continúa.', exact: true })).toBeVisible();
  await nav.getByRole('button', { name: 'Empresa', exact: true }).click();
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 950 });
    await expect(page.getByRole('heading', { name: 'Tu empresa, de un vistazo.', exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBeTruthy();
    for (const button of await nav.getByRole('button').all()) {
      const box = await button.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(width + 1);
    }
    await page.screenshot({ path: resolve(process.env.PLANB_EVIDENCE_DIR || 'test-results', 'company-home-' + width + '.png'), fullPage: true });
  }
  await page.getByRole('button', { name: 'Abrir Comercial', exact: false }).click();
  await expect(page.getByRole('heading', { name: 'Cada seguimiento, preparado.', exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Cada seguimiento, preparado.', exact: true })).toBeVisible();
  expect(errors).toEqual([]); expect(external).toEqual([]); expect(writes).toEqual([]);
});
