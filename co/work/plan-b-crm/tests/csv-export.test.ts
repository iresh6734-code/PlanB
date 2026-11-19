import assert from 'node:assert/strict';
import test from 'node:test';
import { toCsv } from '../src/app-shell/csv.js';

// Exportar la vista de una tabla (fase 2 del plan Faro 2).
test('toCsv: BOM, separador «;», fin de línea CRLF y comillas solo donde hacen falta', () => {
  const text = toCsv(['Nombre', 'Notas'], [['Lucía Martín', 'dijo "sí"; llamar'], ['Pablo', 'línea 1\nlínea 2'], ['Ana', '']]);
  assert.ok(text.startsWith('﻿'));
  assert.equal(text.slice(1), 'Nombre;Notas\r\nLucía Martín;"dijo ""sí""; llamar"\r\nPablo;"línea 1\nlínea 2"\r\nAna;\r\n');
});

test('toCsv: neutraliza textos que una hoja de cálculo ejecutaría como fórmula', () => {
  const text = toCsv(['A'], [['=HYPERLINK("x")'], ['+34 600'], ['-5'], ['@SUM(A1)'], ['normal']]);
  assert.deepEqual(text.slice(1).trim().split('\r\n').slice(1), [`"'=HYPERLINK(""x"")"`, "'+34 600", "'-5", "'@SUM(A1)", 'normal']);
});
