import { test, expect, type Page } from '@playwright/test';
import { build as viteBuild } from 'vite';
import react from '@vitejs/plugin-react';
import { build as bundle } from 'esbuild';
import { createServer } from 'node:http';
import { spawn, type ChildProcess } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Store } from '../../server/store.js';
import { seal } from '../../server/crypto.js';
import { makeDemoSpec, makeFixture } from '../../shared/fixtures.js';

process.env.NODE_ENV = 'test';
// UNIDAD 253 · Continuidad en la App COMPILADA: `server/main.ts` real (SQLite de archivo, red externa bloqueada, proveedor ficticio de loopback) y la interfaz real compilada desde una PROYECCIÓN del código
// en la que se aplica el parche de `App.tsx` descrito en coordination/plans/MONTAJE-APP-253.md (App.tsx NO se edita: lo integra su dueño). Si el parche deja de encajar con el App.tsx actual, esta prueba falla.
// Qué prueba: Continuidad desde el menú → bloque del hub con el estado REAL de cada fuente → «Abrir Integraciones» navega al panel existente (218) con vuelta clara → consentimiento (cancelar sin tráfico,
// confirmar = cinco GET) → volver y ver la misma observación → 1440/390/320 y teclado. NO prueba: evidencia de copia ni ensayo de relevo registrados en main (pendientes de Codex), ni HubSpot real.
const repo = process.cwd(), root = path.resolve(process.env.PLANB_HOME253_ROOT ?? path.join(repo, 'tests', '.tmp', 'home253-' + randomUUID().slice(0, 8)));
const portal = '12345', password = 'contraseña-ficticia-253', token = 'pat-ficticio-253-secreto';
const expectedPaths = ['/account-info/2026-09/details', ...['contacts', 'companies', 'deals', 'tasks'].map(name => '/crm/objects/2026-09/' + name)];
/** El parche de App.tsx (fuente única; el plan lo documenta). Cada ancla debe existir exactamente una vez. */
const APP_PATCH: [string, string][] = [
  ["const [page, setPage] = useState<'continuity' | 'changes' | 'prepare' | 'workspace' | 'export' | 'today' | 'agents' | 'integrations' | 'team-sync'>('continuity');",
   "const [page, setPage] = useState<'continuity' | 'changes' | 'prepare' | 'workspace' | 'export' | 'today' | 'agents' | 'integrations' | 'team-sync'>('continuity');\n  const [integrationsFrom, setIntegrationsFrom] = useState<'continuity' | null>(null), [returnedFrom, setReturnedFrom] = useState<'integrations' | null>(null);\n  useEffect(() => { if (page !== 'integrations') setIntegrationsFrom(null); }, [page]);"],
  ["exportCopy={()=>setPage('export')} connectRequest={connectRequest}/>",
   "exportCopy={()=>setPage('export')} connectRequest={connectRequest} onOpenToday={()=>{setPage('today');setSelected(null);}} onOpenIntegrations={()=>{setIntegrationsFrom('continuity');setPage('integrations');setSelected(null);}} returnedFrom={returnedFrom} onReturnHandled={()=>setReturnedFrom(null)}/>"],
  [":page==='integrations'?<LocalIntegrations onConnectHubspot={()=>{setPage('continuity');setSelected(null);setConnectRequest(n=>n+1);}}/>",
   ":page==='integrations'?<>{integrationsFrom?<p className=\"back-link\"><button type=\"button\" className=\"text-button\" onClick={()=>{setIntegrationsFrom(null);setPage('continuity');setSelected(null);setReturnedFrom('integrations');}}>← Volver a Continuidad</button></p>:null}<LocalIntegrations onConnectHubspot={()=>{setPage('continuity');setSelected(null);setConnectRequest(n=>n+1);}}/></>"],
];
let providerOrigin = '', base = '', runtime = '', child: ChildProcess | undefined, seen: string[] = [];
const provider = createServer((request, response) => {
  const url = new URL(request.url!, 'http://fixture.invalid'); seen.push(request.method + ' ' + url.pathname); response.setHeader('Content-Type', 'application/json');
  response.end(JSON.stringify(url.pathname === expectedPaths[0] ? { portalId: portal, accountType: 'SANDBOX' } : { results: [{ id: 'fixture-record' }] }));
});
test.beforeAll(async () => {
  expect(fs.existsSync(root)).toBe(false); fs.mkdirSync(root, { recursive: true });
  await new Promise<void>(resolve => provider.listen(0, '127.0.0.1', resolve)); providerOrigin = 'http://127.0.0.1:' + (provider.address() as { port: number }).port;
  // Proyección del código con el parche aplicado (App.tsx real intacto).
  const proj = path.join(root, 'proj'); fs.mkdirSync(proj, { recursive: true });
  for (const dir of ['src', 'shared', 'public']) fs.cpSync(path.join(repo, dir), path.join(proj, dir), { recursive: true });
  for (const file of ['index.html', 'package.json']) fs.copyFileSync(path.join(repo, file), path.join(proj, file));
  let app = fs.readFileSync(path.join(proj, 'src', 'App.tsx'), 'utf8');
  const alreadyMounted = APP_PATCH.every(([, replacement]) => app.includes(replacement));
  if (!alreadyMounted) {
    for (const [anchor, replacement] of APP_PATCH) { expect(app.split(anchor).length - 1, 'ancla del parche: ' + anchor.slice(0, 60)).toBe(1); app = app.replace(anchor, () => replacement); }
  }
  fs.writeFileSync(path.join(proj, 'src', 'App.tsx'), app);
  await viteBuild({ root: proj, configFile: false, envDir: path.join(root, 'empty-env'), base: './', plugins: [react()], logLevel: 'error', build: { outDir: path.join(root, 'ui'), emptyOutDir: false, minify: false } });
  await bundle({ entryPoints: [path.join(repo, 'server/main.ts')], outfile: path.join(root, 'server.mjs'), bundle: true, platform: 'node', format: 'esm', packages: 'external', logLevel: 'error' });
  fs.writeFileSync(path.join(root, 'provider.cjs'), `require(${JSON.stringify(path.join(repo, 'scripts/block-external.cjs'))});const localFetch=globalThis.fetch;globalThis.fetch=(input,init)=>{const url=new URL(typeof input==='string'||input instanceof URL?input:input.url);return localFetch(url.origin==='https://api.hubapi.com'?${JSON.stringify(providerOrigin)}+url.pathname+url.search:input,init);};`);
});
async function start() {
  runtime = fs.mkdtempSync(path.join(root, 'runtime-')); fs.cpSync(path.join(root, 'ui'), path.join(runtime, 'dist'), { recursive: true });
  const data = path.join(runtime, 'fixture-data'); fs.mkdirSync(data); const key = randomBytes(32);
  fs.writeFileSync(path.join(data, '.planb-key'), JSON.stringify({ kind: 'test', data: key.toString('base64') }), { flag: 'wx' });
  const store = new Store(path.join(data, 'planb.sqlite'));
  try {
    const snapshot = makeFixture('agency'); store.importSnapshot(snapshot); store.saveGeneration(makeDemoSpec(snapshot), { provider: 'demo', model: null, generatedAt: snapshot.capturedAt, prompt: '', approved: false }); store.activate();
    store.set('hubspotConnection', seal(JSON.stringify({ token, accountId: portal, mode: 'test' }), key)); store.set('connectionPublic', { accountId: portal, mode: 'test', accountType: 'NOT_VERIFIED', verifiedAt: null });
  } finally { store.close(); }
  const probe = createServer(); await new Promise<void>(resolve => probe.listen(0, '127.0.0.1', resolve)); const port = (probe.address() as { port: number }).port; await new Promise<void>(resolve => probe.close(() => resolve()));
  const env = Object.fromEntries(Object.entries(process.env).filter(([name]) => ['path', 'systemroot', 'windir', 'comspec', 'pathext', 'temp', 'tmp', 'tmpdir', 'lang', 'tz'].includes(name.toLowerCase())));
  child = spawn(process.execPath, ['--require', path.join(root, 'provider.cjs'), path.join(root, 'server.mjs')], { cwd: runtime, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], env: { ...env, NODE_ENV: 'test', PLANB_PORT: String(port), PLANB_DATA_DIR: data } });
  let output = ''; await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('main no arrancó: ' + output)), 40_000);
    child!.stdout!.on('data', value => { output += String(value); if (output.includes('Abre http://127.0.0.1:' + port)) { clearTimeout(timer); resolve(); } }); child!.stderr!.on('data', value => { output += String(value); });
    child!.once('exit', code => { clearTimeout(timer); reject(new Error('main terminó ' + code + ': ' + output)); });
  });
  base = 'http://127.0.0.1:' + port;
}
async function stop() { if (child && child.exitCode === null && child.signalCode === null) { const current = child; const closed = new Promise<void>(resolve => current.once('close', () => resolve())); current.kill(); await closed; } child = undefined; }
test.afterEach(async ({ page }) => { await page.unrouteAll({ behavior: 'ignoreErrors' }); await stop(); });
test.afterAll(async () => { await stop(); provider.closeAllConnections(); await new Promise<void>(resolve => provider.close(() => resolve())); });
test.beforeEach(() => { seen = []; });

const hub = (page: Page) => page.locator('.cph'), block = (page: Page) => page.getByTestId('continuity-hub-block'), src = (page: Page, key: string) => page.locator('.cph-sources [data-source="' + key + '"]');
const overflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
async function openContinuity(page: Page, size = { width: 1440, height: 900 }) {
  await start(); await page.setViewportSize(size); await page.route('**/*', route => new URL(route.request().url()).origin === base ? route.fallback() : route.abort());
  expect((await page.request.post(base + '/api/v2/auth/setup', { data: { password } })).status()).toBe(200);
  await page.goto(base); await expect(page).toHaveTitle('Plan B · Tu CRM sigue contigo');
  await page.locator('.sidebar').getByRole('button', { name: 'Continuidad', exact: true }).click();                                       // navegación normal
  await expect(block(page)).toBeVisible(); await expect(hub(page)).toHaveAttribute('aria-busy', 'false', { timeout: 20_000 });
}
const openMore = async (page: Page, summary: string) => { const details = page.locator('.imp details', { has: page.locator('summary', { hasText: summary }) }).first(); if (await details.count() && !(await details.evaluate(element => (element as HTMLDetailsElement).open))) await details.locator('summary').click(); };
const shot = async (page: Page, name: string, ti: { attach: (n: string, o: { path: string; contentType: string }) => Promise<void> }) => { const f = path.join(root, name + '.png'); await block(page).scrollIntoViewIfNeeded(); await page.screenshot({ path: f }); await ti.attach(name, { path: f, contentType: 'image/png' }); };
const integrationsButton = async (page: Page) => { await openMore(page, 'Sin comprobar'); return page.locator('.imp [data-row="access:hubspot"]').getByRole('button', { name: 'Abrir Integraciones' }); };

test('CONTINUIDAD → HUB: las fuentes muestran su estado REAL en la App compilada; abrir y recargar = cero tráfico al proveedor; «Abrir Integraciones» navega al panel existente con vuelta clara y foco', async ({ page }, ti) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(String(error)));
  await openContinuity(page);
  // Estado verdadero de cada fuente en `main` hoy: la lectura de HubSpot (218) está registrada; la evidencia de copia (239) y el relevo (216/224) NO lo están todavía.
  await expect(src(page, 'hubspot')).toHaveAttribute('data-state', 'read'); const copy = await src(page, 'copy').getAttribute('data-state'), relay = await src(page, 'relay').getAttribute('data-state');
  ti.annotations.push({ type: 'fuentes-en-main', description: 'copy=' + copy + ' hubspot=read relay=' + relay }); expect(['read', 'unavailable']).toContain(copy); expect(['read', 'unavailable']).toContain(relay);
  await expect(page.locator('.cpp')).toBeVisible(); await expect(page.locator('.imp')).toBeVisible(); await expect(page.locator('.cpp [data-section="read"]')).toContainText('credencial guardada');
  await page.reload(); await page.locator('.sidebar').getByRole('button', { name: 'Continuidad', exact: true }).click(); await expect(hub(page)).toHaveAttribute('aria-busy', 'false', { timeout: 20_000 }); expect(seen).toEqual([]);
  await shot(page, 'continuidad-1440', ti);
  const go = await integrationsButton(page); await go.click();                                                                                // «Abrir Integraciones» NAVEGA (no abre otro consentimiento)
  await expect(page.getByRole('heading', { name: 'Integraciones', exact: true })).toBeVisible(); await expect(page.locator('.hrc')).toBeVisible(); await expect(page.getByRole('group', { name: 'Autorizar comprobación de lectura' })).toHaveCount(0);
  const back = page.getByRole('button', { name: '← Volver a Continuidad' }); await expect(back).toBeVisible(); expect(seen).toEqual([]);
  await back.click(); await expect(block(page)).toBeVisible(); await expect(page.getByTestId('return-note')).toContainText('Has vuelto de Integraciones');
  await expect(page.locator('.cph > h2')).toBeFocused(); expect(seen).toEqual([]); expect(errors).toEqual([]);
  // Entrar por el menú NO ofrece «Volver» (no se llegó desde Continuidad).
  await page.locator('.sidebar').getByRole('button', { name: 'Integraciones', exact: true }).click(); await expect(page.getByRole('button', { name: '← Volver a Continuidad' })).toHaveCount(0);
});

test('GUION B3: Continuidad → Integraciones → cancelar el consentimiento (cero tráfico) → confirmar (cinco GET exactos) → volver → el hub muestra la MISMA observación; recargar y reiniciar main la conservan', async ({ page }, ti) => {
  await openContinuity(page); await (await integrationsButton(page)).click(); await expect(page.locator('.hrc')).toBeVisible();
  await page.getByRole('button', { name: 'Comprobar lectura', exact: true }).click(); await page.getByRole('button', { name: 'Volver', exact: true }).click(); expect(seen).toEqual([]);   // cancelar
  await page.getByRole('button', { name: 'Comprobar lectura', exact: true }).click(); await page.getByRole('button', { name: 'Autorizar cinco lecturas' }).click();
  await expect(page.locator('.hrc-status')).toContainText('Lectura comprobada', { timeout: 20_000 }); expect(seen).toEqual(['GET ' + expectedPaths[0], ...expectedPaths.slice(1).map(p => 'GET ' + p)]);
  await page.getByRole('button', { name: '← Volver a Continuidad' }).click(); await expect(hub(page)).toHaveAttribute('aria-busy', 'false', { timeout: 20_000 });
  await expect(page.locator('.cpp [data-section="read"]')).toContainText('Lectura comprobada de clientes, empresas, oportunidades, tareas', { timeout: 15_000 }); expect(seen).toHaveLength(5);                     // la misma observación, sin pedir nada nuevo
  await expect(page.locator('.imp [data-row="access:hubspot"]')).toHaveAttribute('data-status', 'ok'); await shot(page, 'continuidad-observada', ti);
  await page.reload(); await page.locator('.sidebar').getByRole('button', { name: 'Continuidad', exact: true }).click(); await expect(page.locator('.cpp [data-section="read"]')).toContainText('Lectura comprobada de', { timeout: 20_000 }); expect(seen).toHaveLength(5);
  await stop(); const dataDir = path.join(runtime, 'fixture-data'), port = new URL(base).port; await new Promise(r => setTimeout(r, 300));
  const env = Object.fromEntries(Object.entries(process.env).filter(([name]) => ['path', 'systemroot', 'windir', 'comspec', 'pathext', 'temp', 'tmp', 'tmpdir', 'lang', 'tz'].includes(name.toLowerCase())));
  child = spawn(process.execPath, ['--require', path.join(root, 'provider.cjs'), path.join(root, 'server.mjs')], { cwd: runtime, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], env: { ...env, NODE_ENV: 'test', PLANB_PORT: port, PLANB_DATA_DIR: dataDir } });
  await new Promise<void>((resolve, reject) => { const timer = setTimeout(() => reject(new Error('reinicio')), 40_000); child!.stdout!.on('data', v => { if (String(v).includes('Abre http://127.0.0.1:' + port)) { clearTimeout(timer); resolve(); } }); });
  expect((await page.request.post(base + '/api/v2/auth/login', { data: { password } })).ok()).toBe(true); await page.reload(); await page.locator('.sidebar').getByRole('button', { name: 'Continuidad', exact: true }).click();
  await expect(page.locator('.cpp [data-section="read"]')).toContainText('Lectura comprobada de', { timeout: 20_000 }); expect(seen).toHaveLength(5);
});

for (const width of [390, 320]) test('MÓVIL ' + width + ' px y TECLADO: el bloque cabe sin desbordamiento, el resumen del bloque es un control ≥ 44 px y «Abrir Integraciones» se alcanza y acciona con el teclado', async ({ page }, ti) => {
  await openContinuity(page, { width, height: 900 }); expect(await overflow(page)).toBe(true);
  const summary = block(page).locator('> summary'); expect((await summary.boundingBox())!.height).toBeGreaterThanOrEqual(43); await shot(page, 'continuidad-' + width, ti);
  const go = await integrationsButton(page); await go.focus(); await expect(go).toBeFocused(); await page.keyboard.press('Enter');
  await expect(page.locator('.hrc')).toBeVisible(); const back = page.getByRole('button', { name: '← Volver a Continuidad' }); await back.focus(); await page.keyboard.press('Enter');
  await expect(page.locator('.cph > h2')).toBeFocused(); expect(await overflow(page)).toBe(true); expect(seen).toEqual([]);
});
