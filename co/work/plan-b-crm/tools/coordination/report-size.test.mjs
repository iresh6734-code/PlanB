// CLAUDE-DOCS-G2-G4 · G3: pruebas de la comprobación de tamaño de informes. Carpetas temporales propias; no toca el tablón real.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DEFAULT_LIMIT_KB, evaluate, run, scan, taskReports } from './report-size.mjs';

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'planb-report-size-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, 'coordination', 'reports', 'anexos'), { recursive: true });
  mkdirSync(join(root, 'coordination', 'reviews'), { recursive: true });
  const write = (file, bytes) => writeFileSync(join(root, file), 'x'.repeat(bytes));
  write('coordination/reports/PEQUENO.md', 1000);
  write('coordination/reports/JUSTO.md', 30 * 1024);
  write('coordination/reports/GRANDE.md', 30 * 1024 + 1);
  write('coordination/reports/datos.json', 500 * 1024);
  write('coordination/reports/anexos/ANEXO.md', 400 * 1024);
  write('coordination/reviews/REVISION-ENORME.md', 90 * 1024);
  writeFileSync(join(root, 'coordination', 'board.json'), JSON.stringify({ tasks: [
    { id: 'T-1', files: ['coordination/reports/GRANDE.md', 'src/x.ts', 'coordination/reports/FALTA.md'] },
    { id: 'T-2', files: ['coordination/reports/PEQUENO.md'] }
  ] }));
  return root;
}

test('el límite por defecto es 30 KB y el borde exacto no cuenta como exceso', t => {
  const root = fixture(t);
  assert.equal(DEFAULT_LIMIT_KB, 30);
  const result = evaluate(scan(root));
  assert.deepEqual(result.over.map(entry => entry.file), ['coordination/reviews/REVISION-ENORME.md', 'coordination/reports/GRANDE.md']);
  assert.equal(result.checked, 4, 'solo .md de primer nivel: ni JSON ni anexos');
  assert.equal(result.ok, false);
});

test('--task comprueba solo los .md de coordinación del encargo y no da por bueno un informe que falta', t => {
  const root = fixture(t);
  assert.deepEqual(taskReports(root, 'T-1'), ['coordination/reports/GRANDE.md', 'coordination/reports/FALTA.md']);
  const failing = run(['--task', 'T-1', '--check'], root);
  assert.equal(failing.exitCode, 1);
  assert.deepEqual(failing.result.missing.map(entry => entry.file), ['coordination/reports/FALTA.md']);
  assert.equal(run(['--task', 'T-2', '--check'], root).exitCode, 0);
  assert.throws(() => run(['--task', 'NO-EXISTE'], root), /No existe el encargo/);
});

test('R2 (revisión 445): un límite no finito se rechaza y nunca aprueba', t => {
  const root = fixture(t);
  for (const limit of ['Infinity', '-Infinity', 'NaN', '1e999', '-5', '0', '30abc', ''])
    assert.throws(() => run(['--limit', limit, '--check'], root), RangeError, 'límite ' + JSON.stringify(limit));
  assert.throws(() => evaluate([], Infinity), RangeError);
  assert.throws(() => evaluate([], Number.NaN), RangeError);
  assert.equal(run(['--limit', '29.5', '--check'], root).exitCode, 1);
});

test('R2 (revisión 445): una carpeta con nombre de informe no cuenta como informe', t => {
  const root = fixture(t);
  mkdirSync(join(root, 'coordination', 'reports', 'directory.md'));
  const result = run(['coordination/reports/directory.md', '--check', '--json'], root);
  assert.equal(result.exitCode, 1);
  assert.deepEqual(JSON.parse(result.output).missing, [{ file: 'coordination/reports/directory.md', bytes: null, problem: 'no es un archivo' }]);
  assert.match(run(['coordination/reports/directory.md'], root).output, /no es un archivo: coordination\/reports\/directory\.md/);
  // En el análisis general la carpeta tampoco se cuenta.
  assert.ok(!scan(root).some(entry => entry.file.endsWith('directory.md')));
});

test('R2 (revisión 445): --task y --limit sin valor son errores de uso, no un análisis general', t => {
  const root = fixture(t);
  for (const argv of [['--task'], ['--task', '--check'], ['--limit'], ['--limit', '--check'], ['--check', '--task']])
    assert.throws(() => run(argv, root), /Falta el valor de --(task|limit)/, argv.join(' '));
  assert.throws(() => run(['--task', 't-1'], root), /ID de encargo no válido/);
  assert.throws(() => run(['--task', '../board'], root), /ID de encargo no válido/);
});

test('sin --check informa pero no falla; el límite y las rutas se pueden indicar', t => {
  const root = fixture(t);
  assert.equal(run([], root).exitCode, 0);
  assert.equal(run(['--limit', '100', '--check'], root).exitCode, 0);
  const one = run(['coordination/reports/GRANDE.md', '--check', '--json'], root);
  assert.equal(one.exitCode, 1);
  assert.equal(JSON.parse(one.output).over[0].bytes, 30 * 1024 + 1);
  assert.throws(() => run(['--limit', '0'], root), RangeError);
  assert.throws(() => run(['--borrar'], root), /Opción desconocida/);
});
