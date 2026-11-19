import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { createBoard } from '../tools/coordination/core.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const hash = value => createHash('sha256').update(value).digest('hex');
const extensions = new Set(['.ts', '.tsx', '.mjs', '.cjs', '.js', '.css', '.svg', '.html']);
const roots = ['src', 'shared', 'server', 'scripts', 'tests', 'tools', 'public'];
const rootFiles = ['package.json', 'tsconfig.json', 'vite.config.ts', 'playwright.config.ts', 'index.html'];
const excluded = new Set(['.tmp', 'outputs', 'node_modules', 'dist', 'build', 'test-results', '.git']);
const entries = {
  'server.mjs': 'server/main.ts', 'runtime.mjs': 'server/runtime.ts', 'drill.mjs': 'server/drill-worker.ts',
  'team.mjs': 'server/team/main.ts', 'copilot-worker.mjs': 'server/team/copilot-worker.ts', 'pilot-alias.mjs': 'server/team/pilot-alias.ts',
};
const tests = [
  'continuity-lab.test.ts', 'response-queue.test.ts', 'response-queue-api.test.ts', 'capture-comparison.test.ts',
  'capture-comparison-api.test.ts', 'recovery-preflight.test.ts', 'recovery-preflight-cli.test.ts',
  'customer-combobox.test.ts', 'ui-journeys.test.ts', 'design-tokens.test.ts',
];
export function candidateSourceSelection(sourceRoot = root) {
  const files = [...rootFiles], excludedPaths = [];
  function walk(relative) {
    const target = path.join(sourceRoot, relative);
    let stat;
    try { stat = fs.lstatSync(target); }
    catch (error) {
      if (error.code === 'ENOENT') return;
      throw error;
    }
    // Inspect the entry itself so a link with a missing target cannot look like an absent root.
    if (stat.isSymbolicLink()) throw Error('No se capturan fuentes enlazadas.');
    for (const entry of fs.readdirSync(target, { withFileTypes: true })) {
      const name = relative + '/' + entry.name;
      const classification = entry.name.toLowerCase();
      if (excluded.has(classification) || entry.name.startsWith('.') || classification === 'data' && !name.startsWith('public/')) {
        excludedPaths.push({path:name+(entry.isDirectory()?'/':''),reason:entry.name.startsWith('.')?'hidden-name':'excluded-name'});
        continue;
      }
      if (entry.isSymbolicLink()) throw Error('No se capturan fuentes enlazadas.');
      if (entry.isDirectory()) walk(name);
      // Public and imported assets are opaque: extensions/case must not silently drop fonts, images or notices.
      else if (name.startsWith('public/') || name.startsWith('src/assets/') || extensions.has(path.extname(entry.name).toLowerCase())) files.push(name);
      else excludedPaths.push({path:name,reason:'unlisted-extension'});
    }
  }
  for (const directory of roots) walk(directory);
  if (files.length > 2000 || excludedPaths.length > 2000) throw Error('Demasiadas fuentes o exclusiones para una captura acotada.');
  return {roots:[...roots],rootFiles:[...rootFiles],files:files.sort(),excludedPaths:excludedPaths.sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0),repositoryImage:false};
}
function checkedFile(relative) {
  const target = path.join(root, relative);
  if (fs.lstatSync(target).isSymbolicLink() || !fs.statSync(target).isFile()) throw Error('Entrada no regular.');
  const bytes = fs.readFileSync(target);
  if (bytes.length > 2_000_000) throw Error('Fuente superior al límite de 2 MB.');
  return bytes;
}
function snapshotStillMatches(files, selection) {
  try { return JSON.stringify(candidateSourceSelection()) === JSON.stringify(selection) && files.every(file => hash(checkedFile(file.path)) === file.sha256); }
  catch { return false; }
}
function owners(files, board) {
  const set = new Set(files.map(file => file.path));
  return board.tasks.filter(task => task.reserved && task.files.some(file => set.has(file))).map(task => ({
    id: task.id, agent: task.agent, status: task.status, files: task.files.filter(file => set.has(file)),
  }));
}
function artifacts(folder) {
  const result = [];
  function walk(relative = '') {
    for (const entry of fs.readdirSync(path.join(folder, relative), { withFileTypes: true })) {
      const name = relative ? relative + '/' + entry.name : entry.name;
      if (entry.isSymbolicLink()) throw Error('Artefacto enlazado inesperado.');
      if (entry.isDirectory()) walk(name);
      else { const bytes = fs.readFileSync(path.join(folder, name)); result.push({ path: name, bytes: bytes.length, sha256: hash(bytes) }); }
    }
  }
  walk(); return result.sort((a, b) => a.path < b.path ? -1 : 1);
}

async function prepare() {
  const base = path.join(root, 'tests', '.tmp', 'release-candidates');
  fs.mkdirSync(base, { recursive: true });
  // Every candidate is a fresh directory. No delete, overwrite, runtime update or process control.
  const folder = path.join(base, 'candidate-' + randomUUID()); fs.mkdirSync(folder);
  const snapshot = path.join(folder, 'source'), runtime = path.join(folder, 'runtime'), logs = path.join(folder, 'logs');
  for (const dir of [snapshot, runtime, logs]) fs.mkdirSync(dir);
  const board = createBoard(root), initialBoard = board.load();
  const manifest = {
    format: 'planb-candidate-v1', createdAt: new Date().toISOString(), state: 'capturing', approved: false,
    deployed: false, releaseEligible: false, folder, snapshot, runtime, boardRevision: initialBoard.revision,
    files: [], sourceOwners: [], checks: [], artifacts: [], blockers: [], excludedPublicPaths: [],
    limitations: ['Fuente capturada no equivale a entrega revisada.', 'No modifica instalaciones ni incluye bases, secretos o credenciales.', 'Validación Node/API; E2E y recorrido visual requieren una ventana de navegador coordinada.'],
  };
  const save = () => fs.writeFileSync(path.join(folder, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  save(); console.log('Candidata: ' + folder);
  try {
    const selection = candidateSourceSelection(), names = selection.files;
    manifest.sourceSelection = {roots:selection.roots,rootFiles:selection.rootFiles,excludedPaths:selection.excludedPaths,repositoryImage:false};
    manifest.excludedPublicPaths = selection.excludedPaths.filter(file=>file.path.startsWith('public/')).map(file=>file.path); save();
    let total = 0;
    for (const name of names) {
      const bytes = checkedFile(name); total += bytes.length; if (total > 50_000_000) throw Error('Captura de fuentes superior a 50 MB.');
      const output = path.join(snapshot, name); fs.mkdirSync(path.dirname(output), { recursive: true });
      fs.writeFileSync(output, bytes, { flag: 'wx' }); manifest.files.push({ path: name, bytes: bytes.length, sha256: hash(bytes) });
    }
    if (!snapshotStillMatches(manifest.files, selection)) throw Error('Las fuentes cambiaron durante la captura; conservar candidata incompleta y repetir con otro identificador.');
    manifest.snapshotStable = true; manifest.sourceOwners = owners(manifest.files, initialBoard); manifest.state = 'checking'; save();
    const guard = path.join(snapshot, 'scripts', 'block-external.cjs');
    // Children need executable discovery and OS scratch paths, not arbitrary shell/provider credentials.
    const environmentKeys = new Set(['path', 'systemroot', 'windir', 'comspec', 'pathext', 'temp', 'tmp', 'tmpdir', 'lang', 'lc_all', 'lc_ctype', 'tz', 'processor_architecture', 'number_of_processors']);
    const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => environmentKeys.has(key.toLowerCase())));
    function run(name, args, extraEnv = {}) {
      console.log('Comprobando: ' + name);
      const child = spawnSync(process.execPath, ['--require', guard, ...args], { cwd: snapshot, env: { ...env, ...extraEnv }, windowsHide: true, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, timeout: 300_000 });
      fs.writeFileSync(path.join(logs, name + '.log'), (child.stdout ?? '') + (child.stderr ?? ''));
      const ok = child.status === 0; manifest.checks.push({ name, ok, exitCode: child.status, errorCode: child.error?.code ?? null }); save();
      if (!ok) throw Error('No supera ' + name + '; consulta el log de la candidata.');
    }
    run('typecheck', [path.join(root, 'node_modules', 'typescript', 'bin', 'tsc'), '--noEmit', '--project', path.join(snapshot, 'tsconfig.json')]);
    run('vite', [path.join(root, 'node_modules', 'vite', 'bin', 'vite.js'), 'build', '--config', path.join(snapshot, 'vite.config.ts'), '--outDir', path.join(runtime, 'dist')]);
    for (const [output, input] of Object.entries(entries)) {
      run('bundle-' + output, [path.join(root, 'node_modules', 'esbuild', 'bin', 'esbuild'), input, '--bundle', '--platform=node', '--format=esm', '--packages=external', '--outfile=' + path.join(runtime, output)]);
    }
    fs.copyFileSync(guard, path.join(runtime, 'block-external.cjs'));
    fs.mkdirSync(path.join(runtime, 'scripts')); fs.copyFileSync(guard, path.join(runtime, 'scripts', 'block-external.cjs'));
    for (const file of manifest.files.filter(file => file.path.startsWith('public/'))) {
      const output = path.join(runtime, 'dist', file.path.slice(7));
      if (!fs.existsSync(output) || hash(fs.readFileSync(output)) !== file.sha256) throw Error('Activo público ausente o distinto: ' + file.path);
    }
    // Vite emits imported binary assets, but not their accompanying notices. Retain those text files as well.
    for (const file of manifest.files.filter(file => file.path.startsWith('src/assets/') && /\.(txt|md)$/i.test(file.path))) {
      const output = path.join(runtime, 'dist', file.path.slice(4)), bytes = fs.readFileSync(path.join(snapshot, file.path));
      if (hash(bytes) !== file.sha256) throw Error('Aviso de activo modificado: ' + file.path);
      if (fs.existsSync(output)) {
        if (hash(fs.readFileSync(output)) !== file.sha256) throw Error('Colisión de aviso de activo: ' + file.path);
      } else { fs.mkdirSync(path.dirname(output), { recursive: true }); fs.writeFileSync(output, bytes, { flag: 'wx' }); }
    }
    manifest.checks.push({ name: 'public-assets', ok: true }); save();
    manifest.publicAssetCoverage = { captured: manifest.files.filter(file => file.path.startsWith('public/')).length, excluded: manifest.excludedPublicPaths.length, complete: manifest.excludedPublicPaths.length === 0 }; save();
    run('node-integration', ['--import', 'tsx', '--test', '--test-concurrency=1', ...tests.map(name => path.join(snapshot, 'tests', name))], { PLANB_UI_SRC: path.join(snapshot, 'src') });
    manifest.artifacts = artifacts(runtime); manifest.liveSourcesStillMatch = snapshotStillMatches(manifest.files, selection);
    manifest.sourceOwnersAtCompletion = owners(manifest.files, board.load());
    manifest.blockers = [
      ...manifest.sourceOwnersAtCompletion.map(task => 'SOURCE_NOT_ACCEPTED:' + task.id + ':' + task.status),
      ...manifest.excludedPublicPaths.map(name => 'PUBLIC_PATH_EXCLUDED:' + name),
      ...selection.excludedPaths.filter(file=>file.reason==='unlisted-extension'&&!file.path.startsWith('public/')).map(file=>'SOURCE_AUXILIARY_EXCLUDED:'+file.path),
      ...(!manifest.liveSourcesStillMatch ? ['LIVE_SOURCE_CHANGED_AFTER_SNAPSHOT'] : []),
      'E2E_AND_VISUAL_REVIEW_PENDING',
    ];
    manifest.state = 'compiled-and-node-verified'; manifest.completedAt = new Date().toISOString(); save();
    console.log(JSON.stringify({ state: manifest.state, folder, sourceFiles: manifest.files.length, artifactFiles: manifest.artifacts.length, approved: false, deployed: false, blockers: manifest.blockers }, null, 2));
  } catch (error) {
    manifest.state = 'incomplete'; manifest.error = error instanceof Error ? error.message : 'Error de preparación.'; save();
    console.error(manifest.error); process.exitCode = 1;
  }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
if (process.argv.length === 2 || process.argv.length === 3 && process.argv[2] === '--help') {
  console.log('Plan B · candidata aislada\nUso: node scripts/prepare-release-candidate.mjs --prepare\nSin --prepare solo muestra ayuda. Captura código, compila y prueba en tests/.tmp; no instala, reinicia ni despliega.');
} else if (process.argv.length === 3 && process.argv[2] === '--prepare') await prepare();
else { console.error('Argumentos no admitidos. Usa --help.'); process.exitCode = 2; }
}
