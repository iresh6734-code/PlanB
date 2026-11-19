import { test, expect } from '@playwright/test';
import { build } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { HoyHarness } from './hoy-recuperable-harness';

// Independent fixture-only check. Authentication runs on the real local server;
// no route interception manufactures the 401 and no provider is contacted.
class SessionRadarHarness extends HoyHarness {
  override async prepare() {
    await super.prepare();
    const frozen = path.join(this.root, 'frozen'), priv = path.join(this.root, 'priv');
    fs.writeFileSync(path.join(frozen, 'radar-session.html'), '<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Radar session review</title></head><body><div id="root"></div><script type="module" src="/src/radar-session-entry.tsx"></script></body></html>');
    fs.writeFileSync(path.join(frozen, 'src/radar-session-entry.tsx'), `import React from 'react';import{createRoot}from'react-dom/client';import './styles.css';import './planb-ui.css';import{CommitmentRadar}from'./CommitmentRadar.js';function Host(){const[p,setP]=React.useState(null);React.useEffect(()=>{fetch('/api/v2/state').then(r=>r.json()).then(r=>setP(r.workspaceSearchContext?.contextRevision??null));},[]);return <CommitmentRadar contextRevision={p}/>;}createRoot(document.getElementById('root')).render(<Host/>);`);
    await build({ root: frozen, configFile: false, envDir: path.join(this.root, 'empty-env'), base: './', mode: 'production', plugins: [react()], logLevel: 'error', build: { outDir: path.join(priv, 'dist'), emptyOutDir: false, minify: false, rollupOptions: { input: path.join(frozen, 'radar-session.html') } } });
    const file = path.join(this.root, 'server.mts'), before = fs.readFileSync(file, 'utf8');
    expect(before).toContain('await app.listen(');
    const url = (name: string) => JSON.stringify(pathToFileURL(path.join(priv, name)).href);
    const extra = `import{registerCommitments}from ${url('server/commitments.ts')};import{createCommitmentDemoDataset}from ${url('shared/commitment-demo.ts')};const now=Date.parse('2026-11-08T12:00:00Z');registerCommitments(app,store,createCommitmentDemoDataset(now),()=>now);`;
    fs.writeFileSync(file, before.replace('await app.listen(', extra + 'await app.listen('));
  }
}

const h = new SessionRadarHarness();
test.use({ timezoneId: 'Europe/Madrid', locale: 'es-ES' });
test.setTimeout(150000);
test.beforeAll(async () => { await h.prepare(); });
test.beforeEach(() => { h.reset(); });
test.afterEach(async () => { await h.stop(); });
test.afterAll(() => { h.assertAllClosed(); });

test('401 real después de bloquear la sesión retira lista, ficha y borrador sin enviar decisiones', async ({ page }) => {
  await h.start(page);
  await page.goto(h.origin + '/radar-session.html');
  await expect(page.locator('.cr-item')).toHaveCount(6);
  await page.locator('.cr-item[data-id="installation-north"]').getByRole('button', { name: /^Abrir / }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.locator('.cr-source')).toHaveCount(3);
  await dialog.getByLabel('Responsable', { exact: true }).fill('Operador ficticio de sesión');
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);

  const setup = await page.request.post(h.origin + '/api/v2/auth/setup', { data: { password: 'synthetic-independent-radar-password' } });
  expect(setup.status()).toBe(200);
  const lock = await page.request.post(h.origin + '/api/v2/auth/lock');
  expect(lock.status()).toBe(200);
  const denied = page.waitForResponse(response => response.request().method() === 'GET' && new URL(response.url()).pathname === '/api/v7/commitments');
  await page.getByRole('button', { name: 'Actualizar', exact: true }).click();
  expect((await denied).status()).toBe(401);
  await expect(page.locator('.cr-item')).toHaveCount(0);
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('alert')).toContainText(/desbloquea/i);
  await page.setViewportSize({ width: 320, height: 800 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: path.join(h.caseDir, 'real-401-320.png') });

  const login = await page.request.post(h.origin + '/api/v2/auth/login', { data: { password: 'synthetic-independent-radar-password' } });
  expect(login.status()).toBe(200);
  await page.getByRole('button', { name: 'Actualizar', exact: true }).click();
  await expect(page.locator('.cr-item')).toHaveCount(6);
  await page.locator('.cr-item[data-id="installation-north"]').getByRole('button', { name: /^Abrir / }).click();
  await expect(dialog.locator('.cr-source')).toHaveCount(3);
  await expect(dialog.getByLabel('Responsable', { exact: true })).toHaveValue('');
  expect(h.requests().filter(q => q.method === 'POST' && q.path.endsWith('/decisions'))).toHaveLength(0);
});
