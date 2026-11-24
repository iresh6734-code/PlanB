import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { z } from 'zod';
import { sha256Hex } from '../shared/sha256.js';
import { parseCaptureText } from '../shared/verifica/inputs.js';
import { importInvoices, InvoiceImportError } from '../shared/verifica/invoices.js';
import type { HistoryEntry } from '../shared/verifica/model.js';
import { wonWithoutInvoice } from '../shared/verifica/rules.js';

const USAGE = 'Uso: node --import tsx scripts/verifica-fuentes.ts --capture <captura.json> --invoices <holded.csv> --expect <esperado.json>';
const count = z.number().int().nonnegative();
const identifier = z.string().trim().min(1);
const expectations = z.object({
  portal: z.string().regex(/^\d{1,20}$/),
  hubspot: z.object({
    counts: z.object({ owners: count, companies: count, contacts: count, deals: count }).strict(),
    change: z.object({ dealId: identifier,
      amount: z.tuple([z.number(), z.number()]).refine(([before, after]) => before !== after),
      closeDate: z.tuple([z.iso.date(), z.iso.date()]).refine(([before, after]) => before !== after),
    }).strict(),
  }).strict(),
  holded: z.object({ invoices: count,
    unreferenced: z.object({ invoiceNumber: identifier, dealId: identifier, netAmount: z.number().positive() }).strict(),
  }).strict(),
}).strict();

function containsChange(history: HistoryEntry[], [before, after]: [string | number, string | number], observedAt: number): boolean {
  return history.some((entry, index) => {
    const previous = history[index - 1];
    return previous?.value === before && entry.value === after
      && Date.parse(previous.at) < Date.parse(entry.at) && Date.parse(entry.at) <= observedAt;
  });
}

const describe = (bytes: Uint8Array) => ({ sha256: sha256Hex(bytes), bytes: bytes.byteLength });

export function verifySources(files: { capture: Uint8Array; invoices: Uint8Array; expected: Uint8Array }) {
  const utf8 = new TextDecoder('utf-8', { fatal: true });
  const expected = expectations.parse(JSON.parse(utf8.decode(files.expected)));
  const capture = parseCaptureText(utf8.decode(files.capture), 'La captura');
  const imported = importInvoices(utf8.decode(files.invoices), capture.companies);
  const hashes = { capture: describe(files.capture), invoices: describe(files.invoices), expected: describe(files.expected) };
  const entities = ['owners', 'companies', 'contacts', 'deals'] as const;
  const counts = { owners: capture.owners.length, companies: capture.companies.length, contacts: capture.contacts.length, deals: capture.deals.length };
  const history = capture.deals.find(deal => deal.id === expected.hubspot.change.dealId)?.history;
  const observedAt = Date.parse(capture.capturedAt);
  const invoice = imported.invoices.find(row => row.id === expected.holded.unreferenced.invoiceNumber);
  const won = capture.deals.find(deal => deal.id === expected.holded.unreferenced.dealId);
  const sample = invoice && won && won.status === 'won' && invoice.dealRef === null
    ? wonWithoutInvoice({ asOf: capture.capturedAt, previous: null, latest: { ...capture, deals: [won] },
      invoices: [invoice], declarations: {}, pseudonym: () => 'OP-ENSAYO',
      fingerprints: { previous: null, latest: hashes.capture.sha256, invoices: hashes.invoices.sha256 } })
    : null;
  const rejectedRows = imported.issues.length - imported.excludedVoided;
  const checks = {
    portalCoincide: capture.source === 'hubspot' && capture.id === `hubspot-${expected.portal}-${capture.capturedAt}`,
    recuentosHubSpotCoinciden: entities.every(entity => counts[entity] === expected.hubspot.counts[entity]
      && new Set(capture[entity].map(item => item.id)).size === counts[entity]),
    historialCompleto: capture.historyAvailable && capture.deals.every(deal => Array.isArray(deal.history?.amount) && Array.isArray(deal.history?.closeDate)),
    cambioDeImporte: !!history && containsChange(history.amount, expected.hubspot.change.amount, observedAt),
    cambioDeFechaDeCierre: !!history && containsChange(history.closeDate, expected.hubspot.change.closeDate, observedAt),
    cabecerasDelLibro: imported.format === 'holded-book',
    baseEIvaSeparados: imported.amountBasis === 'base' && !!imported.columns.vat && invoice?.amount === expected.holded.unreferenced.netAmount,
    recuentoHoldedCoincide: imported.invoices.length === expected.holded.invoices && rejectedRows === 0,
    facturaSinReferenciaQuedaSinComprobar: sample?.finding.figures.ambiguousCount === 1
      && sample.finding.figures.missingCount === 0 && sample.notVerified.length === 1,
  };
  return {
    format: 'planb-verifica-fuentes-v1',
    comprobacionesSuperadas: Object.values(checks).every(Boolean),
    comprobaciones: checks,
    archivos: hashes,
    hubspot: counts,
    holded: { facturas: imported.invoices.length, descartesInesperados: rejectedRows, anuladasExcluidas: imported.excludedVoided,
      facturasSinEmpresa: imported.unmatched, columnaEstadoDetectada: !!imported.columns.status },
  };
}

export async function runCli(argv: string[], io: { out: (text: string) => void; err: (text: string) => void; read?: (path: string) => Promise<Uint8Array> }): Promise<number> {
  let paths: { capture: string; invoices: string; expect: string };
  try {
    const { values } = parseArgs({ args: argv, options: { capture: { type: 'string' }, invoices: { type: 'string' }, expect: { type: 'string' } } });
    if (!values.capture || !values.invoices || !values.expect) throw new Error('faltan archivos');
    paths = { capture: values.capture, invoices: values.invoices, expect: values.expect };
  } catch { io.err(USAGE + '\n'); return 2; }
  try {
    const read = io.read ?? (path => readFile(path));
    const [capture, invoices, expected] = await Promise.all([read(paths.capture), read(paths.invoices), read(paths.expect)]);
    const result = verifySources({ capture, invoices, expected });
    io.out(JSON.stringify(result, null, 2) + '\n');
    return result.comprobacionesSuperadas ? 0 : 1;
  } catch (error) {
    io.err((error instanceof InvoiceImportError ? error.message : 'Revisa la captura, el CSV en UTF-8 y el archivo de expectativas.') + '\n');
    return 2;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  void runCli(process.argv.slice(2), { out: text => process.stdout.write(text), err: text => process.stderr.write(text) })
    .then(status => { process.exitCode = status; });
}
