import test from 'node:test';
import assert from 'node:assert/strict';
import { goalProgress, parseGoal, readGoal, wonInMonth, workdaysLeft, writeGoal, GOAL_KEY } from '../src/app-shell/goal.js';

const memory = () => { const data = new Map<string, string>(); return { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => void data.set(key, value), removeItem: (key: string) => void data.delete(key), data }; };

test('el objetivo se guarda como una cifra y se descarta lo que no lo es', () => {
  const store = memory();
  assert.equal(readGoal(store), null);
  assert.equal(writeGoal(25000.4, store), true);
  assert.equal(store.data.get(GOAL_KEY), '25000');
  assert.equal(readGoal(store), 25000);
  store.setItem(GOAL_KEY, '-3'); assert.equal(readGoal(store), null);
  store.setItem(GOAL_KEY, 'mucho'); assert.equal(readGoal(store), null);
  writeGoal(null, store); assert.equal(store.data.has(GOAL_KEY), false);
  assert.equal(writeGoal(100, null), false);
});

test('se entiende la cifra escrita a la española', () => {
  assert.equal(parseGoal('12.500'), 12500);
  assert.equal(parseGoal('12500 €'), 12500);
  assert.equal(parseGoal('12,5k'), 12500);
  assert.equal(parseGoal('1.234.567'), 1234567);
  assert.equal(parseGoal('20 mil'), 20000);
  assert.equal(parseGoal('0'), null);
  assert.equal(parseGoal('doce'), null);
});

test('días laborables que quedan en el mes, hoy incluido', () => {
  assert.equal(workdaysLeft('2026-11-19'), 8, 'jueves 19 → 19, 20, 23–27 y 30');
  assert.equal(workdaysLeft('2026-11-30'), 1);
  assert.equal(workdaysLeft('2026-11-29'), 1, 'un domingo no cuenta');
  assert.equal(workdaysLeft('no'), 0);
});

test('ganado en el mes: solo ganadas con cierre este mes; sin fecha o sin importe, aparte', () => {
  const stages = new Map([['won', { id: 'won', label: 'Ganada' }], ['open', { id: 'open', label: 'Propuesta' }]]);
  const deal = (id: string, values: Record<string, unknown>) => ({ id, entity: 'deals' as const, values: values as never });
  const result = wonInMonth([
    deal('a', { stage: 'won', amount: 1000, close: '2026-11-03' }), deal('b', { stage: 'won', amount: '', close: '2026-11-10' }),
    deal('c', { stage: 'won', amount: 500, close: '2026-10-30' }), deal('d', { stage: 'won', amount: 700 }),
    deal('e', { stage: 'open', amount: 900, close: '2026-11-04' }),
  ], { stageKey: 'stage', amountKey: 'amount', closeKey: 'close', stages }, '2026-11-19');
  assert.deepEqual(result, { amount: 1000, deals: 2, missingAmount: 1, undated: 1 });
});

test('progreso: estados, barra sin contar dos veces y ritmo por día laborable', () => {
  const base = { goal: 10000, today: '2026-11-19' };
  assert.equal(goalProgress({ ...base, won: 10500, committed: 0, probable: 0 }).status, 'reached');
  assert.equal(goalProgress({ ...base, won: 6000, committed: 4000, probable: 3000 }).status, 'covered');
  const reachable = goalProgress({ ...base, won: 4000, committed: 2000, probable: 6000 });
  assert.equal(reachable.status, 'reachable');
  assert.deepEqual(reachable.bars, { won: 0.4, committed: 0.2, probable: 0.4 });
  assert.equal(reachable.gap, 6000);
  assert.equal(reachable.perDay, 750);
  const short = goalProgress({ ...base, won: 1000, committed: 0, probable: 500 });
  assert.equal(short.status, 'short');
  const over = goalProgress({ ...base, won: 15000, committed: 5000, probable: 0 });
  assert.ok(over.bars.won + over.bars.committed + over.bars.probable <= 1 + 1e-9, 'la barra nunca pasa del total');
  assert.equal(over.perDay, null);
});
