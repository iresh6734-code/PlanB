import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CleanRoomError, newSalt } from '../shared/verifica/clean-room.js';
import type { VerificaCapture } from '../shared/verifica/model.js';
import { buildWatchReport, findWatchLeaks, releaseWatchReport, WatchInputError, watchReportToJson, watchSchedule, type WatchReport } from '../shared/verifica/watch.js';
import { CliUsageError, loadCapture } from './verifica-sala-limpia.js';
// Verifica · fase 3: vigilancia sin red. Toma la captura de la firma y las semanales ya guardadas (de verifica-hubspot.ts
// u otro lector) y escribe el parte de vigilancia: qué cambió cada semana, qué capturas quedan retenidas y, al cierre,
// qué se perdió desde la firma. Pasa por la misma barrera que el informe de la sala limpia.
// La sal de los seudónimos vive en un archivo del vendedor: la primera vez se crea, después se reutiliza para que las
// referencias de un parte a otro sean las mismas. No abre conexiones y nunca sobrescribe un archivo.

const USAGE = 'Uso: npx tsx scripts/verifica-vigilancia.ts --signing <firma.json> --capture <semana.json> [--capture ...] --salt <sal.txt> --report <parte.json> [--accept <huella>] [--as-of <fecha ISO>] [--show-leaks]';

export interface WatchArgs { signing: string; captures: string[]; salt: string; report: string; accept: string[]; asOf: string | null; showLeaks: boolean }

export function parseArgs(argv: string[]): WatchArgs {
  const args: WatchArgs = { signing: '', captures: [], salt: '', report: '', accept: [], asOf: null, showLeaks: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i], next = () => { const v = argv[++i]; if (v === undefined || v.startsWith('--')) throw new CliUsageError('Falta el valor de ' + a + '.'); return v; };
    if (a === '--signing') args.signing = next();
    else if (a === '--capture') args.captures.push(next());
    else if (a === '--salt') args.salt = next();
    else if (a === '--report') args.report = next();
    else if (a === '--accept') { const v = next(); if (!/^[0-9a-f]{64}$/.test(v)) throw new CliUsageError('--accept espera la huella de una captura (64 caracteres hexadecimales).'); args.accept.push(v); }
    else if (a === '--as-of') { const v = next(); if (Number.isNaN(Date.parse(v))) throw new CliUsageError('--as-of no es una fecha válida.'); args.asOf = new Date(v).toISOString(); }
    else if (a === '--show-leaks') args.showLeaks = true;
    else throw new CliUsageError('Argumento no reconocido (posición ' + (i + 1) + '). ' + USAGE);
  }
  for (const [flag, value] of [['--signing', args.signing], ['--salt', args.salt], ['--report', args.report]] as const) if (!value) throw new CliUsageError('Falta ' + flag + '. ' + USAGE);
  const paths = [args.signing, ...args.captures, args.salt, args.report].map(p => resolve(p));
  if (new Set(paths).size !== paths.length) throw new CliUsageError('Cada captura, la sal y el parte van en archivos distintos.');
  return args;
}

export interface WatchDeps {
  out: (text: string) => void; err: (text: string) => void;
  readText?: (path: string) => Promise<string>;
  /** Escribe un archivo nuevo; falla si ya existe. */
  writeNew?: (path: string, text: string) => Promise<void>;
  now?: () => Date;
}

const STATUS = { signing: 'firma    ', accepted: 'aceptada ', retained: 'RETENIDA ' } as const;

/** 0 = parte escrito; 1 = la barrera lo paró o no se pudo escribir; 2 = uso o entradas incorrectas. */
export async function runCli(argv: string[], deps: WatchDeps): Promise<number> {
  const readText = deps.readText ?? (path => readFile(path, 'utf8'));
  const writeNew = deps.writeNew ?? ((path, text) => writeFile(path, text, { encoding: 'utf8', flag: 'wx' }));
  let args: WatchArgs, signing: VerificaCapture, captures: VerificaCapture[], salt: string, saltCreated = false;
  try {
    args = parseArgs(argv);
    signing = loadCapture(await readText(args.signing), '--signing');
    captures = [];
    for (const path of args.captures) captures.push(loadCapture(await readText(path), '--capture ' + path));
    let saved: string | null = null;
    try { saved = (await readText(args.salt)).trim(); } catch { saved = null; }
    if (saved !== null && saved.length < 16) throw new CliUsageError('--salt: la sal guardada tiene menos de 16 caracteres.');
    salt = saved ?? newSalt();
    saltCreated = saved === null;
  } catch (e) {
    deps.err((e instanceof CliUsageError ? e.message : e instanceof SyntaxError ? 'Un archivo de entrada no es JSON válido.' : 'No se pudo leer un archivo de entrada.') + '\n');
    return 2;
  }

  const input = { signing, captures, salt, asOf: args.asOf ?? (deps.now?.() ?? new Date()).toISOString(), accepted: args.accept };
  let report: WatchReport;
  try {
    report = releaseWatchReport(input);
  } catch (e) {
    if (e instanceof WatchInputError) { deps.err(e.message + (args.asOf ? '' : ' Usa --as-of si las capturas son de otra fecha.') + '\n'); return 2; }
    if (!(e instanceof CleanRoomError)) { deps.err('La vigilancia terminó con un error inesperado; no se escribe nada.\n'); return 1; }
    deps.err(e.message + '\n');
    if (args.showLeaks) for (const text of findWatchLeaks(buildWatchReport(input), input)) deps.err('  encontrado: ' + text + '\n');
    else deps.err('Vuelve a ejecutar con --show-leaks para ver aquí qué textos lo han parado. No se escribe nada.\n');
    return 1;
  }

  if (saltCreated) {
    try { await writeNew(args.salt, salt + '\n'); }
    catch { deps.err('No se pudo guardar la sal en ' + args.salt + '; no se escribe el parte.\n'); return 1; }
  }
  try { await writeNew(args.report, watchReportToJson(report)); }
  catch { deps.err('No se guarda ' + args.report + ': ya existe o no se puede escribir. Elige otro nombre; nunca se sobrescribe.\n'); return 1; }

  const unknown = args.accept.filter(fp => !report.entries.some(e => e.fingerprint === fp));
  const schedule = watchSchedule(report.entries.at(-1)!.at, report.asOf);
  const lines = ['', 'Verifica · vigilancia · sin conexión', 'Parte: ' + args.report + ' · huella ' + report.fingerprint];
  if (saltCreated) lines.push('Sal nueva en ' + args.salt + ': guárdala con las capturas y úsala en todos los partes de esta operación; nunca la envíes.');
  lines.push('');
  for (const e of report.entries) {
    lines.push('  ' + e.at.slice(0, 10) + ' · ' + STATUS[e.status] + '· ' + e.fingerprint.slice(0, 12) + (e.shrink ? ' · encoge: ' + e.shrink : ''));
    for (const a of e.alerts) lines.push('      AVISO · ' + a.title + ': ' + a.summary);
  }
  if (report.overdue) lines.push('', '  AVISO · ' + report.overdue.summary);
  else lines.push('', '  Próxima captura: ' + schedule.nextDue.slice(0, 10) + '.');
  lines.push('', '  Desde la firma: ' + (report.closing.alerts.length ? report.closing.alerts.map(a => a.title.toLowerCase()).join('; ') : 'nada que avisar') + '.');
  if (report.entries.some(e => e.status === 'retained')) lines.push('  Una captura retenida no sirve de base hasta que las partes la revisen; para aceptarla, repite con --accept <su huella completa>.');
  if (unknown.length) lines.push('  --accept: ' + unknown.length + (unknown.length === 1 ? ' huella no corresponde' : ' huellas no corresponden') + ' a ninguna captura de este parte.');
  deps.out(lines.join('\n') + '\n');
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runCli(process.argv.slice(2), { out: t => { process.stdout.write(t); }, err: t => { process.stderr.write(t); } }).then(code => { process.exitCode = code; }, () => { process.stderr.write('Error inesperado; no se escribe nada más.\n'); process.exitCode = 1; });
}
