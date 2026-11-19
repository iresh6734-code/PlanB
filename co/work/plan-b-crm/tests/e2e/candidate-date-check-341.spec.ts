import { expect, test } from '@playwright/test';
import { createHash, randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createBaseApp } from '../../server/app.js';
import { mountCommitmentRadar } from '../../server/commitment-radar-mount.js';
import { mountOperationalRehearsal } from '../../server/operational-rehearsal-mount.js';
import { mountDateCheck } from '../../server/date-check-mount.js';
import { mountDateCheckReview } from '../../server/date-check-review-mount.js';
import { registerTeamSync } from '../../server/team-sync.js';
import { makeDemoSpec, makeFixture } from '../../shared/fixtures.js';

const origin = 'http://127.0.0.1:4600';
const now = Date.parse('2026-11-11T15:00:00.000Z');
const title = 'Instalar 12 equipos VRF · Oficinas Lumen';
const candidate = 'candidate-158bfafe-08bd-4725-bb65-359424e5286e';
const artifactRoot = path.resolve(process.env.PLANB_CANDIDATE_341 ?? 'tests/.tmp/release-candidates/' + candidate);
const checkRoot = () => {
  if (path.basename(artifactRoot) !== candidate || !fs.statSync(artifactRoot).isDirectory()) throw Error('Se requiere la candidata local 340.');
  const manifest = JSON.parse(fs.readFileSync(path.join(artifactRoot, 'manifest.json'), 'utf8'));
  expect(manifest.state).toBe('compiled-and-node-verified');
  expect(manifest.approved).toBe(false);
  const dist = path.join(artifactRoot, 'runtime', 'dist');
  for (const artifact of manifest.artifacts as { path: string; sha256: string }[]) {
    if (!artifact.path.startsWith('dist/')) continue;
    const file = path.resolve(artifactRoot, 'runtime', artifact.path);
    expect(file.startsWith(dist + path.sep)).toBe(true);
    expect(fs.realpathSync(file)).toBe(file);
    expect(createHash('sha256').update(fs.readFileSync(file)).digest('hex')).toBe(artifact.sha256);
  }
  return dist;
};

async function open(root: string, dist: string) {
  const runtime = await createBaseApp({ root, dbPath: path.join(root, 'data.sqlite'), staticDir: dist, taskRevisions: true });
  const { app, store } = runtime;
  const clock = () => now;
  mountCommitmentRadar(app, store, { clock });
  mountOperationalRehearsal(app, store, { clock });
  mountDateCheck(app, store, { clock });
  mountDateCheckReview(app, store, { clock });
  registerTeamSync(app, store, undefined, false);
  return runtime;
}

test.use({ timezoneId: 'Europe/Madrid', locale: 'es-ES', serviceWorkers: 'block' });
test('341 · la candidata compilada conserva decisión y desenlace al reabrir SQLite', async ({ page }, info) => {
  const dist = checkRoot();
  const root = info.outputPath('fiction');
  fs.mkdirSync(root, { recursive: true });
  fs.writeFileSync(path.join(root, '.planb-key'), JSON.stringify({ kind: 'test', data: randomBytes(32).toString('base64') }), { flag: 'wx' });
  let active: Awaited<ReturnType<typeof open>> | null = await open(root, dist);
  try {
    const { store } = active;
    const snapshot = makeFixture('agency');
    store.importSnapshot(snapshot);
    store.saveGeneration(makeDemoSpec(snapshot), { provider: 'demo', model: null, generatedAt: new Date(now).toISOString(), prompt: '', approved: false });
    store.activate();

    const postLog: { path: string; status: number }[] = [];
    const errors: string[] = [];
    const external: string[] = [];
    const failedRequests: { path: string; status: number }[] = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error' && !/^Failed to load resource/.test(message.text())) errors.push(message.text()); });
    const bridge: Parameters<typeof page.route>[1] = async route => {
      const request = route.request();
      const url = new URL(request.url());
      if (url.origin !== origin) {
        external.push(url.origin);
        return route.abort();
      }
      if (!active) throw Error('La aplicación de ensayo aún no está abierta.');
      const method = request.method();
      if (method !== 'GET' && method !== 'POST' && method !== 'HEAD') throw Error('Método inesperado: ' + method);
      const body = request.postDataBuffer();
      const response = await active.app.inject({
        method, url: url.pathname + url.search,
        headers: { ...request.headers(), host: url.host },
        ...(body ? { payload: body } : {}),
      });
      if (response.statusCode >= 400) failedRequests.push({ path: url.pathname, status: response.statusCode });
      if (method === 'POST') postLog.push({ path: url.pathname, status: response.statusCode });
      const headers = Object.fromEntries(Object.entries(response.headers)
        .filter(([key, value]) => key !== 'transfer-encoding' && typeof value === 'string'));
      await route.fulfill({ status: response.statusCode, headers: headers as Record<string, string>, body: response.rawPayload });
    };
    await page.route('**/*', bridge);

    const nav = page.getByRole('button', { name: 'Comprobar una fecha', exact: true });
    const screen = page.locator('.dc');
    const review = page.locator('.drv');
    await page.goto(origin);
    await expect(page).toHaveTitle(/Plan B/);
    await nav.click();
    await expect(screen.getByLabel('Trabajo')).toHaveValue(title);
    await screen.getByRole('button', { name: 'Comprobar', exact: true }).click();
    await expect(screen.locator('.dc-verdict')).toContainText(/Se puede prometer si se confirma: Frioval/);
    await expect(screen.locator('.dc-summary')).toContainText(/martes, 17 de noviembre.*15:30/);
    const form = screen.locator('.dc-confirm');
    await form.getByLabel('Responsable').fill('Marta (ficción)');
    await form.getByRole('button', { name: 'Confirmar', exact: true }).click();
    await expect(screen.locator('.dc-receipt')).toContainText('Marta (ficción)');
    await review.getByRole('button', { name: 'Actualizar', exact: true }).click();
    await review.getByRole('button', { name: title, exact: true }).click();
    await review.getByRole('button', { name: 'El proveedor llegó tarde' }).click();
    await expect(review.locator('.drv-verdict')).toHaveText('La fecha ofrecida no se cumplió.');
    await expect(review.locator('.drv-residual')).toContainText('Quedan 40 min por comprobar');
    expect(postLog.map(entry => [entry.path.replace(/[0-9a-f-]{36}/, ':id'), entry.status])).toEqual([
      ['/api/v7/date-check/analyze', 200],
      ['/api/v7/date-check/checks', 201],
      ['/api/v7/date-check/checks/:id/confirm', 201],
      ['/api/v7/date-check-review/decisions/:id/outcome', 201],
    ]);
    expect(active.store.changesCount).toBe(0);
    const reads = () => active!.store.db.prepare("SELECT key, value FROM meta WHERE key LIKE 'date-check%' ORDER BY key").all();
    const saved = reads();
    expect(saved).toHaveLength(3);

    await page.unrouteAll({ behavior: 'wait' });
    await active.app.close();
    active = null;
    active = await open(root, dist);
    expect(reads()).toEqual(saved);
    await page.route('**/*', bridge);
    await page.reload();
    await nav.click();
    await expect(screen.locator('.dc-saved')).toContainText('con siguiente paso · vigente');
    await review.getByRole('button', { name: title, exact: true }).click();
    await expect(review.locator('.drv-residual')).toContainText('Quedan 40 min por comprobar');
    expect(reads()).toEqual(saved);
    expect(postLog).toHaveLength(4);
    for (const width of [1440, 390, 320]) {
      await page.setViewportSize({ width, height: 900 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
      await review.scrollIntoViewIfNeeded();
      await page.screenshot({ path: info.outputPath('revision-' + width + '.png') });
    }
    expect(external).toEqual([]);
    expect(errors).toEqual([]);
    expect(failedRequests).toEqual([]);
  } finally {
    try { await page.unrouteAll({ behavior: 'wait' }); }
    finally { await active?.app.close(); }
  }
});
