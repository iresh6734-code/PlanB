import { test, expect } from '@playwright/test';
import { build } from 'esbuild';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const origin = 'http://127.0.0.1:4539';
let bundle: string;

test.beforeAll(async () => {
  const fixture = await build({
    stdin: {
      resolveDir: repo,
      loader: 'tsx',
      contents: `
        import { useState } from 'react';
        import { createRoot } from 'react-dom/client';
        import { RelatedPanel } from './src/app-shell/RelatedPanel.tsx';
        import { makeDemoSpec, makeFixture } from './shared/fixtures.ts';

        const snapshot = makeFixture();
        const spec = makeDemoSpec(snapshot);
        const contact = snapshot.records.find(record => record.entity === 'contacts');
        const company = snapshot.records.find(record => record.entity === 'companies');
        function Fixture() {
          const [record, setRecord] = useState(contact);
          return <>
            <button onClick={() => setRecord(company)}>Abrir empresa</button>
            <button onClick={() => setRecord(null)}>Cerrar ficha</button>
            {record ? <RelatedPanel spec={spec} record={record} dirty={false} onOpen={setRecord} /> : null}
          </>;
        }
        createRoot(document.getElementById('root')).render(<Fixture />);
      `,
    },
    bundle: true,
    write: false,
    jsx: 'automatic',
    format: 'iife',
    loader: { '.css': 'empty' },
  });
  bundle = fixture.outputFiles[0].text;
});

test.beforeEach(async ({ page }) => {
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin !== origin) return route.abort();
    if (url.pathname === '/fixture.js') return route.fulfill({ contentType: 'application/javascript', body: bundle });
    return route.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><html lang="es"><meta charset="utf-8"><div id="root"></div><script src="/fixture.js"></script></html>',
    });
  });
});

test('cambiar de ficha cancela la lectura antigua y solo muestra relaciones de la ficha actual', async ({ page }) => {
  let announce!: () => void;
  const started = new Promise<void>(resolve => { announce = resolve; });
  let initial = true;
  await page.route('**/api/v2/records/**', route => {
    const url = new URL(route.request().url());
    if (initial && url.pathname.endsWith('/deals')) {
      initial = false;
      announce();
      return;
    }
    const records = url.pathname.endsWith('/contacts') ? [{
      id: 'contact-current', entity: 'contacts', values: { firstname: 'Contacto vigente', company_id: 'company-1' },
    }] : [];
    return route.fulfill({ json: { records, total: records.length } });
  });
  await page.goto(origin);
  await started;
  const canceled = page.waitForEvent('requestfailed', { timeout: 4000, predicate: request => new URL(request.url()).pathname.endsWith('/deals') });
  await page.getByRole('button', { name: 'Abrir empresa' }).click();
  expect((await canceled).failure()?.errorText).toContain('ABORTED');
  await expect(page.getByRole('button', { name: /Contacto vigente/ })).toBeVisible();
  await page.getByRole('button', { name: 'Cerrar ficha' }).click();
  await expect(page.getByRole('heading', { name: 'Relacionado' })).toHaveCount(0);
});

test('una lectura fallida se puede reintentar desde la ficha y recupera sus relaciones', async ({ page }) => {
  const requests: string[] = [];
  await page.route('**/api/v2/records/**', route => {
    const req = route.request();
    expect(req.method()).toBe('GET');
    const entity = new URL(req.url()).pathname.split('/').at(-1)!;
    requests.push(entity);
    if (requests.length === 1) return route.fulfill({ status: 503, json: { error: 'Lectura temporalmente interrumpida' } });
    const records = entity === 'deals' ? [{
      id: 'deal-retry', entity: 'deals', values: { dealname: 'Oportunidad recuperada', contact_id: 'contact-1' },
    }] : [];
    return route.fulfill({ json: { records, total: records.length } });
  });
  await page.goto(origin);
  await expect(page.getByRole('alert')).toContainText('Lectura temporalmente interrumpida');
  await page.getByRole('button', { name: 'Reintentar' }).click();
  await expect(page.getByRole('button', { name: /Oportunidad recuperada/ })).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
  expect(requests).toEqual(['deals', 'deals', 'tasks']);
});
