import assert from 'node:assert/strict';
import test from 'node:test';
import { runCli, verifySources } from '../scripts/verifica-fuentes.js';
import { readHubspotForVerifica } from '../server/verifica/hubspot-reader.js';
import { sha256Hex } from '../shared/sha256.js';
import type { VerificaCapture } from '../shared/verifica/model.js';
import { FAKE_PORTAL, fakeHubspot } from './helpers/fake-hubspot.js';

const encode = new TextEncoder();
const json = (value: unknown) => encode.encode(JSON.stringify(value));
const fixture: VerificaCapture = {
  id: 'captura-ficticia', capturedAt: '2026-11-24T09:00:00.000Z', source: 'fixture', historyAvailable: true,
  owners: [], contacts: [], companies: [{ id: 'empresa-ficticia-84', name: 'Destinatario Ficticio S.L.', customer: true }],
  deals: [
    { id: 'historico-ficticio-82', name: 'Oportunidad Ficticia Histórica', companyId: null, ownerId: null, status: 'open', amount: 200,
      createdAt: '2026-09-01T10:00:00.000Z', closeDate: '2026-12-01', history: {
        amount: [{ at: '2026-09-01T10:00:00.000Z', value: 100 }, { at: '2026-09-12T10:00:00.000Z', value: 200 }],
        closeDate: [{ at: '2026-09-01T10:00:00.000Z', value: '2026-11-01' }, { at: '2026-09-12T10:00:00.000Z', value: '2026-12-01' }],
      } },
    { id: 'ganada-ficticia-96', name: 'Oportunidad Ficticia Ganada', companyId: 'empresa-ficticia-84', ownerId: null, status: 'won', amount: 1250,
      createdAt: '2026-08-01T10:00:00.000Z', closeDate: '2026-09-01', history: {
        amount: [{ at: '2026-08-01T10:00:00.000Z', value: 1250 }],
        closeDate: [{ at: '2026-09-01T10:00:00.000Z', value: '2026-09-01' }],
      } },
  ],
};
const header = 'Núm;Fecha expedición;Serie;Número;Contacto;NIF;Identificación;Base imponible;IVA;Total;Estado';
const row = '1;05/09/2026;F;F-FACTURA-PRUEBA-88;Destinatario Ficticio S.L.;B00000001;B00000002;1250,00;262,50;1512,50;Aprobada';
const csv = encode.encode(header + '\n' + row + '\n');
const expected = {
  portal: FAKE_PORTAL,
  hubspot: { counts: { owners: 0, companies: 1, contacts: 0, deals: 2 }, change: { dealId: 'historico-ficticio-82', amount: [100, 200], closeDate: ['2026-11-01', '2026-12-01'] } },
  holded: { invoices: 1, unreferenced: { invoiceNumber: 'F-FACTURA-PRUEBA-88', dealId: 'ganada-ficticia-96', netAmount: 1250 } },
};

async function captured() {
  return (await readHubspotForVerifica({ token: 'pat-ficticio-fase-b-solamente', accountId: FAKE_PORTAL, mode: 'test',
    fetcher: fakeHubspot(fixture).fetcher, now: () => new Date(fixture.capturedAt) })).capture;
}

test('fase B · compara el resultado del lector simulado y un Libro sintético sin publicar filas ni identificadores', async () => {
  const capture = json(await captured());
  const result = verifySources({ capture, invoices: csv, expected: json(expected) });
  assert.equal(result.comprobacionesSuperadas, true, JSON.stringify(result.comprobaciones));
  assert.equal(result.archivos.capture.sha256, sha256Hex(capture));
  assert.equal(result.archivos.invoices.sha256, sha256Hex(csv));
  assert.equal(result.hubspot.deals, 2);
  assert.equal(result.holded.facturas, 1);
  assert.doesNotMatch(JSON.stringify(result), /Fictici|F-FACTURA-PRUEBA-88|B0000000|historico-ficticio-82|ganada-ficticia-96/);
});

test('fase B · no acredita recuentos con duplicados ni cambios con historial incompleto o fuera de orden', async () => {
  const capture = await captured();
  const changed = capture.deals.find(deal => deal.id === expected.hubspot.change.dealId)!;
  const modified = { ...capture, companies: [capture.companies[0], capture.companies[0]], deals: capture.deals.map(deal => deal.id === changed.id
    ? { ...deal, history: { amount: changed.history!.amount.slice().reverse(), closeDate: changed.history!.closeDate.slice(0, 1) } }
    : { ...deal, history: null }) };
  const withCounts = { ...expected, portal: '99999', hubspot: { ...expected.hubspot, counts: { ...expected.hubspot.counts, companies: 2 } } };
  const { comprobaciones: checks, comprobacionesSuperadas } = verifySources({ capture: json(modified), invoices: csv, expected: json(withCounts) });
  assert.deepEqual([checks.portalCoincide, checks.recuentosHubSpotCoinciden, checks.historialCompleto, checks.cambioDeImporte, checks.cambioDeFechaDeCierre, comprobacionesSuperadas], Array(6).fill(false));
});

test('fase B · el control falla con una factura enlazada directamente o con un CSV que usa el importe bruto', async () => {
  const capture = json(await captured());
  const linked = verifySources({ capture, expected: json(expected), invoices: encode.encode(header + ';Referencia\n' + row + ';ganada-ficticia-96\n') });
  assert.equal(linked.comprobaciones.facturaSinReferenciaQuedaSinComprobar, false);
  assert.equal(linked.comprobacionesSuperadas, false);
  const gross = verifySources({ capture, expected: json(expected), invoices: encode.encode('Factura;Fecha;Cliente;IVA;Total\nF-FACTURA-PRUEBA-88;05/09/2026;Destinatario Ficticio S.L.;262,50;1512,50\n') });
  assert.equal(gross.comprobaciones.cabecerasDelLibro, false);
  assert.equal(gross.comprobaciones.baseEIvaSeparados, false);
});

test('fase B · el script devuelve 1 si difieren las cifras y 2 si los archivos son inválidos', async () => {
  const capture = json(await captured());
  const paths = ['--capture', 'captura.json', '--invoices', 'facturas.csv', '--expect', 'esperado.json'];
  const files = new Map([['captura.json', capture], ['facturas.csv', csv], ['esperado.json', json({ ...expected, holded: { ...expected.holded, invoices: 2 } })]]);
  let stdout = '', stderr = '';
  const io = { out: (s: string) => { stdout += s; }, err: (s: string) => { stderr += s; }, read: async (path: string) => files.get(path)! };
  assert.equal(await runCli(paths, io), 1);
  assert.equal(JSON.parse(stdout).comprobaciones.recuentoHoldedCoincide, false);
  assert.equal(stderr, '');
  files.set('esperado.json', encode.encode('{ "dato-privado-ficticio"'));
  assert.equal(await runCli(paths, io), 2);
  assert.doesNotMatch(stderr, /dato-privado-ficticio/);
  assert.equal(await runCli(['--credential', 'secreto-ficticio-oculto'], io), 2);
  assert.doesNotMatch(stderr, /secreto-ficticio-oculto/);
});
