import { test, expect, type Page, type Route } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawn, type ChildProcess } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { build } from 'vite';
import react from '@vitejs/plugin-react';
import { openSection, place } from './menu';

const root = process.env.PLANB_TASK142_ROOT!;
let child: ChildProcess | undefined, origin = '', pid: number | undefined;
let errors: string[], external: string[], consoleErrors: string[];
const sha = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
// Lugares del menú en escritorio (menú lateral) o en el móvil (barra inferior): ver tests/e2e/menu.ts.
const nav = (page: Page, label: string) => place(page, label);
const opener = (page: Page, id = 'task-2', title = 'Llamar a Ana') => page.getByRole('button', { name: 'Abrir ' + title + ' (ID ' + id + ')', exact: true });
test.setTimeout(90_000);

test.beforeAll(async () => {
  fs.mkdirSync(root, { recursive: true });
  await build({ root: process.cwd(), configFile: false, envDir: path.join(root, 'empty-env'), plugins: [react()], logLevel: 'error', build: { outDir: path.join(root, 'dist'), emptyOutDir: false } });
  const fileUrl = (p: string) => JSON.stringify(pathToFileURL(path.resolve(p)).href);
  fs.writeFileSync(path.join(root, 'server.mts'), `import{createBaseApp}from${fileUrl('server/app.ts')};import{makeFixture,makeDemoSpec}from${fileUrl('shared/fixtures.ts')};import{registerTeamSync}from${fileUrl('server/team-sync.ts')};
const{app,store}=await createBaseApp({root:process.env.ROOT!,dbPath:':memory:',staticDir:process.env.ROOT!+'/dist'});registerTeamSync(app,store,undefined,false,async()=>{throw Error('No external transport in fixture');});const s=makeFixture('agency');for(const id of['task-2','task-3']){const r=s.records.find(r=>r.entity==='tasks'&&r.id===id)!;r.values.subject='Llamar a Ana';r.values.status='pending';}store.importSnapshot(s);store.saveGeneration(makeDemoSpec(s),{provider:'demo',model:null,prompt:'',generatedAt:'2026-11-02T09:00:00Z',approved:false});store.activate();await app.listen({host:'127.0.0.1',port:0});console.log('LISTEN '+(app.server.address() as{port:number}).port);for(const signal of['SIGTERM','SIGINT'] as const)process.on(signal,()=>{void app.close().then(()=>process.exit(0));});`);
});
test.beforeEach(async ({ page }, info) => {
  errors = []; external = []; consoleErrors = [];
  child = spawn(process.execPath, ['--require', path.resolve('scripts/block-external.cjs'), '--import', 'tsx', path.join(root, 'server.mts')], { cwd: process.cwd(), env: { ...process.env, ROOT: root }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  pid = child.pid; if (!pid) throw Error('No own PID');
  let output = ''; const log = fs.createWriteStream(path.join(root, 'server-' + pid + '.log'), { flags: 'wx' });
  const port = await new Promise<number>((resolve, reject) => {
    const timer = setTimeout(() => reject(Error('No own endpoint: ' + output)), 30_000);
    child!.once('close', () => { clearTimeout(timer); log.end(); reject(Error('Own server closed before endpoint')); });
    child!.stdout?.on('data', b => { log.write(b); output += b; const match = /LISTEN (\d+)/.exec(output); if (match) { clearTimeout(timer); resolve(Number(match[1])); } });
    child!.stderr?.on('data', b => { log.write(b); output += b; });
  });
  origin = 'http://127.0.0.1:' + port;
  fs.writeFileSync(path.join(root, 'owner-' + pid + '.json'), JSON.stringify({ pid, origin, test: info.title, at: new Date().toISOString() }));
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (['warning', 'error'].includes(m.type())) consoleErrors.push(m.text()); });
  await page.route('**/*', route => { if (new URL(route.request().url()).origin !== origin) { external.push(route.request().url()); return route.abort(); } return route.fallback(); });
  await page.goto(origin); await nav(page, 'Hoy').click(); await expect(opener(page)).toBeVisible();
});
test.afterEach(async ({ page }, info) => {
  fs.writeFileSync(path.join(root, 'observed-' + pid + '.json'), JSON.stringify({ title: info.title, errors, external, consoleErrors }, null, 2));
  try { await page.goto('about:blank'); } finally {
    if (child && child.exitCode === null && child.signalCode === null) { const closed = new Promise<void>(r => child!.once('close', () => r())); child.kill(); await closed; }
    if (pid) {
      let absent = false;
      for (let n = 0; n < 500; n++) { try { process.kill(pid, 0); } catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ESRCH') throw e; absent = true; break; } await new Promise(r => setTimeout(r, 20)); }
      fs.writeFileSync(path.join(root, 'stopped-' + pid + '.json'), JSON.stringify({ pid, absent, at: new Date().toISOString() })); expect(absent).toBe(true);
    }
    child = undefined;
  }
});

test('dirty Escape preserves the draft until explicit discard, sends no PATCH and restores its opener', async ({ page }) => {
  const before = await page.request.get(origin + '/api/records').then(r => r.json()); let patches = 0;
  page.on('request', r => { if (r.method() === 'PATCH') patches++; });
  await opener(page).focus(); await page.keyboard.press('Enter'); const dialog = page.getByRole('dialog');
  await dialog.locator('#ltf-f-subject').fill('Borrador142 sin enviar'); await page.keyboard.press('Escape');
  await expect(dialog.getByRole('alert')).toContainText('Hay cambios sin guardar');
  await dialog.getByRole('button', { name: 'Seguir editando', exact: true }).click(); await expect(dialog.locator('#ltf-f-subject')).toHaveValue('Borrador142 sin enviar');
  await page.keyboard.press('Escape'); await dialog.getByRole('button', { name: 'Descartar y volver a Hoy', exact: true }).click();
  await expect(dialog).toHaveCount(0); await expect(opener(page)).toBeFocused(); expect(patches).toBe(0);
  expect(sha(await page.request.get(origin + '/api/records').then(r => r.json()))).toBe(sha(before)); expect(errors).toEqual([]); expect(external).toEqual([]); expect(consoleErrors).toEqual([]);
});

test('saving a task that remains queued restores focus to its updated button and never edits its homonym', async ({ page }) => {
  let patches = 0; page.on('request', r => { if (r.method() === 'PATCH') patches++; });
  await opener(page).click(); const dialog = page.getByRole('dialog'); await dialog.locator('#ltf-f-subject').fill('Atender caso142');
  await dialog.getByRole('button', { name: 'Guardar cambios', exact: true }).click();
  await expect(dialog).toContainText('La cola de Hoy está actualizada.'); await dialog.getByRole('button', { name: 'Volver a Hoy', exact: true }).click();
  await expect(opener(page, 'task-2', 'Atender caso142')).toBeFocused(); await expect(opener(page, 'task-3')).toBeVisible(); expect(patches).toBe(1);
  const records = await page.request.get(origin + '/api/records/tasks').then(r => r.json());
  expect(records.records.find((r: { id: string }) => r.id === 'task-2').values.subject).toBe('Atender caso142');
  expect(records.records.find((r: { id: string }) => r.id === 'task-3').values.subject).toBe('Llamar a Ana');
  expect(errors).toEqual([]); expect(external).toEqual([]); expect(consoleErrors).toEqual([]);
});

test('Agentes keeps its review workflow, no task opening buttons, and a persisted receipt without CRM edits', async ({ page }) => {
  const before = await page.request.get(origin + '/api/records').then(r => r.json()); let posts = 0;
  page.on('request', r => { if (r.method() === 'POST' && new URL(r.url()).pathname.endsWith('/local-operations/reviews')) posts++; });
  await openSection(page, 'Propuestas'); await expect(page.getByRole('heading', { name: 'Propuestas', exact: true })).toBeVisible();
  await expect(page.locator('.lop-open-task')).toHaveCount(0); await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: 'Revisar mi copia', exact: true }).click(); await expect(page.locator('.lop-confirmation')).toContainText('Revisión local guardada');
  await page.reload(); await openSection(page, 'Propuestas'); await expect(page.locator('.lop-confirmation')).toContainText('Revisión local guardada');
  expect(posts).toBe(1); expect(sha(await page.request.get(origin + '/api/records').then(r => r.json()))).toBe(sha(before));
  expect(errors).toEqual([]); expect(external).toEqual([]); expect(consoleErrors).toEqual([]);
});

test('navigation aborts the saved-task queue read; a late route cannot replace the new Agentes view', async ({ page }) => {
  const oldQueue = await page.request.get(origin + '/api/v7/local-operations').then(r => r.json());
  let hold = false, captured = false, patches = 0, held: Route | undefined, entered!: () => void;
  const pending = new Promise<void>(resolve => { entered = resolve; });
  page.on('request', r => { if (r.method() === 'PATCH') patches++; });
  await page.route('**/api/v7/local-operations', route => { if (hold && !captured) { captured = true; held = route; entered(); return; } return route.fallback(); });
  await opener(page).click(); const dialog = page.getByRole('dialog'); await dialog.locator('#ltf-f-status').selectOption('completed'); hold = true;
  await dialog.getByRole('button', { name: 'Guardar cambios', exact: true }).click(); await expect(dialog.getByRole('heading', { name: 'Cambios guardados' })).toBeVisible(); await pending;
  await dialog.getByRole('button', { name: 'Volver a Hoy', exact: true }).click(); await openSection(page, 'Propuestas');
  await expect(page.getByRole('heading', { name: 'Propuestas', exact: true })).toBeVisible();
  const current = await page.request.get(origin + '/api/v7/local-operations').then(r => r.json());
  expect(current.tasks.length).toBe(oldQueue.tasks.length - 1);
  const late = await held!.fulfill({ json: oldQueue }).then(() => 'fulfilled', e => String(e));
  fs.writeFileSync(path.join(root, 'late-route-' + pid + '.json'), JSON.stringify({ late, before: oldQueue.tasks.length, after: current.tasks.length }));
  await expect(page.locator('.lop-tasks li')).toHaveCount(current.tasks.length); await expect(page.getByRole('dialog')).toHaveCount(0); expect(patches).toBe(1);
  expect(errors).toEqual([]); expect(external).toEqual([]); expect(consoleErrors).toEqual([]);
});
