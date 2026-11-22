import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { build } from 'esbuild';
import { Store } from '../server/store.js';
import { makeFixture, makeDemoSpec } from '../shared/fixtures.js';
import { createTaskRevisionClient } from '../src/task-revision-client.js';

for (const kind of ['main', 'runtime'] as const) test('177: revision client through compiled ' + kind + ' preserves conflicts, no-op and uncertainty without silent resends', { timeout: 120_000 }, async () => {
  const root = path.resolve('tests/.tmp/cycle177-' + kind + '-' + randomUUID()), data = path.join(root, 'fresh-data'); fs.mkdirSync(data, { recursive: true });
  fs.writeFileSync(path.join(data, '.planb-key'), JSON.stringify({ kind: 'test', data: randomBytes(32).toString('base64') }), { flag: 'wx' }); fs.mkdirSync(path.join(root, 'dist')); fs.writeFileSync(path.join(root, 'dist/index.html'), '<!doctype html><title>Client launcher fixture177</title>');
  const seed = new Store(':memory:'); try { const s = makeFixture('agency'); seed.importSnapshot(s); seed.saveGeneration(makeDemoSpec(s), { provider: 'demo', model: null, prompt: '', generatedAt: '2026-11-04T16:00:00Z', approved: false }); seed.activate(); fs.writeFileSync(path.join(root, kind === 'main' ? 'demo.seed.json' : 'continuity.seed.json'), JSON.stringify(seed.bundle()), { flag: 'wx' }); } finally { seed.close(); }
  const binary = path.join(root, kind + '.mjs'); await build({ absWorkingDir: process.cwd(), entryPoints: [path.resolve('server/' + kind + '.ts')], outfile: binary, bundle: true, packages: 'external', platform: 'node', format: 'esm', logLevel: 'silent' });
  const reservation = net.createServer(); await new Promise<void>((resolve, reject) => { reservation.once('error', reject); reservation.listen(0, '127.0.0.1', resolve); }); const addr = reservation.address(); assert.ok(addr && typeof addr !== 'string'); const port = addr.port; await new Promise<void>(resolve => reservation.close(() => resolve()));
  const base = 'http://127.0.0.1:' + port, env = { ...Object.fromEntries(Object.entries(process.env).filter(([key]) => ['path','systemroot','windir','comspec','pathext','temp','tmp','tmpdir','lang','tz'].includes(key.toLowerCase()))), NODE_ENV: 'test', PLANB_PORT: String(port), PLANB_DATA_DIR: data }, child = spawn(process.execPath, ['--require', path.resolve('scripts/block-external.cjs'), binary], { cwd: root, env, windowsHide: true, stdio: ['ignore','pipe','pipe'] });
  let output = ''; child.stdout!.on('data', b => { output += b; }); child.stderr!.on('data', b => { output += b; }); const closed = new Promise<void>(resolve => child.once('close', (code, signal) => { fs.writeFileSync(path.join(root, 'server.log'), output); fs.writeFileSync(path.join(root, 'closed.json'), JSON.stringify({ pid: child.pid, code, signal })); resolve(); }));
  try {
    let instanceId: string | null = null; const deadline = Date.now() + 30_000;
    while (Date.now() < deadline) { if (child.exitCode !== null || child.signalCode !== null) throw Error('Own launcher ended177: ' + output); try { const saved = JSON.parse(fs.readFileSync(path.join(data, '.endpoint.json'), 'utf8')), health = await fetch(base + '/api/health', { signal: AbortSignal.timeout(1000) }).then(r => r.json()); if (saved.pid === child.pid && saved.instanceId === health.instanceId) { instanceId = health.instanceId; break; } } catch { /* private endpoint not ready */ } await new Promise(r => setTimeout(r, 100)); }
    assert.ok(instanceId); const setup = await fetch(base + '/api/v2/auth/setup', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password: 'fiction-only-client-cycle177' }) }); assert.equal(setup.status, 200); const cookie = setup.headers.get('set-cookie')!.split(';')[0];
    const requests: { method: string; path: string }[] = [];
    const transport: typeof fetch = async (input, init) => { const url = new URL(String(input)); assert.equal(url.origin, base); requests.push({ method: init?.method ?? 'GET', path: url.pathname }); const h = new Headers(init?.headers); h.set('cookie', cookie); return fetch(input, { ...init, headers: h }); };
    const client = createTaskRevisionClient({ base, fetch: transport }), opened = await client.read('task-2'); assert.equal(opened.kind, 'read'); if (opened.kind !== 'read') throw Error('No opened task177'); const original = opened.current; assert.equal(original.instanceId, instanceId);
    const competing = await Promise.all(['Editor A177','Editor B177'].map(notes => client.save(original, { notes }))); assert.deepEqual(competing.map(x => x.kind).sort(), ['changed','conflict']); const winner = competing.find(x => x.kind === 'changed')!; if (winner.kind !== 'changed') throw Error('No winner177');
    assert.equal((await client.save(winner.current, { notes: winner.current.record.values.notes })).kind, 'unchanged'); assert.equal((await client.save(original, { notes: 'Stale retry177' })).kind, 'conflict');
    const drop = createTaskRevisionClient({ base, fetch: async (input, init) => { const response = await transport(input, init); if (init?.method === 'PATCH') { await response.arrayBuffer(); throw Error('Fictional acknowledgement lost after native HTTP177'); } return response; } });
    assert.equal((await drop.save(winner.current, { notes: 'Applied with lost acknowledgement177' })).kind, 'uncertain'); const writesBeforeRead = requests.filter(r => r.method === 'PATCH').length;
    const observed = await client.read('task-2', original); assert.equal(observed.kind, 'read'); if (observed.kind !== 'read') throw Error('No verification177'); assert.equal(observed.current.record.values.notes, 'Applied with lost acknowledgement177'); assert.equal(requests.filter(r => r.method === 'PATCH').length, writesBeforeRead);
    assert.equal((await client.save(winner.current, { notes: 'Applied with lost acknowledgement177' })).kind, 'conflict'); const state = await fetch(base + '/api/v2/state', { headers: { cookie } }).then(r => r.json()); assert.equal(state.changes, 2); assert.equal(state.runtime, kind === 'runtime'); assert.equal(state.aiConfigured, undefined);
    assert.ok(requests.every(r => r.path.startsWith('/api/v7/task-revision/')), 'the client never falls back to legacy');
    // Explicitly exercise the remaining legacy path, separately from this client: it has no revision guard.
    const legacy = await fetch(base + '/api/records/tasks/task-2', { method: 'PATCH', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify({ values: { notes: 'Explicit legacy control177' } }) }); assert.equal(legacy.status, 200); assert.equal((await client.save(observed.current, { notes: 'Old client after legacy177' })).kind, 'conflict');
    assert.equal((await fetch(base + '/api/v2/state', { headers: { cookie } }).then(r => r.json())).changes, 3);
    await fetch(base + '/api/v2/auth/lock', { method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body: '{}' }); const blocked = await client.read('task-2'); assert.equal(blocked.kind, 'failed'); if (blocked.kind === 'failed') assert.equal(blocked.status, 401);
    fs.writeFileSync(path.join(root, 'observed.json'), JSON.stringify({ kind, pid: child.pid, instanceId, port, competing: competing.map(x => x.kind), changesBeforeLegacy: 2, changesAfterLegacyControl: 3, uncertaintyPreserved: true, verificationWasReadOnly: true, legacyNotConditional: true, noClientFallback: true, blockedStatus: 401, clientRequests: requests }, null, 2));
  } finally {
    if (child.exitCode === null && child.signalCode === null) child.kill(); let timer: ReturnType<typeof setTimeout> | undefined; try { await Promise.race([closed, new Promise<never>((_r, reject) => { timer = setTimeout(() => reject(Error('Own launcher failed to close177')), 10000); })]); } finally { clearTimeout(timer); }
  }
});
