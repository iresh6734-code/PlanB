import { test, expect, type Page, type Route } from '@playwright/test';
import { build } from 'esbuild';
import { createServer, type Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

// DOM real en Chromium limpio de Playwright, contra un montaje de prueba del componente REAL
// (src/LocalIntegrations.tsx + sus hojas de estilo), servido en loopback con fixtures sintéticos.
// No arranca el servidor de la app, no usa 4451/4511/4515 ni ninguna cuenta; el tráfico a hosts
// que no sean 127.0.0.1 se bloquea. El montaje NO es la App real: el callback y el shell son stubs.
const repo = process.cwd();
const root = path.resolve(process.env.PLANB_INT119_ROOT ?? path.join(repo, 'tests', '.tmp', 'integrations119-' + randomUUID()));
let server: Server, base = '';

test.beforeAll(async () => {
  fs.mkdirSync(path.join(root, 'out'), { recursive: true });
  const src = (name: string) => JSON.stringify(path.join(repo, 'src', name).replace(/\\/g, '/'));
  fs.writeFileSync(path.join(root, 'entry.tsx'), `import { createRoot } from 'react-dom/client';
import { LocalIntegrations } from ${src('LocalIntegrations.tsx')};
import ${src('styles.css')}; import ${src('refinements.css')}; import ${src('sales.css')}; import ${src('team.css')};
import ${src('integrations.css')}; import ${src('design-system.css')}; import ${src('planb-ui.css')};
const w = window as any; w.__connects = 0;
const root = createRoot(document.getElementById('root')!);
root.render(<div className="app-shell"><aside className="sidebar"><div className="brand">Plan <span>B</span></div></aside><main id="main-content" className="main-content"><LocalIntegrations onConnectHubspot={() => { w.__connects++; }} /></main></div>);
w.__unmount = () => root.unmount();
`);
  await build({ entryPoints: [path.join(root, 'entry.tsx')], bundle: true, outdir: path.join(root, 'out'), format: 'iife', jsx: 'automatic', minify: false, logLevel: 'error',
    loader: { '.png': 'dataurl', '.svg': 'dataurl', '.woff2': 'dataurl', '.woff': 'dataurl' }, define: { 'process.env.NODE_ENV': '"production"' } });
  const html = '<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Integraciones</title><link rel="stylesheet" href="/out/entry.css"></head><body><div id="root"></div><script src="/out/entry.js"></script></body></html>';
  const types: Record<string, string> = { '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml' };
  server = createServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1');
    const publicDir = path.join(repo, 'public', 'integrations');
    const file = url.pathname.startsWith('/out/') ? path.join(root, url.pathname) : url.pathname.startsWith('/integrations/') ? path.join(repo, 'public', url.pathname) : null;
    if (url.pathname === '/') { response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(html); return; }
    if (file && (path.resolve(file).startsWith(path.join(root, 'out')) || path.resolve(file).startsWith(publicDir)))
      try { response.writeHead(200, { 'content-type': types[path.extname(file!)] ?? 'application/octet-stream' }).end(fs.readFileSync(file!)); return; } catch { /* 404 */ }
    response.writeHead(404, { 'content-type': 'application/json' }).end('{"error":"no encontrado"}');
  });
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  base = 'http://127.0.0.1:' + (server.address() as { port: number }).port;
});
test.afterAll(async () => { await new Promise<void>(resolve => server?.close(() => resolve()) ?? resolve()); });

const status = (over: Record<string, unknown> = {}) => ({
  captures: [], jobs: [], reports: [], latestCaptureAt: null, stale: false, ageMinutes: null, session: null, schedule: { enabled: false, intervalMinutes: 60, lastAttempt: null },
  connected: true, protected: false, accountId: null, changes: 0, pendingChanges: 0, runtime: false, realDataEnabled: false, latestCapture: null, readiness: { status: 'empty' },
  connection: null, recoveryCopy: null, operations: { lastAttempt: null, lastSuccess: null, error: null, paused: false }, ...over,
});
const capture = { id: 'cap-1', name: 'Captura de ejemplo', source: 'hubspot', accountId: '65001', capturedAt: '2026-11-01T10:00:00.000Z', counts: {}, records: 42, relations: 0, pipelines: 0, fields: 0 };
const connection = { accountId: '65001', mode: 'test', accountType: 'DEVELOPER_TEST', verifiedAt: '2026-10-30T09:00:00.000Z', selectedFields: {} };
const catalog = (hubspot = 'simulation') => ({ integrations: [
  { id: 'hubspot', label: 'HubSpot', mode: hubspot, description: 'La conexión existente conserva su alcance.', actions: ['Lectura existente', 'Capturas conciliadas'] },
  { id: 'gmail', label: 'Gmail', mode: 'simulation', description: 'Adaptador de ensayo. Sin OAuth, envío ni acceso a una cuenta.', actions: ['Mensaje simulado'] },
  { id: 'calendar', label: 'Google Calendar', mode: 'simulation', description: 'Adaptador de ensayo. Sin OAuth, envío ni acceso a una cuenta.', actions: ['Propuesta de reunión simulada'] },
  { id: 'drive', label: 'Google Drive', mode: 'unavailable', description: 'Herramientas disponibles en el espacio comercial de equipo.', actions: [] },
  { id: 'docs', label: 'Google Docs', mode: 'unavailable', description: 'Herramientas disponibles en el espacio comercial de equipo.', actions: [] },
  { id: 'sheets', label: 'Google Sheets', mode: 'unavailable', description: 'Herramientas disponibles en el espacio comercial de equipo.', actions: [] },
] });

type Reply = { status?: number; body: unknown } | 'hang';
type Handler = Reply | ((count: number) => Reply | Promise<Reply>);
interface Api { continuity: Handler; catalog: Handler; workspace: Handler; counts: Record<string, number>; external: string[]; }
async function open(page: Page, api: Partial<Pick<Api, 'continuity' | 'catalog' | 'workspace'>>, size = { width: 1440, height: 900 }, goto = true): Promise<Api> {
  const state: Api = { continuity: { body: status() }, catalog: { body: catalog() }, workspace: { body: { origin: null } }, counts: {}, external: [], ...api };
  await page.setViewportSize(size);
  const keyOf: Record<string, keyof Pick<Api, 'continuity' | 'catalog' | 'workspace'>> = { '/api/v2/continuity': 'continuity', '/api/v4/integrations': 'catalog', '/api/v6/workspace': 'workspace' };
  await page.route('**/*', async (route: Route) => {
    const url = new URL(route.request().url());
    if (url.hostname !== '127.0.0.1') { state.external.push(route.request().url()); await route.abort(); return; }
    const key = keyOf[url.pathname];
    if (!key) { await route.continue(); return; }
    const count = state.counts[key] = (state.counts[key] ?? 0) + 1;
    const handler = state[key];
    try {
      const reply = typeof handler === 'function' ? await handler(count) : handler;
      if (reply === 'hang') return;
      await route.fulfill({ status: reply.status ?? 200, contentType: 'application/json', body: JSON.stringify(reply.body) });
    } catch { /* petición cancelada por el componente antes de responder */ }
  });
  if (goto) await page.goto(base + '/');
  return state;
}
const gate = () => { let release!: () => void; const promise = new Promise<void>(resolve => { release = resolve; }); return { promise, release }; };
const rowFor = (page: Page, label: string) => page.getByRole('listitem').filter({ has: page.getByRole('heading', { name: label, level: 4, exact: true }) });
const teamTools = (page: Page) => page.getByText('Ver herramientas de Google Workspace', { exact: true });
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

test('sin cuenta: Conexiones primero, HubSpot guía a protección, sin botones inertes y ensayo plegado', async ({ page }) => {
  const api = await open(page, { continuity: { body: status({ latestCapture: capture, latestCaptureAt: capture.capturedAt }) } });
  await expect(page.getByRole('heading', { level: 1, name: 'Integraciones' })).toBeVisible();
  const headings = await page.getByRole('heading').allTextContents();
  expect(headings.slice(0, 3)).toEqual(['Integraciones', 'Conexiones', 'Espacio local']);
  await expect(page.getByRole('group', { name: 'Espacio local' })).toContainText('Sin configurar');
  const hubspot = rowFor(page, 'HubSpot');
  await expect(hubspot).toContainText('Sin conectar');
  await expect(hubspot).toContainText('copia histórica');
  await expect(hubspot).toContainText('no indica que HubSpot esté conectado ahora');
  await hubspot.getByRole('button', { name: 'Configurar protección' }).click();
  expect(await page.evaluate(() => (window as any).__connects)).toBe(1);
  // Misión maestra B4.8: sin espacio de equipo las herramientas van plegadas; se despliegan para revisarlas.
  await teamTools(page).click();
  for (const name of ['Gmail', 'Google Calendar', 'Google Drive', 'Google Docs', 'Google Sheets']) {
    const row = rowFor(page, name);
    await expect(row).toContainText('Espacio de equipo sin configurar');
    expect(await row.getByRole('link').count() + await row.getByRole('button').count()).toBe(0);
  }
  await expect(page.getByText('PLANB_TEAM_ORIGIN', { exact: false })).toHaveCount(1);
  expect(await page.locator('.lint a[href]').count()).toBe(0);
  // Ensayo plegado de inicio: el contenido no está visible.
  const details = page.locator('details.lint-rehearsal');
  expect(await details.evaluate(node => (node as HTMLDetailsElement).open)).toBe(false);
  await expect(page.getByText('Mensaje simulado')).toBeHidden();
  expect(api.external).toEqual([]);
  expect(api.counts).toEqual({ continuity: 1, catalog: 1, workspace: 1 });
});

test('ensayo accesible con teclado: Enter abre, Espacio cierra, foco visible', async ({ page }) => {
  await open(page, {});
  const summary = page.getByText('Ver capacidades de ensayo');
  await summary.focus(); await page.keyboard.press('Enter');
  const details = page.locator('details.lint-rehearsal');
  expect(await details.evaluate(node => (node as HTMLDetailsElement).open)).toBe(true);
  await expect(page.getByText('Mensaje simulado')).toBeVisible();
  await expect(page.getByText('Propuesta de reunión simulada')).toBeVisible();
  await expect(details).toContainText('No prueba que haya una cuenta conectada');
  await expect(details.getByText('Ensayo local').first()).toBeVisible();
  await page.keyboard.press('Space');
  expect(await details.evaluate(node => (node as HTMLDetailsElement).open)).toBe(false);
  await page.locator('body').click({ position: { x: 2, y: 2 } });
  for (let i = 0; i < 30 && !(await page.evaluate(() => document.activeElement?.tagName === 'SUMMARY')); i++) await page.keyboard.press('Tab');
  expect(await page.evaluate(() => document.activeElement?.tagName)).toBe('SUMMARY');
  expect(await summary.evaluate(node => getComputedStyle(node).outlineStyle)).not.toBe('none');
});

test('conexión local declarada y origen válido: enlaces exactos, nada se presenta como comprobado', async ({ page }) => {
  const api = await open(page, { continuity: { body: status({ protected: true, connection, latestCapture: capture, latestCaptureAt: capture.capturedAt }) }, catalog: { body: catalog('readonly') }, workspace: { body: { origin: 'http://127.0.0.1:4341' } } });
  const hubspot = rowFor(page, 'HubSpot');
  await expect(hubspot).toContainText('Lectura configurada');
  await expect(hubspot).toContainText('Portal 65001 · portal de prueba');
    await expect(hubspot).toContainText('El acceso actual no se comprueba al abrir esta lista');
  await hubspot.getByRole('button', { name: 'Revisar conexión' }).click();
  expect(await page.evaluate(() => (window as any).__connects)).toBe(1);
  await expect(page.getByRole('link', { name: /Abrir Integraciones del equipo/ })).toHaveAttribute('href', 'http://127.0.0.1:4341/team?view=connections');
  await expect(page.locator('.lint a[href]:visible')).toHaveCount(1);
  await teamTools(page).press('Enter');
  await expect(rowFor(page, 'Gmail')).toBeVisible();
  const expected: Record<string, string> = {
    Gmail: 'http://127.0.0.1:4341/team?view=commercial', 'Google Calendar': 'http://127.0.0.1:4341/team?view=commercial',
    'Google Drive': 'http://127.0.0.1:4341/team?view=commercial&tool=drive', 'Google Docs': 'http://127.0.0.1:4341/team?view=commercial&tool=docs', 'Google Sheets': 'http://127.0.0.1:4341/team?view=commercial&tool=sheets',
  };
  for (const [name, href] of Object.entries(expected)) {
    const row = rowFor(page, name);
    await expect(row).toContainText('Sin comprobar aquí');
    const link = row.getByRole('link', { name: new RegExp('Abrir ' + name + ' en el espacio comercial') });
    await expect(link).toHaveAttribute('href', href);
    await expect(link).toHaveAttribute('target', '_blank');
    expect(await link.getAttribute('rel')).toMatch(/noopener/);
  }
  const names = await page.locator('.lint a[href]').evaluateAll(nodes => nodes.map(node => (node.textContent ?? '').trim()));
  expect(new Set(names).size).toBe(names.length);
  await expect(page.locator('.lint')).not.toContainText(/herramientas conectadas/i);
  await expect(rowFor(page, 'Gmail')).toContainText('solo existe como ensayo');
  expect(api.external).toEqual([]);
});

test('origen malicioso: sin enlaces ni reproducción del valor', async ({ page }) => {
  for (const origin of ['javascript:alert(1)', 'data:text/html,<script>alert(1)</script>', '//evil.example', 'https://user:pw@evil.example.com', 'http://evil.example.com']) {
    await open(page, { workspace: { body: { origin } } });
    await expect(rowFor(page, 'Gmail')).toContainText('Dirección no válida');
    expect(await page.locator('.lint a[href]').count()).toBe(0);
    const html = await page.content();
    expect(html).not.toMatch(/javascript:alert|evil\.example|<script>alert/);
    await page.unroute('**/*');
  }
});

test('un endpoint fallido no afecta a los demás; el reintento es local', async ({ page }) => {
  let healthy = false;
  const api = await open(page, { continuity: { body: status({ protected: true }) }, workspace: () => healthy ? { body: { origin: 'https://team.example.com' } } : { status: 500, body: { error: 'fallo interno' } } });
  await expect(rowFor(page, 'Gmail')).toContainText('No se pudo consultar');
  await expect(rowFor(page, 'HubSpot')).toContainText('Sin conectar');
  await expect(page.getByRole('group', { name: 'Espacio local' })).toContainText('Configurada');
  expect(api.counts).toEqual({ continuity: 1, catalog: 1, workspace: 1 });
  healthy = true;
  await rowFor(page, 'Gmail').getByRole('button', { name: 'Reintentar' }).click();
  await teamTools(page).click();
  await expect(rowFor(page, 'Gmail')).toContainText('Sin comprobar aquí');
  expect(api.counts).toEqual({ continuity: 1, catalog: 1, workspace: 2 });
  // Tras un reintento fallido se conservan los datos anteriores y se avisa.
  healthy = false;
  await page.getByRole('button', { name: 'Actualizar estado' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'No se pudo actualizar la dirección del espacio de equipo' })).toBeVisible();
  await expect(rowFor(page, 'Gmail')).toContainText('Sin comprobar aquí');
  await expect(rowFor(page, 'HubSpot')).toContainText('Sin conectar');
});

test('catálogo caído: el resto se ve y el detalle de ensayo muestra error local', async ({ page }) => {
  await open(page, { catalog: { status: 503, body: { error: 'no disponible' } }, workspace: { body: { origin: 'https://team.example.com' } } });
  await teamTools(page).click();
  await expect(rowFor(page, 'Gmail')).toContainText('Sin comprobar aquí');
  await page.getByText('Ver capacidades de ensayo').click();
  await expect(page.getByRole('alert').filter({ hasText: 'No se pudo leer el catálogo' })).toBeVisible();
  await expect(rowFor(page, 'Gmail')).not.toContainText('solo existe como ensayo');
});

test('catálogo vacío', async ({ page }) => {
  await open(page, { catalog: { body: { integrations: [] } } });
  await page.getByText('Ver capacidades de ensayo').click();
  await expect(page.getByText('El catálogo no declara capacidades.')).toBeVisible();
});

test('respuesta antigua tardía (transporte sin cancelación) no pisa la nueva', async ({ page }) => {
  // El fetch del navegador se envuelve para ignorar la señal: solo la guarda de secuencia puede proteger.
  await page.addInitScript(() => { const real = window.fetch.bind(window); window.fetch = (input: RequestInfo | URL, init?: RequestInit) => real(input, init ? { ...init, signal: undefined } : init); });
  const old = gate();
  const api = await open(page, { continuity: async count => { if (count === 1) { await old.promise; return { body: status({ runtime: true }) }; } return { body: status({ protected: true, connection }) }; } }, undefined, false);
  await page.goto(base + '/');
  await expect(page.locator('.lint[aria-busy="true"]')).toBeVisible();
  await page.getByRole('button', { name: 'Actualizar estado' }).click();
  await expect(rowFor(page, 'HubSpot')).toContainText('Lectura configurada');
  old.release();
  await sleep(300);
  await expect(rowFor(page, 'HubSpot')).toContainText('Lectura configurada');
  await expect(page.locator('.lint')).not.toContainText('No disponible en este paquete');
  expect(api.counts.continuity).toBe(2);
});

test('desmontaje con respuesta pendiente: sin errores y sin repintar', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message)); page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  const pending = gate();
  await open(page, { continuity: async () => { await pending.promise; return { body: status() }; } });
  await expect(page.getByRole('group', { name: 'Espacio local' })).toContainText('Leyendo el estado');
  await page.evaluate(() => (window as any).__unmount());
  pending.release(); await sleep(300);
  expect(await page.locator('#root').innerHTML()).toBe('');
  expect(errors).toEqual([]);
});

test('carga sin respuesta: estado de lectura y, pasado el límite, error con reintento (sin spinner infinito)', async ({ page }) => {
  await page.clock.install();
  await open(page, { continuity: 'hang' });
  await expect(page.getByRole('group', { name: 'Espacio local' })).toContainText('Leyendo el estado');
  await expect(rowFor(page, 'HubSpot')).toContainText('Comprobando…');
  await page.clock.fastForward(16_000);
  await expect(page.getByRole('group', { name: 'Espacio local' })).toContainText('No se pudo leer el estado de esta instalación');
  await expect(rowFor(page, 'HubSpot')).toContainText('No se pudo consultar');
  await expect(rowFor(page, 'HubSpot').getByRole('button', { name: 'Reintentar' })).toBeVisible();
  await expect(page.locator('.lint[aria-busy="true"]')).toHaveCount(0);
});

test('contrato incompatible se trata como error, no como datos', async ({ page }) => {
  await open(page, { continuity: { body: { hola: 'mundo' } } });
  await expect(rowFor(page, 'HubSpot')).toContainText('No se pudo consultar');
  await expect(page.getByRole('group', { name: 'Espacio local' })).toContainText('No se pudo leer');
});

for (const size of [{ width: 1440, height: 900 }, { width: 390, height: 844 }, { width: 320, height: 700 }]) {
  test('diseño ' + size.width + 'px: sin desbordamiento, objetivos táctiles y capturas', async ({ page }, testInfo) => {
    const mobile = size.width < 900;
    const scenes: [string, Partial<Pick<Api, 'continuity' | 'catalog' | 'workspace'>>][] = [
      ['sin-cuenta', { continuity: { body: status({ latestCapture: capture, latestCaptureAt: capture.capturedAt, operations: { lastAttempt: null, lastSuccess: null, error: { at: '2026-11-01T11:00:00.000Z', message: 'La captura no se completó; la copia anterior se conserva.', action: 'x' }, paused: false } }) } }],
      ['declarada-con-equipo', { continuity: { body: status({ protected: true, connection, latestCapture: capture }) }, catalog: { body: catalog('readonly') }, workspace: { body: { origin: 'https://equipo-comercial.example.com' } } }],
      ['errores', { continuity: { status: 500, body: { error: 'x' } }, workspace: { status: 500, body: { error: 'x' } }, catalog: { status: 500, body: { error: 'x' } } }],
    ];
    fs.mkdirSync(path.join(root, 'shots'), { recursive: true });
    for (const [name, api] of scenes) {
      await open(page, api, size);
      await expect(rowFor(page, 'HubSpot')).not.toContainText('Comprobando…');
      if (name === 'declarada-con-equipo') await teamTools(page).click();
      await expect(rowFor(page, 'Gmail')).not.toContainText('Comprobando…');
      await page.getByText('Ver capacidades de ensayo').click();
      await expect(page.locator('details.lint-rehearsal').filter({ has: page.getByText('Ver capacidades de ensayo', { exact: true }) })).toHaveJSProperty('open', true);
      const layout = await page.evaluate(() => {
        const width = document.documentElement.clientWidth;
        const outside = [...document.querySelectorAll('.lint *')].filter(node => { const rect = node.getBoundingClientRect(); return rect.width > 0 && getComputedStyle(node).position !== 'absolute' && (rect.right > width + 0.5 || rect.left < -0.5); }).map(node => node.tagName + '.' + String((node as HTMLElement).className));
        const small = [...document.querySelectorAll('.lint a[href], .lint button, .lint summary')].filter(node => { const rect = node.getBoundingClientRect(); return rect.width > 0 && rect.height < (window.innerWidth < 900 ? 43.5 : 31.5); }).map(node => (node.textContent ?? '').trim().slice(0, 40));
        const unnamed = [...document.querySelectorAll('.lint a[href], .lint button')].filter(node => !(node.textContent ?? '').trim() && !node.getAttribute('aria-label')).length;
        return { width, scroll: document.documentElement.scrollWidth, outside, small, unnamed };
      });
      expect(layout.scroll, name + ' desplazamiento horizontal').toBeLessThanOrEqual(layout.width);
      expect(layout.outside, name + ' elementos fuera de la ventana').toEqual([]);
      expect(layout.small, name + ' objetivos pequeños' + (mobile ? ' (móvil)' : '')).toEqual([]);
      expect(layout.unnamed).toBe(0);
      const file = path.join(root, 'shots', name + '-' + size.width + '.png');
      await page.screenshot({ path: file, fullPage: true });
      await testInfo.attach(name + '-' + size.width, { path: file, contentType: 'image/png' });
      await page.unroute('**/*');
    }
  });
}
