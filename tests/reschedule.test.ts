import assert from 'node:assert/strict';
import test from 'node:test';
import type { CrmRecord } from '../shared/model.js';
import { MAX_BULK } from '../src/app-shell/bulk-edit.js';
import { planReschedule } from '../src/app-shell/reschedule.js';

const deal = (id: string, close: string | null, amount = 0) => ({ entity: 'deals', id, values: { dealname: 'Op ' + id, closedate: close, amount } }) as unknown as CrmRecord;
const FRIDAY = '2026-11-20';

test('only deals whose close date already passed are moved, never to today or earlier, and never to a weekend', () => {
  const plan = planReschedule([deal('a', '2026-11-02'), deal('b', FRIDAY), deal('c', '2026-12-01'), deal('d', null), deal('e', 'pronto'), deal('f', '2026-10-30T09:00:00Z')], 'closedate', FRIDAY, { perDay: 1 });
  assert.deepEqual(plan.items.map(item => [item.record.id, item.before, item.after]), [['f', '2026-10-30T09:00:00Z', '2026-11-23'], ['a', '2026-11-02', '2026-11-24']]);
  assert.deepEqual([plan.first, plan.last, plan.skipped], ['2026-11-23', '2026-11-24', 0]);
  assert.ok(plan.items.every(item => item.key === 'closedate' && item.after! > FRIDAY));
});

test('the biggest amounts get the first days, the pace caps each day, and the week break is skipped', () => {
  const deals = [deal('s', '2026-11-10', 100), deal('l', '2026-11-12', 9000), deal('m', '2026-11-01', 500), deal('m2', '2026-10-01', 500), deal('x', '2026-11-11', 50)];
  const plan = planReschedule(deals, 'closedate', '2026-11-19', { perDay: 2, amountKey: 'amount' });
  assert.deepEqual(plan.items.map(item => item.record.id + '@' + item.after), ['l@2026-11-20', 'm2@2026-11-20', 'm@2026-11-23', 's@2026-11-23', 'x@2026-11-24']);
  assert.equal(planReschedule(deals, 'closedate', '2026-11-19', { perDay: 0 }).items[1].after, '2026-11-23');
});

test('a batch never goes over the bulk limit and says how many are left', () => {
  const many = Array.from({ length: MAX_BULK + 3 }, (_, index) => deal(String(index).padStart(3, '0'), '2026-01-05'));
  const plan = planReschedule(many, 'closedate', FRIDAY, { perDay: 5 });
  assert.equal(plan.items.length, MAX_BULK);
  assert.equal(plan.skipped, 3);
  assert.deepEqual(planReschedule([], 'closedate', FRIDAY), { items: [], first: null, last: null, skipped: 0 });
});
