import { test, expect, type Page } from '@playwright/test';
import { build } from 'vite';
import react from '@vitejs/plugin-react';
import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = process.env.PLANB_TASK140_ROOT!;
const repo = process.cwd();
let child: ChildProcess | undefined, origin = '';
const runtime = path.join(root, 'server.mts');
const absolute = (name: string) => JSON.stringify(pathToFileURL(path.join(repo, name)).href);

test.beforeAll(async () => {
  fs.mkdirSync(root, { recursive: true });
  await build({ root: repo, configFile: false, envDir: path.join(root, 'empty-env'), base: './', plugins: [react()], logLevel: 'error', build: { outDir: path.join(root, 'dist'), emptyOutDir: false } });
  fs.writeFileSync(runtime, `import { createBaseApp } from ${absolute('server/app.ts')};
import { makeFixture, makeDemoSpec } from ${absolute('shared/fixtures.ts')};
const { app, store } = await createBaseApp({root: process.env.ROOT!, dbPath: ':memory:', staticDir: process.env.ROOT! + '/dist'});
const snapshot = makeFixture('agency');
for(const id of ['task-2','task-3']) { const task=snapshot.records.find(r=>r.entity==='tasks'&&r.id===id)!;task.values.subject='Llamar a Ana';task.values.status='pending'; }
store.importSnapshot(snapshot);
if(process.env.ACTIVE==='1'){store.saveGeneration(makeDemoSpec(snapshot),{provider:'demo',model:null,generatedAt:'2026-11-02T09:00:00Z',prompt:'',approved:false});store.activate();}
await app.listen({host:'127.0.0.1',port:0});console.log('LISTEN '+(app.server.address() as {port:number}).port);
for(const signal of ['SIGTERM','SIGINT'] as const)process.on(signal,()=>{void app.close().then(()=>process.exit(0));});`);
});
async function start(active = true) {
  child = spawn(process.execPath, ['--require', path.join(repo, 'scripts/block-external.cjs'), '--import', 'tsx', runtime], { cwd: repo, windowsHide: true, env: { ...process.env, ROOT: root, ACTIVE: active ? '1' : '0' }, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '';
  const port = await new Promise<number>((resolve, reject) => {
    const timer = setTimeout(() => reject(Error('El servidor de prueba no arrancó: ' + output)), 30_000);
    child!.stdout!.on('data', value => { output += String(value); const match = /LISTEN (\d+)/.exec(output); if (match) { clearTimeout(timer); resolve(Number(match[1])); } });
    child!.stderr!.on('data', value => { output += String(value); });
    child!.once('exit', code => { clearTimeout(timer); reject(Error('El servidor de prueba terminó: ' + code + ' ' + output)); });
  });
  origin = 'http://127.0.0.1:' + port;
}
test.afterEach(async () => { if (child && child.exitCode === null && child.signalCode === null) { const stopped = new Promise<void>(resolve => child!.once('close', () => resolve())); child.kill(); await stopped; } child = undefined; });
async function openToday(page: Page) {
  await page.route('**/*', route => new URL(route.request().url()).origin === origin ? route.fallback() : route.abort());
  await page.goto(origin); await expect(page).toHaveTitle('Plan B · Tu CRM sigue contigo');
  await page.locator('.sidebar').getByRole('button', { name: 'Hoy', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Hoy', exact: true })).toBeVisible();
  await expect(page.locator('.lop-tasks li').first()).toBeVisible();
}
const taskButton = (page: Page, id: string) => page.getByRole('button', { name: 'Abrir Llamar a Ana (ID ' + id + ')', exact: true });

test('Hoy opens the selected ID among homonyms, completes it and restores focus when its row disappears', async ({ page }) => {
  await start(); await openToday(page);
  await taskButton(page, 'task-2').focus(); await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', { name: 'Llamar a Ana' }); await expect(dialog).toContainText('task-2');
  await dialog.getByRole('combobox', { name: 'Estado *', exact: true }).selectOption('completed');
  await dialog.getByRole('button', { name: 'Guardar cambios' }).click();
  await expect(dialog.getByRole('heading', { name: 'Cambios guardados' })).toBeVisible();
  await expect(dialog).toContainText('La cola de Hoy está actualizada.');
  await dialog.getByRole('button', { name: 'Volver a Hoy' }).click();
  await expect(taskButton(page, 'task-2')).toHaveCount(0); await expect(taskButton(page, 'task-3')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Qué atender primero' })).toBeFocused();
  await taskButton(page, 'task-3').click(); await expect(page.getByRole('dialog')).toContainText('task-3');
});

test('a failed queue reload preserves the saved acknowledgement and retries only the read', async ({ page }) => {
  await start(); await openToday(page); let patches = 0, failReads = false;
  page.on('request', request => { if (request.method() === 'PATCH' && request.url().includes('/api/records/tasks/task-2')) patches++; });
  await page.route('**/api/v7/local-operations', route => failReads ? route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"sin lectura"}' }) : route.fallback());
  await taskButton(page, 'task-2').click(); const dialog = page.getByRole('dialog');
  await dialog.getByRole('combobox', { name: 'Estado *', exact: true }).selectOption('completed'); failReads = true;
  await dialog.getByRole('button', { name: 'Guardar cambios' }).click();
  await expect(dialog).toContainText('El guardado está confirmado, pero la cola de Hoy no se actualizó');
  expect(patches).toBe(1); failReads = false;
  await dialog.getByRole('button', { name: 'Reintentar la actualización' }).click();
  await expect(dialog).toContainText('La cola de Hoy está actualizada.'); expect(patches).toBe(1);
});

test('an imported unactivated copy opens read-only and offers preparation', async ({ page }) => {
  await start(false); await openToday(page); await taskButton(page, 'task-2').click();
  const dialog = page.getByRole('dialog'); await expect(dialog).toContainText('importada, pero no activada');
  await dialog.getByRole('button', { name: 'Continuar la preparación' }).click();
  await expect(page.getByRole('navigation', { name: 'Secciones de preparación' })).toBeVisible();
});

for (const width of [1440, 390, 320]) test('real navigation and task panel fit at ' + width, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 }); await start(); await openToday(page); await taskButton(page, 'task-2').click();
  await expect(page.getByRole('dialog')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  if (width <= 390) expect(await taskButton(page, 'task-3').evaluate(el => el.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
  await page.screenshot({ path: path.join(root, 'task-' + width + '.png') });
});
