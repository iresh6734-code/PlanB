import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { setImmediate as nextTurn } from 'node:timers/promises';
import test, { type TestContext } from 'node:test';
import { createBaseApp } from '../server/app.js';
import { Continuity } from '../server/continuity.js';
import { makeFixture } from '../shared/fixtures.js';
import type { ContinuityStatus } from '../shared/operations.js';

const earlier = '2026-11-14T08:00:00.000Z';

async function fixture(t: TestContext) {
  const parent = path.resolve('tests/.tmp');
  mkdirSync(parent, { recursive: true });
  const root = mkdtempSync(path.join(parent, 'capture-state-367-'));
  writeFileSync(path.join(root, '.planb-key'), JSON.stringify({
    kind: 'test', data: randomBytes(32).toString('base64'),
  }), { flag: 'wx' });
  const initial = makeFixture('agency');
  initial.capturedAt = earlier;
  initial.source.accountId = '36700';
  const incoming = { ...initial, id: 'capture-367', capturedAt: '2026-11-14T09:00:00.000Z' };
  let importCalls = 0;
  const { app, store } = await createBaseApp({
    root, dbPath: path.join(root, 'fiction.sqlite'), staticDir: path.join(root, 'unused'),
    external: {
      capture: async () => { importCalls++; return incoming; },
      remote: () => { throw Error('El ensayo no realiza devoluciones'); },
    },
  });
  t.after(() => app.close());
  await app.ready();
  await nextTurn();
  store.importSnapshot(initial);
  new Continuity(store, root).saveConnection('solo-credencial-ficticia-367', initial.source.accountId);
  store.set('captureLastAttempt', earlier);
  store.set('captureLastSuccess', earlier);
  return {
    store, incoming, importCalls: () => importCalls,
    capture: () => app.inject({ method: 'POST', url: '/api/v2/captures' }),
    async status(): Promise<ContinuityStatus> {
      const response = await app.inject('/api/v2/continuity');
      assert.equal(response.statusCode, 200);
      return response.json();
    },
  };
}

test('a rejected manual capture preserves the last real attempt', async t => {
  const rig = await fixture(t);
  rig.store.set('disconnected', true);
  const before = await rig.status();
  const response = await rig.capture();
  assert.equal(response.statusCode, 409);
  const after = await rig.status();
  assert.equal(rig.importCalls(), 0);
  assert.deepEqual(after.operations, before.operations);
  assert.deepEqual(after.jobs, before.jobs);
});

test('failure persisting capture success rolls back the capture and permits a clean retry', async t => {
  const rig = await fixture(t);
  const before = await rig.status();
  rig.store.db.exec(`
    CREATE TEMP TRIGGER fail_capture_success BEFORE INSERT ON meta
    WHEN NEW.key = 'captureLastSuccess'
    BEGIN SELECT RAISE(ABORT, 'synthetic capture persistence failure'); END
  `);
  assert.equal((await rig.capture()).statusCode, 200);
  await nextTurn();
  const failed = await rig.status();
  assert.equal(rig.importCalls(), 1);
  assert.equal(failed.jobs[0]?.status, 'failed');
  assert.deepEqual(failed.captures, before.captures);
  assert.equal(failed.operations?.lastSuccess, earlier);
  assert.notEqual(failed.operations?.lastAttempt, earlier);
  assert.ok(failed.operations?.error);

  rig.store.db.exec('DROP TRIGGER fail_capture_success');
  assert.equal((await rig.capture()).statusCode, 200);
  await nextTurn();
  const recovered = await rig.status();
  assert.equal(rig.importCalls(), 2);
  assert.deepEqual(recovered.jobs.map(job => job.status), ['succeeded', 'failed']);
  assert.deepEqual(recovered.captures.map(capture => capture.id), [
    rig.incoming.id + ':' + rig.incoming.capturedAt, before.captures[0].id,
  ]);
  assert.notEqual(recovered.operations?.lastSuccess, earlier);
  assert.equal(recovered.operations?.error, null);
});
