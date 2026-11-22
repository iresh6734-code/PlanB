import { randomBytes } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readHubspotForVerifica } from '../server/verifica/hubspot-reader.js';
import { VerificaReadError } from '../shared/verifica/hubspot.js';
import { importInvoices, InvoiceImportError, type InvoiceImport } from '../shared/verifica/invoices.js';
import type { VerificaCapture } from '../shared/verifica/model.js';
import { CleanRoomError, releaseReport } from '../shared/verifica/clean-room.js';
import { reportToJson } from '../shared/verifica/report.js';
// Verifica · fase 1: lectura COMPLETA de un portal de PRUEBAS de HubSpot con historial, para validar el lector antes de
// prometer nada a un cliente. Solo lectura (GET y búsquedas de recuento), solo cuentas DEVELOPER_TEST o SANDBOX.
// Solo en el ordenador personal: nunca en un equipo de la empresa ni contra una cuenta real.
// La credencial se recibe por la entrada estándar y no se imprime. No sobrescribe archivos.
// Con --previous (una captura anterior de este mismo script) y opcionalmente --invoices (CSV de facturas emitidas),
// además escribe el informe de Verifica. Las pruebas (tests/verifica-lectores.test.ts) usan un HubSpot simulado.

const USAGE = 'Uso: <credencial por entrada estándar> | npx tsx scripts/verifica-hubspot.ts --portal <ID del portal de pruebas> --authorized-full-read --out <captura.json> [--previous <captura-anterior.json>] [--invoices <facturas.csv>] [--report <informe.json>] [--tax-property <propiedad>] [--customer-stages customer,evangelist]';

export interface CliArgs {
  portal: string; out: string; previous: string | null; invoices: string | null; report: string | null;
  taxProperty: string | null; customerStages: string[] | null;
}
export class CliUsageError extends Error { constructor(message: string) { super(message); this.name = 'CliUsageError'; } }

export function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = { portal: '', out: '', previous: null, invoices: null, report: null, taxProperty: null, customerStages: null };
  let authorized = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i], next = () => { const v = argv[++i]; if (v === undefined || v.startsWith('--')) throw new CliUsageError('Falta el valor de ' + a + '.'); return v; };
    if (a === '--portal') args.portal = next();
    else if (a === '--authorized-full-read') authorized = true;
    else if (a === '--out') args.out = next();
    else if (a === '--previous') args.previous = next();
    else if (a === '--invoices') args.invoices = next();
    else if (a === '--report') args.report = next();
    else if (a === '--tax-property') args.taxProperty = next();
    else if (a === '--customer-stages') args.customerStages = next().split(',').map(s => s.trim()).filter(Boolean);
    else throw new CliUsageError('Argumento no reconocido (posición ' + (i + 1) + '). La credencial no se pasa como argumento: va por la entrada estándar. ' + USAGE);
  }
  if (!/^\d{1,20}$/.test(args.portal)) throw new CliUsageError('Indica --portal con el ID numérico del portal de pruebas. ' + USAGE);
  if (!args.out) throw new CliUsageError('Indica --out con el archivo donde guardar la captura. ' + USAGE);
  if (args.report && !args.previous) throw new CliUsageError('El informe necesita --previous: una captura anterior del mismo portal.');
  if (!authorized) throw new CliUsageError('No se hace ninguna lectura sin --authorized-full-read: confirma que autorizas leer el portal de pruebas entero (oportunidades con historial, empresas, contactos y comerciales), solo con GET y búsquedas de recuento.');
  return args;
}

export interface Readable { isTTY?: boolean; [Symbol.asyncIterator](): AsyncIterator<Buffer | string> }
export async function readSecret(stdin: Readable): Promise<string> {
  if (stdin.isTTY) throw new CliUsageError('La credencial se recibe por una tubería, no escribiéndola aquí (se vería en pantalla).');
  const chunks: Buffer[] = []; let total = 0;
  for await (const c of stdin) { const b = Buffer.isBuffer(c) ? c : Buffer.from(c); total += b.length; if (total > 4096) throw new CliUsageError('La entrada estándar es demasiado larga para ser una credencial.'); chunks.push(b); }
  const text = Buffer.concat(chunks).toString('utf8').replace(/[\r\n]+$/, '');
  if (text.length < 10 || /[\s\u0000-\u001f]/.test(text)) throw new CliUsageError('La entrada estándar no contiene una credencial con forma válida (una sola línea, sin espacios).');
  return text;
}

export interface CliDeps {
  stdin: Readable; out: (text: string) => void; err: (text: string) => void; fetch: typeof fetch; now?: () => Date;
  readText?: (path: string) => Promise<string>;
  /** Escribe un archivo nuevo; falla si ya existe. */
  writeNew?: (path: string, text: string) => Promise<void>;
}

function loadCapture(text: string): VerificaCapture {
  const value = JSON.parse(text) as Partial<VerificaCapture>;
  if (value?.source !== 'hubspot' || typeof value.capturedAt !== 'string' || typeof value.historyAvailable !== 'boolean' || ![value.owners, value.companies, value.contacts, value.deals].every(Array.isArray)) throw new CliUsageError('--previous no es una captura de este script.');
  return value as VerificaCapture;
}

/** 0 = lectura completa (y el historial llegó); 1 = la lectura falló o llegó sin historial; 2 = uso incorrecto (ninguna petición). */
export async function runCli(argv: string[], deps: CliDeps): Promise<number> {
  const readText = deps.readText ?? (path => readFile(path, 'utf8'));
  const writeNew = deps.writeNew ?? ((path, text) => writeFile(path, text, { encoding: 'utf8', flag: 'wx' }));
  let args: CliArgs, token: string, previous: VerificaCapture | null = null, invoiceText: string | null = null;
  try {
    args = parseArgs(argv);
    if (args.previous) previous = loadCapture(await readText(args.previous));
    if (args.invoices) invoiceText = await readText(args.invoices);
    token = await readSecret(deps.stdin);
  } catch (e) {
    deps.err((e instanceof CliUsageError ? e.message : e instanceof SyntaxError ? 'Un archivo de entrada no es JSON válido.' : 'No se pudo leer un archivo de entrada.') + '\n');
    return 2;
  }

  let reading;
  try {
    reading = await readHubspotForVerifica({
      token, accountId: args.portal, mode: 'test', fetcher: deps.fetch, now: deps.now,
      taxIdProperty: args.taxProperty, ...(args.customerStages ? { customerStages: args.customerStages } : {}),
      progress: message => deps.out('  leído · ' + message + '\n'),
    });
  } catch (e) {
    deps.err((e instanceof VerificaReadError ? 'Lectura detenida (' + e.code + '): ' + e.message : 'La lectura terminó con un error inesperado; no se imprime el detalle por si contuviera datos de la petición.') + '\n');
    return 1;
  }
  const { capture } = reading;
  const save = async (path: string, text: string) => {
    try { await writeNew(path, text); return true; }
    catch { deps.err('No se guarda ' + path + ': ya existe o no se puede escribir. Elige otro nombre; nunca se sobrescribe.\n'); return false; }
  };
  if (!await save(args.out, JSON.stringify(capture, null, 2) + '\n')) return 1;
  const changed = capture.deals.filter(d => d.history && (d.history.amount.length > 1 || d.history.closeDate.length > 1)).length;
  const lines = [
    '', 'Verifica · lectura del portal de pruebas ' + reading.account.portalId + ' (' + reading.account.accountType + ') · solo lectura',
    'Comerciales ' + capture.owners.length + ' · empresas ' + capture.companies.length + ' · contactos ' + capture.contacts.length + ' · oportunidades ' + capture.deals.length,
    capture.historyAvailable
      ? 'Historial: SÍ llegó en todas las oportunidades (' + changed + ' con algún cambio de importe o de fecha de cierre).'
      : 'Historial: NO llegó en todas las oportunidades. Las reglas de ventana y aplazamientos quedarán «sin comprobar».',
    'Peticiones: ' + reading.requests + ' · captura guardada en ' + args.out,
  ];

  if (args.report && previous) {
    let imported: InvoiceImport | null = null;
    if (invoiceText !== null) {
      try { imported = importInvoices(invoiceText, capture.companies); }
      catch (e) { deps.err((e instanceof InvoiceImportError ? 'Facturas: ' + e.message : 'Facturas: no se pudo leer el archivo.') + '\n'); return 1; }
      lines.push('Facturas: ' + imported.invoices.length + ' leídas (' + (imported.amountBasis === 'base' ? 'base imponible' : 'TOTAL con IVA') + ') · ' + imported.unmatched + ' sin empresa · ' + imported.issues.length + ' líneas descartadas',
        '  columnas: ' + Object.entries(imported.columns).map(([k, v]) => k + '=«' + v + '»').join(', '), ...imported.warnings.map(w => '  aviso: ' + w));
    }
    // Sal nueva en cada informe: en un portal de pruebas no hace falta poder repetir los seudónimos.
    // Pasa por la misma barrera que la sala limpia; para la copia custodiada, usa scripts/verifica-sala-limpia.ts.
    let report;
    try { report = releaseReport({ asOf: capture.capturedAt, previous, latest: capture, invoices: imported?.invoices ?? null, declarations: {}, salt: randomBytes(32).toString('hex') }); }
    catch (e) {
      deps.out(lines.join('\n') + '\n');
      deps.err((e instanceof CleanRoomError ? e.message : 'El informe no se pudo generar.') + ' La captura sí se guardó; scripts/verifica-sala-limpia.ts --show-leaks dice qué lo ha parado.\n');
      return 1;
    }
    if (!await save(args.report, reportToJson(report))) return 1;
    lines.push('', 'Informe guardado en ' + args.report + ' · huella ' + report.fingerprint.slice(0, 16) + '…');
    for (const f of report.findings) lines.push('  ' + (f.alarm ? 'ALARMA ' : f.basis === 'unverified' ? 'sin comprobar ' : 'normal ') + '· ' + f.title);
  }
  deps.out(lines.join('\n') + '\n');
  return capture.historyAvailable ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runCli(process.argv.slice(2), { stdin: process.stdin, out: t => { process.stdout.write(t); }, err: t => { process.stderr.write(t); }, fetch }).then(code => { process.exitCode = code; }, () => { process.stderr.write('Error inesperado; no se imprime el detalle por si contuviera datos de la petición.\n'); process.exitCode = 1; });
}
