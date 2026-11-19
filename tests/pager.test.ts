import assert from 'node:assert/strict';
import test from 'node:test';
import type { CrmRecord } from '../shared/model.js';
import { pagedLabel, readPages, type ListPage } from '../src/app-shell/pager.js';

const deal = (id: number, entity: CrmRecord['entity'] = 'deals') => ({ entity, id: String(id), values: {} }) as unknown as CrmRecord;
const range = (from: number, to: number) => Array.from({ length: Math.max(0, to - from) }, (_, index) => deal(from + index));
/** Servidor de mentira: `total` registros, cortados por offset/limit; anota cada petición. */
function server(total: number, tweak: (page: ListPage, offset: number) => ListPage = page => page) {
  const calls: number[] = [];
  const readPage = async (offset: number, limit: number) => { calls.push(offset); return tweak({ records: range(offset, Math.min(offset + limit, total)), related: [], total }, offset); };
  return { calls, readPage };
}

test('reads every page until the total and stops there', async () => {
  const { calls, readPage } = server(250);
  const read = await readPages(readPage, new AbortController().signal, { pageSize: 100, maxPages: 10 });
  assert.deepEqual(calls, [0, 100, 200]);
  assert.equal(read.scanned, 250); assert.equal(read.total, 250); assert.equal(read.complete, true);
});

test('the page cap leaves an honest partial read', async () => {
  const { calls, readPage } = server(1250);
  const read = await readPages(readPage, new AbortController().signal, { pageSize: 100, maxPages: 10 });
  assert.equal(calls.length, 10);
  assert.equal(read.scanned, 1000); assert.equal(read.total, 1250); assert.equal(read.complete, false);
  assert.equal(pagedLabel(read, false, { one: 'oportunidad', many: 'oportunidades' }), 'Calculado con 1000 de 1250 oportunidades');
});

test('a repeated page stops the read without counting duplicates', async () => {
  const { calls, readPage } = server(145, page => ({ ...page, records: range(0, 100) }));
  const read = await readPages(readPage, new AbortController().signal, { pageSize: 100, maxPages: 10 });
  assert.deepEqual(calls, [0, 100]);
  assert.equal(read.scanned, 100); assert.equal(read.complete, false);
});

test('foreign records and a changing total make the read incomplete; related records are deduplicated', async () => {
  const foreign = server(150, (page, offset) => offset === 0 ? { ...page, records: [...page.records.slice(0, 99), deal(999, 'tasks')], related: [deal(7, 'companies'), deal(7, 'companies')] } : page);
  const read = await readPages(foreign.readPage, new AbortController().signal, { pageSize: 100, maxPages: 10, accept: record => record.entity === 'deals' });
  assert.equal(read.records.some(record => record.id === '999'), false);
  assert.equal(read.related.length, 1);
  assert.equal(read.complete, false);
  const moving = server(150, (page, offset) => offset === 100 ? { ...page, total: 151 } : page);
  const drift = await readPages(moving.readPage, new AbortController().signal, { pageSize: 100, maxPages: 10 });
  assert.equal(drift.total, 151); assert.equal(drift.complete, false);
});

test('an empty server is one request and reports zero', async () => {
  const { calls, readPage } = server(0);
  const read = await readPages(readPage, new AbortController().signal, { pageSize: 100, maxPages: 10 });
  assert.deepEqual(calls, [0]);
  assert.equal(read.complete, true);
  assert.equal(pagedLabel(read, false, { one: 'oportunidad', many: 'oportunidades' }), '0 oportunidades');
});

test('progress is reported after each page and cancelling stops before the next request', async () => {
  const controller = new AbortController(), seen: number[] = [];
  const { calls, readPage } = server(300);
  await assert.rejects(readPages(readPage, controller.signal, { pageSize: 100, maxPages: 10, onPage: read => { seen.push(read.scanned); if (read.scanned === 200) controller.abort(); } }), { name: 'AbortError' });
  assert.deepEqual(seen, [100, 200]);
  assert.deepEqual(calls, [0, 100]);
  assert.equal(pagedLabel({ scanned: 200, total: 300, complete: false }, true, { one: 'oportunidad', many: 'oportunidades' }), 'Cargando 200 de 300 oportunidades…');
  assert.equal(pagedLabel({ scanned: 1, total: 1, complete: true }, false, { one: 'oportunidad', many: 'oportunidades' }), '1 oportunidad');
});
