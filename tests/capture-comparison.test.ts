import test from 'node:test';
import assert from 'node:assert/strict';
import { makeFixture } from '../shared/fixtures.js';
import { compareCaptures, CaptureComparisonError } from '../shared/capture-comparison.js';

function fixtures() {
  const from = makeFixture(); from.capturedAt = '2026-10-28T12:00:00.000Z';
  const to = structuredClone(from); to.capturedAt = '2026-10-29T12:00:00.000Z';
  return { from, to };
}
test('identical records yield zero differences despite capture date changes', () => {
  const { from, to } = fixtures(), result = compareCaptures(from, to);
  assert.equal(result.records.totalDifferences, 0); assert.equal(result.schema.totalFieldChanges, 0);
  assert.equal(result.relations.added, 0); assert.equal(result.relations.absent, 0);
  assert.equal(result.relations.unchanged, from.links.length); assert.equal(result.chronological, true);
});

test('added, absent and changed records are counted separately and absence does not mean remote deletion', () => {
  const { from, to } = fixtures();
  const task = to.records.find(r => r.entity === 'tasks')!;
  to.records = to.records.filter(r => r !== task); to.manifest.expectedCounts.tasks--;
  to.links = to.links.filter(l => !(l.fromEntity === 'tasks' && l.fromId === task.id) && !(l.toEntity === 'tasks' && l.toId === task.id)); to.manifest.expectedLinks = to.links.length;
  to.records.push({ entity: 'tasks', id: 'new', values: { subject: 'Nueva tarea', status: 'pending' } }); to.manifest.expectedCounts.tasks++;
  to.records.find(r => r.entity === 'contacts')!.values.phone = '600 000 040';
  const result = compareCaptures(from, to);
  assert.equal(result.records.counts.tasks.added, 1); assert.equal(result.records.counts.tasks.absent, 1);
  assert.equal(result.records.counts.contacts.changed, 1); assert.equal(result.records.totalDifferences, 3);
  assert.ok(result.limitations.some(text => text.includes('no acredita un borrado remoto')));
  assert.ok(result.records.items.find(r => r.kind === 'added')!.fields.every(f => !f.before.present));
  assert.ok(result.records.items.find(r => r.kind === 'absent')!.fields.every(f => !f.after.present));
});

test('missing value, null, empty string, number and boolean remain distinct', () => {
  const { from, to } = fixtures();
  const a = from.records.find(r => r.entity === 'contacts')!, b = to.records.find(r => r.entity === 'contacts')!;
  delete a.values.phone; b.values.phone = null; a.values.email = null; b.values.email = '';
  a.values.firstname = 0; b.values.firstname = false;
  const fields = compareCaptures(from, to).records.items[0].fields;
  const phone = fields.find(f => f.key === 'phone')!; assert.deepEqual(phone.before, { present: false, value: null, truncated: false });
  assert.deepEqual(phone.after, { present: true, value: null, truncated: false });
  assert.equal(fields.find(f => f.key === 'firstname')!.before.value, 0); assert.equal(fields.find(f => f.key === 'firstname')!.after.value, false);
});

test('entity-qualified IDs do not collide and input order/property order does not create record differences', () => {
  const { from, to } = fixtures();
  from.records.push({ entity: 'tasks', id: 'contact-1', values: { subject: 'Otro objeto' } }); from.manifest.expectedCounts.tasks++;
  to.records = structuredClone(from.records).reverse().map(r => ({ ...r, values: Object.fromEntries(Object.entries(r.values).reverse()) })); to.manifest.expectedCounts.tasks++;
  assert.equal(compareCaptures(from, to).records.totalDifferences, 0);
});

test('pagination uses full counts and stable order, including an empty page after the end', () => {
  const { from, to } = fixtures();
  for (const r of to.records.filter(r => r.entity === 'contacts')) r.values.phone = 'nuevo';
  const full = compareCaptures(from, to), page = compareCaptures(from, to, { offset: 1, limit: 2 });
  assert.equal(page.records.totalDifferences, full.records.totalDifferences); assert.deepEqual(page.records.items, full.records.items.slice(1, 3));
  assert.equal(page.records.truncated, true); assert.equal(compareCaptures(from, to, { offset: 200 }).records.items.length, 0);
  to.records.reverse(); assert.deepEqual(compareCaptures(from, to, { offset: 1, limit: 2 }), page);
});

test('full long strings are compared even if their bounded previews are identical', () => {
  const { from, to } = fixtures();
  from.records[0].values.name = 'a'.repeat(600) + 'one'; to.records[0].values.name = 'a'.repeat(600) + 'two';
  const row = compareCaptures(from, to).records.items[0], field = row.fields.find(f => f.key === 'name')!;
  assert.equal(row.kind, 'changed'); assert.equal(field.before.value, field.after.value);
  assert.equal((field.before.value as string).length, 500); assert.equal(field.before.truncated, true); assert.equal(field.after.truncated, true);
});

test('field previews and schema samples are capped while complete counts are preserved', () => {
  const { from, to } = fixtures(), entity = to.entities.find(e => e.id === 'contacts')!, record = to.records.find(r => r.entity === 'contacts')!;
  for (let n = 0; n < 60; n++) { entity.fields.push({ key: 'extra_' + n, label: 'Extra', type: 'text', required: false, readOnly: false, options: [], referenceEntity: null }); record.values['extra_' + n] = String(n); }
  const result = compareCaptures(from, to), row = result.records.items[0];
  assert.equal(row.totalFieldChanges, 60); assert.equal(row.fields.length, 20); assert.equal(row.fieldsTruncated, true);
  assert.equal(result.schema.totalFieldChanges, 60); assert.equal(result.schema.fields.length, 50); assert.equal(result.schema.truncated, true);
});

test('schema-only changes do not pretend that stored values changed', () => {
  const { from, to } = fixtures();
  to.entities.find(e => e.id === 'contacts')!.fields.find(f => f.key === 'phone')!.label = 'Teléfono principal';
  to.stages[0].label = 'Etapa renombrada';
  const result = compareCaptures(from, to); assert.equal(result.records.totalDifferences, 0);
  assert.equal(result.schema.totalFieldChanges, 1); assert.deepEqual(result.schema.fields[0].aspects, ['label']);
  assert.ok(result.schema.configurationSections.includes('stages'));
});

test('field ordering is a configuration change without claiming data or field definition changes', () => {
  const { from, to } = fixtures(); to.entities.find(e => e.id === 'contacts')!.fields.reverse();
  const result = compareCaptures(from, to);
  assert.equal(result.records.totalDifferences, 0); assert.equal(result.schema.totalFieldChanges, 0);
  assert.ok(result.schema.configurationSections.includes('entities.contacts.fieldOrder'));
});

test('relation changes preserve duplicate multiplicity and labels rather than silently using sets', () => {
  const { from, to } = fixtures(), link = structuredClone(to.links[0]);
  to.links.push(link, { ...link, label: 'Etiqueta diferente' }); to.manifest.expectedLinks += 2;
  const result = compareCaptures(from, to); assert.equal(result.relations.added, 2); assert.equal(result.relations.absent, 0);
  assert.equal(result.relations.unchanged, from.links.length); assert.equal(result.relations.changedGroups, 2);
  const reverse = compareCaptures(to, from); assert.equal(reverse.chronological, false); assert.equal(reverse.relations.absent, 2);
});

test('relation sample truncation does not truncate relation totals', () => {
  const { from, to } = fixtures();
  for (let n = 0; n < 30; n++) to.links.push({ ...to.links[0], label: 'Cambio ' + n });
  to.manifest.expectedLinks += 30; const result = compareCaptures(from, to);
  assert.equal(result.relations.added, 30); assert.equal(result.relations.items.length, 25); assert.equal(result.relations.truncated, true);
});

test('different accounts, source kinds and environment identities are rejected', () => {
  for (const mutation of [
    (s: ReturnType<typeof makeFixture>) => { s.source.accountId = 'another'; },
    (s: ReturnType<typeof makeFixture>) => { s.source.accountId = ' '; },
    (s: ReturnType<typeof makeFixture>) => { s.source.kind = 'archive'; },
    (s: ReturnType<typeof makeFixture>) => { s.source.environment = 'test'; },
  ]) {
    const { from, to } = fixtures(); mutation(to);
    assert.throws(() => compareCaptures(from, to), (e: any) => e instanceof CaptureComparisonError && e.code === 'SOURCE_MISMATCH');
  }
});

test('unreconciled captures, duplicate records and invalid types cannot become a trustworthy diff', () => {
  for (const mutation of [
    (s: ReturnType<typeof makeFixture>) => { s.manifest.complete = false; },
    (s: ReturnType<typeof makeFixture>) => { s.records.push(s.records[0]); s.manifest.expectedCounts.companies++; },
    (s: ReturnType<typeof makeFixture>) => { s.records[0].values.name = Number.NaN; },
  ]) {
    const { from, to } = fixtures(); mutation(to); assert.throws(() => compareCaptures(from, to), (e: any) => e.code === 'INVALID_CAPTURE');
  }
});

test('comparison leaves both captures unchanged and result mutations cannot change either input', () => {
  const { from, to } = fixtures(); to.records.find(r => r.entity === 'contacts')!.values.phone = 'nuevo';
  to.links.push({ ...to.links[0], label: 'Nueva' }); to.manifest.expectedLinks++;
  const before = structuredClone({ from, to }), result = compareCaptures(from, to);
  result.records.items[0].fields[0].after.value = 'modificado'; result.relations.items[0].link.label = 'modificada';
  assert.deepEqual({ from, to }, before);
});

test('invalid pagination is rejected', () => {
  const { from, to } = fixtures();
  for (const options of [{ limit: 0 }, { limit: 201 }, { offset: -1 }, { offset: 20001 }, { offset: 1.5 }, { limit: NaN }]) assert.throws(() => compareCaptures(from, to, options), RangeError);
});

test('10,000 records are fully counted before sampling and excess records are rejected', () => {
  const { from, to } = fixtures();
  from.records = Array.from({ length: 10_000 }, (_, n) => ({ id: 'row-' + n, entity: 'companies', values: { name: 'Antes' } }));
  from.links = []; from.manifest.expectedLinks = 0; from.manifest.expectedCounts = { contacts: 0, companies: 10_000, deals: 0, tasks: 0 };
  to.records = from.records.map(r => ({ ...r, values: { name: 'Después' } })); to.links = [];
  to.manifest = structuredClone(from.manifest);
  const result = compareCaptures(from, to, { limit: 3 });
  assert.equal(result.records.counts.companies.changed, 10_000); assert.equal(result.records.items.length, 3); assert.equal(result.records.truncated, true);
  to.records.push({ id: 'too-many', entity: 'companies', values: { name: 'Extra' } }); to.manifest.expectedCounts.companies++;
  assert.throws(() => compareCaptures(from, to), (e: any) => e.code === 'INVALID_CAPTURE');
});

test('production and test captures cannot be compared even with the same account and HubSpot source kind', () => {
  const { from, to } = fixtures(); from.version = 3; to.version = 3;
  from.source.kind = 'hubspot'; from.source.environment = 'test'; from.source.accountType = 'DEVELOPER_TEST';
  to.source.kind = 'hubspot'; to.source.environment = 'production'; to.source.isTestData = false; to.source.accountType = 'STANDARD';
  assert.throws(() => compareCaptures(from, to), (e: any) => e.code === 'SOURCE_MISMATCH');
});

test('Unicode preview and label caps never split a surrogate pair while full-value comparison stays exact', () => {
  const { from, to } = fixtures(), a = from.records.find(r => r.entity === 'contacts')!, b = to.records.find(r => r.entity === 'contacts')!;
  a.values.firstname = 'n'.repeat(179) + '💥'; b.values.firstname = a.values.firstname;
  a.values.phone = 'x'.repeat(499) + '💥A'; b.values.phone = 'x'.repeat(499) + '💥B';
  const row = compareCaptures(from, to).records.items[0], field = row.fields.find(f => f.key === 'phone')!;
  assert.equal(row.kind, 'changed'); assert.equal(row.beforeLabel, 'n'.repeat(179)); assert.equal(row.beforeLabel!.length, 179);
  assert.equal(field.before.value, 'x'.repeat(499)); assert.equal((field.before.value as string).length, 499);
  assert.equal(field.before.truncated, true); assert.equal(field.before.value, field.after.value);
  a.values.phone = 'x'.repeat(498) + '💥'; b.values.phone = 'changed';
  assert.equal(compareCaptures(from, to).records.items[0].fields.find(f => f.key === 'phone')!.before.value, a.values.phone);
});
