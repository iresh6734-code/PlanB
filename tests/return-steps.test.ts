import assert from 'node:assert/strict';
import test from 'node:test';
import type { RecoveryField, RecoveryOperation, RecoveryPlan } from '../shared/operations.js';
import { returnProgress, returnSteps } from '../src/app-shell/return-steps.js';

const field = (decision: RecoveryField['decision'], conflict = true): RecoveryField => ({ field: 'phone', label: 'Teléfono', base: '1', local: '2', remote: '3', conflict, decision });
const op = (fields: RecoveryField[], status: RecoveryOperation['status'] = 'pending'): RecoveryOperation =>
  ({ id: 'op-' + Math.random(), entity: 'contacts', localId: 'c1', remoteId: 'r1', kind: 'update', label: 'Ana', fields, references: [], remoteVersion: null, status, error: null });
const plan = (status: RecoveryPlan['status'], operations: RecoveryOperation[], source: RecoveryPlan['source'] = 'simulation') => ({ status, source, operations });
const states = (r: ReturnType<typeof returnSteps>) => r.steps.map(s => s.state).join(',');

test('sin plan empieza por revisar y cuenta los cambios guardados', () => {
  const r = returnSteps({ changes: 3, plan: null, blocked: false, reviewed: false });
  assert.equal(r.current, 'review');
  assert.equal(states(r), 'current,todo,todo,todo,todo');
  assert.equal(r.steps[0].hint, '3 cambios guardados: prepara la revisión');
  assert.equal(r.headline, 'Paso 1 de 5 · Revisar');
  assert.equal(returnSteps({ changes: 0, plan: null, blocked: false, reviewed: false }).headline, 'Nada que devolver por ahora');
});

test('los campos sin decisión retienen en conflictos, como el botón de aprobar', () => {
  const r = returnSteps({ changes: 2, plan: plan('review', [op([field(null), field('local')]), op([field(null, false)])]), blocked: false, reviewed: false });
  assert.equal(r.current, 'conflicts');
  assert.equal(r.undecided, 2);
  assert.equal(r.steps[1].hint, '2 campos por decidir');
  const decided = returnSteps({ changes: 2, plan: plan('review', [op([field('remote')])]), blocked: false, reviewed: true });
  assert.equal(decided.current, 'final');
  assert.equal(decided.steps[2].hint, 'Listo para aprobar');
});

test('aprobado pide enviar; parcial pide atención; completo ofrece el justificante', () => {
  assert.equal(returnSteps({ changes: 1, plan: plan('approved', [op([field('local')])], 'hubspot'), blocked: false, reviewed: true }).steps[3].hint, 'Ejecuta el envío a HubSpot de prueba');
  const partial = returnSteps({ changes: 1, plan: plan('partial', [op([field('local')], 'failed'), op([field('local')], 'applied')]), blocked: false, reviewed: true });
  assert.equal(states(partial), 'done,done,done,attention,todo');
  assert.equal(partial.troubled, 1);
  const complete = returnSteps({ changes: 1, plan: plan('complete', [op([field('local')], 'applied')]), blocked: false, reviewed: true });
  assert.equal(complete.current, 'receipt');
  assert.equal(states(complete), 'done,done,done,done,current');
  assert.match(complete.headline, /siguen pendientes de la devolución real/);
  assert.equal(returnProgress(complete.steps), 90);
});

test('con la integridad bloqueada todos los pasos quedan en pausa', () => {
  const r = returnSteps({ changes: 4, plan: plan('review', [op([field(null)])]), blocked: true, reviewed: false });
  assert.equal(r.current, null);
  assert.ok(r.steps.every(s => s.state === 'blocked'));
  assert.equal(returnProgress(r.steps), 0);
});
