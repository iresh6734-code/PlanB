import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { setTimeout as delay } from 'node:timers/promises';
import test from 'node:test';
import { DEMO } from '../shared/date-check-demo.js';
import { dateCheckApiPath, dateCheckRecordView, dateCheckView } from '../shared/date-check-api.js';
import { reviewApiPath, reviewView } from '../shared/date-check-review-api.js';
import { makeDemoSpec, makeFixture } from '../shared/fixtures.js';
import { Store } from '../server/store.js';

const sha = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
const candidateName = 'candidate-158bfafe-08bd-4725-bb65-359424e5286e';

test('342 · el ejecutable recupera la decisión y su desenlace tras reiniciar', { timeout: 90_000 }, async t => {
  const candidate = path.resolve(process.env.PLANB_CANDIDATE_342 ?? 'tests/.tmp/release-candidates/' + candidateName);
  assert.equal(path.basename(candidate), candidateName);
  const manifest = JSON.parse(fs.readFileSync(path.join(candidate, 'manifest.json'), 'utf8'));
  assert.equal(manifest.state, 'compiled-and-node-verified');
  assert.deepEqual([manifest.approved, manifest.deployed, manifest.releaseEligible], [false, false, false]);

  const parent = path.resolve('tests/.tmp');
  fs.mkdirSync(parent, { recursive: true });
  const root = fs.mkdtempSync(path.join(parent, 'binary342-run-'));
  const data = path.join(root, 'fiction');
  const temp = path.join(root, 'tmp');
  fs.mkdirSync(data);
  fs.mkdirSync(temp);
  const files = manifest.artifacts as { path: string; sha256: string }[];
  for (const entry of files.filter(entry => entry.path === 'server.mjs' || entry.path === 'block-external.cjs' || entry.path.startsWith('dist/'))) {
    const from = path.resolve(candidate, 'runtime', entry.path);
    const to = path.resolve(root, entry.path);
    assert.ok(from.startsWith(path.join(candidate, 'runtime') + path.sep) && to.startsWith(root + path.sep));
    assert.equal(fs.realpathSync(from), from);
    const bytes = fs.readFileSync(from);
    assert.equal(sha(bytes), entry.sha256, entry.path);
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.writeFileSync(to, bytes, { flag: 'wx' });
  }
  fs.writeFileSync(path.join(data, '.planb-key'), JSON.stringify({ kind: 'test', data: randomBytes(32).toString('base64') }), { flag: 'wx' });
  const database = path.join(data, 'planb.sqlite');
  const initial = new Store(database);
  const instanceId = randomUUID();
  try {
    const snapshot = makeFixture('agency');
    assert.equal(snapshot.source.isTestData, true);
    initial.set('instanceId', instanceId);
    initial.importSnapshot(snapshot);
    initial.saveGeneration(makeDemoSpec(snapshot), { provider: 'demo', model: null, generatedAt: '2026-11-11T15:00:00.000Z', prompt: '', approved: false });
    initial.activate();
  } finally { initial.close(); }

  // The preload only reports the ephemeral port. It leaves the compiled binary,
  // application mount, listener address, request handling and state intact.
  const portReporter = path.join(root, 'port.cjs');
  fs.writeFileSync(portReporter, [
    "const { Server } = require('node:net');",
    'const emit = Server.prototype.emit;',
    "Server.prototype.emit = function(event, ...args) {",
    "  if (event === 'listening') {",
    "    const address = this.address();",
    "    if (address && address.address === '127.0.0.1') process.stdout.write('BOUND ' + address.port + '\\n');",
    '  }',
    '  return emit.call(this, event, ...args);',
    '};',
  ].join('\n'), { flag: 'wx' });
  const env = Object.fromEntries(Object.entries(process.env)
    .filter(([key]) => ['path', 'systemroot', 'windir', 'comspec', 'pathext', 'lang', 'tz'].includes(key.toLowerCase())));
  Object.assign(env, { NODE_ENV: 'test', PLANB_PORT: '0', PLANB_DATA_DIR: data, TEMP: temp, TMP: temp, TMPDIR: temp });
  const receipts: { pid: number; code: number | null; signal: NodeJS.Signals | null }[] = [];
  let owned: { child: ChildProcess; closed: Promise<void> } | null = null;
  const stop = async () => {
    if (!owned) return;
    const { child, closed } = owned;
    if (child.exitCode === null && child.signalCode === null) child.kill();
    await closed;
    owned = null;
  };
  t.after(stop);

  async function start(label: string) {
    assert.equal(owned, null);
    const child = spawn(process.execPath, ['--require', path.join(root, 'block-external.cjs'), '--require', portReporter, path.join(root, 'server.mjs')], {
      cwd: root, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
    });
    const closed = new Promise<void>(resolve => child.once('close', (code, signal) => {
      if (child.pid) receipts.push({ pid: child.pid, code, signal });
      resolve();
    }));
    owned = { child, closed };
    let stdout = '', stderr = '';
    child.stdout!.on('data', bytes => { stdout += bytes; });
    child.stderr!.on('data', bytes => { stderr += bytes; });
    const log = () => fs.writeFileSync(path.join(root, label + '.log'), stdout + stderr);
    child.once('close', log);
    const port = await new Promise<number>((resolve, reject) => {
      const timer = setTimeout(() => reject(Error('El servidor compilado no anunció el puerto. ' + stderr)), 20_000);
      child.once('error', error => { clearTimeout(timer); reject(error); });
      child.once('close', () => { clearTimeout(timer); reject(Error('El servidor terminó durante el arranque. ' + stderr)); });
      child.stdout!.on('data', () => {
        const match = /BOUND (\d+)/.exec(stdout);
        if (match) { clearTimeout(timer); resolve(Number(match[1])); }
      });
    });
    assert.ok(port >= 49152 && port <= 65535);
    return { pid: child.pid, origin: 'http://127.0.0.1:' + port };
  }

  const get = async (origin: string, url: string) => fetch(origin + url, { redirect: 'error', signal: AbortSignal.timeout(8000) });
  const post = async (origin: string, url: string, body: object) => fetch(origin + url, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
    redirect: 'error', signal: AbortSignal.timeout(12000),
  });
  async function json(response: Response, status: number) {
    const body = await response.text();
    assert.equal(response.status, status, body.slice(0, 500));
    return JSON.parse(body) as unknown;
  }
  function databaseView() {
    const db = new DatabaseSync(database, { readOnly: true });
    try {
      return {
        flow: db.prepare("SELECT key, value FROM meta WHERE key LIKE 'date-check%' ORDER BY key").all(),
        business: db.prepare('SELECT count(*) AS n FROM changes').get()?.n,
      };
    } finally { db.close(); }
  }

  const first = await start('first');
  await delay(75);
  const health = await json(await get(first.origin, '/api/health'), 200) as { instanceId: string };
  assert.equal(health.instanceId, instanceId);
  const state = await json(await get(first.origin, '/api/v2/state'), 200) as {
    workspaceSearchContext: { contextRevision: string; isTestData: boolean };
    aiConfigured: boolean; hubspotConfigured: boolean;
  };
  assert.equal(state.workspaceSearchContext.isTestData, true);
  assert.equal(state.aiConfigured, false);
  assert.equal(state.hubspotConfigured, false);
  const pin = state.workspaceSearchContext.contextRevision;
  const index = await get(first.origin, '/');
  assert.equal(index.status, 200);
  assert.equal(sha(Buffer.from(await index.arrayBuffer())), files.find(file => file.path === 'dist/index.html')!.sha256);
  const form = DEMO.defaults();
  const input = dateCheckView.parse(await json(await post(first.origin, dateCheckApiPath + '/analyze', { contextRevision: pin, form }), 200));
  assert.ok(input.best);
  const id = randomUUID();
  const recordPath = dateCheckApiPath + '/checks/' + id;
  const reviewPath = reviewApiPath + '/decisions/' + id;
  const query = '?contextRevision=' + pin;
  await json(await post(first.origin, dateCheckApiPath + '/checks', { contextRevision: pin, form, id, inputRevision: input.inputRevision }), 201);
  const confirm = { contextRevision: pin, operationId: randomUUID(), inputRevision: input.inputRevision,
    alternativeId: input.best, owner: 'Marta (ficción)', nextStep: 'Pedir confirmación de la llegada.', dueAt: '2026-11-13T12:00:00.000Z' };
  const decision = dateCheckRecordView.parse(await json(await post(first.origin, recordPath + '/confirm', confirm), 201));
  const ending = { contextRevision: pin, ending: 'supplier-late', operationId: randomUUID() };
  const outcome = reviewView.parse(await json(await post(first.origin, reviewPath + '/outcome', ending), 201));
  assert.equal(outcome.review?.verdict, 'missed');
  assert.equal(outcome.review?.attribution.residualMinutes, 40);
  const saved = databaseView();
  assert.equal(saved.flow.length, 3);
  assert.equal(saved.business, 0);
  await stop();
  assert.equal(receipts[0]?.pid, first.pid);

  const second = await start('second');
  assert.notEqual(first.pid, second.pid);
  assert.equal((await json(await get(second.origin, '/api/health'), 200) as { instanceId: string }).instanceId, instanceId);
  assert.deepEqual(dateCheckRecordView.parse(await json(await get(second.origin, recordPath + query), 200)), decision);
  assert.deepEqual(reviewView.parse(await json(await get(second.origin, reviewPath + query), 200)), outcome);
  assert.deepEqual(databaseView(), saved);
  assert.deepEqual(dateCheckRecordView.parse(await json(await post(second.origin, recordPath + '/confirm', confirm), 200)), decision);
  assert.deepEqual(reviewView.parse(await json(await post(second.origin, reviewPath + '/outcome', ending), 200)), outcome);
  assert.deepEqual(databaseView(), saved);
  await stop();
  assert.equal(receipts[1]?.pid, second.pid);
  fs.writeFileSync(path.join(root, 'result.json'), JSON.stringify({ candidate: candidateName, first, second, receipts, rows: saved.flow.length, businessChanges: saved.business, residual: outcome.review?.attribution.residualMinutes }, null, 2), { flag: 'wx' });
  t.diagnostic('Recibo del banco aislado: ' + path.join(root, 'result.json'));
});
