import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { build } from 'esbuild';
import { createBaseApp } from '../server/app.js';
import { KIT_MANIFEST_FILE, mountRelayRehearsal, verifyRelayKit } from '../server/relay-rehearsal-mount.js';
// @ts-expect-error módulo .mjs sin tipos
import { KIT_ROOT_PACKAGES, buildRelayKit, packageClosure } from '../scripts/build-relay-kit.mjs';

// Unidad 254. Paquete del Kit (constructor + verificación por manifiesto) y registro único en el arranque, con createBaseApp real. El ciclo real con el Kit y la App compilada está en tests/e2e/relay-packaged.spec.ts.
const repo = process.cwd(), work = path.join(os.tmpdir(), 'planb-kit254-' + randomUUID().slice(0, 8)), kit = path.join(work, 'kit');
let manifest: { code: Record<string, string>; packages: string[]; nodeModules: { files: number; bytes: number } };
test.before(() => { fs.mkdirSync(work, { recursive: true }); manifest = buildRelayKit({ repo, out: kit }); });
test.after(() => { fs.rmSync(work, { recursive: true, force: true }); });
const edit = (file: string, change: (text: string) => string) => { const full = path.join(kit, file), original = fs.readFileSync(full); fs.writeFileSync(full, change(original.toString('utf8'))); return () => fs.writeFileSync(full, original); };

test('el paquete contiene SOLO lo necesario: código del Kit, cuatro scripts y la clausura de dependencias; ni tests, ni src, ni herramientas, ni datos', () => {
  const top = fs.readdirSync(kit).sort(); assert.deepEqual(top, ['kit-manifest.json', 'node_modules', 'package.json', 'scripts', 'server', 'shared', ...(fs.existsSync(path.join(kit, 'tsconfig.json')) ? ['tsconfig.json'] : [])].sort());
  assert.deepEqual(fs.readdirSync(path.join(kit, 'scripts')).sort(), ['block-external.cjs', 'demo-rescue-room.ts', 'rehearse-rescue-capsule.ts', 'relay-rehearsal-child.ts']);
  assert.equal(fs.existsSync(path.join(kit, 'server', 'team')), false); assert.equal(fs.existsSync(path.join(kit, 'tests')), false); assert.equal(fs.existsSync(path.join(kit, 'src')), false);
  for (const root of KIT_ROOT_PACKAGES) assert.ok(manifest.packages.includes(root), root); for (const dependency of ['esbuild', '@esbuild/' + process.platform + '-' + process.arch]) assert.ok(manifest.packages.some(name => name === dependency || name.endsWith('/' + dependency)), 'dependencia de tsx (también anidada): ' + dependency);
  assert.ok(manifest.nodeModules.bytes < 120 * 1024 * 1024, 'tamaño acotado: ' + manifest.nodeModules.bytes); assert.equal(verifyRelayKit(kit).ok, true);
});

test('la clausura cubre TODAS las importaciones de paquetes de los puntos de entrada del Kit (esbuild sobre el código real) y no arrastra el repositorio', async () => {
  const external = new Set<string>();
  for (const entry of ['scripts/relay-rehearsal-child.ts', 'scripts/demo-rescue-room.ts', 'scripts/rehearse-rescue-capsule.ts']) {
    const result = await build({ entryPoints: [path.join(repo, entry)], bundle: true, write: false, platform: 'node', format: 'esm', packages: 'external', metafile: true, logLevel: 'silent' });
    for (const output of Object.values(result.metafile.outputs)) for (const item of output.imports) if (item.external && !item.path.startsWith('node:')) external.add(item.path.startsWith('@') ? item.path.split('/').slice(0, 2).join('/') : item.path.split('/')[0]!);
  }
  assert.ok(external.size > 0); for (const name of external) assert.ok(manifest.packages.includes(name), 'falta ' + name);
  assert.ok(!packageClosure(repo).some((item: { relative: string }) => /^(vitest|playwright|@playwright|typescript|vite)(\/|$)/.test(item.relative)), 'sin herramientas de desarrollo');
});

test('VERIFICACIÓN por manifiesto: cualquier alteración (archivo cambiado, sobrante, faltante, cargador ausente, dependencias o plataforma distintas) falla cerrada y se restaura sin rastro', () => {
  const restore = edit('server/rescue-capsule.ts', text => text + '\n// alterado'); const changed = verifyRelayKit(kit); restore(); assert.deepEqual([changed.ok, !changed.ok && changed.reason], [false, 'kit-invalid']);
  const extra = path.join(kit, 'server', 'extra-no-declarado.ts'); fs.writeFileSync(extra, 'export {};'); assert.equal(verifyRelayKit(kit).ok, false, 'archivo sobrante'); fs.rmSync(extra);
  const missing = path.join(kit, 'scripts', 'block-external.cjs'), bytes = fs.readFileSync(missing); fs.rmSync(missing); assert.equal(verifyRelayKit(kit).ok, false, 'archivo faltante'); fs.writeFileSync(missing, bytes);
  const loader = path.join(kit, 'node_modules', 'tsx', 'package.json'), loaderBytes = fs.readFileSync(loader); fs.writeFileSync(loader, loaderBytes.toString('utf8') + ' '); assert.equal(verifyRelayKit(kit).ok, false, 'dependencia alterada (tamaño)'); fs.writeFileSync(loader, loaderBytes);
  const manifestPath = path.join(kit, KIT_MANIFEST_FILE), original = fs.readFileSync(manifestPath, 'utf8');
  fs.writeFileSync(manifestPath, JSON.stringify({ ...JSON.parse(original), platform: 'plataforma-ajena' })); const other = verifyRelayKit(kit); assert.deepEqual([other.ok, !other.ok && other.reason], [false, 'platform-mismatch']);
  fs.writeFileSync(manifestPath, '{ no es json'); assert.equal((verifyRelayKit(kit) as { reason: string }).reason, 'kit-invalid'); fs.writeFileSync(manifestPath, original);
  assert.equal(verifyRelayKit(kit).ok, true, 'restaurado'); assert.equal((verifyRelayKit(path.join(work, 'no-existe')) as { reason: string }).reason, 'no-kit');
});

async function app() {
  const created = await createBaseApp({ dbPath: path.join(work, 'data-' + randomUUID().slice(0, 6), 'planb.sqlite'), root: repo, staticDir: 'none' });
  return created;
}
const headers = (extra: Record<string, string> = {}) => ({ host: '127.0.0.1:4701', origin: 'http://127.0.0.1:4701', ...extra });
async function session(base: Awaited<ReturnType<typeof app>>) { const reply = await base.app.inject({ method: 'POST', url: '/api/v2/auth/setup', headers: headers(), payload: { password: 'contraseña-ficticia-254' } }); assert.equal(reply.statusCode, 200); return String(reply.headers['set-cookie']).split(';')[0]!; }

test('REGISTRO: sin paquete NO se registra nada (404 verdadero); con paquete válido se registra UNA vez, hereda sesión, Host y Origin, y el estado inicial no ejecuta nada', async t => {
  const none = await app(); t.after(() => none.app.close());
  const logs: string[] = [], missing = mountRelayRehearsal(none.app, none.store, none.security, { kitRoot: path.join(work, 'sin-paquete'), log: message => logs.push(message) });
  assert.deepEqual([missing.mounted, !missing.mounted && missing.reason], [false, 'no-kit']); assert.match(logs[0]!, /no disponible/);
  const cookieNone = await session(none); assert.equal((await none.app.inject({ url: '/api/v2/relay/rehearsal', headers: headers({ cookie: cookieNone }) })).statusCode, 404, 'ruta no registrada');

  const ok = await app(); t.after(() => ok.app.close());
  const first = mountRelayRehearsal(ok.app, ok.store, ok.security, { kitRoot: kit, log: () => undefined }); assert.equal(first.mounted, true); assert.equal(mountRelayRehearsal(ok.app, ok.store, ok.security, { kitRoot: kit }), first, 'segunda llamada: mismo resultado, sin registrar otra vez');
  const cookie = await session(ok); const state = await ok.app.inject({ url: '/api/v2/relay/rehearsal', headers: headers({ cookie }) }); assert.equal(state.statusCode, 200);
  assert.deepEqual([state.json().last, state.json().running, state.json().stopping ?? null, state.json().scope.exportsActiveSpace], [null, null, null, false]);
  assert.equal((await ok.app.inject({ method: 'POST', url: '/api/v2/relay/rehearsal', headers: headers(), payload: { fiction: true } })).statusCode, 401, 'sin sesión no se ejecuta');
  assert.equal((await ok.app.inject({ method: 'POST', url: '/api/v2/relay/rehearsal', headers: { host: '127.0.0.1:4701', origin: 'http://evil.example', cookie }, payload: { fiction: true } })).statusCode >= 400, true, 'Origin ajeno rechazado');
  assert.equal((await ok.app.inject({ method: 'POST', url: '/api/v2/relay/rehearsal', headers: headers({ cookie }), payload: { fiction: false } })).statusCode, 422, 'sin consentimiento de ficción no se ejecuta');
  assert.equal(first.mounted && first.handle.occupied(), false); assert.equal(first.mounted && first.executor.active(), 0);
});

test('FALLO CERRADO del montaje: raíz relativa, paquete alterado y raíz de datos hacia el código no registran el ensayo ni dejan procesos', async t => {
  const base = await app(); t.after(() => base.app.close()); const cookie = await session(base);
  const relative = mountRelayRehearsal(base.app, base.store, base.security, { kitRoot: 'kit', log: () => undefined }); assert.deepEqual([relative.mounted, !relative.mounted && relative.reason], [false, 'setup-failed']);
  const other = await app(); t.after(() => other.app.close()); const restore = edit('shared/model.ts', text => text + '\n// alterado');
  try { const tampered = mountRelayRehearsal(other.app, other.store, other.security, { kitRoot: kit, log: () => undefined }); assert.deepEqual([tampered.mounted, !tampered.mounted && tampered.reason], [false, 'kit-invalid']); } finally { restore(); }
  const third = await app(); t.after(() => third.app.close());
  const inCode = mountRelayRehearsal(third.app, third.store, third.security, { kitRoot: kit, installRoot: path.join(kit, 'server'), log: () => undefined }); assert.deepEqual([inCode.mounted, !inCode.mounted && inCode.reason], [false, 'setup-failed']);
  for (const instance of [base, other, third]) assert.equal((await instance.app.inject({ url: '/api/v2/relay/rehearsal', headers: headers({ cookie: instance === base ? cookie : await session(instance) }) })).statusCode, 404);
});

test('contrato estático: usa la autorización original, raíz de la instalación y paquete verificado; sin tests/.tmp, sin cwd del servidor y sin leer secretos', () => {
  const text = fs.readFileSync('server/relay-rehearsal-mount.ts', 'utf8').replace(/\/\/.*$/gm, '');
  assert.match(text, /captureAuthorization: security\.captureAuthorization/); assert.match(text, /run: executor\.run/); assert.match(text, /dirname\(store\.filename\)/);
  assert.ok(!/tests['"\/\\]|\.tmp|process\.cwd\(|\.env\.local|token|password|credential/i.test(text), 'sin rutas de pruebas ni cwd ni credenciales');
});

// ── R2 (dictamen independiente 268): integridad por contenido, uniones y dependencias obligatorias ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
const linkKind = process.platform === 'win32' ? 'junction' : 'dir';
const reasonOf = (check: ReturnType<typeof verifyRelayKit>) => check.ok ? 'ok' : check.reason;
test('R2·1 CONTENIDO: un cambio del MISMO tamaño en una dependencia (tsx/package.json) deja el paquete sin registrar; un manifiesto de la versión anterior se rechaza de forma explícita y pide reconstruir', () => {
  const file = path.join(kit, 'node_modules', 'tsx', 'package.json'), original = fs.readFileSync(file), altered = Buffer.from(original);
  const at = altered.findIndex(byte => byte >= 0x61 && byte <= 0x7a); altered[at] = altered[at] === 0x61 ? 0x62 : 0x61; assert.equal(altered.length, original.length);
  fs.writeFileSync(file, altered); const tampered = verifyRelayKit(kit); fs.writeFileSync(file, original);
  assert.deepEqual([tampered.ok, !tampered.ok && tampered.reason], [false, 'kit-invalid']); assert.match(!tampered.ok ? tampered.detail : '', /dependencias/i); assert.equal(verifyRelayKit(kit).ok, true, 'restaurado');
  const manifestPath = path.join(kit, KIT_MANIFEST_FILE), current = fs.readFileSync(manifestPath, 'utf8'), old = { ...JSON.parse(current), format: 'planb-relay-kit-v1' };
  fs.writeFileSync(manifestPath, JSON.stringify(old)); const stale = verifyRelayKit(kit); fs.writeFileSync(manifestPath, current);
  assert.deepEqual([stale.ok, !stale.ok && stale.reason], [false, 'kit-invalid']); assert.match(!stale.ok ? stale.detail : '', /versión anterior.*reconstruy/i);
});
test('R2·2 UNIONES Y TIPOS: la propia raíz, cada carpeta de primer nivel y cualquier descendiente que sea unión se rechazan aunque el contenido sea idéntico; solo archivos regulares y el conjunto esperado', () => {
  const view = path.join(work, 'vista-' + randomUUID().slice(0, 6)); fs.mkdirSync(view);
  for (const name of ['package.json', KIT_MANIFEST_FILE, ...(fs.existsSync(path.join(kit, 'tsconfig.json')) ? ['tsconfig.json'] : [])]) fs.copyFileSync(path.join(kit, name), path.join(view, name));
  for (const dir of ['server', 'shared', 'scripts']) fs.cpSync(path.join(kit, dir), path.join(view, dir), { recursive: true });
  fs.symlinkSync(path.join(kit, 'node_modules'), path.join(view, 'node_modules'), linkKind);
  assert.equal(reasonOf(verifyRelayKit(view)), 'kit-invalid', 'node_modules es una unión con contenido idéntico');
  fs.rmSync(path.join(view, 'node_modules'), { force: true }); fs.cpSync(path.join(kit, 'node_modules'), path.join(view, 'node_modules'), { recursive: true }); assert.equal(verifyRelayKit(view).ok, true, 'la vista real es válida');
  for (const dir of ['server', 'shared', 'scripts']) { const real = path.join(work, 'real-' + dir + '-' + randomUUID().slice(0, 4)); fs.renameSync(path.join(view, dir), real); fs.symlinkSync(real, path.join(view, dir), linkKind); assert.equal(reasonOf(verifyRelayKit(view)), 'kit-invalid', dir + ' es una unión'); fs.rmSync(path.join(view, dir), { force: true }); fs.renameSync(real, path.join(view, dir)); }
  const nested = path.join(view, 'server', 'subvista'); fs.symlinkSync(path.join(view, 'shared'), nested, linkKind); assert.equal(reasonOf(verifyRelayKit(view)), 'kit-invalid', 'descendiente que es unión'); fs.rmSync(nested, { force: true }); assert.equal(verifyRelayKit(view).ok, true);
  const alias = path.join(work, 'raiz-alias-' + randomUUID().slice(0, 4)); fs.symlinkSync(view, alias, linkKind); assert.equal(reasonOf(verifyRelayKit(alias)), 'kit-invalid', 'la propia raíz es una unión'); fs.rmSync(alias, { force: true });
  fs.writeFileSync(path.join(view, 'sobrante.txt'), 'x'); assert.equal(reasonOf(verifyRelayKit(view)), 'kit-invalid', 'entrada de primer nivel no esperada'); fs.rmSync(path.join(view, 'sobrante.txt'));
  const pkg = path.join(view, 'package.json'), bytes = fs.readFileSync(pkg); fs.rmSync(pkg); fs.mkdirSync(pkg); assert.equal(reasonOf(verifyRelayKit(view)), 'kit-invalid', 'un directorio donde debe haber un archivo regular'); fs.rmdirSync(pkg); fs.writeFileSync(pkg, bytes);
  const loaderMain = path.join(view, 'node_modules', 'tsx', 'dist'); const entries = fs.readdirSync(loaderMain); assert.ok(entries.length > 0); const victim = path.join(loaderMain, entries.find(name => fs.statSync(path.join(loaderMain, name)).isFile())!), saved = fs.readFileSync(victim); fs.rmSync(victim); assert.equal(reasonOf(verifyRelayKit(view)), 'kit-invalid', 'cargador incompleto'); fs.writeFileSync(victim, saved);
  const script = path.join(view, 'scripts', 'relay-rehearsal-child.ts'), scriptBytes = fs.readFileSync(script); fs.rmSync(script); assert.equal(reasonOf(verifyRelayKit(view)), 'kit-invalid', 'script de entrada ausente'); fs.writeFileSync(script, scriptBytes); assert.equal(verifyRelayKit(view).ok, true);
});
function syntheticRepo(setup: (modules: string) => void) {
  const repoDir = path.join(work, 'repo-' + randomUUID().slice(0, 6)); fs.mkdirSync(path.join(repoDir, 'server'), { recursive: true }); fs.mkdirSync(path.join(repoDir, 'shared')); fs.mkdirSync(path.join(repoDir, 'scripts')); fs.writeFileSync(path.join(repoDir, 'package.json'), '{}');
  for (const file of ['relay-rehearsal-child.ts', 'rehearse-rescue-capsule.ts', 'demo-rescue-room.ts', 'block-external.cjs']) fs.writeFileSync(path.join(repoDir, 'scripts', file), '// sintético');
  fs.writeFileSync(path.join(repoDir, 'server', 'a.ts'), 'export {};'); fs.writeFileSync(path.join(repoDir, 'shared', 'b.ts'), 'export {};'); const modules = path.join(repoDir, 'node_modules'); fs.mkdirSync(modules); setup(modules); return repoDir;
}
const addPackage = (modules: string, name: string, manifest: Record<string, unknown> = {}) => { const dir = path.join(modules, ...name.split('/')); fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name, version: '1.0.0', ...manifest })); fs.writeFileSync(path.join(dir, 'index.js'), 'module.exports = 1;'); };
test('R2·3 OBLIGATORIAS Y OPCIONALES: una dependencia obligatoria ausente, o resuelta fuera del árbol que se copia, impide publicar el manifiesto; una opcional (de otra plataforma) puede faltar', () => {
  const missingMandatory = syntheticRepo(modules => { addPackage(modules, 'a', { dependencies: { b: '1.0.0' } }); });
  assert.throws(() => packageClosure(missingMandatory, ['a']), /obligatoria.*b/i);
  const out1 = path.join(work, 'out-' + randomUUID().slice(0, 6)); assert.throws(() => buildRelayKit({ repo: missingMandatory, out: out1, roots: ['a'] }), /obligatoria.*b/i); assert.equal(fs.existsSync(path.join(out1, KIT_MANIFEST_FILE)), false, 'sin manifiesto de éxito'); assert.equal(fs.existsSync(out1), false, 'no queda una carpeta a medias');
  const optionalMissing = syntheticRepo(modules => { addPackage(modules, 'a', { dependencies: { b: '1.0.0' }, optionalDependencies: { '@plataforma/ajena-x64': '1.0.0' } }); addPackage(modules, 'b'); });
  const out2 = path.join(work, 'out-' + randomUUID().slice(0, 6)), built = buildRelayKit({ repo: optionalMissing, out: out2, roots: ['a'] }); assert.deepEqual([...built.packages].sort(), ['a', 'b']); assert.deepEqual(built.optionalMissing, ['@plataforma/ajena-x64']); assert.equal(fs.existsSync(path.join(out2, KIT_MANIFEST_FILE)), true);
  const outside = path.join(work, 'fuera-' + randomUUID().slice(0, 6)); fs.mkdirSync(outside); const external = path.join(outside, 'b'); fs.mkdirSync(external); fs.writeFileSync(path.join(external, 'package.json'), JSON.stringify({ name: 'b', version: '1.0.0' }));
  const linked = syntheticRepo(modules => { addPackage(modules, 'a', { dependencies: { b: '1.0.0' } }); fs.symlinkSync(external, path.join(modules, 'b'), linkKind); });
  assert.throws(() => packageClosure(linked, ['a']), /fuera del árbol|obligatoria/i); const out3 = path.join(work, 'out-' + randomUUID().slice(0, 6)); assert.throws(() => buildRelayKit({ repo: linked, out: out3, roots: ['a'] }), /fuera del árbol|obligatoria/i); assert.equal(fs.existsSync(path.join(out3, KIT_MANIFEST_FILE)), false);
  const real = packageClosure(repo); assert.ok(real.length > 50, 'la clausura real sigue completa');
});
