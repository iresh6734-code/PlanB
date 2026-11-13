import { expect, test } from '@playwright/test';
import { build } from 'esbuild';
import path from 'node:path';
import { createBaseApp } from '../../server/app.js';
import { mountDateCheck } from '../../server/date-check-mount.js';
import { makeDemoSpec, makeFixture } from '../../shared/fixtures.js';
import { dateCheckApiPath, dateCheckView, type DateCheckView } from '../../shared/date-check-api.js';

const origin = 'http://127.0.0.1:4600';
const now = Date.parse('2026-11-11T15:00:00.000Z');
let files: Map<string, Buffer>;

test.beforeAll(async () => {
  const out = path.join(process.cwd(), 'tests', '.tmp', 'date-check-338-browser-assets');
  const bundle = await build({
    entryPoints: { page: 'tests/e2e/date-check-page.tsx' }, bundle: true, format: 'esm', outdir: out,
    jsx: 'automatic', logLevel: 'error', write: false,
    define: { 'process.env.NODE_ENV': '"production"' },
    loader: { '.woff2': 'file', '.woff': 'file', '.svg': 'file', '.png': 'file' },
  });
  files = new Map(bundle.outputFiles.map(file => ['/' + path.basename(file.path), Buffer.from(file.contents)]));
});

const documents = '<!doctype html><html lang="es"><meta charset="utf-8"><title>Ensayo independiente</title><link rel="stylesheet" href="/page.css"><div id="root"></div><script type="module" src="/page.js"></script>';
const mime = (name: string) => name.endsWith('.js') ? 'text/javascript' : name.endsWith('.css') ? 'text/css' : 'application/octet-stream';

const mode = [
  ['capacidad', 'No cabe dentro de la semana de ensayo'],
  ['incompleta', 'La búsqueda no terminó'],
  ['matriz', 'Protecciones sin determinar'],
] as const;

for (const [scenario, expectedText] of mode) {
  test('338 · presenta el alcance de la evidencia en ' + scenario, async ({ page }, info) => {
    const { app, store } = await createBaseApp({ root: '.', dbPath: ':memory:', staticDir: 'none' });
    try {
      mountDateCheck(app, store, { clock: () => now });
      const snapshot = makeFixture('agency');
      store.importSnapshot(snapshot);
      store.saveGeneration(makeDemoSpec(snapshot), { provider: 'demo', model: null, generatedAt: new Date(now).toISOString(), prompt: '', approved: false });
      store.activate();
      const before = store.changesCount;
      const methods: string[] = [];
      const errors: string[] = [];
      page.on('pageerror', error => errors.push(error.message));
      let view: DateCheckView | undefined;

      await page.route('**/*', async route => {
        const request = route.request();
        const url = new URL(request.url());
        if (url.origin !== origin) return route.abort();
        if (url.pathname === '/') return route.fulfill({ status: 200, contentType: 'text/html', body: documents });
        const bytes = files.get(url.pathname);
        if (bytes) return route.fulfill({ status: 200, contentType: mime(url.pathname), body: bytes });
        if (!url.pathname.startsWith('/api/')) return route.fulfill({ status: 404 });

        const method = request.method() === 'POST' ? 'POST' : 'GET';
        methods.push(method + ' ' + url.pathname);
        const body = request.postData();
        const response = await app.inject({
          method, url: url.pathname + url.search,
          headers: { host: '127.0.0.1', ...(body ? { 'content-type': 'application/json' } : {}) },
          ...(body ? { payload: body } : {}),
        });
        if (url.pathname !== dateCheckApiPath + '/analyze' || response.statusCode !== 200) {
          return route.fulfill({ status: response.statusCode, contentType: 'application/json', body: response.body });
        }

        view = dateCheckView.parse(response.json());
        if (scenario === 'incompleta') {
          view.search.complete = false;
          const keep = view.alternatives.find(item => item.id === view!.keepId)!;
          keep.requested = { outcome: 'misses', classification: 'incomplete' };
          keep.supported = { at: null, basis: 'none', proven: false };
          view.best = null;
        } else if (scenario === 'matriz') {
          const cells = view.scenarios[0]!.cells;
          const keep = cells.find(cell => cell.alternativeId === view!.keepId)!;
          Object.assign(keep, { outcome: 'unknown', protectionsKept: null });
          const other = cells.find(cell => cell.alternativeId !== view!.keepId)!;
          Object.assign(other, { outcome: 'misses', protectionsKept: false });
        }
        return route.fulfill({ status: 200, json: dateCheckView.parse(view) });
      });

      await page.goto(origin);
      const screen = page.locator('.dc');
      await expect(screen.getByLabel('Trabajo')).toBeVisible();
      if (scenario === 'capacidad') {
        await screen.getByLabel('Duración (horas)').fill('49');
        await screen.getByRole('combobox', { name: /^Material/ }).selectOption('none');
      }
      await screen.getByRole('button', { name: 'Comprobar', exact: true }).click();
      const summary = screen.locator('.dc-summary');
      await expect(summary).toBeVisible();
      expect(view).toBeDefined();
      expect(methods.filter(line => line.startsWith('POST '))).toEqual(['POST ' + dateCheckApiPath + '/analyze']);
      expect(store.changesCount).toBe(before);
      expect(store.db.prepare("SELECT count(*) AS n FROM meta WHERE key LIKE 'date-check:%'").get()?.n).toBe(0);
      expect(errors).toEqual([]);
      await page.screenshot({ path: info.outputPath('resultado.png') });

      if (scenario === 'matriz') {
        const cell = screen.locator('.dc-matrix td').filter({ hasText: 'Sin determinar' }).first();
        await expect(cell).toContainText(expectedText);
        await expect(cell).not.toContainText('rompe una protección');
        await expect(screen.locator('.dc-matrix td').filter({ hasText: 'rompe una protección' }).first()).toBeVisible();
      } else {
        const keep = view!.alternatives.find(item => item.id === view!.keepId)!;
        if (scenario === 'capacidad') {
          expect(keep.blockers.some(blocker => blocker.code === 'horizon')).toBe(true);
          expect(view!.alternatives.every(item => item.protections.every(protection => protection.kept !== false))).toBe(true);
        } else {
          await expect(summary.locator('.dc-dates')).toContainText('Sin determinar');
        }
        await expect(summary.locator('.dc-verdict')).toContainText(expectedText);
      }
    } finally {
      try { await page.unrouteAll({ behavior: 'wait' }); }
      finally { await app.close(); }
    }
  });
}
