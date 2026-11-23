import assert from 'node:assert/strict';
import { test } from 'node:test';
import { reconcileBilling } from '../shared/billing-check.js';

const parts = (rows: string[]) => ['referencia;concepto;importe_neto;aprobado;fuera_de_cuota', ...rows].join('\n');
const invoices = (rows: string[]) => ['factura;linea;referencia;importe_neto;estado', ...rows].join('\n');
const compressor = 'A-1;Compresor;1.240,00;sí;sí';

test('uses the exact reference and only issued lines, including grouped and partial invoices', () => {
  const input = parts([compressor, 'A-2;Válvula;220,30;si;Si', 'A-3;Filtro;80;no;sí', 'A-4;Revisión;95;sí;no']);
  const before = reconcileBilling(input, invoices([
    'F1;01;01;1240;emitida',
    'F2;01;A-1;1240;borrador',
    'F3;01;A-1;1240;anulada',
    'F4;01;A-1;600;emitida',
    'F4;02;A-2;220,30;emitida',
  ]));
  assert.deepEqual(before.cases.map(({ reference, status, invoicedCents }) => [reference, status, invoicedCents]), [
    ['A-1', 'partial', 60_000], ['A-2', 'verified', 22_030], ['A-3', 'excluded', 0], ['A-4', 'excluded', 0],
  ]);
  assert.equal(before.unmatchedInvoiceLines, 1);

  const after = reconcileBilling(input, invoices(['F4;01;A-1;600;emitida', 'F5;01;A-1;640;emitida', 'F4;02;A-2;220,30;emitida']));
  assert.equal(after.cases[0].status, 'verified');
  assert.deepEqual(after.cases[0].invoices, ['F4', 'F5']);
});

test('allows invoice headers with no rows and treats a blank or similar reference as unmatched', () => {
  const input = parts([compressor]);
  assert.equal(reconcileBilling(input, invoices([])).cases[0].status, 'missing');
  const result = reconcileBilling(input, invoices(['F1;1;;1240;emitida', 'F2;1;a-1;1240;emitida']));
  assert.equal(result.cases[0].status, 'missing');
  assert.equal(result.unmatchedInvoiceLines, 2);
});

test('does not verify duplicates, overbilling, unknown states or potential credits', () => {
  const input = parts([compressor]);
  const ordinary = 'F1;1;A-1;1240;emitida';
  for (const rows of [
    [ordinary, ordinary],
    [ordinary, 'F1;1;A-2;1240;emitida'],
    ['F1;1;A-1;1240;pendiente'],
    ['F1;1;A-1;1300;emitida'],
    [ordinary, 'F2;1;A-1;-1240;emitida'],
    [ordinary, 'F2;1;;-1240;emitida'],
  ]) {
    assert.equal(reconcileBilling(input, invoices(rows)).cases[0].status, 'review');
  }
  const duplicates = reconcileBilling(parts([compressor, 'A-1;Otro parte;30;sí;sí']), invoices([ordinary]));
  assert.equal(duplicates.cases.length, 1);
  assert.equal(duplicates.cases[0].status, 'review');
});

test('handles Excel CSV and validates strict shape, money and approvals', () => {
  const parsed = reconcileBilling('\ufeff' + parts(['A-1;"Cambio; pieza ""grande""\nIncluye mano de obra";12,34;sí;sí']), invoices([]));
  assert.equal(parsed.cases[0].concept, 'Cambio; pieza "grande"\nIncluye mano de obra');
  assert.equal(parsed.cases[0].expectedCents, 1234);

  assert.throws(() => reconcileBilling('', invoices([])), /faltan las columnas/);
  assert.throws(() => reconcileBilling(parts([]), invoices([])), /al menos un parte/);
  assert.throws(() => reconcileBilling(parts(['A-1;"Comillas;12,34;sí;sí']), invoices([])), /comillas/);
  assert.throws(() => reconcileBilling(parts(['A-1;Parte";12,34;sí;sí']), invoices([])), /comillas/);
  assert.throws(() => reconcileBilling(parts(['A-1;Compresor;123;sí']), invoices([])), /número incorrecto de columnas/);
  assert.throws(() => reconcileBilling(parts(['A-1;Compresor;123,456;sí;sí']), invoices([])), /importe inválido/);
  assert.throws(() => reconcileBilling(parts(['A-1;Compresor;123;quizá;sí']), invoices([])), /utiliza sí o no/);
  assert.throws(() => reconcileBilling(parts([compressor]), invoices(['F1;;A-1;1240;emitida'])), /número de factura y la línea/);
});
