import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import { randomUUID, randomBytes, createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { build } from 'esbuild';
import { Store } from '../server/store.js';
import { makeFixture, makeDemoSpec } from '../shared/fixtures.js';
import { TaskRevisionView, TaskRevisionResult } from '../shared/task-revision.js';

test('the portable runtime serves protected evidence and conditional writes with one database owner', { timeout: 120_000 }, async () => {
  const root = path.resolve('tests/.tmp/runtime168-' + randomUUID()), data = path.join(root, 'fresh-data'); fs.mkdirSync(data, { recursive: true });
  fs.writeFileSync(path.join(data, '.planb-key'), JSON.stringify({ kind: 'test', data: randomBytes(32).toString('base64') }), { flag: 'wx' });
  fs.mkdirSync(path.join(root, 'dist')); fs.writeFileSync(path.join(root, 'dist/index.html'), '<!doctype html><title>Fictional conditional writer fixture</title>');
  const seed = new Store(':memory:'); try { const snapshot = makeFixture('agency'); seed.importSnapshot(snapshot); seed.saveGeneration(makeDemoSpec(snapshot), { provider: 'demo', model: null, prompt: '', generatedAt: '2026-11-04T15:00:00Z', approved: false }); seed.activate(); fs.writeFileSync(path.join(root, 'continuity.seed.json'), JSON.stringify(seed.bundle()), { flag: 'wx' }); } finally { seed.close(); }
  const binary = path.join(root, 'runtime.mjs'), competingBinary = path.join(root, 'server.mjs'); for (const [entry, outfile] of [['runtime', binary], ['main', competingBinary]]) await build({ absWorkingDir: process.cwd(), entryPoints: [path.resolve('server/' + entry + '.ts')], outfile, bundle: true, packages: 'external', platform: 'node', format: 'esm', logLevel: 'silent' });
  const reservation = net.createServer(); await new Promise<void>((resolve, reject) => { reservation.once('error', reject); reservation.listen(0, '127.0.0.1', resolve); }); const address = reservation.address(); assert.ok(address && typeof address !== 'string'); const port = address.port; await new Promise<void>(resolve => reservation.close(() => resolve()));
  const origin = 'http://127.0.0.1:' + port, env = { ...Object.fromEntries(Object.entries(process.env).filter(([key]) => ['path','systemroot','windir','comspec','pathext','temp','tmp','tmpdir','lang','tz'].includes(key.toLowerCase()))), NODE_ENV: 'test', PLANB_PORT: String(port), PLANB_DATA_DIR: data };
  function start(competing = false) {
    const child = spawn(process.execPath, ['--require', path.resolve('scripts/block-external.cjs'), competing ? competingBinary : binary], { cwd: root, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }); let output = '';
    child.stdout.on('data', b => { output += b; }); child.stderr.on('data', b => { output += b; });
    const closed = new Promise<number | null>(resolve => child.once('close', code => { fs.writeFileSync(path.join(root, 'process-' + child.pid + '.log'), output); fs.writeFileSync(path.join(root, 'closed-' + child.pid + '.json'), JSON.stringify({ pid: child.pid, code, signal: child.signalCode })); resolve(code); }));
    return { child, closed, output: () => output };
  }
  const owner = start(), children = [owner];
  async function bounded<T>(promise: Promise<T>, timeout: number) { let timer: ReturnType<typeof setTimeout> | undefined; try { return await Promise.race([promise, new Promise<never>((_r, reject) => { timer = setTimeout(() => reject(Error('Own process did not finish168')), timeout); })]); } finally { clearTimeout(timer); } }
  try {
    let endpoint: { instanceId: string; pid: number } | null = null; const deadline = Date.now() + 30_000;
    while (Date.now() < deadline) {
      if (owner.child.exitCode !== null || owner.child.signalCode !== null) throw Error('Runtime exited before readiness168: ' + owner.output());
      try { const file = JSON.parse(fs.readFileSync(path.join(data, '.endpoint.json'), 'utf8')), health = await fetch(origin + '/api/health', { signal: AbortSignal.timeout(1000) }).then(r => r.json()); if (file.pid === owner.child.pid && file.instanceId === health.instanceId) { endpoint = file; break; } } catch { /* endpoint not yet published */ }
      await new Promise(r => setTimeout(r, 100));
    }
    assert.ok(endpoint, 'Owned runtime endpoint must be ready');
    const route = origin + '/api/v7/task-revision/task-2', first = await fetch(route); assert.equal(first.status, 200, 'The actual runtime must mount the accepted revision service');
    const before = TaskRevisionView.parse(await first.json()); assert.equal(before.instanceId, endpoint.instanceId);
    const setup = await fetch(origin + '/api/v2/auth/setup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: 'fiction-only-runtime168' }) }); assert.equal(setup.status, 200); const cookie = setup.headers.get('set-cookie')!.split(';')[0];
    assert.equal((await fetch(route)).status, 401); const authenticated = await fetch(route, { headers: { cookie } }); assert.equal(authenticated.status, 200); assert.equal(authenticated.headers.get('cache-control'), 'no-store'); assert.equal(authenticated.headers.get('vary'), 'Cookie');
    const active = await fetch(origin + '/api/v2/state', { headers: { cookie } }).then(r => r.json());
    const pin = active.workspaceSearchContext.contextRevision;
    assert.match(pin, /^[a-f0-9]{64}$/);
    const evidence = origin + '/api/v7/continuity/evidence';
    const locked = await fetch(evidence + '?workspaceContextRevision=' + pin);
    assert.equal(locked.status, 401);
    assert.equal(locked.headers.get('cache-control'), 'no-store');
    assert.deepEqual(Object.keys(await locked.json()), ['error']);
    const evidenceDb = new DatabaseSync(path.join(data, 'planb.sqlite'), { readOnly: true });
    try {
      const digest = () => createHash('sha256').update(JSON.stringify(['meta', 'records', 'changes', 'captures'].map(table =>
        evidenceDb.prepare('SELECT * FROM ' + table + ' ORDER BY rowid').all()))).digest('hex');
      const original = digest();
      const observed = await fetch(evidence + '?workspaceContextRevision=' + pin, { headers: { cookie } });
      assert.equal(observed.status, 200, 'the portable entry point must serve Continuity evidence');
      assert.equal(observed.headers.get('x-planb-workspace-revision'), pin);
      assert.equal(observed.headers.get('cache-control'), 'no-store');
      assert.match(observed.headers.get('vary') ?? '', /\bCookie\b/i);
      const body = await observed.json();
      assert.equal(body.available, true);
      assert.equal(body.facts.snapshot.isTestData, true);
      assert.equal(body.evaluation.status, 'unproven');

      const summary = origin + '/api/v7/local-operations/work-summary';
      assert.equal((await fetch(summary)).status, 401);
      const response = await fetch(summary, { headers: { cookie } });
      assert.equal(response.status, 200, 'the portable runtime must serve the accepted work summary');
      assert.equal(response.headers.get('cache-control'), 'no-store');
      assert.match(response.headers.get('vary') ?? '', /\bCookie\b/i);
      const work = await response.json();
      assert.deepEqual(work.scope, { kind: 'active-copy', context: body.context.captureId });
      assert.equal(work.status, 'read');
      assert.equal(work.provenance, 'durable');
      assert.equal(work.coverage, 'none');
      assert.equal(work.counts, null);
      assert.equal(work.quarantine, null);
      assert.equal((await fetch(summary + '?coverage=complete', { headers: { cookie } })).status, 422);
      assert.equal((await fetch(summary, { method: 'POST', headers: { cookie } })).status, 404);
      assert.equal((await fetch(summary, { method: 'HEAD', headers: { cookie } })).status, 404);

      const foreignPin = (pin[0] === '0' ? '1' : '0') + pin.slice(1);
      const stale = await fetch(evidence + '?workspaceContextRevision=' + foreignPin, { headers: { cookie } });
      assert.equal(stale.status, 409);
      assert.equal(stale.headers.get('x-planb-workspace-revision'), null);
      const refusal = await stale.json();
      assert.equal(refusal.issue, 'SOURCE_CHANGED');
      assert.equal(refusal.facts, null);
      assert.equal((await fetch(evidence, { method: 'POST', headers: { cookie } })).status, 404);
      assert.equal(digest(), original, 'evidence reads do not alter the portable database');
    } finally { evidenceDb.close(); }
    const replies = await Promise.all(['First168', 'Second168'].map(notes => fetch(route, { method: 'PATCH', headers: { cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ expectedRevision: before.revision, values: { notes } }) }).then(async r => ({ status: r.status, body: await r.json() }))));
    assert.deepEqual(replies.map(r => r.status).sort(), [200, 409]); const winner = TaskRevisionResult.parse(replies.find(r => r.status === 200)!.body); assert.equal(winner.changed, true); assert.equal(replies.find(r => r.status === 409)!.body.details.code, 'TASK_REVISION_CHANGED');
    const send = (revision: string) => fetch(route, { method: 'PATCH', headers: { cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ expectedRevision: revision, values: { notes: winner.current.record.values.notes } }) });
    assert.equal((await send(before.revision)).status, 409); const noOp = await send(winner.current.revision); assert.equal(noOp.status, 200); assert.equal(TaskRevisionResult.parse(await noOp.json()).changed, false);
    const runtimeState = await fetch(origin + '/api/v2/state', { headers: { cookie } }).then(r => r.json()); assert.equal(runtimeState.changes, 1); assert.equal(runtimeState.runtime, true); assert.equal(runtimeState.aiConfigured, false); const reconnect = await fetch(origin + '/api/disconnect', { method: 'POST', headers: { cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ disconnected: false }) }); assert.equal(reconnect.status, 403);
    const db = new DatabaseSync(path.join(data, 'planb.sqlite'), { readOnly: true }); const digest = () => createHash('sha256').update(JSON.stringify(['meta','records','changes'].map(table => db.prepare('SELECT * FROM ' + table + ' ORDER BY rowid').all()))).digest('hex');
    try {
      const hash = digest(), contender = start(true); children.push(contender); const code = await bounded(contender.closed, 30_000);
      assert.equal(code, 1); assert.match(contender.output(), /ya está abierto/); assert.equal(digest(), hash); assert.equal(owner.child.exitCode, null); assert.equal(owner.child.signalCode, null);
      const after = TaskRevisionView.parse(await fetch(route, { headers: { cookie } }).then(r => r.json())); assert.deepEqual(after, winner.current);
      fs.writeFileSync(path.join(root, 'observed.json'), JSON.stringify({ ownerPid: owner.child.pid, rejectedPid: contender.child.pid, instanceId: endpoint.instanceId, port, rejectedCode: code, databaseUnchanged: true, conditionalStatuses: replies.map(r => r.status), changes: 1, noOpChanged: false }, null, 2));
    } finally { db.close(); }

    const summary = origin + '/api/v7/local-operations/work-summary';
    const lockResult = await fetch(origin + '/api/v2/auth/lock', { method: 'POST', headers: { cookie } });
    assert.equal(lockResult.status, 200);
    assert.equal((await fetch(summary, { headers: { cookie } })).status, 401);
    const login = await fetch(origin + '/api/v2/auth/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'fiction-only-runtime168' }),
    });
    assert.equal(login.status, 200);
    const newCookie = login.headers.get('set-cookie')!.split(';')[0];
    const reopened = await fetch(summary, { headers: { cookie: newCookie } });
    assert.equal(reopened.status, 200);
    const reopenedWork = await reopened.json();
    assert.equal(reopenedWork.coverage, 'none');
    assert.equal(reopenedWork.counts, null);
  } finally { for (const c of children) if (c.child.exitCode === null && c.child.signalCode === null) c.child.kill(); await bounded(Promise.all(children.map(c => c.closed)), 10_000); }
});
