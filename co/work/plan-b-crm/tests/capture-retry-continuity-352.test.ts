import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { setImmediate as nextTurn, setTimeout as delay } from 'node:timers/promises';
import test from 'node:test';
import { createBaseApp } from '../server/app.js';
import { Continuity } from '../server/continuity.js';
import { exportSummary } from '../server/recovery-copy.js';
import { TECHNICAL_DRILL_CHECKS } from '../shared/drill-evidence.js';
import { makeDemoSpec, makeFixture } from '../shared/fixtures.js';
import type { ContinuityStatus } from '../shared/operations.js';
import { continuityAlerts } from '../src/app-shell/continuity-alerts.js';

test('352 · las rutas reales conservan la copia tras fallar y retiran el aviso al capturar de nuevo', { timeout: 15_000 }, async t => {
  const previousEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'test';
  t.after(() => {
    if (previousEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousEnv;
  });
  const parent = path.resolve('tests/.tmp');
  fs.mkdirSync(parent, { recursive: true });
  const root = fs.mkdtempSync(path.join(parent, 'capture-retry-352-'));
  fs.writeFileSync(path.join(root, '.planb-key'), JSON.stringify({
    kind: 'test', data: randomBytes(32).toString('base64'),
  }), { flag: 'wx' });
  const original = makeFixture('agency');
  original.source.accountId = '35200';
  const replacement = structuredClone(original);
  replacement.id = 'capture-retry-352';
  replacement.capturedAt = new Date(Date.parse(original.capturedAt) + 1).toISOString();
  replacement.records.find(record => record.id === 'contact-1')!.values.phone = '600 352 000';
  let calls = 0;
  const open = () => createBaseApp({
    root, dbPath: path.join(root, 'fiction.sqlite'), staticDir: path.join(root, 'unused'),
    external: {
      capture: async ({ accountId, signal }) => {
        assert.equal(accountId, original.source.accountId);
        signal?.throwIfAborted();
        calls++;
        if (calls === 1) throw Error('Fallo ficticio del importador');
        assert.equal(calls, 2);
        return replacement;
      },
      remote: () => { throw Error('La prueba no ejecuta devoluciones'); },
    },
  });
  let context: Awaited<ReturnType<typeof open>> | null = null;
  const close = async () => {
    const previous = context;
    context = null;
    if (previous) await previous.app.close();
  };
  const reopen = async () => {
    await close();
    context = await open();
    await context.app.ready();
    await nextTurn();
    return context;
  };
  const status = async (): Promise<ContinuityStatus> => {
    const response = await context!.app.inject('/api/v2/continuity');
    assert.equal(response.statusCode, 200);
    return response.json();
  };
  const capture = async (expected: 'failed' | 'succeeded') => {
    const response = await context!.app.inject({ method: 'POST', url: '/api/v2/captures' });
    assert.equal(response.statusCode, 200, response.body);
    const { id } = response.json();
    for (let count = 0; count < 100; count++) {
      const current = await status();
      const job = current.jobs.find(job => job.id === id);
      if (job && job.status !== 'running' && job.status !== 'queued') {
        assert.equal(job.status, expected);
        return { id, current };
      }
      await delay(20);
    }
    assert.fail('La captura no terminó en el plazo de la prueba');
  };
  const alerts = (state: ContinuityStatus) => continuityAlerts(state, new Date()).map(alert => alert.id);

  try {
    const { store } = await reopen();
    store.importSnapshot(original);
    store.saveGeneration(makeDemoSpec(original), { provider: 'demo', model: null, generatedAt: original.capturedAt, prompt: '', approved: false });
    store.activate();
    store.saveRecord('contacts', { phone: '600 111 352' }, 'contact-1');
    new Continuity(store, root).saveConnection('credencial-ficticia-352', original.source.accountId);
    const initial = await status();
    const [before] = initial.captures;
    const initialRevision = exportSummary(store).revision;
    // Keep scheduled capture and drill idle on reopen while testing the capture API.
    const now = new Date().toISOString();
    store.set('schedule', { enabled: true, intervalMinutes: 60, lastAttempt: now });
    store.set('drills', [{
      id: 'drill-352', captureId: before.id, startedAt: now, completedAt: now,
      isolated: true, passed: true, durationMs: 0, dataSource: 'Ensayo', limitations: [],
      checks: TECHNICAL_DRILL_CHECKS.map(label => ({ label, passed: true, detail: 'Ensayo' })),
    }]);
    const failure = await capture('failed');
    assert.deepEqual(failure.current.captures, initial.captures);
    assert.equal(failure.current.schedule.enabled, true);
    assert.match(failure.current.operations!.error!.message, /la copia anterior se conserva/i);
    assert.ok(alerts(failure.current).includes('capture-failed'));
    assert.equal(exportSummary(store).revision, initialRevision);

    const reopened = await reopen();
    const afterFailure = await status();
    assert.deepEqual(afterFailure.captures, initial.captures);
    assert.equal(afterFailure.jobs.find(job => job.id === failure.id)?.status, 'failed');
    assert.ok(alerts(afterFailure).includes('capture-failed'));

    const success = await capture('succeeded');
    assert.notEqual(success.id, failure.id);
    assert.deepEqual(success.current.jobs.filter(job => job.kind === 'capture').map(job => job.status), ['succeeded', 'failed']);
    assert.equal(success.current.operations!.error, null);
    assert.ok(success.current.operations!.lastSuccess);
    assert.ok(!alerts(success.current).includes('capture-failed'));
    const [latest, prior] = success.current.captures;
    assert.equal(latest.id, replacement.id + ':' + replacement.capturedAt);
    assert.deepEqual(prior, before);
    assert.deepEqual(reopened.store.capture(latest.id), replacement);
    assert.deepEqual(reopened.store.capture(before.id), original);
    assert.equal(exportSummary(reopened.store).revision, initialRevision);

    const final = await reopen();
    const afterSuccess = await status();
    assert.deepEqual(afterSuccess.captures, success.current.captures);
    assert.deepEqual(afterSuccess.operations, success.current.operations);
    assert.ok(!alerts(afterSuccess).includes('capture-failed'));
    assert.equal(exportSummary(final.store).revision, initialRevision);
    assert.equal(final.store.changesCount, 1);
    assert.equal(calls, 2);
  } finally {
    await close();
  }
});
