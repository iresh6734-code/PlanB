import { test, expect, type Page } from '@playwright/test';
import { build } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { HoyHarness } from './hoy-recuperable-harness';

// RADAR · ENTRADA Y PROCEDENCIA (unidad CLAUDE-RADAR-ENTRY-MOUNT-READY). Servidor REAL con `mountCommitmentRadar` (capacidad, activación explícita y semilla persistente del escenario multisistema 289/291),
// SQLite de archivo, reloj fijo y red bloqueada. Lo único ficticio del arnés es la página `radar.html` que monta `<CommitmentRadarEntry>` con el pin leído de `/api/v2/state`. NO está montado en la App
// (eso es de `CODEX-COMMITMENT-RADAR-MOUNT`); aquí se prueba el componente que se montará.
const NOW = '2026-11-08T12:00:00.000Z';
const ENTRY_HTML = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Radar · entrada</title></head><body><div id="root"></div><script type="module" src="/src/radar-entry.tsx"></script></body></html>`;
const ENTRY_TSX = `import React from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css'; import './refinements.css'; import './sales.css'; import './team.css'; import './integrations.css'; import './design-system.css'; import './planb-ui.css'; import './customer-dossier.css';
import { CommitmentRadarEntry } from './CommitmentRadarEntry.js';
function Host() {
  const [pin, setPin] = React.useState<string | null | undefined>(undefined);
  async function refresh() { const state = await (await fetch('/api/v2/state')).json(); setPin(state.workspaceSearchContext?.contextRevision ?? null); }
  React.useEffect(() => { void refresh(); (window as any).__radar = { refresh, setPin }; }, []);
  return pin === undefined ? <p>Cargando…</p> : <main style={{ padding: 16 }}><CommitmentRadarEntry contextRevision={pin} clock={() => Date.parse('2026-11-08T12:01:00.000Z')} onContextStale={() => { (window as any).__stale = ((window as any).__stale ?? 0) + 1; }} /></main>;
}
createRoot(document.getElementById('root')!).render(<Host />);
`;
const SEED = `import { existsSync as scenarioExists, readFileSync as scenarioRead } from 'node:fs';
async function seedScenario(): Promise<boolean> {
  if (!scenarioExists(dir + '/scenario.txt')) return false;
  const name = scenarioRead(dir + '/scenario.txt', 'utf8').trim(); const snapshot: any = makeFixture('agency');
  store.importSnapshot(snapshot); if (name === 'imported') return true; gen(snapshot); store.activate(); return true;
}
`;
type RadarState = { status: string; canActivate: boolean; seedAt: string | null; datasetRevision: string | null; provenance: string | null; contextRevision: string | null };
class Harness extends HoyHarness {
  override async prepare() {
    await super.prepare();
    const frozen = path.join(this.root, 'frozen'), priv = path.join(this.root, 'priv');
    fs.writeFileSync(path.join(frozen, 'radar.html'), ENTRY_HTML); fs.writeFileSync(path.join(frozen, 'src', 'radar-entry.tsx'), ENTRY_TSX);
    await build({ root: frozen, configFile: false, envDir: path.join(this.root, 'empty-env'), base: './', mode: 'production', plugins: [react()], logLevel: 'error', build: { outDir: path.join(priv, 'dist'), emptyOutDir: false, minify: false, rollupOptions: { input: path.join(frozen, 'radar.html') } } });
    const file = path.join(this.root, 'server.mts'), source = fs.readFileSync(file, 'utf8'), url = (name: string) => JSON.stringify(pathToFileURL(path.join(priv, name)).href);
    if (!source.includes('await app.listen(') || !source.includes('if (!store.snapshot) {')) throw new Error('El servidor del arnés cambió: no se encuentran los puntos de extensión.');
    const extra = `import { mountCommitmentRadar } from ${url('server/commitment-radar-mount.ts')};
const RADAR_NOW = Date.parse(${JSON.stringify(NOW)});
mountCommitmentRadar(app, store, { clock: () => RADAR_NOW });
app.post('/__h/swap', async () => { const next: any = makeFixture('agency'); next.id = 'captura-otra'; next.name = 'Otra captura'; next.capturedAt = '2026-11-09T09:00:00.000Z'; store.importSnapshot(next, true); store.saveGeneration(makeDemoSpec(next), { provider: 'demo', model: null, generatedAt: '2026-11-09T09:30:00Z', prompt: '', approved: false }); store.activate(); return { ok: true }; });
`;
    fs.writeFileSync(file, source.replace('if (!store.snapshot) {', SEED + 'if (!store.snapshot && !(await seedScenario())) {').replace('await app.listen(', extra + 'await app.listen('));
  }
  scenario(name: 'imported') { fs.writeFileSync(path.join(this.caseDir, 'scenario.txt'), name, { flag: 'wx' }); }
  async swap() { expect((await fetch(this.origin + '/__h/swap', { method: 'POST' })).ok).toBe(true); }
  async pin(): Promise<string> { return (await (await fetch(this.origin + '/api/v2/state')).json() as { workspaceSearchContext: { contextRevision: string } }).workspaceSearchContext.contextRevision; }
  async capability(): Promise<RadarState> { return await (await fetch(this.origin + '/api/v7/commitment-radar?contextRevision=' + await this.pin())).json() as RadarState; }
  activations() { return this.requests().filter(line => line.method === 'POST' && line.path === '/api/v7/commitment-radar/activate'); }
  writes() { return this.requests().filter(line => line.method !== 'GET'); }
}
const harness = new Harness();
test.use({ timezoneId: 'Europe/Madrid', locale: 'es-ES' });
test.setTimeout(150_000);
test.beforeAll(async () => { await harness.prepare(); });
test.beforeEach(() => { harness.reset(); });
test.afterEach(async ({ page }) => { await page.unrouteAll({ behavior: 'ignoreErrors' }).catch(() => undefined); await harness.stop(); });
test.afterAll(() => { harness.assertAllClosed(); });

const dlg = (page: Page) => page.getByRole('dialog');
const item = (page: Page, id: string) => page.locator('.cr-item[data-id="' + id + '"]');
const source = (page: Page, role: string) => dlg(page).locator('.cr-source[data-role="' + role + '"]');
const activateButton = (page: Page) => page.getByRole('button', { name: 'Activar el escenario de ensayo' });
async function start(page: Page, size = { width: 1440, height: 900 }) { await harness.start(page); await page.setViewportSize(size); await page.goto(harness.origin + '/radar.html'); await expect(page.getByRole('heading', { name: 'Radar de compromisos' })).toBeVisible(); }
async function activate(page: Page) { await activateButton(page).click(); await expect(page.locator('.cr-provenance')).toBeVisible(); await expect(page.locator('.cr-item').first()).toBeVisible(); }


// Sondas propias315. Reutilizan únicamente el arnés/ayudantes de la entrega; las aserciones siguientes son de Codex.
test('315 · acuse de activación retenido tras efecto: termina espera, permite comprobar por GET y no reenvía', async ({page})=>{
 await start(page); await expect(activateButton(page)).toBeVisible(); await page.clock.install();
 let release!:()=>void,applied!:()=>void;const held=new Promise<void>(r=>release=r),seen=new Promise<void>(r=>applied=r);
 await page.route('**/api/v7/commitment-radar/activate',async route=>{const response=await route.fetch();applied();await held;await route.fulfill({response}).catch(()=>undefined);});
 try{await activateButton(page).click();await seen;expect(harness.activations().map(x=>x.status)).toEqual([201]);expect((await harness.capability()).status).toBe('available');await page.clock.fastForward(180_000);
 await expect(page.getByRole('button',{name:'Activando…'}),'tres minutos después debe acabar la espera sin asegurar que no se creó').toHaveCount(0,{timeout:2000});
 await expect(page.getByRole('alert')).toContainText(/No se sabe|no se pudo|tiempo|tard/i);const refresh=page.getByRole('button',{name:'Actualizar estado'});await expect(refresh).toBeEnabled();expect(harness.activations()).toHaveLength(1);await refresh.click();await expect(page.locator('.cr-provenance')).toBeVisible();expect(harness.activations()).toHaveLength(1);
 }finally{release();}
});

test('315 · respuesta tardía de activación después de cambiar el pin no repuebla la copia anterior',async({page})=>{
 await start(page);await expect(activateButton(page)).toBeVisible();let release!:()=>void,applied!:()=>void;const held=new Promise<void>(r=>release=r),seen=new Promise<void>(r=>applied=r);
 await page.route('**/api/v7/commitment-radar/activate',async route=>{const response=await route.fetch();applied();await held;await route.fulfill({response}).catch(()=>undefined);});
 try{await activateButton(page).click();await seen;await page.evaluate(()=>(window as any).__radar.setPin(null));await expect(page.getByRole('status').filter({hasText:'No hay una copia de ensayo activa'})).toBeVisible();release();await page.waitForTimeout(200);await expect(page.locator('.cr-provenance')).toHaveCount(0);await expect(page.locator('.cr-item')).toHaveCount(0);expect(harness.activations()).toHaveLength(1);}
 finally{release();}
});

// Exploratory reviewer probes: only the simulated transport ignores AbortSignal.
// The newer capability GET is real; this tests whether an obsolete401 still emits a global lock.
test('315 R2 · a late activation401 cannot lock the state obtained by a newer real GET', async ({ page }) => {
  await start(page); await expect(activateButton(page)).toBeVisible(); await page.clock.install();
  await page.evaluate(() => {
    const actual = window.fetch; (window as any).__actualFetch315 = actual; (window as any).__lateLocks315 = 0;
    window.addEventListener('planb:locked', () => { (window as any).__lateLocks315++; });
    window.fetch = (input, init) => String(input).includes('/commitment-radar/activate') ? new Promise<Response>(resolve => {
      (window as any).__releaseOld401315 = () => resolve(new Response('{"error":"fiction old session"}', { status: 401, headers: { 'content-type': 'application/json' } }));
    }) : actual(input, init);
  });
  try {
    await activateButton(page).click(); await page.clock.fastForward(16_000);
    await expect(page.getByRole('alert')).toContainText('No se sabe');
    await page.getByRole('button', { name: 'Actualizar estado' }).click(); await expect(activateButton(page)).toBeVisible();
    await page.evaluate(() => (window as any).__releaseOld401315()); await page.waitForTimeout(150);
    expect(await page.evaluate(() => (window as any).__lateLocks315), 'obsolete activation401 emitted a global lock after timeout and successful newer reading').toBe(0);
    await expect(activateButton(page)).toBeEnabled(); expect(harness.activations()).toHaveLength(0);
  } finally { await page.evaluate(() => { window.fetch = (window as any).__actualFetch315; }); }
});

test('315 R2 · a late capability401 cannot lock the state obtained by a newer real GET', async ({ page }) => {
  await start(page); await expect(activateButton(page)).toBeVisible(); await page.clock.install();
  await page.evaluate(() => {
    const actual = window.fetch; let held = false; (window as any).__actualFetch315 = actual; (window as any).__lateLocks315 = 0;
    window.addEventListener('planb:locked', () => { (window as any).__lateLocks315++; });
    window.fetch = (input, init) => {
      if (!held && String(input).includes('/commitment-radar?')) { held = true; return new Promise<Response>(resolve => {
        (window as any).__releaseOld401315 = () => resolve(new Response('{"error":"fiction old session"}', { status: 401, headers: { 'content-type': 'application/json' } }));
      }); }
      return actual(input, init);
    };
  });
  try {
    await page.getByRole('button', { name: 'Actualizar estado' }).click(); await page.clock.fastForward(16_000);
    await expect(page.getByRole('alert')).toContainText('tardó');
    await page.getByRole('button', { name: 'Reintentar la lectura' }).click(); await expect(activateButton(page)).toBeVisible();
    await page.evaluate(() => (window as any).__releaseOld401315()); await page.waitForTimeout(150);
    expect(await page.evaluate(() => (window as any).__lateLocks315), 'obsolete capability401 emitted a global lock after successful newer reading').toBe(0);
    await expect(activateButton(page)).toBeEnabled(); expect(harness.activations()).toHaveLength(0);
  } finally { await page.evaluate(() => { window.fetch = (window as any).__actualFetch315; }); }
});

test('315 R2 · an obsolete real server401 cannot lock a newly logged-in session after the activation deadline', async ({ page }) => {
  await harness.start(page);
  const password = 'fiction-only-315-test-password';
  const setup = await page.request.post(harness.origin + '/api/v2/auth/setup', { data: { password } }); expect(setup.status()).toBe(200);
  await page.goto(harness.origin + '/radar.html'); await expect(activateButton(page)).toBeVisible(); await page.clock.install();
  await page.evaluate(() => {
    const actual = window.fetch; (window as any).__actualFetch315 = actual; (window as any).__lateLocks315 = 0;
    window.addEventListener('planb:locked', () => { (window as any).__lateLocks315++; });
    window.fetch = (input, init) => {
      if (String(input).includes('/commitment-radar/activate')) { const { signal: ignored, ...rest } = init ?? {}; return actual(input, rest); }
      return actual(input, init);
    };
  });
  let release!: () => void, entered!: () => void, status = 0;
  const held = new Promise<void>(resolve => { release = resolve; }), seen = new Promise<void>(resolve => { entered = resolve; });
  await page.route('**/api/v7/commitment-radar/activate', async route => {
    const originalHeaders = await route.request().allHeaders(); entered(); await held;
    const response = await route.fetch({ headers: originalHeaders }); status = response.status();
    await route.fulfill({ response }).catch(() => undefined);
  });
  try {
    await activateButton(page).click(); await seen; await page.clock.fastForward(16_000);
    await expect(page.getByRole('alert')).toContainText('No se sabe');
    expect((await page.request.post(harness.origin + '/api/v2/auth/lock')).status()).toBe(200);
    expect((await page.request.post(harness.origin + '/api/v2/auth/login', { data: { password } })).status()).toBe(200);
    await page.getByRole('button', { name: 'Actualizar estado' }).click(); await expect(activateButton(page)).toBeVisible();
    release(); await expect.poll(() => status).toBe(401); await page.waitForTimeout(150);
    expect(harness.activations().map(line => line.status), 'the actual old-cookie request was rejected by the protected server').toEqual([401]);
    expect(await page.evaluate(() => (window as any).__lateLocks315), 'old real401 incorrectly locks a session whose fresh authenticated GET succeeded').toBe(0);
    await expect(activateButton(page)).toBeEnabled();
  } finally {
    release(); await page.unrouteAll({ behavior: 'wait' });
    await page.evaluate(() => { window.fetch = (window as any).__actualFetch315; }).catch(() => undefined);
  }
});

test('315 R2 · a current real401 still emits one global lock and withdraws the protected view', async ({ page }) => {
  await harness.start(page);
  const setup = await page.request.post(harness.origin + '/api/v2/auth/setup', { data: { password: 'fiction-only-current-315-password' } });
  expect(setup.status()).toBe(200); await page.goto(harness.origin + '/radar.html'); await expect(activateButton(page)).toBeVisible();
  await page.evaluate(() => { (window as any).__currentLocks315 = 0; window.addEventListener('planb:locked', () => { (window as any).__currentLocks315++; }); });
  expect((await page.request.post(harness.origin + '/api/v2/auth/lock')).status()).toBe(200);
  await page.getByRole('button', { name: 'Actualizar estado' }).click();
  await expect(page.getByRole('alert')).toContainText('La sesión está bloqueada'); await expect(activateButton(page)).toHaveCount(0);
  expect(await page.evaluate(() => (window as any).__currentLocks315), 'only obsolete responses are discarded; a current401 must keep its lock effect').toBe(1);
  expect(harness.requests().filter(line => line.path === '/api/v7/commitment-radar' && line.status === 401)).toHaveLength(1);
});
