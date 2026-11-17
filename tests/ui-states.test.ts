// CLAUDE-UI-STATES-D3 · Error con qué hacer y límite de error de los apartados diferidos.
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ErrorState, PageErrorBoundary } from '../src/ui/index.js';

test('ErrorState se anuncia como alerta, explica y ofrece la acción solo si la hay', () => {
  const html = renderToStaticMarkup(createElement(ErrorState, { title: 'No se pudo', onAction: () => {} }, 'Tus datos siguen aquí.'));
  assert.match(html, /^<div class="ui-error" role="alert"><h3>No se pudo<\/h3><p>Tus datos siguen aquí\.<\/p><button type="button" class="button secondary">Reintentar<\/button><\/div>$/);
  assert.doesNotMatch(renderToStaticMarkup(createElement(ErrorState, { title: 'Solo aviso' })), /<button/);
  assert.match(renderToStaticMarkup(createElement(ErrorState, { title: 't', actionLabel: 'Recargar la página', onAction: () => {} })), />Recargar la página</);
});

test('PageErrorBoundary deja pasar su contenido y, tras un error, enseña el aviso del apartado', () => {
  assert.deepEqual(PageErrorBoundary.getDerivedStateFromError(), { failed: true });
  const ok = new PageErrorBoundary({ label: 'Cambios', children: 'contenido' });
  assert.equal(ok.render(), 'contenido');
  const failed = new PageErrorBoundary({ label: 'Cambios' }); failed.state = { failed: true };
  const html = renderToStaticMarkup(failed.render() as never);
  assert.match(html, /role="alert"/); assert.match(html, /No se pudo abrir Cambios/); assert.match(html, /Recargar la página/);
  let retried = 0;
  const custom = new PageErrorBoundary({ label: 'Radar', onRetry: () => { retried++; } }); custom.state = { failed: true };
  assert.match(renderToStaticMarkup(custom.render() as never), />Reintentar</);
});

test('todos los apartados diferidos pasan por el límite de error y la lista de registros ofrece reintentar', () => {
  const lazyPages = fs.readFileSync('src/app-shell/lazy-pages.tsx', 'utf8');
  assert.match(lazyPages, /<PageErrorBoundary label=\{name\}><Suspense/);
  assert.ok(!/^export const \w+ = lazy\(/m.test(lazyPages), 'ningún apartado usa lazy sin el envoltorio');
  const records = fs.readFileSync('src/app-shell/RecordsPage.tsx', 'utf8');
  assert.match(records, /<ErrorState title="No se pudieron cargar los registros" onAction=\{onRetry\}>/);
  assert.match(fs.readFileSync('src/App.tsx', 'utf8'), /onRetry=\{\(\) => setDataRevision\(r => r \+ 1\)\}/);
});
