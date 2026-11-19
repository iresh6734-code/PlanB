import test from 'node:test';
import assert from 'node:assert/strict';
import type { Change, CrmRecord, EntityName } from '../shared/model.js';
import { formatValue, recoveryChecklist, recoveryChecklistHtml } from '../src/app-shell/recovery-checklist.js';

const rec = (entity: EntityName, id: string, values: CrmRecord['values']): CrmRecord => ({ id, entity, values });
let seq = 0;
const change = (entity: EntityName, recordId: string, operation: Change['operation'], before: CrmRecord['values'] | null, after: CrmRecord['values']): Change =>
  ({ id: ++seq, at: '2026-11-19T10:0' + (seq % 10) + ':00Z', entity, recordId, operation, before: before ? rec(entity, recordId, before) : null, after: rec(entity, recordId, after) });

test('la lista agrupa por registro y ordena empresas, contactos, negocios y tareas con las altas primero', () => {
  seq = 0;
  const changes = [
    change('tasks', 't1', 'update', { hs_task_subject: 'Llamar' }, { hs_task_subject: 'Llamar hoy' }),
    change('contacts', 'c9', 'update', { firstname: 'Ana', email: 'a@x.es', phone: '1' }, { firstname: 'Ana', email: 'ana@x.es', phone: '1' }),
    change('deals', 'local-d', 'create', null, { dealname: 'Renovación', amount: 1200, closed: false, notes: '' }),
    change('companies', '42', 'update', { name: 'Acme' }, { name: 'Acme SL' }),
    change('contacts', 'c9', 'update', { firstname: 'Ana', email: 'ana@x.es', phone: '1' }, { firstname: 'Ana', email: 'ana@x.es', phone: null }),
    change('contacts', 'local-c', 'create', null, { firstname: 'Luis', lastname: 'Mora' }),
    change('contacts', 'local-c', 'update', { firstname: 'Luis', lastname: 'Mora' }, { firstname: 'Luis', lastname: 'Mora Gil' }),
  ];
  const list = recoveryChecklist(changes);
  assert.deepEqual(list.items.map(i => [i.step, i.entity, i.recordId, i.operation]), [
    [1, 'companies', '42', 'update'], [2, 'contacts', 'local-c', 'create'], [3, 'contacts', 'c9', 'update'], [4, 'deals', 'local-d', 'create'], [5, 'tasks', 't1', 'update'],
  ]);
  assert.equal(list.records, 5); assert.equal(list.operations, 7); assert.equal(list.creates, 2); assert.equal(list.updates, 3);
  const contact = list.items[2]!;
  assert.equal(contact.operations, 2); assert.equal(contact.title, 'Ana');
  assert.deepEqual(contact.fields, [{ key: 'email', before: 'a@x.es', after: 'ana@x.es' }, { key: 'phone', before: '1', after: null }]);
  assert.deepEqual(list.items[1]!.fields.map(f => [f.key, f.after]), [['firstname', 'Luis'], ['lastname', 'Mora Gil']], 'un alta se describe por su estado final');
  assert.deepEqual(list.items[3]!.fields.map(f => f.key), ['amount', 'closed', 'dealname'], 'las altas omiten los campos vacíos');
  assert.equal(list.fields, 1 + 2 + 2 + 3 + 1);
});

test('el documento escapa los valores y deja casillas y hueco para el ID remoto de las altas', () => {
  seq = 0;
  const list = recoveryChecklist([
    change('companies', 'local-1', 'create', null, { name: '<script>alert(1)</script>' }),
    change('companies', '7', 'update', { name: 'A', vip: false }, { name: 'A', vip: true }),
  ]);
  const html = recoveryChecklistHtml(list, 'rev-abcdef1234567890', new Date('2026-11-19T11:00:00Z'));
  assert.ok(!html.includes('<script>alert'));
  assert.ok(html.includes('&lt;script&gt;'));
  assert.equal(html.match(/ID remoto en HubSpot/g)?.length, 1);
  assert.equal(html.match(/<section class="item">/g)?.length, 2);
  assert.ok(html.includes('revisión rev-abcdef12'));
  assert.ok(html.includes('@media print'));
  assert.equal(formatValue(true), 'Sí'); assert.equal(formatValue(null), '(vacío)'); assert.equal(formatValue('x'.repeat(500)).length, 240);
  assert.ok(recoveryChecklistHtml(recoveryChecklist([]), 'r', new Date()).includes('No hay cambios pendientes'));
});
