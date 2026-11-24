import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CleanRoomError, findLeaks, newSalt, runCleanRoom } from '../shared/verifica/clean-room.js';
import { custodyFingerprint } from '../shared/verifica/custody.js';
import { importInvoices, InvoiceImportError, type InvoiceImport } from '../shared/verifica/invoices.js';
import { parseCaptureText, parseDeclarationsText, VerificaInputError } from '../shared/verifica/inputs.js';
import type { VerificaCapture, VerificaDeclarations } from '../shared/verifica/model.js';
import { buildVerificaReport, reportToJson } from '../shared/verifica/report.js';
// Verifica · fase 2: sala limpia sin red. Toma dos capturas ya guardadas (de verifica-hubspot.ts u otro lector), las
// facturas y lo que declara el vendedor, y escribe tres archivos nuevos:
//   · el informe, que es lo único que sale hacia el comprador (la barrera lo para si lleva nombres, correos, NIF o IDs);
//   · la copia custodiada, cifrada, con todo lo necesario para reconstruir el informe, para el abogado o notario;
//   · la llave de esa copia, que se entrega aparte y nunca junto al informe.
// No abre conexiones, no imprime la llave y nunca sobrescribe un archivo.

const USAGE = 'Uso: npx tsx scripts/verifica-sala-limpia.ts --previous <captura-anterior.json> --latest <captura.json> [--invoices <facturas.csv>] [--declarations <declaraciones.json>] --report <informe.json> --custody <copia.json> --key-out <llave.txt> [--show-leaks]';

export interface CleanRoomArgs {
  previous: string; latest: string; invoices: string | null; declarations: string | null;
  report: string; custody: string; keyOut: string; showLeaks: boolean;
}
export class CliUsageError extends Error { constructor(message: string) { super(message); this.name = 'CliUsageError'; } }

export function parseArgs(argv: string[]): CleanRoomArgs {
  const args: CleanRoomArgs = { previous: '', latest: '', invoices: null, declarations: null, report: '', custody: '', keyOut: '', showLeaks: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i], next = () => { const v = argv[++i]; if (v === undefined || v.startsWith('--')) throw new CliUsageError('Falta el valor de ' + a + '.'); return v; };
    if (a === '--previous') args.previous = next();
    else if (a === '--latest') args.latest = next();
    else if (a === '--invoices') args.invoices = next();
    else if (a === '--declarations') args.declarations = next();
    else if (a === '--report') args.report = next();
    else if (a === '--custody') args.custody = next();
    else if (a === '--key-out') args.keyOut = next();
    else if (a === '--show-leaks') args.showLeaks = true;
    else throw new CliUsageError('Argumento no reconocido (posición ' + (i + 1) + '). ' + USAGE);
  }
  for (const [flag, value] of [['--previous', args.previous], ['--latest', args.latest], ['--report', args.report], ['--custody', args.custody], ['--key-out', args.keyOut]] as const) {
    if (!value) throw new CliUsageError('Falta ' + flag + '. ' + USAGE);
  }
  const outs = [args.report, args.custody, args.keyOut].map(p => resolve(p));
  if (new Set(outs).size !== outs.length) throw new CliUsageError('El informe, la copia y la llave van en tres archivos distintos.');
  return args;
}

// La validación vive en shared/verifica/inputs.ts, compartida con el servidor local (fase D); aquí solo se traduce su
// error al de uso del script, con el mismo texto.
const asUsage = <T>(read: () => T): T => {
  try { return read(); } catch (e) { if (e instanceof VerificaInputError) throw new CliUsageError(e.message); throw e; }
};
export function loadCapture(text: string, flag: string): VerificaCapture {
  return asUsage(() => parseCaptureText(text, flag));
}
export function loadDeclarations(text: string): VerificaDeclarations {
  return asUsage(() => parseDeclarationsText(text, '--declarations'));
}
export interface CleanRoomDeps {
  out: (text: string) => void; err: (text: string) => void;
  readText?: (path: string) => Promise<string>;
  /** Escribe un archivo nuevo; falla si ya existe. */
  writeNew?: (path: string, text: string) => Promise<void>;
}

/** 0 = informe, copia y llave escritos; 1 = la barrera paró el informe o no se pudo escribir; 2 = uso o entradas incorrectas. */
export async function runCli(argv: string[], deps: CleanRoomDeps): Promise<number> {
  const readText = deps.readText ?? (path => readFile(path, 'utf8'));
  const writeNew = deps.writeNew ?? ((path, text) => writeFile(path, text, { encoding: 'utf8', flag: 'wx' }));
  let args: CleanRoomArgs, previous: VerificaCapture, latest: VerificaCapture, declarations: VerificaDeclarations = {}, imported: InvoiceImport | null = null;
  try {
    args = parseArgs(argv);
    previous = loadCapture(await readText(args.previous), '--previous');
    latest = loadCapture(await readText(args.latest), '--latest');
    if (Date.parse(previous.capturedAt) >= Date.parse(latest.capturedAt)) throw new CliUsageError('--previous tiene que ser anterior a --latest.');
    if (args.declarations) declarations = loadDeclarations(await readText(args.declarations));
    if (args.invoices) imported = importInvoices(await readText(args.invoices), latest.companies);
  } catch (e) {
    deps.err((e instanceof CliUsageError ? e.message : e instanceof InvoiceImportError ? 'Facturas: ' + e.message : e instanceof SyntaxError ? 'Un archivo de entrada no es JSON válido.' : 'No se pudo leer un archivo de entrada.') + '\n');
    return 2;
  }

  const input = { asOf: latest.capturedAt, previous, latest, invoices: imported?.invoices ?? null, declarations };
  let result;
  try {
    result = await runCleanRoom(input);
  } catch (e) {
    if (!(e instanceof CleanRoomError)) { deps.err('La sala limpia terminó con un error inesperado; no se escribe nada.\n'); return 1; }
    deps.err(e.message + '\n');
    if (args.showLeaks) {
      // Solo en este equipo y solo si se pide: para ver qué nombre o ID ha parado el informe.
      const report = buildVerificaReport({ ...input, salt: newSalt() });
      for (const text of findLeaks(report, input)) deps.err('  encontrado: ' + text + '\n');
    } else deps.err('Vuelve a ejecutar con --show-leaks para ver aquí qué textos lo han parado. No se escribe nada.\n');
    return 1;
  }

  const { report, custody, key } = result;
  const written: string[] = [];
  for (const [path, text] of [[args.report, reportToJson(report)], [args.custody, JSON.stringify(custody) + '\n'], [args.keyOut, key + '\n']] as const) {
    try { await writeNew(path, text); written.push(path); }
    catch {
      deps.err('No se guarda ' + path + ': ya existe o no se puede escribir. Elige otro nombre; nunca se sobrescribe.' + (written.length ? ' Ya escritos: ' + written.join(', ') + '; bórralos antes de repetir, porque no casan con una nueva ejecución.' : '') + '\n');
      return 1;
    }
  }
  const lines = [
    '', 'Verifica · sala limpia · sin conexión',
    'Informe: ' + args.report + ' · huella ' + report.fingerprint,
    'Copia custodiada: ' + args.custody + ' · huella ' + custodyFingerprint(custody),
    'Llave de la copia: ' + args.keyOut + ' · entrégala aparte al custodio; nunca con el informe.',
  ];
  if (imported) lines.push('Facturas: ' + imported.invoices.length + ' leídas (' + (imported.amountBasis === 'base' ? 'base imponible' : 'TOTAL con IVA') + ') · ' + imported.unmatched + ' sin empresa · ' + imported.issues.length + ' líneas descartadas');
  lines.push('');
  for (const f of report.findings) lines.push('  ' + (f.alarm ? 'ALARMA ' : f.basis === 'unverified' ? 'sin comprobar ' : 'normal ') + '· ' + f.title);
  deps.out(lines.join('\n') + '\n');
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runCli(process.argv.slice(2), { out: t => { process.stdout.write(t); }, err: t => { process.stderr.write(t); } }).then(code => { process.exitCode = code; }, () => { process.stderr.write('Error inesperado; no se escribe nada más.\n'); process.exitCode = 1; });
}
