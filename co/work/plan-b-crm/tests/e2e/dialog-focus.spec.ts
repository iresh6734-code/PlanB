// CLAUDE-A11Y-D7 · Foco de las ventanas y de la paleta, en un navegador real y sin servidor: el fixture se compila con
// esbuild a partir del código actual y se sirve desde page.route (la red exterior queda abortada).
import { test, expect } from '@playwright/test';
import { build } from 'esbuild';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const origin = 'http://127.0.0.1:4519';
let bundle: string;

test.beforeAll(async () => {
  const result = await build({
    stdin: {
      resolveDir: repo, loader: 'tsx',
      contents: `
        import { StrictMode, useEffect, useState } from 'react';
        import { createRoot } from 'react-dom/client';
        import { Modal } from ${JSON.stringify(path.join(repo, 'src/components.tsx'))};
        import { CommandPalette } from ${JSON.stringify(path.join(repo, 'src/app-shell/CommandPalette.tsx'))};
        function Fixture() {
          const [open, setOpen] = useState(null), [ran, setRan] = useState('');
          useEffect(() => {
            const key = event => { if (event.ctrlKey && event.key.toLowerCase() === 'j') { event.preventDefault(); setOpen('palette'); } };
            document.addEventListener('keydown', key); return () => document.removeEventListener('keydown', key);
          }, []);
          return <>
            <button onClick={() => setOpen('plain')}>Abrir ventana</button>
            <button onClick={() => setOpen('field')}>Abrir ventana con campo</button>
            <output aria-label="Ejecutada">{ran}</output>
            {open === 'plain' ? <Modal title="Ventana" close={() => setOpen(null)}><button>Primero</button><button>Último</button></Modal> : null}
            {open === 'field' ? <Modal title="Con campo" close={() => setOpen(null)}><button>Antes</button><input aria-label="Nombre" autoFocus /></Modal> : null}
            {open === 'palette' ? <CommandPalette close={() => setOpen(null)} commands={[
              { id: 'home', label: 'Ir a Inicio', group: 'Ir a', run: () => setRan('home') },
              { id: 'csv', label: 'Importar desde CSV…', group: 'Crear', run: () => setRan('csv') },
            ]} /> : null}
          </>;
        }
        // Dos montajes: sencillo y con StrictMode, como src/main.tsx (revisión 420 de Codex).
        createRoot(document.getElementById('root')).render(location.search.includes('strict') ? <StrictMode><Fixture /></StrictMode> : <Fixture />);`,
    },
    bundle: true, write: false, format: 'iife', jsx: 'automatic', logLevel: 'error', loader: { '.css': 'empty' },
  });
  bundle = result.outputFiles[0].text;
});

const goto = (page: import('@playwright/test').Page, strict: boolean) => page.goto(origin + (strict ? '/?strict' : '/'));
test.beforeEach(async ({ page }) => {
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin !== origin) return route.abort();
    if (url.pathname === '/fixture.js') return route.fulfill({ contentType: 'application/javascript', body: bundle });
    return route.fulfill({ contentType: 'text/html', body: '<!doctype html><html lang="es"><meta charset="utf-8"><title>Foco</title><div id="root"></div><script src="/fixture.js"></script></html>' });
  });
});

for (const strict of [false, true]) test('D7 · lo que se escribe justo después de Ctrl J llega al buscador de la paleta' + (strict ? ' (StrictMode)' : ''), async ({ page }) => {
  await goto(page, strict);
  await page.getByRole('button', { name: 'Abrir ventana', exact: true }).focus();
  await page.keyboard.press('Control+j');
  // Sin esperas: el buscador ya debe tener el foco en cuanto se pinta la paleta, no tras un temporizador.
  expect(await page.evaluate(() => document.activeElement?.getAttribute('role'))).toBe('combobox');
  await page.keyboard.type('csv');
  await expect(page.getByRole('combobox')).toHaveValue('csv');
  await page.keyboard.press('Enter');
  await expect(page.getByLabel('Ejecutada')).toHaveText('csv');
});

for (const strict of [false, true]) test('D7 · una ventana enfoca su primer control, encierra el Tab y devuelve el foco al cerrar con Escape' + (strict ? ' (StrictMode)' : ''), async ({ page }) => {
  await goto(page, strict);
  const opener = page.getByRole('button', { name: 'Abrir ventana', exact: true });
  await opener.click();
  const dialog = page.getByRole('dialog', { name: 'Ventana' });
  await expect(dialog.getByRole('button', { name: 'Cerrar' })).toBeFocused();
  await page.keyboard.press('Tab'); await expect(dialog.getByRole('button', { name: 'Primero' })).toBeFocused();
  await page.keyboard.press('Tab'); await expect(dialog.getByRole('button', { name: 'Último' })).toBeFocused();
  await page.keyboard.press('Tab'); await expect(dialog.getByRole('button', { name: 'Cerrar' })).toBeFocused();
  await page.keyboard.press('Shift+Tab'); await expect(dialog.getByRole('button', { name: 'Último' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(opener).toBeFocused();
});

for (const strict of [false, true]) test('D7 · una ventana no le quita el foco a un campo con autoFocus' + (strict ? ' (StrictMode)' : ''), async ({ page }) => {
  await goto(page, strict);
  await page.getByRole('button', { name: 'Abrir ventana con campo' }).click();
  const field = page.getByRole('dialog', { name: 'Con campo' }).getByLabel('Nombre');
  await expect(field).toBeFocused();
  await page.waitForTimeout(100);
  await expect(field).toBeFocused();
  await page.keyboard.type('Ana');
  await expect(field).toHaveValue('Ana');
  // El foco vuelve a quien abrió la ventana, no al campo que tenía el foco cuando corrieron los efectos.
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Abrir ventana con campo' })).toBeFocused();
});
