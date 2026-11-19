import test from 'node:test';
import assert from 'node:assert/strict';
import { makeDemoSpec, makeFixture } from '../shared/fixtures.js';
import { fingerprint, mergeFields, planMerge, recordLabel } from '../shared/merge-plan.js';
import type { CrmRecord } from '../shared/model.js';

const snapshot = makeFixture();
const spec = makeDemoSpec(snapshot);
const keeper = snapshot.records.find(record => record.id === 'contact-1')!;
const duplicate: CrmRecord = { id: 'local-dup', entity: 'contacts', values: { firstname: 'Lucía', lastname: 'Martín', email: 'lucia.trabajo@example.com', phone: '611 111 111', company_id: null, service: 'brand' } };

test('mergeFields lists only differing fields in model order and marks what cannot be taken', () => {
  const fields = mergeFields(spec, keeper, duplicate);
  assert.deepEqual(fields.map(field => field.key), ['email', 'phone', 'company_id', 'service']);
  const company = fields.find(field => field.key === 'company_id')!;
  assert.equal(company.choosable, false);
  assert.equal(company.reason, 'empty');
  assert.ok(fields.filter(field => field.key !== 'company_id').every(field => field.choosable));
  const locked = structuredClone(spec);
  locked.entities.find(entity => entity.id === 'contacts')!.fields.find(field => field.key === 'phone')!.readOnly = true;
  assert.equal(mergeFields(locked, keeper, duplicate).find(field => field.key === 'phone')!.reason, 'readonly');
});

test('planMerge returns the values to write and the ones they replace', () => {
  const plan = planMerge(spec, keeper, duplicate, ['phone', 'service']);
  assert.deepEqual(plan, { ok: true, values: { phone: '611 111 111', service: 'brand' }, before: { phone: '600 000 001', service: 'web' } });
  assert.deepEqual(planMerge(spec, keeper, duplicate, []), { ok: true, values: {}, before: {} });
});

test('planMerge refuses empty, equal, unknown, repeated and cross-type choices', () => {
  for (const take of [['company_id'], ['firstname'], ['planeta'], ['phone', 'phone']]) assert.equal(planMerge(spec, keeper, duplicate, take).ok, false, take.join());
  assert.equal(planMerge(spec, keeper, { ...duplicate, entity: 'companies' }, []).ok, false);
  assert.equal(planMerge(spec, keeper, keeper, []).ok, false);
});

test('fingerprint ignores key order and changes with any value', () => {
  assert.equal(fingerprint({ a: 1, b: 'x' }), fingerprint({ b: 'x', a: 1 }));
  assert.notEqual(fingerprint({ a: 1, b: 'x' }), fingerprint({ a: 1, b: 'y' }));
  assert.match(fingerprint(keeper.values), /^[a-z0-9]+-[0-9a-f]{8}$/);
});

test('recordLabel joins first and last name for contacts and falls back to the id', () => {
  assert.equal(recordLabel(spec, keeper), 'Lucía Martín');
  assert.equal(recordLabel(spec, { id: 'company-x', entity: 'companies', values: { name: '' } }), 'company-x');
});
