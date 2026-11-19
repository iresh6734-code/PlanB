import { test, expect, type Page } from '@playwright/test';
import { build } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawn, type ChildProcess } from 'node:child_process';
import { menuGroup, openSection } from './menu';

const root = process.env.PLANB_APP155_ROOT!;
let child: ChildProcess | undefined, origin = '', pid: number | undefined;
const gate = () => { let release!: () => void; const promise = new Promise<void>(resolve => { release = resolve; }); return { promise, release }; };
test.setTimeout(90_000);
test.beforeAll(async () => {
  if (!root || fs.existsSync(root)) throw Error('155 requires a new private root');
  fs.mkdirSync(root, { recursive: true });
  await build({ root: process.cwd(), configFile: false, envDir: path.join(root, 'empty-env'), plugins: [react()], logLevel: 'error', build: { outDir: path.join(root, 'dist'), emptyOutDir: false } });
  const url = (p: string) => JSON.stringify(pathToFileURL(path.resolve(p)).href);
  fs.writeFileSync(path.join(root, 'server.mts'), `import{createBaseApp}from${url('server/app.ts')};import{registerTeamSync}from${url('server/team-sync.ts')};import{makeFixture,makeDemoSpec}from${url('shared/fixtures.ts')};const{app,store}=await createBaseApp({root:process.env.ROOT!,dbPath:':memory:',staticDir:process.env.ROOT!+'/dist'});registerTeamSync(app,store,undefined,false,async()=>{throw Error('No provider');});const s=makeFixture('agency');store.importSnapshot(s);store.saveGeneration(makeDemoSpec(s),{provider:'demo',model:null,prompt:'',generatedAt:'2026-11-03T08:00:00Z',approved:false});store.activate();await app.listen({host:'127.0.0.1',port:0});console.log('LISTEN '+(app.server.address() as{port:number}).port);for(const s of['SIGTERM','SIGINT'] as const)process.on(s,()=>{void app.close().then(()=>process.exit(0));});`);
});
test.beforeEach(async ({ page }) => {
  child = spawn(process.execPath, ['--require', path.resolve('scripts/block-external.cjs'), '--import', 'tsx', path.join(root, 'server.mts')], { cwd: process.cwd(), env: { ...process.env, ROOT: root }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  pid = child.pid; let output = '';
  const port = await new Promise<number>((resolve, reject) => { const timer = setTimeout(() => reject(Error('155 fixture timeout ' + output)), 30_000); child!.stdout!.on('data', b => { output += b; const m = /LISTEN (\d+)/.exec(output); if (m) { clearTimeout(timer); resolve(Number(m[1])); } }); child!.stderr!.on('data', b => { output += b; }); child!.once('close', () => { clearTimeout(timer); reject(Error('155 fixture closed ' + output)); }); });
  origin = 'http://127.0.0.1:' + port;
  await page.route('**/*', route => new URL(route.request().url()).origin === origin ? route.fallback() : route.abort());
});
test.afterEach(async ({ page }) => {
  await page.unrouteAll({ behavior: 'ignoreErrors' }); await page.goto('about:blank');
  if (child && child.exitCode === null && child.signalCode === null) { const closed = new Promise<void>(r => child!.once('close', () => r())); child.kill(); await closed; }
  let absent = false; for (let n = 0; pid && n < 500; n++) { try { process.kill(pid, 0); } catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ESRCH') throw e; absent = true; break; } await new Promise(r => setTimeout(r, 20)); }
  fs.writeFileSync(path.join(root, 'stopped-' + pid + '.json'), JSON.stringify({ pid, absent })); expect(absent).toBe(true); child = undefined;
});

for (const oldFails of [false, true]) test('a superseded startup ' + (oldFails ? 'HTTP failure' : 'successful read') + ' does not leave a global error or replace newer state', async ({ page }) => {
  const entered = gate(), release = gate(); let reads = 0;
  await page.route('**/api/v2/state', async route => {
    if (++reads !== 1) return route.fallback();
    const response = await route.fetch(); entered.release(); await release.promise;
    if (oldFails) await route.fulfill({ status: 503, json: { error: 'Obsolete HTTP failure155' }, headers: { 'x-app155': 'old' } });
    else await route.fulfill({ response, headers: { ...response.headers(), 'x-app155': 'old' } });
  });
  try {
    await page.goto(origin); await entered.promise;
    const control = await page.request.patch(origin + '/api/records/contacts/contact-1', { data: { values: { phone: '155-newer-fiction' } } }); expect(control.ok()).toBe(true);
    await page.evaluate(() => window.dispatchEvent(new Event('planb:locked')));
    await expect(menuGroup(page, 'Clientes')).toBeVisible();
    await openSection(page, 'Clientes'); await expect(page.locator('.workspace-footer span')).toHaveText('1 cambio local');
    const oldResponse = page.waitForResponse(r => r.headers()['x-app155'] === 'old'); release.release(); await oldResponse;
    // The response has reached the browser; allow its catch/render to settle before asserting absence.
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    await expect(page.locator('.global-error')).toHaveCount(0); await expect(page.locator('.workspace-footer span')).toHaveText('1 cambio local');
    await expect(page.getByRole('cell', { name: '155-newer-fiction', exact: true })).toBeVisible(); expect(reads).toBeGreaterThanOrEqual(2);
  } finally { release.release(); }
});

test('a current startup HTTP failure stays visible and does not manufacture loaded state', async ({ page }) => {
  await page.route('**/api/v2/state', route => route.fulfill({ status: 503, json: { error: 'Current read failed155' } }));
  await page.goto(origin); await expect(page.getByRole('alert')).toHaveText('Current read failed155'); await expect(page.locator('.sidebar')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Volver a intentar', exact: true })).toBeVisible();
});
