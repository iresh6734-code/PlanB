import assert from 'node:assert/strict';
import test from 'node:test';
import { makeDemoSpec, makeFixture } from '../shared/fixtures.js';
import type { Rule } from '../shared/model.js';
import { fieldList, missingFor, stageNeeds } from '../src/app-shell/stage-rules.js';

const spec = makeDemoSpec(makeFixture('agency'));
const keys = (needs: ReturnType<typeof stageNeeds>, stage: string) => (needs.get(stage) ?? []).map(field => field.key);

test('etapas: importe desde la segunda abierta, fecha de cierre en la mitad final, las dos al ganar', () => {
  const ids = spec.stages.map(stage => stage.id);
  assert.deepEqual(ids.slice(0, 4), ['contact', 'proposal', 'negotiation', 'won']);
  const needs = stageNeeds(spec);
  assert.deepEqual(keys(needs, 'contact'), []);
  assert.deepEqual(keys(needs, 'proposal'), ['amount']);
  assert.deepEqual(keys(needs, 'negotiation'), ['amount', 'closedate']);
  assert.deepEqual(keys(needs, 'won'), ['amount', 'closedate']);
  for (const stage of spec.stages.filter(item => /lost|perd/i.test(item.id + item.label))) assert.deepEqual(keys(needs, stage.id), []);
});

test('etapas: una regla configurada no se repite como aviso, y cada proceso cuenta sus etapas', () => {
  const rule: Rule = { id: 'r', entity: 'deals', kind: 'conditional_required', field: 'amount', value: null, whenField: 'dealstage', whenValue: 'proposal', origin: 'user', description: 'Importe en propuesta.', evidence: 'prueba' };
  assert.deepEqual(keys(stageNeeds({ ...spec, rules: [...spec.rules, rule] }), 'proposal'), []);
  const base = spec.stages.find(stage => stage.id === 'contact')!;
  const stages = [
    { ...base, id: 'a1', label: 'Primero', pipelineId: 'A' }, { ...base, id: 'a2', label: 'Segundo', pipelineId: 'A' },
    { ...base, id: 'b1', label: 'Inicio', pipelineId: 'B' },
  ];
  const needs = stageNeeds({ ...spec, stages });
  assert.deepEqual(keys(needs, 'a1'), []);
  assert.deepEqual(keys(needs, 'a2'), ['amount', 'closedate']);
  assert.deepEqual(keys(needs, 'b1'), []);
});

test('missingFor y fieldList: solo lo vacío, en una frase', () => {
  const needs = stageNeeds(spec);
  assert.deepEqual(missingFor({ amount: 1200, closedate: '  ' }, 'negotiation', needs).map(field => field.key), ['closedate']);
  assert.deepEqual(missingFor({}, 'contact', needs), []);
  assert.deepEqual(missingFor({}, undefined, needs), []);
  const both = missingFor({ amount: null }, 'won', needs);
  assert.match(fieldList(both), /^[^,]+ y [^,]+$/);
  assert.equal(fieldList([]), '');
});
