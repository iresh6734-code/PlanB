import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { EmptyState, InlineConfirm, PageHeader, Sheet, Skeleton, Tag } from '../src/ui/index.js';

// Piezas base de «Faro» (fase 0 del plan Faro 2): se comprueba la estructura accesible, no el aspecto.
test('Sheet: con título e id queda etiquetada por su encabezado', () => {
  const html = renderToStaticMarkup(createElement(Sheet, { title: 'Historial', id: 'hist', action: createElement('button', null, 'Actualizar') }, 'contenido'));
  assert.match(html, /<section class="ui-sheet" id="hist" aria-labelledby="hist-title">/);
  assert.match(html, /<h2 id="hist-title">Historial<\/h2>/);
  assert.match(html, /<div class="ui-sheet-action"><button>Actualizar<\/button><\/div>/);
});

test('Sheet: sin título no inventa cabecera ni etiqueta', () => {
  const html = renderToStaticMarkup(createElement(Sheet, { as: 'div', flush: true }, 'x'));
  assert.equal(html, '<div class="ui-sheet ui-sheet-flush">x</div>');
});

test('PageHeader: un único h1 y las acciones aparte', () => {
  const html = renderToStaticMarkup(createElement(PageHeader, { title: 'Clientes', subtitle: '24 clientes', actions: createElement('button', null, 'Nuevo') }));
  assert.equal((html.match(/<h1/g) ?? []).length, 1);
  assert.match(html, /<h1>Clientes<\/h1><p>24 clientes<\/p>/);
  assert.match(html, /<div class="ui-page-actions"><button>Nuevo<\/button><\/div>/);
});

test('Tag: el tono neutro no añade atributo y el texto siempre está', () => {
  assert.equal(renderToStaticMarkup(createElement(Tag, null, 'Más adelante')), '<span class="ui-tag">Más adelante</span>');
  assert.equal(renderToStaticMarkup(createElement(Tag, { tone: 'danger' }, 'Vencida')), '<span class="ui-tag" data-tone="danger">Vencida</span>');
});

test('EmptyState: título como encabezado, icono oculto a lectores de pantalla', () => {
  const html = renderToStaticMarkup(createElement(EmptyState, { title: 'Sin resultados', icon: createElement('svg') }, 'Prueba con otro nombre.'));
  assert.match(html, /<span class="ui-empty-icon" aria-hidden="true"><svg><\/svg><\/span><h3>Sin resultados<\/h3><p>Prueba con otro nombre\.<\/p>/);
});

test('Skeleton: marca la carga con aria-busy sin competir con el aviso de la App, y las barras son decorativas', () => {
  const html = renderToStaticMarkup(createElement(Skeleton, { rows: 3, label: 'Cargando registros…' }));
  assert.match(html, /^<div class="ui-skeleton" aria-busy="true"><span class="ui-sr">Cargando registros…<\/span>/);
  assert.equal((html.match(/class="ui-skeleton-row" aria-hidden="true"/g) ?? []).length, 3);
});

test('InlineConfirm: grupo etiquetado por la pregunta, la salida segura primero y con el foco; Escape la descarta', () => {
  const html = renderToStaticMarkup(createElement(InlineConfirm, { id: 'x', question: '¿Cerrar?', confirmLabel: 'Cerrar sin guardar', onConfirm: () => {}, onCancel: () => {} }));
  assert.match(html, /^<div class="ui-confirm" role="group" aria-labelledby="x-q"><p id="x-q">¿Cerrar\?<\/p>/);
  assert.match(html, /<button type="button" class="button" autofocus="">Seguir aquí<\/button><button type="button" class="button danger">Cerrar sin guardar<\/button>/);
  let cancelled = 0, stopped = 0;
  const element = InlineConfirm({ id: 'x', question: 'q', confirmLabel: 'c', onConfirm: () => {}, onCancel: () => { cancelled++; } });
  const press = (key: string) => element.props.onKeyDown({ key, stopPropagation: () => { stopped++; }, nativeEvent: { stopImmediatePropagation: () => {} } });
  press('Enter'); assert.equal(cancelled, 0);
  press('Escape'); assert.deepEqual([cancelled, stopped], [1, 1], 'no llega a la ventana que la contiene');
});
