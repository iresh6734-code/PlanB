import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import { TaskIntentCheck, TaskIntentDetail, TaskIntentExecution, TaskIntentList, TASK_INTENTS_PATH } from '../shared/task-intents.js';
import { TaskRevisionView } from '../shared/task-revision.js';

test('331 · un acuse compacto conserva su prueba tras perder la respuesta y reiniciar', { timeout: 120_000 }, async () => {
  const repo = process.cwd();
  const scratch = path.resolve('tests/.tmp');
  fs.mkdirSync(scratch, { recursive: true });
  const root = fs.mkdtempSync(path.join(scratch, 'compact-restart331-'));
  const moduleUrl = (file: string) => JSON.stringify(pathToFileURL(path.join(repo, file)).href);
  const database = path.join(root, 'planb.sqlite');
  const writerLog = path.join(root, 'writer.txt');
  const wireLog = path.join(root, 'receipt.jsonl');
  const script = path.join(root, 'server.mts');
  fs.writeFileSync(path.join(root, '.planb-key'), JSON.stringify({ kind: 'test', data: randomBytes(32).toString('base64') }), { flag: 'wx' });
  fs.writeFileSync(script, `
    import fs from 'node:fs';
    import { createBaseApp } from ${moduleUrl('server/app.ts')};
    import { registerTaskIntents } from ${moduleUrl('server/task-intents-api.ts')};
    import { writeTaskRevision } from ${moduleUrl('server/task-revision.ts')};
    import { makeDemoSpec, makeFixture } from ${moduleUrl('shared/fixtures.ts')};
    const { app, store } = await createBaseApp({ root: '.', dbPath: ${JSON.stringify(database)}, staticDir: 'none', taskRevisions: true });
    const at = '2026-11-10T10:00:00.000Z';
    if (!store.snapshot) {
      const snapshot = makeFixture('agency');
      const entity = snapshot.entities.find(item => item.id === 'tasks');
      const field = entity.fields.find(item => item.key === 'notes');
      const record = snapshot.records.find(item => item.entity === 'tasks' && item.id === 'task-2');
      for (let i = 0; i < 50; i++) {
        entity.fields.push({ ...field, key: 'wide_' + i, label: 'Campo ficticio ' + i });
        record.values['wide_' + i] = '漢'.repeat(4000);
      }
      store.importSnapshot(snapshot);
      store.saveGeneration(makeDemoSpec(snapshot), { provider: 'demo', model: null, generatedAt: at, prompt: '', approved: false });
      store.activate();
    }
    registerTaskIntents(app, store, {
      now: () => at,
      writer: (...args) => {
        fs.appendFileSync(${JSON.stringify(writerLog)}, process.pid + '\\n');
        return writeTaskRevision(...args);
      },
    });
    app.addHook('onSend', async (request, reply, payload) => {
      if (request.method === 'POST' && request.url === '/api/v7/task-intents/attempts' && reply.statusCode === 200 && typeof payload === 'string') {
        const body = JSON.parse(payload);
        fs.appendFileSync(${JSON.stringify(wireLog)}, JSON.stringify({ pid: process.pid, omission: body.writeResultOmitted, record: body.writeResult !== null }) + '\\n');
      }
      return payload;
    });
    await app.listen({ host: '127.0.0.1', port: 0 });
    console.log('LISTEN ' + app.server.address().port);
  `, { flag: 'wx' });
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) =>
    ['path', 'systemroot', 'windir', 'comspec', 'pathext', 'lang', 'tz', 'temp', 'tmp', 'tmpdir'].includes(key.toLowerCase())));
  type Instance = { pid: number | undefined; ready: Promise<string>; stop(): Promise<void> };
  const instances: Instance[] = [];
  function start(): Instance {
    const child = spawn(process.execPath, ['--require', path.resolve('scripts/block-external.cjs'), '--import', 'tsx', script], {
      cwd: repo, env: { ...env, NODE_ENV: 'test' }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
    });
    let log = '';
    const closed = new Promise<{ pid?: number; code: number | null; signal: NodeJS.Signals | null }>(resolve =>
      child.once('close', (code, signal) => resolve({ pid: child.pid, code, signal })));
    child.stderr.on('data', chunk => { log += chunk; });
    const ready = new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('No arrancó el servidor ficticio. ' + log)), 30_000);
      child.once('error', error => { clearTimeout(timer); reject(error); });
      child.once('close', () => { clearTimeout(timer); reject(new Error('Terminó el servidor ficticio. ' + log)); });
      child.stdout.on('data', chunk => {
        const port = /LISTEN (\d+)/.exec(String(chunk))?.[1];
        if (port) { clearTimeout(timer); resolve('http://127.0.0.1:' + port); }
      });
    });
    const stop = async () => {
      if (child.exitCode === null && child.signalCode === null) child.kill();
      const receipt = await closed;
      fs.writeFileSync(path.join(root, 'closed-' + child.pid + '.json'), JSON.stringify(receipt));
    };
    const instance = { pid: child.pid, ready, stop };
    instances.push(instance);
    return instance;
  }
  const rows = () => {
    const db = new DatabaseSync(database, { readOnly: true });
    try {
      return {
        records: db.prepare('SELECT * FROM records ORDER BY entity,id').all(),
        changes: db.prepare('SELECT * FROM changes ORDER BY id').all(),
      };
    } finally {
      db.close();
    }
  };
  const writers = () => fs.readFileSync(writerLog, 'utf8').trim().split('\n').map(Number);
  const password = 'fiction-only-331-password';
  const send = (origin: string, method: 'GET' | 'POST', url: string, cookie = '', payload?: unknown) => fetch(origin + url, {
    method,
    headers: { ...(cookie ? { cookie } : {}), ...(payload ? { 'content-type': 'application/json' } : {}) },
    ...(payload ? { body: JSON.stringify(payload) } : {}),
  });
  const json = async (response: Response, expected = 200) => {
    assert.equal(response.status, expected);
    return response.json();
  };
  const authorize = async (origin: string, action: 'setup' | 'login') => {
    const response = await send(origin, 'POST', '/api/v2/auth/' + action, '', { password });
    assert.equal(response.status, 200);
    const cookie = response.headers.get('set-cookie')?.split(';')[0];
    assert.ok(cookie);
    await response.body?.cancel();
    return cookie;
  };

  try {
    const first = start(), origin = await first.ready;
    const oldCookie = await authorize(origin, 'setup');
    const state = await json(await send(origin, 'GET', '/api/v2/state', oldCookie));
    const view = TaskRevisionView.parse(await json(await send(origin, 'GET', '/api/v7/task-revision/task-2', oldCookie)));
    assert.equal(view.captureId, state.snapshot.id);
    const identity = {
      instanceId: view.instanceId, snapshotId: view.captureId, capturedAt: view.capturedAt,
      captureStartedAt: state.snapshot.captureStartedAt ?? null, accountId: state.snapshot.source.accountId ?? null,
      generatedAt: state.generation.generatedAt,
    };
    const contextRevision = state.workspaceSearchContext.contextRevision;
    const attemptId = randomUUID();
    const input = { identity, contextRevision, attemptId, taskId: 'task-2', expectedRevision: view.revision, values: { notes: 'Cambio ficticio persistido 331' } };
    const before = rows();
    const lost = await send(origin, 'POST', TASK_INTENTS_PATH + '/attempts', oldCookie, input);
    assert.equal(lost.status, 200);
    // The first client never consumes the response.
    await lost.body?.cancel();
    const initialWire = JSON.parse(fs.readFileSync(wireLog, 'utf8').trim());
    assert.deepEqual(initialWire, { pid: first.pid, omission: 'response-too-large', record: false });
    const written = rows();
    assert.equal(written.changes.length, before.changes.length + 1);
    assert.deepEqual(writers(), [first.pid]);
    await first.stop();

    const next = start(), reopened = await next.ready;
    assert.notEqual(next.pid, first.pid);
    const query = '?' + new URLSearchParams({ identity: JSON.stringify(identity), contextRevision });
    assert.equal((await send(reopened, 'GET', TASK_INTENTS_PATH + query, oldCookie)).status, 401);
    const cookie = await authorize(reopened, 'login');
    const list = TaskIntentList.parse(await json(await send(reopened, 'GET', TASK_INTENTS_PATH + query, cookie)));
    assert.equal(list.entries.length, 1);
    const operation = list.entries[0]!;
    assert.deepEqual([operation.attemptId, operation.taskId, operation.provenance, operation.outcome], [attemptId, 'task-2', 'server-ack', 'acknowledged']);
    assert.equal(operation.acknowledgement?.changed, true);
    assert.match(operation.acknowledgement!.resultingRevision, /^[a-f0-9]{64}$/);
    const detailPath = TASK_INTENTS_PATH + '/' + attemptId;
    const detail = TaskIntentDetail.parse(await json(await send(reopened, 'GET', detailPath + query, cookie)));
    assert.deepEqual(detail.operation, operation);
    const check = TaskIntentCheck.parse(await json(await send(reopened, 'GET', detailPath + '/check' + query, cookie)));
    assert.deepEqual([check.operation, check.evidence, check.reason, check.record], [operation, 'unavailable', 'response-too-large', null]);
    assert.deepEqual(rows(), written);

    const replay = TaskIntentExecution.parse(await json(await send(reopened, 'POST', TASK_INTENTS_PATH + '/attempts', cookie, input)));
    assert.deepEqual([replay.replayed, replay.operation, replay.writeResult, replay.writeResultOmitted], [true, operation, null, 'not-retained']);
    assert.deepEqual(rows(), written);
    assert.deepEqual(writers(), [first.pid]);
  } finally {
    await Promise.all(instances.map(instance => instance.stop()));
  }
});
