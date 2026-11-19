import { expect, test, type Page } from '@playwright/test';
import { build } from 'esbuild';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const origin = 'http://127.0.0.1:4556';
const previous = {
  instanceId: '571bdc83-e2cd-4ad0-96ad-fb23d6b487aa', captureId: 'fixture:2026-11-18T12:00:00.000Z',
  accountId: 'anterior-ficticio', capturedAt: '2026-11-18T12:00:00.000Z', isTestData: true, contextRevision: 'a'.repeat(64),
};
const current = { ...previous, accountId: 'vigente-ficticio', contextRevision: 'b'.repeat(64) };
let bundle: string;
test.beforeAll(async () => {
  const output = await build({
    stdin: { resolveDir: root, loader: 'tsx', contents: `
      import { useState } from 'react';
      import { createRoot } from 'react-dom/client';
      import { WorkspaceSearch } from './src/WorkspaceSearch.tsx';
      import { api } from './src/api.ts';
      function Fixture() {
        const [context, setContext] = useState(${JSON.stringify(previous)});
        const [open, setOpen] = useState(true);
        const refresh = async signal => {
          signal.addEventListener('abort', () => { document.body.dataset.refreshAborted = 'true'; }, { once: true });
          const data = await api('/v2/state', { signal });
          signal.throwIfAborted();
          setContext(data.workspaceSearchContext);
        };
        return <>
          <button onClick={() => setOpen(true)}>Abrir buscador</button>
          {open && <WorkspaceSearch captureId={context.captureId} expectedContext={context} localRevision={1}
            refreshWorkspace={refresh} close={() => setOpen(false)} openRecord={() => { document.body.dataset.recordOpened = 'true'; }} />}
        </>;
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

const response = (context = previous) => ({
  query: 'contacto', offset: 0, limit: 20, total: 1, hasMore: false,
  counts: { contacts: 1, companies: 0, deals: 0, tasks: 0 },
  source: { ...context, revision: 'c'.repeat(64) },
  items: [{ entity: 'contacts', id: 'contact-1', label: context === current ? 'Contacto vigente' : 'Contacto anterior', matchedId: false, matches: [], totalMatchedFields: 0 }],
});
const openSearch = async (page: Page) => {
  await page.goto(origin);
  const dialog = page.getByRole('dialog', { name: 'Buscar en toda la copia' });
  await dialog.getByRole('searchbox').fill('contacto');
  return dialog;
};

test('el 409 de selección vuelve a leer el estado y conserva el criterio más reciente', async ({ page }) => {
  let refreshes = 0, release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  const queries: { context: string | null; query: string | null; offset: string | null }[] = [];
  await page.route('**/api/v2/search?*', route => {
    const params = new URL(route.request().url()).searchParams;
    const context = params.get('contextRevision');
    queries.push({ context, query: params.get('q'), offset: params.get('offset') });
    return route.fulfill({ json: response(context === current.contextRevision ? current : previous) });
  });
  await page.route('**/api/v2/search-record?*', route => route.fulfill({ status: 409, json: { error: 'La copia cambió.' } }));
  await page.route('**/api/v2/state', async route => {
    refreshes++;
    await held;
    return route.fulfill({ json: { workspaceSearchContext: current } });
  });
  try {
    const dialog = await openSearch(page);
    await dialog.getByRole('button', { name: /Contacto anterior/ }).click();
    await dialog.getByRole('button', { name: 'Actualizar resultados' }).click();
    await expect.poll(() => refreshes).toBe(1);
    await expect(dialog.getByText('Actualizando la copia activa…')).toBeVisible();
    await dialog.getByRole('searchbox').fill('detalle');
    await expect(dialog.getByRole('listitem')).toHaveCount(0);
    release();
    await expect(dialog.getByRole('button', { name: /Contacto vigente/ })).toBeVisible();
    expect(queries).toEqual([
      { context: previous.contextRevision, query: 'contacto', offset: '0' },
      { context: current.contextRevision, query: 'detalle', offset: '0' },
    ]);
    await expect(page.locator('body')).not.toHaveAttribute('data-record-opened', 'true');
  } finally {
    release();
  }
});

test('si falla la actualización del estado, el reintento vuelve a pedirlo antes de buscar', async ({ page }) => {
  let refreshes = 0;
  const contexts: (string | null)[] = [];
  await page.route('**/api/v2/search?*', route => {
    const context = new URL(route.request().url()).searchParams.get('contextRevision');
    contexts.push(context);
    if (context === previous.contextRevision) return route.fulfill({ status: 409, json: { error: 'La copia cambió.' } });
    return route.fulfill({ json: response(current) });
  });
  await page.route('**/api/v2/state', route => {
    if (++refreshes === 1) return route.fulfill({ status: 503, json: { error: 'Estado temporalmente no disponible' } });
    return route.fulfill({ json: { workspaceSearchContext: current } });
  });
  const dialog = await openSearch(page);
  const retry = dialog.getByRole('button', { name: 'Reintentar búsqueda' });
  await retry.click();
  await expect(dialog.getByRole('alert')).toContainText('Estado temporalmente no disponible');
  expect(contexts).toEqual([previous.contextRevision]);
  await retry.click();
  await expect(dialog.getByRole('button', { name: /Contacto vigente/ })).toBeVisible();
  expect(contexts).toEqual([previous.contextRevision, current.contextRevision]);
  expect(refreshes).toBe(2);
});

test('cerrar el diálogo cancela la actualización y su respuesta tardía queda descartada', async ({ page }) => {
  let refreshes = 0, release!: () => void, returned!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  const completed = new Promise<void>(resolve => { returned = resolve; });
  const contexts: (string | null)[] = [];
  await page.route('**/api/v2/search?*', route => {
    contexts.push(new URL(route.request().url()).searchParams.get('contextRevision'));
    return route.fulfill({ status: 409, json: { error: 'La copia cambió.' } });
  });
  await page.route('**/api/v2/state', async route => {
    refreshes++;
    await held;
    try { await route.fulfill({ json: { workspaceSearchContext: current } }); }
    catch { /* Chromium puede retirar la intercepción al abortar. */ }
    finally { returned(); }
  });
  try {
    const dialog = await openSearch(page);
    await dialog.getByRole('button', { name: 'Reintentar búsqueda' }).click();
    await expect.poll(() => refreshes).toBe(1);
    await dialog.getByRole('button', { name: 'Cerrar búsqueda global' }).click();
    await expect(page.locator('body')).toHaveAttribute('data-refresh-aborted', 'true');
    release();
    await completed;
    await page.getByRole('button', { name: 'Abrir buscador' }).click();
    await dialog.getByRole('searchbox').fill('contacto');
    await expect(dialog.getByRole('alert')).toContainText('La copia cambió');
    expect(contexts).toEqual([previous.contextRevision, previous.contextRevision]);
  } finally {
    release();
  }
});
