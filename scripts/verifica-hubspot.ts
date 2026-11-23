import { randomBytes } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readHubspotForVerifica } from '../server/verifica/hubspot-reader.js';
import { sha256Hex } from '../shared/sha256.js';
import { VerificaReadError } from '../shared/verifica/hubspot.js';
import { importInvoices, InvoiceImportError, type InvoiceImport } from '../shared/verifica/invoices.js';
import type { VerificaCapture } from '../shared/verifica/model.js';
import { CleanRoomError, releaseReport } from '../shared/verifica/clean-room.js';
import { reportToJson } from '../shared/verifica/report.js';
import { buildReadRecord, checkReadAuthorization, madridDay, parseReadAuthorization, ReadAuthorizationError, type ReadAuthorization } from '../shared/verifica/read-authorization.js';
// Verifica · lectura COMPLETA de un portal de HubSpot con historial. Solo lectura (GET y búsquedas de recuento). Dos modos:
//   · pruebas (--authorized-full-read, fase 1): solo cuentas DEVELOPER_TEST o SANDBOX, para validar el lector. Con
//     --previous (una captura anterior de este script) y opcionalmente --invoices, además escribe el informe.
//   · cliente (--client-authorization, fase 5): solo una cuenta STANDARD, y solo con una autorización vigente para ese
//     portal cuya huella coincide con el documento firmado. Sin ella no hace ni una petición. Deja un acta de la lectura
//     con la huella de la captura. El informe de un cliente sale por la sala limpia (scripts/verifica-sala-limpia.ts).
// Nunca en un equipo de la empresa. La credencial se recibe por la entrada estándar y no se imprime. No sobrescribe archivos.
// Las pruebas (tests/verifica-lectores.test.ts) usan un HubSpot simulado.

const USAGE = 'Uso: <credencial por entrada estándar> | npx tsx scripts/verifica-hubspot.ts --portal <ID> --out <captura.json> [--tax-property <propiedad>] [--customer-stages customer,evangelist] y además, '
  + 'para un portal de pruebas: --authorized-full-read [--previous <captura-anterior.json>] [--invoices <facturas.csv>] [--report <informe.json>]; '
  + 'para el portal de un cliente: --client-authorization <autorizacion.json> --authorization-document <documento-firmado> --record <acta.json>. '
  + 'Para revisar la autorización antes del día de la lectura, sin credencial ni red: npx tsx scripts/verifica-hubspot.ts --check-only --portal <ID> --client-authorization <autorizacion.json> --authorization-document <documento-firmado>';

export interface CliArgs {
  mode: 'test' | 'client';
  /** Solo comprueba la autorización contra el documento y la fecha: no lee la credencial, no hace peticiones y no escribe nada. */
  checkOnly: boolean;
  portal: string; out: string; previous: string | null; invoices: string | null; report: string | null;
  taxProperty: string | null; customerStages: string[] | null;
  authorization: string | null; authorizationDocument: string | null; record: string | null;
}
export class CliUsageError extends Error { constructor(message: string) { super(message); this.name = 'CliUsageError'; } }

export function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = { mode: 'test', checkOnly: false, portal: '', out: '', previous: null, invoices: null, report: null, taxProperty: null, customerStages: null, authorization: null, authorizationDocument: null, record: null };
  let authorized = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i], next = () => { const v = argv[++i]; if (v === undefined || v.startsWith('--')) throw new CliUsageError('Falta el valor de ' + a + '.'); return v; };
    if (a === '--portal') args.portal = next();
    else if (a === '--authorized-full-read') authorized = true;
    else if (a === '--check-only') args.checkOnly = true;
    else if (a === '--out') args.out = next();
    else if (a === '--previous') args.previous = next();
    else if (a === '--invoices') args.invoices = next();
    else if (a === '--report') args.report = next();
    else if (a === '--tax-property') args.taxProperty = next();
    else if (a === '--customer-stages') args.customerStages = next().split(',').map(s => s.trim()).filter(Boolean);
    else if (a === '--client-authorization') args.authorization = next();
    else if (a === '--authorization-document') args.authorizationDocument = next();
    else if (a === '--record') args.record = next();
    else throw new CliUsageError('Argumento no reconocido (posición ' + (i + 1) + '). La credencial no se pasa como argumento: va por la entrada estándar. ' + USAGE);
  }
  if (!/^\d{1,20}$/.test(args.portal)) throw new CliUsageError('Indica --portal con el ID numérico del portal. ' + USAGE);
  if (args.checkOnly && args.authorization === null) throw new CliUsageError('--check-only revisa una autorización de cliente: indica --client-authorization y --authorization-document.');
  if (!args.out && !args.checkOnly) throw new CliUsageError('Indica --out con el archivo donde guardar la captura. ' + USAGE);
  if (args.authorization !== null) {
    if (authorized) throw new CliUsageError('Elige un modo: --authorized-full-read es para portales de pruebas y --client-authorization para el portal de un cliente.');
    if (!args.authorizationDocument) throw new CliUsageError('El modo cliente necesita --authorization-document: el documento firmado cuya huella está en la autorización.');
    if (!args.record && !args.checkOnly) throw new CliUsageError('El modo cliente necesita --record: el archivo donde guardar el acta de la lectura.');
    if (args.record && args.out && resolve(args.record) === resolve(args.out)) throw new CliUsageError('La captura y el acta van en dos archivos distintos.');
    if (args.previous || args.invoices || args.report) throw new CliUsageError('En modo cliente el informe no se escribe aquí: sale por la sala limpia (scripts/verifica-sala-limpia.ts), con copia custodiada y llave aparte.');
    args.mode = 'client';
    return args;
  }
  if (args.authorizationDocument || args.record) throw new CliUsageError('--authorization-document y --record solo valen con --client-authorization.');
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
  readBytes?: (path: string) => Promise<Uint8Array>;
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
  const readBytes = deps.readBytes ?? (path => readFile(path));
  const now = () => deps.now?.() ?? new Date();
  let args: CliArgs, token: string, previous: VerificaCapture | null = null, invoiceText: string | null = null, authorization: ReadAuthorization | null = null;
  try {
    args = parseArgs(argv);
    if (args.previous) previous = loadCapture(await readText(args.previous));
    if (args.invoices) invoiceText = await readText(args.invoices);
    if (args.mode === 'client') {
      authorization = parseReadAuthorization(JSON.parse(await readText(args.authorization!)));
      const today = madridDay(now());
      checkReadAuthorization(authorization, { portalId: args.portal, today, documentSha256: sha256Hex(await readBytes(args.authorizationDocument!)) });
      if (args.checkOnly) {
        const daysLeft = Math.round((Date.parse(authorization.validUntil + 'T00:00:00Z') - Date.parse(today + 'T00:00:00Z')) / 86_400_000);
        deps.out(['Autorización válida para leer el portal ' + authorization.portalId + ' hoy (' + today + ').',
          'Encargo ' + authorization.engagement + ' · autoriza ' + authorization.authorizedBy.name + ' (' + authorization.authorizedBy.role + ', ' + authorization.authorizedBy.company + ') · firmada el ' + authorization.signedOn + '.',
          'Vale hasta el ' + authorization.validUntil + ' incluido: ' + (daysLeft === 0 ? 'hoy es el último día.' : daysLeft === 1 ? 'queda 1 día más.' : 'quedan ' + daysLeft + ' días más.') + (daysLeft < 7 ? ' Si la lectura no cabe en ese plazo, pide la renovación ya.' : ''),
          'El documento firmado coincide con la huella. No se ha leído ninguna credencial, no se ha hecho ninguna petición y no se ha escrito nada.', ''].join('\n'));
        return 0;
      }
    }
    token = await readSecret(deps.stdin);
  } catch (e) {
    deps.err((e instanceof CliUsageError ? e.message : e instanceof ReadAuthorizationError ? 'Autorización (' + e.code + '): ' + e.message + ' No se ha hecho ninguna petición.' : e instanceof SyntaxError ? 'Un archivo de entrada no es JSON válido.' : 'No se pudo leer un archivo de entrada.') + '\n');
    return 2;
  }

  // El acta cuenta lo que pasó por el transporte, no lo que el lector dice que hizo.
  const requestsByMethod: Record<string, number> = {}, endpoints = new Set<string>();
  const fetcher = ((input: string | URL | Request, init?: RequestInit) => {
    const method = (init?.method ?? 'GET').toUpperCase();
    requestsByMethod[method] = (requestsByMethod[method] ?? 0) + 1;
    endpoints.add(method + ' ' + new URL(input instanceof Request ? input.url : String(input)).pathname);
    return deps.fetch(input, init);
  }) as typeof fetch;
  const startedAt = now().toISOString();
  let reading;
  try {
    reading = await readHubspotForVerifica({
      token, accountId: args.portal, mode: args.mode === 'client' ? 'production_readonly' : 'test', fetcher, now: deps.now,
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
  const captureText = JSON.stringify(capture, null, 2) + '\n';
  if (!await save(args.out, captureText)) return 1;
  const changed = capture.deals.filter(d => d.history && (d.history.amount.length > 1 || d.history.closeDate.length > 1)).length;
  const lines = [
    '', 'Verifica · lectura del portal ' + (args.mode === 'client' ? 'del cliente ' : 'de pruebas ') + reading.account.portalId + ' (' + reading.account.accountType + ') · solo lectura',
    'Comerciales ' + capture.owners.length + ' · empresas ' + capture.companies.length + ' · contactos ' + capture.contacts.length + ' · oportunidades ' + capture.deals.length,
    capture.historyAvailable
      ? 'Historial: SÍ llegó en todas las oportunidades (' + changed + ' con algún cambio de importe o de fecha de cierre).'
      : 'Historial: NO llegó en todas las oportunidades. Las reglas de ventana y aplazamientos quedarán «sin comprobar».',
    'Peticiones: ' + reading.requests + ' · captura guardada en ' + args.out,
  ];

  if (authorization && args.record) {
    const record = buildReadRecord({
      portalId: reading.account.portalId, accountType: reading.account.accountType, engagement: authorization.engagement, authorizedBy: authorization.authorizedBy,
      signedOn: authorization.signedOn, validUntil: authorization.validUntil, signedDocumentSha256: authorization.signedDocumentSha256,
      startedAt, finishedAt: now().toISOString(), requestsByMethod, endpoints,
      counts: { owners: capture.owners.length, companies: capture.companies.length, contacts: capture.contacts.length, deals: capture.deals.length },
      historyAvailable: capture.historyAvailable, captureId: capture.id, captureText,
    });
    if (!await save(args.record, JSON.stringify(record, null, 2) + '\n')) {
      deps.err('La captura se guardó sin acta: no la uses para el cliente. Vuelve a leer con otros nombres de archivo.\n');
      return 1;
    }
    lines.push('Acta guardada en ' + args.record + ' · huella ' + record.fingerprint.slice(0, 16) + '… · encargo ' + authorization.engagement + ', autoriza ' + authorization.authorizedBy.name + ' hasta el ' + authorization.validUntil,
      'El informe sale por la sala limpia: scripts/verifica-sala-limpia.ts, con copia custodiada y llave aparte.');
  }

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
