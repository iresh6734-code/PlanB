import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { createBaseApp } from '../server/app.js';
import { COMMITMENT_RADAR_CAPABILITY_PATH, mountCommitmentRadar } from '../server/commitment-radar-mount.js';
import { mountOperationalRehearsal } from '../server/operational-rehearsal-mount.js';
import { registerTaskIntents } from '../server/task-intents-api.js';
import { currentTaskIntentScope } from '../server/task-intents-service.js';
import { readTaskRevision, writeTaskRevision } from '../server/task-revision.js';
import { makeDemoSpec, makeFixture } from '../shared/fixtures.js';
import { rehearsalApiPath, rehearsalOverview, rehearsalView } from '../shared/operational-rehearsal-api.js';
import { REHEARSAL_RADAR_COMMITMENT } from '../shared/operational-rehearsal-demo.js';
import { TASK_INTENTS_PATH, TaskIntentExecution, TaskIntentList } from '../shared/task-intents.js';

test('326 · guardar en A4 y guardar un ensayo mantienen separados sus efectos en el mismo Store', async t => {
  const now = '2026-11-11T15:00:00.000Z';
  const { app, store } = await createBaseApp({ root: '.', dbPath: ':memory:', staticDir: 'none' });
  t.after(() => app.close());
  let writers = 0;
  registerTaskIntents(app, store, {
    now: () => now,
    writer: (...args) => {
      writers++;
      return writeTaskRevision(...args);
    },
  });
  mountCommitmentRadar(app, store, { clock: () => Date.parse(now) });
  mountOperationalRehearsal(app, store, { clock: () => Date.parse(now) });
  const snapshot = makeFixture('agency');
  store.importSnapshot(snapshot);
  store.saveGeneration(makeDemoSpec(snapshot), { provider: 'demo', model: null, generatedAt: now, prompt: '', approved: false });
  store.activate();
  const scope = currentTaskIntentScope(store);
  const pin = scope.contextRevision;
  const headers = { host: '127.0.0.1' };
  const setup = await app.inject({
    method: 'POST', url: '/api/v2/auth/setup', headers, payload: { password: 'fiction-only-326-password' },
  });
  assert.equal(setup.statusCode, 200);
  const cookie = String(setup.headers['set-cookie']).split(';')[0]!;
  assert.ok(cookie.includes('='));
  const send = (method: 'GET' | 'POST', url: string, payload?: Record<string, unknown>) =>
    app.inject({ method, url, headers: { ...headers, cookie }, ...(payload ? { payload } : {}) });
  const getRehearsal = () => send('GET', rehearsalApiPath + '?' + new URLSearchParams({
    contextRevision: pin, commitmentId: REHEARSAL_RADAR_COMMITMENT,
  }));
  const intentList = () => send('GET', TASK_INTENTS_PATH + '?' + new URLSearchParams({
    identity: JSON.stringify(scope.identity), contextRevision: pin,
  }));
  const dump = () => ['meta', 'records', 'changes'].map(table => store.db.prepare('SELECT * FROM ' + table + ' ORDER BY rowid').all());
  const otherState = () => store.db.prepare("SELECT key, value FROM meta WHERE key LIKE 'commitment-%' OR key LIKE 'operational-rehearsal:%' ORDER BY key").all();

  assert.equal((await send('POST', COMMITMENT_RADAR_CAPABILITY_PATH + '/activate', { contextRevision: pin })).statusCode, 201);
  const before = dump();
  const first = rehearsalOverview.parse((await getRehearsal()).json());
  assert.equal(first.status, 'available');
  assert.deepEqual(first.rehearsals, []);
  assert.deepEqual(TaskIntentList.parse((await intentList()).json()).entries, []);
  assert.deepEqual(dump(), before, 'consultar las dos funciones no cambia SQLite');

  const linkedState = otherState();
  const taskId = 'task-2';
  const input = {
    ...scope, attemptId: randomUUID(), taskId, expectedRevision: readTaskRevision(store, taskId).revision,
    values: { notes: 'Tarea ficticia de composición 326' },
  };
  const written = await send('POST', TASK_INTENTS_PATH + '/attempts', input);
  assert.equal(written.statusCode, 200);
  const executed = TaskIntentExecution.parse(written.json());
  assert.equal(executed.operation.provenance, 'server-ack');
  assert.equal(executed.operation.acknowledgement?.changed, true);
  assert.equal(writers, 1);
  assert.equal(store.changesCount, 1);
  assert.deepEqual(otherState(), linkedState);
  assert.equal(rehearsalOverview.parse((await getRehearsal()).json()).modelRevision, first.modelRevision);

  const [, recordsAfterTask, historyAfterTask] = dump();
  const rehearsalId = randomUUID();
  const saved = await send('POST', rehearsalApiPath + '/rehearsals', {
    contextRevision: pin, commitmentId: REHEARSAL_RADAR_COMMITMENT, id: rehearsalId,
    perturbationIds: [], priority: 'focus',
  });
  assert.equal(saved.statusCode, 201);
  rehearsalView.parse(saved.json());
  assert.equal(rehearsalOverview.parse((await getRehearsal()).json()).rehearsals.length, 1);
  const journal = TaskIntentList.parse((await intentList()).json());
  assert.deepEqual(journal.entries, [executed.operation]);
  const [, recordsAfterRehearsal, historyAfterRehearsal] = dump();
  assert.deepEqual(recordsAfterRehearsal, recordsAfterTask);
  assert.deepEqual(historyAfterRehearsal, historyAfterTask);

  const beforeReplay = dump();
  const replay = TaskIntentExecution.parse((await send('POST', TASK_INTENTS_PATH + '/attempts', input)).json());
  assert.equal(replay.replayed, true);
  assert.equal(writers, 1);
  assert.deepEqual(dump(), beforeReplay);
});
