import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { spawn, type ChildProcess } from 'node:child_process';

type Base = { runtime: string; backendSha256: string; artifacts: { path: string; sha256: string }[] };
export interface LifecycleCopy { root: string; runtime: string; data: string; port: number; url: string; }
const sha = (file: string) => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

function copyTree(from: string, to: string) {
  fs.mkdirSync(to, { recursive: true });
  for (const item of fs.readdirSync(from, { withFileTypes: true })) {
    if (item.isSymbolicLink()) throw Error('No se copian enlaces.');
    if (item.isDirectory()) copyTree(path.join(from, item.name), path.join(to, item.name));
    else fs.copyFileSync(path.join(from, item.name), path.join(to, item.name));
  }
}

/** Uses frozen public artifacts only. Never imports the base's database, seed, key or settings. */
export function makeLifecycleCopy(port: 4592 | 4593): LifecycleCopy {
  const manifest = process.env.PLANB_CYCLE126_BASE;
  const evidence = process.env.PLANB_CYCLE126_EVIDENCE;
  if (!manifest || !evidence) throw Error('Se necesita manifiesto propio126 y carpeta nueva de evidencia.');
  const base = JSON.parse(fs.readFileSync(manifest, 'utf8')) as Base;
  const root = path.resolve(evidence, 'copy-' + randomUUID());
  fs.mkdirSync(root, { recursive: true });
  const runtime = path.join(root, 'runtime'), data = path.join(runtime, 'fixture-data');
  fs.mkdirSync(data, { recursive: true }); fs.mkdirSync(path.join(runtime, 'build')); fs.mkdirSync(path.join(runtime, 'scripts'));
  const entry = path.join(base.runtime, 'build/server.mjs');
  if (sha(entry) !== base.backendSha256) throw Error('Cambió el backend congelado.');
  for (const item of base.artifacts) if (sha(path.join(base.runtime, 'dist', item.path)) !== item.sha256) throw Error('Cambió el artefacto ' + item.path);
  copyTree(path.join(base.runtime, 'dist'), path.join(runtime, 'dist'));
  fs.copyFileSync(entry, path.join(runtime, 'build/server.mjs'));
  fs.copyFileSync(path.join(base.runtime, 'scripts/block-external.cjs'), path.join(runtime, 'scripts/block-external.cjs'));
  fs.writeFileSync(path.join(runtime, 'package.json'), JSON.stringify({ private: true, type: 'module' }));
  fs.writeFileSync(path.join(data, '.planb-key'), JSON.stringify({ kind: 'test', data: randomBytes(32).toString('base64') }), { flag: 'wx' });
  const copy = { root, runtime, data, port, url: 'http://127.0.0.1:' + port };
  fs.writeFileSync(path.join(root, 'manifest.json'), JSON.stringify({ ...copy, backendSha256: base.backendSha256, artifacts: base.artifacts, seedImported: false }, null, 2));
  return copy;
}

export async function startLifecycleCopy(copy: LifecycleCopy) {
  if (await fetch(copy.url + '/api/health', { signal: AbortSignal.timeout(700) }).then(() => true).catch(() => false)) throw Error('Puerto ocupado; no se para ni se reutiliza el servicio existente.');
  const env = { ...Object.fromEntries(Object.entries(process.env).filter(([key]) => ['path', 'systemroot', 'windir', 'comspec', 'pathext', 'temp', 'tmp', 'tmpdir', 'lang', 'tz'].includes(key.toLowerCase()))),
    NODE_ENV: 'test', PLANB_PORT: String(copy.port), PLANB_DATA_DIR: copy.data };
  const child: ChildProcess = spawn(process.execPath, ['--require', path.join(copy.runtime, 'scripts/block-external.cjs'), path.join(copy.runtime, 'build/server.mjs')],
    { cwd: copy.runtime, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  const pid = child.pid;
  if (!pid) throw Error('No se creó el proceso propio.');
  const log = fs.createWriteStream(path.join(copy.root, 'server-' + pid + '.log'), { flags: 'wx' });
  let tail = '';
  child.stdout?.on('data', bytes => { log.write(bytes); tail = (tail + bytes).slice(-2000); });
  child.stderr?.on('data', bytes => { log.write(bytes); tail = (tail + bytes).slice(-2000); });
  const closed = new Promise<void>(resolve => child.once('close', (code, signal) => {
    fs.writeFileSync(path.join(copy.root, 'exit-' + pid + '.json'), JSON.stringify({ code, signal, event: 'close', at: new Date().toISOString() })); log.end(); resolve();
  }));
  async function stop() {
    if (child.exitCode === null && child.signalCode === null) child.kill();
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([closed, new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(() => reject(Error('El proceso propio no confirmó el cierre: ' + pid)), 10_000);
      })]);
    } finally { clearTimeout(timeout); }
    // On Windows an exit event need not mean all process/stdio handles have closed.
    // Keep the application's PID guard intact; refuse to restart while that PID exists.
    const started = Date.now(), deadline = started + 10_000;
    let observations = 0;
    while (Date.now() < deadline) {
      observations++;
      try { process.kill(pid!, 0); }
      catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error;
        fs.writeFileSync(path.join(copy.root, 'stopped-' + pid + '.json'), JSON.stringify({ pid, event: 'close', pidAbsent: true, observations, elapsedMs: Date.now() - started, at: new Date().toISOString() }, null, 2));
        return;
      }
      await delay(20);
    }
    throw Error('El PID anterior aún existe o se reutilizó. Se conserva el bloqueo y no se reabre: ' + pid);
  }
  try {
    const deadline = Date.now() + 30_000;
    while (Date.now() < deadline) {
      if (child.exitCode !== null || child.signalCode !== null) throw Error('El proceso terminó antes de servir: ' + tail);
      const endpointFile = path.join(copy.data, '.endpoint.json');
      if (fs.existsSync(endpointFile)) {
        const endpoint = JSON.parse(fs.readFileSync(endpointFile, 'utf8')) as { pid: number; instanceId: string };
        const health = await fetch(copy.url + '/api/health', { signal: AbortSignal.timeout(1000) }).then(r => r.json()).catch(() => null) as { instanceId: string } | null;
        if (endpoint.pid === pid && health?.instanceId === endpoint.instanceId) {
          fs.writeFileSync(path.join(copy.root, 'owner-' + pid + '.json'), JSON.stringify({ pid, entry: path.join(copy.runtime, 'build/server.mjs'), cwd: copy.runtime, instanceId: endpoint.instanceId, at: new Date().toISOString() }, null, 2));
          return { ...copy, pid, instanceId: endpoint.instanceId, stop };
        }
      }
      await delay(100);
    }
    throw Error('No se confirmó el proceso propio y su endpoint.');
  } catch (error) { await stop(); throw error; }
}
