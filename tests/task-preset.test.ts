import { test } from 'node:test';
import assert from 'node:assert/strict';
import { linkedPreset, taskPreset } from '../src/app-shell/task-preset.js';
import { makeDemoSpec, makeFixture } from '../shared/fixtures.js';
import type { EntityName, Field } from '../shared/model.js';

const ref = (key: string, referenceEntity: EntityName, readOnly = false): Field => ({ key, label: key, type: 'reference', required: false, readOnly, options: [], referenceEntity });
const spec = { stages: [], rules: [], entities: [
  { id: 'contacts', fields: [ref('company_id', 'companies')] },
  { id: 'companies', fields: [] },
  { id: 'deals', fields: [ref('company_id', 'companies'), ref('contact_id', 'contacts')] },
  { id: 'tasks', fields: [ref('contact_id', 'contacts'), ref('deal_id', 'deals')] },
] } as never;

test('tarea nueva desde un cliente: enlazada al cliente', () => {
  assert.deepEqual(taskPreset(spec, { entity: 'contacts', id: 'c1', values: { company_id: 'co1' } }), { contact_id: 'c1' });
});
test('tarea nueva desde una oportunidad: enlazada a ella y a su cliente', () => {
  assert.deepEqual(taskPreset(spec, { entity: 'deals', id: 'd1', values: { contact_id: 'c7', company_id: 'co1' } }), { deal_id: 'd1', contact_id: 'c7' });
  assert.deepEqual(taskPreset(spec, { entity: 'deals', id: 'd2', values: { contact_id: null } }), { deal_id: 'd2' });
});
test('sin campo que enlace (empresa) o desde otra tarea: no se ofrece', () => {
  assert.equal(taskPreset(spec, { entity: 'companies', id: 'co1', values: {} }), null);
  assert.equal(taskPreset(spec, { entity: 'tasks', id: 't1', values: {} }), null);
});

test('oportunidad nueva desde un cliente (con su empresa) y desde una empresa', () => {
  assert.deepEqual(linkedPreset(spec, 'deals', { entity: 'contacts', id: 'c1', values: { company_id: 'co1' } }), { contact_id: 'c1', company_id: 'co1' });
  assert.deepEqual(linkedPreset(spec, 'deals', { entity: 'companies', id: 'co2', values: {} }), { company_id: 'co2' });
  assert.equal(linkedPreset(spec, 'deals', { entity: 'deals', id: 'd1', values: {} }), null);
});

test('dos papeles editables hacia la ficha de origen requieren elegir la relación', () => {
  const model = makeDemoSpec(makeFixture());
  const tasks = model.entities.find(entity => entity.id === 'tasks')!;
  tasks.fields.push(ref('approver_id','contacts'));
  const contact = { entity:'contacts' as const, id:'contact-1', values:{} };
  assert.equal(taskPreset(model,contact),null);
  tasks.fields.at(-1)!.readOnly = true;
  assert.deepEqual(taskPreset(model,contact),{contact_id:'contact-1'});
});

test('heredar varias relaciones usa su clave y no rellena otros papeles', () => {
  const model = makeDemoSpec(makeFixture());
  const tasks = model.entities.find(entity => entity.id === 'tasks')!;
  const deals = model.entities.find(entity => entity.id === 'deals')!;
  tasks.fields.push(ref('observer_id','contacts'),ref('approver_id','contacts'),ref('readonly_contact','contacts',true));
  deals.fields.unshift(ref('approver_id','contacts'),ref('readonly_contact','contacts'));
  const values = {contact_id:'contact-1', approver_id:'contact-2', readonly_contact:'contact-3'};
  assert.deepEqual(taskPreset(model,{entity:'deals',id:'deal-1',values}),{
    deal_id:'deal-1',contact_id:'contact-1',approver_id:'contact-2',
  });
});

test('un alias se hereda solo si ambos modelos tienen un campo hacia ese tipo', () => {
  const model = makeDemoSpec(makeFixture());
  const tasks = model.entities.find(entity => entity.id === 'tasks')!;
  tasks.fields.find(field => field.key === 'contact_id')!.key = 'customer_id';
  const deal = {entity:'deals' as const,id:'deal-1',values:{contact_id:'contact-1'}};
  assert.deepEqual(taskPreset(model,deal),{deal_id:'deal-1',customer_id:'contact-1'});
  tasks.fields.push(ref('approver_id','contacts'));
  assert.deepEqual(taskPreset(model,deal),{deal_id:'deal-1'});
  tasks.fields.at(-1)!.readOnly = true;
  assert.deepEqual(taskPreset(model,deal),{deal_id:'deal-1'});
});
