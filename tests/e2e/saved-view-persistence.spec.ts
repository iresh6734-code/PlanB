import { test, expect } from '@playwright/test';
import { build } from 'esbuild';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const origin = 'http://127.0.0.1:4534';
const storageKey = 'planb:views:contacts';
let bundle: string;

test.beforeAll(async () => {
  const fixture = await build({
    stdin: {
      resolveDir: repo,
      loader: 'tsx',
      contents: `
        import { createRoot } from 'react-dom/client';
        import { RecordsPage } from './src/app-shell/RecordsPage.tsx';
        import { makeDemoSpec, makeFixture } from './shared/fixtures.ts';

        const snapshot = makeFixture();
        const spec = makeDemoSpec(snapshot);
        const entity = spec.entities.find(item => item.id === 'contacts');
        const noop = () => {};
        createRoot(document.getElementById('root')).render(<RecordsPage
          state={{ snapshot, spec, changes: 0 }} spec={spec} entity={entity} entityName="contacts"
          rows={[]} records={[]} total={0} offset={0} setOffset={noop}
          query="Norte" setQuery={noop} pipeline="" setPipeline={noop}
          selected={null} setSelected={noop} recordsLoading={false} recordsError=""
          moveDeal={async () => null} saveField={async () => null}
        />);
      `,
    },
    bundle: true,
    write: false,
    format: 'iife',
    jsx: 'automatic',
    loader: { '.css': 'empty' },
  });
  bundle = fixture.outputFiles[0].text;
});

test('permite reintentar el guardado y el borrado de una vista tras rechazar la escritura', async ({ page }) => {
  await page.addInitScript(({ key }) => {
    sessionStorage.setItem('test:block-view-write', 'yes');
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (name, value) {
      if (name === key && sessionStorage.getItem('test:block-view-write') === 'yes') {
        throw new DOMException('Almacenamiento no disponible', 'QuotaExceededError');
      }
      original.call(this, name, value);
    };
  }, { key: storageKey });
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin !== origin) return route.abort();
    return url.pathname === '/fixture.js'
      ? route.fulfill({ contentType: 'application/javascript', body: bundle })
      : route.fulfill({
        contentType: 'text/html',
        body: '<!doctype html><html lang="es"><meta charset="utf-8"><div id="root"></div><script src="/fixture.js"></script></html>',
      });
  });
  await page.goto(origin);

  const view = page.getByRole('button', { name: 'Clientes del norte', exact: true });
  const nameField = page.getByRole('textbox', { name: 'Nombre de la vista' });
  const stored = () => page.evaluate(key => localStorage.getItem(key), storageKey);
  const allowWriting = () => page.evaluate(() => sessionStorage.removeItem('test:block-view-write'));
  await page.getByRole('button', { name: 'Guardar vista' }).click();
  await nameField.fill('Clientes del norte');
  await page.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('No se pudo guardar');
  await expect(nameField).toHaveValue('Clientes del norte');
  await expect(view).toHaveCount(0);
  expect(await stored()).toBeNull();

  await allowWriting();
  await page.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Vista «Clientes del norte» guardada');
  await expect(nameField).toHaveCount(0);
  await expect(view).toBeVisible();
  const saved = await stored();
  expect(JSON.parse(saved ?? 'null')).toEqual([expect.objectContaining({ name: 'Clientes del norte', query: 'Norte' })]);

  await page.reload();
  await expect(view).toBeVisible();
  const remove = page.getByRole('button', { name: 'Borrar la vista «Clientes del norte»' });
  await remove.click();
  await expect(page.getByRole('alert')).toContainText('No se pudo borrar');
  await expect(view).toBeVisible();
  expect(await stored()).toBe(saved);

  await allowWriting();
  await remove.click();
  await expect(page.getByRole('status')).toContainText('Vista «Clientes del norte» borrada');
  await expect(view).toHaveCount(0);
  expect(JSON.parse(await stored() ?? 'null')).toEqual([]);
  await page.reload();
  await expect(view).toHaveCount(0);
});
