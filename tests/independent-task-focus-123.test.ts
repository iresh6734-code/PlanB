import test from 'node:test';
import assert from 'node:assert/strict';
import { createBaseApp } from '../server/app.js';
import { makeFixture, makeDemoSpec } from '../shared/fixtures.js';
import { loadTask, saveTask, verifyAfterUncertain, type Transport } from '../src/local-task-focus-client.js';

async function rig() {
  const { app, store } = await createBaseApp({ dbPath: ':memory:', root: '.', staticDir: 'none' });
  async function activate(id: string, capturedAt: string) {
    const snapshot = makeFixture('agency'); snapshot.id = id; snapshot.capturedAt = capturedAt;
    store.importSnapshot(snapshot, true);
    store.saveGeneration(makeDemoSpec(snapshot), { provider: 'demo', model: null, generatedAt: '2026-11-02T09:00:00Z', prompt: '', approved: false });
    store.activate();
  }
  const calls: string[] = [];
  const transport: Transport = { base: 'http://localhost', fetch: async (input, init) => {
    const target = new URL(String(input)), method = init?.method ?? 'GET'; calls.push(method + ' ' + target.pathname);
    const response = await app.inject({ method: method as 'GET' | 'PATCH', url: target.pathname + target.search,
      headers: init?.headers as Record<string, string> | undefined, payload: init?.body as string | undefined });
    return new Response(response.body, { status: response.statusCode, headers: { 'content-type': 'application/json' } });
  } };
  return { app, store, activate, transport, calls };
}
const sig = () => new AbortController().signal;

test('observation F1: after a lost acknowledgement the verification can read a different installation and call its matching value applied', async () => {
  const first = await rig(), second = await rig();
  try {
    await first.activate('snapshot-a', '2026-11-01T09:00:00Z'); await second.activate('snapshot-b', '2026-11-01T09:00:00Z');
    const a = await loadTask('task-2', sig(), first.transport), b = await loadTask('task-2', sig(), second.transport);
    assert.equal(a.kind, 'ok'); assert.equal(b.kind, 'ok'); if (a.kind !== 'ok' || b.kind !== 'ok') return;
    assert.notEqual(a.context.instanceId, b.context.instanceId);
    second.store.saveRecord('tasks', { status: 'completed' }, 'task-2');
    const before = first.store.changesCount;
    const lost: Transport = { ...first.transport, fetch: async (input, init) => {
      if (init?.method === 'PATCH') { await first.transport.fetch(input, init); throw new TypeError('lost acknowledgement'); }
      return first.transport.fetch(input, init);
    } };
    const outcome = await saveTask({ taskId: 'task-2', baseline: a.record, entity: a.schema!.entity, patch: { status: 'completed' }, context: a.context }, lost);
    assert.equal(outcome.kind, 'uncertain'); assert.equal(first.store.changesCount, before + 1);
    second.calls.length = 0;
    const verification = await verifyAfterUncertain({ taskId: 'task-2', baseline: a.record, patch: { status: 'completed' } }, second.transport);
    assert.equal(verification.kind, 'read');
    if (verification.kind === 'read') assert.equal(verification.evidence, 'applied');
    assert.deepEqual(second.calls, ['GET /api/v2/records/tasks/task-2'], 'the current implementation never checks installation or capture during verification');
  } finally { await first.app.close(); await second.app.close(); }
});

test('observation F2: a new capture sharing its old ID but not its date is treated as the same context and can be edited', async () => {
  const r = await rig();
  try {
    await r.activate('same-capture-id', '2026-11-01T09:00:00Z');
    const original = await loadTask('task-2', sig(), r.transport); assert.equal(original.kind, 'ok'); if (original.kind !== 'ok') return;
    await r.activate('same-capture-id', '2026-11-02T09:00:00Z');
    const replacement = await loadTask('task-2', sig(), r.transport); assert.equal(replacement.kind, 'ok'); if (replacement.kind !== 'ok') return;
    assert.notEqual(original.context.capturedAt, replacement.context.capturedAt);
    r.calls.length = 0;
    const outcome = await saveTask({ taskId: 'task-2', baseline: original.record, entity: original.schema!.entity, patch: { status: 'completed' }, context: original.context }, r.transport);
    assert.equal(outcome.kind, 'saved');
    assert.equal(r.store.record('tasks', 'task-2')!.values.status, 'completed');
    assert.ok(r.calls.includes('PATCH /api/records/tasks/task-2'), 'the edit was applied to the replacement capture');
  } finally { await r.app.close(); }
});
