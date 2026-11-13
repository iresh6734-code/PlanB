import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const launcher = path.resolve('scripts/launch.cjs');
const allowed = new Set(['path', 'systemroot', 'windir', 'comspec', 'pathext', 'temp', 'tmp', 'tmpdir', 'lang', 'lc_all', 'lc_ctype', 'tz', 'processor_architecture', 'number_of_processors']);
const baseEnv = Object.fromEntries(Object.entries(process.env).filter(([key]) => allowed.has(key.toLowerCase())));
const canaries = {
  PORTABLE_PASSWORD: 'fixture-canary-password',
  PORTABLE_PASSPHRASE: 'fixture-canary-passphrase',
  PORTABLE_PRIVATE_KEY: 'fixture-canary-key',
  PORTABLE_COOKIE: 'fixture-canary-cookie',
  DATABASE_URL: 'fixture-canary-database',
  PORTABLE_OTHER: 'fixture-canary-other',
  PLANB_DATA_DIR: 'fixture-canary-other-installation',
  NODE_ENV: 'fixture-canary-mode',
  NODE_OPTIONS: '--max-old-space-size=512',
};

function launch(entry, existing = false) {
  const parent = fs.realpathSync(path.resolve('tests/.tmp'));
  const root = fs.mkdtempSync(path.join(parent, 'launcher272-'));
  assert.equal(fs.realpathSync(root), root);
  assert.equal(path.dirname(root), parent);
  fs.copyFileSync(launcher, path.join(root, 'launch.cjs'), fs.constants.COPYFILE_EXCL);
  for (const file of ['server.mjs', 'runtime.mjs']) fs.writeFileSync(path.join(root, file), '// synthetic entry for dispatch test\n', { flag: 'wx' });
  const instanceId = randomUUID();
  const endpoint = { url: 'http://127.0.0.1:4672', instanceId };
  fs.mkdirSync(path.join(root, 'data'));
  if (existing) fs.writeFileSync(path.join(root, 'data/.endpoint.json'), JSON.stringify(endpoint), { flag: 'wx' });
  const hook = path.join(root, 'observe.cjs');
  fs.writeFileSync(hook, [
    "const fs = require('node:fs'), path = require('node:path'), cp = require('node:child_process');",
    "const calls = [], inherited = process.env;",
    'const endpoint = ' + JSON.stringify(endpoint) + ';',
    "globalThis.fetch = async url => {",
    "  if (String(url) !== endpoint.url + '/api/health') throw Error('Unexpected test request');",
    "  return new Response(JSON.stringify({ ok: true, instanceId: endpoint.instanceId }));",
    "};",
    "cp.spawn = (executable, args, options) => {",
    "  if (executable !== process.execPath) throw Error('A browser or another process was requested');",
    "  const env = options.env;",
    "  calls.push({ entry: path.basename(args[0]), cwdIsOwn: options.cwd === __dirname, dataIsOwn: env.PLANB_DATA_DIR === path.join(__dirname, 'data'),",
    "    hidden: options.windowsHide, detached: options.detached, keys: Object.keys(env).map(key => key.toLowerCase()).sort(),",
    "    inheritedCanaries: Object.keys(env).filter(key => String(env[key]).startsWith('fixture-canary-')).sort(),",
    "    platformPreserved: Object.keys(inherited).filter(key => /^(path|systemroot|windir|comspec|pathext|temp|tmp|tmpdir|lang|lc_all|lc_ctype|tz|processor_architecture|number_of_processors)$/i.test(key)).every(key => env[key] === inherited[key]) });",
    "  fs.writeFileSync(path.join(__dirname, 'data/.endpoint.json'), JSON.stringify(endpoint));",
    "  return { unref() {}, on() {} };",
    "};",
    "process.on('exit', () => fs.writeFileSync(path.join(__dirname, 'calls.json'), JSON.stringify(calls)));",
  ].join('\n'), { flag: 'wx' });
  const result = spawnSync(process.execPath, ['--require', hook, path.join(root, 'launch.cjs'), entry], {
    cwd: root, env: { ...baseEnv, ...canaries, PLANB_LAUNCH_NO_BROWSER: '1' }, windowsHide: true,
    encoding: 'utf8', timeout: 10000,
  });
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Plan B disponible/);
  return JSON.parse(fs.readFileSync(path.join(root, 'calls.json'), 'utf8'));
}

for (const entry of ['server.mjs', 'runtime.mjs']) {
  test(`portable launch of ${entry} passes only platform settings and its own data directory`, () => {
    const calls = launch(entry);
    assert.equal(calls.length, 1);
    const call = calls[0];
    assert.equal(call.entry, entry);
    assert.deepEqual(call.inheritedCanaries, []);
    assert.equal(call.keys.includes('node_options'), false);
    assert.equal(call.keys.includes('node_env'), false);
    assert.equal(call.keys.includes('planb_launch_no_browser'), false);
    assert.equal(call.keys.every(key => allowed.has(key) || key === 'planb_data_dir'), true);
    assert.equal(call.platformPreserved, true);
    assert.equal(call.dataIsOwn, true);
    assert.equal(call.cwdIsOwn, true);
    assert.equal(call.hidden, true);
    assert.equal(call.detached, true);
  });
}

test('a healthy matching endpoint is reused without spawning a second runtime', () => {
  assert.deepEqual(launch('runtime.mjs', true), []);
});
