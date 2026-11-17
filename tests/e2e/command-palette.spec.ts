import { test, expect } from '@playwright/test';
import { build } from 'esbuild';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

declare global {
  interface Window {
    palette419: { requested: string[]; resolve: () => void };
  }
}

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const source = process.env.PLANB_PALETTE419_SOURCE ?? repo;
const origin = 'http://127.0.0.1:4517';
let bundle: string;

test.beforeAll(async () => {
  const result = await build({
    stdin: {
      resolveDir: source,
      loader: 'tsx',
      contents: `
        import { useEffect, useState } from 'react';
        import { createRoot } from 'react-dom/client';
        import { CommandPalette } from ${JSON.stringify(path.join(source, 'src/app-shell/CommandPalette.tsx'))};

        window.palette419 = { requested: [], resolve() {} };
        function Fixture() {
          const [open, setOpen] = useState(false);
          const [executed, setExecuted] = useState<string[]>([]);
          useEffect(() => {
            const key = event => {
              if (event.ctrlKey && event.key.toLowerCase() === 'j') {
                event.preventDefault();
                setOpen(true);
              }
            };
            document.addEventListener('keydown', key);
            return () => document.removeEventListener('keydown', key);
          }, []);
          const find = query => {
            window.palette419.requested.push(query);
            return new Promise(resolve => {
              window.palette419.resolve = () => resolve([
                { id: 'first', label: 'Lucía Martín', group: 'Registros', run: () => setExecuted(previous => [...previous, 'first']) },
                { id: 'second', label: 'Lucía Vega', group: 'Registros', run: () => setExecuted(previous => [...previous, 'second']) },
              ]);
            });
          };
          return <>
            <button onClick={() => setOpen(true)}>Abrir órdenes</button>
            <output aria-label="Orden ejecutada">{executed.join(',')}</output>
            {open ? <CommandPalette
              commands={[{ id: 'home', label: 'Ir a Inicio', group: 'Ir a', run: () => setExecuted(previous => [...previous, 'home']) }]}
              close={() => setOpen(false)}
              findRecords={find}
            /> : null}
          </>;
        }
        createRoot(document.getElementById('root')).render(<Fixture />);
      `,
    },
    bundle: true,
    write: false,
    format: 'iife',
    jsx: 'automatic',
    logLevel: 'error',
    loader: { '.css': 'empty' },
  });
  bundle = result.outputFiles[0].text;
});

test.beforeEach(async ({ page }) => {
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin !== origin) return route.abort();
    if (url.pathname === '/fixture.js') {
      return route.fulfill({ contentType: 'application/javascript', body: bundle });
    }
    return route.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><html lang="es"><meta charset="utf-8"><title>Paleta de prueba</title><div id="root"></div><script src="/fixture.js"></script></html>',
    });
  });
  await page.goto(origin);
});

test('419 · flecha abajo sin resultados conserva una opción activa cuando llega la búsqueda', async ({ page }) => {
  await page.getByRole('button', { name: 'Abrir órdenes', exact: true }).focus();
  await page.keyboard.press('Control+j');
  const input = page.getByRole('combobox', { name: 'Escribe una orden o un nombre' });
  await expect(input).toBeFocused();
  await input.fill('Lucía');
  await expect.poll(() => page.evaluate(() => window.palette419.requested)).toEqual(['Lucía']);
  await expect(page.getByRole('option')).toHaveCount(0);
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await page.evaluate(() => window.palette419.resolve());
  const first = page.getByRole('option', { name: /^Lucía Martín/ });
  await expect(first).toHaveAttribute('aria-selected', 'true');
  await expect(input).toHaveAttribute('aria-activedescendant', 'gx-command-first');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByLabel('Orden ejecutada')).toHaveText('first');
});

test('419 · flechas, Intro y Escape conservan la navegación y devuelven el foco al abrir órdenes', async ({ page }) => {
  const trigger = page.getByRole('button', { name: 'Abrir órdenes', exact: true });
  await trigger.click();
  const input = page.getByRole('combobox', { name: 'Escribe una orden o un nombre' });
  await expect(input).toBeFocused();
  await input.fill('Lucía');
  await expect.poll(() => page.evaluate(() => window.palette419.requested)).toEqual(['Lucía']);
  await page.evaluate(() => window.palette419.resolve());
  await expect(page.getByRole('option')).toHaveCount(2);
  await page.keyboard.press('ArrowDown');
  await expect(input).toHaveAttribute('aria-activedescendant', 'gx-command-second');
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('ArrowUp');
  await expect(input).toHaveAttribute('aria-activedescendant', 'gx-command-first');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await expect(page.getByLabel('Orden ejecutada')).toBeEmpty();
  await page.keyboard.press('Control+j');
  await expect(input).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByLabel('Orden ejecutada')).toHaveText('home');
});
