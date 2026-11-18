// CLAUDE-PERF-BUDGETS · E3 del informe de mejoras: presupuestos de rendimiento con 10.000 registros ficticios.
// Almacén cifrado real en tests/.tmp/perf-*, App real montada con createBaseApp y medida por inject. Sin red ni datos reales.
// Los presupuestos son techos de regresión (tools/perf/budgets.json); los objetivos de producto están en tools/perf/README.md.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { SnapshotSchema, MAX_RECORDS } from '../shared/model.js';
import { distribution, perfSnapshot } from '../tools/perf/fixture.js';
import { measure, overBudget, readBudgets, type PerfResult } from '../tools/perf/measure.js';

interface BundleItem { file: string; kind: 'js' | 'css'; bytes: number; gzip: number }
interface BundleModule {
  PERF_BUILD: string;
  build(outDir?: string): string;
  analyze(dir?: string): { totals: Record<string, number>; initial: BundleItem[]; largestLazy: BundleItem | null; lazyCount: number };
  overBundleBudget(result: { totals: Record<string, number> }, budgets: Record<string, number>): string[];
}
const bundlePath: string = '../tools/perf/bundle.mjs';
const loadBundle = async () => await import(bundlePath) as BundleModule;

test('la captura de medida tiene exactamente 10.000 registros ficticios, válidos y con relaciones resolubles', () => {
  const snapshot = perfSnapshot();
  assert.equal(snapshot.records.length, MAX_RECORDS);
  assert.equal(snapshot.source.isTestData, true);
  assert.doesNotThrow(() => SnapshotSchema.parse(snapshot));
  const keys = new Set(snapshot.records.map(record => record.entity + ':' + record.id));
  assert.equal(keys.size, MAX_RECORDS, 'identificadores únicos');
  for (const link of snapshot.links) assert.ok(keys.has(link.toEntity + ':' + link.toId), 'relación resoluble ' + link.toId);
  assert.equal(snapshot.manifest.expectedLinks, snapshot.links.length);
  assert.deepEqual(snapshot.manifest.expectedCounts, distribution(MAX_RECORDS));
  assert.ok(snapshot.records.every(record => !record.values.email || String(record.values.email).endsWith('@example.com')));
});

test('la captura es determinista y el reparto respeta el total pedido', () => {
  assert.deepEqual(perfSnapshot(200).records, perfSnapshot(200).records);
  assert.notDeepEqual(perfSnapshot(200, 1).records, perfSnapshot(200, 2).records);
  for (const total of [4, 37, 1000, MAX_RECORDS]) {
    const counts = distribution(total);
    assert.equal(Object.values(counts).reduce((a, b) => a + b, 0), total);
    assert.ok(Object.values(counts).every(value => value >= 1));
  }
  assert.throws(() => distribution(MAX_RECORDS + 1), RangeError);
  assert.throws(() => distribution(3), RangeError);
});

test('la comparación con presupuestos detecta medidas por encima y medidas que faltan', () => {
  const sample = (median: number) => ({ median, p95: median, min: median, max: median, runs: 1 });
  const result: PerfResult = { records: 10, repeats: 1, at: '', node: '', notes: [], timings: { a: sample(10), b: sample(31) } };
  const budgets = { records: 10, bundle: {}, timings: { a: 10, b: 30, c: 5 } };
  assert.deepEqual(overBudget(result, budgets), ['b: mediana 31 ms > presupuesto 30 ms', 'c: sin medida']);
});

test('con 10.000 registros, lista, ficha, búsqueda y guardado quedan dentro de presupuesto', { timeout: 300_000 }, async () => {
  const budgets = readBudgets();
  assert.equal(budgets.records, MAX_RECORDS);
  const result = await measure({ records: budgets.records, repeats: 3 });
  for (const name of Object.keys(budgets.timings)) assert.ok(result.timings[name], 'se midió ' + name);
  const failures = overBudget(result, budgets);
  assert.deepEqual(failures, [], 'medidas: ' + JSON.stringify(result.timings));
});

test('el análisis del paquete separa lo inicial de lo diferido y suma bytes y gzip', async t => {
  const { analyze, overBundleBudget } = await loadBundle();
  fs.mkdirSync(path.resolve('tests/.tmp'), { recursive: true });
  const dir = fs.mkdtempSync(path.resolve('tests/.tmp/perf-bundle-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.mkdirSync(path.join(dir, 'assets'));
  fs.writeFileSync(path.join(dir, 'index.html'), '<script type="module" crossorigin src="/assets/index.js"></script>'
    + '<link rel="modulepreload" crossorigin href="/assets/vendor.js"><link rel="stylesheet" crossorigin href="/assets/index.css">');
  fs.writeFileSync(path.join(dir, 'assets/index.js'), 'a'.repeat(1000));
  fs.writeFileSync(path.join(dir, 'assets/vendor.js'), 'b'.repeat(500));
  fs.writeFileSync(path.join(dir, 'assets/index.css'), 'c'.repeat(300));
  fs.writeFileSync(path.join(dir, 'assets/Lazy.js'), 'd'.repeat(4000));
  const result = analyze(dir);
  assert.deepEqual(result.initial.map(item => item.file).sort(), ['assets/index.css', 'assets/index.js', 'assets/vendor.js']);
  assert.equal(result.totals.initialJs, 1500);
  assert.equal(result.totals.initialCss, 300);
  assert.equal(result.totals.lazyJs, 4000);
  assert.equal(result.largestLazy?.file, 'assets/Lazy.js');
  assert.ok(result.totals.initialJsGzip > 0 && result.totals.initialJsGzip < 1500);
  assert.deepEqual(overBundleBudget(result, { initialJs: 1499, initialCss: 300, missing: 1 }), ['initialJs: 1500 B > presupuesto 1499 B', 'missing: sin medida']);
});

test('la compilación de medida nunca escribe en dist/ ni build/ del piloto', async () => {
  const { build, PERF_BUILD } = await loadBundle();
  assert.match(PERF_BUILD.replace(/\\/g, '/'), /tests\/\.tmp\/perf-build\/dist$/);
  for (const forbidden of ['dist', 'build', 'dist/sub', 'build/x']) assert.throws(() => build(path.resolve(forbidden)), /No se compila en/);
});

test('el paquete inicial compilado queda dentro de presupuesto', async t => {
  const { analyze, overBundleBudget, PERF_BUILD } = await loadBundle();
  if (!fs.existsSync(path.join(PERF_BUILD, 'index.html'))) {
    t.skip('Sin compilación de medida: ejecuta node tools/perf/bundle.mjs (compila en tests/.tmp/perf-build).');
    return;
  }
  const result = analyze(PERF_BUILD);
  assert.deepEqual(overBundleBudget(result, readBudgets().bundle), [], 'totales: ' + JSON.stringify(result.totals));
});
