import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// QA052 · REL046 (+ QA056 · F2/F3): ataque mecánico a scripts/prepare-release-candidate.mjs.
// Se copia la herramienta EXACTA a un workspace sintético (tests/.tmp/qa056/ws-*). Ese workspace es mecánico: no es Plan B,
// sus "pruebas de negocio" están vacías y NO demuestran nada sobre la app; solo ejercitan rutas, activos, entorno, límites y manifiesto.
// QA056_SCRIPT (o QA052_SCRIPT) permite apuntar a otra copia del script: la versión anterior (baseline QA052, bd3d8388…) para demostrar
// que F2/F3 fallan por su causa, o una copia mutada (solo sensibilidad). Sin esa variable se prueba la fuente presentada.
//
// CAMBIOS DE EXPECTATIVA respecto a QA052 (cada uno justificado en coordination/reviews/CLAUDE-QA-056.md):
//   · REVIEWED_SHA: bd3d8388… → 34886dad… (versión corregida presentada por REL046/ASSETS057; cotejada byte a byte antes de cambiarla).
//   · 2b: «la lista negra retira lo que nombra y QA052_BENIGN se hereda» → «lista permitida: ningún canario arbitrario llega a ningún hijo».
//   · F2: «un activo no cubierto desaparece sin aviso» (fallo intencionado) → «todo archivo público admisible se captura; lo excluido se declara».
// CAMBIOS DE EXPECTATIVA de QA086 (justificados en coordination/reviews/CLAUDE-QA-086.md):
//   · REVIEWED_SHA: 34886dad… → b026f0dd… (SNAPSHOT084/REL046R3; cotejado con el informe de Codex y leído entero antes de cambiarlo).
//   · O1: «las fuentes con extensión no listada quedan fuera SIN declararse» (caracterización) → tres oráculos positivos: sourceSelection con motivo por exclusión y
//     repositoryImage:false, bloqueos SOURCE_AUXILIARY_EXCLUDED solo para auxiliares de código, y herramientas (tools/) capturadas byte a byte.
//   · F2/F3 y el resto de oráculos se conservan sin cambios.
// CAMBIOS DE EXPECTATIVA de QA086 R2 (devolución 088; justificados en coordination/reviews/CLAUDE-QA-086.md):
//   · REVIEWED_SHA: b026f0dd… → ae74ce22… (SOURCE-CASE089/REL046 final: la clasificación de exclusiones usa entry.name.toLowerCase(); cotejado con
//     CODEX-SOURCE-CASE-089 y leído entero antes de cambiarlo). b026f0dd… sigue identificado en modo alternativo.
//   · Ningún oráculo de este banco dependía de la capitalización de nombres excluidos: F2/F3/O1 se conservan sin cambios (O2 vive en independent-source-selection.test.mjs).
// REL046 (raíz pública enlazada): se cotejó la versión 97197656… con el tablón y con la copia ae74ce22….
// El único cambio del constructor es comprobar la raíz con lstat antes de decidir si está ausente.
const REPO = fs.realpathSync(path.resolve(fileURLToPath(new URL('..', import.meta.url))));
const REVIEWED_SHA = '9719765673729c44cad2318969995d22e5506d968ab4e2efe586d46a0b292731';
const HISTORICAL_VERSIONS = new Map([
  ['ae74ce22ea6a2ed14cc78f1b5735c763b937aa1a7199f9875764eba9a0ef2935', 'SOURCE-CASE089 ae74ce22…, previa a la corrección de la raíz enlazada'],
  ['b026f0ddd9f0ad729ff7eba8c2d1f1bd4fbd0e467695c9c566407ed90ebb5b2b', 'SNAPSHOT084 b026f0dd…, previa a SOURCE-CASE089'],
  ['34886dad490f3fafbf0f61c9c03c049dcf0b00fcff830002aec6ea308eb05778', 'QA056 34886dad…, previa a SNAPSHOT084'],
  ['bd3d83880bb20d2356b3beab528db0f0685879266c6232673f7450f0dceb8d88', 'QA052 bd3d8388…'],
]);
const OVERRIDE = process.env.QA056_SCRIPT ?? process.env.QA052_SCRIPT;
const SCRIPT = OVERRIDE ? path.resolve(OVERRIDE) : path.join(REPO, 'scripts', 'prepare-release-candidate.mjs');
const MUTATED = !!OVERRIDE;
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const BASE = path.join(REPO, 'tests', '.tmp', 'qa056');
const WORK = fs.mkdtempSync(path.join((fs.mkdirSync(BASE, { recursive: true }), BASE), 'ws-'));
test.after(() => { if (!process.env.QA056_KEEP) fs.rmSync(WORK, { recursive: true, force: true }); }); // QA056_KEEP=1 conserva los workspaces para depurar

let linkOk = true;
const ENTRIES = ['server/main.ts', 'server/runtime.ts', 'server/drill-worker.ts'];
const BUNDLES = ['server.mjs', 'runtime.mjs', 'drill.mjs'];
const TESTS = ['continuity-lab', 'response-queue', 'response-queue-api', 'capture-comparison', 'capture-comparison-api', 'recovery-preflight', 'recovery-preflight-cli', 'ui-journeys', 'design-tokens'];
// Nombres inventados solo para los hijos; ningún valor real y ninguno se imprime. QA052 distinguía «lista negra» de «resto»; con la lista permitida
// todos deben desaparecer, así que ya no se separan: credenciales por forma, inocuos, nombres de sistema operativo y variantes de mayúsculas.
const CANARY_CREDENTIAL = ['QA056_API_KEY', 'QA056_TOKEN', 'QA056_SECRET', 'QA056_PASSWORD', 'QA056_PASSPHRASE', 'QA056_PRIVATE_KEY', 'QA056_CREDENTIALS', 'QA056_COOKIE', 'QA056_AUTH_HEADER', 'QA056_ACCESS_KEY', 'QA056_BEARER', 'HUBSPOT_QA056', 'OPENAI_QA056', 'ANTHROPIC_QA056', 'AZURE_QA056', 'AWS_QA056', 'FIREBASE_QA056', 'GOOGLE_QA056', 'PGHOST_QA056', 'PLANB_QA056', 'DATABASE_URL_QA056', 'qa056_lowercase_secret'];
const CANARY_BENIGN = ['QA056_BENIGN', 'QA056_COLOR', 'QA056_MiXeD_Case', 'QA056_EMPTY'];
const CANARY_OS = ['HOME', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA', 'USERNAME', 'COMPUTERNAME', 'SSH_AUTH_SOCK', 'GIT_ASKPASS', 'HTTP_PROXY', 'HTTPS_PROXY', 'NO_PROXY', 'NODE_PATH', 'NODE_OPTIONS'];
const CANARIES = [...CANARY_CREDENTIAL, ...CANARY_BENIGN, ...CANARY_OS];
const CANARY_MARK = 'valor-inventado-';
// SUELO DE LA PLATAFORMA (medido, no supuesto): en este Windows un hijo node recibe del padre ciertas variables aunque se lance con env:{} (p. ej. USERNAME y
// USERPROFILE con el valor ACTUAL del padre, más HOMEDRIVE/HOMEPATH/LOGONSERVER/SYSTEMDRIVE/USERDOMAIN/WINDIR/TEMP). Ninguna lista de la herramienta puede evitarlo.
// Para no atribuir a la herramienta lo que hace la plataforma, la prueba calcula ese suelo con un hijo de control sin lista alguna y exige que la
// herramienta no deje pasar NADA más: la fuga se decide por VALOR (un valor canario visible en un hijo), no por la mera presencia de un nombre.
function platformFloor() {
  const probe = "const { spawnSync } = require('node:child_process'); const r = spawnSync(process.execPath, ['-e', " + JSON.stringify("const e = process.env; console.log(JSON.stringify({ keys: Object.keys(e).map(k => k.toLowerCase()).sort(), leaked: Object.keys(e).filter(k => String(e[k]).startsWith('" + CANARY_MARK + "')).map(k => k.toLowerCase()).sort() }))") + "], { env: {}, encoding: 'utf8' }); process.stdout.write(r.stdout);";
  const run = spawnSync(process.execPath, ['-e', probe], { env: { ...ENV_BASE(), ...canaryEnv() }, encoding: 'utf8', windowsHide: true });
  const parsed = JSON.parse(run.stdout || '{"keys":[],"leaked":[]}'); return { keys: new Set(parsed.keys), leaked: new Set(parsed.leaked) };
}
// Variables que el encargo exige conservar (ejecutables, raíz del sistema y temporales) y que este arnés aporta o fija con valor propio.
const KEEP = ['PATH', 'SystemRoot', 'TEMP', 'TMP'];
const ALLOWED_LOWER = new Set(['path', 'systemroot', 'windir', 'comspec', 'pathext', 'temp', 'tmp', 'tmpdir', 'lang', 'lc_all', 'lc_ctype', 'tz', 'processor_architecture', 'number_of_processors']);
// Claves adicionales que NO son ambiente heredado: la herramienta fija PLANB_UI_SRC a propósito para node-integration y node:test marca a sus hijos.
const EXPECTED_EXTRA = new Set(['planb_ui_src', 'node_test_context']);
const bytesFor = (seed, length) => { const out = Buffer.alloc(length); let a = seed; for (let i = 0; i < length; i++) { a = (Math.imul(a, 1103515245) + 12345) >>> 0; out[i] = a >>> 24; } out[0] = 0; return out; };

const PUBLIC_COVERED = { 'public/logo.png': bytesFor(1, 3000), 'public/data/sources.json': Buffer.from('{"ok":true}\n'), 'public/fonts/f.woff2': bytesFor(2, 1500), 'public/icons/a.svg': Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'), 'public/favicon.ico': bytesFor(3, 700) };
// Extensiones que la lista de QA052 no cubría, mayúsculas, sin extensión, vacío, nombre con espacio y no ASCII (Windows no distingue mayúsculas).
const PUBLIC_UNCOVERED = {
  'public/anim.gif': bytesFor(4, 900), 'public/LOGO-GRANDE.PNG': bytesFor(5, 900), 'public/site.webmanifest': Buffer.from('{"name":"mec"}'), 'public/robots.txt': Buffer.from('User-agent: *\n'),
  'public/doc.pdf': bytesFor(6, 800), 'public/lib/app.wasm': bytesFor(7, 600), 'public/NOEXT': bytesFor(8, 400), 'public/archivo.xyz123': bytesFor(9, 300), 'public/UPPER.HTML': Buffer.from('<p>mayúsculas</p>\n'),
  'public/sub/Mixed.JSON': Buffer.from('{"a":1}'), 'public/sub/visible.txt': Buffer.from('visible\n'), 'public/vacio.bin': Buffer.alloc(0), 'public/con espacio ñ.dat': bytesFor(10, 200),
};
// Rutas públicas que la herramienta NO captura (oculta, nombre de salida/dependencias): deben declararse, no desaparecer. Su contenido lleva un canario.
const HIDDEN_CANARY = 'QA056-OCULTO-CANARIO-0001';
const PUBLIC_HIDDEN = { 'public/.secreto.json': '{"c":"' + HIDDEN_CANARY + '"}', 'public/.well-known/security.txt': HIDDEN_CANARY, 'public/build/app.js': 'export default "' + HIDDEN_CANARY + '";', 'public/dist': HIDDEN_CANARY, 'public/node_modules/x.js': HIDDEN_CANARY, 'public/sub/.oculto': HIDDEN_CANARY };
const HIDDEN_EXPECTED = ['public/.secreto.json', 'public/.well-known/', 'public/build/', 'public/dist', 'public/node_modules/', 'public/sub/.oculto'].sort();

// Observador de entorno: SOLO se añade a la copia del guardián del workspace (lo carga cada hijo node con --require). Anota nombres de variables
// en minúsculas y un hash corto de los valores conservados; jamás valores de canarios. El prefijo es la copia exacta del guardián real (se comprueba en la prueba 0).
const OBSERVER = `
;(function qa056EnvObserver() {
  try {
    const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
    const logs = path.join(__dirname, '..', '..', 'logs');
    if (!fs.existsSync(logs)) return;
    const values = {};
    for (const key of ${JSON.stringify(KEEP)}) { const real = Object.keys(process.env).find(k => k.toLowerCase() === key.toLowerCase()); values[key] = real ? crypto.createHash('sha256').update(process.env[real]).digest('hex').slice(0, 16) : null; }
    // «leaked»: nombres cuyo VALOR es un canario del arnés (detección por valor, independiente de que el nombre estuviera previsto). Nunca se anota el valor.
    const leaked = Object.keys(process.env).filter(k => String(process.env[k]).startsWith(${JSON.stringify(CANARY_MARK)})).map(k => k.toLowerCase()).sort();
    fs.appendFileSync(path.join(logs, 'qa056-env.jsonl'), JSON.stringify({ script: path.basename(process.argv[1] || ''), first: String(process.argv[2] || ''), keys: Object.keys(process.env).map(k => k.toLowerCase()).sort(), leaked, values }) + '\\n');
  } catch { /* observación best-effort */ }
})();
`;

function write(root, relative, content) { const file = path.join(root, relative); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, content); }
function makeWorkspace(name, options = {}) {
  const root = path.join(WORK, name); fs.mkdirSync(root, { recursive: true });
  write(root, 'scripts/prepare-release-candidate.mjs', fs.readFileSync(SCRIPT));
  write(root, 'scripts/block-external.cjs', fs.readFileSync(path.join(REPO, 'scripts', 'block-external.cjs'), 'utf8') + OBSERVER);
  write(root, 'tools/coordination/core.mjs', fs.readFileSync(path.join(REPO, 'tools', 'coordination', 'core.mjs')));
  try { fs.symlinkSync(path.join(REPO, 'node_modules'), path.join(root, 'node_modules'), 'junction'); } catch { linkOk = false; }
  write(root, 'package.json', '{"name":"mecanico","private":true,"type":"module"}\n');
  write(root, 'tsconfig.json', JSON.stringify({ compilerOptions: { target: 'ES2023', lib: ['ES2023', 'DOM'], module: 'ESNext', moduleResolution: 'Bundler', strict: true, noEmit: true, skipLibCheck: true, allowImportingTsExtensions: true, types: ['node'] }, include: ['src', 'server', 'shared', 'scripts', 'tests', '*.ts'] }));
  write(root, 'vite.config.ts', 'export default ' + JSON.stringify({ build: { outDir: 'dist' }, ...(options.publicDir === false ? { publicDir: false } : {}) }) + ';\n');
  write(root, 'playwright.config.ts', 'export default {};\n');
  write(root, 'index.html', '<!doctype html><html><body><script type="module" src="/src/main.ts"></script></body></html>\n');
  write(root, 'src/main.ts', "export const titulo: string = 'mecanico';\ndocument.title = titulo;\n");
  write(root, 'src/a-first.ts', 'export const a = 1;\n'); write(root, 'src/z-last.ts', 'export const z = 1;\n');
  write(root, 'shared/m.ts', 'export const m = 1;\n');
  for (const entry of ENTRIES) write(root, entry, 'export const entry = ' + JSON.stringify(entry) + ';\n');
  // La prueba de «ui-journeys» imprime la presencia de cada canario en el proceso de pruebas (tercer nivel: nieto del script).
  for (const t of TESTS) write(root, 'tests/' + t + '.test.ts', t === 'ui-journeys' && options.failTests
    ? "import test from 'node:test'; test('falla mecánica', () => { throw new Error('fallo mecánico'); });\n"
    : t === 'ui-journeys' ? "import test from 'node:test';\ntest('entorno', () => { for (const n of " + JSON.stringify([...CANARIES, 'TZ', 'LANG']) + ") { const v = process.env[n]; console.log('ENV:' + n + '=' + (v === undefined ? 'absent' : String(v).startsWith('" + CANARY_MARK + "') ? 'canary' : 'other')); } });\n"
      : "import test from 'node:test'; test('mecánico', () => {});\n");
  if (options.typeError) write(root, 'src/bad.ts', "export const x: number = 'no es un número';\n");
  for (const [relative, content] of Object.entries({ ...PUBLIC_COVERED, ...(options.uncovered ? PUBLIC_UNCOVERED : {}), ...(options.hidden === false ? {} : PUBLIC_HIDDEN) })) write(root, relative, content);
  // Exclusiones por nombre en el resto de raíces (código) y fuentes no listadas por extensión (caracterización O1).
  for (const relative of ['src/.oculto.ts', 'outputs/salida.ts', 'tests/.tmp/viejo.ts', 'tests/test-results/r.ts', 'scripts/.env.ts', 'src/dist/generado.ts', 'src/build/legitimo.ts']) write(root, relative, 'export const excluido = 1;\n');
  if (options.unlisted) for (const relative of ['src/datos.json', 'server/esquema.sql', 'scripts/herramienta.ps1', 'shared/NOTAS.MD']) write(root, relative, 'contenido no listado\n');
  write(root, 'coordination/board.json', JSON.stringify({ format: 1, revision: 7, updatedAt: null, events: [], tasks: [
    { id: 'MEC-REVIEW', agent: 'codex', title: 't', plan: 'p', acceptance: 'a', files: ['src/main.ts'], readFiles: [], dependencies: [], status: 'review', reserved: true },
    { id: 'MEC-WORKING', agent: 'claude', title: 't', plan: 'p', acceptance: 'a', files: ['server/main.ts', 'tests/ui-journeys.test.ts'], readFiles: [], dependencies: [], status: 'working', reserved: true },
    { id: 'MEC-DONE', agent: 'codex', title: 't', plan: 'p', acceptance: 'a', files: ['shared/m.ts'], readFiles: [], dependencies: [], status: 'done', reserved: false },
  ] }));
  return root;
}
// Entorno del PROCESO PADRE (el script): PATH/SystemRoot/temporales reales, algunos nombres permitidos con valor propio y todos los canarios.
const ENV_BASE = () => {
  const env = {}; for (const key of [...KEEP, 'ComSpec', 'PATHEXT', 'windir']) if (process.env[key]) env[key] = process.env[key];
  env.TZ = 'UTC'; env.LANG = 'C.UTF-8'; return env;
};
const canaryEnv = () => Object.fromEntries(CANARIES.map(name => [name, name === 'QA056_EMPTY' ? '' : name === 'NODE_OPTIONS' ? '--max-old-space-size=512' : CANARY_MARK + name]));
function prepare(root, args = ['--prepare'], { env = {}, hook, hookEnv = {}, timeout = 280_000 } = {}) {
  const nodeArgs = hook ? ['--require', hook] : [];
  const run = spawnSync(process.execPath, [...nodeArgs, path.join(root, 'scripts', 'prepare-release-candidate.mjs'), ...args], { cwd: root, env: { ...ENV_BASE(), ...env, ...hookEnv }, encoding: 'utf8', timeout, windowsHide: true, maxBuffer: 32 * 1024 * 1024 });
  const folder = /Candidata: (.+)/.exec(run.stdout ?? '')?.[1]?.trim() ?? null;
  const manifest = folder && fs.existsSync(path.join(folder, 'manifest.json')) ? JSON.parse(fs.readFileSync(path.join(folder, 'manifest.json'), 'utf8')) : null;
  return { code: run.status, out: run.stdout ?? '', err: run.stderr ?? '', folder, manifest };
}
const candidates = root => { const dir = path.join(root, 'tests', '.tmp', 'release-candidates'); return fs.existsSync(dir) ? fs.readdirSync(dir).sort() : []; };
function tree(dir, base = dir, out = {}) { for (const entry of fs.readdirSync(dir, { withFileTypes: true })) { const full = path.join(dir, entry.name); if (entry.isDirectory()) tree(full, base, out); else out[path.relative(base, full).replaceAll('\\', '/')] = sha(fs.readFileSync(full)); } return out; }
const observations = folder => { const file = path.join(folder, 'logs', 'qa056-env.jsonl'); return fs.existsSync(file) ? fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map(line => JSON.parse(line)) : []; };
const SELF = Object.keys(PUBLIC_COVERED).length + Object.keys(PUBLIC_UNCOVERED).length;

test('0 · la herramienta probada es exactamente la presentada y el arnés mecánico es un workspace propio', t => {
  const root = makeWorkspace('hash');
  const copied = sha(fs.readFileSync(path.join(root, 'scripts', 'prepare-release-candidate.mjs')));
  assert.equal(copied, sha(fs.readFileSync(SCRIPT)), 'el arnés copia byte a byte el constructor seleccionado');
  if (MUTATED) {
    const historical = HISTORICAL_VERSIONS.get(copied);
    t.diagnostic(historical ? 'MODO ALTERNATIVO: versión histórica ' + historical : 'MODO ALTERNATIVO: SHA-256 ' + copied);
  } else {
    assert.equal(copied, REVIEWED_SHA, 'huella exacta de REL046 con la corrección de la raíz enlazada');
  }
  assert.ok(fs.existsSync(path.join(root, 'node_modules')), 'node_modules local enlazado (solo lectura): sin instalaciones ni versiones nuevas');
  assert.notEqual(fs.realpathSync(root), REPO, 'el workspace no es el repositorio');
  const real = fs.readFileSync(path.join(REPO, 'scripts', 'block-external.cjs'), 'utf8'), copy = fs.readFileSync(path.join(root, 'scripts', 'block-external.cjs'), 'utf8');
  assert.ok(copy.startsWith(real) && copy.slice(real.length) === OBSERVER, 'el guardián del workspace = el real + el observador de entorno (única diferencia, solo lectura de nombres)');
});

test('1 · sin --prepare solo ayuda; argumentos no admitidos no crean candidata', () => {
  const root = makeWorkspace('args');
  for (const args of [[], ['--help']]) { const run = prepare(root, args); assert.equal(run.code, 0); assert.match(run.out, /Sin --prepare solo muestra ayuda/); assert.equal(run.folder, null); }
  for (const args of [['--prepare', '--help'], ['--prepare', 'extra'], ['prepare'], ['--PREPARE'], ['-p'], ['--prepare=1'], ['--help', '--prepare']]) {
    const run = prepare(root, args); assert.equal(run.code, 2, args.join(' ')); assert.match(run.err, /Argumentos no admitidos/); assert.equal(run.folder, null);
  }
  assert.deepEqual(candidates(root), [], 'ninguna ejecución sin --prepare exacto crea una carpeta de candidata');
  assert.ok(!fs.existsSync(path.join(root, 'tests', '.tmp', 'release-candidates')), 'ni siquiera el directorio base');
});

// ------------------------------------------------------------------ ejecución completa mecánica (compartida)
let happy;
test('2 · candidata mecánica completa: carpeta nueva por ejecución, hashes, exclusiones, activos y estado honesto', { timeout: 600_000 }, t => {
  if (!linkOk) return t.skip('no se pudo crear el enlace local a node_modules (límite de entorno)');
  const root = makeWorkspace('happy', { uncovered: true, unlisted: true });
  const first = prepare(root, ['--prepare'], { env: canaryEnv() });
  assert.equal(first.code, 0, 'FALLO DE PREPARACIÓN/ARNÉS (no atribuible a un activo omitido): ' + first.err + first.out.slice(-400)); const m = first.manifest;
  happy = { root, first, m };
  assert.equal(m.format, 'planb-candidate-v1'); assert.equal(m.state, 'compiled-and-node-verified');
  assert.deepEqual([m.approved, m.deployed, m.releaseEligible], [false, false, false], 'un build verde no activa approved/deployed/releaseEligible');
  assert.equal(m.snapshotStable, true); assert.equal(m.liveSourcesStillMatch, true);
  assert.equal(path.dirname(first.folder), path.join(root, 'tests', '.tmp', 'release-candidates')); assert.match(path.basename(first.folder), /^candidate-[0-9a-f-]{36}$/);
  // Qué se capturó: comparado con una lista construida a mano, no con la lógica de la herramienta.
  const expected = ['index.html', 'package.json', 'playwright.config.ts', 'tsconfig.json', 'vite.config.ts', 'src/a-first.ts', 'src/main.ts', 'src/z-last.ts', 'shared/m.ts', 'scripts/block-external.cjs', 'scripts/prepare-release-candidate.mjs', ...ENTRIES, ...TESTS.map(n => 'tests/' + n + '.test.ts'), ...Object.keys(PUBLIC_COVERED)];
  const captured = m.files.map(f => f.path);
  for (const name of expected) assert.ok(captured.includes(name), 'capturado: ' + name);
  for (const bad of ['src/.oculto.ts', 'outputs/salida.ts', 'tests/.tmp/viejo.ts', 'tests/test-results/r.ts', 'scripts/.env.ts', 'src/dist/generado.ts']) { assert.ok(!captured.includes(bad), 'excluido: ' + bad); assert.ok(!fs.existsSync(path.join(m.snapshot, bad)), 'sin copia de ' + bad); }
  assert.ok(!captured.some(p => p.startsWith('node_modules') || p.startsWith('coordination/')), 'sin node_modules ni estado del tablón');
  // CARACTERIZACIÓN (mejora, no fallo exigido): la exclusión por nombre se aplica a cualquier profundidad, así que una carpeta
  // de código fuente legítima llamada "build" o "dist" se omite sin aviso (se nota solo si algo la importa y falla el typecheck).
  assert.ok(!captured.includes('src/build/legitimo.ts'), 'comportamiento actual: src/build/ queda fuera de la captura');
  for (const file of m.files) { const copy = fs.readFileSync(path.join(m.snapshot, file.path)); assert.equal(sha(copy), file.sha256, file.path); assert.equal(copy.length, file.bytes); assert.equal(sha(fs.readFileSync(path.join(root, file.path))), file.sha256, file.path + ' = origen'); }
  assert.ok(m.checks.some(c => c.name === 'public-assets' && c.ok));
  // Orden y resultado de las comprobaciones; todas ok.
  assert.deepEqual(m.checks.map(c => c.name), ['typecheck', 'vite', ...BUNDLES.map(n => 'bundle-' + n), 'public-assets', 'node-integration']);
  assert.ok(m.checks.every(c => c.ok));
  // Integridad del manifiesto de artefactos.
  const onDisk = tree(m.runtime), listed = Object.fromEntries(m.artifacts.map(a => [a.path, a.sha256]));
  assert.deepEqual(listed, onDisk, 'manifest.artifacts coincide con el contenido real de runtime');
  for (const a of m.artifacts) assert.equal(a.bytes, fs.statSync(path.join(m.runtime, a.path)).size);
  assert.ok(onDisk['block-external.cjs'] && onDisk['scripts/block-external.cjs'] && onDisk['server.mjs']);
  // Mapa de reservas: working/review no es fuente aceptada; lo "done" desaparece del mapa (aceptación por ausencia).
  assert.deepEqual(m.sourceOwnersAtCompletion.map(o => o.id + ':' + o.status).sort(), ['MEC-REVIEW:review', 'MEC-WORKING:working']);
  assert.ok(m.blockers.includes('SOURCE_NOT_ACCEPTED:MEC-REVIEW:review') && m.blockers.includes('SOURCE_NOT_ACCEPTED:MEC-WORKING:working') && m.blockers.includes('E2E_AND_VISUAL_REVIEW_PENDING'));
  assert.ok(!m.blockers.some(b => b.includes('MEC-DONE')));
  // Segunda ejecución: carpeta nueva y la primera intacta, byte a byte.
  const before = tree(first.folder); const second = prepare(root, ['--prepare']);
  assert.equal(second.code, 0); assert.notEqual(second.folder, first.folder); assert.equal(candidates(root).length, 2);
  assert.deepEqual(tree(first.folder), before, 'la candidata anterior no se sobrescribe ni se borra');
  // Origen intacto tras dos ejecuciones.
  for (const file of m.files) assert.equal(sha(fs.readFileSync(path.join(root, file.path))), file.sha256, 'origen intacto ' + file.path);
});

// ------------------------------------------------------------------ F3 · entorno de todos los subprocesos
test('F3-1 · lista permitida: ningún canario (credencial, inocuo, de sistema operativo, otra capitalización) llega a ningún proceso hijo observado; PATH/SystemRoot/temporales se conservan', t => {
  if (!happy) return t.skip('sin ejecución completa previa');
  const { m, first } = happy, seen = observations(m.folder);
  // EXPECTATIVA NUEVA respecto a QA052 (2b): allí «QA052_BENIGN pasa» era una caracterización de la lista negra; con la lista permitida debe ausentarse.
  assert.ok(seen.length >= 1 + 1 + 6 + 1, 'procesos node observados (tsc, vite, 6 esbuild, ≥1 de pruebas): ' + seen.map(s => s.script + ' ' + s.first).join(' | '));
  // Fuga = un valor canario visible en el hijo (decisión por VALOR) o un nombre canario que el sistema operativo no inyecta por su cuenta.
  const floor = platformFloor(), lowerCanaries = new Set(CANARIES.map(n => n.toLowerCase())), leaks = new Map(), extras = new Map();
  for (const line of seen) {
    for (const key of line.leaked) if (!floor.leaked.has(key)) leaks.set(key, (leaks.get(key) ?? 0) + 1);
    for (const key of line.keys) {
      if (lowerCanaries.has(key) && !floor.keys.has(key)) leaks.set(key, (leaks.get(key) ?? 0) + 1);
      else if (!ALLOWED_LOWER.has(key) && !EXPECTED_EXTRA.has(key) && !floor.keys.has(key)) extras.set(key, (extras.get(key) ?? 0) + 1);
    }
  }
  assert.deepEqual([...leaks.keys()].sort(), [], 'canarios que SÍ llegaron a algún hijo (solo nombres): ' + [...leaks.entries()].map(([k, n]) => k + '×' + n).join(', ') + ' · procesos observados: ' + seen.length);
  assert.deepEqual([...extras.keys()].sort(), [], 'claves no permitidas ni explicadas en algún hijo: ' + [...extras.keys()].join(', '));
  const parent = Object.fromEntries(KEEP.map(key => [key, process.env[key] ? sha(process.env[key]).slice(0, 16) : null]));
  for (const line of seen) {
    assert.ok(line.keys.includes('path'), 'PATH conservado en ' + line.script + ' ' + line.first);
    if (process.platform === 'win32') assert.ok(line.keys.includes('systemroot') && (line.keys.includes('temp') || line.keys.includes('tmp')), 'SystemRoot y temporales conservados en ' + line.script + ' ' + line.first);
    for (const key of KEEP) if (line.values[key] !== null) assert.equal(line.values[key], parent[key], key + ' conserva el valor del padre en ' + line.script);
    assert.ok(line.keys.includes('tz') && line.keys.includes('lang'), 'otras variables de la lista permitida (TZ, LANG) también pasan: ' + line.script);
  }
  // Tercer nivel (nieto): el proceso de pruebas imprime la presencia de cada canario; se contrasta con el observador.
  const log = fs.readFileSync(path.join(m.folder, 'logs', 'node-integration.log'), 'utf8');
  const state = Object.fromEntries([...log.matchAll(/ENV:([A-Za-z0-9_]+)=(other|canary|absent)/g)].map(x => [x[1], x[2]]));
  assert.equal(Object.keys(state).length, CANARIES.length + 2, 'el proceso de pruebas imprimió el estado de todos los nombres vigilados');
  assert.deepEqual(CANARIES.filter(name => state[name] === 'canary' && !floor.leaked.has(name.toLowerCase())), [], 'el proceso de pruebas Node no ve ningún VALOR canario más allá del suelo de la plataforma');
  assert.deepEqual(CANARIES.filter(name => state[name] !== 'absent' && !floor.keys.has(name.toLowerCase())), [], 'y los nombres vigilados que la plataforma no reinyecta están ausentes');
  assert.equal(state.TZ, 'other'); assert.equal(state.LANG, 'other');
  t.diagnostic('suelo de la plataforma (hijo de control con env:{}): nombres reinyectados = ' + [...floor.keys].sort().join(',') + ' · con VALOR canario = ' + [...floor.leaked].sort().join(',') + ' → no atribuibles a la herramienta');
  // Higiene: ningún valor de canario se imprime en ningún registro ni manifiesto, y el padre ya lo recibió (control del arnés).
  const texts = [path.join(m.folder, 'manifest.json'), ...fs.readdirSync(path.join(m.folder, 'logs')).map(n => path.join(m.folder, 'logs', n))].map(f => fs.readFileSync(f, 'utf8'));
  assert.ok(!texts.some(text => text.includes('valor-inventado')), 'ningún valor de canario aparece en logs ni manifiesto');
  assert.equal(first.code, 0);
  t.diagnostic('procesos node observados: ' + seen.length + ' · alcance: solo procesos node que cargaron el guardián; el binario nativo de esbuild/vite hereda el entorno de su padre y no se observa directamente');
});

test('F3-2 · cada bundle pasa por CLI en el runner saneado: un proceso, un log y una salida coherente por bundle', t => {
  if (!happy) return t.skip('sin ejecución completa previa');
  const { m } = happy, seen = observations(m.folder);
  for (const [index, output] of BUNDLES.entries()) {
    const entry = ENTRIES[index], name = 'bundle-' + output, check = m.checks.find(c => c.name === name);
    assert.ok(check && check.ok && check.exitCode === 0 && check.errorCode === null, name + ': comprobación registrada y correcta');
    assert.ok(fs.existsSync(path.join(m.folder, 'logs', name + '.log')), name + ': log propio');
    const artifact = path.join(m.runtime, output); assert.ok(fs.existsSync(artifact) && fs.statSync(artifact).size > 0, name + ': salida generada');
    assert.ok(fs.readFileSync(artifact, 'utf8').includes(JSON.stringify(entry)), name + ': la salida corresponde a su propia entrada ' + entry);
    assert.equal(m.artifacts.find(a => a.path === output)?.sha256, sha(fs.readFileSync(artifact)), name + ': hash del manifiesto');
    const procs = seen.filter(s => s.script === 'esbuild' && s.first === entry);
    assert.equal(procs.length, 1, name + ': exactamente un proceso CLI de esbuild con guardián y entorno observado para ' + entry + ' (observados: ' + seen.filter(s => s.script === 'esbuild').length + ')');
  }
  assert.equal(seen.filter(s => s.script === 'esbuild').length, BUNDLES.length, 'un proceso esbuild por bundle y ninguno más (' + BUNDLES.length + ')');
  assert.ok(seen.some(s => s.script === 'tsc.js' || s.script === 'tsc') && seen.some(s => s.script === 'vite.js'), 'typecheck y vite también pasan por el mismo runner');
});

// ------------------------------------------------------------------ F2 · activos públicos completos o exclusión explícita
test('F2-1 · todo archivo público regular admisible se captura por bytes, sin depender de extensión ni mayúsculas, y fuente = snapshot = runtime = manifiesto', t => {
  if (!happy) return t.skip('sin ejecución completa previa');
  const { root, m } = happy, all = { ...PUBLIC_COVERED, ...PUBLIC_UNCOVERED };
  for (const relative of Object.keys(all)) assert.ok(fs.existsSync(path.join(root, relative)), 'precondición: el activo existe en el origen: ' + relative);
  const listed = new Map(m.files.map(f => [f.path, f])), problems = [];
  for (const [relative, content] of Object.entries(all)) {
    const entry = listed.get(relative), snapshot = path.join(m.snapshot, relative), dist = path.join(m.runtime, 'dist', relative.slice(7));
    if (!entry) { problems.push('OMITIDO del manifiesto: ' + relative); continue; }
    if (!fs.existsSync(snapshot) || !fs.readFileSync(snapshot).equals(content)) problems.push('snapshot distinto/ausente: ' + relative);
    if (!fs.existsSync(dist) || !fs.readFileSync(dist).equals(content)) problems.push('runtime/dist distinto/ausente: ' + relative);
    if (entry.sha256 !== sha(content) || entry.bytes !== content.length) problems.push('hash/bytes del manifiesto no coinciden con el origen: ' + relative);
  }
  assert.deepEqual(problems, [], 'activos públicos que no llegaron íntegros (' + problems.length + ' de ' + Object.keys(all).length + ') · check public-assets=' + m.checks.find(c => c.name === 'public-assets')?.ok + ' · cobertura=' + JSON.stringify(m.publicAssetCoverage));
  assert.equal(m.files.filter(f => f.path.startsWith('public/')).length, Object.keys(all).length, 'ningún archivo público extra ni duplicado en el manifiesto');
  assert.deepEqual([m.approved, m.deployed, m.releaseEligible], [false, false, false]);
});

test('F2-2 · lo público que no se captura (oculto o con nombre de salida) consta en excludedPublicPaths, bloquea con PUBLIC_PATH_EXCLUDED, deja complete:false y no se copia en ninguna parte', t => {
  if (!happy) return t.skip('sin ejecución completa previa');
  const { m } = happy;
  assert.deepEqual([...(m.excludedPublicPaths ?? [])].sort(), HIDDEN_EXPECTED, 'excludedPublicPaths exacto (lista construida a mano)');
  assert.deepEqual(m.blockers.filter(b => b.startsWith('PUBLIC_PATH_EXCLUDED:')).sort(), HIDDEN_EXPECTED.map(p => 'PUBLIC_PATH_EXCLUDED:' + p).sort(), 'un bloqueo por ruta excluida');
  assert.deepEqual(m.publicAssetCoverage, { captured: SELF, excluded: HIDDEN_EXPECTED.length, complete: false }, 'cobertura: capturados=' + SELF + ' (recuento propio), excluidos, incompleta');
  assert.equal(m.state, 'compiled-and-node-verified', 'el bloqueo no es un fallo de compilación: la candidata sigue siendo no aprobable');
  assert.deepEqual([m.approved, m.deployed, m.releaseEligible], [false, false, false]);
  // Nada del contenido oculto se copia «para aparentar completitud»: ni en el snapshot, ni en dist, ni en logs, ni en el manifiesto.
  const hits = []; (function scan(dir) { for (const entry of fs.readdirSync(dir, { withFileTypes: true })) { const full = path.join(dir, entry.name); if (entry.isDirectory()) scan(full); else if (fs.readFileSync(full).includes(HIDDEN_CANARY)) hits.push(path.relative(m.folder, full)); } })(m.folder);
  assert.deepEqual(hits, [], 'ficheros de la candidata que contienen el canario del contenido oculto');
  for (const relative of ['.secreto.json', '.well-known/security.txt', 'build/app.js', 'dist', 'node_modules/x.js', 'sub/.oculto']) { assert.ok(!fs.existsSync(path.join(m.snapshot, 'public', relative)), 'sin copia en snapshot: ' + relative); assert.ok(!fs.existsSync(path.join(m.runtime, 'dist', relative)), 'sin copia en dist: ' + relative); }
});

test('F2-3 · sin rutas públicas excluidas la cobertura es completa y no hay bloqueo PUBLIC_PATH_EXCLUDED (control positivo)', { timeout: 300_000 }, t => {
  if (!linkOk) return t.skip('sin enlace a node_modules');
  const root = makeWorkspace('clean', { uncovered: true, hidden: false }), run = prepare(root);
  assert.equal(run.code, 0, 'FALLO DE PREPARACIÓN/ARNÉS: ' + run.err + run.out.slice(-300)); const m = run.manifest;
  assert.deepEqual(m.excludedPublicPaths ?? null, [], 'lista de exclusiones vacía y presente'); assert.deepEqual(m.publicAssetCoverage, { captured: SELF, excluded: 0, complete: true });
  assert.ok(!m.blockers.some(b => b.startsWith('PUBLIC_PATH_EXCLUDED')), 'sin bloqueos de ruta pública');
  assert.ok(m.blockers.includes('E2E_AND_VISUAL_REVIEW_PENDING') && m.blockers.some(b => b.startsWith('SOURCE_NOT_ACCEPTED')), 'los demás bloqueos siguen: completar la cobertura no aprueba la candidata');
  assert.deepEqual([m.approved, m.deployed, m.releaseEligible], [false, false, false]);
});

test('3 · un activo público que el build no entrega se detecta (vite sin publicDir) y la candidata queda incompleta', { timeout: 300_000 }, t => {
  if (!linkOk) return t.skip('sin enlace a node_modules');
  const root = makeWorkspace('nopublic', { publicDir: false });
  const run = prepare(root); assert.equal(run.code, 1); const m = run.manifest;
  assert.equal(m.state, 'incomplete'); assert.match(m.error, /Activo público ausente o distinto: public\//);
  assert.ok(m.checks.some(c => c.name === 'vite' && c.ok), 'el build en sí terminó bien: el fallo es la guarda de activos');
  assert.ok(!m.checks.some(c => c.name === 'public-assets' || c.name === 'node-integration'));
  assert.deepEqual([m.approved, m.deployed, m.releaseEligible], [false, false, false]); assert.deepEqual(m.artifacts, []);
});

test('4 · typecheck que falla: evidencia incompleta con código de salida, log y sin artefactos aprobados', { timeout: 300_000 }, t => {
  if (!linkOk) return t.skip('sin enlace a node_modules');
  const root = makeWorkspace('typefail', { typeError: true });
  const run = prepare(root); assert.equal(run.code, 1); const m = run.manifest;
  assert.equal(m.state, 'incomplete'); assert.match(m.error, /No supera typecheck/);
  assert.equal(m.checks.length, 1); assert.equal(m.checks[0].name, 'typecheck'); assert.equal(m.checks[0].ok, false); assert.notEqual(m.checks[0].exitCode, 0); assert.notEqual(m.checks[0].exitCode, null);
  assert.match(fs.readFileSync(path.join(m.folder, 'logs', 'typecheck.log'), 'utf8'), /bad\.ts/);
  assert.deepEqual(m.artifacts, []); assert.deepEqual(m.blockers, []); assert.equal(fs.readdirSync(m.runtime).length, 0, 'sin compilados');
  assert.deepEqual([m.approved, m.deployed, m.releaseEligible], [false, false, false]); assert.equal(m.snapshotStable, true, 'la captura sí fue estable: el fallo es posterior');
});

test('5 · pruebas de Node que fallan: se conservan los resultados previos y no hay artefactos listados ni candidata aprobada', { timeout: 300_000 }, t => {
  if (!linkOk) return t.skip('sin enlace a node_modules');
  const root = makeWorkspace('testfail', { failTests: true });
  const run = prepare(root); assert.equal(run.code, 1); const m = run.manifest;
  assert.equal(m.state, 'incomplete'); assert.match(m.error, /No supera node-integration/);
  const last = m.checks.at(-1); assert.equal(last.name, 'node-integration'); assert.equal(last.ok, false); assert.ok(m.checks.slice(0, -1).every(c => c.ok));
  assert.match(fs.readFileSync(path.join(m.folder, 'logs', 'node-integration.log'), 'utf8'), /fallo mecánico/);
  assert.deepEqual(m.artifacts, [], 'no se publican hashes de artefactos de una candidata fallida'); assert.notEqual(m.state, 'compiled-and-node-verified');
});

test('5b · un bundle que falla (esbuild por CLI) detiene la candidata en ese bundle, con su log y sin artefactos', { timeout: 300_000 }, t => {
  if (!linkOk) return t.skip('sin enlace a node_modules');
  const root = makeWorkspace('bundlefail');
  // El typecheck rechazaría la importación inexistente; @ts-ignore la deja pasar para que el fallo ocurra en esbuild.
  write(root, 'server/drill-worker.ts', "// @ts-ignore\nimport './no-existe-qa056';\nexport const entry = 'x';\n");
  const run = prepare(root); assert.equal(run.code, 1); const m = run.manifest;
  assert.equal(m.state, 'incomplete'); assert.match(m.error, /No supera bundle-drill\.mjs/);
  const names = m.checks.map(c => c.name); assert.deepEqual(names.slice(-1), ['bundle-drill.mjs']); assert.equal(m.checks.at(-1).ok, false); assert.ok(m.checks.slice(0, -1).every(c => c.ok));
  assert.match(fs.readFileSync(path.join(m.folder, 'logs', 'bundle-drill.mjs.log'), 'utf8'), /no-existe-qa056|Could not resolve/);
  assert.ok(!names.includes('public-assets'), 'no sigue con la comprobación siguiente'); assert.deepEqual(m.artifacts, []);
});

// ------------------------------------------------------------------ fallos de captura (rápidos: ocurren antes de cualquier compilación)
function captureFailure(root, expected) {
  const before = candidates(root).length, run = prepare(root);
  assert.equal(run.code, 1, run.err); assert.equal(candidates(root).length, before + 1, 'carpeta nueva');
  const m = run.manifest; assert.equal(m.state, 'incomplete'); assert.match(m.error, expected); assert.notEqual(m.snapshotStable, true);
  assert.deepEqual(m.checks, []); assert.deepEqual([m.approved, m.deployed, m.releaseEligible], [false, false, false]);
  return m;
}
test('6 · enlaces y junctions de entrada se rechazan sin recorrer su destino (también dentro de public/ y a mayor profundidad)', t => {
  const root = makeWorkspace('links'), outside = path.join(root, 'externo-sintetico'); write(root, 'externo-sintetico/secreto-sintetico.ts', 'export const canario = "QA052-ENLACE";\n');
  const link = path.join(root, 'src', 'enlazado');
  try { fs.symlinkSync(outside, link, 'junction'); } catch { return t.skip('no se pudo crear una junction (límite de entorno)'); }
  const m = captureFailure(root, /enlazadas/);
  assert.ok(!m.files.some(f => f.path.includes('secreto-sintetico')), 'el destino no se recorre'); assert.ok(!fs.existsSync(path.join(m.snapshot, 'src', 'enlazado')));
  fs.rmSync(link);
  for (const where of ['public/enlazado', 'public/sub/enlazado']) {
    const publicLink = path.join(root, where); fs.symlinkSync(outside, publicLink, 'junction');
    const p = captureFailure(root, /enlazadas/); assert.ok(!JSON.stringify(p.files).includes('secreto-sintetico')); assert.ok(!fs.existsSync(path.join(p.snapshot, where))); fs.rmSync(publicLink);
  }
  // Enlace de archivo (puede requerir privilegios): separar límite de entorno de defecto del producto.
  const fileLink = path.join(root, 'src', 'f.ts');
  try { fs.symlinkSync(path.join(outside, 'secreto-sintetico.ts'), fileLink, 'file'); } catch { t.diagnostic('symlink de archivo no disponible: rechazo de enlaces de archivo SIN VERIFICAR (límite de entorno)'); return; }
  const f = captureFailure(root, /enlazadas/); assert.ok(!JSON.stringify(f.files).includes('secreto-sintetico'));
});

test('6b · una junction pública OCULTA o con nombre de salida no se sigue: se declara como exclusión (caracterización)', t => {
  const root = makeWorkspace('hiddenlink', { hidden: false }), outside = path.join(root, 'externo-sintetico'); write(root, 'externo-sintetico/secreto-sintetico.ts', 'export const canario = "QA056-ENLACE-OCULTO";\n');
  fs.mkdirSync(path.join(root, 'public'), { recursive: true });
  try { fs.symlinkSync(outside, path.join(root, 'public', '.enlace'), 'junction'); fs.symlinkSync(outside, path.join(root, 'public', 'dist'), 'junction'); } catch { return t.skip('no se pudo crear una junction (límite de entorno)'); }
  // Se detiene antes de compilar si hay otro fallo; aquí se observa solo la captura: fuerza un fallo posterior inocuo (typecheck) para inspeccionar el manifiesto.
  write(root, 'src/bad.ts', "export const x: number = 'no';\n");
  const run = prepare(root); const m = run.manifest;
  assert.ok(m, 'hay manifiesto'); assert.ok(!JSON.stringify(m).includes('secreto-sintetico') && !JSON.stringify(m.files).includes('QA056-ENLACE'), 'el destino de la junction no se recorre ni se copia');
  assert.ok(!fs.existsSync(path.join(m.snapshot, 'public', '.enlace')) && !fs.existsSync(path.join(m.snapshot, 'public', 'dist')));
  assert.deepEqual([...(m.excludedPublicPaths ?? [])].sort(), ['public/.enlace', 'public/dist'].sort(), 'las junctions ocultas se declaran como exclusiones (sin barra final porque no se detectan como directorio)');
  assert.deepEqual([m.approved, m.deployed, m.releaseEligible], [false, false, false]);
});

test('7 · límites: fuente (o archivo público) sobre 2 MB, más de 2000 entradas y más de 50 MB se detienen con evidencia incompleta', { timeout: 300_000 }, () => {
  const root = makeWorkspace('limits');
  write(root, 'src/enorme.ts', Buffer.alloc(2_000_001, 0x61)); const a = captureFailure(root, /2 MB/); assert.ok(!a.files.some(f => f.path === 'src/enorme.ts'));
  fs.rmSync(path.join(root, 'src', 'enorme.ts'));
  write(root, 'public/video.mp4', Buffer.alloc(2_000_001, 0x62)); const p = captureFailure(root, /2 MB/); assert.ok(!p.files.some(f => f.path === 'public/video.mp4'), 'un activo público de extensión arbitraria sobre 2 MB también se detiene, no se omite');
  fs.rmSync(path.join(root, 'public', 'video.mp4'));
  for (let i = 0; i < 2001; i++) write(root, 'src/muchas/f' + String(i).padStart(4, '0') + '.ts', 'export {};\n');
  const b = captureFailure(root, /Demasiadas fuentes/); assert.deepEqual(b.files, [], 'no empieza a copiar con demasiadas entradas');
  fs.rmSync(path.join(root, 'src', 'muchas'), { recursive: true });
  for (let i = 0; i < 26; i++) write(root, 'src/grandes/g' + String(i).padStart(2, '0') + '.ts', Buffer.alloc(1_990_000, 0x62));
  const c = captureFailure(root, /50 MB/); assert.ok(c.files.length > 0 && c.files.length < 26 + 30, 'queda registrada la captura parcial como evidencia');
});

test('8 · cambios durante la captura (también en rutas públicas ocultas): error honesto o hashes de lo realmente copiado, nunca "fuente estable" falsa', { timeout: 300_000 }, t => {
  const hook = path.join(WORK, 'race-hook.cjs');
  fs.writeFileSync(hook, `const fs = require('node:fs'), path = require('node:path');
const original = fs.readFileSync, mode = process.env.QA056_RACE_MODE, root = process.env.QA056_RACE_ROOT; let done = false;
fs.readFileSync = function (file, ...rest) {
  const result = original.call(this, file, ...rest);
  const normal = typeof file === 'string' ? file.replaceAll('\\\\', '/') : '', late = /-late$/.test(mode || '');
  if (!done && mode && !late && normal.endsWith('/src/a-first.ts') && !normal.includes('/release-candidates/')) {
    done = true;
    if (mode === 'mutate-captured') fs.appendFileSync(path.join(root, 'src', 'a-first.ts'), '// cambio tras copiar\\n');
    if (mode === 'add-file') fs.writeFileSync(path.join(root, 'src', 'm-nuevo.ts'), 'export const n = 1;\\n');
    if (mode === 'delete-pending') fs.rmSync(path.join(root, 'src', 'z-last.ts'));
    if (mode === 'mutate-pending') fs.appendFileSync(path.join(root, 'src', 'z-last.ts'), '// cambio antes de copiar\\n');
    if (mode === 'add-hidden-public') fs.writeFileSync(path.join(root, 'public', '.nuevo-oculto'), 'x');
    if (mode === 'remove-hidden-public') fs.rmSync(path.join(root, 'public', '.secreto.json'));
    if (mode === 'add-public-file') fs.writeFileSync(path.join(root, 'public', 'nuevo.gif'), 'x');
  }
  if (!done && late && normal.endsWith('/runtime/server.mjs') && normal.includes('/release-candidates/')) {
    done = true;
    if (mode === 'hidden-late') fs.writeFileSync(path.join(root, 'public', '.tardio'), 'x');
    if (mode === 'public-late') fs.appendFileSync(path.join(root, 'public', 'logo.png'), 'tarde');
  }
  return result;
};\n`);
  const raceEnv = (mode, root) => ({ QA056_RACE_MODE: mode, QA056_RACE_ROOT: root });
  for (const mode of ['mutate-captured', 'add-file', 'delete-pending', 'add-hidden-public', 'remove-hidden-public', 'add-public-file']) {
    const root = makeWorkspace('race-' + mode), run = prepare(root, ['--prepare'], { hook, hookEnv: raceEnv(mode, root) });
    assert.equal(run.code, 1, mode + ': salió con ' + run.code + ' · stderr: ' + run.err.slice(-300) + ' · stdout: ' + run.out.slice(-300)); const m = run.manifest;
    assert.equal(m.state, 'incomplete', mode); assert.notEqual(m.snapshotStable, true, mode + ': no declara fuente estable'); assert.deepEqual(m.checks, [], mode + ': no compila una captura inestable');
    assert.ok(m.error && m.error.length > 0, mode); assert.deepEqual([m.approved, m.deployed, m.releaseEligible], [false, false, false]);
    if (mode !== 'delete-pending') assert.match(m.error, /cambiaron durante la captura/, mode);
  }
  // Cambio ANTES de copiar el archivo: la candidata contiene lo copiado y su hash coincide con el disco final (honesto), no con la lectura previa.
  const root = makeWorkspace('race-pending', { typeError: true });
  if (!linkOk) return t.skip('sin enlace a node_modules para llegar a la fase posterior');
  const run = prepare(root, ['--prepare'], { hook, hookEnv: { QA056_RACE_MODE: 'mutate-pending', QA056_RACE_ROOT: root } }); const m = run.manifest;
  const entry = m.files.find(f => f.path === 'src/z-last.ts');
  assert.equal(entry.sha256, sha(fs.readFileSync(path.join(root, 'src', 'z-last.ts'))), 'el hash registrado es el de los bytes realmente copiados');
  assert.equal(sha(fs.readFileSync(path.join(m.snapshot, 'src', 'z-last.ts'))), entry.sha256); assert.equal(m.snapshotStable, true);
});

test('8b · cambios DESPUÉS de verificar (ruta pública oculta nueva, o activo público modificado): liveSourcesStillMatch:false y bloqueo, sin tocar las exclusiones registradas', { timeout: 600_000 }, t => {
  if (!linkOk) return t.skip('sin enlace a node_modules');
  const hook = path.join(WORK, 'race-hook.cjs');
  if (!fs.existsSync(hook)) return t.skip('el gancho de carreras lo crea la prueba 8');
  for (const mode of ['hidden-late', 'public-late']) {
    const root = makeWorkspace('late-' + mode), run = prepare(root, ['--prepare'], { hook, hookEnv: { QA056_RACE_MODE: mode, QA056_RACE_ROOT: root } });
    assert.equal(run.code, 0, 'FALLO DE PREPARACIÓN/ARNÉS (' + mode + '): ' + run.err + run.out.slice(-300)); const m = run.manifest;
    assert.equal(m.snapshotStable, true, mode); assert.equal(m.liveSourcesStillMatch, false, mode + ': el origen cambió tras la captura y la herramienta lo dice');
    assert.ok(m.blockers.includes('LIVE_SOURCE_CHANGED_AFTER_SNAPSHOT'), mode); assert.deepEqual([m.approved, m.deployed, m.releaseEligible], [false, false, false]);
    assert.deepEqual([...(m.excludedPublicPaths ?? [])].sort(), HIDDEN_EXPECTED, mode + ': la lista de exclusiones es la del momento de la captura');
  }
});

// O1 (QA056) quedó resuelto por SNAPSHOT084: lo que la captura omite se declara. Los tres oráculos siguientes sustituyen a la caracterización histórica.
const O1_OMITTED = ['src/datos.json', 'server/esquema.sql', 'scripts/herramienta.ps1', 'shared/NOTAS.MD'];
test('O1-1 · el manifiesto declara la selección: raíces, archivos raíz, repositoryImage:false y cada exclusión con su motivo, sin copiar su contenido', t => {
  if (!happy) return t.skip('sin ejecución completa previa');
  const { m } = happy, sel = m.sourceSelection;
  assert.ok(sel, 'el manifiesto incluye sourceSelection (política de fuentes explícita)');
  assert.strictEqual(sel.repositoryImage, false, 'no se presenta como imagen íntegra del repositorio');
  assert.deepEqual([...sel.roots].sort(), ['public', 'scripts', 'server', 'shared', 'src', 'tests', 'tools']);
  assert.deepEqual([...sel.rootFiles].sort(), ['index.html', 'package.json', 'playwright.config.ts', 'tsconfig.json', 'vite.config.ts']);
  // Lista construida a mano a partir de lo que makeWorkspace escribió, no de la lógica de la herramienta.
  const expected = [
    ...O1_OMITTED.map(p => p + '|unlisted-extension'),
    'src/.oculto.ts|hidden-name', 'scripts/.env.ts|hidden-name', 'tests/.tmp/|hidden-name', 'tests/test-results/|excluded-name', 'src/dist/|excluded-name', 'src/build/|excluded-name',
    'public/.secreto.json|hidden-name', 'public/.well-known/|hidden-name', 'public/build/|excluded-name', 'public/dist|excluded-name', 'public/node_modules/|excluded-name', 'public/sub/.oculto|hidden-name',
  ].sort();
  assert.deepEqual(sel.excludedPaths.map(e => e.path + '|' + e.reason).sort(), expected, 'inventario de exclusiones exacto y con motivo');
  for (const relative of O1_OMITTED) { assert.ok(!m.files.some(f => f.path === relative), 'no capturado: ' + relative); assert.ok(!fs.existsSync(path.join(m.snapshot, relative)), 'sin copia: ' + relative); }
  assert.ok(!JSON.stringify(m).includes('contenido no listado'), 'el contenido de lo excluido no se copia al manifiesto');
  assert.deepEqual([...m.excludedPublicPaths].sort(), HIDDEN_EXPECTED, 'las exclusiones públicas de F2 se conservan');
});

test('O1-2 · los auxiliares de código excluidos bloquean con SOURCE_AUXILIARY_EXCLUDED; las exclusiones por nombre y las públicas no generan ese bloqueo', t => {
  if (!happy) return t.skip('sin ejecución completa previa');
  const { m } = happy, aux = m.blockers.filter(b => b.startsWith('SOURCE_AUXILIARY_EXCLUDED:')).sort();
  assert.deepEqual(aux, O1_OMITTED.map(p => 'SOURCE_AUXILIARY_EXCLUDED:' + p).sort(), 'exactamente los cuatro auxiliares, ninguno más');
  assert.deepEqual(m.blockers.filter(b => b.startsWith('PUBLIC_PATH_EXCLUDED:')).sort(), HIDDEN_EXPECTED.map(p => 'PUBLIC_PATH_EXCLUDED:' + p).sort(), 'F2 intacto');
  assert.deepEqual([m.approved, m.deployed, m.releaseEligible], [false, false, false]);
  assert.strictEqual(m.publicAssetCoverage.complete, false, 'con exclusiones públicas la cobertura sigue siendo incompleta');
});

test('O1-3 · las herramientas de código (tools/) viajan en el snapshot byte a byte y su hash coincide con el origen', t => {
  if (!happy) return t.skip('sin ejecución completa previa');
  const { m } = happy, entry = m.files.find(f => f.path === 'tools/coordination/core.mjs');
  assert.ok(entry, 'tools/coordination/core.mjs capturado (dependencia del propio script)');
  const copy = fs.readFileSync(path.join(m.snapshot, entry.path));
  assert.strictEqual(sha(copy), entry.sha256); assert.strictEqual(entry.sha256, sha(fs.readFileSync(path.join(REPO, 'tools', 'coordination', 'core.mjs'))), 'idéntico al origen real');
  assert.deepEqual(copy, fs.readFileSync(path.join(happy.root, entry.path)));
});
