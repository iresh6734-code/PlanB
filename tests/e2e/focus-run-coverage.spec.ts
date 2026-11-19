import { test, expect } from '@playwright/test';
import { build } from 'esbuild';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const origin = 'http://127.0.0.1:4548';
const endpoint = '**/api/v2/records/tasks?*';
let bundle: string;

test.beforeAll(async () => {
  const fixture = await build({
    stdin: {
      resolveDir: root,
      loader: 'tsx',
      contents: `
        import { useState } from 'react';
        import { createRoot } from 'react-dom/client';
        import { FocusRun } from './src/app-shell/FocusRun.tsx';
        import { makeDemoSpec, makeFixture } from './shared/fixtures.ts';
        const spec = makeDemoSpec(makeFixture());
        const fetchPage = window.fetch.bind(window);
        window.fetch = (input, init) => {
          init?.signal?.addEventListener('abort', () => {
            document.body.dataset.scanCancelled = 'true';
          }, { once: true });
          return fetchPage(input, init);
        };
        function Fixture() {
          const [open, setOpen] = useState(false);
          return <>
            <button onClick={() => setOpen(true)}>Abrir revisión</button>
            {open && <FocusRun spec={spec} saveField={async () => 'Guardado inesperado'} onOpen={() => {}} close={() => setOpen(false)} />}
          </>;
        }
        createRoot(document.getElementById('root')).render(<Fixture />);
      `,
    },
    bundle: true, write: false, format: 'iife', jsx: 'automatic', loader: { '.css': 'empty' },
  });
  bundle = fixture.outputFiles[0].text;
});

test.beforeEach(async ({ page }) => {
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin !== origin || route.request().method() !== 'GET') return route.abort();
    if (url.pathname === '/fixture.js') return route.fulfill({ contentType: 'application/javascript', body: bundle });
    return route.fulfill({ contentType: 'text/html', body: '<!doctype html><meta charset="utf-8"><div id="root"></div><script src="/fixture.js"></script>' });
  });
});

const task = (index: number, due = '2099-12-31') => ({
  entity: 'tasks', id: 'task-' + index, values: { subject: 'Tarea ' + index, due_date: due, status: 'pending' },
});

test('300 de 350 tareas sin vencimientos leídos produce un aviso de alcance parcial', async ({ page }) => {
  const offsets: number[] = [];
  await page.route(endpoint, route => {
    const offset = Number(new URL(route.request().url()).searchParams.get('offset'));
    offsets.push(offset);
    return route.fulfill({ json: { records: Array.from({ length: 100 }, (_, index) => task(offset + index)), related: [], total: 350 } });
  });
  await page.goto(origin);
  await page.getByRole('button', { name: 'Abrir revisión' }).click();
  const dialog = page.getByRole('dialog', { name: 'Despachar vencidas' });
  await expect(dialog.getByRole('status')).toContainText('Se revisaron 300 de 350 tareas.');
  await expect(dialog.getByText('No hay tareas vencidas entre las revisadas.')).toBeVisible();
  await expect(dialog.getByText('Nada vencido.', { exact: true })).toHaveCount(0);
  expect(offsets).toEqual([0, 100, 200]);
});

test('una lectura fallida se puede reintentar y el resultado completo recupera el estado normal', async ({ page }) => {
  let attempts = 0;
  await page.route(endpoint, route => {
    if (++attempts === 1) return route.fulfill({ status: 503, json: { error: 'Lectura interrumpida' } });
    return route.fulfill({ json: { records: [task(1)], related: [], total: 1 } });
  });
  await page.goto(origin);
  await page.getByRole('button', { name: 'Abrir revisión' }).click();
  const dialog = page.getByRole('dialog', { name: 'Despachar vencidas' });
  await expect(dialog.getByRole('alert')).toHaveText('Lectura interrumpida');
  await dialog.getByRole('button', { name: 'Reintentar' }).click();
  await expect(dialog.getByText('Nada vencido.', { exact: true })).toBeVisible();
  await expect(dialog.getByText(/Se revisaron|El listado cambió/)).toHaveCount(0);
  expect(attempts).toBe(2);
});

test('cerrar con una página pendiente aborta la lectura y volver a abrir comienza desde cero', async ({ page }) => {
  const offsets: number[] = [];
  let release!: () => void;
  let firstReturned!: () => void;
  const hold = new Promise<void>(resolve => { release = resolve; });
  const returned = new Promise<void>(resolve => { firstReturned = resolve; });
  await page.route(endpoint, async route => {
    const offset = Number(new URL(route.request().url()).searchParams.get('offset'));
    offsets.push(offset);
    if (offsets.length === 1) {
      await hold;
      try {
        await route.fulfill({ json: { records: [task(99, '2001-01-01')], related: [], total: 350 } });
      } catch {
        // Chromium puede retirar la intercepción si la petición ya se abortó.
      } finally {
        firstReturned();
      }
      return;
    }
    await route.fulfill({ json: { records: [task(2)], related: [], total: 1 } });
  });
  try {
    await page.goto(origin);
    const opener = page.getByRole('button', { name: 'Abrir revisión' });
    await opener.click();
    await expect.poll(() => offsets.length).toBe(1);
    const dialog = page.getByRole('dialog', { name: 'Despachar vencidas' });
    await dialog.getByRole('button', { name: 'Cerrar' }).click();
    await expect(page.locator('body')).toHaveAttribute('data-scan-cancelled', 'true');
    release();
    await returned;
    await opener.click();
    await expect(dialog.getByText('Nada vencido.', { exact: true })).toBeVisible();
    await expect(dialog.getByText('Tarea 99')).toHaveCount(0);
    expect(offsets).toEqual([0, 0]);
  } finally {
    release();
  }
});
