import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { createBaseApp } from '../server/app.js';
import { pathToFileURL } from 'node:url';
import { searchWorkspace } from '../shared/workspace-search.js';
import { queueWindow } from '../shared/work-queue.js';
import { makeFixture, makeDemoSpec } from '../shared/fixtures.js';
import { MAX_RECORDS, type CrmRecord, type AppSpec } from '../shared/model.js';

// CLAUDE-QA-060 · A (búsqueda global) y D (Hoy sin recortes): revisión independiente.
// Los oráculos están escritos a mano a partir del contrato (todos los términos, normalización, orden, límites) ANTES de llamar al código;
// ningún resultado se compara contra otra llamada al mismo algoritmo salvo para la invariancia de entrada reordenada.
// Datos 100 % ficticios y en memoria. QA079: A16/A17/A18 (QA060-F1/F2/F3) ya no llevan `todo`; se revalidaron contra las fuentes corregidas y se contrastaron con el corte baseline075.

// QA060_AGENTS_MODULE apunta a otra copia de server/agents.ts (se usó para ejecutar ESTA prueba contra la versión anterior al recorte de Hoy).
const { SalesAgents } = await import(process.env.QA060_AGENTS_MODULE ? pathToFileURL(path.resolve(process.env.QA060_AGENTS_MODULE)).href : '../server/agents.js') as typeof import('../server/agents.js');
const headers = { host: '127.0.0.1:4392', origin: 'http://127.0.0.1:4392' };
const baseSnapshot = makeFixture(), spec: AppSpec = makeDemoSpec(baseSnapshot);
const contact = (id: string, values: Record<string, string | number | boolean | null>): CrmRecord => ({ entity: 'contacts', id, values: { firstname: 'Sin nombre', email: 'qa060@example.com', ...values } });
const company = (id: string, values: Record<string, string | number | boolean | null>): CrmRecord => ({ entity: 'companies', id, values: { name: 'Sin nombre', ...values } });
const deal = (id: string, values: Record<string, string | number | boolean | null>): CrmRecord => ({ entity: 'deals', id, values: { dealname: 'Sin nombre', amount: 1, dealstage: 'contact', ...values } });
const task = (id: string, values: Record<string, string | number | boolean | null>): CrmRecord => ({ entity: 'tasks', id, values: { subject: 'Sin asunto', due_date: '2099-01-01', status: 'pending', ...values } });
const find = (records: CrmRecord[], query: string, extra: Partial<Parameters<typeof searchWorkspace>[0]> = {}) => searchWorkspace({ spec, records, query, ...extra });
const ids = (result: ReturnType<typeof searchWorkspace>) => result.items.map(item => item.entity + ':' + item.id);
function deepFreeze<T>(value: T): T { if (value && typeof value === 'object' && !Object.isFrozen(value)) { Object.freeze(value); for (const item of Object.values(value)) deepFreeze(item); } return value; }

// ---------------------------------------------------------------- A · oráculo manual de búsqueda
const corpus = () => [
  contact('x-1', { firstname: 'Zqx', lastname: 'Núñez', phone: '600 111', service: 'web' }),
  contact('x-2', { firstname: 'Zqx', lastname: 'Nunez' }),                                  // homónimo sin acentos
  contact('x-3', { firstname: 'Otro', lastname: 'Persona', email: 'zqx.mail@example.com' }), // coincide solo en otro campo
  contact('ZQX', { firstname: 'Prefijo', lastname: 'Distinto' }),                              // ID exacto
  company('x-1', { name: 'Zqx Soluciones' }),                                                  // mismo ID que un cliente
  deal('x-1', { dealname: 'Zqx Proyecto', amount: 1200, dealstage: 'won' }),
  task('x-1', { subject: 'Llamar a Zqx', status: 'completed', notes: 'nota' }),
];

test('A1 orden: ID exacto, luego nombre/prefijo por nombre, luego contiene, luego otro campo; homónimos y mismo ID en entidades distintas siguen separados', () => {
  // Oráculo escrito a mano. ZQX = ID exacto. Nombre empieza por «zqx»: «zqx nunez» (x-1, x-2: mismo nombre normalizado → desempate por entidad y por ID),
  // «zqx proyecto» (deal), «zqx soluciones» (company). «Llamar a Zqx» solo lo contiene. x-3 solo coincide en su correo.
  const expected = ['contacts:ZQX', 'contacts:x-1', 'contacts:x-2', 'deals:x-1', 'companies:x-1', 'tasks:x-1', 'contacts:x-3'];
  const result = find(corpus(), 'zqx');
  assert.deepEqual(ids(result), expected); assert.equal(result.total, 7);
  assert.deepEqual(result.counts, { contacts: 4, companies: 1, deals: 1, tasks: 1 });
  assert.deepEqual(ids(find([...corpus()].reverse(), 'zqx')), expected, 'la entrada reordenada no cambia el orden');
  assert.equal(result.items[0].matchedId, true); assert.equal(result.items.find(item => item.id === 'x-3')!.matchedId, false);
});

test('A2 nombre exacto de varias palabras: gana al prefijo y exige todos los términos', () => {
  const result = find(corpus(), 'zqx nunez');
  assert.deepEqual(ids(result), ['contacts:x-1', 'contacts:x-2']); assert.equal(result.total, 2);
});

test('A3 acentos compuestos/descompuestos, mayúsculas, espacios repetidos y bordes devuelven lo mismo', () => {
  const variants = ['zqx nunez', 'ZQX NÚÑEZ', 'zqx núñez', '   zqx      nunez   ', 'Zqx\tNúñez', 'zqx nunez'];
  for (const query of variants) assert.deepEqual(ids(find(corpus(), query)), ['contacts:x-1', 'contacts:x-2'], JSON.stringify(query));
  // Los registros también pueden venir descompuestos.
  const decomposed = [contact('d-1', { firstname: 'Zqx', lastname: 'Núñez' })];
  assert.equal(find(decomposed, 'NÚÑEZ').total, 1);
});

test('A4 la puntuación se compara literalmente dentro del término; un espacio separa términos', () => {
  assert.deepEqual(ids(find(corpus(), 'zqx.mail')), ['contacts:x-3']);
  assert.deepEqual(ids(find(corpus(), 'zqx.mail@example.com')), ['contacts:x-3']);
  assert.equal(find(corpus(), 'zqx.mal').total, 0, 'un punto no es comodín ni se ignora');
  assert.deepEqual(ids(find(corpus(), 'zqx mail')), ['contacts:x-3'], 'dos términos, ambos presentes en el correo');
});

test('A5 campos no declarados no participan ni aparecen; tampoco valores vacíos, null o undefined convertidos en texto', () => {
  const records = [contact('u-1', { firstname: 'Visible', phone: null, internal_note: 'zqxsecretonly' } as never), contact('u-2', { firstname: 'Otro', phone: '' })];
  assert.equal(find(records, 'zqxsecretonly').total, 0, 'campo no declarado');
  for (const word of ['null', 'undefined']) assert.equal(find(records, word).total, 0, word);
  const hit = find(records, 'visible').items[0]; assert.equal(JSON.stringify(hit).includes('zqxsecretonly'), false);
  assert.ok(hit.matches.every(match => ['firstname', 'lastname', 'email', 'phone', 'company_id', 'service'].includes(match.field)));
});

test('A6 enum por etiqueta y valor; cero y false no se pierden; null no se convierte en cero', () => {
  const records = [contact('e-1', { firstname: 'Enum', service: 'web' }), contact('e-2', { firstname: 'Enum', service: 'legado' }), deal('amount-zero', { dealname: 'Sin importe', amount: 0 }), deal('amount-null', { dealname: 'Sin importe', amount: null })];
  assert.deepEqual(ids(find(records, 'diseno web')), ['contacts:e-1'], 'etiqueta sin acento');
  assert.deepEqual(ids(find(records, 'web')), ['contacts:e-1'], 'valor interno');
  assert.deepEqual(ids(find(records, 'legado')), ['contacts:e-2'], 'opción desconocida: coincide por su valor guardado');
  // El término «0» solo puede salir del valor numérico 0 (el ID «amount-zero» no lo contiene).
  assert.deepEqual(ids(find(records, '0 zero')), ['deals:amount-zero']);
  assert.equal(find(records, '0 null').total, 0, 'null no es cero');
  const withBoolean: AppSpec = { ...spec, entities: spec.entities.map(e => e.id === 'companies' ? { ...e, fields: [...e.fields, { key: 'vip', label: 'VIP', type: 'boolean', required: false, readOnly: false, options: [], referenceEntity: null }] } : e) };
  const flags = [company('flag-a', { name: 'Flag', vip: false }), company('flag-b', { name: 'Flag', vip: null })];
  assert.deepEqual(searchWorkspace({ spec: withBoolean, records: flags, query: 'false flag' }).items.map(item => item.id), ['flag-a'], 'false se busca; null no es false');
});

test('A7 la búsqueda no muta registros ni especificación', () => {
  const records = deepFreeze(corpus()), frozenSpec = deepFreeze(structuredClone(spec)), before = JSON.stringify([records, frozenSpec]);
  searchWorkspace({ spec: frozenSpec, records, query: 'zqx', entities: ['contacts', 'tasks'], offset: 1, limit: 2 });
  assert.equal(JSON.stringify([records, frozenSpec]), before);
});

test('A8 recuentos globales, filtro por entidad y página son tres cosas distintas; límites 0/1/20/21/50/51', () => {
  const records = [
    ...Array.from({ length: 45 }, (_, i) => contact('pg-' + String(i + 1).padStart(3, '0'), { firstname: 'Pgz ' + String(i + 1).padStart(3, '0') })),
    ...Array.from({ length: 3 }, (_, i) => company('pc-' + (i + 1), { name: 'Pgz empresa ' + (i + 1) })),
    task('pt-1', { subject: 'Pgz tarea' }), task('pt-2', { subject: 'Pgz otra' }),
  ];
  const all = find(records, 'pgz'); assert.equal(all.total, 50); assert.deepEqual(all.counts, { contacts: 45, companies: 3, deals: 0, tasks: 2 });
  const onlyContacts = find(records, 'pgz', { entities: ['contacts'], limit: 50 });
  assert.equal(onlyContacts.total, 45, 'el total sigue al filtro'); assert.deepEqual(onlyContacts.counts, all.counts, 'los recuentos son globales');
  assert.deepEqual(onlyContacts.items.map(item => item.id), Array.from({ length: 45 }, (_, i) => 'pg-' + String(i + 1).padStart(3, '0')));
  const pages = [0, 20, 40].map(offset => find(records, 'pgz', { entities: ['contacts'], offset, limit: 20 }));
  assert.deepEqual(pages.map(p => [p.items.length, p.hasMore, p.total]), [[20, true, 45], [20, true, 45], [5, false, 45]]);
  assert.deepEqual(pages.flatMap(p => p.items.map(item => item.id)), onlyContacts.items.map(item => item.id), 'las páginas reconstruyen la lista sin saltos ni repetidos');
  assert.deepEqual([find(records, 'pgz', { entities: ['contacts'], offset: 45 }).items.length, find(records, 'pgz', { offset: MAX_RECORDS }).items.length], [0, 0]);
  assert.equal(find(records, 'pgz', { limit: 1 }).hasMore, true); assert.equal(find(records, 'pgz', { limit: 21, offset: 40 }).items.length, 10);
  for (const limit of [0, 51, -1, 1.5]) assert.throws(() => find(records, 'pgz', { limit }), RangeError, 'limit ' + limit);
  for (const offset of [-1, MAX_RECORDS + 1, 0.5]) assert.throws(() => find(records, 'pgz', { offset }), RangeError, 'offset ' + offset);
});

test('A9 consultas inválidas del motor: corta, larga, solo marcas combinantes, demasiados términos, entidades repetidas o desconocidas', () => {
  const r = corpus();
  for (const query of ['a', ' a ', 'x'.repeat(161), '́́', Array.from({ length: 13 }, (_, i) => 't' + i).join(' ')]) assert.throws(() => find(r, query), RangeError, JSON.stringify(query).slice(0, 30));
  assert.doesNotThrow(() => find(r, Array.from({ length: 12 }, (_, i) => 't' + i).join(' ')), '12 términos distintos caben');
  assert.doesNotThrow(() => find(r, Array.from({ length: 13 }, () => 'zqx').join(' ')), 'términos repetidos cuentan una vez');
  assert.throws(() => find(r, 'zqx', { entities: [] }), TypeError); assert.throws(() => find(r, 'zqx', { entities: ['contacts', 'contacts'] }), TypeError);
  assert.throws(() => find(r, 'zqx', { entities: ['nope' as never] }), TypeError);
});

test('A10 10.000 registros: se alcanza el último ID, ninguna página repite y 10.001 se rechaza', () => {
  const records: CrmRecord[] = Array.from({ length: MAX_RECORDS - 1 }, (_, i) => contact('bulk-' + String(i).padStart(5, '0'), { firstname: 'Bulk ' + String(i).padStart(5, '0') }));
  records.push(company('needle-id', { name: 'Aguja única zzneedle' }));
  assert.equal(records.length, MAX_RECORDS);
  const started = performance.now();
  const needle = find(records, 'zzneedle'); assert.deepEqual(ids(needle), ['companies:needle-id']);
  const seen = new Set<string>(); let offset = 0, last = find(records, 'bulk', { limit: 50 });
  for (; ; offset += 50) { last = find(records, 'bulk', { limit: 50, offset }); for (const item of last.items) { assert.equal(seen.has(item.id), false, 'repetido ' + item.id); seen.add(item.id); } if (!last.hasMore) break; }
  const elapsed = Math.round(performance.now() - started);
  assert.equal(seen.size, MAX_RECORDS - 1); assert.equal(last.total, MAX_RECORDS - 1); assert.equal(last.items.at(-1)!.id, 'bulk-' + String(MAX_RECORDS - 2).padStart(5, '0'));
  console.log('# A10 medida (sin umbral): ' + (elapsed) + ' ms para 1 + ' + (offset / 50 + 1) + ' consultas sobre 10.000 registros');
  assert.throws(() => find([...records, contact('extra', {})], 'bulk'), RangeError);
});

// ---------------------------------------------------------------- A · API: procedencia, revisión, apertura
async function workspace(records: CrmRecord[]) {
  const result = await createBaseApp({ root: path.resolve('tests/.tmp/qa060/no-workers'), staticDir: path.resolve('tests/.tmp/qa060/no-assets'), dbPath: ':memory:', runtime: true });
  const snapshot = makeFixture(); snapshot.records = structuredClone(records); snapshot.links = []; snapshot.manifest.expectedLinks = 0;
  for (const entity of snapshot.entities) snapshot.manifest.expectedCounts[entity.id] = snapshot.records.filter(r => r.entity === entity.id).length;
  result.store.importSnapshot(snapshot);
  result.store.saveGeneration(makeDemoSpec(snapshot), { provider: 'demo', model: null, generatedAt: new Date().toISOString(), prompt: '', approved: false });
  result.store.activate();
  return result;
}
const tables = (store: Awaited<ReturnType<typeof workspace>>['store']) => (store.db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all() as { name: string }[])
  .map(t => [t.name, store.db.prepare('SELECT * FROM "' + t.name + '"').all()]);
const get = (app: Awaited<ReturnType<typeof workspace>>['app'], url: string) => app.inject({ url, headers });
const openUrl = (entity: string, id: string, source: { captureId: string; revision: string }) => '/api/v2/search-record?entity=' + entity + '&id=' + encodeURIComponent(id) + '&captureId=' + encodeURIComponent(source.captureId) + '&revision=' + source.revision;

test('A11 API: la apertura usa entidad+ID exactos (también con caracteres reservados y mismo ID en otra entidad) y devuelve el valor completo actual', async () => {
  const weird = 'a/b?c=d&e#f %20ñ', longPhone = 'p'.repeat(400) + 'zqres' + 'q'.repeat(400);
  const { app } = await workspace([contact(weird, { firstname: 'Zqres Raro', phone: longPhone }), company(weird, { name: 'Zqres Empresa gemela' })]);
  try {
    const search = (await get(app, '/api/v2/search?q=zqres&limit=50')).json();
    assert.equal(search.total, 2); assert.deepEqual(search.items.map((i: { entity: string }) => i.entity).sort(), ['companies', 'contacts']);
    const preview = search.items.find((i: { entity: string }) => i.entity === 'contacts').matches.find((m: { field: string }) => m.field === 'phone');
    assert.ok(preview.truncated && preview.preview.length < longPhone.length / 2, 'la vista previa recorta');
    const opened = await get(app, openUrl('contacts', weird, search.source)); assert.equal(opened.statusCode, 200);
    assert.equal(opened.json().record.id, weird); assert.equal(opened.json().record.entity, 'contacts'); assert.equal(opened.json().record.values.phone, longPhone, 'valor completo, no la vista previa');
    assert.equal((await get(app, openUrl('companies', weird, search.source))).json().record.values.name, 'Zqres Empresa gemela', 'misma ID, otra entidad');
    assert.equal((await get(app, openUrl('deals', weird, search.source))).statusCode, 404, 'esa entidad no tiene ese ID');
    assert.equal((await get(app, openUrl('contacts', weird, { ...search.source, captureId: search.source.captureId + 'x' }))).statusCode, 409);
    assert.equal((await get(app, openUrl('contacts', weird, { ...search.source, revision: 'f'.repeat(64) }))).statusCode, 409);
    for (const query of ['entity=contacts&id=x&captureId=y', 'entity=bad&id=x&captureId=y&revision=' + 'a'.repeat(64), 'entity=contacts&id=&captureId=y&revision=' + 'a'.repeat(64)]) assert.equal((await get(app, '/api/v2/search-record?' + query)).statusCode, 422, query);
  } finally { await app.close(); }
});

test('A12 API: revisión estable sin cambios; cualquier edición la cambia y una página/apertura con la antigua da 409', async () => {
  const records = Array.from({ length: 25 }, (_, i) => contact('rv-' + String(i).padStart(2, '0'), { firstname: 'Rvz ' + String(i).padStart(2, '0'), phone: 'p' + i }));
  const { app, store } = await workspace(records);
  try {
    const first = (await get(app, '/api/v2/search?q=rvz&limit=20')).json(), again = (await get(app, '/api/v2/search?q=rvz&limit=20')).json();
    assert.equal(first.source.revision, again.source.revision, 'sin cambios la revisión no varía'); assert.equal(first.hasMore, true);
    const next = await get(app, '/api/v2/search?q=rvz&limit=20&offset=20&revision=' + first.source.revision); assert.equal(next.statusCode, 200); assert.equal(next.json().items.length, 5);
    store.saveRecord('contacts', { phone: 'cambiado' }, 'rv-03');
    assert.equal((await get(app, '/api/v2/search?q=rvz&limit=20&offset=20&revision=' + first.source.revision)).statusCode, 409, 'página 2 con revisión antigua');
    assert.equal((await get(app, openUrl('contacts', 'rv-03', first.source))).statusCode, 409, 'apertura con revisión antigua');
    const fresh = (await get(app, '/api/v2/search?q=rvz&limit=20')).json(); assert.notEqual(fresh.source.revision, first.source.revision);
    assert.equal((await get(app, openUrl('contacts', 'rv-03', fresh.source))).json().record.values.phone, 'cambiado', 'valor actual, no el de la búsqueda anterior');
    assert.equal((await get(app, '/api/v2/search?q=rvz&offset=20&revision=' + 'A'.repeat(64))).statusCode, 422, 'revisión malformada');
  } finally { await app.close(); }
});

test('A13 API: ninguna consulta (válida o rechazada) modifica registros, cambios ni metadatos; las respuestas no se cachean', async () => {
  const { app, store } = await workspace(corpus());
  try {
    const before = JSON.stringify(tables(store));
    const urls = ['/api/v2/search?q=zqx', '/api/v2/search?q=zqx&entities=contacts,tasks&limit=1&offset=1', '/api/v2/search?q=z', '/api/v2/search?q=zqx&limit=999', '/api/v2/search?q=zqx&revision=' + 'e'.repeat(64), '/api/v2/search-record?entity=contacts&id=x-1&captureId=nope&revision=' + 'd'.repeat(64)];
    const responses = []; for (const url of urls) responses.push(await get(app, url));
    assert.deepEqual(responses.map(r => r.statusCode), [200, 200, 422, 422, 409, 409]);
    for (const response of responses) assert.equal(response.headers['cache-control'], 'no-store', 'estado ' + response.statusCode);
    assert.equal(JSON.stringify(tables(store)), before);
  } finally { await app.close(); }
});

test('A14 API: validación estricta adicional de la consulta', async () => {
  const { app } = await workspace(corpus());
  try {
    const bad = ['q=' + 'x'.repeat(161), 'q=' + Array.from({ length: 13 }, (_, i) => 'a' + i).join('%20'), 'q=%CC%81%CC%81', 'q=zqx&limit=1.5', 'q=zqx&offset=1.5', 'q=zqx&entities=Contacts', 'q=zqx&entities=contacts,', 'q=zqx&entities=contacts,%20deals', 'q=zqx&limit=', 'q=zqx&revision=' + 'A'.repeat(64), 'q=zqx&extra=1'];
    for (const query of bad) assert.equal((await get(app, '/api/v2/search?' + query)).statusCode, 422, query);
    assert.equal((await get(app, '/api/v2/search?q=' + Array.from({ length: 12 }, (_, i) => 'a' + i).join('%20'))).statusCode, 200, '12 términos son válidos');
  } finally { await app.close(); }
});

test('A15 API: 10.000 registros activos; el último ID se encuentra, se abre con su valor completo y la revisión es única', async () => {
  const records: CrmRecord[] = Array.from({ length: MAX_RECORDS - 1 }, (_, i) => contact('big-' + String(i).padStart(5, '0'), { firstname: 'Bigz ' + String(i).padStart(5, '0') }));
  records.push(deal('needle-deal', { dealname: 'Aguja final zzfinal', amount: 777 }));
  const started = performance.now(), { app } = await workspace(records), imported = Math.round(performance.now() - started);
  try {
    const t0 = performance.now(), found = (await get(app, '/api/v2/search?q=zzfinal')).json(), searched = Math.round(performance.now() - t0);
    assert.equal(found.total, 1); assert.equal(found.items[0].id, 'needle-deal'); assert.deepEqual(found.counts, { contacts: 0, companies: 0, deals: 1, tasks: 0 });
    const opened = (await get(app, openUrl('deals', 'needle-deal', found.source))).json(); assert.equal(opened.record.values.amount, 777);
    const lastPage = (await get(app, '/api/v2/search?q=bigz&limit=50&offset=9950')).json(); assert.equal(lastPage.total, MAX_RECORDS - 1); assert.equal(lastPage.items.length, 49); assert.equal(lastPage.hasMore, false);
    console.log('# A15 medida (sin umbral): importar+activar 10.000 = ' + imported + ' ms; una búsqueda = ' + searched + ' ms');
  } finally { await app.close(); }
});

// QA060-F1/F2 (hallazgos) revalidados en QA079 sobre las fuentes corregidas: ya NO llevan `todo`. Cada uno tiene controles positivos y se comprueba (corte baseline075 copiado) que FALLA con la fuente anterior.
test('A16 QA060-F1 una relación sin valor (ausente, null o vacío) no enlaza el registro cuyo ID sea literalmente «undefined» o «null»; los enlaces legítimos se conservan', async () => {
  const { app } = await workspace([
    contact('lonely', { firstname: 'Qaf Sin Empresa' }), contact('with-null', { firstname: 'Qaf Con Nulo', company_id: null }), contact('with-empty', { firstname: 'Qaf Con Vacio', company_id: '' }),
    contact('undefined', { firstname: 'Qaf Contacto undefined' }), contact('null', { firstname: 'Qaf Contacto null' }),
    company('undefined', { name: 'Empresa llamada undefined' }), company('null', { name: 'Empresa llamada null' }), company('co-real', { name: 'Empresa real qaf' }),
    deal('deal-null', { dealname: 'Qaf Oportunidad null' }), deal('deal-real', { dealname: 'Qaf Oportunidad real' }),
    task('task-none', { subject: 'Qaf tarea sin relaciones' }), task('task-nulls', { subject: 'Qaf tarea con nulos', contact_id: null, deal_id: null }),
    // Controles positivos: referencia real, y una referencia cuyo valor ES el texto «undefined» (ID literal existente: es un enlace legítimo, no un hueco).
    contact('with-real', { firstname: 'Qaf Con Empresa', company_id: 'co-real' }), contact('with-literal', { firstname: 'Qaf Literal', company_id: 'undefined' }),
    task('task-real', { subject: 'Qaf tarea enlazada', contact_id: 'with-real', deal_id: 'deal-real' }),
  ]);
  try {
    const search = (await get(app, '/api/v2/search?q=qaf&limit=50')).json();
    const related = async (entity: string, id: string) => { const opened = await get(app, openUrl(entity, id, search.source)); assert.equal(opened.statusCode, 200, entity + ':' + id); return opened.json().related.map((r: CrmRecord) => r.entity + ':' + r.id); };
    for (const id of ['lonely', 'with-null', 'with-empty']) assert.deepEqual(await related('contacts', id), [], 'ficha sin empresa: ' + id);
    for (const id of ['task-none', 'task-nulls']) assert.deepEqual(await related('tasks', id), [], 'tarea sin relaciones: ' + id);
    assert.deepEqual(await related('deals', 'deal-null'), [], 'oportunidad sin relaciones');
    // Las fichas cuyo ID es literalmente «undefined» o «null» siguen abribles por su ID exacto: el arreglo no las oculta.
    assert.deepEqual(await related('contacts', 'undefined'), [], 'el contacto «undefined» no tiene empresa'); assert.deepEqual(await related('contacts', 'null'), []);
    assert.equal((await get(app, openUrl('companies', 'undefined', search.source))).json().record.id, 'undefined', 'la empresa «undefined» sigue siendo abrible por su ID exacto');
    // Positivos: relación real, relación a un ID cuyo texto es «undefined» y tarea con dos relaciones (contacto + oportunidad).
    assert.deepEqual(await related('contacts', 'with-real'), ['companies:co-real']);
    assert.deepEqual(await related('contacts', 'with-literal'), ['companies:undefined'], 'un valor de referencia «undefined» que existe como ID sí se enlaza (no se ha cambiado el parser para ocultar el caso)');
    assert.deepEqual((await related('tasks', 'task-real')).sort(), ['contacts:with-real', 'deals:deal-real']);
  } finally { await app.close(); }
});

test('A16b F1 mismo ID en otra entidad: la relación se resuelve solo en la entidad declarada por el campo; otra revisión da 409', async () => {
  const { app } = await workspace([contact('same', { firstname: 'Qaf Mismo ID', company_id: 'same' }), company('same', { name: 'Empresa mismo ID' }), deal('same', { dealname: 'Oportunidad mismo ID' }), task('same', { subject: 'Tarea mismo ID', contact_id: 'same', deal_id: 'same' })]);
  try {
    const search = (await get(app, '/api/v2/search?q=same&limit=50')).json();
    const contactHit = (await get(app, openUrl('contacts', 'same', search.source))).json(), taskHit = (await get(app, openUrl('tasks', 'same', search.source))).json();
    assert.deepEqual(contactHit.related.map((r: CrmRecord) => r.entity), ['companies'], 'company_id apunta a empresas, no a la oportunidad ni a la tarea que comparten ID');
    assert.deepEqual(taskHit.related.map((r: CrmRecord) => r.entity).sort(), ['contacts', 'deals']);
    assert.equal((await get(app, openUrl('contacts', 'same', { ...search.source, revision: 'f'.repeat(64) }))).statusCode, 409, 'revisión ajena: 409');
  } finally { await app.close(); }
});

test('A17 QA060-F2 un registro con nombre vacío, en blanco, ausente o null se muestra con una etiqueta identificable por ID; 0 y false se conservan', () => {
  // Una etiqueta vacía no puede distinguir fichas: cada ficha sin nombre muestra su ID (el contacto añade su apellido tras el ID).
  const blanks: [string, CrmRecord][] = [
    ['empresa nombre «»', company('qaf-empty', { name: '', domain: 'qaf.example' })], ['empresa solo espacios', company('qaf-spaces', { name: '   \t ', domain: 'qaf.example' })], ['empresa sin campo', company('qaf-absent', { domain: 'qaf.example' })],
    ['empresa null', company('qaf-null', { name: null, domain: 'qaf.example' })], ['oportunidad vacía', deal('qaf-deal', { dealname: '', amount: 5 })], ['tarea en blanco', task('qaf-task', { subject: '  ', notes: 'qaf nota' })],
  ];
  for (const [label, record] of blanks) { if (label === 'empresa sin campo') delete (record.values as Record<string, unknown>).name; const hit = find([record], 'qaf').items[0]; assert.ok(hit, label + ': la ficha sigue encontrándose (falta de nombre ≠ falta de ficha)'); assert.equal(hit.label, record.id, label + ': etiqueta = ID, fue ' + JSON.stringify(hit.label)); }
  const person = find([contact('qaf-person', { firstname: ' ', lastname: 'Núñez' })], 'qaf').items[0]; assert.ok(person.label.includes('qaf-person') && person.label.includes('Núñez'), 'contacto sin nombre: ID y apellido, fue ' + JSON.stringify(person.label));
  // Controles positivos: 0 y false NO son «sin nombre» (una solución genérica con `||` los convertiría en el ID).
  const zero = find([company('qaf-zero', { name: 0 as unknown as string, domain: 'qaf.example' })], 'qaf').items[0], falsy = find([company('qaf-false', { name: false as unknown as string, domain: 'qaf.example' })], 'qaf').items[0];
  assert.equal(zero.label, '0', 'el valor 0 es un nombre'); assert.equal(falsy.label, 'false', 'el valor false es un nombre'); assert.equal(find([company('qaf-name', { name: 'Qaf Nombre real' })], 'qaf').items[0].label, 'Qaf Nombre real');
});

test('A17b F2 ranking estable e inmutabilidad con fichas sin nombre: orden por etiqueta (ID) idéntico con la entrada invertida y sin mutar los datos', () => {
  const records = deepFreeze([company('qaf-b', { name: '', domain: 'qaf.example' }), company('qaf-c', { name: '  ' }), company('qaf-a', { name: null, domain: 'qaf.example' }), company('named', { name: 'Qaf Con Nombre' }), company('qaf', { name: '' })]);
  const before = JSON.stringify(records), expected = ['companies:qaf', 'companies:named', 'companies:qaf-a', 'companies:qaf-b', 'companies:qaf-c'];
  // Oráculo a mano: «qaf» (ID exacto, puntuación 0); «Qaf Con Nombre» empieza por «qaf » (el espacio ordena antes que «-»); luego los IDs qaf-a < qaf-b < qaf-c.
  assert.deepEqual(ids(find(records as CrmRecord[], 'qaf')), expected); assert.deepEqual(ids(find([...records].reverse() as CrmRecord[], 'qaf')), expected, 'la entrada invertida no cambia el orden');
  assert.equal(JSON.stringify(records), before, 'los datos no se mutaron (están congelados: una escritura habría lanzado)');
});

test('A17c F2 API: una ficha con nombre solo de espacios aparece con su ID como título, cuenta en totales y se abre con revisión exacta sin alterar el valor guardado (un nombre «» ni siquiera se activa: 422)', async () => {
  await assert.rejects(workspace([company('qaf-empty-required', { name: '' })]), (error: { status?: number }) => error.status === 422, 'el API no admite un nombre vacío en una activación: F2 solo es alcanzable con espacios o por la función compartida');
  const { app } = await workspace([company('qaf-blank', { name: '   ', domain: 'qaf.example' }), company('qaf-named', { name: 'Qaf Con Nombre' })]);
  try {
    const search = (await get(app, '/api/v2/search?q=qaf&limit=50')).json();
    assert.equal(search.total, 2); assert.equal(search.counts.companies, 2); assert.ok(search.items.every((item: { label: string }) => item.label.trim() !== ''), 'ningún título vacío: ' + JSON.stringify(search.items.map((i: { label: string }) => i.label)));
    assert.deepEqual(search.items.map((item: { id: string; label: string }) => [item.id, item.label]), [['qaf-named', 'Qaf Con Nombre'], ['qaf-blank', 'qaf-blank']]);
    const opened = (await get(app, openUrl('companies', 'qaf-blank', search.source))).json(); assert.equal(opened.record.values.name, '   ', 'el valor guardado no se altera: solo cambia el título mostrado');
  } finally { await app.close(); }
});

// ---------------------------------------------------------------- D · Hoy: criterio de negocio y completitud
const agentsFor = async (records: CrmRecord[], now: string) => { const w = await workspace(records); return { ...w, agents: new SalesAgents(w.store, false, undefined, () => new Date(now)) }; };

test('D1 criterio: oportunidad abierta sin tarea pendiente en [hoy, hoy+7]; vencidas, completadas y fuera de ventana no cubren; la tarea del cliente cubre', async () => {
  // Hoy = 2026-10-30 (Madrid, UTC+1 tras el cambio de hora del 25/10); ventana inclusive hasta 2026-11-06.
  const { agents, app } = await agentsFor([
    contact('k1', { firstname: 'Kappa' }),
    deal('d-none', {}), deal('d-cov-today', {}), deal('d-cov-edge', {}), deal('d-out', {}), deal('d-over', {}), deal('d-done', {}), deal('d-closed', { dealstage: 'won' }), deal('d-contact', { contact_id: 'k1' }),
    task('t-cov-today', { due_date: '2026-10-30', deal_id: 'd-cov-today' }), task('t-cov-edge', { due_date: '2026-11-06', deal_id: 'd-cov-edge' }), task('t-out', { due_date: '2026-11-07', deal_id: 'd-out' }),
    task('t-over', { due_date: '2026-10-29', deal_id: 'd-over' }), task('t-done', { due_date: '2026-10-31', status: 'completed', deal_id: 'd-done' }), task('t-contact', { due_date: '2026-11-01', contact_id: 'k1' }),
  ], '2026-10-30T10:00:00Z');
  try {
    const today = agents.today();
    assert.equal(today.date, '2026-10-30'); assert.equal(today.openDeals, 7, 'd-closed no es abierta');
    assert.deepEqual(today.opportunities.map(o => o.id), ['d-none', 'd-out', 'd-over', 'd-done']);
    assert.deepEqual(today.tasks.map(t => [t.id, t.overdue]), [['t-over', true], ['t-cov-today', false]], 'compromisos: vencidos y de hoy, ordenados por fecha');
    assert.deepEqual([today.overdueTasks, today.dueToday], [1, 1]); assert.deepEqual(today.listTotals, { opportunities: 4, tasks: 2 });
  } finally { await app.close(); }
});

test('D2 fechas iguales conservan orden estable por ID y la entrada se reordena sin cambiar el resultado', async () => {
  const tasks = ['t-09', 't-02', 't-11', 't-01', 't-10'].map(id => task(id, { due_date: '2026-10-29' }));
  const a = await agentsFor(tasks, '2026-10-30T10:00:00Z'), b = await agentsFor([...tasks].reverse(), '2026-10-30T10:00:00Z');
  try { assert.deepEqual(a.agents.today().tasks.map(t => t.id), ['t-01', 't-02', 't-09', 't-10', 't-11']); assert.deepEqual(b.agents.today().tasks.map(t => t.id), ['t-01', 't-02', 't-09', 't-10', 't-11']); }
  finally { await a.app.close(); await b.app.close(); }
});

test('D3 sin límite oculto: 47 prioridades y 63 compromisos completos con totales coincidentes', async () => {
  const deals = Array.from({ length: 47 }, (_, i) => deal('d-' + String(i).padStart(3, '0'), { dealname: 'Opp ' + i }));
  const tasks = Array.from({ length: 63 }, (_, i) => task('t-' + String(i).padStart(3, '0'), { due_date: i % 2 ? '2026-10-30' : '2026-10-01' }));
  const { agents, app } = await agentsFor([...deals, ...tasks], '2026-10-30T10:00:00Z');
  try {
    const today = agents.today();
    assert.equal(today.opportunities.length, 47); assert.equal(today.tasks.length, 63); assert.deepEqual(today.listTotals, { opportunities: 47, tasks: 63 });
    assert.equal(today.overdueTasks + today.dueToday, 63); assert.deepEqual(today.opportunities.map(o => o.id), deals.map(d => d.id), 'orden de negocio = orden de registros');
    const sorted = [...today.tasks].sort((x, y) => x.dueDate.localeCompare(y.dueDate) || (x.id < y.id ? -1 : 1)); assert.deepEqual(today.tasks, sorted);
  } finally { await app.close(); }
});

test('D4 tandas de 20+20+resto sin repetir propuestas; ninguna se aprueba ni ejecuta sola', async () => {
  const deals = Array.from({ length: 47 }, (_, i) => deal('d-' + String(i).padStart(3, '0'), { dealname: 'Opp ' + i }));
  const { agents, app } = await agentsFor(deals, '2026-10-30T10:00:00Z');
  try {
    const counts = [agents.run().proposals, agents.run().proposals, agents.run().proposals, agents.run().proposals];
    assert.deepEqual(counts, [20, 20, 7, 0]);
    const proposals = agents.overview().proposals; assert.equal(proposals.length, 47);
    assert.deepEqual(new Set(proposals.map(p => p.dealId)).size, 47, 'una propuesta por oportunidad y revisión');
    assert.ok(proposals.every(p => p.status === 'review' && p.approvedAt === null && p.completedAt === null), 'todas pendientes de revisión humana');
    assert.equal(agents.overview().artifacts.length, 0, 'sin artefactos simulados sin aprobación');
  } finally { await app.close(); }
});

test('D5 tope de 100 propuestas: se detiene en 100 exactos y el siguiente análisis se rechaza', async () => {
  const deals = Array.from({ length: 130 }, (_, i) => deal('d-' + String(i).padStart(3, '0'), { dealname: 'Opp ' + i }));
  const { agents, app } = await agentsFor(deals, '2026-10-30T10:00:00Z');
  try {
    for (let i = 0; i < 5; i++) assert.equal(agents.run().proposals, 20);
    assert.equal(agents.overview().proposals.length, 100); assert.equal(new Set(agents.overview().proposals.map(p => p.dealId)).size, 100);
    assert.throws(() => agents.run(), /límite de 100 propuestas/);
    assert.equal(agents.overview().proposals.length, 100);
  } finally { await app.close(); }
});

test('D6 una edición entre análisis invalida las propuestas anteriores (stale) y no se reutilizan', async () => {
  const { agents, app, store } = await agentsFor(Array.from({ length: 3 }, (_, i) => deal('d-' + i, { dealname: 'Opp ' + i })), '2026-10-30T10:00:00Z');
  try {
    agents.run(); store.saveRecord('deals', { dealname: 'Editada' }, 'd-0');
    assert.ok(agents.overview().proposals.every(p => p.stale), 'tras editar, las anteriores quedan obsoletas');
    assert.equal(agents.run().proposals, 3, 'la nueva revisión prepara propuestas nuevas, no reutiliza las obsoletas');
  } finally { await app.close(); }
});

test('D7 el motor no se habilita en runtime independiente ni con datos no ficticios', async () => {
  const { store, app } = await workspace([deal('d-1', {})]);
  try {
    const runtime = new SalesAgents(store, true); assert.equal(runtime.today().available, false); assert.deepEqual(runtime.today().listTotals, { opportunities: 0, tasks: 0 }); assert.throws(() => runtime.run(), /únicamente sobre datos ficticios/);
    const snapshotData = store.get<{ source: { isTestData: boolean } }>('snapshot', null as never); store.set('snapshot', { ...snapshotData, source: { ...snapshotData.source, isTestData: false } });
    assert.equal(new SalesAgents(store, false).today().available, false, 'datos no ficticios');
  } finally { await app.close(); }
});

test('D8 frontera horaria: un instante UTC cuenta en el día de Madrid, no en el UTC', async () => {
  // 2026-10-29T23:30Z = 30/10 00:30 en Madrid → «hoy» es 30/10; una tarea del 29 está vencida aunque en UTC sea «hoy».
  const { agents, app } = await agentsFor([task('t-29', { due_date: '2026-10-29' }), task('t-30', { due_date: '2026-10-30' })], '2026-10-29T23:30:00Z');
  try { const today = agents.today(); assert.equal(today.date, '2026-10-30'); assert.deepEqual(today.tasks.map(t => [t.id, t.overdue]), [['t-29', true], ['t-30', false]]); }
  finally { await app.close(); }
});

test('D9 cerca de 10.000 registros: listas completas, orden estable y último elemento alcanzable por la ventana de 20', async () => {
  const deals = Array.from({ length: 5000 }, (_, i) => deal('deal-' + String(i).padStart(5, '0'), { dealname: 'Oportunidad ' + i }));
  deals.push(deal('zz-last', { dealname: 'Aguja zzlast' }));
  const tasks = Array.from({ length: 4999 }, (_, i) => task('task-' + String(i).padStart(4, '0'), { due_date: '2020-01-01' }));
  assert.equal(deals.length + tasks.length, MAX_RECORDS);
  const { agents, app } = await agentsFor([...tasks, ...deals], '2026-10-30T10:00:00Z');
  try {
    const t0 = performance.now(), today = agents.today(), elapsed = Math.round(performance.now() - t0);
    assert.equal(today.opportunities.length, 5001); assert.equal(today.tasks.length, 4999); assert.deepEqual(today.listTotals, { opportunities: 5001, tasks: 4999 });
    assert.equal(today.tasks[0].id, 'task-0000'); assert.equal(today.tasks.at(-1)!.id, 'task-4998');
    const last = queueWindow(today.opportunities, { page: 10_000, size: 20 }); assert.equal(last.page, last.pages - 1); assert.equal(last.items.at(-1)!.id, 'zz-last'); assert.equal(last.total, 5001);
    assert.deepEqual(queueWindow(today.opportunities, { query: 'zzlast' }).items.map(i => i.id), ['zz-last']);
    console.log('# D9 medida (sin umbral): today() con 10.000 registros = ' + elapsed + ' ms');
  } finally { await app.close(); }
});

test('D10 queueWindow: no muta, conserva el orden, exige todos los términos sobre etiqueta+ID, acota páginas y rechaza límites', () => {
  const items = deepFreeze(Array.from({ length: 47 }, (_, i) => ({ id: 'ID-' + String(i).padStart(3, '0'), label: i === 30 ? 'José Ángel Núñez' : 'Elemento ' + i })));
  const first = queueWindow(items); assert.deepEqual([first.items.length, first.total, first.pages, first.start, first.end, first.hasMore], [20, 47, 3, 1, 20, true]);
  const last = queueWindow(items, { page: 2 }); assert.deepEqual([last.items.length, last.start, last.end, last.hasMore], [7, 41, 47, false]);
  assert.equal(queueWindow(items, { page: 99 }).page, 2, 'una página antigua tras acortar la lista se acota a la última');
  assert.deepEqual(queueWindow(items, { query: 'jose NUNEZ' }).items.map(i => i.id), ['ID-030'], 'acentos, mayúsculas y varios términos');
  assert.deepEqual(queueWindow(items, { query: 'id-030 ángel' }).items.map(i => i.id), ['ID-030'], 'términos repartidos entre etiqueta e ID');
  assert.deepEqual(queueWindow(items, { query: 'nada-coincide' }), { items: [], total: 0, page: 0, pages: 1, start: 0, end: 0, hasMore: false }, 'cero resultados');
  assert.deepEqual(queueWindow(items, { query: '   ' }).total, 47, 'consulta en blanco = sin filtro');
  assert.deepEqual(queueWindow(items, { size: 5 }).items.map(i => i.id), items.slice(0, 5).map(i => i.id));
  for (const bad of [{ size: 0 }, { size: 51 }, { page: -1 }, { page: 1.5 }, { query: 'x'.repeat(161) }]) assert.throws(() => queueWindow(items, bad), RangeError, JSON.stringify(bad).slice(0, 30));
});

// ---------------------------------------------------------------- A · componente WorkspaceSearch (arnés de hooks, no DOM)
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { createRequire } from 'node:module';
type VNode = { type: any; props: Record<string, any> };
function mountSearch(apiImpl: (url: string, init?: { signal?: AbortSignal }) => Promise<unknown>, initial: Record<string, unknown>) {
  const SRC = process.env.PLANB_UI_SRC ? path.resolve(process.env.PLANB_UI_SRC) : fileURLToPath(new URL('../src/', import.meta.url));
  const mocks: Record<string, any> = { api: { api: apiImpl, ApiError: class ApiError extends Error { constructor(public status: number, message: string) { super(message); } } }, components: { Spinner: function Spinner() { return null; } } };
  const cache = new Map<string, any>(); let hooks: any; let props = { ...initial };
  const jsx = (type: any, p: Record<string, any>) => ({ type, props: p });
  const requirePackage = createRequire(path.resolve(SRC, '../package.json'));
  const req = (spec: string, from = path.join(SRC, '__root.tsx')): any => {
    if (spec === 'react') return new Proxy({}, { get: (_t, name) => hooks[name as string] }); if (spec === 'react/jsx-runtime') return { jsx, jsxs: jsx, Fragment: Symbol.for('fragment') };
    if (spec === 'lucide-react') return new Proxy({}, { get: () => () => null }); if (spec.endsWith('.css')) return {};
    if (!spec.startsWith('.')) return requirePackage(spec);
    const key = path.basename(spec).replace(/\.js$/, ''); if (key in mocks) return mocks[key];
    const base = path.resolve(path.dirname(from), spec.replace(/\.js$/, '')), file = ['.tsx', '.ts'].map(e => base + e).find(f => fs.existsSync(f))!; if (cache.has(file)) return cache.get(file);
    const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
    const mod: { exports: any } = { exports: {} }; cache.set(file, mod.exports); new Function('require', 'exports', 'module', code)((child: string) => req(child, file), mod.exports, mod); cache.set(file, mod.exports); return mod.exports;
  };
  const slots: any[] = []; let cursor = 0, tree: any, effects: (() => void)[] = [];
  hooks = {
    useState(init: any) { const i = cursor++; if (!(i in slots)) slots[i] = typeof init === 'function' ? init() : init; return [slots[i], (v: any) => { slots[i] = typeof v === 'function' ? v(slots[i]) : v; }]; },
    useRef(init: any) { const i = cursor++; return slots[i] ?? (slots[i] = { current: init }); },
    useEffect(run: () => void | (() => void), deps?: unknown[]) { const i = cursor++, prior = slots[i]; if (!prior || !deps || deps.some((d, n) => !Object.is(d, prior.deps?.[n]))) effects.push(() => { prior?.cleanup?.(); slots[i] = { deps, cleanup: run() }; }); },
  };
  const Component = req('./WorkspaceSearch').WorkspaceSearch;
  const render = () => { cursor = 0; tree = Component(props); const pending = effects; effects = []; pending.forEach(e => e()); };
  const walk = (n: any): VNode[] => Array.isArray(n) ? n.flatMap(walk) : n && typeof n === 'object' && n.props ? [n, ...walk(n.props.children)] : [];
  const flat = (n: any): string => Array.isArray(n) ? n.map(flat).join('') : typeof n === 'string' || typeof n === 'number' ? String(n) : n?.props ? flat(n.props.children) : '';
  return { render, setProps: (next: Record<string, unknown>) => { props = { ...props, ...next }; }, unmount: () => slots.forEach(s => s?.cleanup?.()), nodes: () => walk(tree), text: (n?: any) => flat(n === undefined ? tree : n) };
}
const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

// A18 · F3. ALCANCE (conservado de QA060): reproducción con el componente REAL WorkspaceSearch.tsx dentro de un arnés mínimo de hooks (sin React DOM, sin navegador, sin App).
// Cambia `localRevision` por props: NO demuestra que el operador pueda provocar ese cambio desde el modal normal de App. El servidor simulado devuelve 409 si se le pasa una revisión
// que ya no es la actual (como el real), de modo que un offset heredado de otro contexto se vería como error o como rango imposible, no como un éxito casual.
function searchScenario() {
  const sets: Record<string, string[]> = { A: Array.from({ length: 43 }, (_, i) => 'Antiguo ' + String(i).padStart(2, '0')), B: ['Nuevo uno', 'Nuevo dos', 'Nuevo tres'] };
  const log: { n: number; ctx: string; offset: number; revision: string | null }[] = [];
  const state = { ctx: 'A' };
  const expectedContext = { instanceId: '00000000-0000-4000-8000-000000000146', captureId: 'cap', accountId: 'a', capturedAt: '2026-10-30T10:00:00Z', isTestData: true, contextRevision: 'c'.repeat(64) };
  const revisionOf = (ctx: string) => (ctx === 'A' ? 'a' : 'b').repeat(64);
  const server = async (url: string) => {
    const offset = Number(/offset=(\d+)/.exec(url)![1]), revision = /revision=([a-f0-9]+)/.exec(url)?.[1] ?? null, all = sets[state.ctx];
    log.push({ n: log.length, ctx: state.ctx, offset, revision });
    if (revision && revision !== revisionOf(state.ctx)) throw new Error('La copia cambió durante la búsqueda. Actualiza los resultados antes de continuar.');
    const items = all.slice(offset, offset + 20).map(label => ({ entity: 'contacts', id: label.replace(/\s/g, '-'), label, matchedId: false, matches: [], totalMatchedFields: 0 }));
    return { source: { ...expectedContext, revision: revisionOf(state.ctx) }, query: 'ab', offset, limit: 20, total: all.length, hasMore: offset + 20 < all.length, counts: { contacts: all.length, companies: 0, deals: 0, tasks: 0 }, items };
  };
  const previousDocument = (globalThis as any).document; (globalThis as any).document = { activeElement: null, body: { style: { overflow: '' } }, addEventListener() {}, removeEventListener() {}, querySelectorAll: () => [] };
  const h = mountSearch(server, { captureId: 'cap', expectedContext, localRevision: 1, close() {}, openRecord() {} });
  const settle = async () => { h.render(); await sleep(260); h.render(); await sleep(60); h.render(); };
  const button = (name: string) => h.nodes().find(n => n.type === 'button' && h.text(n) === name);
  const status = () => h.nodes().filter(n => n.type === 'p' && n.props.role === 'status').map(n => h.text(n)).join('|');
  const titles = () => h.nodes().filter(n => n.type === 'li').map(n => h.text(n));
  const spinners = () => h.nodes().filter(n => typeof n.type === 'function' && n.type.name === 'Spinner').length;
  const finish = () => { h.unmount(); (globalThis as any).document = previousDocument; };
  return { h, state, log, settle, button, status, titles, spinners, finish };
}

test('A18 QA060-F3 estando en la página 2 de 43, otra revisión con 3 resultados sale con offset 0, «1–3 de 3», los tres datos nuevos y sin spinner ni paginación vacía (componente real en arnés de hooks)', async () => {
  const s = searchScenario();
  try {
    s.h.render(); s.h.nodes().find(n => n.type === 'input' && n.props.type === 'search')!.props.onChange({ target: { value: 'ab' } }); await s.settle();
    assert.equal(s.status(), '1–20 de 43 resultados', 'precondición: primera página del contexto A'); const staleNextFromPage1 = s.button('Siguiente')!.props.onClick;
    staleNextFromPage1(); await s.settle(); assert.equal(s.status(), '21–40 de 43 resultados', 'precondición: página 2 del contexto A');
    const staleNextFromPage2 = s.button('Siguiente')!.props.onClick, stalePrevFromPage2 = s.button('Anterior')!.props.onClick;
    // Cambio de contexto: el contenido pasa a tener 3 resultados.
    const mark = s.log.length; s.state.ctx = 'B'; s.h.setProps({ localRevision: 2 }); await s.settle();
    assert.equal(s.status(), '1–3 de 3 resultados', 'rango exacto: ni «21–3» ni «21–5»');
    assert.deepEqual(s.titles().map(t => t.replace(/\s+/g, ' ')).map(t => ['Nuevo uno', 'Nuevo dos', 'Nuevo tres'].find(name => t.includes(name))), ['Nuevo uno', 'Nuevo dos', 'Nuevo tres'], 'los tres datos nuevos, en orden');
    assert.equal(s.titles().length, 3); assert.ok(s.titles().every(t => !/Antiguo/.test(t)), 'ningún dato del contexto anterior');
    assert.equal(s.spinners(), 0, 'no queda spinner'); assert.equal(s.h.nodes().filter(n => n.type === 'nav').length, 0, 'con 3 resultados no hay paginación (ni vacía)');
    assert.ok(s.log.length > mark && s.log.slice(mark).every(r => r.offset === 0 && r.revision === null), 'toda petición del contexto nuevo empieza en offset 0 sin revisión heredada: ' + JSON.stringify(s.log.slice(mark)));
    // Manejadores capturados ANTES del cambio no pueden reactivar un offset de otro contexto.
    const mark2 = s.log.length; staleNextFromPage1(); staleNextFromPage2(); stalePrevFromPage2(); await s.settle();
    assert.equal(s.status(), '1–3 de 3 resultados', 'un manejador antiguo no mueve la página del contexto nuevo'); assert.equal(s.titles().length, 3);
    assert.ok(s.log.slice(mark2).every(r => r.offset === 0), 'ninguna petición con offset heredado: ' + JSON.stringify(s.log.slice(mark2)));
  } finally { s.finish(); }
});

test('A18b F3 A→B→A no restaura la página 2 anterior por casualidad: vuelve a la primera y la paginación posterior sigue funcionando con la revisión actual', async () => {
  const s = searchScenario();
  try {
    s.h.render(); s.h.nodes().find(n => n.type === 'input' && n.props.type === 'search')!.props.onChange({ target: { value: 'ab' } }); await s.settle();
    s.button('Siguiente')!.props.onClick(); await s.settle(); assert.equal(s.status(), '21–40 de 43 resultados', 'precondición');
    s.state.ctx = 'B'; s.h.setProps({ localRevision: 2 }); await s.settle(); assert.equal(s.status(), '1–3 de 3 resultados');
    const mark = s.log.length; s.state.ctx = 'A'; s.h.setProps({ localRevision: 1 }); await s.settle();
    assert.equal(s.status(), '1–20 de 43 resultados', 'de vuelta en A empieza en la primera página, no en la 2 que tenía antes'); assert.match(s.titles()[0], /Antiguo 00/); assert.equal(s.titles().length, 20);
    assert.ok(s.log.slice(mark).every(r => r.offset === 0 && r.revision === null), 'peticiones tras volver: ' + JSON.stringify(s.log.slice(mark)));
    // Control positivo: paginar después del cambio funciona y envía la revisión del contexto actual.
    s.button('Siguiente')!.props.onClick(); await s.settle(); assert.equal(s.status(), '21–40 de 43 resultados'); const last = s.log.at(-1)!; assert.deepEqual([last.offset, last.revision], [20, 'a'.repeat(64)]);
    s.button('Siguiente')!.props.onClick(); await s.settle(); assert.equal(s.status(), '41–43 de 43 resultados', 'última página, rango correcto');
  } finally { s.finish(); }
});
