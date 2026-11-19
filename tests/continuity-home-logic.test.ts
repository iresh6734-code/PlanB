import test from 'node:test';
import assert from 'node:assert/strict';
import { nextActionBlocked, pageLedger, type NextActionGate } from '../src/app-shell/continuity-home-logic.js';
import type { LedgerDay } from '../src/app-shell/continuity-insights.js';

const day = (key: string, count: number): LedgerDay => ({ key, label: key, bytes: count * 10, entries: Array.from({ length: count }, (_, i) => ({ id: key + i, at: key + 'T10:00:00Z', bytes: 10, delta: null, shrink: false })) });

test('la página del diario reparte el cupo entre días y no deja días vacíos', () => {
  const days = [day('2026-11-19', 3), day('2026-11-18', 4), day('2026-11-17', 2)];
  const page = pageLedger(days, 9, false, 5);
  assert.deepEqual(page.days.map(d => [d.key, d.entries.length]), [['2026-11-19', 3], ['2026-11-18', 2]]);
  assert.equal(page.hidden, 4);
  assert.equal(days[1].entries.length, 4, 'no altera el diario original');
});

test('«ver todo» enseña todas las capturas y no oculta ninguna', () => {
  const page = pageLedger([day('a', 8), day('b', 7)], 15, true, 5);
  assert.equal(page.days.reduce((sum, d) => sum + d.entries.length, 0), 15);
  assert.equal(page.hidden, 0);
  assert.deepEqual(pageLedger([], 0, false), { days: [], hidden: 0 });
});

const free: NextActionGate = { busy: false, jobRunning: false, connected: true, inSession: false, ready: true, hasCapture: true };
test('la acción recomendada se bloquea según lo que pide cada una', () => {
  assert.equal(nextActionBlocked('refresh', free), false);
  assert.equal(nextActionBlocked('prepare', { ...free, busy: true }), true);
  for (const id of ['refresh', 'resume', 'drill'] as const) assert.equal(nextActionBlocked(id, { ...free, jobRunning: true }), true, id);
  assert.equal(nextActionBlocked('export', { ...free, jobRunning: true }), false);
  assert.equal(nextActionBlocked('refresh', { ...free, connected: false }), true);
  assert.equal(nextActionBlocked('refresh', { ...free, inSession: true }), true);
  assert.equal(nextActionBlocked('export', { ...free, ready: false }), true);
  assert.equal(nextActionBlocked('drill', { ...free, hasCapture: false }), true);
  assert.equal(nextActionBlocked('protect', { ...free, connected: false, ready: false, hasCapture: false }), false);
});
