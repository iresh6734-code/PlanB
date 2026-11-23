import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// QA073 · HISTORY064: historial completo, tipado y de solo lectura. Fixture inventado con más de 100 operaciones cuyos IDs salen
// realmente de un Store (la secuencia autoincremental NO se reinicia al sustituir la captura), con primeras y últimas identificables
// y varias operaciones sobre la misma ficha. El oráculo es un modelo propio del estado de cada ficha y un filtro de fuerza bruta
// escrito aquí; no se compara historyPage consigo misma.
// Fuentes bajo prueba = QA073_ROOT (corte propio, por defecto este checkout). Sin red; sin proveedores.
// QA079 · CAMBIO EXPLÍCITO DE CONTRATO (H1): el buscador anuncia «ID, campo o valor anterior/actual». Hasta el corte baseline075 también indexaba la fecha presentada (`at`), así que un número
// o un año coincidía con operaciones solo por su fecha. Ahora el texto buscable es: ID de operación, ID de ficha, entidad, tipo de operación (metadatos operativos admitidos), nombres de campo y
// valores anteriores/actuales. La fecha NO se indexa. H3b pasa a verde; H9 (que caracterizaba «el año devuelve todo») se reescribe con el contrato nuevo y H9a conserva la caracterización
// anterior ejecutándola contra la copia inmutable del corte baseline075 (QA079_BASELINE_ROOT o tests/.tmp/qa075-…/source).
const OVERRIDE = process.env.QA073_ROOT;
const ROOT = OVERRIDE ? path.resolve(OVERRIDE) : path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const load = (relative: string) => import(pathToFileURL(path.join(ROOT, relative)).href);
const { createBaseApp } = await load('server/app.ts') as typeof import('../server/app.js');
const { makeFixture, makeDemoSpec } = await load('shared/fixtures.ts') as typeof import('../shared/fixtures.js');
const { historyPage, changedFields } = await load('shared/change-history.ts') as typeof import('../shared/change-history.js');

type Expected = { id: number; entity: 'contacts' | 'companies' | 'tasks'; recordId: string; operation: 'create' | 'update'; before: Record<string, unknown> | null; after: Record<string, unknown> };
const GEN = { provider: 'demo' as const, model: null, generatedAt: '2026-10-30T00:00:00.000Z', prompt: '', approved: false };
const fold = (text: string) => text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
const WARMUP = 25, TOTAL = 122, WATERMARK_INDEX = 59;

/** Construye 122 operaciones locales tras una sustitución de captura que ya había consumido IDs de historial. */
async function build() {
  const h = await createBaseApp({ dbPath: ':memory:', root: '.', staticDir: 'none' });
  const first = makeFixture('agency'); h.store.importSnapshot(first); h.store.saveGeneration(makeDemoSpec(first), GEN); h.store.activate();
  for (let i = 0; i < WARMUP; i++) h.store.saveRecord('tasks', { notes: 'calentamiento ' + i }, 'task-1');
  assert.equal(h.store.changesCount, WARMUP);
  const next = makeFixture('agency'); h.store.importSnapshot(next, true); h.store.saveGeneration(makeDemoSpec(next), GEN); h.store.activate();
  assert.equal(h.store.changesCount, 0, 'precondición: la sustitución vacía el historial');
  const model = new Map<string, Record<string, unknown>>();
  for (const r of next.records) model.set(r.entity + ':' + r.id, { ...r.values });
  const expected: Expected[] = [];
  const apply = (entity: Expected['entity'], id: string | undefined, values: Record<string, unknown>) => {
    const key = id ? entity + ':' + id : null, before = key ? { ...model.get(key)! } : null;
    const saved = h.store.saveRecord(entity, values as any, id);
    model.set(entity + ':' + saved.id, { ...(before ?? {}), ...values });
    expected.push({ id: 0, entity, recordId: saved.id, operation: id ? 'update' : 'create', before, after: { ...(before ?? {}), ...values } });
  };
  for (let i = 0; i < TOTAL; i++) {
    if (i === 7) apply('contacts', 'contact-2', { lastname: 'ZetaUnica73' });
    else if (i === 100) apply('companies', 'company-2', { name: 'Último Ñandú 73' });
    else if (i % 11 === 0) apply('contacts', undefined, { firstname: 'Alta' + i, email: 'alta' + i + '@example.invalid' });
    else if (i % 3 === 0) apply('companies', 'company-1', { phone: '910 000 ' + String(i).padStart(3, '0') });
    else if (i % 3 === 1) apply('contacts', 'contact-1', { phone: '700 000 ' + String(i).padStart(3, '0') });
    else apply('tasks', 'task-1', { notes: 'nota ' + i });
  }
  const real = h.store.changes();
  assert.equal(real.length, TOTAL);
  real.forEach((c, i) => { expected[i].id = c.id; });
  // Los IDs reales (no 1..122) son parte del fixture: confirman que no se asume numeración desde 1.
  assert.ok(real[0].id > WARMUP, 'los IDs de historial continúan tras la sustitución: ' + real[0].id);
  return { h, real, expected };
}
const idsOf = (page: { items: { id: number }[] }) => page.items.map(c => c.id);

test('H1 las 122 operaciones se alcanzan por páginas de 20 sin saltos ni duplicados, más recientes primero', async () => {
  const { h, real, expected } = await build();
  try {
    const seen: number[] = []; let page = 0, guard = 0, last: any;
    for (;;) {
      const r = historyPage(real, { page, size: 20 }); last = r;
      assert.equal(r.total, TOTAL); assert.equal(r.pages, Math.ceil(TOTAL / 20)); assert.equal(r.page, page);
      assert.equal(r.start, page * 20 + 1); assert.equal(r.end, Math.min(page * 20 + 20, TOTAL));
      assert.equal(r.items.length, r.end - r.start + 1); seen.push(...idsOf(r));
      if (!r.hasMore) break; page++; assert.ok(++guard < 20, 'paginación sin fin');
    }
    const newestFirst = expected.map(e => e.id).reverse();
    assert.deepEqual(seen, newestFirst, 'recorrido completo = historial invertido, sin saltos ni duplicados');
    assert.equal(new Set(seen).size, TOTAL); assert.equal(last.items.length, TOTAL % 20); assert.equal(last.hasMore, false);
    assert.equal(seen[0], expected[TOTAL - 1].id, 'la primera de la lista es la última operación'); assert.equal(seen.at(-1), expected[0].id, 'la última página termina en la primera operación');
    assert.equal(historyPage(real).counts.all, TOTAL);
    const viaApi = (await h.app.inject({ url: '/api/v2/changes' })).json();
    assert.equal(viaApi.changes.length, TOTAL, 'la API entrega las 122 sin recortar'); assert.deepEqual(viaApi.changes.map((c: any) => c.id), expected.map(e => e.id));
  } finally { await h.app.close(); }
});

test('H2 al reducir el filtro una página antigua se ajusta; parámetros fuera de rango se rechazan', async () => {
  const { h, real, expected } = await build();
  try {
    const wide = historyPage(real, { page: 6 }); assert.equal(wide.page, 6); assert.equal(wide.items.length, 2);
    const companiesOps = expected.filter(e => e.entity === 'companies');
    assert.ok(companiesOps.length > 20 && companiesOps.length < 100, 'precondición del fixture');
    const narrow = historyPage(real, { entity: 'companies', page: 6 });
    assert.equal(narrow.total, companiesOps.length); assert.equal(narrow.page, narrow.pages - 1, 'página pedida 6 → última válida');
    assert.ok(narrow.items.length > 0, 'nunca una página vacía con resultados');
    const empty = historyPage(real, { query: 'zzz-no-existe-73', page: 5 });
    assert.deepEqual({ t: empty.total, p: empty.pages, page: empty.page, s: empty.start, e: empty.end, m: empty.hasMore }, { t: 0, p: 1, page: 0, s: 0, e: 0, m: false });
    for (const bad of [{ page: -1 }, { page: 1.5 }, { page: Number.NaN }, { page: Number.MAX_SAFE_INTEGER + 2 }, { size: 0 }, { size: 51 }, { size: 2.5 }, { watermark: -1 }, { query: 'x'.repeat(201) }])
      assert.throws(() => historyPage(real, bad as any), RangeError, JSON.stringify(bad).slice(0, 40));
    for (const bad of [{ entity: 'owners' }, { operation: 'delete' }, { scope: 'remote' }]) assert.throws(() => historyPage(real, bad as any), TypeError, JSON.stringify(bad));
    assert.doesNotThrow(() => historyPage(real, { query: 'x'.repeat(200), size: 50 }));
  } finally { await h.app.close(); }
});

test('H3 entidad, operación, marca y términos de búsqueda se componen igual que un filtro de fuerza bruta propio', async () => {
  const { h, real, expected } = await build();
  try {
    const W = expected[WATERMARK_INDEX].id;
    const haystack = (e: Expected) => fold([String(e.id), e.recordId, ...Object.keys({ ...e.before, ...e.after }), ...Object.values(e.before ?? {}).map(String), ...Object.values(e.after).map(String)].join(' '));
    const brute = (o: { entity?: string; operation?: string; scope?: string; terms?: string[] }) => expected.filter(e =>
      (!o.entity || e.entity === o.entity) && (!o.operation || e.operation === o.operation) &&
      (o.scope === 'pending' ? e.id > W : o.scope === 'marked' ? e.id <= W : true) && (o.terms ?? []).every(t => haystack(e).includes(fold(t)))).map(e => e.id).sort((a, b) => b - a);
    const everything = (o: Parameters<typeof historyPage>[1]) => { const out: number[] = []; for (let p = 0; ; p++) { const r = historyPage(real, { ...o, page: p, size: 50, watermark: W }); out.push(...idsOf(r)); if (!r.hasMore) return out; } };
    const unique = expected.filter(e => e.entity === 'contacts' && e.after.lastname === 'ZetaUnica73')[0];
    const cases: { name: string; o: any; brute: any }[] = [
      { name: 'solo entidad', o: { entity: 'contacts' }, brute: { entity: 'contacts' } },
      { name: 'solo operación', o: { operation: 'create' }, brute: { operation: 'create' } },
      { name: 'solo marca pendiente', o: { scope: 'pending' }, brute: { scope: 'pending' } },
      { name: 'solo marca incluida', o: { scope: 'marked' }, brute: { scope: 'marked' } },
      { name: 'entidad+operación', o: { entity: 'contacts', operation: 'update' }, brute: { entity: 'contacts', operation: 'update' } },
      { name: 'entidad+marca', o: { entity: 'companies', scope: 'marked' }, brute: { entity: 'companies', scope: 'marked' } },
      { name: 'operación+marca', o: { operation: 'create', scope: 'pending' }, brute: { operation: 'create', scope: 'pending' } },
      { name: 'las tres + término de campo', o: { entity: 'contacts', operation: 'update', scope: 'marked', query: 'phone' }, brute: { entity: 'contacts', operation: 'update', scope: 'marked', terms: ['phone'] } },
      { name: 'término de campo', o: { query: 'lastname' }, brute: { terms: ['lastname'] } },
      { name: 'valor único', o: { query: 'zetaunica73' }, brute: { terms: ['zetaunica73'] } },
      { name: 'dos términos (AND)', o: { query: 'lastname zetaunica73' }, brute: { terms: ['lastname', 'zetaunica73'] } },
      { name: 'acentos y mayúsculas', o: { query: 'ULTIMO nandu' }, brute: { terms: ['ULTIMO', 'nandu'] } },
      { name: 'términos repetidos y espacios', o: { query: '  zetaunica73   ZETAUNICA73 ' }, brute: { terms: ['zetaunica73'] } },
      { name: 'antes (valor anterior)', o: { query: 'zetaunica73 lastname' }, brute: { terms: ['zetaunica73', 'lastname'] } },
    ];
    for (const c of cases) {
      const got = everything(c.o), want = brute(c.brute);
      assert.deepEqual(got, want, c.name + ': ' + got.length + ' vs ' + want.length);
      assert.ok(want.length > 0 || c.name === 'ninguno', c.name + ': el caso debe tener resultados para ser informativo');
    }
    assert.equal(everything({ query: 'zetaunica73' }).length, 1, 'el término único identifica una sola operación');
    assert.deepEqual(everything({ query: 'zetaunica73' }), [unique.id]);
    // Valor anterior vs. actual: la operación posterior sobre contact-1 contiene el teléfono anterior de la anterior.
    const c1 = expected.filter(e => e.recordId === 'contact-1');
    assert.ok(c1.length >= 3, 'varias operaciones sobre la misma ficha'); assert.ok(c1[1].before!.phone === c1[0].after.phone);
    assert.ok(everything({ query: String(c1[0].after.phone) }).includes(c1[1].id), 'la búsqueda también encuentra una operación por su valor ANTERIOR');
    // Recall con términos numéricos: una operación siempre se encuentra por su ID y por su valor (la precisión se estudia en H3b).
    assert.ok(everything({ query: String(unique.id) }).includes(unique.id), 'recall por ID');
    assert.ok(everything({ query: String(c1[0].after.phone) }).includes(c1[0].id), 'recall por valor numérico en texto');
  } finally { await h.app.close(); }
});

// LÍMITE CONOCIDO de H3b: solo falla con el baseline cuando los dígitos del ID de operación elegido aparecen por azar en las marcas de tiempo de esa ejecución (observado: una de dos ejecuciones
// contra baseline075 pasó). La sensibilidad determinista la aportan H3d (cifra del año = ID de operación), H3c y H9.
test('H3b QA073-H1 (corregido en QA079): buscar un número de ID no devuelve operaciones solo porque su fecha ISO contiene esos dígitos', async () => {
  const { h, real, expected } = await build();
  try {
    const W = expected[WATERMARK_INDEX].id;
    const target = expected.find(e => e.entity === 'contacts' && e.after.lastname === 'ZetaUnica73')!;
    // Oráculo de precisión: operaciones cuyo ID, ficha o valores contienen el número buscado (como texto), sin fechas.
    const term = String(target.id);
    const want = expected.filter(e => [String(e.id), e.recordId, ...Object.keys({ ...e.before, ...e.after }), ...Object.values(e.before ?? {}).map(String), ...Object.values(e.after).map(String)].join(' ').includes(term)).map(e => e.id).sort((a, b) => b - a);
    const got: number[] = []; for (let p = 0; ; p++) { const r = historyPage(real, { query: term, page: p, size: 50, watermark: W }); got.push(...idsOf(r)); if (!r.hasMore) break; }
    assert.deepEqual(got, want, 'sobran ' + got.filter(i => !want.includes(i)).length + ' operaciones cuya fecha contiene «' + term + '»');
  } finally { await h.app.close(); }
});

test('H4 filtrar no cambia ni clona los objetos del historial y conserva el orden estable', async () => {
  const { h, real } = await build();
  try {
    const frozen = JSON.stringify(real), refs = real.slice();
    const r = historyPage(real, { entity: 'contacts', operation: 'update', page: 0 });
    for (const item of r.items) assert.ok(refs.includes(item), 'la ficha devuelta es la misma referencia que la de entrada');
    assert.equal(JSON.stringify(real), frozen, 'el historial de entrada no cambia'); assert.deepEqual(real, refs);
    for (let p = 0; p < 7; p++) historyPage(real, { page: p, query: 'a' });
    assert.equal(JSON.stringify(real), frozen);
    // Empates de ID (entrada con un duplicado defectuoso): el orden relativo original se conserva.
    const twin = { ...real[10], recordId: 'duplicado-a' }, twin2 = { ...real[10], recordId: 'duplicado-b' };
    const tied = historyPage([twin, twin2] as any, { size: 50 });
    assert.deepEqual(tied.items.map((c: any) => c.recordId), ['duplicado-a', 'duplicado-b']);
    const solo = historyPage(Object.freeze([...real]) as any, { page: 1 });
    assert.equal(solo.items.length, 20, 'una entrada de solo lectura (congelada) es válida');
  } finally { await h.app.close(); }
});

test('H5 ausente, null, vacío, 0, false, número y texto con dígitos son valores distintos; update compara con el estado anterior y create no inventa uno', async () => {
  const { h, real, expected } = await build();
  try {
    const rec = (values: Record<string, unknown>) => ({ entity: 'contacts', id: 'x', values }) as any;
    const mk = (before: Record<string, unknown> | null, after: Record<string, unknown>) => ({ id: 1, at: '2026-10-30T00:00:00.000Z', entity: 'contacts', recordId: 'x', operation: before ? 'update' : 'create', before: before ? rec(before) : null, after: rec(after) }) as any;
    const diff = (b: Record<string, unknown> | null, a: Record<string, unknown>) => Object.fromEntries(changedFields(mk(b, a)).map(f => [f.key, [f.before, f.after]]));
    const absent = { present: false } as const, has = (value: unknown) => ({ present: true, value });
    assert.deepEqual(diff({}, { k: null }), { k: [absent, has(null)] }, 'ausente → null cambia');
    assert.deepEqual(diff({ k: null }, {}), { k: [has(null), absent] }, 'null → ausente cambia');
    assert.deepEqual(diff({ k: null }, { k: '' }), { k: [has(null), has('')] }, 'null → vacío');
    assert.deepEqual(diff({ k: '' }, { k: 0 }), { k: [has(''), has(0)] }, "'' → 0");
    assert.deepEqual(diff({ k: 0 }, { k: false }), { k: [has(0), has(false)] }, '0 → false');
    assert.deepEqual(diff({ k: false }, { k: null }), { k: [has(false), has(null)] }, 'false → null');
    assert.deepEqual(diff({ k: '12' }, { k: 12 }), { k: [has('12'), has(12)] }, "'12' → 12 (texto vs número)");
    assert.deepEqual(diff({ k: 12 }, { k: '12' }), { k: [has(12), has('12')] });
    assert.deepEqual(diff({ k: 'a', z: 1 }, { k: 'a', z: 1 }), {}, 'valores idénticos no producen diferencia');
    assert.deepEqual(diff({ k: null }, { k: null }), {}, 'null = null'); assert.deepEqual(diff({ k: 0 }, { k: 0 }), {}, '0 = 0'); assert.deepEqual(diff({ k: false }, { k: false }), {}, 'false = false');
    assert.deepEqual(diff(null, { a: 1, b: null, c: '' }), { a: [absent, has(1)], b: [absent, has(null)], c: [absent, has('')] }, 'un alta no inventa estado previo: todo "antes" es ausente');
    assert.deepEqual(changedFields(mk(null, { b: 1, a: 2 })).map(f => f.key), ['a', 'b'], 'orden estable por clave');
    // update real: el "antes" de la operación n es el "después" de la n-1 sobre la misma ficha.
    const c1 = real.filter(c => c.recordId === 'contact-1');
    for (let i = 1; i < c1.length; i++) {
      const f = changedFields(c1[i]).find(x => x.key === 'phone')!;
      assert.deepEqual(f.before, has(expected.filter(e => e.recordId === 'contact-1')[i - 1].after.phone), 'antes de la operación ' + c1[i].id);
      assert.deepEqual(f.after, has(expected.filter(e => e.recordId === 'contact-1')[i].after.phone));
      assert.deepEqual(changedFields(c1[i]).map(x => x.key), ['phone'], 'solo cambia el teléfono');
    }
    const created = real.find(c => c.operation === 'create')!;
    assert.equal(created.before, null);
    assert.ok(changedFields(created).every(f => f.before.present === false), 'alta real: ningún campo "antes"');
    assert.ok(changedFields(created).some(f => f.key === 'email' && f.after.present && f.after.value === (expected.find(e => e.id === created.id)!.after.email)));
    // Búsqueda: null, 0 y false son términos distintos sobre datos tipados.
    const typed = [mk({ a: null }, { a: 0 }), { ...mk({ a: 0 }, { a: false }), id: 2 }, { ...mk({ a: false }, { a: '' }), id: 3 }, { ...mk({ a: '' }, { a: 'null' }), id: 4 }];
    assert.deepEqual(historyPage(typed, { query: 'false', size: 50 }).items.map((c: any) => c.id).sort(), [2, 3], 'false aparece en antes/después de 2 y 3');
    assert.deepEqual(historyPage(typed, { query: 'null', size: 50 }).items.map((c: any) => c.id).sort(), [1, 4], "null (valor) y 'null' (texto) coinciden por texto; no se pretende distinguirlos en la búsqueda");
  } finally { await h.app.close(); }
});

test('H6 valores largos con Unicode se conservan íntegros y se pueden buscar por su cola', async () => {
  const { h } = await build();
  try {
    const tail = 'cola-única-ß-ŉ-🇪🇸-' + 'Ω'.repeat(30), long = ('Año 😀 é ' + 'x'.repeat(400) + ' ').repeat(14) + tail;
    assert.ok(long.length > 5000);
    const change = { id: 9, at: '2026-10-30T00:00:00.000Z', entity: 'contacts', recordId: 'u', operation: 'update', before: { entity: 'contacts', id: 'u', values: { notes: 'corto' } }, after: { entity: 'contacts', id: 'u', values: { notes: long } } } as any;
    const field = changedFields(change)[0];
    assert.equal(field.after.present && field.after.value, long, 'el valor mostrable es el valor completo, sin vista previa recortada');
    assert.deepEqual(historyPage([change], { query: 'COLA-ÚNICA-ß' }).items, [change], 'búsqueda por la cola con mayúsculas y acentos');
    assert.deepEqual(historyPage([change], { query: 'cola-unica' }).items, [change], 'sin acentos también');
    assert.equal(historyPage([change], { query: 'cola-inexistente' }).total, 0);
  } finally { await h.app.close(); }
});

test('H7 la marca de devolución es un límite exacto de lo incluido; no fabrica verificación remota', async () => {
  const { h, real, expected } = await build();
  try {
    const W = expected[WATERMARK_INDEX].id;
    const at = historyPage(real, { watermark: W });
    assert.deepEqual(at.counts, { all: TOTAL, pending: TOTAL - (WATERMARK_INDEX + 1), marked: WATERMARK_INDEX + 1, create: expected.filter(e => e.operation === 'create').length, update: expected.filter(e => e.operation === 'update').length });
    assert.equal(historyPage(real, { watermark: W, scope: 'marked', size: 50 }).items.some(c => c.id === W), true, 'la operación EXACTA en la marca está incluida');
    assert.equal(historyPage(real, { watermark: W, scope: 'pending', size: 50 }).items.some(c => c.id === W), false);
    const pendingIds = [0, 1].flatMap(p => idsOf(historyPage(real, { watermark: W, scope: 'pending', size: 50, page: p })));
    assert.equal(pendingIds.length, TOTAL - (WATERMARK_INDEX + 1)); assert.equal(pendingIds.at(-1), expected[WATERMARK_INDEX + 1].id, 'la siguiente operación es la primera pendiente');
    assert.equal(historyPage(real, { watermark: 0 }).counts.pending, TOTAL); assert.equal(historyPage(real, { watermark: expected[TOTAL - 1].id }).counts.pending, 0);
    assert.equal(historyPage(real, { watermark: expected[TOTAL - 1].id + 1000 }).counts.marked, TOTAL);
    // La marca es solo un límite local: ninguna salida habla de verificación, simulación o disponibilidad remota.
    assert.deepEqual(Object.keys(at).sort(), ['counts', 'end', 'hasMore', 'items', 'page', 'pages', 'start', 'total']);
    assert.doesNotMatch(JSON.stringify(at.counts), /verif|remote|hubspot/i);
    // Y el servidor devuelve la marca almacenada tal cual, sin avanzarla al consultar.
    h.store.set('returnWatermark:hubspot', W);
    const api = (await h.app.inject({ url: '/api/v2/changes' })).json();
    assert.equal(api.watermark, W); assert.equal(api.pendingChanges, TOTAL - (WATERMARK_INDEX + 1));
    assert.equal(h.store.get('returnWatermark:hubspot', 0), W, 'consultar no mueve la marca');
  } finally { await h.app.close(); }
});

test('H8 consultar, buscar y paginar es local: ninguna escritura en el almacén, ninguna petición de red, ningún POST', async () => {
  const { h, real } = await build();
  const realFetch = globalThis.fetch; let fetchCalls = 0;
  globalThis.fetch = (async () => { fetchCalls++; throw new Error('red prohibida en QA073'); }) as any;
  try {
    const totalChanges = () => (h.store.db.prepare('SELECT total_changes() AS n').get() as { n: number }).n;
    const origin = () => JSON.stringify({ bundle: { ...h.store.bundle(), exportedAt: 'ignorado' }, meta: h.store.db.prepare('SELECT key,value FROM meta ORDER BY key').all(), n: (h.store.db.prepare('SELECT COUNT(*) AS n FROM changes').get() as { n: number }).n });
    const before = origin(), writesBefore = totalChanges();
    for (let p = 0; p < 7; p++) historyPage(real, { page: p, query: p % 2 ? 'phone' : '', scope: 'pending', watermark: real[40].id });
    for (const q of ['lastname', '700', 'zzz']) historyPage(real, { query: q, entity: 'contacts', operation: 'update' });
    for (const url of ['/api/v2/changes', '/api/v2/changes']) assert.equal((await h.app.inject({ url })).statusCode, 200);
    assert.equal(totalChanges(), writesBefore, 'SQLite no registró ninguna escritura (total_changes)');
    assert.equal(origin(), before, 'el estado de origen es idéntico antes y después');
    assert.equal(fetchCalls, 0);
  } finally { globalThis.fetch = realFetch; await h.app.close(); }
});

// Oráculo de contrato escrito aquí (fuerza bruta, sin llamar a historyPage): texto buscable = ID de operación, ID de ficha, entidad, operación, nombres de campo y valores antes/después. NO la fecha.
const contractText = (e: { id: number; entity: string; recordId: string; operation: string; before: Record<string, unknown> | null; after: Record<string, unknown> }) =>
  fold([String(e.id), e.entity, e.recordId, e.operation, ...Object.entries(e.before ?? {}).flatMap(([k, v]) => [k, v === null ? 'null' : String(v)]), ...Object.entries(e.after).flatMap(([k, v]) => [k, v === null ? 'null' : String(v)])].join(' '));

test('H9 contrato QA079: la búsqueda coincide con ID, ficha, entidad, operación, campo y valores, y NO con la fecha presentada (el año ya no devuelve todo el historial)', async () => {
  const { h, real, expected } = await build();
  try {
    const year = new Date(real[0].at).getUTCFullYear().toString(), day = real[0].at.slice(0, 10);
    for (const term of [year, day, real[0].at.slice(0, 7)]) {
      const want = expected.filter(e => contractText(e).includes(term)).map(e => e.id).sort((a, b) => b - a), got = historyPage(real, { query: term, size: 50 });
      assert.deepEqual(got.items.map(i => i.id), want.slice(0, 50), 'consulta «' + term + '»: solo las operaciones cuyo ID/campo/valores la contienen'); assert.equal(got.total, want.length);
      assert.ok(got.total < real.length, 'el término «' + term + '» ya no devuelve todo el historial (' + got.total + ' de ' + real.length + '): la fecha no se indexa');
    }
    // Metadatos operativos admitidos: entidad y operación siguen siendo buscables (se contrastan con el oráculo, no con una constante).
    for (const term of ['contacts', 'update', 'create', 'tasks']) {
      const want = expected.filter(e => contractText(e).includes(term)).length, got = historyPage(real, { query: term, size: 50 });
      assert.equal(got.total, want, 'metadato «' + term + '»'); assert.ok(got.total > 0, 'metadato «' + term + '» encuentra algo');
    }
    console.log('QA079-H9 año «' + year + '»=' + historyPage(real, { query: year, size: 50 }).total + ' de ' + real.length + '; día «' + day + '»=' + historyPage(real, { query: day, size: 50 }).total);
  } finally { await h.app.close(); }
});

test('H3d QA079 (determinista): una cifra que ESTÁ en la fecha presentada (las dos últimas del año) y es ID de una operación solo devuelve operaciones por su ID/ficha/valores', async () => {
  // H3b depende de que los dígitos del ID aparezcan por azar en la marca de tiempo; aquí la cifra es la del año, que siempre figura en `at`, y debe ser ID de una operación real.
  const { h, real, expected } = await build();
  try {
    const yy = String(new Date(real[0].at).getUTCFullYear() % 100);
    assert.ok(expected.some(e => String(e.id) === yy), 'precondición: «' + yy + '» es el ID de una operación del fixture (IDs ' + expected[0].id + '–' + expected.at(-1)!.id + ')');
    const want = expected.filter(e => contractText(e).includes(yy)).map(e => e.id).sort((a, b) => b - a);
    assert.ok(want.length < real.length && real.every(c => c.at.includes(yy)), 'control no vacío: TODAS las fechas contienen «' + yy + '» pero solo ' + want.length + ' operaciones lo contienen en ID/ficha/valores');
    const got: number[] = []; for (let p = 0; ; p++) { const r = historyPage(real, { query: yy, page: p, size: 50 }); got.push(...r.items.map(i => i.id)); if (!r.hasMore) break; }
    assert.deepEqual(got, want, 'sobran ' + got.filter(i => !want.includes(i)).length + ' operaciones que solo coinciden por su fecha');
  } finally { await h.app.close(); }
});

test('H9a CARACTERIZACIÓN HISTÓRICA (no es garantía): el corte baseline075 devolvía todo el historial al buscar el año; el corte actual no', async t => {
  const BASELINE = process.env.QA079_BASELINE_ROOT ? path.resolve(process.env.QA079_BASELINE_ROOT) : path.resolve(fileURLToPath(new URL('..', import.meta.url)), 'tests/.tmp/qa075-d90acf90-f891-4979-be03-376b0a4f31e4/source');
  // Sin QA079_BASELINE_ROOT, la copia por defecto vive en tests/.tmp, que git no guarda: un clon nuevo no la tiene. Se salta; H3c, H3d y H9 siguen cubriendo el contrato.
  if (!process.env.QA079_BASELINE_ROOT && !fs.existsSync(path.join(BASELINE, 'shared/change-history.ts'))) { t.skip('sin copia del corte baseline075 en este equipo (defínela con QA079_BASELINE_ROOT)'); return; }
  assert.ok(fs.existsSync(path.join(BASELINE, 'shared/change-history.ts')), 'falta la copia del corte baseline075 en ' + BASELINE + ' (defínela con QA079_BASELINE_ROOT)');
  const old = await import(pathToFileURL(path.join(BASELINE, 'shared/change-history.ts')).href) as typeof import('../shared/change-history.js');
  const { h, real } = await build();
  try {
    const year = new Date(real[0].at).getUTCFullYear().toString(), before = old.historyPage(real, { query: year, size: 50 }), after = historyPage(real, { query: year, size: 50 });
    const digest = (root: string) => createHash('sha256').update(fs.readFileSync(path.join(root, 'shared/change-history.ts'))).digest('hex'), sameSources = digest(BASELINE) === digest(ROOT);   // contenido idéntico (p. ej. al ejecutar el banco contra el baseline): solo se afirma la caracterización
    assert.equal(before.total, real.length, 'baseline075: buscar el año devolvía los ' + real.length + ' registros (la fecha estaba indexada)');
    if (!sameSources) assert.ok(after.total < before.total, 'el corte actual devuelve menos (' + after.total + ') que el baseline (' + before.total + ')');
    console.log('QA079-H9a baseline075 año=' + before.total + ' vs actual=' + after.total + ' de ' + real.length);
  } finally { await h.app.close(); }
});

test('H3c QA079: números presentes legítimamente en valores, campos o IDs se siguen encontrando; la misma cifra solo en la fecha no', async () => {
  const h = await createBaseApp({ dbPath: ':memory:', root: '.', staticDir: 'none' }), snapshot = makeFixture('agency'); h.store.importSnapshot(snapshot); h.store.saveGeneration(makeDemoSpec(snapshot), GEN); h.store.activate();
  try {
    const date = new Date().toISOString().slice(0, 10), digits = date.replace(/-/g, '');           // p. ej. 2026-11-01 → 20261101: aparece en `at`, no en ningún valor
    h.store.saveRecord('contacts', { phone: '+34 ' + date.slice(0, 4) + ' 555 019' }, 'contact-1');  // el año ES un valor legítimo de un teléfono
    h.store.saveRecord('contacts', { phone: '700 ' + digits.slice(4) + ' 121' }, 'contact-2');          // mes+día (p. ej. 1101) también es un valor legítimo
    h.store.saveRecord('tasks', { notes: 'sin cifras de fecha' }, 'task-1');
    const real = h.store.changes() as any[], got = (query: string) => historyPage(real, { query, size: 50 }).items.map(i => i.id).sort((x, y) => x - y);
    const idOf = (recordId: string) => real.find(c => c.recordId === recordId)!.id as number;
    // Oráculo propio: texto de contenido = ID, ficha, entidad, operación, campos y valores antes/después (sin fecha). «Solo fecha» = la cifra está en `at` y en nada más.
    const content = (c: any) => fold([String(c.id), c.entity, c.recordId, c.operation, ...Object.entries(c.before?.values ?? {}).flat().map(String), ...Object.entries(c.after.values).flat().map(String)].join(' '));
    const byContent = (term: string) => real.filter(c => content(c).includes(fold(term))).map(c => c.id as number).sort((x, y) => x - y), dateOnly = (term: string) => real.filter(c => !content(c).includes(fold(term)) && fold(c.at).includes(fold(term))).map(c => c.id as number);
    for (const term of [date.slice(0, 4), digits.slice(4), date, date.slice(0, 7)]) { assert.deepEqual(got(term), byContent(term), 'consulta «' + term + '»: exactamente las operaciones cuyo contenido la incluye'); }
    assert.ok(got(date.slice(0, 4)).includes(idOf('contact-1')), 'el año ES un valor legítimo del teléfono de contact-1: se encuentra');
    assert.ok(got(digits.slice(4)).includes(idOf('contact-2')), 'mes+día legítimos en un valor se encuentran');
    for (const term of [date, date.slice(0, 7)]) { const only = dateOnly(term); assert.ok(only.length > 0, 'control no vacío: hay operaciones cuya única coincidencia sería la fecha («' + term + '»)'); assert.deepEqual(only.filter(id => got(term).includes(id)), [], 'ninguna de ellas se devuelve'); }
    assert.deepEqual(got(date.slice(0, 4) + ' 555'), [idOf('contact-1')], 'dos términos: todos deben cumplirse');
    assert.ok(got(String(idOf('contact-2'))).includes(idOf('contact-2')), 'el ID de operación sigue siendo buscable'); assert.equal(got('phone').length, 2, 'nombre de campo');
  } finally { await h.app.close(); }
});
