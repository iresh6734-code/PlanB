import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

// QA086 · oráculos independientes de la selección explícita de fuentes de scripts/prepare-release-candidate.mjs (SNAPSHOT084/REL046R3).
// No reutiliza fixtures ni aserciones de tests/candidate-source-coverage.test.mjs: cada expectativa se escribe a mano aquí.
// Mecánica sintética: cada caso construye un árbol propio bajo tests/.tmp/qa086-selection/ y llama a candidateSourceSelection(raíz).
// No es Plan B, no compila ni prueba la app, y NO acredita nada sobre el producto: solo qué entra, qué se declara y qué no se lee.
// QA086_SCRIPT apunta a otra copia del script (p. ej. el builder ANTERIOR de SNAPSHOT084) para demostrar que los controles fallan por su causa.
const REPO = fs.realpathSync(path.resolve(fileURLToPath(new URL('..', import.meta.url))));
const SCRIPT = process.env.QA086_SCRIPT ? path.resolve(process.env.QA086_SCRIPT) : path.join(REPO, 'scripts', 'prepare-release-candidate.mjs');
const BASE = path.join(REPO, 'tests', '.tmp', 'qa086-selection');
fs.mkdirSync(BASE, { recursive: true });
const { candidateSourceSelection } = await import(pathToFileURL(SCRIPT).href);
const need = () => assert.equal(typeof candidateSourceSelection, 'function', 'el script probado no exporta candidateSourceSelection (API de selección explícita ausente)');
const CANARY = 'QA086-CONTENIDO-PRIVADO-NO-COPIAR';
const ROOT_FILES = ['package.json', 'tsconfig.json', 'vite.config.ts', 'playwright.config.ts', 'index.html'];

function workspace() {
  const folder = fs.mkdtempSync(path.join(BASE, 'ws-' + randomUUID().slice(0, 8) + '-'));
  const put = (relative, text = 'export {};\n') => { const file = path.join(folder, relative); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, text, { flag: 'wx' }); return file; };
  return { folder, put };
}
const paths = selection => selection.excludedPaths.map(entry => entry.path);
const reasonOf = (selection, name) => selection.excludedPaths.find(entry => entry.path === name)?.reason;

test('O1-a · la selección es un contrato explícito: raíces, archivos raíz y repositoryImage:false', () => {
  need(); const w = workspace(); w.put('src/a.ts');
  const s = candidateSourceSelection(w.folder);
  assert.deepEqual([...s.roots].sort(), ['public', 'scripts', 'server', 'shared', 'src', 'tests', 'tools']);
  assert.deepEqual([...s.rootFiles].sort(), [...ROOT_FILES].sort());
  assert.strictEqual(s.repositoryImage, false, 'no se presenta como imagen del repositorio');
  assert.ok(Array.isArray(s.files) && Array.isArray(s.excludedPaths));
});

test('O1-b · cada auxiliar fuera de public/ se declara con motivo «unlisted-extension» y su contenido nunca aparece', () => {
  need(); const w = workspace();
  const auxiliaries = ['src/datos.json', 'server/esquema.sql', 'scripts/herramienta.ps1', 'shared/NOTAS.MD', 'tests/lista.txt', 'tools/guia.yml'];
  for (const name of auxiliaries) w.put(name, CANARY);
  w.put('src/ok.ts'); w.put('tools/ok.mjs');
  const s = candidateSourceSelection(w.folder);
  for (const name of auxiliaries) { assert.strictEqual(reasonOf(s, name), 'unlisted-extension', name); assert.ok(!s.files.includes(name), 'no capturado: ' + name); }
  assert.ok(s.files.includes('src/ok.ts') && s.files.includes('tools/ok.mjs'));
  assert.ok(!JSON.stringify(s).includes(CANARY), 'el contenido de lo excluido no entra en la selección');
});

test('O1-c · las herramientas de código y las páginas HTML viajan en la captura, con la extensión en cualquier capitalización', () => {
  need(); const w = workspace();
  for (const name of ['tools/coordination/core.mjs', 'tools/panel/index.HTML', 'tools/x/run.CJS', 'tools/y/run.Js', 'src/estilo.CSS', 'src/icono.SvG', 'src/comp.TSX']) w.put(name);
  const s = candidateSourceSelection(w.folder);
  for (const name of ['tools/coordination/core.mjs', 'tools/panel/index.HTML', 'tools/x/run.CJS', 'tools/y/run.Js', 'src/estilo.CSS', 'src/icono.SvG', 'src/comp.TSX']) assert.ok(s.files.includes(name), name);
  assert.deepEqual(paths(s), [], 'nada de lo anterior se excluye');
});

test('O1-d · public/ es opaco: se admite cualquier archivo aunque la extensión no esté listada; public/data se admite y data fuera de public/ se excluye', () => {
  need(); const w = workspace();
  for (const name of ['public/lib/app.wasm', 'public/NOEXT', 'public/UPPER.PNG', 'public/data/catalogo.json', 'public/sub/data/x.bin', 'public/vacio']) w.put(name, '');
  for (const name of ['server/data/privado.ts', 'tools/data/clientes.ts', 'src/ui/data/extra.json']) w.put(name, CANARY);
  const s = candidateSourceSelection(w.folder);
  for (const name of ['public/lib/app.wasm', 'public/NOEXT', 'public/UPPER.PNG', 'public/data/catalogo.json', 'public/sub/data/x.bin', 'public/vacio']) assert.ok(s.files.includes(name), 'admitido: ' + name);
  for (const dir of ['server/data/', 'tools/data/', 'src/ui/data/']) assert.strictEqual(reasonOf(s, dir), 'excluded-name', 'declarado una vez: ' + dir);
  assert.ok(!s.files.some(f => /(^|\/)data\//.test(f) && !f.startsWith('public/')), 'ningún archivo de un data privado se captura');
  assert.ok(!paths(s).some(p => p.startsWith('public/')), 'nada público se excluye por este caso');
  const text = JSON.stringify(s);
  for (const hidden of ['privado.ts', 'clientes.ts', 'extra.json']) assert.ok(!text.includes(hidden), 'no se enumera el interior de un directorio excluido: ' + hidden);
});

test('O1-e · nombres ocultos y de salida se declaran una sola vez y no se recorren', () => {
  need(); const w = workspace();
  for (const name of ['src/.privado/dentro.ts', 'tools/.tmp/viejo.ts', 'tests/.tmp/otro.ts', 'server/node_modules/m/index.js', 'scripts/dist/x.js', 'src/build/y.ts', 'shared/outputs/z.ts', 'tests/test-results/r.ts', 'src/.env.ts', 'tools/.git/HEAD']) w.put(name, CANARY);
  const s = candidateSourceSelection(w.folder);
  const expected = { 'src/.privado/': 'hidden-name', 'tools/.tmp/': 'hidden-name', 'tests/.tmp/': 'hidden-name', 'server/node_modules/': 'excluded-name', 'scripts/dist/': 'excluded-name', 'src/build/': 'excluded-name', 'shared/outputs/': 'excluded-name', 'tests/test-results/': 'excluded-name', 'src/.env.ts': 'hidden-name', 'tools/.git/': 'hidden-name' };
  for (const [name, reason] of Object.entries(expected)) assert.strictEqual(reasonOf(s, name), reason, name);
  assert.strictEqual(new Set(paths(s)).size, paths(s).length, 'sin duplicados');
  assert.deepEqual(s.files.filter(f => !ROOT_FILES.includes(f)), [], 'no se captura nada de lo anterior');
  assert.ok(!JSON.stringify(s).includes('dentro.ts') && !JSON.stringify(s).includes('HEAD'), 'interiores no enumerados');
});

test('O1-f · enlaces: uno oculto o excluido no se sigue; uno en una ruta visible se rechaza sin recorrer su destino', t => {
  need(); const w = workspace(), other = workspace();
  other.put('fuera/marcador.ts', CANARY);
  fs.mkdirSync(path.join(w.folder, 'tools'), { recursive: true });
  try { fs.symlinkSync(other.folder, path.join(w.folder, 'tools', '.oculto'), process.platform === 'win32' ? 'junction' : 'dir'); }
  catch (error) {
    // R2 (088): solo la falta de permiso o de soporte, identificada por código, es un límite del entorno y se declara como skip con motivo.
    // Cualquier otro error se propaga; nunca se devuelve verde sin aserciones. No se activan privilegios ni se cambian protecciones.
    if (['EPERM', 'EACCES', 'ENOTSUP'].includes(error?.code)) { t.skip('no se pudo crear el enlace (' + error.code + '): O1-f no se ejercita en este entorno'); return; }
    throw error;
  }
  w.put('tools/visible.mjs');
  const s = candidateSourceSelection(w.folder);
  // Un enlace no es isDirectory(): consta sin la barra final de los directorios reales, pero con el mismo motivo y sin recorrerse.
  assert.strictEqual(reasonOf(s, 'tools/.oculto'), 'hidden-name');
  assert.ok(!JSON.stringify(s).includes('marcador'), 'el destino del enlace oculto no se recorre');
  fs.mkdirSync(path.join(w.folder, 'src'), { recursive: true });
  fs.symlinkSync(other.folder, path.join(w.folder, 'src', 'visible-enlace'), process.platform === 'win32' ? 'junction' : 'dir');
  assert.throws(() => candidateSourceSelection(w.folder), /enlazadas/, 'un enlace visible dentro de una raíz aborta la selección');
});

test('O1-g · el inventario es estable: añadir o retirar auxiliares lo cambia y retirarlos lo restaura; cambiar bytes excluidos no lo cambia ni los presenta como capturados', () => {
  need(); const w = workspace(); w.put('src/a.ts');
  const a = candidateSourceSelection(w.folder);
  const file = w.put('src/notas.md', 'uno');
  const b = candidateSourceSelection(w.folder);
  assert.notDeepEqual(b, a, 'añadir un auxiliar cambia el inventario declarado');
  assert.deepEqual(paths(b), ['src/notas.md']);
  fs.writeFileSync(file, 'dos, bytes distintos y más largos');
  const c = candidateSourceSelection(w.folder);
  assert.deepEqual(c, b, 'cambiar el contenido de lo excluido no altera la selección (no fue capturado, así que no se "verifica")');
  assert.ok(!c.files.includes('src/notas.md'));
  fs.unlinkSync(file);
  assert.deepEqual(candidateSourceSelection(w.folder), a, 'retirar el auxiliar restaura el inventario original');
});

test('O1-h · orden determinista e independiente del orden de creación; sin duplicados', () => {
  need(); const one = workspace(), two = workspace();
  const names = ['src/z.ts', 'src/a.ts', 'server/m.ts', 'tools/b.mjs', 'public/q.bin', 'shared/Z.ts', 'src/notas.md', 'server/.x/y.ts', 'tests/a.txt'];
  for (const name of names) one.put(name);
  for (const name of [...names].reverse()) two.put(name);
  const a = candidateSourceSelection(one.folder), b = candidateSourceSelection(two.folder);
  assert.deepEqual(a, b);
  assert.deepEqual(a.files, [...a.files].sort());
  assert.deepEqual(paths(a), [...paths(a)].sort());
  assert.strictEqual(new Set(a.files).size, a.files.length);
});

test('O1-i · límites exactos: 2000 fuentes y 2000 exclusiones se admiten; una más aborta con error explícito', { timeout: 120_000 }, () => {
  need();
  // Fuentes: los 5 archivos raíz cuentan en el total, así que 1995 archivos de código llenan exactamente 2000.
  const ok = workspace(); for (let i = 0; i < 1995; i++) ok.put('src/f' + i + '.ts', '');
  assert.strictEqual(candidateSourceSelection(ok.folder).files.length, 2000);
  ok.put('src/uno-mas.ts', '');
  assert.throws(() => candidateSourceSelection(ok.folder), /Demasiadas/);
  const aux = workspace(); for (let i = 0; i < 2000; i++) aux.put('src/x' + i + '.txt', '');
  assert.strictEqual(candidateSourceSelection(aux.folder).excludedPaths.length, 2000);
  aux.put('src/x2000.txt', '');
  assert.throws(() => candidateSourceSelection(aux.folder), /Demasiadas/);
});

test('O1-j · importar el módulo no ejecuta la CLI: sin salida, sin código de error y sin crear candidatas', () => {
  need();
  const base = path.join(REPO, 'tests', '.tmp', 'release-candidates');
  const before = fs.existsSync(base) ? fs.readdirSync(base).length : 0;
  const run = spawnSync(process.execPath, ['--input-type=module', '-e', 'const m = await import(' + JSON.stringify(pathToFileURL(SCRIPT).href) + '); process.stdout.write(typeof m.candidateSourceSelection);'], { encoding: 'utf8', windowsHide: true, cwd: BASE });
  assert.strictEqual(run.status, 0, run.stderr);
  assert.strictEqual(run.stdout, 'function', 'solo la API; ninguna ayuda ni «Candidata:» impresa');
  assert.strictEqual(run.stderr, '');
  assert.strictEqual(fs.existsSync(base) ? fs.readdirSync(base).length : 0, before, 'importar no crea carpetas de candidata');
});

// ---------------------------------------------------------------- O2 (R2): la exclusión por nombre no distingue mayúsculas (SOURCE-CASE089, builder ae74ce22…)
// Oráculos positivos escritos a mano. El hallazgo O2 de la primera entrega (caracterización) queda sustituido: el builder corregido ya no captura variantes.
const VARIANTS = ['server/Data/', 'src/DATA/', 'tools/dAtA/', 'src/Dist/', 'scripts/DIST/', 'tools/Node_Modules/', 'server/NODE_MODULES/', 'src/Build/', 'shared/OUTPUTS/', 'tests/Test-Results/', 'src/.TMP/', 'tests/.Git/'];

test('O2-a · variantes de data, dist, node_modules, build, outputs, test-results, .tmp y .git en cualquier capitalización se excluyen con motivo y sin recorrerse', () => {
  need(); const w = workspace();
  for (const name of VARIANTS) w.put(name + 'dentro.ts', CANARY);
  w.put('src/ok.ts');
  const s = candidateSourceSelection(w.folder);
  for (const name of VARIANTS) assert.strictEqual(reasonOf(s, name), name.split('/').at(-2).startsWith('.') ? 'hidden-name' : 'excluded-name', 'excluido con su capitalización original: ' + name);
  assert.deepEqual(s.files.filter(f => !ROOT_FILES.includes(f)), ['src/ok.ts'], 'solo lo admisible se captura');
  assert.ok(!JSON.stringify(s).includes('dentro.ts') && !JSON.stringify(s).includes(CANARY), 'interiores no enumerados ni su contenido');
  assert.strictEqual(new Set(paths(s)).size, paths(s).length, 'cada variante se declara una sola vez');
});

test('O2-b · la capitalización original se conserva en las rutas declaradas (la comparación en minúsculas solo clasifica)', () => {
  need(); const w = workspace();
  w.put('server/Data/a.ts'); w.put('src/Dist/b.ts'); w.put('tools/Node_Modules/c.js'); w.put('src/Mayus.TS'); w.put('src/Notas.Md', CANARY);
  const s = candidateSourceSelection(w.folder);
  assert.deepEqual(paths(s), ['server/Data/', 'src/Dist/', 'src/Notas.Md', 'tools/Node_Modules/'], 'ninguna ruta se pasa a minúsculas');
  assert.ok(s.files.includes('src/Mayus.TS'), 'una fuente admisible conserva su nombre exacto');
});

test('O2-c · public/ es opaco también para estas variantes: Data, DATA y data bajo public/ se admiten; public/Dist sigue la política de dist', () => {
  need(); const w = workspace();
  // Un mismo directorio con tres capitalizaciones colapsa en NTFS: cada variante cuelga de un padre distinto para ser independiente del sistema de archivos.
  for (const name of ['public/Data/a.json', 'public/p/DATA/b.json', 'public/q/data/c.json', 'public/x/Data/d.bin']) w.put(name, '');
  w.put('public/Dist/e.js', '');
  const s = candidateSourceSelection(w.folder);
  for (const name of ['public/Data/a.json', 'public/p/DATA/b.json', 'public/q/data/c.json', 'public/x/Data/d.bin']) assert.ok(s.files.includes(name), 'admitido: ' + name);
  assert.strictEqual(reasonOf(s, 'public/Dist/'), 'excluded-name', 'public/Dist se excluye como dist, declarado');
  assert.ok(!s.files.includes('public/Dist/e.js'));
});

test('O2-d · un directorio de datos con otra capitalización no cuela contenido ni cambia el inventario al modificar sus bytes', () => {
  need(); const w = workspace(); w.put('src/a.ts');
  const file = w.put('server/Data/clientes.ts', CANARY);
  const before = candidateSourceSelection(w.folder);
  fs.writeFileSync(file, 'bytes distintos y más largos');
  assert.deepEqual(candidateSourceSelection(w.folder), before, 'lo excluido no forma parte de la selección: cambiar sus bytes no la altera');
  assert.ok(!before.files.some(f => f.startsWith('server/Data/')));
  assert.ok(!JSON.stringify(before).includes(CANARY));
});

// ---------------------------------------------------------------- caracterizaciones (no se exigen: documentan el comportamiento actual para que un cambio obligue a revisarlo)

test('CARACTERIZACIÓN O3 · los archivos raíz se listan aunque no existan: la selección no verifica su presencia', t => {
  need(); const w = workspace();
  const s = candidateSourceSelection(w.folder);
  t.diagnostic('O3: con un árbol vacío la selección devuelve ' + s.files.length + ' archivos raíz inexistentes; el fallo aparece después, al copiarlos, como candidata incompleta (honesto, pero tardío).');
  assert.deepEqual(s.files, [...ROOT_FILES].sort());
});
