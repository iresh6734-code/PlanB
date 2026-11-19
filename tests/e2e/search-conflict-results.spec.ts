import { expect, test, type Page } from '@playwright/test';
import { build } from 'esbuild';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const origin = 'http://127.0.0.1:4553';
const original = {
  instanceId: '58dc7367-29d3-48b1-a4b0-661c26e56e60', captureId: 'fixture:2026-11-18T12:00:00.000Z',
  accountId: 'original-ficticio', capturedAt: '2026-11-18T12:00:00.000Z', isTestData: true, contextRevision: 'a'.repeat(64),
};
const replacement = { ...original, accountId: 'nuevo-ficticio', contextRevision: 'b'.repeat(64) };
const revision = 'c'.repeat(64);
let bundle: string;

test.beforeAll(async () => {
  const output = await build({
    stdin: { resolveDir: root, loader: 'tsx', contents: `
      import { useEffect, useState } from 'react';
      import { createRoot } from 'react-dom/client';
      import { WorkspaceSearch } from './src/WorkspaceSearch.tsx';
      function Fixture() {
        const [context, setContext] = useState(${JSON.stringify(original)});
        useEffect(() => {
          const refresh = () => setContext(${JSON.stringify(replacement)});
          window.addEventListener('fixture-refresh', refresh);
          return () => window.removeEventListener('fixture-refresh', refresh);
        }, []);
        return <WorkspaceSearch captureId={context.captureId} expectedContext={context} localRevision={1}
          close={() => {}} openRecord={() => { document.body.dataset.opened = 'true'; }} />;
      }
      createRoot(document.getElementById('root')).render(<Fixture />);
    ` },
    bundle: true, write: false, format: 'iife', jsx: 'automatic', loader: { '.css': 'empty' },
  });
  bundle = output.outputFiles[0].text;
});

test.beforeEach(async ({ page }) => {
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin !== origin || route.request().method() !== 'GET') return route.abort();
    if (url.pathname === '/fixture.js') return route.fulfill({ contentType: 'application/javascript', body: bundle });
    return route.fulfill({ contentType: 'text/html', body: '<!doctype html><meta charset="utf-8"><div id="root"></div><script src="/fixture.js"></script>' });
  });
});

const results = (offset: number, context = original) => ({
  query: 'contacto', offset, limit: 20, total: 41, hasMore: offset < 40,
  counts: { contacts: 41, companies: 0, deals: 0, tasks: 0 },
  source: { ...context, revision }, items: [{
    entity: 'contacts', id: 'contact-' + offset, label: context === replacement ? 'Contacto de la copia vigente' : 'Contacto original ' + offset,
    matchedId: false, matches: [], totalMatchedFields: 0,
  }],
});
const open = async (page: Page) => {
  await page.goto(origin);
  const dialog = page.getByRole('dialog', { name: 'Buscar en toda la copia' });
  await dialog.getByRole('searchbox').fill('contacto');
  await expect(dialog.getByRole('button', { name: /Contacto original 0/ })).toBeVisible();
  return dialog;
};

test('un 409 al abrir retira las filas y la paginación y el reintento conserva la identidad exigida', async ({ page }) => {
  let denied = false;
  const queries: { offset: number; context: string | null; revision: string | null }[] = [];
  await page.route('**/api/v2/search?*', route => {
    const params = new URL(route.request().url()).searchParams;
    const request = { offset: Number(params.get('offset')), context: params.get('contextRevision'), revision: params.get('revision') };
    queries.push(request);
    if (denied && request.context === original.contextRevision) {
      return route.fulfill({ status: 409, json: { error: 'La copia cambió. Actualiza el espacio de trabajo.' } });
    }
    return route.fulfill({ json: results(request.offset, request.context === replacement.contextRevision ? replacement : original) });
  });
  await page.route('**/api/v2/search-record?*', route => {
    denied = true;
    return route.fulfill({ status: 409, json: { error: 'La copia cambió. Actualiza los resultados.' } });
  });
  const dialog = await open(page);
  await dialog.getByRole('button', { name: 'Siguiente' }).click();
  await dialog.getByRole('button', { name: /Contacto original 20/ }).click();
  await expect(dialog.getByRole('alert')).toContainText('La copia cambió');
  await expect(dialog.getByRole('list', { name: 'Resultados de la búsqueda global' })).toHaveCount(0);
  await expect(dialog.getByRole('navigation', { name: 'Páginas de búsqueda global' })).toHaveCount(0);
  await expect(dialog).not.toContainText('Portal original-ficticio');
  await expect(page.locator('body')).not.toHaveAttribute('data-opened', 'true');
  await dialog.getByRole('button', { name: 'Actualizar resultados' }).click();
  await expect(dialog.getByRole('alert')).toContainText('Actualiza el espacio de trabajo');
  expect(queries).toEqual([
    { offset: 0, context: original.contextRevision, revision: null },
    { offset: 20, context: original.contextRevision, revision },
    { offset: 0, context: original.contextRevision, revision: null },
  ]);

  await page.evaluate(() => window.dispatchEvent(new Event('fixture-refresh')));
  await expect(dialog.getByRole('button', { name: /Contacto de la copia vigente/ })).toBeVisible();
  expect(queries.at(-1)).toEqual({ offset: 0, context: replacement.contextRevision, revision: null });
});

test('un fallo transitorio al abrir una ficha conserva resultados que siguen vigentes', async ({ page }) => {
  await page.route('**/api/v2/search?*', route => route.fulfill({ json: results(0) }));
  await page.route('**/api/v2/search-record?*', route => route.fulfill({ status: 503, json: { error: 'Lectura interrumpida' } }));
  const dialog = await open(page);
  await dialog.getByRole('button', { name: /Contacto original 0/ }).click();
  await expect(dialog.getByRole('alert')).toHaveText(/Lectura interrumpida/);
  await expect(dialog.getByRole('button', { name: /Contacto original 0/ })).toBeVisible();
  await expect(page.locator('body')).not.toHaveAttribute('data-opened', 'true');
});
