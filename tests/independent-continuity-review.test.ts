// QA042 · revisión adversa independiente de LAB035 (continuity-lab), OPS039 (response-queue) y DIFF040 (capture-comparison).
// Solo datos ficticios, SQLite en memoria y Fastify inject. Las fuentes de Codex se importan sin modificarlas.
// QA042_SRC permite apuntar a una copia efímera con una guarda eliminada (solo para demostrar sensibilidad).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createBaseApp } from '../server/app.js';
import { makeFixture, makeDemoSpec } from '../shared/fixtures.js';
import type { AppSpec, CrmRecord, CrmSnapshot } from '../shared/model.js';
import type { ContinuityLabInput } from '../shared/continuity-lab.js';

const SRC = process.env.QA042_SRC ? resolve(process.env.QA042_SRC) : resolve('.');
const load = async (file: string) => import(pathToFileURL(join(SRC, file)).href);
const { evaluateContinuityScenario: evaluate } = await load('shared/continuity-lab.ts') as typeof import('../shared/continuity-lab.js');
const { buildResponseQueue } = await load('shared/response-queue.ts') as typeof import('../shared/response-queue.js');
const { compareCaptures, CaptureComparisonError } = await load('shared/capture-comparison.ts') as typeof import('../shared/capture-comparison.js');

// ───────────────────────── LAB035 · continuity-lab ─────────────────────────
const minute = 60_000, now = Date.UTC(2026, 9, 29, 12);
function lab(): ContinuityLabInput {
  const scope = { spaceId: 'qa-space', sourceKey: 'qa-source', captureId: 'qa-capture' };
  return {
    scope, evaluatedAt: now, scenario: 'device-loss', outageDurationMs: 4 * 60 * minute,
    objectives: { maxDataAgeMs: 60 * minute, maxRecoveryMs: 20 * minute, maxEvidenceAgeMs: 12 * 60 * minute },
    snapshot: { scope: { ...scope }, capturedAt: now - 50 * minute, verifiedAt: now - 49 * minute },
    localRuntime: 'available', recoveryKit: 'available',
    backup: { scope: { ...scope }, createdAt: now - 48 * minute, verifiedAt: now - 47 * minute },
    localDrill: { scope: { ...scope }, startedAt: now - 40 * minute, completedAt: now - 35 * minute, outcome: 'passed' },
    restoreDrill: { scope: { ...scope }, startedAt: now - 30 * minute, completedAt: now - 20 * minute, outcome: 'passed' },
    workload: { scope: { ...scope }, tasks: [{ id: 'a', dueAt: null, status: 'open' }] },
  };
}
const keys = ['spaceId', 'sourceKey', 'captureId'] as const;

test('LAB · precondición: la base device-loss y la base crm-outage están listas; cada prueba posterior muta un solo dato', () => {
  assert.equal(evaluate(lab()).status, 'ready');
  assert.equal(evaluate({ ...lab(), scenario: 'crm-outage' }).status, 'ready');
});

test('LAB · evidencia ajena (cualquier clave de espacio/fuente/captura) en copia, restauración o tareas nunca prepara device-loss', () => {
  for (const field of ['backup', 'restoreDrill', 'snapshot', 'workload'] as const) {
    for (const key of keys) {
      const input = lab(); input[field]!.scope[key] = 'otra'; const result = evaluate(input);
      assert.equal(result.status, 'unproven', field + '.' + key);
      if (field !== 'workload') assert.equal(result.measuredRecoveryMs, null, field + '.' + key);
      else assert.equal(result.exposure, null);
    }
  }
});

test('LAB · el escenario aísla su evidencia: un ensayo fallido o un runtime caído del otro escenario no bloquea', () => {
  const device = lab(); device.localDrill!.outcome = 'failed'; device.localRuntime = 'unavailable';
  assert.equal(evaluate(device).status, 'ready');           // ni el simulacro local fallido ni el runtime local importan al perder el equipo
  const outage = { ...lab(), scenario: 'crm-outage' as const }; outage.restoreDrill!.outcome = 'failed'; outage.recoveryKit = 'unavailable'; outage.backup = null;
  assert.equal(evaluate(outage).status, 'ready');           // ni la restauración fallida ni el kit ni la copia importan en una caída del CRM
  outage.localDrill!.outcome = 'failed';
  assert.equal(evaluate(outage).status, 'blocked');         // pero su propio ensayo fallido sí bloquea
});

test('LAB · cadena temporal de device-loss: igualdades exactas son válidas y un milisegundo de inversión rompe la evidencia', () => {
  const t = now - 40 * minute;
  const chain = lab();   // captura = verificación = copia creada = copia verificada = inicio de ensayo (anchura cero)
  chain.snapshot = { scope: { ...chain.scope }, capturedAt: t, verifiedAt: t };
  chain.backup = { scope: { ...chain.scope }, createdAt: t, verifiedAt: t };
  chain.restoreDrill = { scope: { ...chain.scope }, startedAt: t, completedAt: t + 5 * minute, outcome: 'passed' };
  assert.equal(evaluate(chain).status, 'ready');
  for (const mutate of [
    (i: ContinuityLabInput) => { i.backup!.createdAt = t - 1; },
    (i: ContinuityLabInput) => { i.restoreDrill!.startedAt = t - 1; },
    (i: ContinuityLabInput) => { i.restoreDrill!.completedAt = t - 1; },
  ]) { const input = structuredClone(chain); mutate(input); const r = evaluate(input); assert.equal(r.status, 'unproven'); assert.equal(r.measuredRecoveryMs, null); }
  const edge = lab(); edge.objectives.maxEvidenceAgeMs = now - edge.restoreDrill!.completedAt;   // vigencia exacta
  assert.equal(evaluate(edge).status, 'ready');
  edge.objectives.maxEvidenceAgeMs--; assert.equal(evaluate(edge).status, 'unproven');
});

test('LAB · inventario de exactamente 10.000 tareas se acepta y se cuenta sin importar el orden', () => {
  const input = lab(); const tasks = Array.from({ length: 10_000 }, (_, n) => ({ id: 't' + n, status: n % 4 === 0 ? 'done' as const : 'open' as const, dueAt: n % 3 === 0 ? null : now + n }));
  input.workload!.tasks = tasks;
  const a = evaluate(input).exposure!; input.workload!.tasks = [...tasks].reverse();
  assert.deepEqual(evaluate(input).exposure, a);
  assert.equal(a.openTasks, 7_500); assert.equal(a.tasksWithoutDate + a.tasksDueDuringOutage + a.overdueTasks <= a.openTasks, true);
  assert.equal(a.overdueTasks, 0);                         // todos los vencimientos son >= now: ninguno vencido
  assert.equal(a.tasksWithoutDate, tasks.filter(t => t.status === 'open' && t.dueAt === null).length);
});

test('LAB · el tiempo de recuperación es un dato medido: null sin ensayo y 0 solo si la entrada declara duración cero (el motor no valida plausibilidad)', () => {
  const none = lab(); none.restoreDrill = null; assert.equal(evaluate(none).measuredRecoveryMs, null);
  const zero = lab(); zero.restoreDrill!.completedAt = zero.restoreDrill!.startedAt;
  const r = evaluate(zero);
  // Caracterización, no defecto: la veracidad del cronómetro es responsabilidad del adaptador (límite declarado).
  assert.equal(r.measuredRecoveryMs, 0); assert.equal(r.status, 'ready');
  assert.ok(r.limitations.some(s => s.includes('adaptador')));
});

test('LAB · la verificación de copia puede ser anterior a la verificación de la captura (orden no exigido; caracterización)', () => {
  const input = lab(); input.snapshot!.verifiedAt = now - 1 * minute;   // la captura se verifica DESPUÉS de copia y ensayo
  const r = evaluate(input);
  assert.equal(r.status, 'ready');
  assert.ok(input.restoreDrill!.startedAt < input.snapshot!.verifiedAt);
});

// ───────────────────────── OPS039 · response-queue ─────────────────────────
function opsSpec(overrides: { dueType?: string; statusOptions?: { id: string; label: string }[]; statusType?: string } = {}): AppSpec {
  const spec = structuredClone(makeDemoSpec(makeFixture()));
  const tasks = spec.entities.find(e => e.id === 'tasks')!;
  for (const f of tasks.fields) {
    if (f.key === 'due_date' && overrides.dueType) f.type = overrides.dueType as typeof f.type;
    if (f.key === 'status') { if (overrides.statusOptions) f.options = overrides.statusOptions; if (overrides.statusType) f.type = overrides.statusType as typeof f.type; }
  }
  return spec;
}
const task = (id: string, values: Record<string, string | number | boolean | null>): CrmRecord => ({ id, entity: 'tasks', values: { subject: id, status: 'pending', ...values } });
const queue = (records: CrmRecord[], at: string, extra: { spec?: AppSpec; horizonHours?: number; limit?: number } = {}) =>
  buildResponseQueue({ spec: extra.spec ?? opsSpec(), records, evaluatedAt: Date.parse(at), horizonHours: extra.horizonHours, limit: extra.limit });
const bucketOf = (records: CrmRecord[], at: string, extra = {}) => Object.fromEntries(queue(records, at, extra).items.map(i => [i.id, i.bucket]));

test('OPS · frontera Madrid de un día civil: 22:59:59.999Z (23:59:59.999 CET) aún no vence; +1 ms ya es día siguiente', () => {
  const records = [task('hoy', { due_date: '2026-10-29' })];
  assert.equal(bucketOf(records, '2026-10-29T22:59:59.999Z').hoy, 'due-in-window');
  assert.equal(bucketOf(records, '2026-10-29T23:00:00.000Z').hoy, 'overdue');   // 00:00 del 30 en Madrid; UTC seguiría en día 29
});

test('OPS · cambio de hora: el horizonte absoluto de 24 h acaba el día civil que indica Madrid, no el siguiente por UTC o por 24 h de reloj de pared', () => {
  const records = [task('d25', { due_date: '2026-10-25' }), task('d26', { due_date: '2026-10-26' })];
  // Otoño: 2026-10-24T22:30Z = 00:30 CEST del 25; +24 h = 22:30Z = 23:30 CET del 25 (el día 25 dura 25 h).
  assert.deepEqual(bucketOf(records, '2026-10-24T22:30:00Z'), { d25: 'due-in-window', d26: 'later' });
  const spring = [task('d30', { due_date: '2026-03-30' }), task('d31', { due_date: '2026-03-31' })];
  // Primavera: 2026-03-28T23:30Z = 00:30 CET del 29; +24 h = 23:30Z del 29 = 01:30 CEST del 30.
  assert.deepEqual(bucketOf(spring, '2026-03-28T23:30:00Z'), { d30: 'due-in-window', d31: 'later' });
});

test('OPS · un mismo instante escrito con distinto offset es la misma tarea; su día local sale del instante, no del texto', () => {
  const spec = opsSpec({ dueType: 'datetime' });
  const at = '2026-10-29T12:00:00Z';
  const same = ['2026-10-29T18:00:00Z', '2026-10-29T20:00:00+02:00', '2026-10-29T13:00:00-05:00'].map((v, n) => task('i' + n, { due_date: v }));
  const q = queue(same, at, { spec });
  assert.deepEqual(new Set(q.items.map(i => i.due.at)).size, 1);
  assert.deepEqual(q.items.map(i => i.id), ['i0', 'i1', 'i2']);                                    // empate exacto: ID
  assert.ok(q.items.every(i => i.bucket === 'due-in-window' && i.due.localDate === '2026-10-29'));
  const late = queue([task('x', { due_date: '2026-10-29T23:30:00-05:00' })], at, { spec }).items[0];   // = 04:30Z del 30 = 05:30 CET del 30; el texto dice día 29
  assert.equal(late.due.localDate, '2026-10-30'); assert.equal(late.bucket, 'due-in-window'); assert.equal(late.due.at, Date.parse('2026-10-30T04:30:00Z'));
});

test('OPS · el tipo de campo configurado decide cómo se lee el valor: mismo texto, distinta interpretación; nada se interpreta si el tipo no es de fecha', () => {
  const day = task('d', { due_date: '2026-10-29' }), instant = task('t', { due_date: '2026-10-29T10:00:00Z' });
  const asDate = queue([day, instant], '2026-10-29T08:00:00Z', { spec: opsSpec({ dueType: 'date' }) });
  assert.deepEqual(Object.fromEntries(asDate.items.map(i => [i.id, i.due.kind])), { d: 'date', t: 'invalid' });
  const asInstant = queue([day, instant], '2026-10-29T08:00:00Z', { spec: opsSpec({ dueType: 'datetime' }) });
  assert.deepEqual(Object.fromEntries(asInstant.items.map(i => [i.id, i.due.kind])), { d: 'invalid', t: 'instant' });
  const asText = queue([day], '2026-10-29T08:00:00Z', { spec: opsSpec({ dueType: 'text' }) });
  assert.equal(asText.items[0].due.kind, 'invalid'); assert.equal(asText.items[0].bucket, 'needs-review');
  const odd = queue([task('n', { due_date: 20261029 }), task('b', { due_date: true }), task('e', { due_date: '' }), task('z', { due_date: null }), task('long', { due_date: 'x'.repeat(300) })], '2026-10-29T08:00:00Z');
  const kinds = Object.fromEntries(odd.items.map(i => [i.id, i.due.kind]));
  assert.deepEqual(kinds, { n: 'invalid', b: 'invalid', e: 'missing', z: 'missing', long: 'invalid' });  // vacío/null ≠ valor inválido
  assert.equal(odd.items.find(i => i.id === 'long')!.due.value!.length, 100);
  assert.equal(odd.items.find(i => i.id === 'n')!.due.value, null);
});

test('OPS · etiqueta (180), ID de respaldo y valor inválido (100) recortados nunca parten un par sustituto y respetan el máximo (OPS039-1 corregido)', () => {
  const one = (values: Record<string, string>, id = 't') => queue([task(id, values)], '2026-10-29T12:00:00Z').items[0];
  // El contrato es un MÁXIMO de unidades UTF-16: si el par cruza el borde se omite entero y quedan 179 (o 99).
  const crossing = one({ subject: 'a'.repeat(179) + '😀z', due_date: 'x'.repeat(99) + '😀' });
  assert.equal(crossing.label, 'a'.repeat(179)); assert.equal(crossing.due.value, 'x'.repeat(99));
  // Si el par cabe justo en el límite se conserva íntegro (180 y 100 exactos).
  const fits = one({ subject: 'a'.repeat(178) + '😀z', due_date: 'x'.repeat(98) + '😀z' });
  assert.equal(fits.label, 'a'.repeat(178) + '😀'); assert.equal(fits.label.length, 180);
  assert.equal(fits.due.value, 'x'.repeat(98) + '😀'); assert.equal(fits.due.value!.length, 100);
  // Etiqueta de respaldo (asunto vacío): se usa el ID con el mismo recorte.
  const fallback = one({ subject: '   ' }, 'i'.repeat(179) + '😀z'); assert.equal(fallback.label, 'i'.repeat(179));
  for (const item of [crossing, fits, fallback]) {
    assert.ok(item.label.length <= 180 && !orphanSurrogate.test(item.label));
    assert.ok(item.due.value === null || (item.due.value.length <= 100 && !orphanSurrogate.test(item.due.value)));
  }
  // Un texto sin pares no cambia: 200 caracteres ordinarios siguen recortándose a 180 y 100 exactos.
  const plain = one({ subject: 'b'.repeat(200), due_date: 'y'.repeat(200) }); assert.deepEqual([plain.label.length, plain.due.value!.length], [180, 100]);
});

test('OPS · estados configurados: solo se descarta lo inequívocamente completado; cancelado, contradictorio o ausente permanece visible y los recuentos cuadran', () => {
  const spec = opsSpec({ statusOptions: [
    { id: 's1', label: 'Completada' }, { id: 's2', label: 'Cancelada' }, { id: 'done', label: 'Pendiente' },
    { id: 's3', label: 'En progreso' }, { id: 's4', label: 'Aplazada' },
  ] });
  const records = [
    task('hecha', { status: 's1', due_date: '2026-10-01' }), task('cancelada', { status: 's2', due_date: '2026-10-01' }),
    task('contradictoria', { status: 'done', due_date: '2026-10-01' }), task('progreso', { status: 's3', due_date: '2026-10-01' }),
    task('aplazada', { status: 's4', due_date: '2026-10-01' }), task('etiqueta', { status: 'Completada', due_date: '2026-10-01' }),
    task('nula', { status: null, due_date: '2026-10-01' }), task('numero', { status: 1, due_date: '2026-10-01' }),
  ];
  const q = queue(records, '2026-10-29T12:00:00Z', { spec });
  const byId = Object.fromEntries(q.items.map(i => [i.id, i]));
  assert.equal(byId.hecha, undefined);                                              // única descartada
  for (const id of ['cancelada', 'contradictoria', 'etiqueta', 'nula', 'numero']) assert.equal(byId[id].status, 'unknown', id);
  for (const id of ['progreso', 'aplazada']) assert.equal(byId[id].bucket, 'overdue', id);
  assert.deepEqual([q.summary.completedTasks, q.summary.knownOpenTasks, q.summary.unknownStatusTasks, q.summary.totalTasks], [1, 2, 5, 8]);
  assert.equal(q.summary.completedTasks + q.summary.knownOpenTasks + q.summary.unknownStatusTasks, q.summary.totalTasks);
  assert.equal(Object.values(q.summary.buckets).reduce((a, b) => a + b, 0), q.summary.totalQueued);
  // un campo de estado que no es enum nunca descarta nada, ni siquiera el valor «completed»
  const text = queue([task('c', { status: 'completed' })], '2026-10-29T12:00:00Z', { spec: opsSpec({ statusType: 'text' }) });
  assert.equal(text.items[0].status, 'unknown'); assert.equal(text.summary.completedTasks, 0);
});

test('OPS · un rol de estado o vencimiento que apunta a un campo inexistente no oculta tareas: todas pasan a revisión', () => {
  const spec = opsSpec(); spec.roles = { ...spec.roles!, taskStatus: 'no_existe', dueDate: 'tampoco' };
  const q = queue([task('a', { status: 'completed' }), task('b', { due_date: '2020-01-01' })], '2026-10-29T12:00:00Z', { spec });
  assert.equal(q.summary.completedTasks, 0); assert.ok(q.items.every(i => i.bucket === 'needs-review'));
});

test('OPS · orden y recuentos son invariantes a la permutación de entrada; el límite recorta solo la lista, nunca los totales', () => {
  const ids = ['task-10', 'task-2', 'Task-3', 'a', 'B'];
  const records = [
    ...ids.map(id => task(id, { due_date: '2026-10-29' })),                        // empate total salvo ID
    task('vencida', { due_date: '2026-10-01' }), task('sin-fecha', { due_date: null }), task('tarde', { due_date: '2026-12-01' }),
  ];
  const full = queue(records, '2026-10-29T12:00:00Z', { limit: 200 });
  const shuffled = queue([...records].reverse(), '2026-10-29T12:00:00Z', { limit: 200 });
  assert.deepEqual(shuffled, full);
  assert.deepEqual(full.items.slice(1, 6).map(i => i.id), ['B', 'Task-3', 'a', 'task-10', 'task-2']);   // orden por unidades de código, no numérico ni locale
  for (const limit of [1, 3, 8, 200]) {
    const q = queue(records, '2026-10-29T12:00:00Z', { limit });
    assert.deepEqual(q.summary.buckets, full.summary.buckets); assert.equal(q.summary.totalQueued, 8);
    assert.equal(q.summary.returned, Math.min(limit, 8)); assert.equal(q.summary.truncated, limit < 8);
    assert.deepEqual(q.items.map(i => i.id), full.items.slice(0, limit).map(i => i.id));
  }
  assert.equal(full.items[0].id, 'vencida');
});

test('OPS · referencias: se resuelven por entidad (mismo ID en otra entidad no cuenta), con etiqueta del destino y sin escalar la prioridad', () => {
  const records: CrmRecord[] = [
    { id: 'x', entity: 'companies', values: { name: 'Empresa X' } },                      // existe en companies, NO en contacts
    { id: 'c1', entity: 'contacts', values: { firstname: 'Ana', lastname: 'Ruiz' } },
    task('t1', { contact_id: 'x', deal_id: '', due_date: '2026-11-30' }),
    task('t2', { contact_id: 'c1', due_date: '2026-11-30' }),
    task('t3', { contact_id: 7, due_date: '2026-11-30' }),
  ];
  const q = queue(records, '2026-10-29T12:00:00Z'), by = Object.fromEntries(q.items.map(i => [i.id, i]));
  assert.deepEqual(by.t1.references, [{ field: 'contact_id', entity: 'contacts', id: 'x', label: null, available: false }]);   // deal_id '' no es referencia
  assert.equal(by.t1.bucket, 'later'); assert.ok(by.t1.reasons.some(r => r.code === 'missing-reference'));
  assert.equal(by.t2.references[0].available, true); assert.ok(by.t2.references[0].label);
  assert.equal(by.t3.references[0].id, '7'); assert.equal(by.t3.references[0].available, false);          // el número se lee como texto, sin inventar destino
  assert.ok(!by.t2.reasons.some(r => r.code === 'missing-reference'));
});

test('OPS · parámetros y datos fuera de contrato se rechazan, no se recortan', () => {
  const at = Date.parse('2026-10-29T12:00:00Z'), spec = opsSpec();
  for (const bad of [{ horizonHours: 0 }, { horizonHours: 721 }, { horizonHours: 1.5 }, { horizonHours: NaN }, { limit: 0 }, { limit: 201 }, { limit: 2.5 }]) {
    assert.throws(() => buildResponseQueue({ spec, records: [], evaluatedAt: at, ...bad }), RangeError, JSON.stringify(bad));
  }
  for (const evaluatedAt of [-1, NaN, 1.5, Date.parse('9999-12-31T23:59:59.999Z') + 1, Date.parse('9999-12-31T23:59:59.999Z')]) {
    assert.throws(() => buildResponseQueue({ spec, records: [], evaluatedAt }), RangeError, String(evaluatedAt));   // el último falla porque el horizonte de 24 h excede el calendario
  }
  const dup = [task('same', {}), task('same', {})]; assert.throws(() => buildResponseQueue({ spec, records: dup, evaluatedAt: at }), TypeError);
  assert.doesNotThrow(() => buildResponseQueue({ spec, records: [task('same', {}), { id: 'same', entity: 'contacts', values: {} }], evaluatedAt: at }));  // el ID es único por entidad
  assert.throws(() => buildResponseQueue({ spec, records: [task('  ', {})], evaluatedAt: at }), TypeError);
  assert.throws(() => buildResponseQueue({ spec, records: Array.from({ length: 10_001 }, (_, n) => task('n' + n, {})), evaluatedAt: at }), RangeError);
});

test('OPS · la función no muta entradas congeladas y el resultado es independiente de ellas', () => {
  const deep = (v: any): any => { if (v && typeof v === 'object') { Object.values(v).forEach(deep); Object.freeze(v); } return v; };
  const spec = deep(opsSpec()), records = deep([task('a', { due_date: '2026-10-29', contact_id: 'c' })]);
  const q = buildResponseQueue({ spec, records, evaluatedAt: Date.parse('2026-10-29T12:00:00Z') });
  q.items[0].references[0].id = 'cambiado'; q.items[0].reasons.length = 0;
  assert.equal(records[0].values.contact_id, 'c');
});

// ─────────────── OPS039 · API (Fastify inject + SQLite :memory:) ───────────────
const headers = { host: '127.0.0.1:4399' };
const TABLES = ['meta', 'records', 'changes', 'captures', 'archives', 'usage'];
async function appWith(fixedNow?: number) {
  const realNow = Date.now;
  if (fixedNow !== undefined) Date.now = () => fixedNow;   // se fija antes de registrar rutas: registerResponseQueue captura Date.now por defecto
  try { return await createBaseApp({ dbPath: ':memory:', root: resolve('.'), staticDir: resolve('tests/.tmp/claude-qa042/no-static'), runtime: false }); }
  finally { Date.now = realNow; }
}
type Store = Awaited<ReturnType<typeof appWith>>['store'];
function activate(store: Store, snapshot = makeFixture()) {
  store.importSnapshot(snapshot);
  store.saveGeneration(makeDemoSpec(snapshot), { provider: 'demo', model: null, generatedAt: '2026-10-29T00:00:00.000Z', prompt: '', approved: false });
  store.activate(); return snapshot;
}
const tables = (store: Store) => Object.fromEntries(TABLES.map(t => [t, store.db.prepare('SELECT * FROM ' + t + ' ORDER BY rowid').all()]));

test('OPS API · el reloj lo pone el servidor: horizonte y recuentos se calculan sobre la hora del servidor y la revisión no depende del reloj', async () => {
  const noon = Date.parse('2026-10-29T12:00:00Z'), { app, store } = await appWith(noon);
  try {
    activate(store);
    const r1 = (await app.inject({ method: 'GET', url: '/api/v2/continuity/response-queue?horizonHours=48&limit=200', headers })).json();
    assert.equal(r1.evaluatedAt, '2026-10-29T12:00:00.000Z'); assert.equal(r1.horizonEndsAt, '2026-10-31T12:00:00.000Z'); assert.equal(r1.timeZone, 'Europe/Madrid');
    const direct = buildResponseQueue({ spec: store.spec!, records: store.records(), evaluatedAt: noon, horizonHours: 48, limit: 200 });
    const { source, ...body } = r1;
    assert.equal(source.view, 'active-local-records');
    assert.deepEqual(body, JSON.parse(JSON.stringify(direct)));   // el endpoint es exactamente el motor sobre la copia activa
    const again = (await app.inject({ method: 'GET', url: '/api/v2/continuity/response-queue?limit=1', headers })).json();
    assert.equal(again.source.revision, source.revision);
  } finally { await app.close(); }
});

test('OPS API · errores (409 sin copia, 422 parámetro) no escriben en ninguna tabla; el éxito tampoco', async () => {
  const { app, store } = await appWith();
  try {
    const before0 = tables(store);
    assert.equal((await app.inject({ method: 'GET', url: '/api/v2/continuity/response-queue', headers })).statusCode, 409);
    assert.deepEqual(tables(store), before0);
    activate(store); const before = tables(store);
    for (const q of ['?limit=0', '?horizonHours=abc', '?foo=1', '']) await app.inject({ method: 'GET', url: '/api/v2/continuity/response-queue' + q, headers });
    assert.deepEqual(tables(store), before);
    assert.equal((await app.inject({ method: 'POST', url: '/api/v2/continuity/response-queue', headers })).statusCode >= 400, true);   // no hay método de escritura
    assert.deepEqual(tables(store), before);
  } finally { await app.close(); }
});

// ───────────────────────── DIFF040 · capture-comparison ─────────────────────────
function pair() {
  const from = makeFixture(); from.capturedAt = '2026-10-28T12:00:00.000Z';
  const to = structuredClone(from); to.capturedAt = '2026-10-29T12:00:00.000Z';
  return { from, to };
}
const contactOf = (s: CrmSnapshot) => s.records.find(r => r.entity === 'contacts')!;
const orphanSurrogate = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;

test('DIFF · matriz de valores sin coerción: dos valores difieren si y solo si no son idénticos en (presencia, tipo, valor)', () => {
  const cells: [string, () => { present: boolean; v?: unknown }][] = [
    ['ausente', () => ({ present: false })], ['null', () => ({ present: true, v: null })], ['vacío', () => ({ present: true, v: '' })],
    ['0', () => ({ present: true, v: 0 })], ['false', () => ({ present: true, v: false })], ['"0"', () => ({ present: true, v: '0' })],
    ['"false"', () => ({ present: true, v: 'false' })], ['1', () => ({ present: true, v: 1 })], ['"1"', () => ({ present: true, v: '1' })], ['true', () => ({ present: true, v: true })],
  ];
  for (const [ln, l] of cells) for (const [rn, r] of cells) {
    const { from, to } = pair(); const a = contactOf(from), b = contactOf(to);
    const apply = (rec: CrmRecord, cell: { present: boolean; v?: unknown }) => { if (cell.present) rec.values.phone = cell.v as never; else delete rec.values.phone; };
    apply(a, l()); apply(b, r());
    const expectedSame = ln === rn;
    assert.equal(compareCaptures(from, to).records.totalDifferences, expectedSame ? 0 : 1, ln + ' vs ' + rn);
  }
});

test('DIFF · un ID idéntico en dos entidades es dos registros: mover el contenido de una a otra es ausente+añadido, nunca modificado', () => {
  const { from, to } = pair();
  for (const s of [from, to]) { s.records.push({ id: 'compartido', entity: 'contacts', values: { firstname: 'A' } }, { id: 'compartido', entity: 'companies', values: { name: 'Empresa' } }); s.manifest.expectedCounts.contacts++; s.manifest.expectedCounts.companies++; }
  assert.equal(compareCaptures(from, to).records.totalDifferences, 0);
  const movedTo = structuredClone(to);
  movedTo.records = movedTo.records.filter(r => !(r.entity === 'contacts' && r.id === 'compartido')); movedTo.manifest.expectedCounts.contacts--;
  const r = compareCaptures(from, movedTo);
  assert.deepEqual([r.records.counts.contacts.absent, r.records.counts.companies.unchanged >= 1, r.records.counts.companies.changed], [1, true, 0]);
  assert.equal(r.records.totalDifferences, 1);
});

test('DIFF · vistas previas idénticas con contenido distinto: límite exacto de 500, diferencia en el carácter 501 o solo espacio final', () => {
  const run = (a: string, b: string) => { const { from, to } = pair(); contactOf(from).values.lastname = a; contactOf(to).values.lastname = b; return compareCaptures(from, to).records.items[0]?.fields.find(f => f.key === 'lastname'); };
  const base = 'é'.repeat(500);
  assert.equal(run(base, base), undefined);                                                     // idénticos: sin fila
  const f501 = run(base + 'a', base + 'b')!;
  assert.equal(f501.before.value, f501.after.value); assert.ok(f501.before.truncated && f501.after.truncated);
  const exact = run(base, base.slice(0, 499) + 'x')!;                                           // 500 exactos: no se marca recorte
  assert.equal(exact.before.truncated, false); assert.notEqual(exact.before.value, exact.after.value);
  const trailing = run('Ruiz', 'Ruiz ')!; assert.notEqual(trailing.before.value, trailing.after.value);
  const mixed = run(base, base + 'z')!; assert.equal(mixed.before.truncated, false); assert.equal(mixed.after.truncated, true);
});

test('DIFF · vista previa (500) y etiqueta (180) nunca parten un par sustituto, respetan el máximo y siguen comparando el valor completo (DIFF040-1 corregido)', () => {
  const run = (a: string, b: string, key = 'lastname') => { const { from, to } = pair(); contactOf(from).values[key] = a; contactOf(to).values[key] = b; return compareCaptures(from, to).records.items[0]; };
  const lastname = (row: ReturnType<typeof run>) => row.fields.find(f => f.key === 'lastname')!;
  // Par que cruza el borde: se omite entero (499 unidades), se marca recortado y la diferencia en el sufijo sigue detectándose.
  const crossing = lastname(run('a'.repeat(499) + '😀x', 'a'.repeat(499) + '😀y'));
  assert.equal(crossing.before.value, 'a'.repeat(499)); assert.equal(crossing.after.value, 'a'.repeat(499));
  assert.ok(crossing.before.truncated && crossing.after.truncated);
  // Par que cabe justo: se conserva íntegro, 500 unidades, también recortado por lo que sigue.
  const fits = lastname(run('a'.repeat(498) + '😀x', 'a'.repeat(498) + '😀y'));
  assert.equal(fits.before.value, 'a'.repeat(498) + '😀'); assert.equal((fits.before.value as string).length, 500); assert.ok(fits.before.truncated);
  // Par exacto al final de un valor de 500 unidades: no hay recorte ni marca.
  const whole = lastname(run('a'.repeat(498) + '😀', 'a'.repeat(498) + '😁'));
  assert.equal(whole.before.truncated, false); assert.notEqual(whole.before.value, whole.after.value);
  for (const f of [crossing, fits, whole]) for (const side of [f.before, f.after]) assert.ok(!orphanSurrogate.test(side.value as string));
  // Etiqueta (180) con el campo principal de la entidad.
  const { from, to } = pair(); const display = from.entities.find(e => e.id === 'contacts')!.displayField;
  contactOf(from).values[display] = 'n'.repeat(179) + '😀z'; contactOf(to).values[display] = 'n'.repeat(178) + '😀z';
  const row = compareCaptures(from, to).records.items.find(i => i.entity === 'contacts' && i.id === contactOf(from).id)!;
  assert.equal(row.beforeLabel, 'n'.repeat(179)); assert.equal(row.afterLabel, 'n'.repeat(178) + '😀');
});

test('DIFF · cambios solo de esquema: tipo, obligatoriedad, solo lectura, referencia, orden de opciones, columnas y campo principal no tocan datos', () => {
  const { from, to } = pair();
  const contacts = to.entities.find(e => e.id === 'contacts')!, tasks = to.entities.find(e => e.id === 'tasks')!;
  contacts.fields.find(f => f.key === 'phone')!.type = 'email';
  contacts.fields.find(f => f.key === 'email')!.required = !contacts.fields.find(f => f.key === 'email')!.required;
  contacts.fields.find(f => f.key === 'lastname')!.readOnly = true;
  for (const s of [from, to]) for (const r of s.records) if (r.entity === 'tasks') delete r.values.deal_id;   // sin valores, la referencia puede cambiar de destino sin romper la conciliación
  tasks.fields.find(f => f.key === 'deal_id')!.referenceEntity = 'companies';
  tasks.fields.find(f => f.key === 'status')!.options.reverse();
  contacts.columns = [...contacts.columns].reverse(); tasks.displayField = 'notes';
  const r = compareCaptures(from, to);
  assert.equal(r.records.totalDifferences, 0); assert.equal(r.relations.added + r.relations.absent, 0);
  const aspects = Object.fromEntries(r.schema.fields.map(f => [f.entity + '.' + f.key, f.aspects]));
  assert.deepEqual(aspects, { 'contacts.phone': ['type'], 'contacts.email': ['required'], 'contacts.lastname': ['readOnly'], 'tasks.deal_id': ['referenceEntity'], 'tasks.status': ['options'] });
  assert.ok(r.schema.configurationSections.includes('entities.contacts') && r.schema.configurationSections.includes('entities.tasks'));
});

test('DIFF · relaciones: invertir la dirección, cambiar la etiqueta o reducir la multiplicidad se cuentan como altas/bajas exactas', () => {
  const { from, to } = pair(); const base = from.links[0];
  const inv = { fromEntity: base.toEntity, fromId: base.toId, toEntity: base.fromEntity, toId: base.fromId, label: base.label };
  to.links = to.links.filter(l => l !== to.links[0]); to.links.push(inv as never);       // dirección invertida (requiere extremos existentes: ambos lo son)
  let r = compareCaptures(from, to);
  assert.deepEqual([r.relations.added, r.relations.absent, r.relations.changedGroups, r.relations.unchanged], [1, 1, 2, from.links.length - 1]);
  const relabel = pair(); relabel.to.links[0] = { ...relabel.to.links[0], label: relabel.to.links[0].label + ' (otra)' };   // mismos extremos y dirección, otra etiqueta
  r = compareCaptures(relabel.from, relabel.to);
  assert.deepEqual([r.relations.added, r.relations.absent, r.relations.changedGroups], [1, 1, 2]);
  const dup = pair(); dup.from.links.push({ ...dup.from.links[0] }, { ...dup.from.links[0] }); dup.from.manifest.expectedLinks += 2;   // multiplicidad 3 → 1
  r = compareCaptures(dup.from, dup.to);
  assert.deepEqual([r.relations.added, r.relations.absent, r.relations.changedGroups], [0, 2, 1]);
  assert.equal(r.relations.unchanged, dup.to.links.length);
  const rev = compareCaptures(dup.to, dup.from); assert.deepEqual([rev.relations.added, rev.relations.absent], [2, 0]);   // simetría
});

test('DIFF · simetría: invertir el orden convierte añadidos en ausentes y conserva modificados y sin cambios', () => {
  const { from, to } = pair();
  to.records.push({ id: 'nuevo', entity: 'companies', values: { name: 'Nueva' } }); to.manifest.expectedCounts.companies++;
  to.records = to.records.filter(r => !(r.entity === 'tasks' && r.id === 'task-18')); to.manifest.expectedCounts.tasks--;
  to.links = to.links.filter(l => !((l.fromEntity === 'tasks' && l.fromId === 'task-18') || (l.toEntity === 'tasks' && l.toId === 'task-18'))); to.manifest.expectedLinks = to.links.length;
  contactOf(to).values.phone = 'cambiado';
  const ab = compareCaptures(from, to), ba = compareCaptures(to, from);
  for (const entity of ['contacts', 'companies', 'deals', 'tasks'] as const) {
    assert.equal(ab.records.counts[entity].added, ba.records.counts[entity].absent, entity);
    assert.equal(ab.records.counts[entity].absent, ba.records.counts[entity].added, entity);
    assert.equal(ab.records.counts[entity].changed, ba.records.counts[entity].changed, entity);
    assert.equal(ab.records.counts[entity].unchanged, ba.records.counts[entity].unchanged, entity);
  }
  assert.deepEqual([ab.relations.added, ab.relations.absent], [ba.relations.absent, ba.relations.added]);
  assert.deepEqual([ab.chronological, ba.chronological], [true, false]);
});

test('DIFF · paginación: las páginas consecutivas reconstruyen la lista completa sin saltos ni duplicados, incluso al cruzar entidades', () => {
  const { from, to } = pair();
  for (const r of to.records) if (r.entity !== 'deals') r.values[r.entity === 'tasks' ? 'notes' : 'phone'] = 'n-' + r.id;   // cambios en tres entidades
  const full = compareCaptures(from, to, { limit: 200 }), total = full.records.totalDifferences;
  assert.ok(total > 10 && new Set(full.records.items.map(i => i.entity)).size >= 2);
  for (const size of [1, 3, 7, 200]) {
    const seen: string[] = [];
    for (let offset = 0; offset < total + size; offset += size) {
      const page = compareCaptures(from, to, { offset, limit: size });
      assert.equal(page.records.totalDifferences, total); assert.deepEqual(page.records.counts, full.records.counts);
      assert.equal(page.records.truncated, offset + size < total, 'size ' + size + ' offset ' + offset);
      seen.push(...page.records.items.map(i => i.entity + '/' + i.id));
    }
    assert.deepEqual(seen, full.records.items.map(i => i.entity + '/' + i.id), 'size ' + size);
  }
  const last = compareCaptures(from, to, { offset: total - 1, limit: 200 }); assert.equal(last.records.items.length, 1); assert.equal(last.records.truncated, false);
  const beyond = compareCaptures(from, to, { offset: total, limit: 5 }); assert.deepEqual([beyond.records.items.length, beyond.records.truncated, beyond.records.totalDifferences], [0, false, total]);
});

test('DIFF · compatibilidad de origen y validez: cada discrepancia de identidad es SOURCE_MISMATCH y una captura inválida es INVALID_CAPTURE sin filtrar contenido', () => {
  const mismatch = (mutate: (s: CrmSnapshot) => void) => { const { from, to } = pair(); mutate(to); return assert.throws(() => compareCaptures(from, to), (e: unknown) => e instanceof CaptureComparisonError && e.code === 'SOURCE_MISMATCH'); };
  mismatch(s => { s.source.accountId = s.source.accountId.toUpperCase(); });                    // sin normalizar mayúsculas
  mismatch(s => { s.source.accountId += ' '; });
  mismatch(s => { s.source.environment = 'test'; });                                            // ausente ≠ 'test'
  const invalid = (mutate: (s: CrmSnapshot) => void) => { const { from, to } = pair(); mutate(to); try { compareCaptures(from, to); assert.fail('debía rechazar'); } catch (e: any) { assert.equal(e.code, 'INVALID_CAPTURE'); assert.ok(!/SECRETO/.test(e.message)); } };
  invalid(s => { s.capturedAt = 'ayer'; });
  invalid(s => { s.links.push({ fromEntity: 'tasks', fromId: 'SECRETO', toEntity: 'contacts', toId: 'contact-1', label: 'x' }); s.manifest.expectedLinks++; });   // extremo inexistente
  invalid(s => { s.records[0].values.SECRETO_sin_definicion = 'x'; });                           // campo sin definición
  invalid(s => { s.entities = s.entities.slice(0, 3); });
  invalid(s => { s.manifest.expectedCounts.tasks += 1; });
  const { from, to } = pair(); from.manifest.complete = false;                                    // la primera captura también cuenta
  assert.throws(() => compareCaptures(from, to), (e: any) => e.code === 'INVALID_CAPTURE');
});

test('DIFF · caracterización: metadatos de origen que no forman identidad (accountType de datos de prueba, nombre, descripción) no impiden comparar ni cuentan como cambio de datos', () => {
  const { from, to } = pair(); to.source.accountType = 'SANDBOX'; to.source.description = 'otra descripción'; to.name = 'otro nombre';
  assert.equal(compareCaptures(from, to).records.totalDifferences, 0);
});

// ─────────────── DIFF040 · API (Fastify inject + SQLite :memory:) ───────────────
const route = '/api/v2/captures/compare', q = (from: string, to: string, extra = '') => route + '?from=' + encodeURIComponent(from) + '&to=' + encodeURIComponent(to) + extra;

test('DIFF API · comparar una captura consigo misma da cero diferencias y mismo hash; cualquier cambio de valor cambia el hash', async () => {
  const { app, store } = await appWith();
  try {
    const { from, to } = pair(); contactOf(to).values.phone = 'otro';
    const a = store.addCapture(from), b = store.addCapture(to);
    const self = (await app.inject({ method: 'GET', url: q(a, a), headers })).json();
    assert.equal(self.records.totalDifferences, 0); assert.equal(self.from.contentHash, self.to.contentHash);
    const cross = (await app.inject({ method: 'GET', url: q(a, b), headers })).json();
    assert.notEqual(cross.from.contentHash, cross.to.contentHash); assert.equal(cross.from.contentHash, self.from.contentHash);   // el hash no depende del par
    assert.equal(cross.from.contentHash, createHash('sha256').update(JSON.stringify(store.capture(a))).digest('hex'));
    assert.ok(cross.limitations.some((s: string) => /no acredita un borrado remoto/.test(s)));
  } finally { await app.close(); }
});

test('DIFF API · identidad guardada: la discrepancia en la primera captura también se rechaza (422) y IDs raros/largos no producen 5xx', async () => {
  const { app, store } = await appWith();
  try {
    const { from, to } = pair(); const a = store.addCapture(from), b = store.addCapture(to);
    const forged = structuredClone(from); forged.id = 'otro-id';
    store.db.prepare('UPDATE captures SET payload=? WHERE id=?').run(store.encode(forged), a);
    assert.equal((await app.inject({ method: 'GET', url: q(a, b), headers })).statusCode, 422);
    for (const [id, status] of [['%', 404], ['💥:2026', 404], ["'; DROP TABLE captures;--", 404], ['x'.repeat(400), 404], ['x'.repeat(401), 422], ['', 422]] as const) {
      const response = await app.inject({ method: 'GET', url: q(id, b), headers }); assert.equal(response.statusCode, status, JSON.stringify(id.slice(0, 10)));
    }
    assert.equal((store.db.prepare('SELECT COUNT(*) AS n FROM captures').get() as { n: number }).n, 2);
  } finally { await app.close(); }
});

test('DIFF API · los errores 409/422 no revelan portal ni contenido y ninguna ruta (éxito o error) escribe en tablas ni poda capturas', async () => {
  const { app, store } = await appWith();
  try {
    const { from, to } = pair(); const other = structuredClone(to); other.source.accountId = 'PORTAL-AJENO-SECRETO'; other.capturedAt = '2026-10-30T12:00:00.000Z';
    const a = store.addCapture(from), b = store.addCapture(to);
    const o = store.addCapture(other);   // addCapture solo exige portal si la instalación está ligada a una cuenta; aquí no lo está
    const before = tables(store);
    const mismatch = await app.inject({ method: 'GET', url: q(a, o), headers });
    assert.equal(mismatch.statusCode, 409); assert.ok(!/PORTAL-AJENO-SECRETO/.test(mismatch.body)); assert.ok(!mismatch.body.includes(from.source.accountId));
    await app.inject({ method: 'GET', url: q(a, 'missing'), headers }); await app.inject({ method: 'GET', url: q(a, b, '&limit=999'), headers });
    assert.equal((await app.inject({ method: 'GET', url: q(a, b), headers })).statusCode, 200);
    assert.deepEqual(tables(store), before);
  } finally { await app.close(); }
});
