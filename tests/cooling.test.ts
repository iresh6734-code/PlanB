import test from 'node:test';
import assert from 'node:assert/strict';
import { makeDemoSpec, makeFixture } from '../shared/fixtures.js';
import type { CrmRecord, EntityName } from '../shared/model.js';
import { coolingAccounts } from '../src/app-shell/cooling.js';

const spec = makeDemoSpec(makeFixture('agency'));
const today = '2026-11-19';
const rec = (entity: EntityName, id: string, values: CrmRecord['values']): CrmRecord => ({ entity, id, values });
const accounts = [
  rec('companies', 'co1', { name: 'Arce' }), rec('companies', 'co2', { name: 'Norte' }), rec('companies', 'co3', { name: 'Sur' }),
  rec('contacts', 'ct1', { firstname: 'Ana', company_id: 'co2' }), rec('contacts', 'ct2', { firstname: 'Luis' }),
];

test('se enfrían las que tienen oportunidad abierta, nada previsto y su última actividad es antigua; cada una con su motivo', () => {
  const list = coolingAccounts(spec, {
    accounts,
    deals: [
      rec('deals', 'd1', { dealstage: 'proposal', amount: 3000, company_id: 'co1' }),
      rec('deals', 'd2', { dealstage: 'negotiation', amount: 8000, company_id: 'co2', contact_id: 'ct1' }),
      rec('deals', 'd3', { dealstage: 'contact', amount: 500, contact_id: 'ct2' }),
      rec('deals', 'd4', { dealstage: 'won', amount: 99000, company_id: 'co3' }),
    ],
    tasks: [
      rec('tasks', 't1', { due_date: '2026-09-01', status: 'completed', deal_id: 'd1' }),
      rec('tasks', 't2', { due_date: '2026-11-10', status: 'completed', contact_id: 'ct1' }),
    ],
  }, today);
  assert.deepEqual(list.map(item => item.record.id), ['co1', 'ct2'], 'Norte tiene actividad reciente por su cliente; Sur no tiene nada abierto');
  assert.equal(list[0]!.days, 79);
  assert.match(list[0]!.reason, /^Sin actividad desde hace 79 días y nada previsto · 1 oportunidad abierta por /);
  assert.equal(list[1]!.lastActivity, null);
  assert.match(list[1]!.reason, /^Ninguna tarea registrada y nada previsto/);
});

test('una tarea pendiente (con fecha futura o sin fecha) cuenta como paso previsto; el umbral es configurable', () => {
  const deals = [rec('deals', 'd1', { dealstage: 'proposal', amount: 3000, company_id: 'co1' })];
  const old = rec('tasks', 't1', { due_date: '2026-10-01', status: 'completed', deal_id: 'd1' });
  assert.equal(coolingAccounts(spec, { accounts, deals, tasks: [old, rec('tasks', 't2', { due_date: '', status: 'pending', deal_id: 'd1' })] }, today).length, 0);
  assert.equal(coolingAccounts(spec, { accounts, deals, tasks: [old, rec('tasks', 't3', { due_date: '2026-12-01', status: 'pending', deal_id: 'd1' })] }, today).length, 0);
  assert.equal(coolingAccounts(spec, { accounts, deals, tasks: [old] }, today).length, 1, '49 días > 30');
  assert.equal(coolingAccounts(spec, { accounts, deals, tasks: [old] }, today, 60).length, 0);
  assert.equal(coolingAccounts(spec, { accounts: [], deals, tasks: [] }, today).length, 0, 'sin la ficha cargada no se lista');
});
