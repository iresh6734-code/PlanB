import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { DENSITY_KEY, storedDensity } from '../src/app-shell/theme.js';
import { EmptyArt, EmptyState } from '../src/ui/index.js';

const read = (file: string) => readFileSync(new URL('../src/' + file, import.meta.url), 'utf8');

test('K4 · densidad: solo «comfortable» activa la cómoda; cualquier otro valor o sin almacenamiento queda en compacta', () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const store = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: (key: string) => store.get(key) ?? null } });
  try {
    assert.equal(storedDensity(), 'compact');
    store.set(DENSITY_KEY, 'comfortable');
    assert.equal(storedDensity(), 'comfortable');
    store.set(DENSITY_KEY, 'enorme');
    assert.equal(storedDensity(), 'compact');
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { throw new Error('bloqueado'); } });
    assert.equal(storedDensity(), 'compact');
  } finally {
    if (previous) Object.defineProperty(globalThis, 'localStorage', previous); else delete (globalThis as { localStorage?: unknown }).localStorage;
  }
});

test('K4 · la densidad cómoda sube las filas a 40 px solo en escritorio', () => {
  const css = read('cuaderno.css');
  assert.match(css, /@media \(min-width: 601px\) \{ html\[data-density="comfortable"\] \{[^}]*--row-h: 40px/);
});

test('K2 · tachado y sello animados, y quietos con movimiento reducido', () => {
  const css = read('cuaderno.css');
  assert.match(css, /@keyframes k2-strike/);
  assert.match(css, /@keyframes k2-stamp/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{ html body \.gx-focus-card\[data-done\] h3::after, html body \.ct-seal-mark \.seal-badge \{ animation: none; \} \}/);
});

test('K3 · EmptyArt es trazo en currentColor, decorativo y sin colores propios', () => {
  for (const kind of ['blank', 'search'] as const) {
    const svg = renderToStaticMarkup(createElement(EmptyArt, { kind }));
    assert.match(svg, /^<svg class="ui-empty-art" data-kind="/);
    assert.match(svg, /fill="none" stroke="currentColor"/);
    assert.match(svg, /aria-hidden="true"/);
    assert.doesNotMatch(svg, /#[0-9a-f]{3,8}\b|rgb\(/i);
  }
  const html = renderToStaticMarkup(createElement(EmptyState, { title: 'Sin resultados', icon: createElement(EmptyArt, { kind: 'search' }) }, 'Prueba con otro nombre.'));
  assert.match(html, /<span class="ui-empty-icon" aria-hidden="true"><svg class="ui-empty-art" data-kind="search"[^]*<\/svg><\/span><h3>Sin resultados<\/h3>/);
});

test('K5 · impresión común: hoja global antes de las capas de tokens, sin menú ni barras y con cabecera de copia', () => {
  const css = read('print.css');
  assert.match(css, /@media print \{/);
  assert.match(css, /\.sidebar, \.gx-topbar/);
  assert.match(css, /body\[data-print-stamp\]::before \{ content: attr\(data-print-stamp\)/);
  assert.match(css, /counter\(page\)/);
  const main = read('main.tsx');
  assert.ok(main.indexOf("import './print.css';") > -1 && main.indexOf("import './print.css';") < main.indexOf("import './planb-ui.css';"));
  assert.match(main, /addEventListener\('beforeprint'[^]*setAttribute\('data-print-stamp'/);
});
