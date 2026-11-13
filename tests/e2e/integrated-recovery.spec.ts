import { test, expect, type APIRequestContext, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { Store } from '../../server/store.js';
import { Recovery, simulatedRemote } from '../../server/recovery.js';
import { encodePortable, decodePortable } from '../../server/crypto.js';
import { bundleRevision } from '../../server/recovery-copy.js';
import { makeFixture, makeDemoSpec } from '../../shared/fixtures.js';
import { BundleSchema, type ContinuityBundle } from '../../shared/model.js';

// Opt-in integration against a named immutable build, never an existing installation or database.
const candidateId = process.env.PLANB_INTEGRATED_CANDIDATE;
const root = process.cwd(), origin = 'http://127.0.0.1:4393';
const localPassword = 'fixture-local-integration058', portablePassword = 'fixture-portable-integration058';
const hash = (bytes: Buffer | string) => createHash('sha256').update(bytes).digest('hex');
interface Artifact { path: string; sha256: string; bytes: number }
interface Session { folder: string; artifacts: Artifact[]; candidate: string; child: ChildProcess | null; pids: number[] }

function assertNoLinks(target: string) {
  const relative = path.relative(root, target);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw Error('Integration path outside the checkout.');
  let cursor = root;
  for (const part of relative.split(path.sep)) {
    cursor = path.join(cursor, part);
    if (fs.existsSync(cursor) && fs.lstatSync(cursor).isSymbolicLink()) throw Error('Integration refuses linked paths.');
  }
}
function artifactPath(folder: string, entry: Artifact) {
  if (!entry.path || entry.path.includes('\\') || entry.path.split('/').some(p => !p || p === '.' || p === '..') || path.isAbsolute(entry.path)) throw Error('Invalid artifact path.');
  const target = path.join(folder, entry.path); assertNoLinks(target); return target;
}
function createSession(): Session {
  if (!candidateId || !/^candidate-[a-f0-9-]{36}$/.test(candidateId)) throw Error('Set PLANB_INTEGRATED_CANDIDATE to an isolated candidate UUID.');
  const candidate = path.join(root, 'tests/.tmp/release-candidates', candidateId), runtime = path.join(candidate, 'runtime'); assertNoLinks(candidate);
  const manifest = JSON.parse(fs.readFileSync(path.join(candidate, 'manifest.json'), 'utf8'));
  if (manifest.state !== 'compiled-and-node-verified' || manifest.approved || manifest.deployed || !manifest.snapshotStable || !manifest.publicAssetCoverage?.complete) throw Error('Candidate has not passed its build checks or has the wrong scope.');
  const artifacts: Artifact[] = manifest.artifacts;
  if (!Array.isArray(artifacts) || !artifacts.length || artifacts.length > 100) throw Error('Missing bounded artifact inventory.');
  const parent = path.join(root, 'tests/.tmp/integrated058'); assertNoLinks(parent); fs.mkdirSync(parent, { recursive: true });
  const folder = path.join(parent, 'run-' + randomUUID()); fs.mkdirSync(folder); fs.mkdirSync(path.join(folder, 'runtime'));
  for (const item of artifacts) {
    const source = artifactPath(runtime, item), bytes = fs.readFileSync(source);
    if (bytes.length !== item.bytes || hash(bytes) !== item.sha256) throw Error('Candidate artifact differs: ' + item.path);
    const destination = artifactPath(path.join(folder, 'runtime'), item); fs.mkdirSync(path.dirname(destination), { recursive: true }); fs.writeFileSync(destination, bytes, { flag: 'wx' });
  }
  fs.writeFileSync(path.join(folder, 'inventory.json'), JSON.stringify({ candidateId, artifacts }, null, 2));
  return { folder, artifacts, candidate, child: null, pids: [] };
}
async function fixture(uncertain: boolean): Promise<ContinuityBundle> {
  const store = new Store(':memory:');
  try {
    const snapshot = makeFixture();
    for (const record of snapshot.records.filter(r => r.entity === 'contacts' && ['contact-1', 'contact-2'].includes(r.id))) {
      record.values.firstname = 'Clara Misión058'; record.values.lastname = 'Gemela'; record.values.phone = record.id + '-initial058';
    }
    store.importSnapshot(snapshot); store.saveGeneration(makeDemoSpec(snapshot), { provider: 'demo', model: null, generatedAt: new Date().toISOString(), prompt: '', approved: false }); store.activate(); store.set('disconnected', true);
    if (uncertain) {
      store.saveRecord('contacts', { phone: 'fixture-uncertain058' }, 'contact-1');
      const recovery = new Recovery(store), plan = await recovery.preview({ ...simulatedRemote(store), source: 'hubspot' }); recovery.approve(plan.id);
      const bundle = store.bundle(); bundle.returnState!.plan!.status = 'complete'; bundle.returnState!.plan!.operations[0].status = 'sending'; return bundle;
    }
    return store.bundle();
  } finally { store.close(); }
}
async function start(session: Session) {
  if (session.child) throw Error('Runtime already running.');
  const runtime = path.join(session.folder, 'runtime'), keep = new Set(['path', 'systemroot', 'windir', 'comspec', 'pathext', 'temp', 'tmp', 'tmpdir', 'lang', 'lc_all', 'lc_ctype', 'tz']);
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => keep.has(key.toLowerCase())));
  Object.assign(env, { NODE_ENV: 'test', PLANB_PORT: '4393', PLANB_DATA_DIR: path.join(runtime, 'fresh-data') });
  const child = spawn(process.execPath, ['--require', path.join(runtime, 'block-external.cjs'), path.join(runtime, 'runtime.mjs')], { cwd: runtime, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  session.child = child; if (child.pid) session.pids.push(child.pid);
  const log = fs.createWriteStream(path.join(session.folder, 'runtime-' + session.pids.length + '.log'));
  for (const stream of [child.stdout, child.stderr]) stream!.on('data', bytes => log.write(bytes)); child.once('close', () => log.end());
  await new Promise<void>((resolve, reject) => {
    let output = ''; const timeout = setTimeout(() => finish(Error('Own compiled runtime did not start.')), 30000);
    const onData = (bytes: Buffer) => { output += bytes.toString(); if (output.includes('Abre ' + origin)) finish(); };
    const onExit = () => finish(Error('Own compiled runtime exited before listening; see its isolated log.'));
    const onError = (error: Error) => finish(error);
    function finish(error?: Error) { clearTimeout(timeout); child.stdout!.off('data', onData); child.off('exit', onExit); child.off('error', onError); error ? reject(error) : resolve(); }
    child.stdout!.on('data', onData); child.once('exit', onExit); child.once('error', onError);
  });
}
async function stop(session: Session) {
  const child = session.child; session.child = null; if (!child || child.exitCode !== null || child.signalCode !== null) return;
  const ended = once(child, 'close'); child.kill('SIGTERM'); await ended;
}
async function setup(request: APIRequestContext, login = false) {
  if (login) expect((await request.get(origin + '/api/records')).status()).toBe(401);
  const response = await request.post(origin + '/api/v2/auth/' + (login ? 'login' : 'setup'), { data: { password: localPassword } }); expect(response.ok()).toBeTruthy();
}
async function restore(page: Page, raw: string, wrongFirst = false) {
  await page.goto(origin); await expect(page).toHaveTitle('Plan B · Tu CRM sigue contigo');
  await page.getByRole('button', { name: 'Restaurar archivo', exact: true }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Restaurar una copia', exact: true });
  await dialog.getByLabel('Archivo JSON de Plan B', { exact: true }).setInputFiles({ name: 'fixture058.json', mimeType: 'application/json', buffer: Buffer.from(raw) });
  if (wrongFirst) {
    await dialog.getByLabel('Contraseña de recuperación, si está cifrado', { exact: true }).fill('wrong-fixture058'); await dialog.getByRole('button', { name: 'Validar y restaurar', exact: true }).click();
    await expect(dialog.getByRole('alert')).toContainText('contraseña es incorrecta');
    expect((await page.request.get(origin + '/api/v2/state').then(r => r.json())).ready).toBeFalsy();
  }
  await dialog.getByLabel('Contraseña de recuperación, si está cifrado', { exact: true }).fill(portablePassword); await dialog.getByRole('button', { name: 'Validar y restaurar', exact: true }).click(); await expect(dialog).toBeHidden();
}
function assertArtifacts(session: Session) {
  for (const item of session.artifacts) {
    expect(hash(fs.readFileSync(artifactPath(path.join(session.candidate, 'runtime'), item)))).toBe(item.sha256);
    expect(hash(fs.readFileSync(artifactPath(path.join(session.folder, 'runtime'), item)))).toBe(item.sha256);
  }
  expect(new Set(session.pids).size).toBe(2);
}
async function observe(page: Page) {
  const errors: string[] = [], outside: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.route('**/*', route => { const url = new URL(route.request().url()); if (url.origin !== origin) { outside.push(url.origin); return route.abort(); } return route.fallback(); });
  return { errors, outside };
}

test('integrated058: encrypted restore, homonym search, edit, reviewed download and persistence across two compiled runtime processes', async ({ page }, info) => {
  const session = createSession(), bundle = await fixture(false), raw = encodePortable(bundle, portablePassword), traffic = await observe(page);
  fs.writeFileSync(path.join(session.folder, 'runtime/continuity.encrypted.json'), raw, { flag: 'wx' });
  try {
    await start(session); await setup(page.request); await restore(page, raw, true);
    expect((await page.request.get(origin + '/api/v4/export-summary').then(r => r.json())).revision).toBe(bundleRevision(bundle));
    await page.getByRole('button', { name: 'Buscar en toda la copia', exact: true }).click();
    const search = page.getByRole('dialog', { name: 'Buscar en toda la copia', exact: true }); await search.getByRole('searchbox').fill('clara mision058 gemela'); await expect(search.getByRole('listitem')).toHaveCount(2);
    await search.getByRole('button').filter({ hasText: 'ID contact-2' }).click();
    const editor = page.getByRole('dialog', { name: 'Clara Misión058 Gemela', exact: true }); await expect(editor.getByLabel('Teléfono', { exact: true })).toHaveValue('contact-2-initial058');
    await editor.getByLabel('Teléfono', { exact: true }).fill('600-058-after-restore'); await editor.getByRole('button', { name: 'Guardar cambios', exact: true }).click(); await expect(editor).toBeHidden();
    await page.getByRole('button', { name: 'Exportar', exact: true }).click(); const view = page.locator('.export-page');
    await expect(view.getByRole('heading', { name: 'Qué contiene esta descarga', exact: true })).toBeVisible();
    await view.getByLabel('Contraseña de recuperación', { exact: true }).fill(portablePassword); await view.getByLabel('Repite la contraseña', { exact: true }).fill(portablePassword);
    await expect(view.getByRole('button', { name: 'Solo copia cifrada', exact: true })).toBeDisabled();
    await view.getByLabel('He revisado la captura y los cambios incluidos en esta descarga.', { exact: true }).check();
    const summary = await page.request.get(origin + '/api/v4/export-summary').then(r => r.json());
    const [download] = await Promise.all([page.waitForEvent('download'), view.getByRole('button', { name: 'Solo copia cifrada', exact: true }).click()]);
    const file = info.outputPath('integrated058-encrypted.json'); await download.saveAs(file);
    const exported = BundleSchema.parse(decodePortable(fs.readFileSync(file, 'utf8'), portablePassword));
    expect(bundleRevision(exported)).toBe(summary.revision); expect(exported.changes).toHaveLength(bundle.changes.length + 1);
    expect(exported.records.find(r => r.entity === 'contacts' && r.id === 'contact-2')!.values.phone).toBe('600-058-after-restore');
    await expect(view.getByRole('status')).toContainText('preparado para descargar');
    await stop(session); await start(session); await setup(page.request, true);
    const resumed = await page.request.get(origin + '/api/v4/export-summary').then(r => r.json()); expect(resumed.revision).toBe(summary.revision);
    const query = await page.request.get(origin + '/api/v2/search?q=600-058-after-restore').then(r => r.json()); expect(query.items.map((r: { id: string }) => r.id)).toEqual(['contact-2']);
    const changes = await page.request.get(origin + '/api/v2/changes').then(r => r.json()); expect(changes.changes).toEqual(exported.changes);
    await page.reload(); await page.getByRole('button', { name: 'Buscar en toda la copia', exact: true }).click(); await search.getByRole('searchbox').fill('600-058-after-restore'); await expect(search.getByRole('listitem')).toHaveCount(1);
    await page.screenshot({ path: info.outputPath('integrated058-after-restart.png') });
    assertArtifacts(session); expect(traffic.errors).toEqual([]); expect(traffic.outside).toEqual([]);
    await info.attach('isolated-processes', { body: JSON.stringify({ folder: session.folder, pids: session.pids, candidateId, revision: summary.revision }), contentType: 'application/json' });
  } finally { await stop(session); }
});

test('integrated058: sending under complete is restored as uncertain, exported honestly and still blocks writes after restart', async ({ page }, info) => {
  const session = createSession(), bundle = await fixture(true), raw = encodePortable(bundle, portablePassword), traffic = await observe(page);
  fs.writeFileSync(path.join(session.folder, 'runtime/continuity.encrypted.json'), raw, { flag: 'wx' });
  try {
    await start(session); await setup(page.request); await restore(page, raw);
    const state = await page.request.get(origin + '/api/v2/changes').then(r => r.json());
    expect(state.plan.status).toBe('partial'); expect(state.plan.approvedAt).toBeNull(); expect(state.plan.operations.filter((op: { status: string }) => op.status === 'uncertain')).toHaveLength(1);
    expect(state.plan.operations.some((op: { status: string }) => op.status === 'sending')).toBeFalsy(); expect(state.changes).toEqual(bundle.changes);
    expect((await page.request.patch(origin + '/api/records/contacts/contact-2', { data: { values: { phone: 'must-not-write058' } } })).status()).toBe(409);
    const exported = await page.request.post(origin + '/api/v2/export/encrypted', { data: { password: portablePassword } }); expect(exported.ok()).toBeTruthy();
    const decoded = BundleSchema.parse(decodePortable(await exported.text(), portablePassword)); expect(decoded.returnState!.plan!.status).toBe('partial'); expect(decoded.returnState!.plan!.operations[0].status).toBe('uncertain');
    await stop(session); await start(session); await setup(page.request, true);
    const resumed = await page.request.get(origin + '/api/v2/changes').then(r => r.json()); expect(resumed.plan).toEqual(state.plan); expect(resumed.changes).toEqual(state.changes);
    expect((await page.request.patch(origin + '/api/records/contacts/contact-2', { data: { values: { phone: 'must-not-write058' } } })).status()).toBe(409);
    const found = await page.request.get(origin + '/api/v2/search?q=clara%20mision058').then(r => r.json()); expect(found.items).toHaveLength(2);
    assertArtifacts(session); expect(traffic.errors).toEqual([]); expect(traffic.outside).toEqual([]);
    await info.attach('isolated-processes', { body: JSON.stringify({ folder: session.folder, pids: session.pids, candidateId, uncertain: 1 }), contentType: 'application/json' });
  } finally { await stop(session); }
});
