import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_TEMPLATES, fillTemplate, MAX_TEMPLATES, parseTemplates, serializeTemplates, upsertTemplate } from '../src/app-shell/templates.js';

test('rellena los huecos con los datos de la ficha y deja visibles los que no tienen valor', () => {
  const result = fillTemplate('Hola {Nombre}, sobre {empresa} ({etapa}) y {empresa}. Tel: {telefono}', { nombre: 'Ana', empresa: 'Acme', telefono: '  ' });
  assert.equal(result.text, 'Hola Ana, sobre Acme ({etapa}) y Acme. Tel: {telefono}');
  assert.deepEqual(result.missing, ['etapa', 'telefono']);
});

test('lee lo guardado con límites, sin duplicados y con ejemplos si no hay nada o está dañado', () => {
  assert.deepEqual(parseTemplates(null).map(t => t.id), DEFAULT_TEMPLATES.map(t => t.id));
  assert.deepEqual(parseTemplates('{roto').map(t => t.id), DEFAULT_TEMPLATES.map(t => t.id));
  assert.deepEqual(parseTemplates('[]'), [], 'si el usuario lo borró todo, se respeta');
  const stored = parseTemplates(JSON.stringify([{ id: 'a', name: ' A ', body: 'x\r\ny' }, { id: 'a', name: 'dup', body: 'z' }, { id: 'b', name: '', body: 'sin nombre' }, 7]));
  assert.deepEqual(stored, [{ id: 'a', name: 'A', body: 'x\ny' }]);
  const many = Array.from({ length: 20 }, (_, i) => ({ id: 'id' + i, name: 'n' + i, body: 'b' }));
  assert.equal(parseTemplates(JSON.stringify(many)).length, MAX_TEMPLATES);
  assert.deepEqual(parseTemplates(serializeTemplates(stored)), stored);
});

test('crear y editar validan nombre, texto y el máximo de plantillas', () => {
  const base = [{ id: 'a', name: 'A', body: 'x' }];
  assert.match(upsertTemplate(base, { name: ' ', body: 'x' }, () => 'n').error ?? '', /nombre/);
  assert.match(upsertTemplate(base, { name: 'B', body: '  ' }, () => 'n').error ?? '', /vacía/);
  assert.deepEqual(upsertTemplate(base, { id: 'a', name: 'A2', body: 'y' }, () => 'n').list, [{ id: 'a', name: 'A2', body: 'y' }]);
  const added = upsertTemplate(base, { name: 'B', body: 'z' }, () => 'n');
  assert.equal(added.id, 'n');
  assert.equal(added.list.length, 2);
  const full = Array.from({ length: MAX_TEMPLATES }, (_, i) => ({ id: 'id' + i, name: 'n', body: 'b' }));
  assert.match(upsertTemplate(full, { name: 'C', body: 'c' }, () => 'n').error ?? '', /Caben/);
});
