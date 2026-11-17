// CLAUDE-PERF-STORE-RECORDS · La lectura de registros no vuelve a descifrar lo que ya descifró,
// sin servir nunca contenido antiguo ni compartir objetos entre llamadas.
// Almacén cifrado real en una carpeta temporal propia, con datos ficticios.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Store, AppError } from '../server/store.js';
import { makeFixture, makeDemoSpec } from '../shared/fixtures.js';
import { MAX_RECORDS, type CrmRecord, type CrmSnapshot } from '../shared/model.js';

const TMP = path.resolve('tests/.tmp');

/** Almacén cifrado en carpeta propia. Al terminar, cierra primero y borra después (Windows no borra una base abierta). */
function encrypted(t: test.TestContext, snapshot?: CrmSnapshot): { store: Store; file: string } {
  fs.mkdirSync(TMP, { recursive: true });
  const dir = fs.mkdtempSync(path.join(TMP, 'store-records-cache-')), file = path.join(dir, 'planb.sqlite');
  const store = seed(new Store(file), snapshot);
  t.after(() => { try { store.close(); } catch { /* ya cerrado */ } fs.rmSync(dir, { recursive: true, force: true }); });
  return { store, file };
}

function seed(store: Store, snapshot: CrmSnapshot = makeFixture()): Store {
  store.importSnapshot(snapshot);
  store.saveGeneration(makeDemoSpec(snapshot), { provider: 'demo', model: null, generatedAt: snapshot.capturedAt, prompt: '', approved: false });
  store.activate();
  return store;
}

/** Lo que la tabla contiene de verdad, descifrado fila a fila sin pasar por la caché. */
function direct(store: Store, entity?: string): CrmRecord[] {
  const rows = (entity
    ? store.db.prepare('SELECT value FROM records WHERE entity=? ORDER BY rowid').all(entity)
    : store.db.prepare('SELECT value FROM records ORDER BY rowid').all()) as { value: string }[];
  return rows.map(row => store.decode<CrmRecord>(row.value));
}

function cacheSize(store: Store): number {
  const cache = (store as unknown as { plainCache?: Map<string, string> }).plainCache;
  assert.ok(cache instanceof Map, 'el almacén expone su caché de texto descifrado');
  return cache.size;
}

/** Instantánea ficticia con un número exacto de registros (sin relaciones, recuentos coherentes). */
function sized(total: number): CrmSnapshot {
  const base = makeFixture();
  const records: CrmRecord[] = [];
  for (let round = 0; records.length < total; round++) for (const record of base.records) {
    if (records.length >= total) break;
    records.push({ ...record, id: round === 0 ? record.id : record.id + '-r' + round, values: { ...record.values } });
  }
  const expectedCounts: Record<string, number> = {};
  for (const record of records) expectedCounts[record.entity] = (expectedCounts[record.entity] ?? 0) + 1;
  return { ...base, records, links: [], manifest: { ...base.manifest, expectedCounts, expectedLinks: 0 } };
}

test('las lecturas coinciden con descifrar la tabla directamente, en frío y en caliente', t => {
  const { store } = encrypted(t);
  assert.ok((store.db.prepare('SELECT value FROM records LIMIT 1').get() as { value: string }).value.startsWith('enc1:'), 'la tabla está cifrada');
  for (let pass = 0; pass < 2; pass++) {
    assert.deepEqual(store.records(), direct(store));
    for (const entity of ['contacts', 'companies', 'deals', 'tasks']) assert.deepEqual(store.records(entity as never), direct(store, entity));
  }
});

test('cada llamada devuelve objetos nuevos: modificar uno no altera la siguiente lectura', t => {
  const { store } = encrypted(t);
  const first = store.records('contacts');
  const original = first[0].values.firstname;
  first[0].values.firstname = 'MUTADO-EN-MEMORIA';
  first.pop();
  const again = store.records('contacts');
  assert.equal(again[0].values.firstname, original);
  assert.equal(again.length, direct(store, 'contacts').length);
  assert.notEqual(store.page('contacts', '', 0, 50).records[0].values.firstname, 'MUTADO-EN-MEMORIA');
});

test('un cambio hecho por otra conexión al mismo archivo se ve en la siguiente lectura', t => {
  const { store: reader, file } = encrypted(t);
  const target = reader.records('contacts')[0];
  assert.ok(cacheSize(reader) > 0 || reader.records().length > 0);
  reader.records(); // la caché queda caliente

  const writer = new Store(file);
  try { writer.saveRecord('contacts', { ...target.values, phone: '600 000 351' }, target.id); }
  finally { writer.close(); }

  assert.equal(reader.records('contacts').find(r => r.id === target.id)?.values.phone, '600 000 351');
  assert.equal(reader.page('contacts', '600 000 351', 0, 50).total, 1);
  assert.deepEqual(reader.records(), direct(reader));
});

test('los cambios propios, altas y sustituciones completas se ven al momento', t => {
  const { store } = encrypted(t);
  store.records();
  const target = store.records('tasks')[0];
  store.saveRecord('tasks', { ...target.values, subject: 'Editada por la prueba 351' }, target.id);
  const created = store.saveRecord('contacts', { firstname: 'Alta', email: 'alta.prueba@example.com' });
  assert.equal(store.records('tasks').find(r => r.id === target.id)?.values.subject, 'Editada por la prueba 351');
  assert.ok(store.records('contacts').some(r => r.id === created.id));
  assert.deepEqual(store.records(), direct(store));

  // Con la copia activa, sustituir pasa por candidata y activación: la tabla se vacía y se rellena.
  const smaller = sized(60);
  store.importSnapshot(smaller, true);
  store.saveGeneration(makeDemoSpec(smaller), { provider: 'demo', model: null, generatedAt: smaller.capturedAt, prompt: '', approved: false });
  store.activate();
  assert.equal(store.records().length, 60);
  assert.deepEqual(store.records(), direct(store));
});

test('la caché respeta sus topes de entradas y de caracteres sin perder exactitud', t => {
  const { store } = encrypted(t);
  const limits = store as unknown as { plainCacheLimit: { entries: number; chars: number; entry: number }; plainCacheChars: number };
  const total = store.records().length;
  assert.ok(cacheSize(store) >= total, 'una lectura completa deja en caché todos los registros');

  limits.plainCacheLimit = { entries: 20, chars: Number.MAX_SAFE_INTEGER, entry: Number.MAX_SAFE_INTEGER };
  const target = store.records('contacts')[0];
  for (let i = 0; i < 25; i++) store.saveRecord('contacts', { ...target.values, phone: 'tope-' + i }, target.id);
  assert.deepEqual(store.records(), direct(store));
  assert.ok(cacheSize(store) <= 20, 'nunca supera el tope de entradas');

  limits.plainCacheLimit = { entries: Number.MAX_SAFE_INTEGER, chars: 6_000, entry: Number.MAX_SAFE_INTEGER };
  assert.deepEqual(store.records(), direct(store));
  assert.ok(limits.plainCacheChars <= 6_000, 'nunca supera el tope de caracteres');
  const charsNow = [...(store as unknown as { plainCache: Map<string, string> }).plainCache].reduce((n, [k, v]) => n + k.length + v.length, 0);
  assert.equal(limits.plainCacheChars, charsNow, 'la contabilidad de caracteres coincide con el contenido');
});

test('una fila manipulada en disco no se sirve desde la caché: falla igual que antes', t => {
  const { store } = encrypted(t);
  const target = store.records('contacts')[0];
  store.records();
  const row = store.db.prepare('SELECT value FROM records WHERE entity=? AND id=?').get('contacts', target.id) as { value: string };
  const bytes = Buffer.from(row.value.slice(5), 'base64'); bytes[bytes.length - 1] ^= 0xff;
  store.db.prepare('UPDATE records SET value=? WHERE entity=? AND id=?').run('enc1:' + bytes.toString('base64'), 'contacts', target.id);
  assert.throws(() => store.records('contacts'));
  assert.throws(() => store.record('contacts', target.id));
});

test('un almacén en memoria (sin cifrado) se comporta igual que antes', () => {
  const store = seed(new Store(':memory:'));
  try {
    assert.deepEqual(store.records(), direct(store));
    const a = store.records('contacts'); a[0].values.firstname = 'X';
    assert.notEqual(store.records('contacts')[0].values.firstname, 'X');
  } finally { store.close(); }
});

test('los relacionados de una página son los registros referenciados, sin duplicados', t => {
  const { store } = encrypted(t);
  const page = store.page('contacts', '', 0, 50);
  const all = direct(store);
  const expected = new Map<string, CrmRecord>();
  for (const record of page.records) {
    const companyId = record.values.company_id;
    const company = companyId ? all.find(r => r.entity === 'companies' && r.id === companyId) : undefined;
    if (company) expected.set(company.entity + ':' + company.id, company);
  }
  assert.ok(expected.size > 0, 'el fixture tiene clientes con empresa');
  assert.deepEqual(new Set(page.related.map(r => r.entity + ':' + r.id)), new Set(expected.keys()));
  assert.equal(page.related.length, expected.size);
});

test(`el límite de ${MAX_RECORDS} registros se conserva al contar sin descifrar`, t => {
  const { store } = encrypted(t, sized(MAX_RECORDS));
  assert.equal(store.db.prepare('SELECT COUNT(*) AS n FROM records').get()!.n, MAX_RECORDS);
  assert.throws(() => store.saveRecord('contacts', { firstname: 'Sobra', email: 'sobra@example.com' }),
    (error: unknown) => error instanceof AppError && error.status === 413);
  const existing = store.records('contacts')[0];
  assert.doesNotThrow(() => store.saveRecord('contacts', { ...existing.values, phone: '600 000 352' }, existing.id));
});

// Revisión independiente (14/11): recencia LRU, tope por entrada y olvido tras sustituir la tabla.
type CacheView = { plainCache: Map<string, string>; plainCacheChars: number; plainCacheLimit: { entries: number; chars: number; entry: number } };
const view = (store: Store) => store as unknown as CacheView;
const cipherOf = (store: Store, entity: string, id: string) =>
  (store.db.prepare('SELECT value FROM records WHERE entity=? AND id=?').get(entity, id) as { value: string }).value;

test('un acierto renueva la recencia: se desaloja el menos usado, no el más antiguo', t => {
  const { store } = encrypted(t);
  const v = view(store), [a, b, c, d] = store.records('contacts').slice(0, 4);
  v.plainCache.clear(); v.plainCacheChars = 0;
  v.plainCacheLimit = { ...v.plainCacheLimit, entries: 3 };
  store.record('contacts', a.id); store.record('contacts', b.id); store.record('contacts', c.id);
  store.record('contacts', a.id); // acierto: «a» pasa a ser el más reciente
  store.record('contacts', d.id); // desaloja «b», el menos usado
  assert.ok(v.plainCache.has(cipherOf(store, 'contacts', a.id)), 'se conserva el que se acaba de usar');
  assert.ok(!v.plainCache.has(cipherOf(store, 'contacts', b.id)), 'se retira el menos usado');
  assert.equal(v.plainCache.size, 3);
});

test('una entrada mayor que el tope por entrada no se guarda ni expulsa a las demás', t => {
  const { store } = encrypted(t);
  const v = view(store);
  const [small, ...rest] = store.records('contacts');
  const big = rest[0];
  // Un registro con un campo muy largo supera el tope de prueba; el pequeño no.
  store.saveRecord('contacts', { ...big.values, lastname: 'x'.repeat(4_000) }, big.id);
  v.plainCache.clear(); v.plainCacheChars = 0;
  v.plainCacheLimit = { ...v.plainCacheLimit, entry: 3_000 };
  store.record('contacts', small.id);
  const kept = [...v.plainCache.keys()];
  assert.equal(kept.length, 1);
  assert.ok(cipherOf(store, 'contacts', big.id).length > 3_000, 'el registro grande supera el tope de prueba');
  assert.equal(store.record('contacts', big.id)?.values.lastname, 'x'.repeat(4_000), 'se lee igual aunque no se guarde');
  assert.ok(!v.plainCache.has(cipherOf(store, 'contacts', big.id)), 'el registro grande no se guarda');
  assert.ok(kept.every(key => v.plainCache.has(key)), 'no expulsa ninguna entrada que ya estaba');
});

test('los metadatos nunca quedan en la caché: desvincular la réplica no deja su texto en memoria', t => {
  const { store } = encrypted(t);
  const v = view(store);
  store.records();
  const size = v.plainCache.size;
  store.set('teamReplica', { token: 'token-ficticio-357', origin: 'http://127.0.0.1:1' });
  assert.equal(store.get<{ token: string } | null>('teamReplica', null)?.token, 'token-ficticio-357');
  store.set('teamReplica', null);
  assert.equal(store.get('teamReplica', 'sin-valor'), null);
  assert.equal(store.ready, true); // lee captura, especificación y generación
  assert.equal(v.plainCache.size, size, 'leer metadatos no añade entradas');
  assert.ok(![...v.plainCache.values()].some(text => text.includes('token-ficticio-357')), 'ningún texto de la réplica retenido');
  const metaCiphers = (store.db.prepare('SELECT value FROM meta').all() as { value: string }[]).map(r => r.value);
  assert.ok(metaCiphers.every(c => !v.plainCache.has(c)), 'ninguna fila de meta en la caché');
});

test('al sustituir la tabla de registros se olvida el texto en claro de los registros retirados', t => {
  const { store } = encrypted(t);
  const v = view(store);
  store.records();
  const retired = (store.db.prepare('SELECT value FROM records').all() as { value: string }[]).map(r => r.value);
  assert.ok(retired.every(c => v.plainCache.has(c)));
  const replacement = sized(60);
  store.importSnapshot(replacement, true);
  store.saveGeneration(makeDemoSpec(replacement), { provider: 'demo', model: null, generatedAt: replacement.capturedAt, prompt: '', approved: false });
  store.activate();
  assert.ok(retired.every(c => !v.plainCache.has(c)), 'ningún registro retirado queda en la caché');
  assert.deepEqual(store.records(), direct(store));
});

test('importar otra captura sin copia activa también olvida los registros retirados', t => {
  fs.mkdirSync(TMP, { recursive: true });
  const dir = fs.mkdtempSync(path.join(TMP, 'store-records-cache-')), store = new Store(path.join(dir, 'planb.sqlite'));
  t.after(() => { try { store.close(); } catch { /* ya cerrado */ } fs.rmSync(dir, { recursive: true, force: true }); });
  store.importSnapshot(makeFixture());
  assert.equal(store.ready, false);
  store.records();
  const retired = (store.db.prepare('SELECT value FROM records').all() as { value: string }[]).map(r => r.value);
  store.importSnapshot(sized(60));
  assert.ok(retired.every(c => !view(store).plainCache.has(c)), 'ningún registro retirado queda en la caché');
  assert.deepEqual(store.records(), direct(store));
});

test('restaurar un paquete olvida los registros retirados y lee los restaurados', t => {
  const { store } = encrypted(t);
  const bundle = store.bundle();
  const target = store.records('contacts')[0];
  store.saveRecord('contacts', { ...target.values, phone: '600 000 353' }, target.id);
  store.records();
  const retired = (store.db.prepare('SELECT value FROM records').all() as { value: string }[]).map(r => r.value);
  store.restoreBundle(bundle);
  assert.ok(retired.every(c => !view(store).plainCache.has(c)), 'ningún registro retirado queda en la caché');
  assert.notEqual(store.record('contacts', target.id)?.values.phone, '600 000 353');
  assert.deepEqual(store.records(), direct(store));
});
