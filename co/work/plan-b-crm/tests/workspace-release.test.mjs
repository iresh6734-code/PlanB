import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createManifest, verifyManifest, validateManifest, sourceCoordination, readStable, canonicalRoot, entryAssetPaths, ReleaseError, LIMITS, sha256 } from '../tools/releases/workspace-manifest.mjs';
import { inspectServed, main, readManifest } from '../tools/releases/workspace-preflight.mjs';

const base = path.resolve('tests/.tmp');
fs.mkdirSync(base, { recursive: true });
function fixture(t) {
  const root = fs.mkdtempSync(path.join(base, 'release-033-'));
  t.after(() => {
    const resolved = fs.realpathSync(root);
    assert(resolved.startsWith(fs.realpathSync(base) + path.sep));
    fs.rmSync(root, { recursive: true, force: true });
  });
  const write = (name, value) => { const file = path.join(root, name); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, value); };
  write('candidate/index.html', '<!doctype html><link rel="icon" href="/favicon.svg"><script type="module" src="/assets/main.js"></script><link rel="stylesheet" href="/assets/main.css">');
  write('candidate/favicon.svg', '<svg xmlns="http://www.w3.org/2000/svg"/>');
  write('candidate/assets/main.js', 'export const answer = 42;');
  write('candidate/assets/main.css', 'body { color: #123; }');
  write('source/src/Page.tsx', 'export const Page = () => null;');
  const candidate = path.join(root, 'candidate'), source = path.join(root, 'source');
  return { root, candidate, source, write, manifest: () => createManifest({ artifactRoot: candidate, sourceRoot: source, sourcePaths: ['src/Page.tsx'] }) };
}
const throwsCode = (run, code) => assert.throws(run, error => error instanceof ReleaseError && error.code === code);
const rejectCode = (run, code) => assert.rejects(run, error => error instanceof ReleaseError && error.code === code);
const health = service => service === 'pilot'
  ? { ok: true, version: '0.6.0', mode: 'local-pilot' }
  : { ok: true, version: '0.6.0', instanceId: 'abc12345-1234-1234-1234-123456789abc' };
function transport(f, service = 'crm', replace = () => undefined) {
  const calls = [];
  const fetcher = async (url, options) => {
    calls.push({ url, options });
    const pathname = new URL(url).pathname;
    const custom = replace(pathname, options, calls.length);
    if (custom !== undefined) return custom;
    if (pathname.endsWith('/health')) return Response.json(health(service));
    const file = pathname === '/' || pathname === '/team' ? 'index.html' : pathname.slice(1);
    return new Response(fs.readFileSync(path.join(f.candidate, file)));
  };
  return { calls, fetcher };
}

test('manifiesto determinista: bytes/hashes, fuentes explícitas y ninguna escritura', t => {
  const f = fixture(t), before = fs.readdirSync(f.candidate).sort(), m = f.manifest();
  assert.deepEqual(m, f.manifest());
  assert.equal(m.complete, true); assert.equal(m.layout, 'dist');
  assert.deepEqual(m.files.map(file => file.path), ['assets/main.css', 'assets/main.js', 'favicon.svg', 'index.html']);
  assert.equal(m.sources[0].sha256, sha256(Buffer.from('export const Page = () => null;')));
  assert.deepEqual(fs.readdirSync(f.candidate).sort(), before);
  assert.equal(verifyManifest({ manifest: m, artifactRoot: f.candidate }).status, 'match');
});

test('runtime: frontend/backend separados, datos/config/junctions ajenos excluidos', t => {
  const f = fixture(t);
  fs.renameSync(f.candidate, path.join(f.root, 'dist'));
  f.write('server.mjs', 'export const server = true;'); f.write('.env.local', 'SYNTHETIC_PRIVATE_CONFIGURATION');
  f.write('data/planb.sqlite', 'SYNTHETIC_RECORDS'); f.write('crm.log', 'SYNTHETIC_LOG');
  fs.symlinkSync(f.source, path.join(f.root, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir');
  const m = createManifest({ artifactRoot: f.root });
  assert.equal(m.layout, 'runtime'); assert.equal(m.files.find(file => file.path === 'server.mjs').component, 'backend');
  assert(m.files.filter(file => file.component === 'frontend').every(file => file.path.startsWith('dist/')));
  assert(!JSON.stringify(m).includes('SYNTHETIC_')); assert(!m.files.some(file => file.path.includes('node_modules')));
  assert.equal(verifyManifest({ manifest: m, artifactRoot: f.root }).status, 'match');
});

test('coteja candidato contra distribución con activos antiguos conservados', t => {
  const f = fixture(t), m = f.manifest(), deployed = path.join(f.root, 'deployed');
  fs.cpSync(f.candidate, deployed, { recursive: true }); f.write('deployed/assets/old.js', 'old');
  assert.equal(verifyManifest({ manifest: m, artifactRoot: deployed }).status, 'match');
  f.write('deployed/index.html', '<script src="/assets/old.js"></script>');
  const result = verifyManifest({ manifest: m, artifactRoot: deployed });
  assert.equal(result.status, 'different'); assert.equal(result.files.find(file => file.path === 'index.html').state, 'changed');
});

test('detecta un chunk corrupto y uno ausente, sin confundirlos con versión', t => {
  const f = fixture(t), m = f.manifest();
  f.write('candidate/assets/main.js', 'export const answer = 41;'); fs.unlinkSync(path.join(f.candidate, 'assets/main.css'));
  const result = verifyManifest({ manifest: m, artifactRoot: f.candidate });
  assert.equal(result.status, 'different');
  assert.equal(result.files.find(file => file.path.endsWith('main.js')).state, 'changed');
  assert.equal(result.files.find(file => file.path.endsWith('main.css')).state, 'missing');
});

test('rechaza manifiestos incompletos, duplicados, hashes y layouts manipulados', t => {
  const f = fixture(t), m = f.manifest();
  for (const bad of [null, { ...m, complete: false }, { ...m, complete: undefined }, { ...m, format: 2 }, { ...m, files: [] }, { ...m, sources: null }, { ...m, unexpected: true }, { ...m, files: [...m.files, { ...m.files[0], path: 'assets/MAIN.css' }] }, { ...m, files: m.files.map(file => ({ ...file, sha256: 'NOT_A_HASH' })) }, { ...m, files: m.files.map(file => ({ ...file, bytes: -1 })) }]) assert.throws(() => validateManifest(bad), ReleaseError);
  throwsCode(() => validateManifest({ ...m, files: m.files.filter(file => file.path !== 'index.html') }), 'INCOMPLETE_MANIFEST');
  throwsCode(() => validateManifest({ ...m, files: [...m.files, { path: 'server.mjs', bytes: 0, sha256: sha256(''), component: 'backend' }] }), 'AMBIGUOUS_LAYOUT');
});

test('rechaza rutas Windows ambiguas, privadas, codificadas y escapes antes de leer', t => {
  const f = fixture(t), m = f.manifest();
  for (const bad of ['../outside.js', '/etc/passwd', 'C:/private.js', 'assets\\main.js', 'assets/%2e%2e/secret.js', 'assets/../secret.js', 'assets/CON.js', 'assets/thing.js.', 'assets/thing.js ', '.env.local', 'data/planb.sqlite', 'src/.google-oauth.enc']) {
    assert.throws(() => validateManifest({ ...m, files: [{ path: bad, bytes: 1, sha256: sha256('x'), component: 'frontend' }] }), ReleaseError);
  }
  for (const bad of ['.env.local', 'data/persons.json', 'src/../private.ts', 'coordination/board.json']) assert.throws(() => createManifest({ artifactRoot: f.candidate, sourceRoot: f.source, sourcePaths: [bad] }), ReleaseError);
});

test('rechaza junctions/directorios en la raíz, activos y fuentes fuera del límite', t => {
  const f = fixture(t);
  fs.symlinkSync(f.candidate, path.join(f.root, 'root-link'), process.platform === 'win32' ? 'junction' : 'dir');
  throwsCode(() => createManifest({ artifactRoot: path.join(f.root, 'root-link') }), 'UNSAFE_ROOT');
  fs.symlinkSync(f.source, path.join(f.candidate, 'assets/sub'), process.platform === 'win32' ? 'junction' : 'dir');
  throwsCode(() => f.manifest(), 'LINK_REJECTED');
  fs.symlinkSync(f.candidate, path.join(f.source, 'src/linked'), process.platform === 'win32' ? 'junction' : 'dir');
  throwsCode(() => readStable(canonicalRoot(f.source), 'src/linked/index.html'), 'LINK_REJECTED');
});

test('rechaza metadatos de symlink de archivo antes de abrirlo (lstat simulado)', t => {
  // Windows permite junctions pero este equipo no concede crear symlinks de archivo.
  // No activar Developer Mode: probar esta rama con metadata, y las junctions reales arriba.
  const f = fixture(t), file = path.join(f.source, 'src/Page.tsx');
  const lstat = fs.lstatSync, open = fs.openSync;
  let opened = false;
  fs.lstatSync = (target, ...args) => {
    const stat = lstat(target, ...args);
    return path.resolve(target) === file ? { ...stat, isSymbolicLink: () => true } : stat;
  };
  fs.openSync = (target, ...args) => { if (path.resolve(target) === file) opened = true; return open(target, ...args); };
  try { throwsCode(() => readStable(canonicalRoot(f.source), 'src/Page.tsx'), 'LINK_REJECTED'); assert.equal(opened, false); }
  finally { fs.lstatSync = lstat; fs.openSync = open; }
});

test('lectura acotada rechaza archivo sobredimensionado antes de cargarlo', t => {
  const f = fixture(t), file = path.join(f.candidate, 'assets/large.js'), fd = fs.openSync(file, 'w');
  try { fs.ftruncateSync(fd, LIMITS.fileBytes + 1); } finally { fs.closeSync(fd); }
  throwsCode(() => f.manifest(), 'FILE_LIMIT');
});

test('limita cantidad y suma de bytes declarados sin cargar archivos grandes', t => {
  const f = fixture(t), m = f.manifest();
  const extra = Array.from({ length: LIMITS.files }, (_, index) => ({ path: `assets/extra${index}.js`, component: 'frontend', bytes: 1, sha256: sha256('x') }));
  throwsCode(() => validateManifest({ ...m, files: [...m.files, ...extra] }), 'INVALID_MANIFEST');
  throwsCode(() => validateManifest({ ...m, files: [...m.files, ...extra.slice(0, 4).map(file => ({ ...file, bytes: LIMITS.fileBytes }))] }), 'TOTAL_LIMIT');
});

test('no publica manifiesto si el archivo crece durante su lectura', t => {
  const f = fixture(t), root = canonicalRoot(f.source), file = path.join(f.source, 'src/Page.tsx');
  assert(readStable(root, 'src/Page.tsx').length > 0);
  const original = fs.readSync;
  let mutate = true;
  fs.readSync = (...args) => { const count = original(...args); if (mutate) { mutate = false; fs.appendFileSync(file, '\nchanged'); } return count; };
  try { throwsCode(() => readStable(root, 'src/Page.tsx'), 'UNSTABLE_FILE'); } finally { fs.readSync = original; }
});

function mutateEarlierDuringLaterRead(f, run) {
  f.write('candidate/assets/a.js', "export const a = 'a';"); f.write('candidate/assets/b.js', "export const b = 'b';");
  const original = fs.readSync;
  let mutate = true;
  fs.readSync = (...args) => {
    const count = original(...args);
    if (mutate && args[1].subarray(args[2], args[2] + count).toString().includes("export const b = 'b'")) { mutate = false; f.write('candidate/assets/a.js', "export const a = 'c';"); }
    return count;
  };
  try { return run(); } finally { fs.readSync = original; }
}
test('detecta cambios entre lecturas del conjunto, no solo dentro de un archivo', t => {
  const f = fixture(t);
  mutateEarlierDuringLaterRead(f, () => throwsCode(() => f.manifest(), 'UNSTABLE_SNAPSHOT'));
});
test('verificación vuelve a comprobar archivos que cambiaron después de cotejarlos', t => {
  const f = fixture(t);
  f.write('candidate/assets/a.js', "export const a = 'a';"); f.write('candidate/assets/b.js', "export const b = 'b';");
  const m = f.manifest();
  const result = mutateEarlierDuringLaterRead(f, () => verifyManifest({ manifest: m, artifactRoot: f.candidate }));
  assert.equal(result.status, 'different'); assert.equal(result.files.find(file => file.path.endsWith('/a.js')).code, 'UNSTABLE_SNAPSHOT');
});

test('índice con referencias ausentes o externas no acredita un artefacto completo', t => {
  const f = fixture(t), m = f.manifest();
  throwsCode(() => verifyManifest({ manifest: { ...m, files: m.files.filter(file => !file.path.endsWith('main.js')) }, artifactRoot: f.candidate }), 'INCOMPLETE_MANIFEST');
  for (const url of ['https://example.invalid/script.js', '//example.invalid/script.js', '/assets/%2e%2e/secret.js', '/assets/main.js?token=PRIVATE']) {
    f.write('candidate/index.html', `<script src="${url}"></script>`);
    throwsCode(() => f.manifest(), 'UNSUPPORTED_ASSET_REFERENCE');
  }
});

test('REL033R2 sin comillas: un activo inexistente impide completo y el mismo índice válido sí pasa', t => {
  const f = fixture(t);
  f.write('candidate/index.html', '<script type=module src=/assets/missing.js></script>');
  throwsCode(() => f.manifest(), 'INCOMPLETE_MANIFEST');
  f.write('candidate/assets/missing.js', 'export const present = true;');
  const m = f.manifest();
  assert.equal(m.complete, true);
  assert.equal(verifyManifest({ manifest: m, artifactRoot: f.candidate }).status, 'match');
  assert.deepEqual(entryAssetPaths('<SCRIPT ASYNC SRC=/assets/missing.js></SCRIPT>'), ['assets/missing.js']);
});

test('REL033R2 data-src: el atributo de datos no suplanta al src real ni crea dependencias fantasma', t => {
  const f = fixture(t);
  f.write('candidate/index.html', '<script data-src="/assets/main.js" src="/assets/missing.js"></script>');
  throwsCode(() => f.manifest(), 'INCOMPLETE_MANIFEST');
  f.write('candidate/index.html', '<script data-src="/assets/missing.js" src="/assets/main.js"></script>');
  assert.equal(verifyManifest({ manifest: f.manifest(), artifactRoot: f.candidate }).status, 'match');
  assert.deepEqual(entryAssetPaths('<script data-src="/assets/ghost.js"></script>'), []);
});

test('REL033R2 atributos: href de link y src de script se leen completos, en orden arbitrario y con mayor que entre comillas', () => {
  const html = '<!DOCTYPE html><title>Ensayo &amp; control</title>' +
    '<link data-href="/assets/ghost.css" src="/assets/irrelevant.js" title="uno > dos" HREF = /assets/main.css rel=stylesheet>' +
    '<script href="/assets/irrelevant.js" data-src="/assets/ghost.js" defer SRC=\'/assets/main.js\'></script>';
  assert.deepEqual(entryAssetPaths(html), ['assets/main.css', 'assets/main.js']);
  assert.deepEqual(entryAssetPaths(html, 'dist/'), ['dist/assets/main.css', 'dist/assets/main.js']);
});

test('REL033R2 contextos: comentarios y texto de script/style/textarea no declaran activos del índice', () => {
  const html = '<!-- <script src="/assets/comment.js"></script> -->' +
    '<script>const text = "<link href=\'/assets/string.css\'>";</script>' +
    '<style>/* <script src=/assets/style.js> */</style>' +
    '<textarea><script src=/assets/textarea.js></script></textarea>' +
    '<script src=/assets/main.js></script>';
  assert.deepEqual(entryAssetPaths(html), ['assets/main.js']);
});

test('REL033R2 sintaxis no soportada: se rechaza explícitamente en vez de certificar un índice ambiguo', () => {
  for (const html of [
    '<script src="/assets/main.js" SRC="/assets/other.js"></script>',
    '<script src="/assets/main.js></script>', '<script/src=/assets/main.js></script>',
    '<script src=/assets/main.js', '<script src="/assets/main.js"async></script>',
    '<!--> <script src=/assets/main.js></script> -->', '<!-- x --!> <script src=/assets/main.js></script> -->',
    '<!-- unfinished', '<script><!-- <script></script></script>',
    '<base href="https://elsewhere.invalid/"><script src=/assets/main.js></script>',
    '<svg><script href="/assets/main.js"></script></svg>', '<math></math>',
    '<template><script src=/assets/main.js></script></template>',
    '<noscript><link href=/assets/main.css></noscript>'
  ]) throwsCode(() => entryAssetPaths(html), 'UNSUPPORTED_INDEX_HTML');
  for (const html of ['<script src="/assets/ma&#105;n.js"></script>', '<script src=" /assets/main.js"></script>', '<script src></script>', '<script src="data:image/png,x"></script>']) {
    throwsCode(() => entryAssetPaths(html), 'UNSUPPORTED_ASSET_REFERENCE');
  }
  assert.deepEqual(entryAssetPaths('<link rel=icon href="data:image/png;base64,AAAA">'), []);
  throwsCode(() => entryAssetPaths(' '.repeat(256 * 1024 + 1)), 'INDEX_LIMIT');
});

function withIndex(f, manifest, html) {
  f.write('candidate/index.html', html);
  const bytes = Buffer.from(html);
  return validateManifest({ ...manifest, files: manifest.files.map(file => file.path === 'index.html' ? { ...file, bytes: bytes.length, sha256: sha256(bytes) } : file) });
}

test('REL033R2 HTTP sin comillas: bytes/hashes coincidentes no ocultan una referencia ausente', async t => {
  const f = fixture(t), m = withIndex(f, f.manifest(), '<script src=/assets/missing.js></script>');
  throwsCode(() => verifyManifest({ manifest: m, artifactRoot: f.candidate }), 'INCOMPLETE_MANIFEST');
  const result = await inspectServed({ manifest: m, service: 'crm', fetcher: transport(f).fetcher });
  assert.equal(result.status, 'different'); assert.equal(result.entrypoints, 'different_from_candidate');
});

test('REL033R2 HTTP data-src: el índice recibido se contrasta con el src real aunque el señuelo exista', async t => {
  const f = fixture(t), m = withIndex(f, f.manifest(), '<script data-src="/assets/main.js" src="/assets/missing.js"></script>');
  const result = await inspectServed({ manifest: m, service: 'crm', fetcher: transport(f).fetcher });
  assert.equal(result.status, 'different'); assert.equal(result.entrypoints, 'different_from_candidate');
});

test('REL033R2 HTTP ambiguo: error tipado sin match y control positivo de índice sin comillas', async t => {
  const f = fixture(t), original = f.manifest();
  const bad = withIndex(f, original, '<script src="/assets/main.js" src="/assets/missing.js"></script>');
  const result = await inspectServed({ manifest: bad, service: 'crm', fetcher: transport(f).fetcher });
  assert.equal(result.status, 'different');
  assert.equal(result.frontend.filter(file => file.path === 'index.html').length, 1);
  assert.equal(result.frontend.find(file => file.path === 'index.html').code, 'UNSUPPORTED_INDEX_HTML');
  const valid = withIndex(f, original, '<script defer src=/assets/main.js></script><link rel=stylesheet href=/assets/main.css>');
  assert.equal((await inspectServed({ manifest: valid, service: 'crm', fetcher: transport(f).fetcher })).status, 'match');
});

test('reservas working/review prevalecen sobre un hash done anterior', t => {
  const f = fixture(t), m = f.manifest(), record = m.sources[0];
  const done = { id: 'CODEX-OLD', status: 'done', reserved: false, files: [record.path], submitted: { [record.path]: record.sha256 } };
  assert.equal(sourceCoordination(record.path, record.sha256, { format: 1, tasks: [done] }).state, 'last_done_hash_matches');
  for (const status of ['working', 'review', 'blocked']) {
    const board = { format: 1, tasks: [done, { id: 'CLAUDE-NEW', status, reserved: true, files: [record.path] }] };
    const result = verifyManifest({ manifest: m, artifactRoot: f.candidate, sourceRoot: f.source, board });
    assert.equal(result.status, 'match'); assert.equal(result.review, 'not_approved_by_this_tool');
    assert.deepEqual(result.sources[0].coordination, { state: 'reserved', tasks: [{ id: 'CLAUDE-NEW', status }] });
  }
});

test('fuente nueva/cambiada y último hash done diferente quedan distinguidos', t => {
  const f = fixture(t), m = f.manifest(), record = m.sources[0];
  assert.equal(sourceCoordination(record.path, record.sha256, { format: 1, tasks: [] }).state, 'unrecorded');
  const board = { format: 1, tasks: [{ id: 'CODEX-LAST', status: 'done', files: [record.path], submitted: { [record.path]: sha256('another') } }] };
  assert.equal(sourceCoordination(record.path, record.sha256, board).state, 'differs_from_last_done');
  f.write('source/src/Page.tsx', 'export const Changed = true;');
  assert.equal(verifyManifest({ manifest: m, artifactRoot: f.candidate, sourceRoot: f.source, board }).status, 'different');
  assert.equal(verifyManifest({ manifest: m, artifactRoot: f.candidate }).sources, 'not_checked');
});

test('HTTP compara bytes públicos, exige GET sin credenciales y no verifica backend por health', async t => {
  const f = fixture(t), m = f.manifest();
  for (const service of ['crm', 'pilot']) {
    const mock = transport(f, service), result = await inspectServed({ manifest: m, service, fetcher: mock.fetcher });
    assert.equal(result.status, 'match'); assert.equal(result.backend, 'not_verified_by_http'); assert.equal(result.review, 'not_approved_by_this_tool');
    assert.equal(mock.calls.length, m.files.length + 2);
    for (const { url, options } of mock.calls) {
      assert.equal(new URL(url).origin, service === 'crm' ? 'http://127.0.0.1:4331' : 'http://localhost:4334');
      assert.equal(options.method, 'GET'); assert.equal(options.redirect, 'error'); assert.equal(options.credentials, 'omit');
      assert.deepEqual(options.headers, { Accept: '*/*' }); assert(options.signal instanceof AbortSignal);
    }
  }
});

test('HTTP revalida el índice al final para detectar un cambio mientras lee los activos', async t => {
  const f = fixture(t), m = f.manifest(); let indexReads = 0;
  const mock = transport(f, 'crm', pathname => pathname === '/' && ++indexReads === 2 ? new Response('new index') : undefined);
  const result = await inspectServed({ manifest: m, service: 'crm', fetcher: mock.fetcher });
  assert.equal(result.status, 'different'); assert.equal(result.entrypoints, 'changed_during_check'); assert.equal(indexReads, 2);
});

test('HTTP runtime elimina solo prefijo dist y nunca solicita archivos de servidor', async t => {
  const f = fixture(t), m = f.manifest();
  const runtime = { ...m, layout: 'runtime', files: [...m.files.map(file => ({ ...file, path: 'dist/' + file.path })), { path: 'server.mjs', component: 'backend', bytes: 4, sha256: sha256('code') }] };
  const mock = transport(f), result = await inspectServed({ manifest: runtime, service: 'crm', fetcher: mock.fetcher });
  assert.equal(result.status, 'match'); assert.equal(result.backend, 'not_verified_by_http');
  assert(!mock.calls.some(({ url }) => url.includes('/server.mjs') || url.includes('/dist/')));
});

test('misma versión 0.6.0 con índice viejo se informa diferente aunque existan chunks nuevos', async t => {
  const f = fixture(t), m = f.manifest();
  const mock = transport(f, 'crm', pathname => pathname === '/' ? new Response('<script src="/assets/old.js"></script>') : undefined);
  const result = await inspectServed({ manifest: m, service: 'crm', fetcher: mock.fetcher });
  assert.equal(result.health.version, '0.6.0'); assert.equal(result.status, 'different');
  assert.equal(result.frontend.find(file => file.path === 'index.html').state, 'changed');
  assert.equal(result.entrypoints, 'different_from_candidate');
});

test('orígenes arbitrarios, flags URL y manifiestos malformados no llegan a red', async t => {
  const f = fixture(t), m = f.manifest(); let calls = 0;
  const fetcher = () => { calls++; throw Error('should not run'); };
  for (const service of ['https://example.invalid', '__proto__', 'localhost:4331', undefined]) await rejectCode(() => inspectServed({ manifest: m, service, fetcher }), 'INVALID_SERVICE');
  await rejectCode(() => inspectServed({ manifest: { ...m, complete: false }, service: 'crm', fetcher }), 'INVALID_MANIFEST');
  const output = [];
  assert.equal(await main(['http', '--url', 'https://example.invalid'], { output: text => output.push(text), fetcher }), 1);
  assert.equal(calls, 0); assert(!output.join('').includes('https://example.invalid'));
});

test('límite de peticiones y plazos inválidos rechazan antes de cualquier GET', async t => {
  const f = fixture(t), m = f.manifest(); let calls = 0;
  const fetcher = () => { calls++; throw Error('no network'); };
  const files = [...m.files, ...Array.from({ length: 127 }, (_, index) => ({ path: `assets/extra${index}.js`, component: 'frontend', bytes: 1, sha256: sha256('x') }))];
  await rejectCode(() => inspectServed({ manifest: { ...m, files }, service: 'crm', fetcher }), 'HTTP_REQUEST_LIMIT');
  for (const options of [{ timeoutMs: 0 }, { timeoutMs: 5001 }, { overallTimeoutMs: 0 }, { overallTimeoutMs: 15001 }]) await rejectCode(() => inspectServed({ manifest: m, service: 'crm', fetcher, ...options }), 'INVALID_TIMEOUT');
  assert.equal(calls, 0);
});

test('health incorrecto no provoca lecturas de activos o salida de datos recibidos', async t => {
  const f = fixture(t), m = f.manifest();
  const mock = transport(f, 'crm', () => Response.json({ ok: true, version: 'PRIVATE_TOKEN', mode: 'local-pilot', secret: 'DO_NOT_PRINT' }));
  const result = await inspectServed({ manifest: m, service: 'crm', fetcher: mock.fetcher });
  assert.equal(result.status, 'different'); assert.equal(result.health.state, 'wrong_service');
  assert.equal(mock.calls.length, 1); assert(!JSON.stringify(result).includes('PRIVATE_TOKEN')); assert(!JSON.stringify(result).includes('DO_NOT_PRINT'));
});

test('no sigue ni imprime redirecciones, errores de transporte o URL con secreto', async t => {
  const f = fixture(t), m = f.manifest();
  const response = new Response('PRIVATE_BODY'); Object.defineProperty(response, 'url', { value: 'https://example.invalid/?token=PRIVATE_TOKEN' });
  const redirected = await inspectServed({ manifest: m, service: 'crm', fetcher: async () => response });
  assert.equal(redirected.health.code, 'HTTP_REDIRECT'); assert(!JSON.stringify(redirected).includes('PRIVATE'));
  const failed = await inspectServed({ manifest: m, service: 'crm', fetcher: async () => { throw Error('PRIVATE_TOKEN'); } });
  assert.equal(failed.health.code, 'HTTP_UNAVAILABLE'); assert(!JSON.stringify(failed).includes('PRIVATE'));
});

test('acota fetch que ignora AbortSignal y consume su rechazo tardío', async t => {
  const f = fixture(t), m = f.manifest(); let rejectLate, signal;
  const result = await inspectServed({ manifest: m, service: 'crm', timeoutMs: 10, fetcher: (_url, options) => { signal = options.signal; return new Promise((_resolve, reject) => { rejectLate = reject; }); } });
  assert.equal(result.health.code, 'HTTP_TIMEOUT'); assert(signal.aborted);
  rejectLate(Error('late synthetic failure')); await new Promise(resolve => setImmediate(resolve));
});

test('acota un cuerpo que no termina y cancela sin esperar una cancelación atascada', async t => {
  const f = fixture(t), m = f.manifest(); let cancels = 0;
  const body = new ReadableStream({ start() {}, cancel() { cancels++; return new Promise(() => {}); } });
  const result = await inspectServed({ manifest: m, service: 'crm', timeoutMs: 10, fetcher: async () => new Response(body) });
  assert.equal(result.health.code, 'HTTP_TIMEOUT'); assert(cancels >= 1);
});

test('limita bytes anunciados y recibidos, sin exponer cuerpos privados', async t => {
  const f = fixture(t), m = f.manifest();
  for (const response of [new Response('PRIVATE', { headers: { 'Content-Length': '99999999' } }), new Response('x'.repeat(16385)), new Response('PRIVATE', { status: 401 })]) {
    const result = await inspectServed({ manifest: m, service: 'crm', fetcher: async () => response });
    assert(['HTTP_BODY_LIMIT', 'HTTP_STATUS'].includes(result.health.code)); assert(!JSON.stringify(result).includes('PRIVATE'));
  }
});

test('presupuesto total limita la espera de activos después de un health correcto', async t => {
  const f = fixture(t), m = f.manifest(); let calls = 0, pendingSignal;
  const result = await inspectServed({ manifest: m, service: 'crm', timeoutMs: 5000, overallTimeoutMs: 15, fetcher: async (_url, options) => {
    if (++calls === 1) return Response.json(health('crm'));
    pendingSignal = options.signal; return new Promise(() => {});
  } });
  assert.equal(result.status, 'different'); assert.equal(result.health.state, 'reachable');
  assert(['HTTP_TIMEOUT', 'HTTP_TOTAL_TIMEOUT'].includes(result.frontend[0].code)); assert.equal(calls, 2); assert(pendingSignal.aborted);
});

test('el CLI es local por defecto, verifica manifiestos y separa diferencias de errores', async t => {
  const f = fixture(t), output = []; let calls = 0;
  const options = { output: value => output.push(value), fetcher: () => { calls++; throw Error('no network'); } };
  assert.equal(await main([], options), 0); assert(output.pop().includes('solo lectura'));
  assert.equal(await main(['create', '--artifact-root', f.candidate, '--source-root', f.source, '--source', 'src/Page.tsx'], options), 0);
  const m = JSON.parse(output.pop()), file = path.join(f.root, 'manifest.json'); f.write('manifest.json', JSON.stringify(m));
  assert.deepEqual(readManifest(file), m);
  assert.equal(await main(['verify', '--manifest', file, '--artifact-root', f.candidate, '--source-root', f.source], options), 0);
  assert.equal(JSON.parse(output.pop()).sources[0].coordination.state, 'not_checked');
  f.write('candidate/assets/main.css', 'changed');
  assert.equal(await main(['verify', '--manifest', file, '--artifact-root', f.candidate], options), 2);
  assert.equal(JSON.parse(output.pop()).status, 'different');
  assert.equal(await main(['create', '--artifact-root', f.candidate, '--artifact-root', f.candidate], options), 1); output.pop();
  assert.equal(await main(['verify', '--manifest', path.join(f.root, '.env.local'), '--artifact-root', f.candidate], options), 1);
  assert.equal(JSON.parse(output.pop()).error.code, 'INVALID_MANIFEST_FILE'); assert.equal(calls, 0);
});

test('un metadata JSON inválido no imprime su contenido y un board inválido no se acepta', async t => {
  const f = fixture(t), output = [];
  f.write('manifest.json', '{PRIVATE_TOKEN');
  assert.equal(await main(['verify', '--manifest', path.join(f.root, 'manifest.json'), '--artifact-root', f.candidate], { output: value => output.push(value) }), 1);
  assert(!output.join('').includes('PRIVATE_TOKEN'));
  f.write('manifest.json', JSON.stringify(f.manifest())); f.write('source/coordination/board.json', '{PRIVATE_TOKEN');
  assert.equal(await main(['verify', '--manifest', path.join(f.root, 'manifest.json'), '--artifact-root', f.candidate, '--source-root', f.source], { output: value => output.push(value) }), 1);
  assert.equal(JSON.parse(output.at(-1)).error.code, 'INVALID_BOARD'); assert(!output.join('').includes('PRIVATE_TOKEN'));
  throwsCode(() => sourceCoordination('src/Page.tsx', 'hash', { format: 1, tasks: [null] }), 'INVALID_BOARD');
});
