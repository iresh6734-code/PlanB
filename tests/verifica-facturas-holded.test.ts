import assert from 'node:assert/strict';
import test from 'node:test';
import { importInvoices } from '../shared/verifica/invoices.js';

const companies = [
  { id: 'expedidor', name: 'Emisor Ficticio S.L.', customer: true, taxId: 'B00000001' },
  { id: 'cliente', name: 'Destinatario Ficticio S.L.', customer: true, taxId: 'B00000002' },
];

test('el Libro de Holded usa el número, la fecha de expedición y la identificación del destinatario', () => {
  const csv = 'Núm;Fecha expedición;Fecha operación;Serie;Número;Contacto;NIF*;Identificación;Base imponible;IVA;Total;Estado\n'
    + '1;14/09/2026;13/09/2026;F;F-042;Alias sin coincidencia;B00000001;B00000002;100,00;21,00;121,00;Aprobada\n'
    + '2;15/09/2026;15/09/2026;F;F-043;Alias sin coincidencia;B00000001;B00000002;500,00;105,00;605,00;Anulada\n';
  const result = importInvoices(csv, companies);
  assert.equal(result.format, 'holded-book');
  assert.equal(result.columns.taxId, 'Identificación');
  assert.equal(result.columns.vat, 'IVA');
  assert.equal(result.amountBasis, 'base');
  assert.deepEqual(result.invoices, [{ id: 'F-042', companyId: 'cliente', issuedAt: '2026-09-14T12:00:00.000Z', amount: 100, dealRef: null }]);
  assert.equal(result.excludedVoided, 1);
  assert.deepEqual(result.issues, [{ line: 3, reason: 'factura anulada' }]);
});

test('cuando falta la identificación del destinatario, el Libro solo cruza con su nombre', () => {
  const result = importInvoices('Núm;Fecha expedición;Serie;Número;Contacto;NIF;Base imponible;IVA\n'
    + '1;14/09/2026;F;F-042;Destinatario Ficticio S.L.;B00000001;100;21\n'
    + '2;14/09/2026;F;F-043;Cliente sin equivalencia;B00000001;200;42\n', companies);
  assert.equal(result.columns.taxId, undefined);
  assert.deepEqual(result.invoices.map(invoice => invoice.companyId), ['cliente', null]);
  assert.equal(result.unmatched, 1);
});

test('una exportación genérica conserva el cruce por NIF y el total como importe de respaldo', () => {
  const result = importInvoices('Factura;Fecha;Cliente;NIF;Total\nF-042;14/09/2026;Alias sin coincidencia;B00000002;121\n', companies);
  assert.equal(result.format, 'generic');
  assert.equal(result.columns.taxId, 'NIF');
  assert.equal(result.amountBasis, 'total');
  assert.equal(result.invoices[0]!.companyId, 'cliente');
  assert.equal(result.invoices[0]!.amount, 121);
});
