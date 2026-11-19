import { test, expect, type Page } from '@playwright/test';
import { build } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawn, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { lockButton, place } from './menu';

const baseRoot = process.env.PLANB_AUTH158_ROOT!;
let root = '';
const password = 'fiction-only-auth-order158';
let child: ChildProcess | undefined, origin = '', pid: number | undefined;
const gate = () => { let release!: () => void; const promise = new Promise<void>(resolve => { release = resolve; }); return { promise, release }; };
// Lugares del menú en escritorio (menú lateral) o en el móvil (barra inferior): ver tests/e2e/menu.ts.
const nav = (page: Page, name: string) => place(page, name);
test.setTimeout(90_000);
test.beforeAll(async () => {
  if (!baseRoot) throw Error('158 requires a private root');
  root = path.resolve(baseRoot, 'worker-' + randomUUID());
  if (fs.existsSync(root)) throw Error('158 requires a new worker folder');
  fs.mkdirSync(root, { recursive: true });
  await build({ root: process.cwd(), configFile: false, envDir: path.join(root, 'empty-env'), plugins: [react()], logLevel: 'error', build: { outDir: path.join(root, 'dist'), emptyOutDir: false } });
  const url = (p: string) => JSON.stringify(pathToFileURL(path.resolve(p)).href);
  fs.writeFileSync(path.join(root, 'server.mts'), `import{createBaseApp}from${url('server/app.ts')};import{registerTeamSync}from${url('server/team-sync.ts')};import{makeFixture,makeDemoSpec}from${url('shared/fixtures.ts')};const{app,store}=await createBaseApp({root:process.env.ROOT!,dbPath:':memory:',staticDir:process.env.ROOT!+'/dist'});registerTeamSync(app,store,undefined,false,async()=>{throw Error('No provider');});const s=makeFixture('agency');store.importSnapshot(s);store.saveGeneration(makeDemoSpec(s),{provider:'demo',model:null,prompt:'',generatedAt:'2026-11-04T14:00:00Z',approved:false});store.activate();await app.listen({host:'127.0.0.1',port:0});console.log('LISTEN '+(app.server.address() as{port:number}).port);for(const s of['SIGTERM','SIGINT'] as const)process.on(s,()=>{void app.close().then(()=>process.exit(0));});`);
});
test.beforeEach(async ({ page }) => {
  child = spawn(process.execPath, ['--require', path.resolve('scripts/block-external.cjs'), '--import', 'tsx', path.join(root, 'server.mts')], { cwd: process.cwd(), env: { ...process.env, ROOT: root }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  pid = child.pid; let output = '';
  const port = await new Promise<number>((resolve, reject) => { const timer = setTimeout(() => reject(Error('158 fixture timeout ' + output)), 30_000); child!.stdout!.on('data', b => { output += b; const m = /LISTEN (\d+)/.exec(output); if (m) { clearTimeout(timer); resolve(Number(m[1])); } }); child!.stderr!.on('data', b => { output += b; }); child!.once('close', () => { clearTimeout(timer); reject(Error('158 fixture closed ' + output)); }); });
  origin = 'http://127.0.0.1:' + port;
  await page.route('**/*', route => new URL(route.request().url()).origin === origin ? route.fallback() : route.abort());
  expect((await page.request.post(origin + '/api/v2/auth/setup', { data: { password } })).ok()).toBe(true);
});
test.afterEach(async ({ page }) => {
  await page.unrouteAll({ behavior: 'ignoreErrors' }); await page.goto('about:blank');
  if (child && child.exitCode === null && child.signalCode === null) { const closed = new Promise<void>(r => child!.once('close', () => r())); child.kill(); await closed; }
  let absent = false; for (let n = 0; pid && n < 500; n++) { try { process.kill(pid, 0); } catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ESRCH') throw e; absent = true; break; } await new Promise(r => setTimeout(r, 20)); }
  fs.writeFileSync(path.join(root, 'stopped-' + pid + '.json'), JSON.stringify({ pid, absent })); expect(absent).toBe(true); child = undefined;
});
const status = async (page: Page) => page.request.get(origin + '/api/v2/auth/status').then(r => r.json());
async function open(page: Page) { await page.goto(origin); await expect(nav(page, 'Hoy')).toBeVisible(); await nav(page, 'Hoy').click(); await expect(page.locator('.lop-tasks li').first()).toBeVisible(); }
async function login(page: Page) { await page.locator('.protection-page').getByLabel('Contraseña local', { exact: true }).fill(password); await page.locator('.protection-page').getByRole('button', { name: 'Desbloquear', exact: true }).click(); }
async function settled(page: Page) { await page.evaluate(() => new Promise<void>(r => requestAnimationFrame(() => requestAnimationFrame(() => r())))); }
async function watchApp(page: Page) { await page.evaluate(() => { const w = window as Window & { sawApp158?: boolean }; w.sawApp158 = false; new MutationObserver(() => { if (document.querySelector('.sidebar')) w.sawApp158 = true; }).observe(document.body, { childList: true, subtree: true }); }); }
const sawApp = (page: Page) => page.evaluate(() => (window as Window & { sawApp158?: boolean }).sawApp158);

for (const localButton of [false, true]) test('an old authenticated status cannot reopen cached App after ' + (localButton ? 'the local lock button confirms' : 'a newer status confirms the lock'), async ({ page }) => {
  await open(page); const held = gate(), entered = gate(), stateBarrier = gate(); let statuses = 0, blockState = false, extraState = 0;
  await page.route('**/api/v2/state', async route => { if (blockState) { extraState++; await stateBarrier.promise; } await route.fallback(); });
  await page.route('**/api/v2/auth/status', async route => {
    if (++statuses !== 1) return route.fallback();
    const response = await route.fetch(); expect((await response.json()).authenticated).toBe(true); entered.release(); await held.promise;
    await route.fulfill({ response, headers: { ...response.headers(), 'x-auth158': 'old' } });
  });
  try {
    await page.evaluate(() => window.dispatchEvent(new Event('planb:locked'))); await entered.promise;
    if (localButton) await lockButton(page).click();
    else { expect((await page.request.post(origin + '/api/v2/auth/lock', { data: {} })).ok()).toBe(true); await page.evaluate(() => window.dispatchEvent(new Event('planb:locked'))); }
    await expect(page.locator('.protection-page').getByLabel('Contraseña local', { exact: true })).toBeVisible(); expect((await status(page)).authenticated).toBe(false);
    const blockedStatus = (await page.request.get(origin + '/api/v2/records/contacts/contact-1')).status(); expect(blockedStatus).toBe(401); await watchApp(page);
    blockState = true; const response = page.waitForResponse(r => r.headers()['x-auth158'] === 'old'); held.release(); await (await response).finished(); await settled(page);
    const sawCachedApp = await sawApp(page); fs.writeFileSync(path.join(root, 'observed-' + (localButton ? 'button' : 'newer-gate') + '.json'), JSON.stringify({ blockedStatus, sawCachedApp, extraState })); expect(sawCachedApp).toBe(false);
    await expect(page.locator('.protection-page')).toHaveCount(1); await expect(page.locator('.sidebar')).toHaveCount(0); expect(extraState).toBe(0);
    expect((await page.request.get(origin + '/api/v2/records/contacts/contact-1')).status()).toBe(401);
  } finally { held.release(); stateBarrier.release(); }
});

test('an old locked status cannot revoke a newer successful login', async ({ page }) => {
  await open(page); await lockButton(page).click(); await expect(page.locator('.protection-page')).toBeVisible();
  const held = gate(), entered = gate(); let statuses = 0;
  await page.route('**/api/v2/auth/status', async route => {
    if (++statuses !== 1) return route.fallback(); const response = await route.fetch(); expect((await response.json()).authenticated).toBe(false); entered.release(); await held.promise;
    await route.fulfill({ response, headers: { ...response.headers(), 'x-auth158': 'old-locked' } });
  });
  try {
    await page.evaluate(() => window.dispatchEvent(new Event('planb:locked'))); await entered.promise; await login(page); await expect(nav(page, 'Hoy')).toBeVisible();
    expect((await status(page)).authenticated).toBe(true); const response = page.waitForResponse(r => r.headers()['x-auth158'] === 'old-locked'); held.release(); await (await response).finished(); await settled(page);
    await expect(page.locator('.protection-page')).toHaveCount(0); await expect(nav(page, 'Hoy')).toBeVisible();
    expect((await page.request.get(origin + '/api/v2/records/contacts/contact-1')).status()).toBe(200);
  } finally { held.release(); }
});

test('a state response captured before a newer lock cannot complete an obsolete login', async ({ page }) => {
  await open(page); await lockButton(page).click(); await expect(page.locator('.protection-page')).toBeVisible();
  const held = gate(), entered = gate(), reads = gate(); let states = 0, blockReads = false;
  await page.route('**/api/**', async route => { const p = new URL(route.request().url()).pathname; if (blockReads && !p.startsWith('/api/v2/auth/') && p !== '/api/health') await reads.promise; await route.fallback(); });
  await page.route('**/api/v2/state', async route => {
    if (++states !== 1) return route.fallback(); const response = await route.fetch(); expect(response.status()).toBe(200); entered.release(); await held.promise;
    await route.fulfill({ response, headers: { ...response.headers(), 'x-auth158': 'old-state' } });
  });
  try {
    await login(page); await entered.promise; expect((await page.request.post(origin + '/api/v2/auth/lock', { data: {} })).ok()).toBe(true);
    await page.evaluate(() => window.dispatchEvent(new Event('planb:locked'))); await expect(page.locator('.protection-page').getByLabel('Contraseña local', { exact: true })).toBeVisible();
    const blockedStatus = (await page.request.get(origin + '/api/v2/records/contacts/contact-1')).status(); expect(blockedStatus).toBe(401); await watchApp(page);
    blockReads = true; const response = page.waitForResponse(r => r.headers()['x-auth158'] === 'old-state'); held.release(); await (await response).finished(); await settled(page);
    const sawCachedApp = await sawApp(page); fs.writeFileSync(path.join(root, 'observed-old-login.json'), JSON.stringify({ blockedStatus, sawCachedApp })); expect(sawCachedApp).toBe(false); await expect(page.locator('.sidebar')).toHaveCount(0);
    await expect(page.locator('.protection-page').getByLabel('Contraseña local', { exact: true })).toBeVisible(); expect((await status(page)).authenticated).toBe(false);
    expect((await page.request.get(origin + '/api/v2/records/contacts/contact-1')).status()).toBe(401);
  } finally { held.release(); reads.release(); }
});
