// Plan B Verifica · fase B: el Libro de facturas emitidas tal como lo exporta Holded (Analítica > Informes > Libro de
// facturas emitidas > Excel, guardado como CSV UTF-8), comprobado el 24/11/2026 con una exportación real de una cuenta de
// prueba. La cabecera y las filas de título y pie son las reales; los datos son los de la factura ficticia de la prueba.
import test from 'node:test';
import assert from 'node:assert/strict';
import { importInvoices } from '../shared/verifica/invoices.js';

const HEADER = 'Num;Ejercicio;Periodo;Código;Tipo;Grupo o Epígrafe del IAE;Fecha de expedición;Fecha operación;Tipo;Serie;Número;Estado;Cuenta;Contacto;Clave de operación;Tipo;Código país;Identificación;Código postal;País;Forma de pago;Base imponible;IVA;Retención;Rec. de eq.;Total;Pagado';
const book = (...lines: string[]) => [
  'Verifica', 'Verifica - Listado de ventas 01/01/2026-31/12/2026', '01/01/2026  -  31/12/2026', '',
  HEADER, ...lines, '', 'Informe creado automáticamente con Holded - 24/11/2026 15:03',
].join('\r\n') + '\r\n';
const companies = [{ id: '457060588743', name: '[FICTICIO] Nube de Ensayo', customer: false }, { id: '456788705502', name: '[FICTICIO] Faro de Ensayo', customer: false }];

test('Verifica · el Libro real de Holded: salta el título y el pie, lee «Fecha de expedición» y numera con la serie', () => {
  const r = importInvoices(book(
    '1;2026;4T;;;;24/11/2026;24/11/2026;F1;F26;0001;;43000001;[FICTICIO] Nube de Ensayo;;;ES;00000000T;;España;;1250,00;262,50;0;0;1512,50;0',
    '2;2026;4T;;;;25/11/2026;25/11/2026;F1;R26;0001;;43000002;[FICTICIO] Faro de Ensayo;;;ES;00000000T;;España;;300,00;63,00;0;0;363,00;0',
  ), companies);
  assert.equal(r.format, 'holded-book');
  assert.equal(r.columns.date, 'Fecha de expedición');
  assert.equal(r.columns.base, 'Base imponible');
  assert.equal(r.amountBasis, 'base');
  assert.deepEqual(r.issues, [], 'ni el título ni el pie cuentan como errores');
  assert.deepEqual(r.invoices, [
    { id: 'F26-0001', companyId: '457060588743', amount: 1250, issuedAt: '2026-11-24T12:00:00.000Z', dealRef: null },
    { id: 'R26-0001', companyId: '456788705502', amount: 300, issuedAt: '2026-11-25T12:00:00.000Z', dealRef: null },
  ], 'dos series con el mismo número no chocan');
});

test('Verifica · el Libro real de Holded: una factura anulada se excluye y su línea se cuenta desde el principio del archivo', () => {
  const r = importInvoices(book(
    '1;2026;4T;;;;24/11/2026;24/11/2026;F1;F26;0001;Anulada;43000001;[FICTICIO] Nube de Ensayo;;;ES;00000000T;;España;;1250,00;262,50;0;0;1512,50;0',
    '2;2026;4T;;;;24/11/2026;24/11/2026;F1;F26;0002;;43000001;[FICTICIO] Nube de Ensayo;;;ES;00000000T;;España;;100,00;21,00;0;0;121,00;0',
  ), companies);
  assert.equal(r.excludedVoided, 1);
  assert.deepEqual(r.issues, [{ line: 6, reason: 'factura anulada' }]);
  assert.deepEqual(r.invoices.map(i => i.id), ['F26-0002']);
});

test('Verifica · el Libro real de Holded guardado con comas: el separador sale de la cabecera, no del título', () => {
  const text = ['Verifica', 'Verifica - Listado de ventas 01/01/2026-31/12/2026', '', HEADER.replace(/;/g, ','),
    '1,2026,4T,,,,24/11/2026,24/11/2026,F1,F26,0001,,43000001,[FICTICIO] Nube de Ensayo,,,ES,00000000T,,España,,"1250,00","262,50",0,0,"1512,50",0'].join('\n') + '\n';
  const r = importInvoices(text, companies);
  assert.equal(r.format, 'holded-book');
  assert.deepEqual(r.invoices.map(i => [i.id, i.amount, i.companyId]), [['F26-0001', 1250, '457060588743']]);
});

test('Verifica · ganadas sin factura: una ganada reciente que ya tiene factura posible no sale como «aún sin facturar»', async () => {
  const { wonWithoutInvoice } = await import('../shared/verifica/rules.js');
  const deal = (id: string, closeDate: string) => ({ id, name: 'x', companyId: 'c1', ownerId: 'o1', status: 'won' as const, amount: 1250, createdAt: '2026-10-01T00:00:00Z', closeDate, history: { amount: [], closeDate: [] } });
  const latest = { id: 'cap', source: 'hubspot' as const, capturedAt: '2026-11-24T14:00:00Z', historyAvailable: true, owners: [], companies: [{ id: 'c1', name: 'Cliente', customer: true }], contacts: [], deals: [deal('d1', '2026-11-24'), deal('d2', '2026-11-20')] };
  const invoices = [{ id: 'F26-0001', companyId: 'c1', amount: 1250, issuedAt: '2026-11-24T12:00:00.000Z', dealRef: null }];
  const r = wonWithoutInvoice({ asOf: latest.capturedAt, previous: null, latest, invoices, declarations: {}, pseudonym: (_k: string, id: string) => 'OP-' + id, fingerprints: { previous: null, latest: 'a', invoices: 'b' } } as never);
  assert.equal(r.finding.figures.ambiguousCount, 1, 'la que tiene factura cuenta como posible, sin comprobar');
  assert.equal(r.finding.figures.recentCount, 1, 'la otra, reciente y sin factura, sí está aún sin facturar');
  assert.equal(r.finding.figures.missingCount, 0);
  assert.equal(r.notVerified.length, 1);
});
