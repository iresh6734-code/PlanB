import test from 'node:test';
import assert from 'node:assert/strict';
import { foldText, textMatches } from '../shared/text-match.js';

test('plegado: sin tildes, ñ como n, minúsculas y espacios juntos', () => {
  assert.equal(foldText('  Núñez  PÉREZ\tÁlvaro '), 'nunez perez alvaro');
  assert.equal(foldText('Pingüino'), 'pinguino');
});

test('búsqueda tolerante: tildes, mayúsculas y orden de palabras no importan', () => {
  assert.ok(textMatches('Llamar para seguimiento · Núñez', 'nunez'));
  assert.ok(textMatches('Revisar los detalles · José', 'JOSE'));
  assert.ok(textMatches('Revisar los detalles · Ana', 'ana revisar'), 'en cualquier orden');
  assert.ok(textMatches('Tarea task-61', 'task-61'), 'los identificadores siguen funcionando');
  assert.ok(textMatches('Cualquier cosa', '   '), 'consulta vacía no filtra');
  assert.ok(!textMatches('Revisar los detalles · Ana', 'ana marcos'), 'todas las palabras deben estar');
  assert.ok(!textMatches('Núñez', 'nuñezz'));
});
