import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import { randomUUID, randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { DatabaseSync } from 'node:sqlite';
import { build } from 'esbuild';
import { Store } from '../server/store.js';
import { open } from '../server/crypto.js';
import { CLAIM_PREFIX } from '../server/task-intent-claims.js';
import { currentTaskIntentScope } from '../server/task-intents-service.js';
import { makeFixture, makeDemoSpec } from '../shared/fixtures.js';
import { KEY_PREFIX } from '../shared/task-intent-journal.js';
import {
  TASK_INTENTS_PATH as intents, TaskIntentCheck, TaskIntentDetail, TaskIntentExecution,
  TaskIntentList, type TaskIntentScope,
} from '../shared/task-intents.js';
import { TaskRevisionView } from '../shared/task-revision.js';

const taskId = 'task-2';
const taskPath = '/api/v7/task-revision/' + taskId;
const password = 'fiction-only-entrypoints318';
const envNames = new Set(['path', 'systemroot', 'windir', 'comspec', 'pathext', 'temp', 'tmp', 'tmpdir', 'lang', 'tz']);
const preload = path.resolve('scripts/block-external.cjs');

async function freePort() {
  const probe = net.createServer();
  await new Promise<void>((resolve, reject) => {
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', resolve);
  });
  const address = probe.address();
  assert.ok(address && typeof address !== 'string');
  await new Promise<void>((resolve, reject) => probe.close(error => error ? reject(error) : resolve()));
  return address.port;
}

async function until<T>(read: () => T | undefined | Promise<T | undefined>, description: string) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    const result = await read();
    if (result !== undefined) return result;
    await delay(50);
  }
  assert.fail(description);
}

function start(binary: string, root: string, data: string, port: number, mode: 'observe' | 'pause' = 'observe') {
  const env = Object.fromEntries(Object.entries(process.env).filter(([name]) => envNames.has(name.toLowerCase())));
  const child = spawn(process.execPath, ['--require', preload, binary], {
    cwd: root, env: { ...env, NODE_ENV: 'test', PLANB_DATA_DIR: data, PLANB_PORT: String(port), PLANB_318_TEST_MODE: mode },
    windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.on('data', chunk => { output += chunk; });
  child.stderr.on('data', chunk => { output += chunk; });
  const closed = new Promise<{ code: number | null; signal: string | null }>((resolve, reject) => {
    child.once('error', reject);
    child.once('close', (code, signal) => {
      fs.writeFileSync(path.join(root, `process-${child.pid}.log`), output);
      fs.writeFileSync(path.join(root, `closed-${child.pid}.json`), JSON.stringify({ pid: child.pid, code, signal }));
      resolve({ code, signal });
    });
  });
  async function stop() {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    return await closed;
  }
  return { child, closed, stop, output: () => output };
}

async function compile(entry: string, outfile: string, instrumented: boolean) {
  const source = path.resolve(`server/${entry}.ts`);
  const mount = 'registerTaskIntents(app, store);';
  await build({
    entryPoints: [source], outfile, bundle: true, packages: 'external', platform: 'node', format: 'esm',
    plugins: instrumented ? [{
      name: 'a4-entrypoint-test-barriers',
      setup(builder) {
        builder.onLoad({ filter: /[\\/](main|runtime)\.ts$/ }, args => {
          if (args.path !== source) return;
          const code = fs.readFileSync(source, 'utf8');
          assert.equal(code.split(mount).length, 2, 'Instrument exactly the actual mount');
          return { loader: 'ts', contents: code.replace(mount, `registerTaskIntents(app, store, {
            afterPersist() {
              appendFileSync('calls.log', 'persisted\\n');
              if (process.env.PLANB_318_TEST_MODE === 'pause') return new Promise(() => {});
            },
            writer(...args) {
              appendFileSync('calls.log', 'writer\\n');
              return writeTaskRevision(...args);
            }
          });`) + `\nimport { appendFileSync } from 'node:fs';\nimport { writeTaskRevision } from './task-revision.js';\n` };
        });
      },
    }] : [],
  });
}

function fixture(root: string) {
  const data = path.join(root, 'fiction');
  fs.mkdirSync(data);
  const key = randomBytes(32);
  fs.writeFileSync(path.join(data, '.planb-key'), JSON.stringify({ kind: 'test', data: key.toString('base64') }), { flag: 'wx' });
  const filename = path.join(data, 'planb.sqlite');
  const seed = new Store(filename);
  let scope: TaskIntentScope;
  try {
    const snapshot = makeFixture('agency');
    const exact = snapshot.records.find(record => record.entity === 'tasks' && record.id === taskId)!;
    const homonym = snapshot.records.find(record => record.entity === 'tasks' && record.id === 'task-3')!;
    homonym.values.subject = exact.values.subject!;
    seed.importSnapshot(snapshot);
    seed.saveGeneration(makeDemoSpec(snapshot), { provider: 'demo', model: null, prompt: '', generatedAt: snapshot.capturedAt, approved: false });
    seed.activate();
    seed.set('instanceId', randomUUID());
    scope = currentTaskIntentScope(seed);
  } finally { seed.close(); }
  function rows() {
    const db = new DatabaseSync(filename, { readOnly: true });
    try {
      db.exec('BEGIN');
      return {
        meta: db.prepare('SELECT key,value FROM meta ORDER BY key').all() as { key: string; value: string }[],
        records: db.prepare('SELECT entity,id,value FROM records ORDER BY entity,id').all(),
        history: db.prepare('SELECT * FROM changes ORDER BY id').all(),
      };
    } finally { db.close(); }
  }
  function sql(statement: string) {
    const db = new DatabaseSync(filename);
    try { db.exec('PRAGMA busy_timeout=5000; ' + statement); } finally { db.close(); }
  }
  function calls() {
    const log = path.join(root, 'calls.log');
    return fs.existsSync(log) ? fs.readFileSync(log, 'utf8').trim().split(/\r?\n/) : [];
  }
  function assertRestart(before: ReturnType<typeof rows>, runtime: boolean) {
    const after = rows();
    const expected = new Map<string, boolean>([['returnBusy', false]]);
    if (runtime) expected.set('disconnected', true);
    const exclude = (row: { key: string }) => !expected.has(row.key);
    assert.deepEqual(after.meta.filter(exclude), before.meta.filter(exclude));
    for (const [name, value] of expected) {
      for (const side of [before, after]) {
        const row = side.meta.find(item => item.key === name);
        assert.ok(row);
        assert.equal(JSON.parse(open(row.value, key)), value);
      }
    }
    assert.deepEqual(after.records, before.records);
    assert.deepEqual(after.history, before.history);
    return after;
  }
  return { data, scope, rows, sql, calls, assertRestart };
}

function client(origin: string, scope: TaskIntentScope) {
  let cookie = '';
  let executionPosts = 0;
  const query = '?' + new URLSearchParams({ identity: JSON.stringify(scope.identity), contextRevision: scope.contextRevision });
  function send(route: string, method = 'GET', body?: unknown, session = cookie) {
    if (method === 'POST' && route === intents + '/attempts') executionPosts++;
    return fetch(origin + route, {
      method, headers: { ...(session ? { cookie: session } : {}), ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
      body: body === undefined ? undefined : JSON.stringify(body), redirect: 'error', signal: AbortSignal.timeout(30_000),
    });
  }
  return {
    send, query, get posts() { return executionPosts; }, get cookie() { return cookie; },
    async authorize(action: 'setup' | 'login') {
      const response = await send('/api/v2/auth/' + action, 'POST', { password });
      assert.equal(response.status, 200);
      cookie = response.headers.get('set-cookie')!.split(';')[0]!;
      await response.arrayBuffer();
    },
    post: (body: unknown) => send(intents + '/attempts', 'POST', body),
    list: () => send(intents + query),
    detail: (id: string) => send(intents + '/' + id + query),
    check: (id: string) => send(intents + '/' + id + '/check' + query),
    decision: (id: string, decision: 'accept' | 'abandon', fields: object) => send(intents + '/' + id + '/' + decision, 'POST', { ...scope, ...fields }),
  };
}

async function json(response: Response, status = 200) {
  const body = await response.json();
  assert.equal(response.status, status, JSON.stringify(body));
  return body;
}

async function ready(owner: ReturnType<typeof start>, origin: string, data: string, scope: TaskIntentScope) {
  const endpoint = path.join(data, '.endpoint.json');
  await until(async () => {
    assert.equal(owner.child.exitCode, null, owner.output());
    let receipt: { pid: number; url: string; instanceId: string };
    try { receipt = JSON.parse(fs.readFileSync(endpoint, 'utf8')); }
    catch (error) {
      // The server publishes with writeFileSync, so the file may be empty for a poll.
      if (error instanceof SyntaxError || (error as NodeJS.ErrnoException).code === 'ENOENT') return;
      throw error;
    }
    if (receipt.pid !== owner.child.pid) return;
    const health = await fetch(origin + '/api/health', { signal: AbortSignal.timeout(1500) });
    assert.equal((await json(health)).instanceId, scope.identity.instanceId);
    assert.deepEqual(receipt, { pid: owner.child.pid, url: origin, instanceId: scope.identity.instanceId });
    return true;
  }, 'Owned compiled process did not publish its endpoint');
}

for (const entry of ['main', 'runtime']) {
  test(`A4 mounts on ${entry} and retains exact attempts across four cuts`, { timeout: 240_000 }, async t => {
    const scratch = path.resolve('tests/.tmp');
    fs.mkdirSync(scratch, { recursive: true });
    const bank = fs.mkdtempSync(path.join(scratch, `a4-entry318-${entry}-`));
    const binary = path.join(bank, 'production.mjs');
    const observed = path.join(bank, 'instrumented.mjs');
    await compile(entry, binary, false);
    await compile(entry, observed, true);

    for (const cut of ['initial', 'before-writer', 'lost-ack', 'settlement'] as const) {
      await t.test(cut, { timeout: 50_000 }, async () => {
        const root = path.join(bank, cut);
        fs.mkdirSync(root);
        const f = fixture(root);
        const port = await freePort(), origin = `http://127.0.0.1:${port}`;
        const api = client(origin, f.scope);
        // The exact production bundle handles both SQL faults and the lost response.
        // Only the deterministic pre-writer barrier and replay call counter need a test bundle.
        const first = start(cut === 'before-writer' ? observed : binary, root, f.data, port, 'pause');
        const children = [first];
        try {
          await ready(first, origin, f.data, f.scope);
          await api.authorize('setup');
          const oldCookie = api.cookie;
          const state = await json(await api.send('/api/v2/state'));
          assert.equal(state.workspaceSearchContext.contextRevision, f.scope.contextRevision);
          assert.equal(state.snapshot.source.isTestData, true);
          const original = TaskRevisionView.parse(await json(await api.send(taskPath)));
          const before = f.rows();
          const request = { ...f.scope, attemptId: randomUUID(), taskId, expectedRevision: original.revision, values: { notes: `fiction318-${cut}` } };
          const blocked = await api.send(intents + api.query, 'GET', undefined, '');
          await json(blocked, 401);
          assert.equal(blocked.headers.get('cache-control'), 'no-store');
          assert.match(blocked.headers.get('vary') ?? '', /\bCookie\b/i);
          const empty = TaskIntentList.parse(await json(await api.list()));
          assert.equal(empty.status, 'read');
          assert.deepEqual(empty.entries, []);
          assert.deepEqual(f.rows(), before);
          await json(await api.send(intents + '?' + new URLSearchParams({ identity: JSON.stringify({ ...f.scope.identity, generatedAt: '2000-01-01T00:00:00.000Z' }), contextRevision: f.scope.contextRevision })), 409);

          if (cut === 'initial') {
            f.sql(`CREATE TRIGGER fixture_fault BEFORE INSERT ON meta WHEN NEW.key = '${CLAIM_PREFIX}${request.attemptId}' BEGIN SELECT RAISE(ABORT, 'fiction before dispatch'); END`);
            assert.equal((await json(await api.post(request), 503)).details.code, 'TASK_INTENT_NOT_DISPATCHED');
            assert.deepEqual(f.rows(), before);
            f.sql('DROP TRIGGER fixture_fault');
          } else if (cut === 'before-writer') {
            const pending = api.post(request).then(() => false, () => true);
            await until(() => f.calls().includes('persisted') ? true : undefined, 'Durable barrier did not fire');
            assert.deepEqual(f.calls(), ['persisted']);
            assert.equal(TaskIntentDetail.parse(await json(await api.detail(request.attemptId))).operation.phase, 'attempt');
            assert.deepEqual(f.rows().history, before.history);
            await first.stop();
            assert.equal(await pending, true, 'Termination loses the original execution response');
          } else if (cut === 'lost-ack') {
            const discarded = await api.post(request);
            assert.equal(discarded.status, 200);
            await discarded.body!.cancel();
            // Nothing from the execution body is used. Only the later durable read can identify the receipt.
            assert.equal(f.rows().history.length, 1);
          } else {
            f.sql(`CREATE TRIGGER fixture_fault BEFORE UPDATE ON meta WHEN OLD.key = '${KEY_PREFIX}${request.attemptId}' BEGIN SELECT RAISE(ABORT, 'fiction settlement'); END`);
            const result = TaskIntentExecution.parse(await json(await api.post(request)));
            assert.equal(result.operation.phase, 'attempt');
            assert.equal(result.operation.acknowledgement, null);
            assert.equal(result.writeResult, null);
            f.sql('DROP TRIGGER fixture_fault');
          }

          assert.equal(api.posts, 1);
          const applied = cut === 'lost-ack' || cut === 'settlement';
          const checkpoint = f.rows();
          assert.equal(checkpoint.history.length, applied ? 1 : 0);
          if (applied) assert.equal(checkpoint.history[0]!.record_id, taskId);
          assert.deepEqual(checkpoint.records.filter(row => row.entity !== 'tasks' || row.id !== taskId),
            before.records.filter(row => row.entity !== 'tasks' || row.id !== taskId), 'Homonym and all other rows stay unchanged');
          if (!applied) assert.deepEqual(checkpoint.records, before.records);

          if (cut === 'lost-ack') {
            const contender = start(binary, root, f.data, port);
            children.push(contender);
            assert.equal((await contender.closed).code, 1);
            assert.match(contender.output(), /ya está abierto/);
            assert.deepEqual(f.rows(), checkpoint);
          }
          await first.stop();
          const next = start(observed, root, f.data, port);
          children.push(next);
          assert.notEqual(next.child.pid, first.child.pid);
          await ready(next, origin, f.data, f.scope);
          await json(await api.send(intents + api.query, 'GET', undefined, oldCookie), 401);
          await api.authorize('login');
          const reopened = f.assertRestart(checkpoint, entry === 'runtime');
          const summary = await json(await api.send('/api/v7/local-operations/work-summary'));
          assert.equal(summary.coverage, 'none');
          assert.equal(summary.counts, null);
          const callsBefore = f.calls();
          const listed = TaskIntentList.parse(await json(await api.list()));
          assert.equal(listed.status, 'read');
          if (cut === 'initial') {
            assert.deepEqual(listed.entries, []);
            await json(await api.detail(request.attemptId), 404);
            await json(await api.check(request.attemptId), 404);
            assert.equal(api.posts, 1);
          } else {
            assert.deepEqual(listed.entries.map(op => [op.attemptId, op.taskId]), [[request.attemptId, taskId]]);
            const detail = TaskIntentDetail.parse(await json(await api.detail(request.attemptId)));
            assert.deepEqual(detail.operation.scope, f.scope);
            assert.equal(detail.operation.provenance, cut === 'lost-ack' ? 'server-ack' : null);
            const check = TaskIntentCheck.parse(await json(await api.check(request.attemptId)));
            assert.equal(check.evidence, applied ? 'applied' : 'unchanged');
            assert.deepEqual(f.rows(), reopened);
            const replay = TaskIntentExecution.parse(await json(await api.post(request)));
            assert.equal(replay.replayed, true);
            assert.deepEqual(replay.operation, detail.operation);
            assert.deepEqual(f.rows(), reopened);
            if (cut === 'settlement') {
              const accepted = TaskIntentDetail.parse(await json(await api.decision(request.attemptId, 'accept', {
                expectedSeq: detail.operation.seq, expectedTaskRevision: check.taskRevision,
              })));
              assert.equal(accepted.operation.provenance, 'person-accepted-read');
              assert.equal(accepted.operation.acknowledgement, null);
            } else if (cut === 'before-writer') {
              const abandoned = TaskIntentDetail.parse(await json(await api.decision(request.attemptId, 'abandon', {
                expectedSeq: detail.operation.seq, confirmed: true,
              })));
              assert.equal(abandoned.operation.outcome, 'abandoned');
            }
          }
          if (cut === 'initial') assert.deepEqual(f.rows(), reopened);
          assert.deepEqual(f.calls(), callsBefore, 'Reads, replay and resolution never call the writer');
          assert.deepEqual(f.rows().records, checkpoint.records);
          assert.deepEqual(f.rows().history, checkpoint.history);
        } finally {
          await Promise.all(children.map(child => child.stop()));
        }
      });
    }
  });
}
