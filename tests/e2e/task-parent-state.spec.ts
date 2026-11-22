import { test, expect, type Page } from '@playwright/test';
import { build } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawn, type ChildProcess } from 'node:child_process';
import { openSection, place } from './menu';

const root = process.env.PLANB_TASK151_ROOT!;
let child: ChildProcess | undefined, origin = '', pid: number | undefined;
// Lugares del menú en escritorio (menú lateral) o en el móvil (barra inferior): ver tests/e2e/menu.ts.
const nav = (page: Page, name: string) => place(page, name);
// B4.5: el recuento de cambios ya no se repite en la barra de la lista; se lee del botón «cambios» de la barra superior.
const count = (page: Page) => page.locator('.gx-topbar .gx-changes');
test.setTimeout(90_000);
test.beforeAll(async () => {
  fs.mkdirSync(root, { recursive: true });
  await build({ root: process.cwd(), configFile: false, envDir: path.join(root, 'empty-env'), plugins: [react()], logLevel: 'error', build: { outDir: path.join(root, 'dist'), emptyOutDir: false } });
  const url = (p: string) => JSON.stringify(pathToFileURL(path.resolve(p)).href);
  fs.writeFileSync(path.join(root, 'server.mts'), `import{createBaseApp}from${url('server/app.ts')};import{makeFixture,makeDemoSpec}from${url('shared/fixtures.ts')};const{app,store}=await createBaseApp({root:process.env.ROOT!,dbPath:':memory:',staticDir:process.env.ROOT!+'/dist'});const s=makeFixture('agency');store.importSnapshot(s);store.saveGeneration(makeDemoSpec(s),{provider:'demo',model:null,prompt:'',generatedAt:'2026-11-03T07:00:00Z',approved:false});store.activate();await app.listen({host:'127.0.0.1',port:0});console.log('LISTEN '+(app.server.address() as{port:number}).port);for(const signal of['SIGTERM','SIGINT'] as const)process.on(signal,()=>{void app.close().then(()=>process.exit(0));});`);
});
test.beforeEach(async ({ page }) => {
  child = spawn(process.execPath, ['--require', path.resolve('scripts/block-external.cjs'), '--import', 'tsx', path.join(root, 'server.mts')], { cwd: process.cwd(), env: { ...process.env, ROOT: root }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  pid = child.pid; let output = '';
  const port = await new Promise<number>((resolve, reject) => {
    const timer = setTimeout(() => reject(Error('No fixture endpoint: ' + output)), 30_000);
    child!.stdout!.on('data', b => { output += b; const m = /LISTEN (\d+)/.exec(output); if (m) { clearTimeout(timer); resolve(Number(m[1])); } });
    child!.stderr!.on('data', b => { output += b; }); child!.once('close', () => { clearTimeout(timer); reject(Error('Fixture closed: ' + output)); });
  });
  origin = 'http://127.0.0.1:' + port;
  await page.route('**/*', route => new URL(route.request().url()).origin === origin ? route.fallback() : route.abort());
  await page.goto(origin); await nav(page, 'Hoy').click();
});
test.afterEach(async ({ page }) => {
  try { await page.goto('about:blank'); } finally {
    if (child && child.exitCode === null && child.signalCode === null) { const closed = new Promise<void>(r => child!.once('close', () => r())); child.kill(); await closed; }
    let absent = false;
    for (let n = 0; pid && n < 500; n++) { try { process.kill(pid, 0); } catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ESRCH') throw e; absent = true; break; } await new Promise(r => setTimeout(r, 20)); }
    fs.writeFileSync(path.join(root, 'stopped-' + pid + '.json'), JSON.stringify({ pid, absent })); expect(absent).toBe(true); child = undefined;
  }
});
async function edit(page: Page) {
  await page.getByRole('button', { name: /\(ID task-2\)$/ }).click();
  const dialog = page.getByRole('dialog'); await dialog.locator('#ltf-f-notes').fill('Fixture151 edited note');
  return dialog;
}

test('workspace count follows a task saved from Hoy without reloading the App', async ({ page }) => {
  const dialog = await edit(page); await dialog.getByRole('button', { name: 'Guardar cambios', exact: true }).click();
  await expect(dialog).toContainText('La cola de Hoy está actualizada.');
  expect((await page.request.get(origin + '/api/v2/state').then(r => r.json())).changes).toBe(1);
  await dialog.getByRole('button', { name: 'Volver a Hoy', exact: true }).click(); await openSection(page, 'Clientes');
    await expect(count(page)).toHaveAttribute('aria-label', /^1 cambio local:/);
});

test('a failed parent-state read preserves the acknowledgement and retry reads without another PATCH', async ({ page }) => {
  let fail = false, patches = 0;
  page.on('request', r => { if (r.method() === 'PATCH') patches++; });
  await page.route('**/api/v2/state', route => fail ? route.fulfill({ status: 503, json: { error: 'Synthetic state read failure' } }) : route.fallback());
  await page.route('**/api/records/tasks/task-2', async route => {
    if (route.request().method() !== 'PATCH') return route.fallback();
    const response = await route.fetch(); expect(response.ok()).toBe(true); fail = true; await route.fulfill({ response });
  });
  const dialog = await edit(page); await dialog.getByRole('button', { name: 'Guardar cambios', exact: true }).click();
  await expect(dialog).toContainText('El guardado está confirmado, pero la cola de Hoy no se actualizó'); expect(patches).toBe(1);
  fail = false; await dialog.getByRole('button', { name: 'Reintentar la actualización', exact: true }).click();
  await expect(dialog).toContainText('La cola de Hoy está actualizada.'); expect(patches).toBe(1);
  await dialog.getByRole('button', { name: 'Volver a Hoy', exact: true }).click(); await openSection(page, 'Clientes'); await expect(count(page)).toHaveAttribute('aria-label', /^1 cambio local:/);
});

test('a late parent-state reply cannot replace a newer App refresh or resend the saved task', async ({ page }) => {
  let armed = false, held = false, patches = 0, release!: () => void, entered!: () => void;
  const gate = new Promise<void>(r => { release = r; }), pending = new Promise<void>(r => { entered = r; });
  page.on('request', r => { if (r.method() === 'PATCH') patches++; });
  await page.route('**/api/v2/state', async route => {
    if (armed && !held) { held = true; const response = await route.fetch(), json = await response.json(); entered(); await gate; try { await route.fulfill({ response, json }); } catch { /* browser may have canceled */ } }
    else await route.fallback();
  });
  await page.route('**/api/records/tasks/task-2', async route => {
    if (route.request().method() !== 'PATCH') return route.fallback();
    const response = await route.fetch(); expect(response.ok()).toBe(true); armed = true; await route.fulfill({ response });
  });
  try {
    const dialog = await edit(page); await dialog.getByRole('button', { name: 'Guardar cambios', exact: true }).click(); await pending;
    expect((await page.request.patch(origin + '/api/records/contacts/contact-1', { data: { values: { phone: '600-151-002' } } })).ok()).toBe(true);
    const newer = page.waitForResponse(r => new URL(r.url()).pathname === '/api/v2/state' && r.status() === 200);
    await page.evaluate(() => window.dispatchEvent(new Event('planb:locked'))); await newer;
    release(); await expect(dialog).toContainText('El guardado está confirmado, pero la cola de Hoy no se actualizó');
    expect(patches).toBe(1); await dialog.getByRole('button', { name: 'Volver a Hoy', exact: true }).click(); await openSection(page, 'Clientes');
    await expect(count(page)).toHaveAttribute('aria-label', /^2 cambios locales:/);
    await expect(page.getByRole('cell', { name: '600-151-002', exact: true })).toBeVisible();
  } finally { release(); }
});
