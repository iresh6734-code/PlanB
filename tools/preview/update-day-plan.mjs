import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { pathToFileURL } from 'node:url';
import { createBoard } from '../coordination/core.mjs';

// One specific, previously installed fictional demo. No server lifecycle, data
// writes, provider calls, credentials, arbitrary destination, or root build.
const repo = fs.realpathSync(process.cwd()), scratch = fs.realpathSync(path.join(repo, 'tests/.tmp'));
const board = createBoard(repo), taskId = 'CODEX-LOCAL-PREVIEW-JORNADA-299';
const origin = 'http://127.0.0.1:4601', instance = '3cb33118-1596-44cc-b78a-b2961615f4ff';
const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const hash = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const write = (file, value) => fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
function inside(file, parent) {
  const relative = path.relative(parent, file);
  assert.ok(relative && !relative.startsWith('..') && !path.isAbsolute(relative), file);
  assert.equal(fs.realpathSync(file), file, 'Unexpected link or resolved destination');
  return file;
}
function child(parent, relative) {
  assert.ok(relative && !relative.includes('\\') && !path.isAbsolute(relative));
  assert.ok(relative.split('/').every(part => part && part !== '.' && part !== '..'));
  const file = path.join(parent, relative);
  assert.ok(!path.relative(parent, file).startsWith('..'));
  return file;
}
const previous = read(path.join(scratch, 'preview288-bngxpH/applied.json'));
const installation = inside(previous.installation, scratch);
assert.equal(installation, path.join(scratch, 'preview278-SRZe1u/installation'));
assert.equal(previous.origin, origin); assert.equal(previous.instance, instance);
const data = inside(path.join(installation, 'data'), installation);
const dist = inside(path.join(installation, 'dist'), installation);
const binary = path.join(installation, 'build/server.mjs');
const pointer = path.join(scratch, 'preview299-latest.json');
const bank = inside(path.join(scratch, 'jornada290-r3-lylYFc'), scratch);
const fixed = inside(path.join(bank, 's'), bank), manifest = read(path.join(bank, 'manifest.json'));
const base = read(path.join(scratch, 'mount284-mount284-q1kkk5.json'));
function walk(dir, prefix = '') {
  const result = {};
  for (const name of fs.readdirSync(dir).sort()) {
    const file = path.join(dir, name), stat = fs.lstatSync(file);
    assert.ok(!stat.isSymbolicLink(), file);
    if (stat.isDirectory()) Object.assign(result, walk(file, prefix + name + '/'));
    else { assert.ok(stat.isFile(), file); result[prefix + name] = hash(file); }
  }
  return result;
}
function accepted() {
  const state = board.load(), own = state.tasks.find(t => t.id === taskId);
  assert.ok(own && ['working', 'review', 'done'].includes(own.status));
  const acceptedTask = id => { const task = state.tasks.find(t => t.id === id); assert.equal(task?.status, 'done', id); return task; };
  const main = acceptedTask('CODEX-WORK-SUMMARY-MOUNT-284');
  acceptedTask('CODEX-LOCAL-PREVIEW-SUMMARY-288');
  for (const [file, digest] of Object.entries(base.tested)) assert.equal(main.submitted[file], digest, file);
  for (const [file, digest] of Object.entries(manifest.sources)) {
    assert.equal(hash(child(fixed, file)), digest, file);
    const owner = manifest.provenance[file];
    if (owner === 'accepted-mount284') assert.equal(base.sources[file], digest, file);
    else assert.equal(acceptedTask(owner).submitted[file], digest, file);
  }
  const author = acceptedTask('CLAUDE-HOY-COLA-JORNADA-A3');
  for (const [file, digest] of Object.entries(author.submitted)) assert.equal(hash(child(repo, file)), digest, file);
  for (const [file, digest] of Object.entries(manifest.submitted)) assert.equal(author.submitted[file], digest, file);
}
// Exact raw values, including ciphertext, all tables and schema. Read-only SQLite
// snapshot: no decryption, backup replacement, repair, pruning, or key use.
function database() {
  const db = new DatabaseSync(path.join(data, 'planb.sqlite'), { readOnly: true });
  try {
    db.exec('BEGIN');
    const schema = db.prepare('SELECT type,name,tbl_name,sql FROM sqlite_master ORDER BY type,name').all();
    const tables = schema.filter(row => row.type === 'table').map(row => {
      const rows = db.prepare('SELECT * FROM "' + row.name.replaceAll('"', '""') + '"').all();
      return [row.name, rows.map(value => JSON.stringify(value)).sort()];
    });
    const records = db.prepare('SELECT COUNT(*) AS n FROM records').get().n;
    return { digest: createHash('sha256').update(JSON.stringify({ schema, tables })).digest('hex'), records };
  } finally { db.close(); }
}
async function get(url) {
  const response = await fetch(origin + url, { redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(8000) });
  assert.equal(response.status, 200, url); return response;
}
function processIdentity(pid) {
  assert.ok(Number.isInteger(pid) && pid > 0 && pid !== process.pid);
  const command = '$p=Get-CimInstance Win32_Process -Filter "ProcessId = ' + pid + '";if($p){$p|Select-Object ProcessId,Name,CommandLine,CreationDate|ConvertTo-Json -Compress}';
  const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command], { encoding: 'utf8', windowsHide: true, timeout: 15000 });
  assert.equal(result.status, 0, 'Cannot verify owned process');
  const observed = JSON.parse(result.stdout.trim());
  assert.equal(observed.ProcessId, previous.pid); assert.equal(observed.Name.toLowerCase(), 'node.exe');
  const line = observed.CommandLine.toLowerCase();
  assert.ok(line.includes(binary.toLowerCase()) && line.includes(path.join(installation, 'build/block-external.cjs').toLowerCase()));
  return { pid, name: observed.Name, creationDate: observed.CreationDate };
}
async function guards(verify) {
  assert.equal(hash(binary), previous.binary);
  for (const file of ['.env.local', '.ai.local.json', 'demo.seed.json']) assert.ok(!fs.existsSync(path.join(installation, file)), file);
  assert.equal(read(path.join(data, '.planb-key')).kind, 'test');
  const endpoint = read(path.join(data, '.endpoint.json'));
  assert.equal(endpoint.instanceId, instance); assert.equal(endpoint.url, origin); assert.equal(endpoint.pid, previous.pid);
  const process = processIdentity(endpoint.pid);
  assert.equal((await (await get('/api/health')).json()).instanceId, instance);
  assert.equal((await (await get('/api/v2/auth/status')).json()).configured, false);
  const state = await (await get('/api/v2/state')).json();
  assert.equal(state.snapshot?.source?.isTestData, true); assert.equal(state.ready, true);
  const queue = await (await get('/api/v7/local-operations/work')).json();
  verify.validateQueue(queue); // The actual accepted client contract, not a substitute fixture.
  assert.equal(queue.phase, 'active'); assert.equal(queue.identity.instanceId, instance);
  assert.equal(queue.identity.snapshotId, state.snapshot.id); assert.equal(queue.identity.capturedAt, state.snapshot.capturedAt);
  const full = await verify.readContext(undefined, { base: origin, fetch, readTimeoutMs: 15000 });
  assert.equal(full.context.ready, true); assert.equal(full.context.instanceId, instance);
  assert.equal(full.context.snapshotId, state.snapshot.id); assert.equal(full.context.capturedAt, state.snapshot.capturedAt);
  for (const field of ['instanceId', 'snapshotId', 'capturedAt', 'captureStartedAt', 'accountId', 'generatedAt']) assert.equal(queue.identity[field], full.context[field], field);
  return { process, binary: hash(binary), key: hash(path.join(data, '.planb-key')), endpoint: hash(path.join(data, '.endpoint.json')),
    database: database(), context: full.context, queued: queue.counts.queued, returned: queue.tasks.length };
}
async function httpAssets(assets) {
  for (const [file, digest] of Object.entries(assets)) {
    const response = await get('/' + file);
    assert.equal(createHash('sha256').update(Buffer.from(await response.arrayBuffer())).digest('hex'), digest, file);
  }
}
function copyFile(from, to) { fs.mkdirSync(path.dirname(to), { recursive: true }); fs.copyFileSync(from, to, fs.constants.COPYFILE_EXCL); }
function checkPrepared(receipt) {
  const root = inside(receipt.root, scratch); assert.ok(path.basename(root).startsWith('preview299-'));
  assert.equal(receipt.installation, installation); assert.equal(receipt.origin, origin); assert.equal(receipt.instance, instance);
  assert.deepEqual(receipt.sources, manifest.sources);
  for (const [file, digest] of Object.entries(receipt.sources)) assert.equal(hash(child(path.join(root, 's'), file)), digest, file);
  assert.deepEqual(walk(path.join(root, 'dist')), receipt.assets);
  assert.equal(hash(path.join(root, 'verify.mjs')), receipt.verifier);
  return root;
}

accepted();
if (process.argv[2] === '--prepare') {
  assert.ok(!fs.existsSync(pointer), 'Inspect the existing receipt; do not replace it');
  const root = fs.mkdtempSync(path.join(scratch, 'preview299-')), source = path.join(root, 's'); fs.mkdirSync(source);
  for (const file of Object.keys(manifest.sources)) copyFile(child(fixed, file), child(source, file));
  const { build } = await import('vite'), { default: react } = await import('@vitejs/plugin-react'), { build: bundle } = await import('esbuild');
  const environment = { ...process.env };
  try {
    for (const name of Object.keys(process.env)) if (!new Set(['path', 'systemroot', 'windir', 'comspec', 'pathext', 'lang', 'tz', 'temp', 'tmp', 'tmpdir']).has(name.toLowerCase())) delete process.env[name];
    process.env.NODE_ENV = 'production';
    await build({ root: source, mode: 'production', configFile: false, envDir: path.join(root, 'empty-env'), base: './', plugins: [react()], logLevel: 'error', build: { outDir: path.join(root, 'dist'), emptyOutDir: false, minify: false } });
    await bundle({ stdin: { contents: "export {readContext} from './src/local-task-focus-client.ts'; import {LocalWorkQueueSchema} from './shared/local-operations.ts'; export const validateQueue=value=>LocalWorkQueueSchema.parse(value);", resolveDir: source, sourcefile: 'verify-entry.ts', loader: 'ts' }, outfile: path.join(root, 'verify.mjs'), bundle: true, platform: 'node', format: 'esm', logLevel: 'error' });
  } finally { for (const name of Object.keys(process.env)) delete process.env[name]; Object.assign(process.env, environment); }
  const assets = walk(path.join(root, 'dist'));
  for (const file of Object.keys(assets).filter(file => file.endsWith('.js'))) assert.ok(!fs.readFileSync(child(path.join(root, 'dist'), file), 'utf8').includes('react-dom-client.development.js'));
  for (const [file, digest] of Object.entries(manifest.sources)) assert.equal(hash(child(source, file)), digest, file);
  accepted();
  const receipt = { phase: 'prepared', root, source, installation, origin, instance, sources: manifest.sources, provenance: manifest.provenance, assets, verifier: hash(path.join(root, 'verify.mjs')), preparedAt: new Date().toISOString() };
  write(path.join(root, 'prepared.json'), receipt); write(pointer, receipt);
  console.log(JSON.stringify({ phase: receipt.phase, root, sources: Object.keys(receipt.sources).length, assets: Object.keys(assets).length }));
} else if (['--check', '--apply', '--rollback'].includes(process.argv[2])) {
  const receipt = read(pointer), root = checkPrepared(receipt);
  const verify = await import(pathToFileURL(path.join(root, 'verify.mjs')).href);
  const appliedFile = path.join(root, 'applied.json'), backup = path.join(installation, 'dist-before299');
  if (process.argv[2] === '--rollback') {
    const applied = read(appliedFile); assert.ok(!fs.existsSync(path.join(root, 'rolled-back.json')));
    const before = await guards(verify); assert.deepEqual(before, applied.after);
    assert.deepEqual(walk(dist), applied.installedAssets); inside(backup, installation);
    assert.deepEqual(walk(backup), previous.assets);
    // Only replace the entry document. Both sets of immutable assets stay served.
    const temporary = path.join(dist, 'index-rollback299.tmp'); copyFile(path.join(backup, 'index.html'), temporary);
    fs.renameSync(temporary, path.join(dist, 'index.html'));
    await httpAssets(previous.assets); assert.deepEqual(await guards(verify), before);
    write(path.join(root, 'rolled-back.json'), { at: new Date().toISOString(), guards: before });
    console.log('Rolled back index; retained old and new assets. No data or server changes.');
  } else {
    const before = await guards(verify); assert.equal(before.database.records, 62, 'Fixture changed; reassess rather than overwrite');
    const current = fs.existsSync(appliedFile) && !fs.existsSync(path.join(root, 'rolled-back.json')) ? read(appliedFile) : null;
    const expectedAssets = current ? current.installedAssets : previous.assets;
    assert.deepEqual(walk(dist), expectedAssets); await httpAssets(expectedAssets);
    if (current) assert.deepEqual(before, current.after);
    if (process.argv[2] === '--check') {
      write(path.join(root, 'checked-' + Date.now() + '.json'), before);
      console.log(JSON.stringify({ phase: 'checked', ...before }));
    } else {
      assert.ok(!fs.existsSync(appliedFile) && !fs.existsSync(backup), 'Already attempted; inspect receipts first');
      // All non-index collisions must be byte-identical. Never replace an old URL.
      for (const [file, digest] of Object.entries(receipt.assets)) if (file !== 'index.html' && previous.assets[file]) assert.equal(digest, previous.assets[file], file);
      write(path.join(root, 'before.json'), before);
      fs.mkdirSync(backup); inside(backup, installation);
      for (const file of Object.keys(previous.assets)) copyFile(child(dist, file), child(backup, file));
      assert.deepEqual(walk(backup), previous.assets); assert.deepEqual(await guards(verify), before);
      const installedAssets = { ...previous.assets, ...receipt.assets };
      let published = false;
      try {
        for (const file of Object.keys(receipt.assets).filter(file => file !== 'index.html')) {
          const target = child(dist, file);
          if (!fs.existsSync(target)) copyFile(child(path.join(root, 'dist'), file), target);
          assert.equal(hash(target), receipt.assets[file], file);
        }
        await httpAssets(Object.fromEntries(Object.entries(receipt.assets).filter(([file]) => file !== 'index.html')));
        assert.deepEqual(await guards(verify), before);
        const temporary = path.join(dist, 'index-publish299.tmp'); copyFile(path.join(root, 'dist/index.html'), temporary);
        fs.renameSync(temporary, path.join(dist, 'index.html')); published = true;
        assert.deepEqual(walk(dist), installedAssets); await httpAssets(installedAssets);
        const after = await guards(verify); assert.deepEqual(after, before);
        write(appliedFile, { ...receipt, phase: 'applied', before, after, installedAssets, backup, appliedAt: new Date().toISOString() });
        console.log(JSON.stringify({ phase: 'applied', root, pid: after.process.pid, records: after.database.records, assets: Object.keys(installedAssets).length }));
      } catch (error) {
        if (published) { const file = path.join(dist, 'index-failure299.tmp'); copyFile(path.join(backup, 'index.html'), file); fs.renameSync(file, path.join(dist, 'index.html')); }
        await httpAssets(previous.assets);
        write(path.join(root, 'failed.json'), { indexRestored: published, dataUnchanged: database().digest === before.database.digest, message: String(error.message).slice(0, 300), at: new Date().toISOString() });
        throw error;
      }
    }
  }
} else throw new Error('Use --prepare, --check, --apply or --rollback; only the fictional4601 installation is supported.');
