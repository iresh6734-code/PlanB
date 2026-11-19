import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

type InitialFile = { file: string; kind: 'js' | 'css'; bytes: number; gzip: number };
type BundleModule = {
  analyze(dir: string): { totals: Record<string, number>; initial: InitialFile[] };
  overBundleBudget(result: { totals: Record<string, number> }, budgets: Record<string, number>): string[];
};

// Ruta en variable para que tsc no intente tipar el .mjs.
const bundlePath: string = '../tools/perf/bundle.mjs';
const loadBundle = async () => await import(bundlePath) as BundleModule;

const DIST = path.resolve('dist');
const JS_BUDGETS = ['initialJs', 'initialJsGzip'] as const;

function jsBudgets(): Record<string, number> {
  const budgets = JSON.parse(fs.readFileSync(path.resolve('tools/perf/budgets.json'), 'utf8')) as { bundle: Record<string, number> };
  return Object.fromEntries(JS_BUDGETS.map(name => [name, budgets.bundle[name]]));
}

test('presupuestos de JS inicial definidos en tools/perf/budgets.json', () => {
  for (const [name, limit] of Object.entries(jsBudgets())) {
    assert.ok(Number.isFinite(limit) && limit > 0, name + ' debe ser un número positivo');
  }
});

test('el JS inicial de dist no supera el presupuesto ni trae React de desarrollo', async t => {
  if (!fs.existsSync(path.join(DIST, 'index.html'))) {
    t.skip('Sin dist: ejecuta npm run build.');
    return;
  }
  const { analyze, overBundleBudget } = await loadBundle();
  const result = analyze(DIST);
  const devChunks = result.initial
    .filter(item => item.kind === 'js')
    .filter(item => /react(?:-dom)?\.development\.js/.test(fs.readFileSync(path.join(DIST, item.file), 'utf8')))
    .map(item => item.file);
  assert.deepEqual(devChunks, [], 'dist lleva React de desarrollo: compila sin NODE_ENV=test (npm run build en una terminal limpia).');
  assert.deepEqual(overBundleBudget(result, jsBudgets()), [], 'totales: ' + JSON.stringify(result.totals));
});
