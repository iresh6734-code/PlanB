import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ConflictValues } from '../src/app-shell/team-conflict.js';

test('un conflicto se lee campo a campo, con nombres y sin JSON, y marca lo que difiere', () => {
  const html = renderToStaticMarkup(createElement(ConflictValues, { local: { phone: '600 111 222', email: 'ana@example.com' }, remote: { phone: '600 999 000', email: 'ana@example.com' }, version: 4 }));
  assert.match(html, /<th scope="col">Versión remota 4<\/th>/);
  assert.match(html, /<tr data-differs="true"><th scope="row">Teléfono<\/th><td>600 111 222<\/td><td>600 999 000<span class="sr-only"> \(distinto\)<\/span><\/td><\/tr>/);
  assert.match(html, /<tr><th scope="row">Correo<\/th><td>ana@example.com<\/td><td>ana@example.com<\/td><\/tr>/);
  assert.equal(html.includes('{'), false, 'sin JSON');
});

test('valores ausentes, vacíos o sin nombre conocido se muestran con claridad', () => {
  const html = renderToStaticMarkup(createElement(ConflictValues, { local: { custom_field: '', phone: null }, remote: {}, version: 1 }));
  assert.match(html, /<th scope="row">custom_field<\/th><td>vacío<\/td><td>—/);
  assert.match(html, /<th scope="row">Teléfono<\/th><td>vacío<\/td><td>—/);
});
