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

test('167: principal serves conditional writes with one owner and preserves the database on a rejected second launch', { timeout: 120_000 }, async () => {
  const root = path.resolve('tests/.tmp/main167-' + randomUUID()), data = path.join(root, 'fresh-data'); fs.mkdirSync(data, { recursive: true });
  fs.writeFileSync(path.join(data, '.planb-key'), JSON.stringify({ kind: 'test', data: randomBytes(32).toString('base64') }), { flag: 'wx' });
  fs.mkdirSync(path.join(root, 'dist')); fs.writeFileSync(path.join(root, 'dist/index.html'), '<!doctype html><title>Fictional conditional writer fixture</title>');
  const seed = new Store(':memory:'); try { const snapshot = makeFixture('agency'); seed.importSnapshot(snapshot); seed.saveGeneration(makeDemoSpec(snapshot), { provider: 'demo', model: null, prompt: '', generatedAt: '2026-11-04T15:00:00Z', approved: false }); seed.activate(); fs.writeFileSync(path.join(root, 'demo.seed.json'), JSON.stringify(seed.bundle()), { flag: 'wx' }); } finally { seed.close(); }
  const binary = path.join(root, 'server.mjs'); await build({ absWorkingDir: process.cwd(), entryPoints: [path.resolve('server/main.ts')], outfile: binary, bundle: true, packages: 'external', platform: 'node', format: 'esm', logLevel: 'silent' });
  const reservation = net.createServer(); await new Promise<void>((resolve, reject) => { reservation.once('error', reject); reservation.listen(0, '127.0.0.1', resolve); }); const address = reservation.address(); assert.ok(address && typeof address !== 'string'); const port = address.port; await new Promise<void>(resolve => reservation.close(() => resolve()));
  const origin = 'http://127.0.0.1:' + port, env = { ...Object.fromEntries(Object.entries(process.env).filter(([key]) => ['path','systemroot','windir','comspec','pathext','temp','tmp','tmpdir','lang','tz'].includes(key.toLowerCase()))), NODE_ENV: 'test', PLANB_PORT: String(port), PLANB_DATA_DIR: data };
  function start() {
    const child = spawn(process.execPath, ['--require', path.resolve('scripts/block-external.cjs'), binary], { cwd: root, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }); let output = '';
    child.stdout.on('data', b => { output += b; }); child.stderr.on('data', b => { output += b; });
    const closed = new Promise<number | null>(resolve => child.once('close', code => { fs.writeFileSync(path.join(root, 'process-' + child.pid + '.log'), output); fs.writeFileSync(path.join(root, 'closed-' + child.pid + '.json'), JSON.stringify({ pid: child.pid, code, signal: child.signalCode })); resolve(code); }));
    return { child, closed, output: () => output };
  }
  const owner = start(), children = [owner];
  async function bounded<T>(promise: Promise<T>, timeout: number) { let timer: ReturnType<typeof setTimeout> | undefined; try { return await Promise.race([promise, new Promise<never>((_r, reject) => { timer = setTimeout(() => reject(Error('Own process did not finish167')), timeout); })]); } finally { clearTimeout(timer); } }
  try {
    let endpoint: { instanceId: string; pid: number } | null = null; const deadline = Date.now() + 30_000;
    while (Date.now() < deadline) {
      if (owner.child.exitCode !== null || owner.child.signalCode !== null) throw Error('Principal exited before readiness167: ' + owner.output());
      try { const file = JSON.parse(fs.readFileSync(path.join(data, '.endpoint.json'), 'utf8')), health = await fetch(origin + '/api/health', { signal: AbortSignal.timeout(1000) }).then(r => r.json()); if (file.pid === owner.child.pid && file.instanceId === health.instanceId) { endpoint = file; break; } } catch { /* endpoint not yet published */ }
      await new Promise(r => setTimeout(r, 100));
    }
    assert.ok(endpoint, 'Owned principal endpoint must be ready');
    const route = origin + '/api/v7/task-revision/task-2', first = await fetch(route); assert.equal(first.status, 200, 'The actual principal must mount the accepted revision service');
    const before = TaskRevisionView.parse(await first.json()); assert.equal(before.instanceId, endpoint.instanceId);
    const setup = await fetch(origin + '/api/v2/auth/setup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: 'fiction-only-principal167' }) }); assert.equal(setup.status, 200); const cookie = setup.headers.get('set-cookie')!.split(';')[0];
    assert.equal((await fetch(route)).status, 401); const authenticated = await fetch(route, { headers: { cookie } }); assert.equal(authenticated.status, 200); assert.equal(authenticated.headers.get('cache-control'), 'no-store'); assert.equal(authenticated.headers.get('vary'), 'Cookie');
    const replies = await Promise.all(['First167', 'Second167'].map(notes => fetch(route, { method: 'PATCH', headers: { cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ expectedRevision: before.revision, values: { notes } }) }).then(async r => ({ status: r.status, body: await r.json() }))));
    assert.deepEqual(replies.map(r => r.status).sort(), [200, 409]); const winner = TaskRevisionResult.parse(replies.find(r => r.status === 200)!.body); assert.equal(winner.changed, true); assert.equal(replies.find(r => r.status === 409)!.body.details.code, 'TASK_REVISION_CHANGED');
    const send = (revision: string) => fetch(route, { method: 'PATCH', headers: { cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ expectedRevision: revision, values: { notes: winner.current.record.values.notes } }) });
    assert.equal((await send(before.revision)).status, 409); const noOp = await send(winner.current.revision); assert.equal(noOp.status, 200); assert.equal(TaskRevisionResult.parse(await noOp.json()).changed, false);
    assert.equal((await fetch(origin + '/api/v2/state', { headers: { cookie } }).then(r => r.json())).changes, 1);
    const db = new DatabaseSync(path.join(data, 'planb.sqlite'), { readOnly: true }); const digest = () => createHash('sha256').update(JSON.stringify(['meta','records','changes'].map(table => db.prepare('SELECT * FROM ' + table + ' ORDER BY rowid').all()))).digest('hex');
    try {
      const hash = digest(), contender = start(); children.push(contender); const code = await bounded(contender.closed, 30_000);
      assert.equal(code, 1); assert.match(contender.output(), /ya está abierto/); assert.equal(digest(), hash); assert.equal(owner.child.exitCode, null); assert.equal(owner.child.signalCode, null);
      const after = TaskRevisionView.parse(await fetch(route, { headers: { cookie } }).then(r => r.json())); assert.deepEqual(after, winner.current);
      fs.writeFileSync(path.join(root, 'observed.json'), JSON.stringify({ ownerPid: owner.child.pid, rejectedPid: contender.child.pid, instanceId: endpoint.instanceId, port, rejectedCode: code, databaseUnchanged: true, conditionalStatuses: replies.map(r => r.status), changes: 1, noOpChanged: false }, null, 2));
    } finally { db.close(); }
  } finally { for (const c of children) if (c.child.exitCode === null && c.child.signalCode === null) c.child.kill(); await bounded(Promise.all(children.map(c => c.closed)), 10_000); }
});
