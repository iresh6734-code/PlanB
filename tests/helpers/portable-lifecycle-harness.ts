import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { randomUUID, randomBytes, createHash } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { makeLifecycleCopy } from './app-lifecycle-harness.js';

const sha = (p: string) => createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
export function copyPortableTree(from: string, to: string) {
  fs.mkdirSync(to, { recursive: true });
  for (const item of fs.readdirSync(from, { withFileTypes: true })) {
    if (item.isSymbolicLink()) throw Error('No se copian enlaces.');
    const destination = path.join(to, item.name), source = path.join(from, item.name);
    if (item.isDirectory()) copyPortableTree(source, destination); else fs.copyFileSync(source, destination);
  }
}
export function makePortableProducer() {
  const prepared = process.env.PLANB_PORTABLE137_ASSETS;
  if (!prepared) throw Error('Falta la preparación137.');
  const manifest = JSON.parse(fs.readFileSync(path.join(prepared, 'manifest.json'), 'utf8')) as { files: Record<string, string> };
  for (const [p, hash] of Object.entries(manifest.files)) if (sha(path.join(prepared, p)) !== hash) throw Error('Cambió el recurso137: ' + p);
  const copy = makeLifecycleCopy(4592);
  for (const name of ['runtime.mjs', 'drill.mjs', 'launch.cjs', 'block-external.cjs', 'node_modules']) copyPortableTreeOrFile(path.join(prepared, name), path.join(copy.runtime, name));
  fs.writeFileSync(path.join(copy.root, 'package-inputs.json'), JSON.stringify(manifest, null, 2));
  return copy;
}
function copyPortableTreeOrFile(from: string, to: string) {
  if (fs.lstatSync(from).isSymbolicLink()) throw Error('Recurso enlazado.');
  if (fs.statSync(from).isDirectory()) copyPortableTree(from, to); else fs.copyFileSync(from, to);
}
export function databaseDigest(data: string) {
  const db = new DatabaseSync(path.join(data, 'planb.sqlite'), { readOnly: true });
  try {
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all() as { name: string }[];
    const content = tables.map(({ name }) => ({ name, rows: db.prepare('SELECT * FROM "' + name.replaceAll('"', '""') + '"').all().map(row => JSON.stringify(row)).sort() }));
    return createHash('sha256').update(JSON.stringify(content)).digest('hex');
  } finally { db.close(); }
}

/** Extract only a newly downloaded ZIP into a new system-temp directory, outside this checkout. */
export function extractPortable(zip: string, evidence: string) {
  const root = path.join(os.tmpdir(), 'planb-portable137-' + randomUUID());
  fs.mkdirSync(root, { recursive: false });
  const script = `
Add-Type -AssemblyName System.IO.Compression.FileSystem
$taskDestination=[IO.Path]::GetFullPath($env:PLANB_TEST137_DEST)
$taskPrefix=$taskDestination+[IO.Path]::DirectorySeparatorChar
$taskArchive=[IO.Compression.ZipFile]::OpenRead($env:PLANB_TEST137_ZIP)
try {
  $taskTotal=0L
  foreach($taskEntry in $taskArchive.Entries) {
    $taskFull=[IO.Path]::GetFullPath([IO.Path]::Combine($taskDestination,$taskEntry.FullName))
    if(!$taskFull.StartsWith($taskPrefix,[StringComparison]::OrdinalIgnoreCase)){throw 'ZIP fuera del destino'}
    if(($taskEntry.ExternalAttributes -band 0xF0000000) -eq 0xA0000000){throw 'ZIP con enlace'}
    $taskTotal+=$taskEntry.Length
    if($taskTotal -gt 400000000){throw 'ZIP demasiado grande'}
  }
  foreach($taskEntry in $taskArchive.Entries) {
    $taskFull=[IO.Path]::GetFullPath([IO.Path]::Combine($taskDestination,$taskEntry.FullName))
    if($taskEntry.FullName.EndsWith('/')){[IO.Directory]::CreateDirectory($taskFull)|Out-Null;continue}
    [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($taskFull))|Out-Null
    $taskInput=$taskEntry.Open();$taskOutput=[IO.File]::Open($taskFull,[IO.FileMode]::CreateNew)
    try{$taskInput.CopyTo($taskOutput)}finally{$taskOutput.Dispose();$taskInput.Dispose()}
  }
} finally {$taskArchive.Dispose()}
`;
  const env = { ...minimalEnvironment(), PLANB_TEST137_ZIP: path.resolve(zip), PLANB_TEST137_DEST: root };
  const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { env, windowsHide: true, encoding: 'utf8', timeout: 90_000 });
  fs.writeFileSync(path.join(evidence, 'extraction.json'), JSON.stringify({ root, code: result.status, stdout: result.stdout, stderr: result.stderr, zipSha256: sha(zip), at: new Date().toISOString() }, null, 2));
  if (result.status !== 0) throw Error('No se extrajo el paquete: ' + result.stderr);
  return root;
}
function minimalEnvironment() {
  return Object.fromEntries(Object.entries(process.env).filter(([k]) => ['path', 'systemroot', 'windir', 'comspec', 'pathext', 'temp', 'tmp', 'tmpdir', 'lang', 'tz'].includes(k.toLowerCase())));
}
export async function startExtractedPortable(root: string, evidence: string) {
  const exe = path.join(root, 'node.exe'), data = path.join(root, 'data'), port = 4593, url = 'http://127.0.0.1:' + port;
  if (await fetch(url + '/api/health', { signal: AbortSignal.timeout(700) }).then(() => true).catch(() => false)) throw Error('Puerto ocupado, no se reutiliza ni detiene.');
  fs.mkdirSync(data, { recursive: true });
  if (!fs.existsSync(path.join(data, '.planb-key'))) fs.writeFileSync(path.join(data, '.planb-key'), JSON.stringify({ kind: 'test', data: randomBytes(32).toString('base64') }), { flag: 'wx' });
  // Prevent a missing packaged CJS dependency from silently resolving in an ancestor directory.
  const moduleGuard = path.join(root, 'test-module-guard.cjs');
  if (!fs.existsSync(moduleGuard)) fs.writeFileSync(moduleGuard, `const M=require('node:module'),p=require('node:path');const root=__dirname+p.sep,original=M._resolveFilename;M._resolveFilename=function(...args){const value=original.apply(this,args);if(p.isAbsolute(value)&&!value.toLowerCase().startsWith(root.toLowerCase()))throw Error('TEST_DEPENDENCY_ESCAPED_PACKAGE');return value;};`);
  const env = { ...minimalEnvironment(), NODE_ENV: 'test', PLANB_PORT: String(port), PLANB_DATA_DIR: data };
  const dependencies = ['fastify', '@fastify/static', 'zod', 'archiver'];
  const check = spawnSync(exe, ['--input-type=module', '-e', `import{createRequire}from'node:module';import path from'node:path';const r=createRequire(path.join(process.cwd(),'runtime.mjs'));for(const name of ${JSON.stringify(dependencies)}){const p=r.resolve(name);if(!p.toLowerCase().startsWith((process.cwd()+path.sep).toLowerCase()))throw Error('Dependency outside package');}console.log(JSON.stringify({version:process.version,packagedDependencies:true}));`], { cwd: root, env, windowsHide: true, encoding: 'utf8', timeout: 10_000 });
  fs.writeFileSync(path.join(evidence, 'packaged-node.json'), JSON.stringify({ code: check.status, stdout: check.stdout, stderr: check.stderr, nodeSha256: sha(exe) }, null, 2));
  if (check.status !== 0) throw Error('Dependencias del paquete incompletas: ' + check.stderr);
  const child = spawn(exe, ['--require', moduleGuard, '--require', path.join(root, 'block-external.cjs'), path.join(root, 'runtime.mjs')], { cwd: root, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  const pid = child.pid;
  if (!pid) throw Error('No se creó el proceso portátil.');
  const log = fs.createWriteStream(path.join(evidence, 'portable-' + pid + '.log'), { flags: 'wx' });
  child.stdout?.on('data', b => log.write(b)); child.stderr?.on('data', b => log.write(b));
  const closed = new Promise<void>(resolve => child.once('close', (code, signal) => { log.end(); fs.writeFileSync(path.join(evidence, 'portable-exit-' + pid + '.json'), JSON.stringify({ code, signal, at: new Date().toISOString() })); resolve(); }));
  async function stop() {
    if (child.exitCode === null && child.signalCode === null) child.kill();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try { await Promise.race([closed, new Promise<never>((_r, reject) => { timer = setTimeout(() => reject(Error('Cierre portátil no confirmado')), 10_000); })]); } finally { clearTimeout(timer); }
    for (let n = 0; n < 500; n++) {
      try { process.kill(pid!, 0); } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== 'ESRCH') throw e;
        fs.writeFileSync(path.join(evidence, 'portable-stopped-' + pid + '.json'), JSON.stringify({ pid, pidAbsent: true, at: new Date().toISOString() })); return;
      }
      await delay(20);
    }
    throw Error('PID portátil todavía presente; no se elimina su bloqueo.');
  }
  try {
    for (let n = 0; n < 300; n++) {
      if (child.exitCode !== null || child.signalCode !== null) throw Error('El runtime extraído terminó antes de servir.');
      const endpointPath = path.join(data, '.endpoint.json');
      if (fs.existsSync(endpointPath)) {
        const endpoint = JSON.parse(fs.readFileSync(endpointPath, 'utf8'));
        const health = await fetch(url + '/api/health', { signal: AbortSignal.timeout(700) }).then(r => r.json()).catch(() => null) as { instanceId: string } | null;
        if (endpoint.pid === pid && health?.instanceId === endpoint.instanceId) {
          fs.writeFileSync(path.join(evidence, 'portable-owner-' + pid + '.json'), JSON.stringify({ pid, instanceId: endpoint.instanceId, root, at: new Date().toISOString() }, null, 2));
          return { root, data, pid, instanceId: endpoint.instanceId as string, url, stop };
        }
      }
      await delay(100);
    }
    throw Error('El runtime extraído no confirmó su endpoint.');
  } catch (e) { await stop(); throw e; }
}
