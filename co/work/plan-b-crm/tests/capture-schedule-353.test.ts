import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { setImmediate as nextTurn } from 'node:timers/promises';
import test from 'node:test';
import { createBaseApp } from '../server/app.js';
import { Continuity } from '../server/continuity.js';
import { TECHNICAL_DRILL_CHECKS } from '../shared/drill-evidence.js';
import { makeDemoSpec, makeFixture } from '../shared/fixtures.js';
import type { ContinuityStatus } from '../shared/operations.js';
import { continuityAlerts } from '../src/app-shell/continuity-alerts.js';

const MINUTE = 60_000;

test('353 · el temporizador respeta el plazo, la pausa y un trabajo de captura en curso', { timeout: 15_000 }, async t => {
  const previousEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'test';
  t.after(() => {
    if (previousEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousEnv;
  });
  t.mock.timers.enable({ apis: ['Date', 'setInterval'], now: Date.UTC(2026, 10, 14, 9) });
  const parent = path.resolve('tests/.tmp');
  fs.mkdirSync(parent, { recursive: true });
  const root = fs.mkdtempSync(path.join(parent, 'capture-schedule-353-'));
  fs.writeFileSync(path.join(root, '.planb-key'), JSON.stringify({
    kind: 'test', data: randomBytes(32).toString('base64'),
  }), { flag: 'wx' });
  const original = makeFixture('agency');
  original.source.accountId = '35300';
  const replacement = structuredClone(original);
  replacement.id = 'capture-scheduled-353';
  let finishCapture!: (snapshot: typeof replacement) => void;
  const nextCapture = new Promise<typeof replacement>(resolve => { finishCapture = resolve; });
  let calls = 0;
  const { app, store } = await createBaseApp({
    root, dbPath: path.join(root, 'fiction.sqlite'), staticDir: path.join(root, 'unused'),
    external: {
      capture: async ({ accountId }) => {
        assert.equal(accountId, original.source.accountId);
        calls++;
        if (calls === 1) throw Error('Fallo ficticio del importador');
        assert.equal(calls, 2);
        return nextCapture;
      },
      remote: () => { throw Error('La prueba no ejecuta devoluciones'); },
    },
  });
  let closed = false;
  const status = async (): Promise<ContinuityStatus> => {
    const response = await app.inject('/api/v2/continuity');
    assert.equal(response.statusCode, 200);
    return response.json();
  };
  const schedule = async (enabled: boolean) => {
    const response = await app.inject({ method: 'POST', url: '/api/v2/schedule', payload: { enabled } });
    assert.equal(response.statusCode, 200);
    assert.equal(response.json().enabled, enabled);
  };
  const advance = async (minutes: number) => {
    t.mock.timers.tick(minutes * MINUTE);
    await nextTurn();
  };
  const alertIds = (state: ContinuityStatus) => continuityAlerts(state, new Date()).map(alert => alert.id);

  try {
    await app.ready();
    await nextTurn();
    store.importSnapshot(original);
    store.saveGeneration(makeDemoSpec(original), { provider: 'demo', model: null, generatedAt: original.capturedAt, prompt: '', approved: false });
    store.activate();
    new Continuity(store, root).saveConnection('credencial-ficticia-353', original.source.accountId);
    const initial = await status();
    // A recent drill keeps this scenario focused on the capture branch of the same timer.
    store.set('drills', [{
      id: 'drill-353', captureId: initial.captures[0].id, startedAt: original.capturedAt, completedAt: original.capturedAt,
      isolated: true, passed: true, durationMs: 0, dataSource: 'Ensayo', limitations: [],
      checks: TECHNICAL_DRILL_CHECKS.map(label => ({ label, passed: true, detail: 'Ensayo' })),
    }]);
    await schedule(true);
    assert.equal(calls, 0);
    await advance(1);
    const failed = await status();
    assert.equal(calls, 1);
    assert.equal(failed.jobs[0]?.status, 'failed');
    assert.equal(failed.schedule.lastAttempt, new Date().toISOString());
    assert.ok(alertIds(failed).includes('capture-failed'));
    assert.deepEqual(failed.captures, initial.captures);

    await advance(59);
    assert.equal(calls, 1);
    assert.equal((await status()).schedule.lastAttempt, failed.schedule.lastAttempt);

    await schedule(false);
    await advance(1);
    assert.equal(calls, 1);
    assert.ok(alertIds(await status()).includes('stopped'));
    await schedule(true);
    assert.equal(calls, 1);
    await advance(1);
    const pending = await status();
    assert.equal(calls, 2);
    assert.equal(pending.jobs[0]?.status, 'running');
    assert.equal(pending.schedule.lastAttempt, new Date().toISOString());

    await advance(60);
    assert.equal(calls, 2);
    const waiting = await status();
    assert.deepEqual(waiting.jobs, pending.jobs);
    assert.equal(waiting.schedule.lastAttempt, pending.schedule.lastAttempt);
    replacement.capturedAt = new Date().toISOString();
    finishCapture(replacement);
    await nextTurn();
    const recovered = await status();
    assert.deepEqual(recovered.jobs.map(job => job.status), ['succeeded', 'failed']);
    assert.deepEqual(recovered.captures.map(capture => capture.id), [
      replacement.id + ':' + replacement.capturedAt, initial.captures[0].id,
    ]);
    assert.equal(recovered.operations?.error, null);
    assert.equal(recovered.operations?.lastSuccess, replacement.capturedAt);
    assert.ok(!alertIds(recovered).includes('capture-failed'));
    assert.deepEqual(store.snapshot, original);
    assert.equal(store.changesCount, 0);

    await app.close();
    closed = true;
    await advance(60);
    assert.equal(calls, 2);
  } finally {
    finishCapture(replacement);
    await nextTurn();
    if (!closed) await app.close();
  }
});
