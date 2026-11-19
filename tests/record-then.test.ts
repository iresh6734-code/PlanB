import test from 'node:test';
import assert from 'node:assert/strict';
import { makeFixture } from '../shared/fixtures.js';
import { recordThen, THEN_FIELD_LIMIT } from '../shared/record-then.js';
import { copyText, parseThen, thenPath } from '../src/app-shell/record-history.js';

const contact = (snapshot = makeFixture()) => snapshot.records.find(record => record.entity === 'contacts')!;

test('only changed fields come back, in model order, with absent values marked', () => {
  const snapshot = makeFixture(), then = contact(snapshot), now = structuredClone(then);
  const keys = Object.keys(then.values);
  now.values.phone = '600 000 777';
  delete now.values[keys.find(key => key !== 'phone')!];
  now.values.zz_local = 'nuevo';
  const result = recordThen(snapshot, 'contacts', then.id, now, ['zz_local', ...keys]);
  const order = ['zz_local', ...keys], removed = keys.find(key => key !== 'phone')!;
  assert.equal(result.present, true);
  assert.deepEqual(result.fields.map(field => field.key), order.filter(key => ['zz_local', removed, 'phone'].includes(key)));
  assert.deepEqual(result.fields[0]!.then, { present: false, value: null, truncated: false });
  assert.equal(result.fields.find(field => field.key === 'phone')!.now.value, '600 000 777');
  assert.equal(result.unchanged, keys.length - 2);
  assert.equal(result.total, 3);
});

test('a record missing from the capture is reported as not present, without inventing differences', () => {
  const snapshot = makeFixture(), now = structuredClone(contact(snapshot));
  now.id = 'creado-despues';
  assert.deepEqual(recordThen(snapshot, 'contacts', now.id, now), { present: false, fields: [], unchanged: 0, total: 0, truncated: false });
});

test('identical records report no fields; long texts are clipped and many fields are capped', () => {
  const snapshot = makeFixture(), then = contact(snapshot);
  assert.equal(recordThen(snapshot, 'contacts', then.id, structuredClone(then)).fields.length, 0);
  const now = structuredClone(then);
  now.values.phone = 'x'.repeat(900);
  for (let index = 0; index < THEN_FIELD_LIMIT + 5; index++) now.values['extra' + index] = index;
  const result = recordThen(snapshot, 'contacts', then.id, now);
  assert.equal(result.truncated, true);
  assert.equal(result.fields.length, THEN_FIELD_LIMIT);
  assert.equal(result.total, THEN_FIELD_LIMIT + 6);
  const phone = result.fields[0]!;
  assert.equal(phone.key, 'phone');
  assert.equal(phone.now.truncated, true);
  assert.equal(String(phone.now.value).length, 500);
});

test('the client parser accepts the route answer and rejects malformed ones', () => {
  const capture = { captureId: 'demo:2026-11-19T10:00:00.000Z', capturedAt: '2026-11-19T10:00:00.000Z' };
  const parsed = parseThen({
    captures: [capture], capture: { ...capture, isTestData: true },
    result: { present: true, unchanged: 4, total: 1, truncated: false, fields: [{ key: 'phone', then: { present: true, value: '1', truncated: true }, now: { present: false, value: null, truncated: false } }] },
  });
  assert.deepEqual(parsed.result!.fields[0], { key: 'phone', then: { present: true, value: '1' }, now: { present: false }, clipped: true });
  assert.deepEqual(parseThen({ captures: [], capture: null, result: null }), { captures: [], capture: null, result: null });
  for (const bad of [null, {}, { captures: [{}] }, { captures: [capture], capture: { ...capture }, result: { present: true } }, { captures: [], capture: { ...capture, isTestData: false }, result: { present: true, unchanged: -1, total: 0, truncated: false, fields: [] } }]) {
    assert.throws(() => parseThen(bad), /comparación legible/);
  }
  assert.equal(thenPath('contacts', 'a/b', 'x:y'), '/v2/records/contacts/a%2Fb/then?capture=x%3Ay');
  assert.equal(copyText({ present: true, value: 3 }), '3');
  assert.equal(copyText({ present: false }), '');
});
