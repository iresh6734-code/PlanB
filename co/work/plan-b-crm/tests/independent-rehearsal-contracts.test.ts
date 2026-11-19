import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Store } from '../server/store.js';
import { encodePortable } from '../server/crypto.js';
import { bundleRevision } from '../server/recovery-copy.js';
import type { RecoveryRehearsalReport } from '../server/recovery-rehearsal.js';
import { makeFixture, makeDemoSpec } from '../shared/fixtures.js';
import type { ContinuityBundle, CrmSnapshot } from '../shared/model.js';

// CLAUDE-QA-060 · C (ensayo de recuperación): límites de admisión, protocolo del worker y persistencia entre PROCESOS distintos.  QA079 · F4: AISLAMIENTO REAL.
// Antes (baseline075) esta prueba y las dos de Codex compartían tests/.tmp/recovery-rehearsals y comparaban su listado antes/después; en paralelo se leían carpetas ajenas (2 de 3 intentos de Codex, 3 de 3 míos en QA079).
// Ahora cada ejecución crea un workspace PRIVADO con un UUID nuevo bajo tests/.tmp (solo fuentes: server/, shared/, scripts/block-external.cjs y scripts/rehearse-portable-recovery.ts; sin bases, claves,
// .env, .ai.local.json ni dependencias; se registra su procedencia con hashes en SOURCES.json) y el código bajo prueba se carga DESDE esa copia, de modo que su raíz de ensayos es privada. No se ejecuta en serie,
// no se borra ninguna carpeta y las aserciones siguen exigiendo EXACTAMENTE las carpetas propias (runId), no «alguna». Datos ficticios; contraseñas ficticias que no deben aparecer en los informes.
// QA079_REHEARSAL_ROOT=shared es el CONTROL NEGATIVO: vuelve a usar la raíz compartida del proyecto (diseño anterior) para demostrar que F4a/C3/C5 fallan cuando no hay aislamiento.
const PROJECT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), OLD_ROOT = path.join(PROJECT, 'tests/.tmp/recovery-rehearsals'), SHARED = process.env.QA079_REHEARSAL_ROOT === 'shared';
function privateWorkspace() {
  const base = process.env.QA079_WORKSPACE_PARENT ? path.resolve(process.env.QA079_WORKSPACE_PARENT) : path.join(PROJECT, 'tests/.tmp'); fs.mkdirSync(base, { recursive: true });   // QA079_WORKSPACE_PARENT permite alojar los workspaces en una carpeta de evidencia propia
  const dir = fs.mkdtempSync(path.join(base, 'independent-rehearsal-ws-')), sources: Record<string, string> = {};
  const copy = (relative: string) => {
    const from = path.join(PROJECT, relative), stat = fs.lstatSync(from); if (stat.isSymbolicLink()) throw new Error('fuente enlazada: ' + relative);
    if (stat.isDirectory()) { for (const entry of fs.readdirSync(from, { withFileTypes: true })) { if (entry.name.startsWith('.') || ['node_modules', 'dist', 'build', 'data', 'tmp'].includes(entry.name)) continue; copy(path.posix.join(relative, entry.name)); } return; }
    const to = path.join(dir, relative); fs.mkdirSync(path.dirname(to), { recursive: true }); const bytes = fs.readFileSync(from); fs.writeFileSync(to, bytes); sources[relative] = createHash('sha256').update(bytes).digest('hex');
  };
  for (const relative of ['server', 'shared', 'scripts/block-external.cjs', 'scripts/rehearse-portable-recovery.ts']) copy(relative);
  fs.writeFileSync(path.join(dir, 'package.json'), '{"private":true,"type":"module"}'); fs.writeFileSync(path.join(dir, 'SOURCES.json'), JSON.stringify({ origin: PROJECT, copiedAt: new Date().toISOString(), files: sources }, null, 1));
  fs.mkdirSync(path.join(dir, 'tests/.tmp'), { recursive: true }); return dir;
}
const root = SHARED ? PROJECT : privateWorkspace(), parent = path.join(root, 'tests/.tmp/recovery-rehearsals'), scratch = path.join(root, 'tests/.tmp/qa079-scratch');
fs.mkdirSync(scratch, { recursive: true });
const { rehearsePortableRecovery, MAX_REHEARSAL_BYTES } = await import(pathToFileURL(path.join(root, 'server/recovery-rehearsal.ts')).href) as typeof import('../server/recovery-rehearsal.js');
const runs = () => fs.existsSync(parent) ? fs.readdirSync(parent).sort() : [];
const added = (before: string[]) => runs().filter(name => !before.includes(name));
const cli = (...args: string[]) => spawnSync(process.execPath, ['--import', 'tsx', 'scripts/rehearse-portable-recovery.ts', ...args], { cwd: root, encoding: 'utf8', timeout: 180_000, windowsHide: true });
const workerEnv = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/API_KEY|TOKEN|SECRET|PASSWORD|DATABASE_URL|^PG|^PLANB_|NODE_OPTIONS/i.test(key)));
const worker = (input: unknown) => spawnSync(process.execPath, ['--require', path.join(root, 'scripts/block-external.cjs'), '--import', 'tsx', path.join(root, 'server/recovery-rehearsal-worker.ts')], { cwd: root, env: workerEnv, encoding: 'utf8', timeout: 60_000, input: typeof input === 'string' ? input : JSON.stringify(input), windowsHide: true });
const parse = (stdout: string) => JSON.parse(stdout) as { phase: string; pid: number; success: boolean; checks: { code: string; passed: boolean }[]; state?: unknown };
const PASSWORD = 'qa060-ensayo-ficticio-12', MARK = 'qa060-telefono-ficticio';
function makeBundle(mutate?: (snapshot: CrmSnapshot) => void): ContinuityBundle {
  const store = new Store(':memory:'), snapshot = makeFixture();
  try {
    mutate?.(snapshot);
    for (const entity of snapshot.entities) snapshot.manifest.expectedCounts[entity.id] = snapshot.records.filter(r => r.entity === entity.id).length;
    store.importSnapshot(snapshot); store.saveGeneration(makeDemoSpec(snapshot), { provider: 'demo', model: null, generatedAt: new Date().toISOString(), prompt: '', approved: false }); store.activate();
    store.saveRecord('contacts', { phone: MARK }, 'contact-1');
    return store.bundle();
  } finally { store.close(); }
}
const sealed = (bundle: unknown, password = PASSWORD) => encodePortable(bundle, password);
const uuidFolder = () => 'run-' + randomUUID();
// Sin reintentos: en un workspace privado nadie más crea carpetas, así que «no se creó nada» se exige en el primer intento (antes bastaba 1 de 3 y eso podía enmascarar un defecto real).
function creatingNothing(attempt: () => void) { const before = runs(); attempt(); assert.deepEqual(added(before), [], 'se crearon carpetas ajenas al caso: ' + added(before).join(', ')); }

// ---------------------------------------------------------------- C · CLI
test('C1 la CLI sin --run-fixture solo muestra ayuda; argumentos no admitidos se rechazan; ninguna de las dos crea carpetas', () => {
  creatingNothing(() => {
  for (const args of [[], ['--help']]) { const r = cli(...args); assert.equal(r.status, 0, args.join(' ')); assert.match(r.stdout, /Sin --run-fixture solo muestra ayuda/); }
  for (const args of [['--run-fixture', '--help'], ['--db=./x.sqlite'], ['C:/ruta/a/copia.json'], ['--run-fixture', 'extra'], ['--password=abc']]) {
    const r = cli(...args); assert.equal(r.status, 2, args.join(' ')); assert.match(r.stderr, /Argumentos no admitidos/); assert.equal(r.stdout, '', 'sin salida de datos');
  }
  });
});

// ---------------------------------------------------------------- C · admisión del artefacto (sin llegar a crear carpeta)
test('C2 admisión: tamaño, contraseña, formato, descifrado, contrato interior y alcance fixture se rechazan antes de crear carpeta o lanzar procesos', () => {
  const good = makeBundle(), notFixture = (mutate: (b: ContinuityBundle) => void) => { const copy = structuredClone(good); mutate(copy); return copy; };
  const cases: [string, () => RecoveryRehearsalReport][] = [
    ['raw no es texto', () => rehearsePortableRecovery({ raw: 12345 as never })],
    ['2 MiB + 1', () => rehearsePortableRecovery({ raw: 'x'.repeat(MAX_REHEARSAL_BYTES + 1) })],
    ['contraseña de 201', () => rehearsePortableRecovery({ raw: sealed(good), password: 'p'.repeat(201) })],
    ['contraseña errónea', () => rehearsePortableRecovery({ raw: sealed(good), password: 'otra-contraseña-ficticia' })],
    ['sobre con ciphertext alterado', () => { const e = JSON.parse(sealed(good)); e.data = e.data.slice(0, -4) + (e.data.endsWith('AAAA') ? 'BBBB' : 'AAAA'); return rehearsePortableRecovery({ raw: JSON.stringify(e), password: PASSWORD }); }],
    ['texto que no es JSON', () => rehearsePortableRecovery({ raw: 'no-es-json' })],
    ['sobre válido con contrato interior roto', () => rehearsePortableRecovery({ raw: sealed({ snapshot: { id: 'x' }, records: 'no' }), password: PASSWORD })],
    ['sobre válido con sección que falta', () => rehearsePortableRecovery({ raw: sealed({ ...good, records: undefined }), password: PASSWORD })],
  ];
  creatingNothing(() => {
  for (const [name, call] of cases) { const report = call(); assert.equal(report.status, 'refused', name); assert.equal(report.issue, 'INVALID_ARTIFACT', name); assert.equal(report.runId, null, name); assert.deepEqual(report.stages, [], name); assert.equal(report.evidenceFile, null, name); }
  const scoped: [string, ContinuityBundle][] = [
    ['isTestData=false', notFixture(b => { b.snapshot.source.isTestData = false; })], ['kind=hubspot', notFixture(b => { b.snapshot.source.kind = 'hubspot'; })],
    ['kind=archive', notFixture(b => { b.snapshot.source.kind = 'archive'; })], ['environment=production', notFixture(b => { b.snapshot.source.environment = 'production'; })],
  ];
  for (const [name, bundle] of scoped) for (const [form, raw, password] of [['cifrado', sealed(bundle), PASSWORD], ['JSON plano', JSON.stringify(bundle), undefined]] as const) {
    const report = rehearsePortableRecovery({ raw, password }); assert.equal(report.status, 'refused', name + ' ' + form); assert.ok(['FIXTURE_ONLY', 'INVALID_ARTIFACT'].includes(report.issue!), name + ' ' + form + ' → ' + report.issue); assert.equal(report.runId, null, name + ' ' + form);
  }
  });
});

// ---------------------------------------------------------------- C · recorrido completo en dos procesos
test('C3 ensayo completo: restaura por la API protegida y otro proceso distinto reabre y observa la misma revisión, registros, historial y pendientes', async () => {
  const bundle = makeBundle(), raw = sealed(bundle), before = runs(), started = Date.now();
  const report = rehearsePortableRecovery({ raw, password: PASSWORD }), elapsed = Date.now() - started;
  console.log('# C3 medida (sin umbral): ' + elapsed + ' ms, ' + report.elapsedMs + ' ms informados');
  const created = added(before); assert.deepEqual(created, [report.runId], 'la ÚNICA carpeta nueva es la de este ensayo (runId propio)');
  assert.equal(report.status, 'passed', JSON.stringify(report.stages.map(s => s.checks.filter(c => !c.passed))));
  assert.equal(report.format, 'planb-recovery-rehearsal-v1'); assert.equal(report.issue, null); assert.match(report.runId!, /^run-[a-f0-9-]{36}$/);
  assert.equal(report.artifactHash, createHash('sha256').update(raw).digest('hex'), 'hash del artefacto recibido');
  assert.equal(report.inputRevision, bundleRevision(bundle), 'revisión de entrada = la calculada por mí sobre el paquete');
  const [first, second] = report.stages; assert.deepEqual([first.phase, second.phase], ['restore', 'resume']); assert.ok(first.success && second.success);
  assert.ok(first.pid > 0 && second.pid > 0); assert.notEqual(first.pid, second.pid, 'procesos distintos'); assert.ok(![first.pid, second.pid].includes(process.pid), 'ni el proceso de la prueba');
  const codes = (stage: typeof first) => stage.checks.map(c => c.code);
  for (const code of ['NEW_FOLDER_OR_RESTART', 'INPUT_SIZE_BOUNDED', 'FIXTURE_SCOPE_VALIDATED', 'LOCAL_PROTECTION_SETUP', 'UNAUTHENTICATED_ACCESS_DENIED', 'RESTORE_THROUGH_PROTECTED_API', 'RESTORED_REVISION_MATCHES', 'RUNTIME_DISCONNECTED', 'HOST_AND_ORIGIN_GUARDS', 'WORKFLOW_APPLICABLE', 'CONTACT_READ_AND_EDIT', 'DEAL_ADVANCED', 'TASK_CREATED', 'TASK_COMPLETED', 'FOUR_OPERATIONS_RECORDED', 'LOCAL_WORKFLOW_PROBE', 'EXPLICIT_LOCK_DENIES_SESSION']) assert.ok(codes(first).includes(code), 'fase 1 comprueba ' + code);
  for (const code of ['NEW_FOLDER_OR_RESTART', 'FIXTURE_DATABASE_SCOPE', 'LOGIN_AFTER_PROCESS_RESTART', 'UNAUTHENTICATED_ACCESS_DENIED', 'PERSISTENCE_AFTER_PROCESS_RESTART', 'API_RECORDS_AFTER_RESTART', 'LOCAL_WORKFLOW_PROBE', 'EXPLICIT_LOCK_DENIES_SESSION']) assert.ok(codes(second).includes(code), 'fase 2 comprueba ' + code);
  assert.ok([...first.checks, ...second.checks].every(c => c.passed), 'todas las comprobaciones superadas');
  // Oráculo independiente de las cifras: paquete de partida + una tarea creada y cuatro operaciones registradas.
  assert.equal(first.state!.records, bundle.records.length + 1); assert.equal(first.state!.changes, bundle.changes.length + 4);
  assert.deepEqual(second.state, first.state, 'el segundo proceso observa exactamente el estado del primero (revisión, registros, historial, pendientes)');
  assert.notEqual(first.state!.revision, report.inputRevision, 'las cuatro operaciones cambiaron el contenido');
  assert.equal(report.restoredRevision, report.inputRevision, 'restaurar solo no altera la revisión');
  // Evidencia en disco y sin datos sensibles.
  const file = path.join(root, report.evidenceFile!); assert.ok(fs.existsSync(file)); assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')), JSON.parse(JSON.stringify(report)));
  const dump = JSON.stringify(report) + fs.readFileSync(file, 'utf8');
  for (const secret of [PASSWORD, MARK, '@example.com', 'contact-1', 'Lucía']) assert.equal(dump.includes(secret), false, 'el informe no contiene «' + secret + '»');
  assert.doesNotMatch(dump, /(rehearsal|fixture|local-qa060)-[a-f0-9]{8}-[a-f0-9]{4}-/, 'ni contraseñas efímeras (prefijo + UUID)');
  assert.ok(report.limitations.length >= 5 && report.limitations.some(l => /No demuestra interfaz, instalación empaquetada u otro equipo/.test(l)) && report.limitations.some(l => /no un RTO garantizado/.test(l)), 'declara sus límites');
  const folder = path.join(parent, report.runId!); assert.ok(fs.existsSync(path.join(folder, 'data', 'planb.sqlite')), 'base persistida en la carpeta nueva'); assert.equal(path.relative(parent, folder).includes('..'), false);
});

test('C4 un flujo no aplicable (sin oportunidades) no produce informe correcto: falla en la primera fase y no se lanza la segunda', () => {
  const noDeals = makeBundle(snapshot => { snapshot.records = snapshot.records.filter(r => r.entity !== 'deals' && r.entity !== 'tasks'); snapshot.links = []; snapshot.manifest.expectedLinks = 0; });
  const before = runs(), report = rehearsePortableRecovery({ raw: sealed(noDeals), password: PASSWORD });
  if (report.status === 'refused') { assert.ok(['INVALID_ARTIFACT', 'FIXTURE_ONLY'].includes(report.issue!)); assert.deepEqual(added(before).filter(name => name === report.runId), []); return; }   // admitido solo si el contrato lo permite
  assert.equal(report.status, 'failed'); assert.equal(report.issue, 'REHEARSAL_NOT_PASSED'); assert.equal(report.stages.length, 1, 'no se ejecuta «resume» tras un fallo');
  assert.equal(report.stages[0].success, false); assert.ok(report.stages[0].checks.some(c => c.code === 'WORKFLOW_APPLICABLE' && !c.passed)); assert.equal(report.stages[0].state, undefined);
  assert.notEqual(report.status, 'passed');
});

test('C5 la CLI --run-fixture real termina bien y no imprime contraseñas, datos de fichas ni rutas fuera de su carpeta', () => {
  const before = runs(), r = cli('--run-fixture'); assert.equal(r.status, 0, r.stderr);
  const report = JSON.parse(r.stdout) as RecoveryRehearsalReport; assert.equal(report.status, 'passed'); assert.notEqual(report.stages[0].pid, report.stages[1].pid);
  assert.deepEqual(added(before), [report.runId], 'la ÚNICA carpeta nueva es la de esta ejecución (runId propio)');
  assert.doesNotMatch(r.stdout, /(rehearsal|fixture)-[a-f0-9]{8}-[a-f0-9]{4}-/, 'stdout no contiene contraseñas efímeras (prefijo + UUID)');
  for (const secret of ['solo-cambio-ficticio-050', '@example.com', 'contact-1', ':\\', 'node_modules']) assert.equal(r.stdout.includes(secret), false, 'stdout no contiene «' + secret + '»');
  assert.match(report.evidenceFile!, /^tests\/\.tmp\/recovery-rehearsals\/run-[a-f0-9-]{36}\/report\.json$/);
});

// ---------------------------------------------------------------- C · protocolo del worker (límites de ruta, enlaces, fase y base previa)
const payload = (folder: string, over: Record<string, unknown> = {}) => ({ phase: 'restore', folder, localPassword: 'local-qa060-' + randomUUID(), raw: sealed(makeBundle()), password: PASSWORD, expectedRevision: 'a'.repeat(64), ...over });
const refused = (result: ReturnType<typeof worker>, extra?: (r: ReturnType<typeof parse>) => void) => { assert.equal(result.status, 0, result.stderr); const out = parse(result.stdout); assert.equal(out.success, false); assert.ok(out.checks.some(c => !c.passed), JSON.stringify(out.checks)); assert.equal(out.state, undefined); extra?.(out); return out; };

test('C6 el worker rechaza antes de usar la carpeta: fuera del padre, nombre no UUID, ruta relativa con «..», fase desconocida, campos extra y entrada que no es JSON', () => {
  const outside = path.join(scratch, uuidFolder()); fs.mkdirSync(outside, { recursive: true });
  const evil = path.join(parent, 'evil-' + randomUUID().slice(0, 8)), inParentWrong = path.join(parent, 'run-no-es-uuid');
  for (const [name, input] of [
    ['carpeta fuera del padre', payload(outside)], ['nombre sin forma UUID', payload(evil)], ['nombre run- incorrecto', payload(inParentWrong)],
    ['«..» hacia otro lugar', payload(path.join(parent, '..', 'recovery-rehearsals', '..', path.basename(scratch), path.basename(outside)))], ['fase desconocida', payload(outside, { phase: 'delete' })], ['campo extra', payload(outside, { extra: true })],
    ['contraseña local corta', payload(outside, { localPassword: 'corta' })], ['revisión malformada', payload(outside, { expectedRevision: 'XYZ' })], ['stdin que no es JSON', 'esto no es json'],
  ] as const) { const result = worker(input); refused(result); assert.equal(result.stdout.includes('local-qa060'), false, name + ': no imprime la contraseña local'); }
  assert.deepEqual(fs.readdirSync(outside), [], 'la carpeta externa no se tocó (ni data/ ni base)'); assert.equal(fs.existsSync(evil), false); assert.equal(fs.existsSync(inParentWrong), false);
});

test('C7 «resume» sobre una carpeta que no existe, o sin la base creada por «restore», se rechaza sin crear nada', () => {
  const ghost = path.join(parent, uuidFolder()); const missing = worker(payload(ghost, { phase: 'resume', expected: { revision: 'b'.repeat(64), records: 1, changes: 0, pending: 0 }, raw: undefined }));
  refused(missing); assert.equal(fs.existsSync(ghost), false, 'no se creó la carpeta inexistente');
});

test('C8 una base previa en la carpeta se rechaza en «restore» y no se abre ni modifica; «resume» sin base también', () => {
  const folder = path.join(parent, uuidFolder()), empty = path.join(parent, uuidFolder()); fs.mkdirSync(path.join(folder, 'data'), { recursive: true });
  const db = path.join(folder, 'data', 'planb.sqlite'), sentinel = Buffer.from('QA060-BASE-PREVIA-NO-TOCAR'); fs.writeFileSync(db, sentinel);
  try {
  const out = refused(worker(payload(folder)), r => assert.ok(r.checks.some(c => c.code === 'NEW_FOLDER_OR_RESTART' && !c.passed), 'falla NEW_FOLDER_OR_RESTART: ' + JSON.stringify(r.checks)))
  assert.ok(out);
  assert.deepEqual(fs.readFileSync(db), sentinel, 'la base previa quedó intacta'); assert.deepEqual(fs.readdirSync(path.join(folder, 'data')), ['planb.sqlite'], 'no se creó ninguna clave ni archivo junto a ella');
  fs.mkdirSync(empty);
  refused(worker(payload(empty, { phase: 'resume', raw: undefined, expected: { revision: 'b'.repeat(64), records: 1, changes: 0, pending: 0 } })), r => assert.ok(r.checks.some(c => c.code === 'NEW_FOLDER_OR_RESTART' && !c.passed)));
  assert.deepEqual(fs.readdirSync(empty), [], '«resume» sin base no creó nada');
  } finally { /* QA079: no se borra nada; el workspace es privado y sus carpetas se conservan como evidencia */ }
});

test('C9 un enlace (junction/symlink) en lugar de la carpeta de ejecución se rechaza antes de usarlo', t => {
  const target = path.join(scratch, uuidFolder()); fs.mkdirSync(target, { recursive: true });
  const link = path.join(parent, uuidFolder());
  try { fs.symlinkSync(target, link, 'junction'); } catch (error) { t.skip('Entorno: no se pudo crear el enlace (' + (error as Error).message + '); no se da por aprobado'); return; }
  try {
    assert.equal(fs.lstatSync(link).isSymbolicLink(), true, 'precondición: Node ve el enlace como enlace');
    refused(worker(payload(link))); assert.deepEqual(fs.readdirSync(target), [], 'el destino del enlace no recibió ninguna base ni carpeta data');
  } finally { /* QA079: el enlace y su destino se conservan en el workspace privado como evidencia; no se borra nada */ }
});

// ---------------------------------------------------------------- F4 · aislamiento frente a otros ensayos legítimos (QA079)
// Adversario: mientras la CLI del workspace privado corre, otro «ensayo legítimo» crea carpetas run-<uuid> en la RAÍZ ANTIGUA compartida del proyecto (tests/.tmp/recovery-rehearsals),
// justo donde miraban las pruebas anteriores. Si el aislamiento es real, el listado del workspace privado no cambia; con QA079_REHEARSAL_ROOT=shared (control) las dos raíces coinciden y la prueba FALLA.
// Las carpetas adversarias están vacías y se retiran al terminar con rmdir NO recursivo (solo las creadas aquí); no se toca ninguna otra.
const decoyRoot = SHARED ? parent : process.env.QA079_OLD_ROOT ? path.resolve(process.env.QA079_OLD_ROOT) : OLD_ROOT;
async function cliWithDecoys(args: string[]) {
  fs.mkdirSync(decoyRoot, { recursive: true }); const decoys: string[] = [], created: { at: number; dir: string }[] = [];
  const child = spawn(process.execPath, ['--import', 'tsx', 'scripts/rehearse-portable-recovery.ts', ...args], { cwd: root, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '', stderr = '', alive = true; child.stdout.on('data', d => { stdout += d; }); child.stderr.on('data', d => { stderr += d; });
  const spawnedAt = Date.now(), closed = new Promise<{ code: number | null; at: number }>(resolve => child.on('close', code => { alive = false; resolve({ code, at: Date.now() }); }));
  const mkdecoy = () => { const dir = path.join(decoyRoot, 'run-' + randomUUID()); fs.mkdirSync(dir); decoys.push(dir); if (alive) created.push({ at: Date.now(), dir }); };
  mkdecoy(); while (alive && decoys.length < 400) { await new Promise(resolve => setTimeout(resolve, 120)); if (alive) mkdecoy(); }
  const { code, at } = await closed;
  // Evidencia de coincidencia temporal: cuántas carpetas adversarias se crearon DESPUÉS de lanzar el proceso y ANTES de que terminara.
  const during = created.filter(item => item.at >= spawnedAt && item.at <= at).length;
  return { code, stdout, stderr, during, spawnedAt, endedAt: at, decoys, release: () => { for (const dir of decoys) { try { fs.rmdirSync(dir); } catch { /* si no está vacía o ya no existe se conserva */ } } } };
}

test('F4a una carpeta de ensayo legítima creada en la raíz antigua mientras corren la ayuda y el ensayo CLI no interfiere con el workspace privado: solo existe el runId propio', async () => {
  const beforeHelp = runs(), help = await cliWithDecoys(['--help']);
  try {
    assert.equal(help.code, 0, help.stderr); assert.match(help.stdout, /Sin --run-fixture solo muestra ayuda/); assert.ok(help.during >= 1, 'coincidencia temporal: ' + help.during + ' carpeta(s) adversaria(s) nacieron mientras corría la ayuda');
    assert.deepEqual(added(beforeHelp), [], 'la ayuda no crea nada en el workspace y no ve las carpetas adversarias: ' + added(beforeHelp).join(', '));
  } finally { help.release(); }
  const before = runs(), run = await cliWithDecoys(['--run-fixture']);
  try {
    assert.equal(run.code, 0, run.stderr + run.stdout.slice(0, 400)); const report = JSON.parse(run.stdout) as RecoveryRehearsalReport;
    assert.equal(report.status, 'passed', JSON.stringify(report.stages.map(stage => stage.checks.filter(check => !check.passed)))); assert.ok(run.during >= 1, 'coincidencia temporal: ' + run.during + ' carpeta(s) adversaria(s) nacieron durante el ensayo (' + (run.endedAt - run.spawnedAt) + ' ms)');
    assert.deepEqual(added(before), [report.runId], 'el único cambio en el workspace privado es la carpeta del propio runId');
    assert.ok(run.decoys.every(dir => path.basename(dir) !== report.runId), 'el runId propio no coincide con ninguna carpeta adversaria');
    const folder = path.join(parent, report.runId!), own = fs.readdirSync(folder).sort(); assert.ok(own.includes('report.json') && own.includes('data'), 'archivos propios del ensayo: ' + own.join(', '));
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root, report.evidenceFile!), 'utf8')), report, 'el informe del disco es el de esta ejecución');
    assert.ok(report.stages.every(stage => stage.success && stage.checks.every(check => check.passed)), 'las dos fases pasan sin haber leído carpetas ajenas');
    assert.equal(path.resolve(root).startsWith(path.resolve(PROJECT, 'tests', '.tmp', 'recovery-rehearsals')), false);
  } finally { run.release(); }
});

test('F4b dos ensayos --run-fixture simultáneos en el MISMO workspace tienen runId, carpeta, PIDs y evidencia propios; cada uno solo ve lo suyo', async () => {
  const before = runs(), launch = () => new Promise<{ code: number | null; stdout: string; stderr: string; start: number; end: number }>(resolve => {
    const start = Date.now(), child = spawn(process.execPath, ['--import', 'tsx', 'scripts/rehearse-portable-recovery.ts', '--run-fixture'], { cwd: root, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }); let stdout = '', stderr = '';
    child.stdout.on('data', d => { stdout += d; }); child.stderr.on('data', d => { stderr += d; }); child.on('close', code => resolve({ code, stdout, stderr, start, end: Date.now() }));
  });
  const [one, two] = await Promise.all([launch(), launch()]);
  assert.ok(one.start < two.end && two.start < one.end, 'los dos procesos coincidieron en el tiempo (' + one.start + '–' + one.end + ' y ' + two.start + '–' + two.end + ')');
  assert.deepEqual([one.code, two.code], [0, 0], one.stderr + two.stderr);
  const reports = [one, two].map(r => JSON.parse(r.stdout) as RecoveryRehearsalReport); assert.notEqual(reports[0].runId, reports[1].runId); assert.ok(reports.every(r => r.status === 'passed'));
  assert.deepEqual(added(before), reports.map(r => r.runId!).sort(), 'exactamente dos carpetas nuevas: una por ensayo');
  const pids = reports.flatMap(r => r.stages.map(stage => stage.pid)); assert.equal(new Set(pids).size, 4, 'cuatro procesos de fase distintos (restore+resume por ensayo)');
  for (const report of reports) { const own = JSON.parse(fs.readFileSync(path.join(root, report.evidenceFile!), 'utf8')) as RecoveryRehearsalReport; assert.equal(own.runId, report.runId, 'el informe guardado pertenece a su runId'); assert.ok(report.evidenceFile!.includes(report.runId!)); }
});
