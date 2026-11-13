import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import { randomBytes, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { Store } from '../../server/store.js';
import { makeFixture, makeDemoSpec } from '../../shared/fixtures.js';

export async function startSearchKeyboardFixture() {
  const source = process.env.PLANB_K189_SOURCE!, parent = process.env.PLANB_K189_ROOT!;
  if (!source || !parent) throw Error('189 requires an explicitly frozen source and fresh fixture parent');
  const root = path.join(parent, 'fixture-' + randomUUID().slice(0, 8)), data = path.join(root, 'fresh-data'); fs.mkdirSync(data, { recursive: true });
  fs.writeFileSync(path.join(data, '.planb-key'), JSON.stringify({ kind: 'test', data: randomBytes(32).toString('base64') }), { flag: 'wx' });
  fs.cpSync(path.join(source, 'dist'), path.join(root, 'dist'), { recursive: true }); fs.copyFileSync(path.join(source, 'backend189.mjs'), path.join(root, 'server.mjs'));
  const snapshot = makeFixture('agency'); snapshot.name = 'Plan B · Teclado189 (ensayo)'; let i = 0;
  for (const record of snapshot.records) {
    if (record.entity === 'contacts') { i++; record.values.firstname = i <= 2 ? 'Teclado189 Gemelo' : 'Teclado189 Persona' + String(i).padStart(2, '0'); if (i <= 2) record.values.lastname = 'Igual'; }
    if (record.entity === 'companies' && record.id === 'company-1') record.values.name = 'Teclado189 Empresa';
  }
  const contact2 = snapshot.records.find(r => r.entity === 'contacts' && r.id === 'contact-2')!;
  const seed = new Store(':memory:'); try { seed.importSnapshot(snapshot); seed.saveGeneration(makeDemoSpec(snapshot), { provider: 'demo', model: null, prompt: '', generatedAt: '2026-11-04T17:00:00Z', approved: false }); seed.activate(); fs.writeFileSync(path.join(root, 'demo.seed.json'), JSON.stringify(seed.bundle()), { flag: 'wx' }); } finally { seed.close(); }
  const reservation = net.createServer(); await new Promise<void>((resolve, reject) => { reservation.once('error', reject); reservation.listen(0, '127.0.0.1', resolve); }); const address = reservation.address(); if (!address || typeof address === 'string') throw Error('No own port189'); const port = address.port; await new Promise<void>(resolve => reservation.close(() => resolve()));
  const url = 'http://127.0.0.1:' + port, env = { ...Object.fromEntries(Object.entries(process.env).filter(([k]) => ['path','systemroot','windir','comspec','pathext','temp','tmp','tmpdir','lang','tz'].includes(k.toLowerCase()))), NODE_ENV: 'test', PLANB_PORT: String(port), PLANB_DATA_DIR: data }, child = spawn(process.execPath, ['--require', path.join(source, 'scripts/block-external.cjs'), path.join(root, 'server.mjs')], { cwd: root, env, windowsHide: true, stdio: ['ignore','pipe','pipe'] });
  let output = ''; child.stdout!.on('data', b => { output += b; }); child.stderr!.on('data', b => { output += b; }); const closed = new Promise<void>(resolve => child.once('close', (code, signal) => { fs.writeFileSync(path.join(root, 'server.log'), output); fs.writeFileSync(path.join(root, 'closed.json'), JSON.stringify({ pid: child.pid, code, signal })); resolve(); }));
  async function close() { if (child.exitCode === null && child.signalCode === null) child.kill(); let timer: ReturnType<typeof setTimeout> | undefined; try { await Promise.race([closed, new Promise<never>((_r, reject) => { timer = setTimeout(() => reject(Error('Own fixture189 did not close')), 10000); })]); } finally { clearTimeout(timer); } }
  try {
    const deadline = Date.now() + 30000; while (Date.now() < deadline) { if (child.exitCode !== null || child.signalCode !== null) throw Error('Fixture189 exited: ' + output); try { const ep = JSON.parse(fs.readFileSync(path.join(data, '.endpoint.json'), 'utf8')), health = await fetch(url + '/api/health', { signal: AbortSignal.timeout(500) }).then(r => r.json()); if (ep.pid === child.pid && ep.instanceId === health.instanceId) { fs.writeFileSync(path.join(root, 'ready.json'), JSON.stringify({ pid: child.pid, port, instanceId: ep.instanceId })); return { root, url, contact2, pid: child.pid, instanceId: ep.instanceId as string, close }; } } catch { /* own fixture not ready */ } await new Promise(r => setTimeout(r, 100)); }
    throw Error('Own fixture189 ready timeout');
  } catch (error) { await close(); throw error; }
}
