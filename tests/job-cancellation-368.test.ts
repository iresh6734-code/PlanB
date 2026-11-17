import assert from 'node:assert/strict';
import { setImmediate as nextTurn } from 'node:timers/promises';
import test from 'node:test';
import { Jobs } from '../server/jobs.js';
import { Store } from '../server/store.js';

test('a capture cancelled in the queue never calls the worker', async t => {
  const store = new Store(':memory:');
  t.after(() => store.close());
  const jobs = new Jobs(store);
  let calls = 0;
  const job = jobs.start('capture', async () => { calls++; });
  assert.equal(jobs.list()[0].status, 'queued');
  assert.deepEqual(jobs.cancel(job.id), { cancelled: true });
  await jobs.stop();
  assert.equal(calls, 0);
  assert.equal(jobs.list()[0].status, 'cancelled');
  assert.equal(jobs.list()[0].message, 'Cancelado');
  assert.throws(() => jobs.cancel(job.id), /ya terminó/);
});

for (const cancelled of [false, true]) {
  const expected = cancelled ? 'cancelled' : 'succeeded';
  test('late progress cannot rewrite a ' + expected + ' job', async t => {
    const store = new Store(':memory:');
    t.after(() => store.close());
    const jobs = new Jobs(store);
    let report!: (message: string, percent: number) => void;
    let finish!: () => void;
    const pending = new Promise<void>(resolve => { finish = resolve; });
    const job = jobs.start('capture', async (progress, signal) => {
      report = progress;
      report('Capturando', 25);
      await pending;
      signal.throwIfAborted();
      return { records: 62 };
    });
    await nextTurn();
    assert.equal(jobs.list()[0].progress, 25);
    if (cancelled) {
      jobs.cancel(job.id);
      const cancelling = jobs.list()[0];
      report('Progreso tras la cancelación', 90);
      assert.deepEqual(jobs.list()[0], cancelling);
    }
    finish();
    await nextTurn();
    const terminal = jobs.list()[0];
    assert.equal(terminal.status, expected);
    assert.equal(terminal.message, cancelled ? 'Cancelado' : 'Completado');
    report('Progreso después de terminar', 90);
    assert.deepEqual(jobs.list()[0], terminal);
  });
}

test('a failed queue write leaves the worker free for a subsequent job', async t => {
  const store = new Store(':memory:');
  t.after(() => store.close());
  const jobs = new Jobs(store);
  let calls = 0;
  const run = async () => { calls++; };
  store.db.exec(`
    CREATE TEMP TRIGGER fail_queue_write BEFORE INSERT ON meta
    WHEN NEW.key = 'jobs'
    BEGIN SELECT RAISE(ABORT, 'synthetic queue persistence failure'); END
  `);
  assert.throws(() => jobs.start('capture', run), /synthetic queue persistence failure/);
  assert.deepEqual(jobs.list(), []);
  store.db.exec('DROP TRIGGER fail_queue_write');
  jobs.start('capture', run);
  await nextTurn();
  assert.equal(calls, 1);
  assert.equal(jobs.list()[0].status, 'succeeded');
});
