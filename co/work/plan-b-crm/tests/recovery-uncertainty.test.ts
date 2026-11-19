import test from 'node:test';
import assert from 'node:assert/strict';
import { Store } from '../server/store.js';
import { Recovery, simulatedRemote } from '../server/recovery.js';
import { inspectRecoveryCopy } from '../server/recovery-preflight.js';
import { makeFixture, makeDemoSpec } from '../shared/fixtures.js';
import type { RecoveryPlan } from '../shared/operations.js';

async function data() {
  const s = new Store(':memory:');
  try {
    const snap = makeFixture(); s.importSnapshot(snap); s.saveGeneration(makeDemoSpec(snap), { provider: 'demo', model: null, generatedAt: new Date().toISOString(), prompt: '', approved: false }); s.activate();
    s.saveRecord('contacts', { phone: 'fiction-change-055' }, 'contact-1'); s.saveRecord('contacts', { phone: 'fiction-other-055' }, 'contact-2');
    const engine = new Recovery(s), plan = await engine.preview({ ...simulatedRemote(s), source: 'hubspot' }); engine.approve(plan.id);
    return s.bundle();
  } finally { s.close(); }
}
const statuses: RecoveryPlan['status'][] = ['review', 'approved', 'applying', 'partial', 'complete'];

test('every sending operation becomes uncertain under all five saved plan statuses, without changing source data or replaying', async () => {
  const base = await data();
  for (const status of statuses) {
    const bundle = structuredClone(base), plan = bundle.returnState!.plan!; plan.status = status; plan.operations[0].status = 'sending';
    const before = JSON.stringify(bundle), target = new Store(':memory:');
    try {
      target.restoreBundle(bundle); const restored = target.get<RecoveryPlan>('recoveryPlan', null as any);
      assert.equal(restored.status, 'partial', status); assert.equal(restored.approvedAt, null); assert.equal(restored.operations[0].status, 'uncertain');
      assert.match(restored.operations[0].error!, /Verifica el resultado remoto antes de repetir/);
      assert.equal(restored.operations[1].status, plan.operations[1].status, 'other operations retain their status');
      assert.deepEqual(target.records(), bundle.records); assert.deepEqual(target.changes(), bundle.changes);
      assert.equal(JSON.stringify(bundle), before, 'caller artifact is never rewritten');
      const checked = inspectRecoveryCopy(before); assert.equal(checked.status, 'valid'); assert.equal(checked.summary!.uncertainOperationsAfterRestore, 1);
      assert.ok(checked.issues.some(issue => issue.code === 'REMOTE_RESULT_UNCERTAIN'));
      assert.throws(() => target.saveRecord('contacts', { phone: 'should-not-write' }, 'contact-1'), { status: 409 });
      const engine = new Recovery(target); await assert.rejects(engine.apply(restored.id, simulatedRemote(target)), /inciert|aprob|revisa/i);
    } finally { target.close(); }
  }
});

test('preexisting uncertainty cannot retain complete/approved status, while resolved or pending operations are preserved', async () => {
  const base = await data();
  for (const status of statuses) {
    const bundle = structuredClone(base), plan = bundle.returnState!.plan!; plan.status = status;
    plan.operations[0].status = 'uncertain'; plan.operations[0].error = 'Historical uncertainty'; plan.operations[1].status = 'applied';
    const target = new Store(':memory:');
    try {
      target.restoreBundle(bundle); const restored = target.get<RecoveryPlan>('recoveryPlan', null as any);
      assert.equal(restored.status, 'partial'); assert.equal(restored.approvedAt, null); assert.equal(restored.operations[0].error, 'Historical uncertainty');
      assert.equal(restored.operations[1].status, 'applied');
    } finally { target.close(); }
  }
});

test('Recovery startup normalizes interrupted sends even outside applying, without calling any remote', async () => {
  const base = await data();
  for (const status of statuses) {
    const target = new Store(':memory:');
    try {
      target.restoreBundle(base); const plan = structuredClone(base.returnState!.plan!); plan.status = status; plan.operations[0].status = 'sending'; target.set('recoveryPlan', plan);
      const records = target.records(), changes = target.changes(); const engine = new Recovery(target), restored = engine.plan()!;
      assert.equal(restored.status, 'partial'); assert.equal(restored.approvedAt, null); assert.equal(restored.operations[0].status, 'uncertain');
      assert.deepEqual(target.records(), records); assert.deepEqual(target.changes(), changes);
      assert.throws(() => engine.approve(restored.id), /inciert/i);
    } finally { target.close(); }
  }
});

test('ordinary approved plan without uncertainty returns to review after restore; completed resolved plan stays complete', async () => {
  const base = await data(), target = new Store(':memory:');
  try {
    target.restoreBundle(base); assert.equal(target.get<RecoveryPlan>('recoveryPlan', null as any).status, 'review');
    const completed = structuredClone(base); completed.returnState!.plan!.status = 'complete'; completed.returnState!.plan!.operations.forEach(op => { op.status = 'applied'; });
    target.restoreBundle(completed); assert.equal(target.get<RecoveryPlan>('recoveryPlan', null as any).status, 'complete');
  } finally { target.close(); }
});
