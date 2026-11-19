// CLAUDE-DOCS-G2-G4 · G3: límite de tamaño de los informes del tablón.
//
//   node tools/coordination/report-size.mjs                    lista los informes y revisiones que superan el límite
//   node tools/coordination/report-size.mjs --task ID --check  antes de `submit`: comprueba los .md de ese encargo
//   node tools/coordination/report-size.mjs RUTA... [--limit 30] [--check] [--json]
//
// Solo lee. No modifica board.json ni los informes, y no sustituye la revisión de Codex. Independiente de board.mjs y core.mjs.
// Un informe largo debe resumir en su cuerpo y mover tablas, registros o capturas a anexos (p. ej. coordination/reports/anexos/).
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const DEFAULT_LIMIT_KB = 30;
export const SCANNED = ['coordination/reports', 'coordination/reviews'];

/** Tamaño en bytes de cada .md bajo las carpetas indicadas (sin recursión: los anexos en subcarpetas no cuentan). */
export function scan(root, folders = SCANNED) {
  return folders.flatMap(folder => {
    const dir = join(root, folder);
    if (!existsSync(dir)) return [];
    return readdirSync(dir).filter(name => name.endsWith('.md')).map(name => join(dir, name))
      .filter(path => statSync(path).isFile()).map(path => ({ file: relative(root, path).split(sep).join('/'), bytes: statSync(path).size }));
  });
}

/** Archivos .md de coordinación declarados por un encargo del tablón. */
export function taskReports(root, id) {
  const board = JSON.parse(readFileSync(join(root, 'coordination', 'board.json'), 'utf8'));
  const task = board.tasks.find(item => item.id === id);
  if (!task) throw new Error('No existe el encargo ' + id);
  return (task.files ?? []).filter(file => file.startsWith('coordination/') && file.endsWith('.md'));
}

/** Tamaño de cada ruta indicada. Solo cuenta un archivo regular: una carpeta (aunque se llame `algo.md`) no es un informe (R2, 445). */
export function measureFiles(root, files) {
  return files.map(file => {
    const path = resolve(root, file), name = relative(root, path).split(sep).join('/');
    if (!existsSync(path)) return { file: name, bytes: null, problem: 'no existe' };
    const stat = statSync(path);
    return stat.isFile() ? { file: name, bytes: stat.size } : { file: name, bytes: null, problem: 'no es un archivo' };
  });
}

/** Separa lo que supera el límite. Lo que no existe o no es un archivo no se da por bueno. */
export function evaluate(entries, limitKb = DEFAULT_LIMIT_KB) {
  if (typeof limitKb !== 'number' || !Number.isFinite(limitKb) || !(limitKb > 0)) throw new RangeError('El límite debe ser un número finito y positivo de KB');
  const limit = Math.round(limitKb * 1024);
  const over = entries.filter(entry => entry.bytes !== null && entry.bytes > limit).sort((a, b) => b.bytes - a.bytes);
  const missing = entries.filter(entry => entry.bytes === null);
  return { limitBytes: limit, checked: entries.length, over, missing, ok: over.length === 0 && missing.length === 0 };
}

const TASK_ID = /^[A-Z0-9]+(?:-[A-Z0-9]+)*$/;

function options(argv) {
  const files = [], result = { limit: DEFAULT_LIMIT_KB, check: false, json: false, task: null, files };
  // Una opción que necesita valor no puede quedarse sin él ni tomar la opción siguiente como valor (R2, 445).
  const value = (index, option) => {
    const next = argv[index];
    if (next === undefined || next.startsWith('--')) throw new Error('Falta el valor de ' + option);
    return next;
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--limit') {
      const text = value(++i, '--limit');
      if (!/^\d+(\.\d+)?$/.test(text)) throw new RangeError('El límite debe ser un número finito y positivo de KB');
      result.limit = Number(text);
    }
    else if (arg === '--task') {
      const id = value(++i, '--task');
      if (!TASK_ID.test(id)) throw new Error('ID de encargo no válido: ' + id);
      result.task = id;
    }
    else if (arg === '--check') result.check = true;
    else if (arg === '--json') result.json = true;
    else if (arg.startsWith('--')) throw new Error('Opción desconocida: ' + arg);
    else files.push(arg);
  }
  return result;
}

export function run(argv, root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')) {
  const opts = options(argv);
  const entries = opts.task ? measureFiles(root, taskReports(root, opts.task)) : opts.files.length ? measureFiles(root, opts.files) : scan(root);
  const result = evaluate(entries, opts.limit);
  const lines = [];
  if (opts.json) lines.push(JSON.stringify(result, null, 2));
  else {
    lines.push('Informes del tablón: ' + result.checked + ' revisados, límite ' + opts.limit + ' KB.');
    for (const entry of result.over) lines.push('  ' + (entry.bytes / 1024).toFixed(1).padStart(8) + ' KB  ' + entry.file);
    for (const entry of result.missing) lines.push('  ' + (entry.problem ?? 'no existe') + ': ' + entry.file);
    lines.push(result.ok ? 'Todo dentro del límite.' : 'Resume el cuerpo y pasa tablas, registros o capturas a un anexo.');
  }
  return { result, output: lines.join('\n'), exitCode: opts.check && !result.ok ? 1 : 0 };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const { output, exitCode } = run(process.argv.slice(2));
    console.log(output);
    process.exitCode = exitCode;
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 2;
  }
}
