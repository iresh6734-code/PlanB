// CLAUDE-PERF-BUDGETS · Mide por HTTP (inject de Fastify) la App real sobre un almacén cifrado con datos ficticios.
//
//   NODE_ENV=test npx tsx tools/perf/measure.ts [--records 10000] [--repeats 7] [--json] [--check]
//
// Crea una carpeta propia en tests/.tmp/perf-* y la borra al terminar. No abre puertos, no usa red ni lee datos reales.
// --check compara con tools/perf/budgets.json y termina con código 1 si alguna medida supera su presupuesto.
import fs from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import { createBaseApp } from '../../server/app.js';
import { Store } from '../../server/store.js';
import { makeDemoSpec } from '../../shared/fixtures.js';
import { perfSnapshot } from './fixture.js';

export interface Sample { median: number; p95: number; min: number; max: number; runs: number }
export interface PerfResult {
  records: number; repeats: number; at: string; node: string;
  timings: Record<string, Sample>;
  notes: string[];
}
export interface Budgets { records: number; timings: Record<string, number>; bundle: Record<string, number> }

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const BUDGETS_FILE = path.join(ROOT, 'tools', 'perf', 'budgets.json');
export const readBudgets = (): Budgets => JSON.parse(fs.readFileSync(BUDGETS_FILE, 'utf8'));

/** Descripción de cada medida, para el informe y la salida de texto. */
export const LABELS: Record<string, string> = {
  coldList: 'Lista de clientes en frío (almacén recién abierto: /api/v2/state + primera página de clientes)',
  warmList: 'Lista de clientes en caliente (primera página de clientes)',
  listSearch: 'Filtro dentro de la lista de clientes (?q=)',
  openRecord: 'Abrir una ficha (/api/v2/records/contacts/:id)',
  globalSearch: 'Búsqueda global (/api/v2/search)',
  openSearchResult: 'Abrir un resultado de la búsqueda (/api/v2/search-record)',
  saveRecord: 'Guardar un cambio en una ficha (PATCH /api/records/contacts/:id)'
};

function summarize(values: number[]): Sample {
  const sorted = [...values].sort((a, b) => a - b);
  const at = (q: number) => sorted[Math.min(sorted.length - 1, Math.ceil(q * sorted.length) - 1)];
  const round = (n: number) => Math.round(n * 10) / 10;
  return { median: round(at(0.5)), p95: round(at(0.95)), min: round(sorted[0]), max: round(sorted[sorted.length - 1]), runs: values.length };
}

async function time(run: () => Promise<void>): Promise<number> {
  const start = performance.now(); await run(); return performance.now() - start;
}

function expectOk(response: { statusCode: number; body: string }, what: string) {
  if (response.statusCode !== 200) throw new Error(what + ' respondió ' + response.statusCode + ': ' + response.body.slice(0, 200));
}

/** Carpeta propia bajo tests/.tmp/perf-*. */
export function perfDir(prefix = 'perf-run-'): string {
  const base = path.join(ROOT, 'tests', '.tmp');
  fs.mkdirSync(base, { recursive: true });
  return fs.mkdtempSync(path.join(base, prefix));
}

/** Siembra un almacén cifrado real con `total` registros ficticios y lo deja activado. */
export function seedStore(file: string, total: number) {
  const store = new Store(file);
  try {
    const snapshot = perfSnapshot(total);
    store.importSnapshot(snapshot);
    store.saveGeneration(makeDemoSpec(snapshot), { provider: 'demo', model: null, generatedAt: snapshot.capturedAt, prompt: '', approved: false });
    store.activate();
  } finally { store.close(); }
}

export async function measure(options: { records?: number; repeats?: number; dir?: string } = {}): Promise<PerfResult> {
  if (process.env.NODE_ENV !== 'test') throw new Error('Ejecuta con NODE_ENV=test: el almacén de medida usa una clave de pruebas.');
  const total = options.records ?? 10000, repeats = Math.max(1, options.repeats ?? 7);
  const own = !options.dir, dir = options.dir ?? perfDir();
  const file = path.join(dir, 'planb.sqlite');
  const series: Record<string, number[]> = {};
  const add = (name: string, value: number) => (series[name] ??= []).push(value);
  const notes: string[] = [];
  try {
    seedStore(file, total);
    // En frío: cada repetición abre el almacén de nuevo (sin caché de registros), como tras arrancar la App.
    for (let i = 0; i <= repeats; i++) {
      const { app } = await createBaseApp({ dbPath: file, root: dir, staticDir: 'none' });
      try {
        const elapsed = await time(async () => {
          expectOk(await app.inject({ url: '/api/v2/state' }), 'state');
          expectOk(await app.inject({ url: '/api/v2/records/contacts?limit=50' }), 'lista');
        });
        if (i > 0) add('coldList', elapsed); // La primera abre la clave y calienta el JIT: no cuenta.
      } finally { await app.close(); }
    }
    const { app } = await createBaseApp({ dbPath: file, root: dir, staticDir: 'none' });
    try {
      const first = (await app.inject({ url: '/api/v2/records/contacts?limit=50' })).json() as { records: { id: string }[]; total: number };
      if (first.records.length !== 50) throw new Error('La primera página no trae 50 clientes');
      const ids = first.records.map(r => r.id);
      const state = (await app.inject({ url: '/api/v2/state' })).json() as { workspaceSearchContext: { contextRevision: string } | null };
      if (!state.workspaceSearchContext) throw new Error('La copia de medida no está activada');
      const terms = ['ana', 'martin', 'estudio arce', 'propuesta', 'luc', 'grupo'];
      for (let i = 0; i <= repeats; i++) {
        const keep = i > 0; // Primera vuelta: calentamiento.
        const warm = await time(async () => expectOk(await app.inject({ url: '/api/v2/records/contacts?limit=50&offset=' + (i * 50) }), 'lista'));
        const filter = await time(async () => expectOk(await app.inject({ url: '/api/v2/records/contacts?limit=50&q=' + encodeURIComponent(terms[i % terms.length]) }), 'filtro'));
        const id = ids[i % ids.length];
        const open = await time(async () => expectOk(await app.inject({ url: '/api/v2/records/contacts/' + encodeURIComponent(id) }), 'ficha'));
        let hit: { entity: string; id: string } | undefined, source: { captureId: string; revision: string } | undefined;
        const search = await time(async () => {
          const response = await app.inject({ url: '/api/v2/search?q=' + encodeURIComponent(terms[i % terms.length]) + '&limit=25' });
          expectOk(response, 'búsqueda');
          const body = response.json() as { source: { captureId: string; revision: string }; items?: { entity: string; id: string }[] };
          source = body.source; hit = (body.items ?? [])[0];
        });
        let openHit = NaN;
        if (hit && source) {
          const query = new URLSearchParams({ entity: hit.entity, id: hit.id, captureId: source.captureId, revision: source.revision });
          openHit = await time(async () => expectOk(await app.inject({ url: '/api/v2/search-record?' + query }), 'abrir resultado'));
        }
        const save = await time(async () => expectOk(await app.inject({ method: 'PATCH', url: '/api/records/contacts/' + encodeURIComponent(id),
          payload: { values: { phone: '611 ' + String(i).padStart(6, '0') } } }), 'guardar'));
        if (!keep) continue;
        add('warmList', warm); add('listSearch', filter); add('openRecord', open); add('globalSearch', search); add('saveRecord', save);
        if (Number.isFinite(openHit)) add('openSearchResult', openHit);
      }
      if (!series.openSearchResult) notes.push('La búsqueda no devolvió resultados: no se midió la apertura de un resultado.');
    } finally { await app.close(); }
  } finally {
    if (own) fs.rmSync(dir, { recursive: true, force: true });
  }
  const timings: Record<string, Sample> = {};
  for (const [name, values] of Object.entries(series)) timings[name] = summarize(values);
  return { records: total, repeats, at: new Date().toISOString(), node: process.version, timings, notes };
}

/** Una medida solo se compara con los presupuestos si usa exactamente el tamaño de referencia (R2, revisión 445). */
export const isReferenceSize = (result: PerfResult, budgets: Budgets = readBudgets()) => result.records === budgets.records;

/**
 * Medidas que superan su presupuesto (se compara la mediana). Una muestra con otro número de registros nunca aprueba:
 * es exploratoria y devuelve ese motivo como fallo, aunque ningún tiempo supere su techo.
 */
export function overBudget(result: PerfResult, budgets: Budgets = readBudgets()): string[] {
  const failures: string[] = [];
  if (!isReferenceSize(result, budgets))
    failures.push('muestra exploratoria: ' + result.records + ' registros; los presupuestos exigen exactamente ' + budgets.records);
  for (const [name, limit] of Object.entries(budgets.timings)) {
    const sample = result.timings[name];
    if (!sample) failures.push(name + ': sin medida');
    else if (sample.median > limit) failures.push(name + ': mediana ' + sample.median + ' ms > presupuesto ' + limit + ' ms');
  }
  return failures;
}

function arg(name: string, fallback: number) {
  const at = process.argv.indexOf(name);
  return at >= 0 ? Number(process.argv[at + 1]) : fallback;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const budgets = readBudgets();
  const result = await measure({ records: arg('--records', budgets.records), repeats: arg('--repeats', 7) });
  if (process.argv.includes('--json')) console.log(JSON.stringify({ ...result, reference: isReferenceSize(result, budgets) }, null, 2));
  else {
    console.log('Plan B · rendimiento con ' + result.records + ' registros ficticios (' + result.repeats + ' repeticiones, Node ' + result.node + ')'
      + (isReferenceSize(result, budgets) ? '' : ' · EXPLORATORIA: no se compara con los presupuestos de ' + budgets.records));
    for (const [name, sample] of Object.entries(result.timings))
      console.log('  ' + name.padEnd(17) + ' mediana ' + String(sample.median).padStart(7) + ' ms · p95 ' + String(sample.p95).padStart(7) + ' ms · presupuesto '
        + (budgets.timings[name] ?? '—') + ' ms  ' + (LABELS[name] ?? ''));
    for (const note of result.notes) console.log('  Nota: ' + note);
  }
  if (process.argv.includes('--check')) {
    const failures = overBudget(result);
    if (failures.length) { console.error('Sin aprobado:\n  ' + failures.join('\n  ')); process.exitCode = 1; }
    else console.log('Todas las medidas dentro de presupuesto.');
  }
}
