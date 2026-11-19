import test from 'node:test';
import assert from 'node:assert/strict';
import { searchWorkspace } from '../shared/workspace-search.js';
import { makeFixture, makeDemoSpec } from '../shared/fixtures.js';
import type { CrmRecord } from '../shared/model.js';

const snapshot = makeFixture(), spec = makeDemoSpec(snapshot);
const contact = (id: string, name: string, extra: Record<string, string | number | boolean | null> = {}): CrmRecord => ({ entity: 'contacts', id, values: { firstname: name, lastname: '', email: 'fixture@example.invalid', ...extra } });
const search = (records: CrmRecord[], query: string, extra: Partial<Parameters<typeof searchWorkspace>[0]> = {}) => searchWorkspace({ spec, records, query, ...extra });

test('all terms can match across declared fields with accent/case normalization, including repeated whitespace', () => {
  const result = search([contact('c1', 'José', { lastname: 'Pérez', phone: '600 123 456' }), contact('c2', 'Josefa', { lastname: 'López', phone: '600 789' })], '  JOSE   pérez 600 ');
  assert.equal(result.total, 1); assert.equal(result.items[0].id, 'c1'); assert.equal(result.items[0].label, 'José Pérez');
  assert.equal(result.items[0].totalMatchedFields, 3); assert.equal(result.counts.contacts, 1);
});

test('facets count all matches before entity filtering and pagination, stable identity spans four entities', () => {
  const records: CrmRecord[] = [contact('same-id', 'Norte'), { entity: 'companies', id: 'same-id', values: { name: 'Norte' } }, { entity: 'deals', id: 'd1', values: { dealname: 'Norte' } }, { entity: 'tasks', id: 't1', values: { subject: 'Norte' } }];
  const all = search(records, 'norte', { limit: 1 }); assert.equal(all.total, 4); assert.equal(all.items.length, 1); assert.equal(all.hasMore, true);
  assert.deepEqual(all.counts, { contacts: 1, companies: 1, deals: 1, tasks: 1 });
  assert.equal(search(records, 'norte', { entities: ['companies'] }).items[0].entity, 'companies');
  assert.deepEqual(search(records, 'norte', { entities: ['tasks', 'deals'] }).items.map(item => item.entity), ['deals', 'tasks']);
});

test('ranking prioritizes exact ID then full name then prefix; homonyms remain separate and sorting is deterministic', () => {
  const records = [contact('z', 'Ana Otra'), contact('b', 'Ana'), contact('a', 'Ana'), contact('Ana', 'Zeta'), contact('later', 'Otra', { phone: 'Ana' })];
  const first = search(records, 'Ana'); assert.deepEqual(first.items.map(item => item.id), ['Ana', 'a', 'b', 'z', 'later']);
  assert.equal(first.items[0].matchedId, true); assert.deepEqual(search([...records].reverse(), 'Ana'), first);
});

test('hidden fields never participate or leak in previews; declared enum labels, booleans and numbers are searchable', () => {
  const custom = structuredClone(spec); custom.entities[0].fields.push({ key: 'custom_flag', label: 'Marca', type: 'boolean', required: false, readOnly: false, options: [], referenceEntity: null });
  const c = contact('c1', 'Normal', { hidden: 'PRIVATE-HIDDEN-053', service: 'web', custom_flag: false });
  assert.equal(search([c], 'PRIVATE-HIDDEN').total, 0);
  assert.equal(search([c], 'Diseño').total, 1);
  assert.equal(search([c], 'false', { spec: custom }).total, 1);
  assert.equal(search([{ entity: 'deals', id: 'd', values: { dealname: 'Normal', amount: 12345 } }], '234').total, 1);
  assert.ok(!JSON.stringify(search([c], 'Normal')).includes('PRIVATE-HIDDEN'));
});

test('late-field match is visible in a bounded preview without breaking supplementary Unicode', () => {
  const value = '😀'.repeat(150) + 'á'.repeat(120) + 'término visible' + '🎯'.repeat(150);
  const r = search([contact('long', 'Largo', { phone: value })], 'termino');
  assert.equal(r.total, 1); const match = r.items[0].matches[0];
  assert.match(match.preview, /término/); assert.equal(match.truncated, true); assert.ok(match.preview.length <= 182); assert.equal(Buffer.from(match.preview).toString('utf8'), match.preview);
  const longName = search([contact('long', '😀'.repeat(100))], '😀😀'); assert.ok(longName.items[0].label.length <= 160); assert.equal(Buffer.from(longName.items[0].label).toString('utf8'), longName.items[0].label);
});

test('returned field previews are capped while full matched-field count remains explicit; inputs stay unchanged', () => {
  const c = contact('needle-id', 'needle', { lastname: 'needle', email: 'needle@example.invalid', phone: 'needle', service: 'needle' }), before = JSON.stringify(c);
  const result = search([c], 'needle'); assert.equal(result.items[0].matches.length, 3); assert.equal(result.items[0].totalMatchedFields, 5); assert.equal(JSON.stringify(c), before);
  assert.equal(result.items[0].matchedId, true);
});

test('pagination covers 10000 records without truncating facet totals or losing a last-record match', () => {
  const records = Array.from({ length: 10000 }, (_, i) => contact('id-' + String(i).padStart(5, '0'), 'Cliente ' + String(i).padStart(5, '0')));
  const first = search(records, 'cliente', { limit: 50 }), final = search(records, 'cliente', { offset: 9950, limit: 50 });
  assert.equal(first.total, 10000); assert.equal(first.counts.contacts, 10000); assert.equal(final.items.length, 50); assert.equal(final.hasMore, false); assert.equal(final.items.at(-1)!.id, 'id-09999');
  assert.equal(search(records, 'id-09999').items[0].id, 'id-09999');
});

test('malformed bounds, filters, unsupported types and excessive queries are rejected without regex interpretation', () => {
  for (const query of ['', ' ', 'a', 'x'.repeat(161), Array(13).fill('aa').map((s, i) => s + i).join(' ')]) assert.throws(() => search([], query));
  for (const extra of [{ offset: -1 }, { limit: 0 }, { limit: 51 }, { offset: NaN }, { entities: [] }, { entities: ['contacts', 'contacts'] }, { entities: ['bad'] }]) assert.throws(() => search([], 'aa', extra as any));
  assert.equal(search([contact('c1', 'Literal [a]+')], '[a]+').total, 1);
  assert.equal(search([contact('c1', 'Otro')], 'missing').total, 0);
});

import {makeFixture as fix075Fixture,makeDemoSpec as fix075Spec} from '../shared/fixtures.js';
test('blank display names fall back to identity while zero and false remain explicit labels (QA060F2)',()=>{
 const snapshot=fix075Fixture(),spec=fix075Spec(snapshot);
 for(const [value,expected] of [['','fix-blank'],['   ','fix-blank'],[null,'fix-blank'],[0,'0'],[false,'false']] as const){
  const result=searchWorkspace({spec,records:[{entity:'companies',id:'fix-blank',values:{name:value}}],query:'fix-blank'});
  assert.equal(result.items[0].label,expected);
 }
});
