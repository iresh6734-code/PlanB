import assert from 'node:assert/strict';
import test from 'node:test';
import type { CrmRecord } from '../shared/model.js';
import { bulkFields, bulkSummary, planBulk, runBulk, undoItems, type BulkItem } from '../src/app-shell/bulk-edit.js';

const task = (id: string, status: string | null, extra: Record<string, unknown> = {}) => ({ entity: 'tasks', id, values: { subject: 'Tarea ' + id, status, ...extra } }) as unknown as CrmRecord;
const name = (record: CrmRecord) => String(record.values.subject);

test('only editable list and date fields can change in bulk, never the record name', () => {
  const entity = { displayField: 'subject', fields: [
    { key: 'subject', type: 'text', options: [] }, { key: 'status', type: 'enum', options: [{ id: 'open' }, { id: 'done' }] },
    { key: 'due', type: 'date', options: [] }, { key: 'kind', type: 'enum', options: [] }, { key: 'owner', type: 'enum', readOnly: true, options: [{ id: 'a' }] },
    { key: 'title', type: 'date', options: [] }] } as never;
  assert.deepEqual(bulkFields({ ...(entity as object), displayField: 'title' } as never).map(field => field.key), ['status', 'due']);
  assert.deepEqual(bulkFields(entity).map(field => field.key), ['status', 'due', 'title']);
});

test('the plan skips records that already have the value, treating empty and null alike', () => {
  const plan = planBulk([task('1', 'open'), task('2', 'done'), task('3', null), task('4', '')], 'status', 'done');
  assert.deepEqual(plan.items.map(item => [item.record.id, item.before, item.after]), [['1', 'open', 'done'], ['3', null, 'done'], ['4', null, 'done']]);
  assert.equal(plan.unchanged, 1);
  assert.equal(planBulk([task('3', null), task('4', '')], 'status', '').items.length, 0);
});

test('a failure does not stop the batch, and progress counts every attempt', async () => {
  const { items } = planBulk([task('1', 'open'), task('2', 'open'), task('3', 'open')], 'status', 'done');
  const progress: string[] = [];
  const result = await runBulk(items, async item => { if (item.record.id === '2') return 'Falta la fecha.'; if (item.record.id === '3') throw new Error('Sin conexión'); return null; }, { onProgress: (handled, total) => progress.push(handled + '/' + total) });
  assert.deepEqual(result.done.map(item => item.record.id), ['1']);
  assert.deepEqual(result.failed.map(entry => [entry.item.record.id, entry.reason]), [['2', 'Falta la fecha.'], ['3', 'Sin conexión']]);
  assert.deepEqual(progress, ['1/3', '2/3', '3/3']);
  assert.equal(bulkSummary(result, name), '1 registro cambiado · 2 sin cambiar («Tarea 2»: Falta la fecha. y 1 más).');
});

test('cancelling leaves the remaining records untouched and says so', async () => {
  const { items } = planBulk([task('1', 'open'), task('2', 'open'), task('3', 'open')], 'status', 'done');
  const control = new AbortController(), saved: string[] = [];
  const result = await runBulk(items, async item => { saved.push(item.record.id); if (saved.length === 1) control.abort(); return null; }, { signal: control.signal });
  assert.deepEqual(saved, ['1']);
  assert.equal(result.cancelled, 2);
  assert.equal(bulkSummary(result, name), '1 registro cambiado · 2 sin intentar por cancelar.');
});

test('undo reverts only what was saved, newest first, and leaves alone fields changed again since', async () => {
  const { items } = planBulk([task('1', 'open'), task('2', null), task('3', 'open')], 'status', 'done');
  const result = await runBulk(items, async item => item.record.id === '3' ? 'No' : null);
  const fresh = new Map([['1', task('1', 'done', { note: 'nuevo' })]]);
  const undo = undoItems(result, id => fresh.get(id));
  assert.deepEqual(undo.items.map((item: BulkItem) => [item.record.id, item.before, item.after]), [['2', 'done', null], ['1', 'done', 'open']]);
  assert.equal(undo.items[1].record.values.note, 'nuevo');
  assert.equal(undo.skipped, 0);
  fresh.set('2', task('2', 'open'));
  assert.deepEqual(undoItems(result, id => fresh.get(id)), { items: [undo.items[1]], skipped: 1 });
  assert.equal(bulkSummary({ done: undo.items, failed: [], cancelled: 0 }, name, true), 'Deshecho el cambio en 2 registros.');
});
