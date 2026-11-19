import test from 'node:test';
import assert from 'node:assert/strict';
import { makeDemoSpec, makeFixture } from '../shared/fixtures.js';
import type { CrmRecord, EntityName } from '../shared/model.js';
import { accountHealth } from '../src/app-shell/account-health.js';
import type { RelatedGroup } from '../src/app-shell/related.js';

const spec = makeDemoSpec(makeFixture('agency'));
const rec = (entity: EntityName, id: string, values: CrmRecord['values']): CrmRecord => ({ entity, id, values });
const group = (entity: EntityName, fieldKey: string, records: CrmRecord[], total = records.length): RelatedGroup => ({ entity, label: entity, fieldKey, fieldLabel: fieldKey, records, scanned: records.length, total });
const today = '2026-11-19';
const contact = rec('contacts', 'c1', { firstname: 'Ana', email: 'ana@acme.test', phone: '600000000' });

test('al día: oportunidad abierta, próxima tarea y actividad reciente', () => {
  const health = accountHealth(spec, contact, [
    group('deals', 'contact_id', [rec('deals', 'd1', { dealstage: 'proposal', amount: 1200, closedate: '2026-12-10', contact_id: 'c1' })]),
    group('tasks', 'contact_id', [rec('tasks', 't1', { due_date: '2026-11-10', status: 'completed' }), rec('tasks', 't2', { due_date: '2026-11-25', status: 'pending' })]),
  ], today);
  assert.equal(health.level, 'good');
  assert.match(health.headline, /^Al día/);
  assert.deepEqual(health.reasons.map(r => r.text), [`1 oportunidad abierta por ${new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0, useGrouping: 'always' } as Intl.NumberFormatOptions).format(1200)}`, 'Próxima tarea el 25/11']);
  assert.equal(health.partial, false);
});

test('riesgo: cierre vencido, tareas vencidas y datos que faltan, con el riesgo primero', () => {
  const health = accountHealth(spec, rec('contacts', 'c2', { firstname: 'Luis', email: '', phone: null }), [
    group('deals', 'contact_id', [rec('deals', 'd2', { dealstage: 'negotiation', amount: 500, closedate: '2026-11-01' }), rec('deals', 'd3', { dealstage: 'won', amount: 900 })], 300),
    group('tasks', 'contact_id', [rec('tasks', 't3', { due_date: '2026-11-15', status: 'pending' }), rec('tasks', 't4', { due_date: '2026-11-16', status: 'pending' })]),
  ], today);
  assert.equal(health.level, 'risk');
  assert.equal(health.headline, 'Necesita atención: 1 oportunidad abierta con el cierre vencido');
  assert.deepEqual(health.reasons.filter(r => r.tone === 'risk').map(r => r.text), ['1 oportunidad abierta con el cierre vencido', '2 tareas vencidas']);
  assert.ok(health.reasons.some(r => r.text === 'Faltan datos: Correo, Teléfono'));
  assert.equal(health.reasons.at(-1)!.tone, 'good');
  assert.equal(health.partial, true, 'si no se revisaron todos los registros, se avisa');
});

test('a revisar: sin oportunidades abiertas, sin tareas pendientes y parada hace más de 60 días', () => {
  const health = accountHealth(spec, contact, [
    group('deals', 'contact_id', [rec('deals', 'd4', { dealstage: 'won', amount: 100 })]),
    group('tasks', 'contact_id', [rec('tasks', 't5', { due_date: '2026-08-01', status: 'completed' })]),
  ], today);
  assert.equal(health.level, 'watch');
  assert.deepEqual(health.reasons.map(r => r.text), ['Sin oportunidades abiertas (1 ganada antes)', 'Sin tareas pendientes', 'Última actividad hace 110 días']);
});

test('una empresa sin clientes asociados lo dice; sin nada relacionado no se inventa una valoración', () => {
  const company = rec('companies', 'co1', { name: 'Acme', domain: 'acme.test', phone: '910000000' });
  const health = accountHealth(spec, company, [group('contacts', 'company_id', []), group('deals', 'company_id', [])], today);
  assert.deepEqual(health.reasons.map(r => r.text), ['Sin oportunidades abiertas', 'Sin clientes asociados']);
  assert.equal(accountHealth(spec, company, [], today).headline, 'Sin datos suficientes para valorarla');
});
