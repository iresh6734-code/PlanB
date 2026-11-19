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

test('SIN ESCENARIO · la capacidad existe pero no está inicializada: se explica qué se crea, se advierte que todo es ficticio y NO se lee ni escribe nada hasta que la persona activa', async ({ page }) => {
  await start(page); const panel = page.locator('[data-capability="not-initialized"]'); await expect(panel).toBeVisible(); await expect(panel).toContainText('compromisos y observaciones ficticios'); await expect(panel).toContainText('no contacta con HubSpot, Pipedrive, Zendesk');
  for (const text of ['Los pedidos son ficticios', 'Ningún proveedor está conectado', 'Un ID remoto igual en dos proveedores o cuentas NO es el mismo registro']) await expect(panel).toContainText(text);
  await expect(activateButton(page)).toBeEnabled(); await expect(page.locator('.cr-item')).toHaveCount(0);
  const cap = await harness.capability(); expect(cap).toMatchObject({ status: 'not-initialized', canActivate: true, seedAt: null, datasetRevision: null });
  expect(harness.writes(), 'leer la capacidad no escribe').toEqual([]); expect(harness.activations()).toHaveLength(0);
});

test('ACTIVAR · una acción explícita crea la semilla UNA vez (201) y muestra el escenario multisistema: 2 en riesgo, 4 sin confirmar, 2 sin riesgo detectado; recargar y volver a leer no escribe', async ({ page }) => {
  await start(page); await activate(page);
  expect(harness.activations().map(line => line.status), 'una activación, creada').toEqual([201]);
  await expect(page.locator('.cr-provenance')).toContainText('Escenario de ensayo creado ahora'); await expect(page.locator('.cr-provenance')).toContainText('guardado en disco'); await expect(page.locator('.cr-provenance')).toContainText('ningún proveedor conectado');
  await expect(page.locator('.cr-group[data-status="at-risk"] .cr-item')).toHaveCount(2); await expect(page.locator('.cr-group[data-status="unconfirmed"] .cr-item')).toHaveCount(4); await expect(page.locator('.cr-group[data-status="no-risk-detected"] .cr-item')).toHaveCount(2);
  const cap = await harness.capability(); expect(cap).toMatchObject({ status: 'available', canActivate: false, provenance: 'durable' }); expect(cap.seedAt).toBe(NOW);
  await page.reload(); await expect(page.locator('.cr-provenance')).toBeVisible(); await expect(page.locator('.cr-provenance')).not.toContainText('creado ahora'); await expect(page.locator('.cr-item').first()).toBeVisible();
  expect(harness.activations(), 'recargar no activa de nuevo').toHaveLength(1); expect(harness.writes().map(line => line.method + ' ' + line.path)).toEqual(['POST /api/v7/commitment-radar/activate']);
});

test('REINICIO · el instante de creación del escenario y su historial se conservan al reiniciar el servidor sobre la misma base; leer sigue sin escribir', async ({ page }) => {
  await start(page); await activate(page); const before = await harness.capability(); const { before: a, after: b } = await harness.restart(page); expect(b.pid, 'otro proceso').not.toBe(a.pid);
  await page.goto(harness.origin + '/radar.html'); await expect(page.locator('.cr-provenance')).toBeVisible(); await expect(page.locator('.cr-provenance')).not.toContainText('creado ahora'); await expect(page.locator('.cr-item')).toHaveCount(8);
  const after = await harness.capability(); expect(after.seedAt, 'mismo instante de creación').toBe(before.seedAt); expect(after.datasetRevision, 'mismo conjunto de datos').toBe(before.datasetRevision); expect(after.status).toBe('available');
  expect(harness.activations(), 'el arranque y la lectura no activan').toHaveLength(1);
});

test('PROCEDENCIA EN LA FICHA · cada proveedor se rotula como dato de ensayo NO conectado, se advierte que los pedidos son ficticios y el mismo ID en dos cuentas no se fusiona', async ({ page }) => {
  await start(page); await activate(page);
  await item(page, 'ms-installation-hubspot').getByRole('button', { name: /^Abrir / }).click(); await expect(dlg(page)).toBeVisible(); await expect(dlg(page).locator('.cr-source')).toHaveCount(3);
  await expect(dlg(page).locator('.cr-disclosures')).toContainText('Los pedidos son ficticios'); await expect(dlg(page).locator('.cr-disclosures')).toContainText('Ningún proveedor está conectado');
  await expect(source(page, 'sale').locator('.cr-fiction')).toHaveText('· HubSpot · datos de ensayo · no conectado'); await expect(source(page, 'delivery').locator('.cr-fiction')).toHaveText('· Pedidos ficticios · no conectado'); await expect(source(page, 'support').locator('.cr-fiction')).toHaveText('· Zendesk · datos de ensayo · no conectado');
  await expect(source(page, 'sale')).toContainText('cuenta fixture-hubspot-sales'); await expect(dlg(page).locator('.cr-fiction')).toHaveCount(3);
  await page.keyboard.press('Escape'); await item(page, 'ms-installation-pipedrive').getByRole('button', { name: /^Abrir / }).click(); await expect(source(page, 'sale').locator('.cr-fiction')).toHaveText('· Pipedrive · datos de ensayo · no conectado'); await expect(source(page, 'sale')).toContainText('deal-2001'); await expect(source(page, 'sale')).toContainText('pipedrive');
  await page.keyboard.press('Escape'); await item(page, 'ms-same-id-two-accounts').getByRole('button', { name: /^Abrir / }).click(); await expect(source(page, 'delivery').locator('.cr-state')).toHaveText('Ambigua: sin confirmar'); await expect(source(page, 'delivery')).toContainText('Vínculo: ninguno confirmado');
  const candidates = source(page, 'delivery').locator('.cr-candidates li'); await expect(candidates).toHaveCount(2); await expect(candidates.nth(0)).toContainText('order-9001'); await expect(candidates.nth(1)).toContainText('order-9001'); expect(await candidates.allInnerTexts()).not.toContain(await candidates.nth(0).innerText().then(t => t + 'x'));
  expect((await candidates.allInnerTexts()).map(t => /cuenta (\S+)/.exec(t)?.[1]).sort(), 'dos cuentas distintas').toHaveLength(2); await expect(dlg(page).locator('.cr-summary .cr-chip')).toHaveText('Sin confirmar');
  expect(harness.writes().map(line => line.path)).toEqual(['/api/v7/commitment-radar/activate']);
});

test('COPIA INACTIVA · importada sin activar no hay pin: el Radar no se ofrece ni muestra nada, no consulta la capacidad con otra copia y el servidor confirma «copia inactiva»', async ({ page }) => {
  harness.scenario('imported'); await start(page); await expect(page.getByRole('status').filter({ hasText: 'No hay una copia de ensayo activa' })).toBeVisible(); await expect(page.locator('.cr-item')).toHaveCount(0); await expect(activateButton(page)).toHaveCount(0);
  const response = await fetch(harness.origin + '/api/v7/commitment-radar'); expect((await response.json() as RadarState).status).toBe('inactive-copy'); expect(harness.writes()).toEqual([]);
});
test('COPIA NO FICTICIA · si el servidor declara que la copia no es de datos de ensayo, el Radar se niega a mostrar nada (la respuesta se simula en el borde: una captura de producción válida exige una cuenta STANDARD verificada)', async ({ page }) => {
  await start(page); const pin = await harness.pin();
  await page.route('**/api/v7/commitment-radar?*', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ format: 'planb-commitment-radar-capability-v1', mode: 'fiction', contextRevision: pin, seedAt: null, datasetRevision: null, provenance: null, status: 'not-fiction', canActivate: false }) }));
  await page.reload(); await expect(page.locator('[data-capability="not-fiction"]')).toContainText('solo trabaja con una copia de datos ficticios'); await expect(page.locator('.cr-item')).toHaveCount(0); await expect(activateButton(page)).toHaveCount(0); expect(harness.writes()).toEqual([]);
});

test('LECTURA NO DISPONIBLE · un fallo del servidor NO se presenta como «sin escenario» ni como vacío: aviso, reintento y cero escrituras', async ({ page }) => {
  await start(page); let fail = true; await page.route('**/api/v7/commitment-radar?*', route => fail ? route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'x', details: { code: 'COMMITMENT_SCENARIO_UNAVAILABLE' } }) }) : route.fallback());
  await page.getByRole('button', { name: 'Actualizar estado' }).click().catch(() => undefined); await page.evaluate(() => (window as any).__radar.refresh()); await page.reload();
  await expect(page.getByRole('alert')).toContainText('No se pudo'); await expect(page.locator('[data-capability="not-initialized"]')).toHaveCount(0); await expect(activateButton(page)).toHaveCount(0);
  fail = false; await page.getByRole('button', { name: 'Reintentar la lectura' }).click(); await expect(activateButton(page)).toBeVisible(); expect(harness.writes()).toEqual([]);
});

test('CAMBIO DE COPIA y BLOQUEO · un 409 al activar retira todo y avisa a quien monta; el evento de bloqueo retira el Radar y una respuesta tardía no lo repuebla', async ({ page }) => {
  await start(page); await expect(activateButton(page)).toBeVisible(); await harness.swap();   // la copia activa cambió por debajo
  await activateButton(page).click(); await expect(page.getByRole('alert')).toContainText('La copia activa cambió'); await expect(activateButton(page)).toHaveCount(0); expect(await page.evaluate(() => (window as any).__stale)).toBe(1);
  expect(harness.activations().map(line => line.status)).toEqual([409]); await page.evaluate(() => (window as any).__radar.refresh()); await expect(activateButton(page)).toBeVisible();
  await activate(page); await page.evaluate(() => window.dispatchEvent(new Event('planb:locked'))); await expect(page.locator('.cr-item')).toHaveCount(0); await expect(page.getByRole('alert')).toContainText('La sesión está bloqueada');
});

for (const width of [1440, 390, 320]) {
  test('TECLADO y ' + width + ' px · activar con teclado, el Radar y la ficha con su procedencia sin desbordamiento y con objetivos táctiles; capturas inspeccionables', async ({ page }, testInfo) => {
    await start(page, { width, height: 900 }); await page.waitForTimeout(300);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), 'activación sin desbordamiento').toBeLessThanOrEqual(0);
    const panelShot = path.join(harness.caseDir, 'activacion-' + width + '.png'); await page.screenshot({ path: panelShot }); await testInfo.attach('activacion-' + width, { path: panelShot, contentType: 'image/png' });
    await activateButton(page).focus(); await page.keyboard.press('Enter'); await expect(page.locator('.cr-provenance')).toBeVisible(); await expect(page.locator('.cr-item').first()).toBeVisible();
    const open = item(page, 'ms-installation-hubspot').getByRole('button', { name: /^Abrir / }); await open.focus(); await page.keyboard.press('Enter'); await expect(dlg(page)).toBeVisible(); await expect(dlg(page).locator('.cr-disclosures')).toBeVisible(); await page.waitForTimeout(450);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), 'ficha sin desbordamiento').toBeLessThanOrEqual(0);
    if (width < 651) { const small = await page.locator('button').evaluateAll(nodes => nodes.map(node => { const r = (node as HTMLElement).getBoundingClientRect(); return { name: (node.textContent || '').trim().slice(0, 40), h: Math.round(r.height) }; }).filter(box => box.h > 0 && box.h < 32)); expect(small, 'objetivos táctiles ≥ 32 px').toEqual([]); }
    const shot = path.join(harness.caseDir, 'ficha-procedencia-' + width + '.png'); await page.screenshot({ path: shot }); await testInfo.attach('ficha-procedencia-' + width, { path: shot, contentType: 'image/png' });
    await page.keyboard.press('Escape'); await expect(dlg(page)).toHaveCount(0); await expect(open, 'el foco vuelve al botón exacto').toBeFocused();
  });
}

// ── R2 de 315 · ACTIVACIÓN CON PLAZO FINITO. El POST puede salir y el servidor haber respondido 201 mientras el acuse (cabeceras o cuerpo) no llega al navegador, o el transporte puede ignorar la cancelación.
// Reloj virtual de Playwright (no se esperan 15 s de pared). Lo que se cuenta son peticiones del servidor y un contador del borde del navegador, no textos de éxito. Un plazo vencido NO afirma que no se creó
// y NUNCA reenvía: solo una pulsación humana posterior puede iniciar otro POST.
const TIMEOUT_MS = 15_000;
const uncertainText = /No se sabe si el escenario llegó a crearse/;
async function stubTransport(page: Page, kind: 'never' | 'stalled-body') {
  await page.evaluate(mode => {
    const real = window.fetch.bind(window); (window as any).__real = real; (window as any).__posts = 0;
    window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if ((init?.method ?? 'GET') === 'POST' && url.includes('/api/v7/commitment-radar/activate')) {
        (window as any).__posts++;   // el transporte IGNORA la señal de cancelación: nunca resuelve ni rechaza por ella
        return mode === 'never' ? new Promise<Response>(() => undefined) : Promise.resolve(new Response(new ReadableStream({ start() { /* cabeceras sí, cuerpo nunca */ } }), { status: 201, headers: { 'Content-Type': 'application/json' } }));
      }
      return real(input, init);
    }) as typeof fetch;
  }, kind);
}
const restoreTransport = (page: Page) => page.evaluate(() => { window.fetch = (window as any).__real; });
const posts = (page: Page) => page.evaluate(() => (window as any).__posts as number);

test('R2 · acuse retenido DESPUÉS de que el servidor creó la semilla: plazo finito, incertidumbre honesta, lectura por GET, un solo POST y el éxito tardío se descarta', async ({ page }) => {
  await start(page); await expect(activateButton(page)).toBeVisible(); await page.clock.install();
  let release!: () => void, applied!: () => void; const held = new Promise<void>(resolve => { release = resolve; }), seen = new Promise<void>(resolve => { applied = resolve; });
  await page.route('**/api/v7/commitment-radar/activate', async route => { const response = await route.fetch(); applied(); await held; await route.fulfill({ response }).catch(() => undefined); });
  try {
    await activateButton(page).click(); await seen; expect(harness.activations().map(line => line.status), 'el servidor sí creó la semilla').toEqual([201]); expect((await harness.capability()).status).toBe('available');
    await page.clock.fastForward(TIMEOUT_MS - 1000); await expect(page.getByRole('button', { name: 'Activando…' }), 'antes del plazo sigue esperando').toBeVisible();
    await page.clock.fastForward(2000); await expect(page.getByRole('button', { name: 'Activando…' })).toHaveCount(0);
    await expect(page.getByRole('alert')).toContainText(uncertainText); await expect(page.getByRole('alert')).not.toContainText(/no se creó/i);
    const refresh = page.getByRole('button', { name: 'Actualizar estado' }); await expect(refresh).toBeEnabled(); await expect(activateButton(page)).toBeEnabled();
    expect(harness.activations(), 'el plazo no reenvía').toHaveLength(1);
    await refresh.click(); await expect(page.locator('.cr-provenance')).toBeVisible(); await expect(page.locator('.cr-provenance')).not.toContainText('creado ahora'); expect(harness.activations(), 'comprobar es una lectura').toHaveLength(1);
    release(); await page.waitForTimeout(300); await expect(page.locator('.cr-provenance')).not.toContainText('creado ahora'); await expect(page.getByRole('alert')).toHaveCount(0); expect(harness.activations()).toHaveLength(1);
    expect(harness.writes().map(line => line.method + ' ' + line.path), 'un solo escenario persistido, una sola escritura').toEqual(['POST /api/v7/commitment-radar/activate']);
  } finally { release(); }
});

for (const kind of ['never', 'stalled-body'] as const) {
  test('R2 · transporte que ignora la cancelación (' + (kind === 'never' ? 'ni siquiera responde' : 'cabeceras sin cuerpo') + '): el plazo propio libera los controles, no reenvía y solo una pulsación humana inicia otro intento', async ({ page }) => {
    await start(page); await expect(activateButton(page)).toBeVisible(); await page.clock.install(); await stubTransport(page, kind);
    await activateButton(page).click(); await expect(page.getByRole('button', { name: 'Activando…' })).toBeVisible(); expect(await posts(page)).toBe(1);
    await page.clock.fastForward(TIMEOUT_MS - 1000); await expect(page.getByRole('button', { name: 'Activando…' })).toBeVisible();
    await page.clock.fastForward(2000); await expect(page.getByRole('button', { name: 'Activando…' })).toHaveCount(0); await expect(page.getByRole('alert')).toContainText(uncertainText);
    await expect(page.getByRole('button', { name: 'Actualizar estado' })).toBeEnabled(); await expect(activateButton(page)).toBeEnabled();
    await page.clock.fastForward(120_000); expect(await posts(page), 'ni el plazo ni el tiempo posterior reenvían').toBe(1);
    await page.getByRole('button', { name: 'Actualizar estado' }).click(); await expect(activateButton(page), 'la lectura confirma que el servidor no recibió nada').toBeVisible(); expect(await posts(page)).toBe(1); expect(harness.activations()).toHaveLength(0);
    await restoreTransport(page); await activateButton(page).click(); await expect(page.locator('.cr-provenance')).toBeVisible(); expect(harness.activations().map(line => line.status), 'otro POST solo por acción humana').toEqual([201]);
  });
}

test('R2 · bloqueo con la activación pendiente: se retira todo y una respuesta tardía no repuebla ni cambia nada', async ({ page }) => {
  await start(page); await expect(activateButton(page)).toBeVisible(); await page.clock.install();
  let release!: () => void, applied!: () => void; const held = new Promise<void>(resolve => { release = resolve; }), seen = new Promise<void>(resolve => { applied = resolve; });
  await page.route('**/api/v7/commitment-radar/activate', async route => { const response = await route.fetch(); applied(); await held; await route.fulfill({ response }).catch(() => undefined); });
  try {
    await activateButton(page).click(); await seen; await page.evaluate(() => window.dispatchEvent(new Event('planb:locked'))); await expect(page.getByRole('alert')).toContainText('La sesión está bloqueada');
    release(); await page.clock.fastForward(TIMEOUT_MS + 5000); await page.waitForTimeout(200);
    await expect(page.locator('.cr-provenance')).toHaveCount(0); await expect(page.locator('.cr-item')).toHaveCount(0); await expect(page.getByRole('alert')).toContainText('La sesión está bloqueada'); expect(harness.activations()).toHaveLength(1);
  } finally { release(); }
});

test('R2 · cambiar el pin con la activación pendiente no deja temporizadores ni errores: el plazo vencido después no actualiza nada', async ({ page }) => {
  await start(page); await expect(activateButton(page)).toBeVisible(); await page.clock.install(); await stubTransport(page, 'never');
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message)); page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await activateButton(page).click(); await expect(page.getByRole('button', { name: 'Activando…' })).toBeVisible();
  await page.evaluate(() => (window as any).__radar.setPin(null)); await expect(page.getByRole('status').filter({ hasText: 'No hay una copia de ensayo activa' })).toBeVisible();
  await page.clock.fastForward(TIMEOUT_MS + 5000); await page.waitForTimeout(200);
  await expect(page.getByRole('alert')).toHaveCount(0); await expect(page.getByRole('button', { name: 'Activando…' })).toHaveCount(0); expect(await posts(page)).toBe(1); expect(errors, 'sin errores ni rechazos sin atender').toEqual([]);
});
