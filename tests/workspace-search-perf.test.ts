// CLAUDE-SEARCH-PERF-R · La búsqueda global reutiliza identidad, revisión e índice normalizado sin cambiar resultados ni orden.
// La referencia es una COPIA LITERAL de la versión anterior (shared/workspace-search.ts 610ca847… y la identidad de
// server/workspace-search.ts 303c1796…): si la implementación nueva diverge en una sola consulta, la prueba falla.
// Solo datos ficticios (tools/perf/fixture.ts y shared/fixtures.ts); almacenes en tests/.tmp/search-perf-*.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { z } from 'zod';
import { createBaseApp } from '../server/app.js';
import { Store } from '../server/store.js';
import { workspaceSearchIdentity } from '../server/workspace-search.js';
import { makeDemoSpec, makeFixture } from '../shared/fixtures.js';
import { entityNames, MAX_RECORDS, type AppSpec, type CrmRecord, type CrmSnapshot, type EntityName } from '../shared/model.js';
import { prepareWorkspaceSearch, searchWorkspace, type WorkspaceSearchContext, type WorkspaceSearchHit, type WorkspaceSearchResult } from '../shared/workspace-search.js';
import { perfSnapshot } from '../tools/perf/fixture.js';

// ── Referencia: versión anterior, copiada sin cambios (solo se renombra el punto de entrada) ──────────────────────
const legacyNormalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es-ES').replace(/\s+/gu, ' ').trim();
function clip(value: string, max: number) {
  let end = Math.min(value.length, max);
  if (end < value.length && end > 0 && /[\uD800-\uDBFF]/.test(value[end - 1]) && /[\uDC00-\uDFFF]/.test(value[end])) end--;
  return { text: value.slice(0, end), truncated: end < value.length };
}
// Map normalized offsets back to the original Unicode code points so a late match is visible without splitting a pair.
function preview(value: string, terms: string[]) {
  let normalized = ''; const offsets: number[] = []; let offset = 0;
  for (const char of value) {
    const mapped = char.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es-ES');
    for (let i = 0; i < mapped.length; i++) offsets.push(offset);
    normalized += mapped; offset += char.length;
  }
  const found = terms.map(term => normalized.indexOf(term)).filter(index => index >= 0);
  let start = found.length ? Math.max(0, offsets[Math.min(...found)] - 35) : 0;
  if (start > 0 && /[\uDC00-\uDFFF]/.test(value[start])) start--;
  const part = clip(value.slice(start), 180);
  return { preview: (start ? '…' : '') + part.text + (part.truncated ? '…' : ''), truncated: start > 0 || part.truncated };
}
const cmp = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;

/** Searches only the supplied active records and declared fields. No remote lookup, writes or hidden-field fallback. */
function legacySearch(input: { spec: AppSpec; records: CrmRecord[]; query: string; entities?: EntityName[]; offset?: number; limit?: number }): WorkspaceSearchResult {
  const query = input.query.trim(), normalized = legacyNormalize(query), terms = [...new Set(normalized.split(' ').filter(Boolean))];
  const offset = input.offset ?? 0, limit = input.limit ?? 25, selected = input.entities ?? [...entityNames];
  if (query.length < 2 || query.length > 160 || !normalized || terms.length > 12) throw new RangeError('Escribe entre 2 y 160 caracteres, con un máximo de 12 términos.');
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > MAX_RECORDS || !Number.isSafeInteger(limit) || limit < 1 || limit > 50) throw new RangeError('Página fuera de límites.');
  if (!selected.length || new Set(selected).size !== selected.length || selected.some(entity => !entityNames.includes(entity))) throw new TypeError('Tipos de registros inválidos.');
  if (input.records.length > MAX_RECORDS) throw new RangeError('Máximo 10.000 registros.');
  const counts = Object.fromEntries(entityNames.map(entity => [entity, 0])) as Record<EntityName, number>;
  const definitions = new Map(input.spec.entities.map(entity => [entity.id, entity]));
  const found: { hit: WorkspaceSearchHit; score: number; name: string }[] = [];
  for (const record of input.records) {
    const definition = definitions.get(record.entity); if (!definition) continue;
    const values = definition.fields.flatMap(field => {
      const value = record.values[field.key]; if (value === undefined || value === null || value === '') return [];
      const text = typeof value === 'string' && field.type === 'enum' ? (field.options.find(option => option.id === value)?.label ?? '') + ' · ' + value : String(value);
      return [{ field, text, normalized: legacyNormalize(text) }];
    });
    const id = legacyNormalize(record.id);
    if (!terms.every(term => id.includes(term) || values.some(value => value.normalized.includes(term)))) continue;
    counts[record.entity]++;
    if (!selected.includes(record.entity)) continue;
    const display = record.values[definition.displayField];
    const name = String(display === undefined || display === null || typeof display === 'string' && !display.trim() ? record.id : display) + (record.entity === 'contacts' && record.values.lastname && definition.fields.some(field => field.key === 'lastname') ? ' ' + record.values.lastname : '');
    const normalizedName = legacyNormalize(name), matching = values.filter(value => terms.some(term => value.normalized.includes(term)));
    const score = id === normalized ? 0 : normalizedName === normalized ? 1 : normalizedName.startsWith(normalized) ? 2 : terms.every(term => normalizedName.includes(term)) ? 3 : 4;
    found.push({ score, name: normalizedName, hit: {
      entity: record.entity, id: record.id, label: clip(name, 160).text, matchedId: terms.some(term => id.includes(term)),
      totalMatchedFields: matching.length, matches: matching.slice(0, 3).map(value => ({ field: value.field.key, label: value.field.label, ...preview(value.text, terms) })),
    } });
  }
  found.sort((a, b) => a.score - b.score || cmp(a.name, b.name) || entityNames.indexOf(a.hit.entity) - entityNames.indexOf(b.hit.entity) || cmp(a.hit.id, b.hit.id));
  return { query, offset, limit, total: found.length, hasMore: offset + limit < found.length, counts, items: found.slice(offset, offset + limit).map(value => value.hit) };
}
// Identidad anterior (server/workspace-search.ts), copiada sin cambios.
function legacyIdentity(store: Store): WorkspaceSearchContext | null {
  const instance = z.string().uuid().safeParse(store.get('instanceId', null));
  if (!instance.success) return null;
  const snapshot = store.snapshot!;
  const contextRevision = createHash('sha256').update(JSON.stringify({ instanceId: instance.data, snapshot,
    generation: store.generation, sessionId: store.get('sessionId', null) })).digest('hex');
  return { instanceId: instance.data, captureId: snapshot.id + ':' + snapshot.capturedAt,
    accountId: snapshot.source.accountId, capturedAt: snapshot.capturedAt, isTestData: snapshot.source.isTestData, contextRevision };
}

// ── Pruebas ─────────────────────────────────────────────────────────────────────────────────────────────
const QUERIES = ['ana', 'Lucía', 'LUCIA', 'álvaro', 'ana martin', '  ana   ruiz  ', 'contact-12', 'deal-1', 'company-7', 'task-15',
  'diseño web', 'propuesta', 'ganada', 'negociación', '1200', '900 0', 'example', 'example.com', 'estudio arce', 'grupo',
  'zzzz-sin-resultados', 'es', 'a b', 'Iñigo', 'peña', 'íker', 'pendiente', 'completada', '2026-03', 'Registro ficticio'];
const PAGES: { entities?: EntityName[]; offset?: number; limit?: number }[] = [
  {}, { limit: 50 }, { offset: 25, limit: 25 }, { offset: 9990, limit: 50 }, { entities: ['contacts'] }, { entities: ['tasks', 'deals'], limit: 7 }];

function compareAll(spec: AppSpec, records: CrmRecord[], label: string) {
  const prepared = prepareWorkspaceSearch(spec, records);
  let compared = 0, withHits = 0;
  for (const query of QUERIES) for (const page of PAGES) {
    const input = { spec, records, query, ...page };
    const expected = legacySearch(input);
    const where = label + ' ' + JSON.stringify(query) + ' ' + JSON.stringify(page);
    assert.deepEqual(searchWorkspace(input), expected, 'sin índice: ' + where);
    assert.deepEqual(searchWorkspace({ ...input, prepared }), expected, 'con índice: ' + where);
    compared++; if (expected.items.length) withHits++;
  }
  return { compared, withHits };
}

test('mismos resultados, orden, recuentos y páginas que la versión anterior con 10.000 registros', () => {
  const snapshot = perfSnapshot(MAX_RECORDS);
  const { compared, withHits } = compareAll(makeDemoSpec(snapshot), snapshot.records, 'perf-10000');
  assert.equal(compared, QUERIES.length * PAGES.length);
  assert.ok(withHits > compared / 2, 'la mayoría de las consultas encuentran algo: ' + withHits + '/' + compared);
});

test('mismos resultados en las capturas de demostración y en casos límite de nombre y entidad', () => {
  for (const profile of ['agency', 'distribution'] as const) {
    const snapshot = makeFixture(profile);
    compareAll(makeDemoSpec(snapshot), snapshot.records, profile);
  }
  const snapshot = makeFixture('agency'), spec = makeDemoSpec(snapshot);
  const odd: CrmRecord[] = [...snapshot.records,
    { id: 'contact-sin-nombre', entity: 'contacts', values: { firstname: '   ', lastname: 'Peña', email: 'ana@example.com' } },
    { id: 'contact-num', entity: 'contacts', values: { firstname: 1200, lastname: '', phone: null } },
    { id: 'deal-bool', entity: 'deals', values: { dealname: true, dealstage: 'desconocida', amount: 0 } }];
  compareAll(spec, odd, 'casos límite');
  // Un spec sin la entidad de tareas: sus registros se ignoran igual que antes.
  compareAll({ ...spec, entities: spec.entities.filter(entity => entity.id !== 'tasks') }, odd, 'spec sin tareas');
});

test('un índice preparado con otros registros u otro spec se ignora y no altera el resultado', () => {
  const snapshot = makeFixture('agency'), spec = makeDemoSpec(snapshot), records = snapshot.records;
  const other = makeFixture('distribution');
  const candidates = [prepareWorkspaceSearch(makeDemoSpec(other), other.records), prepareWorkspaceSearch(spec, [...records]), prepareWorkspaceSearch({ ...spec }, records)];
  for (const prepared of candidates)
    assert.deepEqual(searchWorkspace({ spec, records, query: 'lucia', prepared }), legacySearch({ spec, records, query: 'lucia' }));
  assert.throws(() => searchWorkspace({ spec, records, query: 'a', prepared: prepareWorkspaceSearch(spec, records) }), RangeError);
});

const TMP = path.resolve('tests/.tmp');
const INSTANCE = '5e7a2f1c-0b9d-4c3e-8a61-2d4f6b8c0e17';
function encrypted(snapshot: CrmSnapshot) {
  fs.mkdirSync(TMP, { recursive: true });
  const dir = fs.mkdtempSync(path.join(TMP, 'search-perf-')), file = path.join(dir, 'planb.sqlite');
  const seed = new Store(file);
  seed.set('instanceId', INSTANCE);
  seed.importSnapshot(snapshot);
  seed.saveGeneration(makeDemoSpec(snapshot), { provider: 'demo', model: null, generatedAt: snapshot.capturedAt, prompt: '', approved: false });
  seed.activate();
  seed.close();
  return { dir, file };
}
const legacyRevision = (store: Store, identity: WorkspaceSearchContext) =>
  createHash('sha256').update(JSON.stringify({ contextRevision: identity.contextRevision, spec: store.spec, records: store.records() })).digest('hex');
const legacyState = (store: Store) => store.ready ? legacyIdentity(store) : null;
type SearchBody = WorkspaceSearchResult & { source: WorkspaceSearchContext & { revision: string } };

test('la API devuelve la misma identidad, revisión y resultados que antes, también tras escrituras de otra conexión', async t => {
  const { dir, file } = encrypted(makeFixture('agency'));
  const { app, store } = await createBaseApp({ dbPath: file, root: dir, staticDir: 'none' });
  const other = new Store(file);
  t.after(async () => { other.close(); await app.close(); fs.rmSync(dir, { recursive: true, force: true }); });
  const check = async (query: string, entities?: string): Promise<SearchBody> => {
    const params = new URLSearchParams({ q: query, limit: '50' });
    if (entities) params.set('entities', entities);
    const response = await app.inject({ url: '/api/v2/search?' + params });
    assert.equal(response.statusCode, 200, response.body);
    const body = response.json() as SearchBody;
    const identity = legacyIdentity(store)!;
    assert.deepEqual(body.source, { ...identity, revision: legacyRevision(store, identity) });
    const { source: _source, ...result } = body;
    assert.deepEqual(result, legacySearch({ spec: store.spec!, records: store.records(), query, entities: entities?.split(',') as EntityName[] | undefined, limit: 50 }));
    assert.deepEqual(workspaceSearchIdentity(store), legacyState(store));
    return body;
  };
  const first = await check('lucia');
  assert.ok(first.total >= 1);
  const again = await check('lucia');
  assert.equal(again.source.revision, first.source.revision);
  await check('propuesta', 'tasks');

  // Escritura desde OTRA conexión al mismo archivo: la siguiente búsqueda la ve, sin servir nada antiguo.
  other.saveRecord('contacts', { firstname: 'Zacarías' }, 'contact-1');
  const changed = await check('zacarias');
  assert.ok(changed.items.some(item => item.entity === 'contacts' && item.id === 'contact-1'), 'la ficha editada aparece');
  assert.notEqual(changed.source.revision, first.source.revision);
  assert.equal(changed.source.contextRevision, first.source.contextRevision);
  assert.match(changed.items.find(item => item.id === 'contact-1')!.label, /^Zacarías/, 'la etiqueta es la del nombre nuevo');
  await check('lucia');

  // Abrir un resultado con la revisión actual funciona; con la anterior da 409.
  const open = (revision: string) => app.inject({ url: '/api/v2/search-record?' + new URLSearchParams({ entity: 'contacts', id: 'contact-1', captureId: changed.source.captureId, revision }) });
  assert.equal((await open(changed.source.revision)).statusCode, 200);
  assert.equal((await open(first.source.revision)).statusCode, 409);

  // Varias ediciones seguidas (índice reutilizado para el resto) y un alta: siempre igual que la referencia.
  for (const [id, firstname] of [['contact-2', 'Úrsula'], ['contact-3', 'Ulises'], ['contact-2', 'Pablo']] as const) {
    other.saveRecord('contacts', { firstname }, id);
    await check(firstname.toLowerCase());
  }
  other.saveRecord('companies', { name: 'Compañía Nueva Ficticia', domain: 'https://nueva.example.com', phone: '900 999 999' });
  assert.ok((await check('compania nueva')).total >= 1);

  // El spec cambia (otra etiqueta de opción): nada se reutiliza y las etiquetas nuevas aparecen, como en la referencia.
  const spec = structuredClone(store.spec!);
  const service = spec.entities.find(entity => entity.id === 'contacts')!.fields.find(field => field.key === 'service')!;
  service.options = service.options.map(option => option.id === 'web' ? { ...option, label: 'Webs a medida' } : option);
  other.set('spec', spec); // Lo que escribe la activación; la validación del spec no es lo que se prueba aquí.
  const relabeled = await check('webs a medida');
  assert.ok(relabeled.total >= 1, 'la etiqueta nueva del spec se busca');

  // Otra sesión registrada desde la otra conexión: identidad nueva, igual que la referencia.
  other.set('sessionId', 'search-perf-session-2');
  const session = await check('lucia');
  assert.notEqual(session.source.contextRevision, first.source.contextRevision);

  // Otra captura en la otra conexión (candidata y después activada): la identidad sigue a la referencia en cada paso.
  const next = makeFixture('distribution');
  other.importSnapshot(next, true);
  await check('lucia');
  other.saveGeneration(makeDemoSpec(next), { provider: 'demo', model: null, generatedAt: next.capturedAt, prompt: '', approved: false });
  other.activate();
  const replaced = await check('lucia');
  assert.notEqual(replaced.source.captureId, first.source.captureId);
});

test('sin copia activa la identidad sigue siendo nula y la búsqueda responde 409, como antes', async t => {
  const fresh = await createBaseApp({ dbPath: ':memory:', root: TMP, staticDir: 'none' });
  t.after(() => fresh.app.close());
  fresh.store.set('instanceId', INSTANCE);
  assert.equal(workspaceSearchIdentity(fresh.store), null);
  assert.equal((await fresh.app.inject({ url: '/api/v2/search?q=lucia' })).statusCode, 409);
  const snapshot = makeFixture('agency');
  fresh.store.importSnapshot(snapshot);
  assert.equal(workspaceSearchIdentity(fresh.store), legacyState(fresh.store), 'importada pero sin activar');
  fresh.store.saveGeneration(makeDemoSpec(snapshot), { provider: 'demo', model: null, generatedAt: snapshot.capturedAt, prompt: '', approved: false });
  fresh.store.activate();
  assert.ok(workspaceSearchIdentity(fresh.store));
  assert.deepEqual(workspaceSearchIdentity(fresh.store), legacyState(fresh.store));
  fresh.store.set('instanceId', 'no-es-un-uuid');
  assert.equal(workspaceSearchIdentity(fresh.store), null);
  assert.equal((await fresh.app.inject({ url: '/api/v2/search?q=lucia' })).statusCode, 409);
});

// Techo absoluto con margen para un equipo cargado; la comparación relativa es la que no depende de la carga.
const SEARCH_CEILING_MS = 400, MIN_SPEEDUP = 2;
const median = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];

test('con 10.000 registros la búsqueda global es al menos el doble de rápida que antes y queda bajo su techo', { timeout: 300_000 }, async t => {
  const { dir, file } = encrypted(perfSnapshot(MAX_RECORDS));
  const { app, store } = await createBaseApp({ dbPath: file, root: dir, staticDir: 'none' });
  t.after(async () => { await app.close(); fs.rmSync(dir, { recursive: true, force: true }); });
  const terms = ['ana', 'martin', 'estudio arce', 'propuesta', 'luc', 'grupo', 'deal-12', 'example'];
  assert.equal((await app.inject({ url: '/api/v2/search?q=calentar' })).statusCode, 200);
  const now: number[] = [], before: number[] = [];
  // Alternadas en la misma ventana para que la carga del equipo afecte a las dos por igual.
  for (let i = 0; i < 9; i++) {
    const query = terms[i % terms.length];
    let start = performance.now();
    const response = await app.inject({ url: '/api/v2/search?q=' + encodeURIComponent(query) + '&limit=25' });
    now.push(performance.now() - start);
    assert.equal(response.statusCode, 200);
    // Lo que hacía la versión anterior en cada búsqueda, sin el coste HTTP (favorece a la referencia).
    start = performance.now();
    const identity = store.ready ? legacyIdentity(store)! : null;
    legacyRevision(store, identity!);
    const expected = legacySearch({ spec: store.spec!, records: store.records(), query, limit: 25 });
    before.push(performance.now() - start);
    const { source: _source, ...result } = response.json() as SearchBody;
    assert.deepEqual(result, expected, 'mismo resultado para ' + query);
  }
  const current = median(now), previous = median(before);
  t.diagnostic('búsqueda global con 10.000 registros: ahora mediana ' + current.toFixed(1) + ' ms (máx ' + Math.max(...now).toFixed(1)
    + ') · antes ' + previous.toFixed(1) + ' ms · ' + (previous / current).toFixed(1) + '×');
  assert.ok(current < SEARCH_CEILING_MS, 'mediana ' + current.toFixed(1) + ' ms');
  assert.ok(previous / current >= MIN_SPEEDUP, 'aceleración ' + (previous / current).toFixed(2) + '×');

  // Editar una ficha y buscar: solo se vuelve a normalizar lo editado.
  const edited: number[] = [], editedBefore: number[] = [];
  for (let i = 0; i < 7; i++) {
    const query = terms[i % terms.length];
    store.saveRecord('contacts', { phone: '644 ' + String(i).padStart(6, '0') }, 'contact-' + (i + 1));
    let start = performance.now();
    const response = await app.inject({ url: '/api/v2/search?q=' + encodeURIComponent(query) + '&limit=25' });
    edited.push(performance.now() - start);
    assert.equal(response.statusCode, 200);
    start = performance.now();
    const identity = legacyIdentity(store)!;
    legacyRevision(store, identity);
    const expected = legacySearch({ spec: store.spec!, records: store.records(), query, limit: 25 });
    editedBefore.push(performance.now() - start);
    const { source: _source, ...result } = response.json() as SearchBody;
    assert.deepEqual(result, expected, 'mismo resultado tras editar, para ' + query);
  }
  const afterEdit = median(edited), afterEditBefore = median(editedBefore);
  t.diagnostic('editar y buscar: ahora mediana ' + afterEdit.toFixed(1) + ' ms · antes ' + afterEditBefore.toFixed(1) + ' ms · '
    + (afterEditBefore / afterEdit).toFixed(1) + '×');
  assert.ok(afterEditBefore / afterEdit >= 1.5, 'aceleración tras editar ' + (afterEditBefore / afterEdit).toFixed(2) + '×');
});
