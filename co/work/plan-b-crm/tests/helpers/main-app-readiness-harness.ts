import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const sha = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
const INPUTS = ['CODEX-SEARCH-053', 'CODEX-NAVIGATION-117', 'CODEX-OPERATIONS-118', 'CLAUDE-INTEGRATIONS-119', 'CODEX-OPERATIONS-MOUNT-120'];
type Manifest = { at: string; revision: number; files: Record<string, string>; tasks: Record<string, Record<string, string>> };
export interface Candidate { root: string; source: string; manifest: Manifest }

/** Never edits the live checkout. Only freezes a submitted integration cut. */
export function freezeMainApp(repo = process.cwd()): Candidate {
  const board = JSON.parse(fs.readFileSync(path.join(repo, 'coordination', 'board.json'), 'utf8')) as { revision: number; tasks: { id: string; status: string; files: string[]; submitted: Record<string, string> | null }[] };
  const tasks: Manifest['tasks'] = {};
  for (const id of INPUTS) {
    const task = board.tasks.find(item => item.id === id);
    if (!task || !['review', 'done'].includes(task.status) || !task.submitted) throw new Error(id + ' todavía no tiene una versión presentada para congelar.');
    for (const file of task.files) if (sha(fs.readFileSync(path.join(repo, file))) !== task.submitted[file]) throw new Error('Cambió después de presentar: ' + file);
    tasks[id] = { ...task.submitted };
  }
  const app = fs.readFileSync(path.join(repo, 'src/App.tsx'), 'utf8');
  if (!app.includes('LocalIntegrations') || !app.includes('LocalOperations')) throw new Error('Falta el montaje de los módulos nuevos en App.');
  const root = path.join(repo, 'tests', '.tmp', 'main-app121-' + randomUUID()), source = path.join(root, 'source');
  fs.mkdirSync(source, { recursive: true });
  const files: Record<string, string> = {};
  const listed = execFileSync('rg', ['--files', 'src', 'shared', 'server', 'public'], { cwd: repo, encoding: 'utf8', windowsHide: true }).trim().split(/\r?\n/);
  for (const rel of [...listed, 'index.html', 'package.json', 'tsconfig.json']) {
    const parts = rel.replaceAll('\\', '/').split('/');
    if (parts.some(part => part.startsWith('.') || /(?:secret|credential|\.enc$)/i.test(part))) throw new Error('Archivo no publicable en inventario: ' + rel);
    const original = path.resolve(repo, rel);
    if (!original.startsWith(path.resolve(repo) + path.sep) || fs.lstatSync(original).isSymbolicLink()) throw new Error('Fuente enlazada o fuera del repositorio.');
    const bytes = fs.readFileSync(original); files[rel] = sha(bytes);
    const destination = path.join(source, rel); fs.mkdirSync(path.dirname(destination), { recursive: true }); fs.writeFileSync(destination, bytes, { flag: 'wx' });
  }
  for (const [rel, hash] of Object.entries(files)) if (sha(fs.readFileSync(path.join(repo, rel))) !== hash) throw new Error('Las fuentes cambiaron durante la captura; conserva este intento y prepara otro corte.');
  const manifest = { at: new Date().toISOString(), revision: board.revision, tasks, files };
  fs.writeFileSync(path.join(root, 'manifest.json'), JSON.stringify(manifest, null, 2), { flag: 'wx' });
  return { root, source, manifest };
}

export async function buildMainApp(candidate: Candidate) {
  const { build } = await import('vite'), { default: react } = await import('@vitejs/plugin-react');
  const dist = path.join(candidate.root, 'dist');
  await build({ root: candidate.source, configFile: false, envDir: path.join(candidate.root, 'empty-env'), base: './', plugins: [react()],
    logLevel: 'warn', build: { outDir: dist, emptyOutDir: false } });
  const entry = path.join(candidate.root, 'backend-entry.ts');
  const from = (rel: string) => JSON.stringify(path.join(candidate.source, rel).replaceAll('\\', '/'));
  fs.writeFileSync(entry, `export{createBaseApp}from${from('server/app.ts')};export{makeFixture,makeDemoSpec}from${from('shared/fixtures.ts')};export{registerTeamSync}from${from('server/team-sync.ts')};`);
  const esbuild = await import('esbuild');
  await esbuild.build({ entryPoints: [entry], bundle: true, packages: 'external', platform: 'node', format: 'esm', outfile: path.join(candidate.root, 'backend.mjs'), logLevel: 'warning' });
  return dist;
}

export async function startMainApp(candidate: Candidate, active: boolean, port = 0) {
  const runtime = await import(pathToFileURL(path.join(candidate.root, 'backend.mjs')).href) as typeof import('../../server/app.js') & typeof import('../../shared/fixtures.js') & typeof import('../../server/team-sync.js');
  const fixture = await runtime.createBaseApp({ root: candidate.root, dbPath: ':memory:', staticDir: path.join(candidate.root, 'dist') });
  const snapshot = runtime.makeFixture('agency'); fixture.store.importSnapshot(snapshot);
  if (active) { fixture.store.saveGeneration(runtime.makeDemoSpec(snapshot), { provider: 'demo', model: null, generatedAt: new Date().toISOString(), prompt: '', approved: false }); fixture.store.activate(); }
  runtime.registerTeamSync(fixture.app, fixture.store, undefined, false);
  try { await fixture.app.listen({ host: '127.0.0.1', port }); }
  catch (error) { await fixture.app.close(); throw error; }
  const address = fixture.app.server.address();
  if (!address || typeof address === 'string') { await fixture.app.close(); throw new Error('Sin puerto propio confirmado.'); }
  return { ...fixture, url: 'http://127.0.0.1:' + address.port, instanceId: fixture.store.get('instanceId', null), close: () => fixture.app.close() };
}

export function checkCandidate(candidate: Candidate) {
  for (const [rel, expected] of Object.entries(candidate.manifest.files)) if (sha(fs.readFileSync(path.join(candidate.source, rel))) !== expected) throw new Error('Cambió el snapshot: ' + rel);
}
