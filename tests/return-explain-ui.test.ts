// CLAUDE-RETURN-EXPLAIN-UI · La pantalla de devolución carga solo los registros que el plan necesita y muestra la explicación.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { collectRecords, planKey } from '../src/app-shell/useReturnExplanation.js';
import { makeDemoSpec, makeFixture } from '../shared/fixtures.js';
import type { CrmRecord, EntityName } from '../shared/model.js';
import type { RecoveryPlan } from '../shared/operations.js';

const snapshot = makeFixture(), spec = makeDemoSpec(snapshot);
const byKey = new Map(snapshot.records.map(r => [r.entity + ':' + r.id, r]));
const op = (entity: EntityName, localId: string, references: RecoveryPlan['operations'][number]['references'] = []) => ({ id: 'op-' + localId, entity, localId, remoteId: localId, kind: 'update' as const, label: localId, references, remoteVersion: null, status: 'pending' as const, error: null, fields: [] });
const plan = (operations: RecoveryPlan['operations']): RecoveryPlan => ({ id: 'p', accountId: 'a', createdAt: new Date().toISOString(), revision: 'r', status: 'review', source: 'simulation', warning: '', approvedAt: null, operations });

test('pide los registros del plan y los que enlazan (empresa, persona y empresa de la persona), cada uno una vez', async () => {
  const asked: string[] = [];
  const fetchRecord = async (entity: EntityName, id: string) => { asked.push(entity + ':' + id); return byKey.get(entity + ':' + id) ?? null; };
  const task = snapshot.records.find(r => r.entity === 'tasks' && r.values.contact_id)!;
  const contact = byKey.get('contacts:' + task.values.contact_id)!;
  const records = await collectRecords(plan([op('tasks', task.id), op('tasks', task.id)]), spec, fetchRecord);
  assert.equal(new Set(asked).size, asked.length, 'sin peticiones repetidas');
  assert.ok(asked.includes('tasks:' + task.id) && asked.includes('contacts:' + contact.id), 'la tarea y su persona');
  assert.ok(asked.includes('companies:' + contact.values.company_id), 'la empresa de la persona (tercera ronda)');
  assert.ok(records.every(r => byKey.has(r.entity + ':' + r.id)));
});

test('omite los registros que no existen o fallan, sin romper la explicación', async () => {
  const fetchRecord = async (entity: EntityName, id: string): Promise<CrmRecord | null> => { if (id === 'falla') throw new Error('503'); return byKey.get(entity + ':' + id) ?? null; };
  const records = await collectRecords(plan([op('contacts', 'falla'), op('contacts', 'no-existe'), op('companies', 'company-1')]), spec, fetchRecord);
  assert.deepEqual(records.map(r => r.id), ['company-1']);
});

test('la clave cambia con cada decisión, para volver a explicar', () => {
  const base = plan([{ ...op('contacts', 'contact-1'), fields: [{ field: 'phone', label: 'Teléfono', base: '1', local: '2', remote: '3', conflict: true, decision: null }] }]);
  const decided = structuredClone(base); decided.operations[0].fields[0].decision = 'local';
  assert.notEqual(planKey(base), planKey(decided)); assert.equal(planKey(null), '');
});

test('ChangesView usa la explicación, con decisiones en palabras y la vista anterior como respaldo', () => {
  const view = fs.readFileSync('src/ChangesView.tsx', 'utf8');
  assert.match(view, /const explained=useReturnExplanation\(plan,spec\)/);
  assert.ok(view.includes("'Quedarme con lo mío'") && view.includes("'Quedarme con lo de HubSpot'"));
  assert.ok(view.includes("decide(op,field,'Usar local','Conservar remoto')"), 'la vista anterior sigue mientras carga');
  assert.ok(view.includes("planId:plan!.id,decisions:[{operationId:op.id,field:field.field,decision:e.target.value}]"), 'la decisión sigue yendo a la misma ruta');
});
