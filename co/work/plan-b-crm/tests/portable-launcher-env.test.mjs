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

function launch(entry, { existing = false, index = true, homeStatus = 200, homeType = 'text/html; charset=utf-8' } = {}) {
  const parent = fs.realpathSync(path.resolve('tests/.tmp'));
  const root = fs.mkdtempSync(path.join(parent, 'launcher272-'));
  assert.equal(fs.realpathSync(root), root);
  assert.equal(path.dirname(root), parent);
  fs.copyFileSync(launcher, path.join(root, 'launch.cjs'), fs.constants.COPYFILE_EXCL);
  for (const file of ['server.mjs', 'runtime.mjs']) fs.writeFileSync(path.join(root, file), '// synthetic entry for dispatch test\n', { flag: 'wx' });
  if (index) {
    fs.mkdirSync(path.join(root, 'dist'));
    fs.writeFileSync(path.join(root, 'dist/index.html'), '<!doctype html><title>Plan B</title>', { flag: 'wx' });
  }
  const instanceId = randomUUID();
  const endpoint = { url: 'http://127.0.0.1:4672', instanceId };
  fs.mkdirSync(path.join(root, 'data'));
  if (existing) fs.writeFileSync(path.join(root, 'data/.endpoint.json'), JSON.stringify(endpoint), { flag: 'wx' });
  const hook = path.join(root, 'observe.cjs');
  fs.writeFileSync(hook, [
    "const fs = require('node:fs'), path = require('node:path'), cp = require('node:child_process');",
    "const calls = [], visits = [], inherited = process.env;",
    'const endpoint = ' + JSON.stringify(endpoint) + ';',
    "globalThis.fetch = async url => {",
    "  visits.push(String(url));",
    "  if (String(url) === endpoint.url + '/api/health') return new Response(JSON.stringify({ ok: true, instanceId: endpoint.instanceId }));",
    "  if (String(url) === endpoint.url + '/') return new Response('<!doctype html><title>Plan B</title>', " + JSON.stringify({ status: homeStatus, headers: { 'content-type': homeType } }) + ");",
    "  throw Error('Unexpected test request');",
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
    "process.on('exit', () => fs.writeFileSync(path.join(__dirname, 'calls.json'), JSON.stringify({ calls, visits })));",
  ].join('\n'), { flag: 'wx' });
  const result = spawnSync(process.execPath, ['--require', hook, path.join(root, 'launch.cjs'), entry], {
    cwd: root, env: { ...baseEnv, ...canaries, PLANB_LAUNCH_NO_BROWSER: '1' }, windowsHide: true,
    encoding: 'utf8', timeout: 10000,
  });
  assert.equal(result.error, undefined);
  const observed = JSON.parse(fs.readFileSync(path.join(root, 'calls.json'), 'utf8'));
  return { result, ...observed, health: endpoint.url + '/api/health', home: endpoint.url + '/' };
}

function assertStarted({ result, visits, health, home }) {
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Plan B disponible/);
  assert.deepEqual(visits, [health, home], 'la salud y la portada pertenecen a la misma instancia');
}

for (const entry of ['server.mjs', 'runtime.mjs']) {
  test(`portable launch of ${entry} passes only platform settings and its own data directory`, () => {
    const observed = launch(entry);
    assertStarted(observed);
    const { calls } = observed;
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
  const observed = launch('runtime.mjs', { existing: true });
  assertStarted(observed);
  assert.deepEqual(observed.calls, []);
});

test('an incomplete download with no index stops before launching a runtime', () => {
  const { result, calls, visits } = launch('runtime.mjs', { index: false });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Extrae el paquete completo/);
  assert.doesNotMatch(result.stdout, /Plan B disponible/);
  assert.deepEqual(calls, []);
  assert.deepEqual(visits, []);
});

for (const broken of [{ homeStatus: 404 }, { homeType: 'application/json' }]) {
  test(`matching health does not hide an invalid home response (${Object.values(broken)[0]})`, () => {
    const { result, calls, visits, health, home } = launch('runtime.mjs', { existing: true, ...broken });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /portada no está disponible/);
    assert.doesNotMatch(result.stdout, /Plan B disponible/);
    assert.deepEqual(calls, [], 'una instancia propia ya responde, aunque la portada falle');
    assert.deepEqual(visits, [health, home]);
  });
}
