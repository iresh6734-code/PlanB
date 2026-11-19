import test from 'node:test';
import assert from 'node:assert/strict';
import { makeDemoSpec, makeFixture } from '../shared/fixtures.js';
import type { CrmRecord } from '../shared/model.js';
import { dealRiskReasons, dealRisks, riskBase, riskTally, type RiskContext } from '../src/app-shell/deal-risk.js';

const spec = makeDemoSpec(makeFixture('agency'));
const today = '2026-11-19';
const deal = (id: string, values: CrmRecord['values']): CrmRecord => ({ id, entity: 'deals', values });
const context = (pulse?: RiskContext['pulse']): RiskContext => ({ ...riskBase(spec), today, pulse });

test('cada motivo sale con su texto: cierre vencido, lo que pide la etapa, sin próximo paso y parada', () => {
  const pulse = new Map([['stale', { open: 1, undated: 0, next: '2026-09-01', last: '2026-09-01' }]]);
  const late = dealRiskReasons(deal('late', { dealstage: 'negotiation', amount: 900, closedate: '2026-11-16' }), context(pulse));
  assert.deepEqual(late.map(reason => [reason.kind, reason.tone]), [['close-late', 'danger'], ['no-next', 'warn']]);
  assert.equal(late[0]!.text, 'Cierre vencido hace 3 días');
  const missing = dealRiskReasons(deal('stale', { dealstage: 'negotiation', amount: '', closedate: '' }), context(pulse));
  assert.deepEqual(missing.map(reason => reason.kind), ['missing', 'stalled']);
  assert.match(missing[0]!.text, /^Falta .*importe.* para «Negociación»$/i);
  assert.match(missing[1]!.text, /^Parada: último paso hace \d+ días$/);
});

test('sin tareas leídas no se juzga el próximo paso; ganadas y etapas desconocidas no tienen riesgo', () => {
  assert.deepEqual(dealRiskReasons(deal('a', { dealstage: 'negotiation', amount: 900, closedate: '2026-12-20' }), context()), []);
  assert.deepEqual(dealRiskReasons(deal('b', { dealstage: 'won', amount: '', closedate: '2026-01-01' }), context(new Map())), []);
  assert.deepEqual(dealRiskReasons(deal('c', { dealstage: 'ghost', closedate: '2026-01-01' }), context(new Map())), []);
});

test('orden: primero lo grave, después más motivos y, a igualdad, más importe; y recuento por motivo', () => {
  const pulse = new Map([['busy', { open: 1, undated: 0, next: '2026-11-25', last: '2026-11-25' }], ['busy2', { open: 1, undated: 0, next: '2026-11-25', last: '2026-11-25' }], ['busy3', { open: 1, undated: 0, next: '2026-11-25', last: '2026-11-25' }]]);
  const risks = dealRisks([
    deal('small', { dealstage: 'contact', amount: 100 }),
    deal('busy', { dealstage: 'negotiation', amount: '', closedate: '2026-12-20' }),
    deal('busy2', { dealstage: 'negotiation', amount: 5000, closedate: '2026-11-01' }),
    deal('busy3', { dealstage: 'contact', amount: 9000 }),
    { id: 't', entity: 'tasks', values: {} },
  ], context(pulse));
  assert.deepEqual(risks.map(risk => risk.record.id), ['busy2', 'small', 'busy']);
  assert.equal(risks[0]!.stage.label, 'Negociación');
  assert.equal(risks[1]!.amount, 100);
  assert.deepEqual(riskTally(risks), { 'close-late': 1, missing: 1, 'no-next': 1, stalled: 0 });
});
