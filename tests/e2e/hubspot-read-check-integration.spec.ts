import { test, expect, type Page } from '@playwright/test';
import { build as viteBuild } from 'vite';
import react from '@vitejs/plugin-react';
import { build as bundle } from 'esbuild';
import { createServer, type ServerResponse } from 'node:http';
import { spawn, type ChildProcess } from 'node:child_process';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Store } from '../../server/store.js';
import { seal } from '../../server/crypto.js';
import { makeDemoSpec, makeFixture } from '../../shared/fixtures.js';
import { READ_CHECK_ROUTE } from '../../shared/hubspot-read-check-api.js';

process.env.NODE_ENV = 'test';
// Normal main entry, App navigation and file-backed Store. Only the provider is fictional.
const repo = process.cwd();
const root = path.resolve(process.env.PLANB_MOUNT218_ROOT ?? path.join(repo, 'tests/.tmp/mount218-' + randomUUID()));
const portal = '12345', password = 'fictitious-password-for-mount218', token = 'fictitious-provider-key-mount218';
const expectedPaths = ['/account-info/2026-09/details', ...['contacts', 'companies', 'deals', 'tasks'].map(name => '/crm/objects/2026-09/' + name)];
const hash = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
function gate() {
  let release!: () => void;
  const promise = new Promise<void>(resolve => { release = resolve; });
  return { promise, release };
}

let providerOrigin = '', base = '', runtime = '', child: ChildProcess | undefined;
let seen: { method: string; path: string; authorized: boolean }[] = [];
let hold: ReturnType<typeof gate> | null = null;
let providerMode: 'ok' | 'partial' = 'ok';
const children: { pid: number; closed: boolean }[] = [];
const provider = createServer(async (request, response) => {
  const url = new URL(request.url!, 'http://fixture.invalid');
  seen.push({ method: request.method!, path: url.pathname, authorized: request.headers.authorization === 'Bearer ' + token });
  if (url.pathname === expectedPaths[0] && hold) await hold.promise;
  if (response.destroyed) return;
  response.setHeader('Content-Type', 'application/json');
  if (providerMode === 'partial' && url.pathname.endsWith('/deals')) { response.statusCode = 403; response.end('{}'); return; }
  response.end(JSON.stringify(url.pathname === expectedPaths[0] ? { portalId: portal, accountType: 'SANDBOX' } : { results: [{ id: 'fixture-record', properties: { email: 'canary@fixture.invalid' } }] }));
});

test.beforeAll(async () => {
  const workspace = path.resolve(process.env.PLANB_MOUNT218_WORKSPACE ?? repo);
  expect(root.startsWith(path.join(workspace, 'tests/.tmp') + path.sep)).toBe(true);
  expect(fs.existsSync(root)).toBe(false);
  fs.mkdirSync(root, { recursive: true });
  await new Promise<void>(resolve => provider.listen(0, '127.0.0.1', resolve));
  providerOrigin = 'http://127.0.0.1:' + (provider.address() as { port: number }).port;
  await viteBuild({
    root: repo, configFile: false, envDir: path.join(root, 'empty-env'), base: './',
    plugins: [react()], logLevel: 'error',
    build: { outDir: path.join(root, 'ui'), emptyOutDir: false, minify: false },
  });
  await bundle({ entryPoints: [path.join(repo, 'server/main.ts')], outfile: path.join(root, 'server.mjs'), bundle: true, platform: 'node', format: 'esm', packages: 'external', logLevel: 'error' });
  const preload = `require(${JSON.stringify(path.join(repo, 'scripts/block-external.cjs'))});const localFetch=globalThis.fetch;globalThis.fetch=(input,init)=>{const url=new URL(typeof input==='string'||input instanceof URL?input:input.url);return localFetch(url.origin==='https://api.hubapi.com'?${JSON.stringify(providerOrigin)}+url.pathname+url.search:input,init);};`;
  fs.writeFileSync(path.join(root, 'provider.cjs'), preload);
  fs.writeFileSync(path.join(root, 'build-sha256.json'), JSON.stringify({ main: hash(fs.readFileSync(path.join(root, 'server.mjs'))), provider: 'fictional-loopback' }));
});

async function start(mode: 'test' | 'production_readonly' | 'none' = 'test', existing = false) {
  if (!existing) {
    runtime = fs.mkdtempSync(path.join(root, 'runtime-'));
    fs.cpSync(path.join(root, 'ui'), path.join(runtime, 'dist'), { recursive: true });
    const data = path.join(runtime, 'fixture-data');
    fs.mkdirSync(data);
    const key = randomBytes(32);
    fs.writeFileSync(path.join(data, '.planb-key'), JSON.stringify({ kind: 'test', data: key.toString('base64') }), { flag: 'wx' });
    const store = new Store(path.join(data, 'planb.sqlite'));
    try {
      const snapshot = makeFixture('agency');
      store.importSnapshot(snapshot);
      store.saveGeneration(makeDemoSpec(snapshot), { provider: 'demo', model: null, generatedAt: snapshot.capturedAt, prompt: '', approved: false });
      store.activate();
      if (mode !== 'none') {
        store.set('hubspotConnection', seal(JSON.stringify({ token, accountId: portal, mode }), key));
        store.set('connectionPublic', { accountId: portal, mode, accountType: 'NOT_VERIFIED', verifiedAt: null });
      }
    } finally { store.close(); }
  }
  const probe = createServer();
  await new Promise<void>(resolve => probe.listen(0, '127.0.0.1', resolve));
  const port = (probe.address() as { port: number }).port;
  await new Promise<void>(resolve => probe.close(() => resolve()));
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => ['path', 'systemroot', 'windir', 'comspec', 'pathext', 'temp', 'tmp', 'tmpdir', 'lang', 'tz'].includes(key.toLowerCase())));
  child = spawn(process.execPath, ['--require', path.join(root, 'provider.cjs'), path.join(root, 'server.mjs')], {
    cwd: runtime, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...env, NODE_ENV: 'test', PLANB_PORT: String(port), PLANB_DATA_DIR: path.join(runtime, 'fixture-data') },
  });
  children.push({ pid: child.pid!, closed: false });
  let output = '';
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Main did not start: ' + output)), 35_000);
    child!.stdout!.on('data', value => { output += String(value); if (output.includes('Abre http://127.0.0.1:' + port)) { clearTimeout(timer); resolve(); } });
    child!.stderr!.on('data', value => { output += String(value); });
    child!.once('exit', code => { clearTimeout(timer); reject(new Error('Main exited ' + code + ': ' + output)); });
  });
  base = 'http://127.0.0.1:' + port;
}
async function stop() {
  hold?.release();
  if (child && child.exitCode === null && child.signalCode === null) {
    const current = child;
    const closed = new Promise<void>(resolve => current.once('close', () => resolve()));
    current.kill();
    await closed;
  }
  if (child) children.find(item => item.pid === child!.pid)!.closed = true;
  child = undefined;
}
test.afterEach(async ({ page }) => { hold?.release(); await page.unrouteAll({ behavior: 'ignoreErrors' }); await stop(); hold = null; });
test.afterAll(async () => {
  await stop();
  provider.closeAllConnections();
  await new Promise<void>(resolve => provider.close(() => resolve()));
  if (fs.existsSync(root)) fs.writeFileSync(path.join(root, 'children.json'), JSON.stringify(children, null, 2));
});
test.beforeEach(() => { seen = []; hold = null; providerMode = 'ok'; });

async function open(page: Page, mode: Parameters<typeof start>[0] = 'test') {
  await start(mode);
  await page.route('**/*', route => new URL(route.request().url()).origin === base ? route.fallback() : route.abort());
  const setup = await page.request.post(base + '/api/v2/auth/setup', { data: { password } });
  expect(setup.status()).toBe(200);
  await page.goto(base);
  await expect(page).toHaveTitle('Plan B · Tu CRM sigue contigo');
  await page.locator('.sidebar').getByRole('button', { name: 'Integraciones', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Integraciones', exact: true })).toBeVisible();
  await expect(page.locator('.hrc')).toBeVisible();
  await expect(page.locator('.hrc')).toHaveAttribute('aria-busy', 'false');
}
async function authorize(page: Page) {
  await page.getByRole('button', { name: 'Comprobar lectura', exact: true }).click();
  await expect(page.getByRole('group', { name: 'Autorizar comprobación de lectura' })).toContainText('Portal ' + portal);
  await page.getByRole('button', { name: 'Autorizar cinco lecturas' }).click();
}
async function screenshot(page: Page, name: string) {
  await page.locator('.hrc').scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(root, name + '.png') });
}

test('navegación normal y consentimiento: cinco GET exactos, resultado persistido, actualizar solo lee estado y reiniciar main conserva la observación', async ({ page }) => {
  const errors: string[] = [];
  const consoleErrors: string[] = [];
  page.on('pageerror', error => errors.push(String(error)));
  page.on('console', message => { if (message.type() === 'error' || message.type() === 'warning') consoleErrors.push(message.text()); });
  await open(page);
  expect(seen).toEqual([]);
  await page.getByRole('button', { name: 'Comprobar lectura', exact: true }).click();
  await page.getByRole('button', { name: 'Volver', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Comprobar lectura', exact: true })).toBeFocused();
  expect(seen).toEqual([]);
  await authorize(page);
  await expect(page.locator('.hrc-status')).toContainText('Lectura comprobada');
  expect(seen.map(item => item.path)).toEqual(expectedPaths);
  expect(seen.every(item => item.method === 'GET' && item.authorized)).toBe(true);
  await expect(page.locator('.hrc')).toContainText('Contactos');
  await expect(page.locator('.hrc')).not.toContainText('canary@fixture.invalid');
  await expect(page.locator('.lint-row').filter({ has: page.getByRole('heading', { name: 'HubSpot', exact: true }) })).not.toContainText('El acceso actual no se comprueba desde esta pantalla');
  await page.getByRole('button', { name: 'Actualizar estado', exact: true }).click();
  await expect(page.locator('.hrc-status')).toContainText('Lectura comprobada');
  expect(seen).toHaveLength(5);
  const state = await page.request.get(base + '/api/v2/state').then(r => r.json());
  expect(state.changes).toBe(0);
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await screenshot(page, 'checked-' + width);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  const html = await page.request.get(base).then(r => r.text());
  const assets = [...html.matchAll(/(?:src|href)="([^"]+\.(?:js|css))"/g)].map(match => match[1]);
  expect(assets.length).toBeGreaterThan(0);
  for (const asset of assets) {
    const response = await page.request.get(new URL(asset, base).href);
    expect(response.ok()).toBe(true);
    const disk = fs.readFileSync(path.join(runtime, 'dist', new URL(asset, base).pathname));
    expect(hash(await response.body())).toBe(hash(disk));
  }
  await stop(); await start('test', true);
  await page.unrouteAll();
  await page.route('**/*', route => new URL(route.request().url()).origin === base ? route.fallback() : route.abort());
  await page.goto(base);
  await page.getByLabel('Contraseña local', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Desbloquear', exact: true }).click();
  await page.locator('.sidebar').getByRole('button', { name: 'Integraciones', exact: true }).click();
  await expect(page.locator('.hrc-status')).toContainText('Lectura comprobada');
  expect(seen).toHaveLength(5);
  expect(errors).toEqual([]);
  expect(consoleErrors).toEqual([]);
  fs.writeFileSync(path.join(root, 'normal-flow.json'), JSON.stringify({ errors, consoleErrors, providerReads: seen.length, changes: state.changes, servedAssets: assets.length, restarted: true }));
});

test('doble clic y navegación durante una comprobación no inician otra; consultar después muestra el resultado', async ({ page }) => {
  await open(page);
  hold = gate();
  await page.getByRole('button', { name: 'Comprobar lectura', exact: true }).click();
  await page.getByRole('button', { name: 'Autorizar cinco lecturas' }).evaluate(button => { (button as HTMLButtonElement).click(); (button as HTMLButtonElement).click(); });
  await expect.poll(() => seen.length).toBe(1);
  await page.locator('.sidebar').getByRole('button', { name: 'Continuidad', exact: true }).click();
  await page.locator('.sidebar').getByRole('button', { name: 'Integraciones', exact: true }).click();
  await expect(page.locator('.hrc')).toContainText('Hay una comprobación en curso');
  await expect(page.getByRole('button', { name: 'Comprobar lectura', exact: true })).toBeDisabled();
  hold.release();
  await expect.poll(() => seen.length).toBe(5);
  await page.getByRole('button', { name: 'Actualizar resultado' }).click();
  await expect(page.locator('.hrc-status')).toContainText('Lectura comprobada');
  expect(seen).toHaveLength(5);
});

test('cancelar con identidad retenida detiene el recorrido y una respuesta tardía no acredita lectura', async ({ page }) => {
  await open(page); hold = gate();
  await authorize(page); await expect.poll(() => seen.length).toBe(1);
  await page.getByRole('button', { name: 'Cancelar comprobación' }).click();
  await expect(page.locator('.hrc')).not.toHaveAttribute('aria-busy', 'true');
  hold.release();
  await page.getByRole('button', { name: 'Actualizar resultado' }).click();
  await expect(page.locator('.hrc')).not.toHaveAttribute('aria-busy', 'true');
  await expect(page.locator('.hrc-status')).not.toContainText('Lectura comprobada');
  expect(seen).toHaveLength(1);
});

test('bloquear mientras se espera identidad revoca la autorización y no salen lecturas de objetos', async ({ page }) => {
  await open(page); hold = gate();
  await authorize(page); await expect.poll(() => seen.length).toBe(1);
  await page.locator('.sidebar').getByRole('button', { name: 'Proteger / bloquear', exact: true }).click();
  await expect(page.locator('.protection-page')).toBeVisible();
  hold.release();
  await page.getByLabel('Contraseña local', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Desbloquear', exact: true }).click();
  await page.locator('.sidebar').getByRole('button', { name: 'Integraciones', exact: true }).click();
  await expect(page.locator('.hrc')).not.toHaveAttribute('aria-busy', 'true');
  await expect(page.locator('.hrc-status')).not.toContainText('Lectura comprobada');
  expect(seen).toHaveLength(1);
});

test('sin conexión o con producción la acción queda deshabilitada y no consulta al proveedor', async ({ page }) => {
  for (const mode of ['none', 'production_readonly'] as const) {
    await open(page, mode);
    await expect(page.getByRole('button', { name: 'Comprobar lectura', exact: true })).toBeDisabled();
    if (mode === 'production_readonly') await expect(page.locator('.hrc')).toContainText('solo está autorizada para cuentas de ensayo');
    expect(seen).toEqual([]);
    await stop();
    await page.unrouteAll();
  }
});

test('lectura parcial conserva el detalle y su fecha; caducar la observación en el navegador no hace nuevas solicitudes', async ({ page }) => {
  providerMode = 'partial';
  await page.clock.install({ time: new Date() });
  await open(page); await authorize(page);
  await expect(page.locator('.hrc-status')).toContainText('Lectura parcial');
  await expect(page.locator('.hrc-observation')).toContainText('Sin permiso');
  expect(seen).toHaveLength(5);
  await page.clock.fastForward(16 * 60_000);
  await expect(page.locator('.hrc-status')).toContainText('Comprobación caducada');
  await expect(page.locator('.hrc-observation')).toContainText('Observación del');
  expect(seen).toHaveLength(5);
});

test('una lectura de estado antigua no reaparece cuando el transporte ignora abort', async ({ page }) => {
  await page.addInitScript(() => {
    const native = window.fetch.bind(window);
    window.fetch = (input, init) => {
      const url = new URL(typeof input === 'string' || input instanceof URL ? String(input) : input.url, location.href);
      return native(input, url.pathname === '/api/v2/connection/read-check' && (init?.method ?? 'GET') === 'GET' ? { ...init, signal: undefined } : init);
    };
  });
  await open(page); await authorize(page);
  await expect(page.locator('.hrc-status')).toContainText('Lectura comprobada');
  const old = gate();
  let calls = 0;
  await page.route('**' + READ_CHECK_ROUTE, async route => {
    if (route.request().method() !== 'GET') return route.fallback();
    calls++;
    if (calls === 1) {
      const response = await route.fetch();
      await old.promise;
      await route.fulfill({ response });
    } else {
      await route.fulfill({ status: 503, json: { error: 'Fallo ficticio al leer el estado' } });
    }
  });
  try {
    await page.getByRole('button', { name: 'Actualizar resultado' }).click();
    await expect.poll(() => calls).toBe(1);
    await page.getByRole('button', { name: 'Actualizar estado', exact: true }).click();
    await expect(page.locator('.hrc')).toContainText('La respuesta no permite acreditar');
    old.release();
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await expect(page.locator('.hrc-status')).not.toContainText('Lectura comprobada');
    await expect(page.locator('.hrc [role=alert]')).toContainText('La respuesta no permite acreditar');
    expect(seen).toHaveLength(5);
  } finally { old.release(); }
});

for (const code of [404, 409, 422]) test('error de interfaz ' + code + ' se explica y no acredita una lectura', async ({ page }) => {
  await open(page);
  if (code === 404) {
    await page.route('**' + READ_CHECK_ROUTE, route => route.fulfill({ status: 404, contentType: 'text/plain', body: 'Ruta no disponible' }));
    await page.getByRole('button', { name: 'Actualizar resultado' }).click();
    await expect(page.locator('.hrc')).toContainText('Esta versión del servidor');
  } else {
    const state = await page.request.get(base + READ_CHECK_ROUTE).then(response => response.json());
    await page.route('**' + READ_CHECK_ROUTE, route => route.request().method() === 'POST'
      ? route.fulfill({ status: code, json: { ...state, issue: code === 409 ? 'PORTAL_MISMATCH' : 'INVALID_REQUEST', message: 'Confirma de nuevo el portal y las cinco lecturas.' } })
      : route.fallback());
    await authorize(page);
    await expect(page.locator('.hrc [role=alert]')).toContainText('Confirma de nuevo');
  }
  await expect(page.locator('.hrc-status')).not.toContainText('Lectura comprobada');
  expect(seen).toEqual([]);
});

