// CLAUDE-RETURN-EXPLAIN · La devolución al CRM explicada a la persona, con el plan real de server/recovery.ts y su CRM simulado.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Store } from '../server/store.js';
import { Recovery, simulatedRemote } from '../server/recovery.js';
import { explainField, explainReturnPlan, formatValue } from '../shared/return-explain.js';
import { makeDemoSpec, makeFixture } from '../shared/fixtures.js';
import type { CrmRecord, Field } from '../shared/model.js';
import type { RecoveryField } from '../shared/operations.js';

const TMP = path.resolve('tests/.tmp');
function seeded(t: test.TestContext) {
  fs.mkdirSync(TMP, { recursive: true });
  const dir = fs.mkdtempSync(path.join(TMP, 'return-explain-')), store = new Store(path.join(dir, 'planb.sqlite'));
  const snapshot = makeFixture();
  store.importSnapshot(snapshot);
  store.saveGeneration(makeDemoSpec(snapshot), { provider: 'demo', model: null, generatedAt: snapshot.capturedAt, prompt: '', approved: false });
  store.activate();
  t.after(() => { store.close(); fs.rmSync(dir, { recursive: true, force: true }); });
  return store;
}
// Un dato vale para todo el archivo: sin un ID interno ni una fecha ISO en ninguna frase.
const noInternals = (text: string) => { assert.doesNotMatch(text, /company-\d|contact-\d|deal-\d|\d{4}-\d{2}-\d{2}/, text); };

test('formatea los valores como los ve la persona', () => {
  const f = (type: Field['type'], extra: Partial<Field> = {}): Field => ({ key: 'k', label: 'K', type, required: false, readOnly: false, options: [], referenceEntity: null, ...extra });
  const none = () => null;
  assert.equal(formatValue(f('enum', { options: [{ id: 'won', label: 'Ganada' }] }), 'won', none), 'Ganada');
  assert.equal(formatValue(f('date'), '2026-03-07', none), '07/03/2026');
  assert.equal(formatValue(f('number'), 12500, none), '12.500');
  assert.equal(formatValue(f('boolean'), true, none), 'sí');
  assert.equal(formatValue(f('text'), '', none), 'vacío');
  assert.equal(formatValue(f('reference', { referenceEntity: 'companies' }), 'company-1', (_e, id) => id === 'company-1' ? 'Estudio Arce' : null), 'Estudio Arce');
  assert.equal(formatValue(f('reference', { referenceEntity: 'companies' }), 'company-9', none), 'un registro que ya no está en la copia');
});

test('una frase por caso: enviar, ya coincide, conflicto, sobrescribir, quedarse en local y alta', () => {
  const field = (extra: Partial<RecoveryField>): RecoveryField => ({ field: 'phone', label: 'Teléfono', base: 'A', local: 'B', remote: 'A', conflict: false, decision: 'local', ...extra });
  const v = { base: 'A', local: 'B', remote: 'C' };
  assert.deepEqual(explainField('update', field({}), { base: 'A', local: 'B', remote: 'A' }, 'HubSpot'), { tone: 'send', text: 'En HubSpot pasará de «A» a «B».' });
  assert.equal(explainField('update', field({ remote: 'B', decision: 'remote' }), { base: 'A', local: 'B', remote: 'B' }, 'HubSpot').tone, 'same');
  const pending = explainField('update', field({ remote: 'C', conflict: true, decision: null }), v, 'HubSpot');
  assert.equal(pending.tone, 'conflict'); assert.match(pending.text, /era «A».*cambiaste a «B».*cambió a «C».*Elige/);
  assert.match(explainField('update', field({ remote: 'C', conflict: true, decision: 'local' }), v, 'HubSpot').text, /Se sustituirá .*«C».* por tu valor, «B»/);
  assert.match(explainField('update', field({ remote: 'C', conflict: true, decision: 'remote' }), v, 'HubSpot').text, /Se queda lo de HubSpot \(«C»\)\. Tu cambio a «B» solo seguirá en tu copia local/);
  assert.equal(explainField('create', field({ base: null }), { base: 'vacío', local: 'B', remote: 'vacío' }, 'HubSpot').text, 'Se creará en HubSpot con «B».');
  assert.match(explainField('update', field({ local: null }), { base: 'A', local: 'vacío', remote: 'A' }, 'HubSpot').text, /de «A» a vacío\./);
});

test('plan real con conflicto: agrupa por empresa, pone primero lo que hay que decidir y no enseña IDs ni fechas ISO', async t => {
  const store = seeded(t);
  const contacts = store.records('contacts'), deals = store.records('deals');
  const lucia = contacts.find(r => r.values.company_id === 'company-1')!, deal = deals.find(r => r.values.company_id && r.values.company_id !== 'company-1')!;
  const task = store.records('tasks').find(r => r.values.contact_id !== lucia.id)!;
  // En local, en este orden (el grupo con conflicto NO es el primero que se guarda): la etapa de una oportunidad de otra
  // empresa, las notas de una tarea (sin empresa propia: cuenta la de su persona), el teléfono de Lucía y una persona
  // nueva de Estudio Arce. La devolución no admite cambiar relaciones existentes, así que solo cambian campos.
  const stages = store.spec!.entities.find(e => e.id === 'deals')!.fields.find(f => f.key === 'dealstage')!.options;
  const newStage = stages.find(s => s.id !== deal.values.dealstage)!;
  store.saveRecord('deals', { ...deal.values, dealstage: newStage.id }, deal.id);
  store.saveRecord('tasks', { ...task.values, notes: 'Llamar el lunes' }, task.id);
  store.saveRecord('contacts', { ...lucia.values, phone: '600 111 222' }, lucia.id);
  const nuevo = store.saveRecord('contacts', { firstname: 'Nora', lastname: 'Gil', email: 'nora@ejemplo.es', company_id: 'company-1' });
  // En el CRM (simulado), mientras tanto, alguien cambió también el teléfono de Lucía.
  const remote: CrmRecord[] = store.snapshot!.records.map(r => r.id === lucia.id ? { ...r, values: { ...r.values, phone: '699 999 999' } } : r);
  store.set('simulatedRemote', remote);

  const recovery = new Recovery(store), plan = await recovery.preview(simulatedRemote(store));
  const explained = explainReturnPlan(plan, store.spec!, store.records());
  assert.equal(explained.target, 'el CRM de prueba');
  assert.equal(explained.summary.conflicts, 1); assert.ok(explained.summary.creates > 0);

  const [first] = explained.groups;
  assert.equal(first.title, 'Estudio Arce', 'el grupo con conflicto va primero y lleva el nombre de la empresa');
  assert.ok(first.conflicts === 1);
  const titles = first.operations.map(op => op.label);
  assert.ok(titles.includes('Nora'), 'la persona nueva de Estudio Arce va en el mismo grupo');
  const phone = first.operations.find(op => op.id === plan.operations.find(o => o.localId === lucia.id)!.id)!.fields.find(f => f.field === 'phone')!;
  assert.equal(phone.tone, 'conflict'); assert.match(phone.text, /«600 111 222».*«699 999 999»/);
  const created = first.operations.find(op => op.kind === 'create')!;
  assert.ok(created.relations.some(text => text === 'Se enlazará con Estudio Arce (empresa).'), created.relations.join(' | '));
  const stage = explained.groups.flatMap(g => g.operations).find(op => op.entity === 'deals')!.fields.find(f => f.field === 'dealstage')!;
  assert.equal(stage.local, newStage.label, 'la etapa se muestra por su nombre');
  const companyName = (id: unknown) => String(store.record('companies', String(id))!.values.name);
  const groupOf = (localId: string) => explained.groups.find(g => g.operations.some(op => plan.operations.find(o => o.id === op.id)!.localId === localId))!.title;
  assert.equal(groupOf(deal.id), companyName(deal.values.company_id));
  assert.equal(groupOf(task.id), companyName(store.record('contacts', String(task.values.contact_id))!.values.company_id), 'la tarea va con la empresa de su persona');
  assert.notEqual(plan.operations[0].localId, lucia.id, 'el orden del plan no pone ya primero el conflicto');
  for (const group of explained.groups) { noInternals(group.title); for (const op of group.operations) { for (const f of op.fields) noInternals(f.text); op.relations.forEach(noInternals); } }

  // Al decidir, la frase cambia: conservar lo del CRM deja el cambio solo en local.
  const op = plan.operations.find(o => o.localId === lucia.id)!;
  const decided = recovery.decide(plan.id, [{ operationId: op.id, field: 'phone', decision: 'remote' }]);
  const after = explainReturnPlan(decided, store.spec!, store.records());
  assert.equal(after.summary.conflicts, 0); assert.equal(after.summary.keep, 1);
  void nuevo;
});

test('agrupa por la empresa del registro antes que por la de su persona, y sin empresa por la persona', () => {
  const spec = makeDemoSpec(makeFixture());
  const rec = (entity: CrmRecord['entity'], id: string, values: CrmRecord['values']): CrmRecord => ({ entity, id, values });
  const records = [
    rec('companies', 'c1', { name: 'Estudio Arce' }), rec('companies', 'c2', { name: 'Norte Digital' }),
    rec('contacts', 'p1', { firstname: 'Lucía', lastname: 'Martín', email: 'l@x.es', company_id: 'c1' }),
    rec('contacts', 'p2', { firstname: 'Leo', lastname: 'Paz', email: 'leo@x.es' }),
    rec('deals', 'd1', { dealname: 'Web', amount: 1, dealstage: 'x', company_id: 'c2', contact_id: 'p1' }),
    rec('tasks', 't1', { subject: 'Llamar', due_date: '2026-11-20', status: 'pending', contact_id: 'p2' }),
  ];
  const op = (entity: CrmRecord['entity'], localId: string) => ({ id: 'op-' + localId, entity, localId, remoteId: localId, kind: 'update' as const, label: localId, references: [], remoteVersion: null, status: 'pending' as const, error: null,
    fields: [{ field: 'notes', label: 'Notas', base: null, local: 'x', remote: null, conflict: false, decision: 'local' as const }] });
  const plan = { id: 'p', accountId: 'a', createdAt: new Date().toISOString(), revision: 'r', status: 'review' as const, source: 'hubspot' as const, warning: '', approvedAt: null,
    operations: [op('deals', 'd1'), op('tasks', 't1')] };
  const explained = explainReturnPlan(plan, spec, records);
  assert.equal(explained.target, 'HubSpot');
  assert.deepEqual(explained.groups.map(g => g.title), ['Norte Digital', 'Leo Paz'], 'la oportunidad va con su empresa (no la de Lucía); la tarea, con su persona sin empresa');
});
