import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MIGRATION_EXPORT_FORMAT, MigrationInputError } from '../shared/migration-verifier.js';
import { CleanRoomError, newSalt } from '../shared/verifica/clean-room.js';
import { equivalenceToJson, OBJECT_LABEL, VERDICT_TEXT } from '../shared/verifica/equivalence.js';
import { buildEquivalence, captureToMigrationExport, EquivalenceInputError, equivalenceWorkList, findEquivalenceLeaks, releaseEquivalence, type EquivalenceInput, type EquivalenceOutput } from '../shared/verifica/migration.js';
import type { VerificaCapture } from '../shared/verifica/model.js';
import { parseWatchReport, WatchInputError, type WatchReport } from '../shared/verifica/watch.js';
import { CliUsageError, loadCapture } from './verifica-sala-limpia.js';
// Verifica · fase 4: migración verificada, sin red. Toma la captura del cierre (la última de la vigilancia), la exportación
// del CRM del comprador y el mapa de campos que confirma una persona, y escribe el informe de equivalencia: qué llegó
// igual, qué falta, qué llegó distinto, qué sobra y qué no se puede concluir. Pasa por la barrera de la sala limpia.
// Con --watch comprueba que la captura del cierre es la última del parte de vigilancia. Con --work-list escribe, aparte,
// la lista con los IDs reales para quien corrige la migración; esa lista no sale del equipo. Nunca sobrescribe un archivo.

const USAGE = 'Uso: npx tsx scripts/verifica-migracion.ts --closing <cierre.json> --target <destino.json> --map <mapa.json> --salt <sal.txt> --report <equivalencia.json> [--watch <parte.json>] [--work-list <lista.csv>] [--as-of <fecha ISO>] [--show-leaks]';

export interface MigrationArgs { closing: string; target: string; map: string; salt: string; report: string; watch: string | null; workList: string | null; asOf: string | null; showLeaks: boolean }

export function parseArgs(argv: string[]): MigrationArgs {
  const args: MigrationArgs = { closing: '', target: '', map: '', salt: '', report: '', watch: null, workList: null, asOf: null, showLeaks: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i], next = () => { const v = argv[++i]; if (v === undefined || v.startsWith('--')) throw new CliUsageError('Falta el valor de ' + a + '.'); return v; };
    if (a === '--closing') args.closing = next();
    else if (a === '--target') args.target = next();
    else if (a === '--map') args.map = next();
    else if (a === '--salt') args.salt = next();
    else if (a === '--report') args.report = next();
    else if (a === '--watch') args.watch = next();
    else if (a === '--work-list') args.workList = next();
    else if (a === '--as-of') { const v = next(); if (Number.isNaN(Date.parse(v))) throw new CliUsageError('--as-of no es una fecha válida.'); args.asOf = new Date(v).toISOString(); }
    else if (a === '--show-leaks') args.showLeaks = true;
    else throw new CliUsageError('Argumento no reconocido (posición ' + (i + 1) + '). ' + USAGE);
  }
  for (const [flag, value] of [['--closing', args.closing], ['--target', args.target], ['--map', args.map], ['--salt', args.salt], ['--report', args.report]] as const) if (!value) throw new CliUsageError('Falta ' + flag + '. ' + USAGE);
  const paths = [args.closing, args.target, args.map, args.salt, args.report, args.watch, args.workList].filter((p): p is string => p !== null).map(p => resolve(p));
  if (new Set(paths).size !== paths.length) throw new CliUsageError('Cada entrada y cada salida van en archivos distintos.');
  return args;
}

export interface MigrationDeps {
  out: (text: string) => void; err: (text: string) => void;
  readText?: (path: string) => Promise<string>;
  /** Escribe un archivo nuevo; falla si ya existe. */
  writeNew?: (path: string, text: string) => Promise<void>;
  now?: () => Date;
}

/** El destino puede ser una exportación del verificador o una captura de Verifica (de verifica-hubspot.ts u otro lector). */
function loadTarget(text: string): unknown {
  const value: unknown = JSON.parse(text);
  if (typeof value === 'object' && value !== null && (value as { format?: unknown }).format === MIGRATION_EXPORT_FORMAT) return value;
  return captureToMigrationExport(loadCapture(text, '--target'));
}

/** 0 = informe escrito; 1 = la barrera lo paró o no se pudo escribir; 2 = uso o entradas incorrectas. */
export async function runCli(argv: string[], deps: MigrationDeps): Promise<number> {
  const readText = deps.readText ?? (path => readFile(path, 'utf8'));
  const writeNew = deps.writeNew ?? ((path, text) => writeFile(path, text, { encoding: 'utf8', flag: 'wx' }));
  let args: MigrationArgs, closing: VerificaCapture, target: unknown, map: unknown, watch: WatchReport | null = null, salt: string, saltCreated = false;
  try {
    args = parseArgs(argv);
    closing = loadCapture(await readText(args.closing), '--closing');
    target = loadTarget(await readText(args.target));
    map = JSON.parse(await readText(args.map));
    if (args.watch) watch = parseWatchReport(JSON.parse(await readText(args.watch)));
    let saved: string | null = null;
    try { saved = (await readText(args.salt)).trim(); } catch { saved = null; }
    if (saved !== null && saved.length < 16) throw new CliUsageError('--salt: la sal guardada tiene menos de 16 caracteres.');
    if (saved === null && watch) throw new CliUsageError('--salt: con --watch hace falta la sal de la vigilancia, para que las referencias coincidan con las del parte.');
    salt = saved ?? newSalt();
    saltCreated = saved === null;
  } catch (e) {
    deps.err((e instanceof CliUsageError || e instanceof WatchInputError ? e.message : e instanceof SyntaxError ? 'Un archivo de entrada no es JSON válido.' : 'No se pudo leer un archivo de entrada.') + '\n');
    return 2;
  }

  const input: EquivalenceInput = { asOf: args.asOf ?? (deps.now?.() ?? new Date()).toISOString(), closing, target, map, salt, watch };
  let output: EquivalenceOutput;
  try {
    output = releaseEquivalence(input);
  } catch (e) {
    if (e instanceof MigrationInputError || e instanceof EquivalenceInputError) { deps.err(e.message + '\n'); return 2; }
    if (!(e instanceof CleanRoomError)) { deps.err('La comparación terminó con un error inesperado; no se escribe nada.\n'); return 1; }
    deps.err(e.message + '\n');
    if (args.showLeaks) for (const text of findEquivalenceLeaks(buildEquivalence(input).report, closing)) deps.err('  encontrado: ' + text + '\n');
    else deps.err('Vuelve a ejecutar con --show-leaks para ver aquí qué textos lo han parado. No se escribe nada.\n');
    return 1;
  }
  const { report, comparison } = output;

  if (saltCreated) {
    try { await writeNew(args.salt, salt + '\n'); }
    catch { deps.err('No se pudo guardar la sal en ' + args.salt + '; no se escribe el informe.\n'); return 1; }
  }
  try { await writeNew(args.report, equivalenceToJson(report)); }
  catch { deps.err('No se guarda ' + args.report + ': ya existe o no se puede escribir. Elige otro nombre; nunca se sobrescribe.\n'); return 1; }
  let workListWritten = false;
  if (args.workList) {
    try { await writeNew(args.workList, equivalenceWorkList(comparison)); workListWritten = true; }
    catch { deps.err('No se guarda ' + args.workList + ': ya existe o no se puede escribir. El informe sí se ha escrito.\n'); }
  }

  const lines = ['', 'Verifica · migración · sin conexión', 'Informe: ' + args.report + ' · huella ' + report.fingerprint];
  if (saltCreated) lines.push('Sal nueva en ' + args.salt + ': guárdala con la captura del cierre; nunca la envíes.');
  if (report.closing.watch) lines.push('La captura del cierre es la última del parte de vigilancia ' + report.closing.watch.slice(0, 12) + '.');
  lines.push('', '  ' + VERDICT_TEXT[report.verdict] + '.');
  for (const o of report.objects) lines.push('  ' + OBJECT_LABEL[o.object].padEnd(14) + ' · cierre ' + o.closing + ' · destino ' + o.target + ' · llegaron igual ' + o.intact);
  for (const f of report.findings) lines.push('      ' + (f.alarm ? 'DIFERENCIA' : 'SIN CONCLUIR') + ' · ' + f.summary);
  if (workListWritten) lines.push('', '  Lista de trabajo con los IDs reales en ' + args.workList + '. Es para quien corrige la migración; no la envíes con el informe.');
  deps.out(lines.join('\n') + '\n');
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runCli(process.argv.slice(2), { out: t => { process.stdout.write(t); }, err: t => { process.stderr.write(t); } }).then(code => { process.exitCode = code; }, () => { process.stderr.write('Error inesperado; no se escribe nada más.\n'); process.exitCode = 1; });
}
