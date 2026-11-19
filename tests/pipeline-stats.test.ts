import test from 'node:test';
import assert from 'node:assert/strict';
import { makeDemoSpec, makeFixture } from '../shared/fixtures.js';
import type { Change, CrmRecord } from '../shared/model.js';
import { journalNote, periodRange, pipelineStats } from '../src/app-shell/pipeline-stats.js';

const spec = { ...makeDemoSpec(makeFixture('agency')) };
spec.stages = [...spec.stages, { id: 'lost', label: 'Perdida', color: '#999999' }];
const deal = (id: string, values: CrmRecord['values']): CrmRecord => ({ id, entity: 'deals', values });
let next = 1;
const change = (at: string, recordId: string, from: string | null, to: string, operation: Change['operation'] = from === null ? 'create' : 'update'): Change =>
  ({ id: next++, at, entity: 'deals', recordId, operation, before: from === null ? null : deal(recordId, { dealstage: from }), after: deal(recordId, { dealstage: to }) });

test('periodos en días de Madrid', () => {
  assert.deepEqual(periodRange('month', '2026-11-19'), { from: '2026-11-01', to: '2026-11-19' });
  assert.deepEqual(periodRange('year', '2026-11-19'), { from: '2026-01-01', to: '2026-11-19' });
  assert.deepEqual(periodRange('quarter', '2026-11-19'), { from: '2026-08-22', to: '2026-11-19' });
});

test('cierres exactos del diario, aproximados por fecha de cierre, tasa, ciclo, conversión y pérdidas por etapa', () => {
  next = 1;
  const changes = [
    change('2026-10-28T09:00:00Z', 'a', null, 'contact'),
    change('2026-11-02T09:00:00Z', 'a', 'contact', 'proposal'),
    change('2026-11-12T09:00:00Z', 'a', 'proposal', 'won'),
    change('2026-11-03T09:00:00Z', 'b', 'contact', 'proposal'),
    change('2026-11-05T09:00:00Z', 'b', 'proposal', 'lost'),
    change('2026-11-06T09:00:00Z', 'c', 'contact', 'proposal'),
    { ...change('2026-11-07T09:00:00Z', 'x', 'proposal', 'won'), entity: 'tasks' as const },
  ];
  const deals = [
    deal('a', { dealstage: 'won', amount: 4000 }),
    deal('b', { dealstage: 'lost', amount: 900 }),
    deal('c', { dealstage: 'proposal', amount: 100 }),
    deal('d', { dealstage: 'won', amount: '', closedate: '2026-11-08' }),
    deal('e', { dealstage: 'won', amount: 7000, closedate: '2026-10-01' }),
  ];
  const stats = pipelineStats({ spec, deals, changes, from: '2026-11-01', to: '2026-11-19' });
  assert.deepEqual(stats.won, { count: 2, exact: 1, approx: 1, amount: 4000, average: 4000, missingAmount: 1 });
  assert.deepEqual(stats.lost, { count: 1, exact: 1, approx: 0 });
  assert.equal(stats.winRate, 2 / 3);
  assert.deepEqual(stats.cycle, { average: 15, sample: 1 }, 'de la creación (28/10) a ganada (12/11)');
  const proposal = stats.conversion.find(item => item.stageId === 'proposal')!;
  assert.deepEqual([proposal.entered, proposal.advanced, proposal.lost, proposal.rate], [3, 1, 1, 1 / 3]);
  assert.deepEqual(stats.lostByStage, [{ stageId: 'proposal', label: 'Propuesta', count: 1 }]);
  assert.equal(stats.journalFrom, '2026-10-28');
  assert.equal(stats.approximate, true, 'hay una ganada sin paso registrado');
});

test('sin diario todo es aproximado y se dice', () => {
  const stats = pipelineStats({ spec, deals: [deal('l', { dealstage: 'lost', closedate: '2026-11-03' })], changes: [], from: '2026-11-01', to: '2026-11-19' });
  assert.equal(stats.winRate, 0);
  assert.deepEqual(stats.lostByStage, [{ stageId: null, label: 'Etapa anterior desconocida', count: 1 }]);
  assert.equal(stats.approximate, true);
  assert.match(journalNote(stats), /^Todavía no hay cambios/);
  assert.match(journalNote({ journalFrom: '2026-11-05', from: '2026-11-01' }), /empieza el 5\/11/);
  assert.match(journalNote({ journalFrom: '2026-10-05', from: '2026-11-01' }), /^Todo el periodo/);
});
