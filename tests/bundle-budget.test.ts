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
// K1 · Techo de trinquete del CSS inicial: tras podar lo muerto y lo pisado (400 → 378 KiB). Solo baja.
// La meta del plan son 340 KB (initialCss en budgets.json): falta llevar los estilos de páginas diferidas a su chunk.
const INITIAL_CSS_CEILING = 380 * 1024;

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
  assert.ok(result.totals.initialCss <= INITIAL_CSS_CEILING, 'CSS inicial ' + result.totals.initialCss + ' B > techo ' + INITIAL_CSS_CEILING + ' B: lleva los estilos nuevos a la hoja de su página diferida');
});
