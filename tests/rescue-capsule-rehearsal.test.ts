import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, readFileSync, readdirSync, rmdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { Worker } from 'node:worker_threads';
import { pathToFileURL } from 'node:url';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { RescueRoom, assertOwnRoot } from '../server/rescue-room.js';
import { CapsuleError } from '../shared/rescue-capsule.js';
import { describeClaim, exportCapsule, importCapsule, inspectCapsule, loadCapsule, openDestination, sweepStaging, type Kit } from '../server/rescue-capsule.js';
import { parseArgs as parseRehearsal } from '../scripts/rehearse-rescue-capsule.js';
import { parseArgs as parseDemo } from '../scripts/demo-rescue-capsule.js';
import { PASSWORD, TMP, clock, envelope, freePort, newKit, openDest, originAt, originUncertain, track, trackFolder, trackKit, viewOf } from './helpers/rescue-capsule-harness.js';
// Kit de Relevo · ensayo con PROCESOS reales: CLI de ensayo, interrupciones (el proceso muere en cada paso), exclusión de escritores y escala. Los artefactos que se leen son los reales en disco.
const REPO = resolve('.');
function runRehearsal(args: string[], stdin: string): Promise<{ code: number | null; out: string; err: string }> {
  return new Promise(ok => {
    const p = spawn(process.execPath, ['--require', join(REPO, 'scripts', 'block-external.cjs'), '--import', 'tsx', 'scripts/rehearse-rescue-capsule.ts', '--now', '2026-11-02T07:00:00.000Z', ...args], { cwd: REPO, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '', err = ''; p.stdout!.on('data', d => { out += d; }); p.stderr!.on('data', d => { err += d; }); p.on('exit', code => ok({ code, out, err })); p.stdin!.end(stdin);
  });
}
const line = (out: string, key: string) => new RegExp('^' + key + ' (.+)$', 'm').exec(out)?.[1].trim();
const dirsNow = () => readdirSync(TMP);
const destinations = () => dirsNow().filter(n => /^rescue106-[0-9a-f-]{36}$/.test(n) && existsSync(join(TMP, n, 'rescue-room.marker.json')));

test('CLI de ensayo: recorre el mismo contrato que la interfaz; la contraseña entra por STDIN y no aparece en argumentos, salida ni errores', async () => {
  assert.throws(() => parseRehearsal(['--password', 'x']), /no se pasa por argumentos/); assert.throws(() => parseDemo(['--password=x']), /no se pasa por argumentos/); assert.throws(() => parseDemo(['--clave', 'x']));
  const run = await runRehearsal([], PASSWORD + '\n'); assert.equal(run.code, 0, run.err + run.out.slice(-400)); const kitDir = line(run.out, 'KIT')!, origin = line(run.out, 'ORIGIN')!; trackKit(kitDir); trackFolder(origin);
  const result = JSON.parse(line(run.out, 'RESULT')!); assert.equal(result.ok, true); assert.equal(result.wrongIdRejected, true); assert.equal(result.createCalls, 1); assert.equal(result.duplicates, 0); trackFolder(join(TMP, result.destinationFolder));
  assert.ok(!(run.out + run.err).includes(PASSWORD), 'la contraseña no se imprime'); const noPw = await runRehearsal([], ''); assert.notEqual(noPw.code, 0); assert.match(noPw.err, /entrada estándar/);
});

const CRASH: { step: string; expect: 'no-capsule' | 'tmp' | 'capsule' | 'staging' | 'published' }[] = [
  { step: 'export:encrypted', expect: 'no-capsule' }, { step: 'export:before-publish', expect: 'tmp' }, { step: 'export:published', expect: 'capsule' },
  { step: 'import:staging-created', expect: 'staging' }, { step: 'import:components-written', expect: 'staging' }, { step: 'import:published', expect: 'published' },
];
for (const c of CRASH) test('interrupción · el proceso MUERE en «' + c.step + '»: artefactos reales, origen intacto y continuación segura', async () => {
  const before = new Set(dirsNow()); const run = await runRehearsal(['--crash', c.step], PASSWORD + '\n'); assert.equal(run.code, 86, 'el proceso murió en el paso pedido: ' + run.err.slice(-200));
  const kitDir = line(run.out, 'KIT')!, originDir = line(run.out, 'ORIGIN')!; trackKit(kitDir); trackFolder(originDir); const kit: Kit = { dir: kitDir, capsules: join(kitDir, 'capsules'), clock };
  const files = readdirSync(kit.capsules), real = files.filter(n => n.endsWith('.capsule')), tmp = files.filter(n => n.endsWith('.tmp'));
  const origin = track(RescueRoom.open(originDir, { clock })); assert.equal(viewOf(origin).stage, 'return-partial', 'el origen abre y conserva su estado'); assert.equal(origin.crm.stats().calls.create, 1); assert.equal(origin.logicalDigest(), origin.logicalDigest());
  const created = dirsNow().filter(n => !before.has(n)), staging = created.filter(n => /^rescue116-staging-/.test(n)), published = created.filter(n => /^rescue106-/.test(n) && n !== originDir.split(/[\\/]/).pop() && existsSync(join(TMP, n, 'rescue-room.marker.json')));
  for (const n of published) trackFolder(join(TMP, n)); for (const n of staging) trackFolder(join(TMP, n));
  if (c.expect === 'no-capsule') { assert.equal(real.length, 0); assert.equal(tmp.length, 0); const again = await exportCapsule(origin, PASSWORD, kit); assert.ok(loadCapsule(kit, again.name, PASSWORD).capsule, 'se puede exportar de nuevo'); }
  if (c.expect === 'tmp') { assert.equal(real.length, 0, 'sin cápsula publicada'); assert.equal(tmp.length, 1, 'queda el temporal'); assert.throws(() => loadCapsule(kit, tmp[0], PASSWORD), CapsuleError, 'un temporal no es una cápsula cargable'); const again = await exportCapsule(origin, PASSWORD, kit); assert.ok(loadCapsule(kit, again.name, PASSWORD).capsule); }
  if (c.expect === 'capsule' || c.expect === 'staging' || c.expect === 'published') assert.equal(real.length, 1, 'la cápsula publicada es real');
  if (c.expect !== 'no-capsule' && c.expect !== 'tmp') {
    const insp = await inspectCapsule(kit, real[0], PASSWORD);
    if (c.expect === 'capsule') { const imp = await importCapsule(kit, { name: real[0], password: PASSWORD, expectedSha256: insp.sha256, expectedRevision: insp.revision }); trackFolder(join(TMP, imp.destination.folder)); assert.ok(existsSync(join(TMP, imp.destination.folder, 'rescue-room.marker.json'))); }
    if (c.expect === 'staging') {
      assert.equal(staging.length, 1, 'queda un staging huérfano'); assert.equal(published.length, 0, 'ningún destino publicado'); assert.throws(() => assertOwnRoot(join(TMP, staging[0])), RescueError_, 'el staging NO es reanudable');
      const claim = JSON.parse(readFileSync(join(kit.capsules, real[0] + '.import-claim'), 'utf8')); assert.equal(claim.status, 'importing');
      const imp = await importCapsule(kit, { name: real[0], password: PASSWORD, expectedSha256: insp.sha256, expectedRevision: insp.revision }); trackFolder(join(TMP, imp.destination.folder)); assert.equal(destinations().filter(n => !before.has(n) && n !== originDir.split(/[\\/]/).pop()).length, 1, 'un único destino tras reintentar (reclamo obsoleto recuperado)');
      assert.deepEqual(sweepStaging().includes(staging[0]), true, 'el barrido retira el staging propio huérfano'); assert.ok(!existsSync(join(TMP, staging[0])));
    }
    if (c.expect === 'published') {
      assert.equal(published.length, 1, 'el destino ya estaba publicado'); const dest = track(RescueRoom.open(join(TMP, published[0]), { clock })); assert.equal(viewOf(dest).stage, 'return-partial', 'abre con normalidad'); dest.close();
      await assert.rejects(importCapsule(kit, { name: real[0], password: PASSWORD, expectedSha256: insp.sha256, expectedRevision: insp.revision }), (e: unknown) => e instanceof CapsuleError && e.code === 'ALREADY_IMPORTED' && JSON.stringify(e.details).includes(published[0]), 'no se crea un segundo destino');
      assert.equal(destinations().filter(n => !before.has(n) && n !== originDir.split(/[\\/]/).pop()).length, 1);
    }
  }
  origin.close();
});
const RescueError_ = Error;

test('exclusión · una mutación pedida DURANTE la captura espera: la cápsula es coherente con UNA versión y la mutación se aplica después', async () => {
  const kit = newKit(), origin = await originAt('local-work'); const v0 = viewOf(origin).version; let mutation: Promise<unknown> | null = null, versionDuring = 0, settledDuring = false, settledAtHook = true;
  const exp = await exportCapsule(origin, PASSWORD, kit, { captureHook: async step => { if (step === 'capture:after-bundle') { mutation = origin.setEstimate({ ...envelope(origin), taskId: 'task-9', minutes: 25 }).then(r => r); void mutation.then(() => { settledDuring = true; }); await new Promise(r => setTimeout(r, 250)); versionDuring = viewOf(origin).version; settledAtHook = settledDuring; } } });
  assert.equal(versionDuring, v0, 'la mutación no se aplicó durante la captura'); assert.equal(settledAtHook, false, 'la mutación seguía esperando cuando terminó la lectura');
  const cap = loadCapsule(kit, exp.name, PASSWORD).capsule; assert.equal(cap.capture.stateVersion, v0, 'la cápsula es de la versión anterior a la mutación'); await mutation; assert.equal(viewOf(origin).version, v0 + 1); assert.equal(cap.components.rescue.state.estimates['task-9'], 45, 'la cápsula conserva el valor ANTERIOR a la mutación (sin mezcla)'); assert.equal(origin.ledger.inspect().state!.estimates['task-9'], 25, 'la mutación se aplicó después'); origin.close();
});

test('exclusión · un escritor AJENO que cambia el simulador durante la captura fuerza un reintento acotado; si persiste se rechaza sin publicar nada', async () => {
  const kit = newKit(), origin = await originAt('return-partial'); const simFile = join(origin.root, 'crm-sim.json'), poke = () => { const s = JSON.parse(readFileSync(simFile, 'utf8')); s.counter += 1; writeFileSync(simFile, JSON.stringify(s)); };
  let once = true; const retried = await exportCapsule(origin, PASSWORD, kit, { captureHook: step => { if (step === 'capture:after-bundle' && once) { once = false; poke(); } } });
  assert.equal(retried.attempts, 2, 'se reintentó una vez'); assert.equal(loadCapsule(kit, retried.name, PASSWORD).capsule.components.sim.counter, JSON.parse(readFileSync(simFile, 'utf8')).counter, 'la cápsula contiene el estado FINAL, no una mezcla');
  const files = readdirSync(kit.capsules).filter(n => n.endsWith('.capsule')).length;
  await assert.rejects(exportCapsule(origin, PASSWORD, kit, { maxAttempts: 3, captureHook: step => { if (step === 'capture:after-bundle') poke(); } }), (e: unknown) => (e as { code?: string }).code === 'CAPTURE_UNSTABLE');
  assert.equal(readdirSync(kit.capsules).filter(n => n.endsWith('.capsule')).length, files, 'no se publicó una cápsula mezclada'); origin.close();
});

test('exclusión · dos importaciones concurrentes de la MISMA cápsula: exactamente una crea destino y las demás se rechazan (ALREADY_IMPORTED)', async () => {
  const kit = newKit(), origin = await originAt('local-work'), e = await exportCapsule(origin, PASSWORD, kit), insp = await inspectCapsule(kit, e.name, PASSWORD), before = destinations().length;
  const input = { name: e.name, password: PASSWORD, expectedSha256: insp.sha256, expectedRevision: insp.revision }; const results = await Promise.allSettled([importCapsule(kit, input), importCapsule(kit, input), importCapsule(kit, input)]);
  const ok = results.filter(r => r.status === 'fulfilled'), failed = results.filter(r => r.status === 'rejected');
  assert.equal(ok.length, 1, 'una sola importación'); assert.ok(failed.every(r => (r as PromiseRejectedResult).reason instanceof CapsuleError && (r as PromiseRejectedResult).reason.code === 'ALREADY_IMPORTED')); assert.equal(destinations().length, before + 1, 'un único destino');
  trackFolder(join(TMP, (ok[0] as PromiseFulfilledResult<{ destination: { folder: string } }>).value.destination.folder)); origin.close();
});

test('exclusión · un segundo escritor sobre el DESTINO abierto falla con el motivo del bloqueo sin escribir en él; tras parar el primero, la reapertura en otro proceso conserva el estado', async () => {
  const kit = newKit(), origin = await originAt('return-partial'), e = await exportCapsule(origin, PASSWORD, kit), insp = await inspectCapsule(kit, e.name, PASSWORD), imp = await importCapsule(kit, { name: e.name, password: PASSWORD, expectedSha256: insp.sha256, expectedRevision: insp.revision });
  const a = await openDest(imp.destination.folder), root = join(TMP, imp.destination.folder); const raw = () => { const db = new DatabaseSync(join(root, 'planb.sqlite'), { readOnly: true }); try { return JSON.stringify(db.prepare('SELECT key,value FROM meta ORDER BY key').all()); } finally { db.close(); } };
  const before = raw(); await assert.rejects(openDestination(imp.destination.folder, { port: await freePort() }), (err: unknown) => /ya está abierto/i.test((err as Error).message)); assert.equal(raw(), before, 'el intento rechazado no escribió en la base del destino');
  const stateA = await a.get('/api/rescue/state'); await a.stop(); const b = await openDest(imp.destination.folder); try { const stateB = await b.get('/api/rescue/state'); assert.equal(stateB.version, stateA.version); assert.equal(stateB.journal.total, stateA.journal.total); assert.equal(stateB.crm.stats.calls.create, 1); } finally { await b.stop(); } origin.close();
});

test('escala · 10.000 registros: exporta, inspecciona e importa dentro de los límites; tiempos y memoria medidos sin SLA; el plan sigue limitado a 200 tareas', { timeout: 280_000 }, async () => {
  const kit = newKit(), origin = track(RescueRoom.create(TMP, { clock, extraTasks: 9938 })); await originUncertain(origin).catch(async () => { await origin.choosePlan({ ...envelope(origin), budgetMinutes: 60 }); });
  const rss0 = process.memoryUsage().rss, t0 = Date.now(), e = await exportCapsule(origin, PASSWORD, kit), tExport = Date.now() - t0, t1 = Date.now(), insp = await inspectCapsule(kit, e.name, PASSWORD), tInspect = Date.now() - t1;
  const t2 = Date.now(), imp = await importCapsule(kit, { name: e.name, password: PASSWORD, expectedSha256: insp.sha256, expectedRevision: insp.revision }), tImport = Date.now() - t2; trackFolder(join(TMP, imp.destination.folder));
  console.log('KIT116-MEDIDA 10.000 registros: cápsula ' + (e.bytes / 1048576).toFixed(1) + ' MiB; exportar ' + tExport + ' ms, inspeccionar ' + tInspect + ' ms, importar ' + tImport + ' ms; RSS +' + Math.round((process.memoryUsage().rss - rss0) / 1048576) + ' MiB (esta máquina, sin SLA)');
  assert.equal(insp.summary.records, 10_000); assert.ok(e.bytes < 64 * 1024 * 1024, 'bajo el límite de bytes'); const dest = track(RescueRoom.open(join(TMP, imp.destination.folder), { clock })); const v = viewOf(dest); assert.equal(v.capture.records, 10_000); assert.equal(v.queue.summary.returned, 200); assert.equal(v.queue.summary.truncated, true);
  assert.equal(dest.logicalDigest() === origin.logicalDigest(), false, 'son salas distintas (otro contexto)'); assert.equal(v.localChanges.length, viewOf(origin).localChanges.length); dest.close(); origin.close();
});

// ─── R2 · reclamo y publicación (revisión independiente 138 de Codex; hallazgos reproducidos también por QA-136) ───
// Cada destino se identifica por el RECLAMO de su propia cápsula (no se lista tests/.tmp). El servicio llama a onStep sin esperarlo: lo que deba ocurrir antes del paso siguiente se hace de forma síncrona.
const claimFile = (kit: Kit, name: string) => join(kit.capsules, name + '.import-claim');
const readClaim = (kit: Kit, name: string): { status?: string; destination?: string; pid?: number; recovered?: boolean } | null => { try { return JSON.parse(readFileSync(claimFile(kit, name), 'utf8')); } catch { return null; } };
const isPublished = (id: string) => existsSync(join(TMP, 'rescue106-' + id, 'rescue-room.marker.json'));
function watchClaim(kit: Kit, name: string, inject?: (step: string) => void) {
  const ids = new Set<string>(); kit.onStep = (step: string) => { const c = readClaim(kit, name); if (c?.destination) ids.add(c.destination); inject?.(step); };
  return { ids, published: () => [...ids].filter(isPublished), track: () => { for (const id of ids) trackFolder(join(TMP, 'rescue106-' + id)); } };
}
const prep = async () => { const kit = newKit(), origin = await originAt('return-partial'), e = await exportCapsule(origin, PASSWORD, kit), insp = await inspectCapsule(kit, e.name, PASSWORD); return { kit, origin, input: { name: e.name, password: PASSWORD, expectedSha256: insp.sha256, expectedRevision: insp.revision } }; };
type Input = Awaited<ReturnType<typeof prep>>['input'];
const attempt = (kit: Kit, input: Input) => importCapsule(kit, input).then(r => ({ ok: true as const, r }), e => ({ ok: false as const, code: (e as { code?: string }).code, error: e as Error }));
const deadPid = async () => { const p = spawn(process.execPath, ['-e', '0'], { stdio: 'ignore', windowsHide: true }); await new Promise(r => p.once('exit', r)); return p.pid!; };

test('R2 · una excepción tras publicar («import:published», el caso de la revisión 138) NO libera el reclamo: el destino queda, el reintento no crea otro y la cápsula figura importada', async () => {
  const { kit, origin, input } = await prep(); let armed = true; const w = watchClaim(kit, input.name, step => { if (step === 'import:published' && armed) { armed = false; throw new Error('fallo inyectado tras publicar'); } });
  const first = await attempt(kit, input); w.track(); assert.equal(first.ok, false); assert.equal(w.published().length, 1, 'el destino se publicó antes del fallo'); const id = w.published()[0];
  assert.equal((first as { code?: string }).code, 'IMPORT_PUBLISHED_WITH_ERROR', 'el error dice la verdad: publicado, con error'); const claim = readClaim(kit, input.name); assert.ok(claim, 'el reclamo NO se borró'); assert.equal(claim!.destination, id); assert.equal(claim!.status, 'imported');
  const retry = await attempt(kit, input); assert.equal(retry.ok, false); assert.equal((retry as { code?: string }).code, 'ALREADY_IMPORTED'); w.track(); assert.deepEqual(w.published(), [id], 'sigue habiendo UN solo destino'); origin.close();
});

test('R2 · si FALLA escribir la confirmación del reclamo tras publicar: se informa IMPORT_PUBLISHED_UNCONFIRMED, el reclamo se conserva, ningún reintento crea otro destino y al poder escribir se consolida', async () => {
  const { kit, origin, input } = await prep(); let armed = true; const w = watchClaim(kit, input.name, step => { if (step === 'import:first-start-ok' && armed) { armed = false; chmodSync(claimFile(kit, input.name), 0o444); } }); // inyección real: el reclamo pasa a solo lectura
  const first = await attempt(kit, input); w.track(); assert.equal((first as { code?: string }).code, 'IMPORT_PUBLISHED_UNCONFIRMED'); assert.match(String((first as { error: Error }).error.message), /NO se vuelve a importar/); assert.equal(w.published().length, 1); const id = w.published()[0];
  const kept = readClaim(kit, input.name); assert.equal(kept?.status, 'importing', 'el reclamo se conserva (no se borró)'); assert.equal(kept?.destination, id);
  const again = await attempt(kit, input); assert.equal((again as { code?: string }).code, 'IMPORT_PUBLISHED_UNCONFIRMED', 'mientras no se pueda escribir, sigue sin crearse otro destino'); w.track(); assert.deepEqual(w.published(), [id]);
  chmodSync(claimFile(kit, input.name), 0o666); const done = await attempt(kit, input); assert.equal((done as { code?: string }).code, 'ALREADY_IMPORTED'); const final = readClaim(kit, input.name)!; assert.equal(final.status, 'imported'); assert.equal(final.recovered, true); assert.equal(final.destination, id); w.track(); assert.deepEqual(w.published(), [id]); origin.close();
});

test('R2 · estados dudosos del reclamo se distinguen sin actuar a ciegas: ilegible y PID vivo bloquean; PID ausente con carpeta de OTRA revisión es ambiguo; PID ausente sin carpeta libera y importa UNA vez', async () => {
  const { kit, origin, input } = await prep(), path = claimFile(kit, input.name), alive = spawn(process.execPath, ['-e', 'setInterval(()=>{},1000)'], { stdio: 'ignore', windowsHide: true }); try {
    writeFileSync(path, '{no es json'); assert.equal(((await attempt(kit, input)) as { code?: string }).code, 'ALREADY_IMPORTED'); assert.equal(readFileSync(path, 'utf8'), '{no es json', 'un reclamo ilegible no se pisa');
    const liveClaim = JSON.stringify({ status: 'importing', destination: '11111111-1111-4111-8111-111111111111', pid: alive.pid, at: 'x' }); writeFileSync(path, liveClaim); assert.equal(((await attempt(kit, input)) as { code?: string }).code, 'ALREADY_IMPORTED'); assert.equal(readFileSync(path, 'utf8'), liveClaim, 'un PID vivo bloquea sin tocar el reclamo');
    unlinkSync(path); mkdirSync(path); assert.equal(((await attempt(kit, input)) as { code?: string }).code, 'CLAIM_UNREADABLE', 'un reclamo que no se puede leer (aquí, una carpeta) no se interpreta: error explícito'); rmdirSync(path);
    const dead = await deadPid(), foreign = '22222222-2222-4222-8222-222222222222', dir = join(TMP, 'rescue106-' + foreign); mkdirSync(dir); writeFileSync(join(dir, 'rescue-room.marker.json'), JSON.stringify({ kind: 'rescue106', roomId: foreign, capsuleRevision: 'otra-revision' })); trackFolder(dir);
    const ambiguous = JSON.stringify({ status: 'importing', destination: foreign, pid: dead, revision: input.expectedRevision, at: 'x' }); writeFileSync(path, ambiguous); const a = await attempt(kit, input); assert.equal((a as { code?: string }).code, 'IMPORT_AMBIGUOUS'); assert.equal(readFileSync(path, 'utf8'), ambiguous, 'ambiguo: no se consolida ni se borra');
    const absent = JSON.stringify({ status: 'importing', destination: '33333333-3333-4333-8333-333333333333', pid: dead, revision: input.expectedRevision, at: 'x' }); writeFileSync(path, absent); const w = watchClaim(kit, input.name), ok = await attempt(kit, input); w.track(); assert.equal(ok.ok, true, 'sin destino publicado se importa'); assert.equal(w.published().length, 1);
  } finally { alive.kill(); } origin.close();
});

test('R2 · una recuperación interrumpida (fichero .takeover) no permite una segunda importación: error explícito y el reclamo intacto', async () => {
  const { kit, origin, input } = await prep(), path = claimFile(kit, input.name), dead = await deadPid(), stale = JSON.stringify({ status: 'importing', destination: '44444444-4444-4444-8444-444444444444', pid: dead, at: 'x' });
  writeFileSync(path, stale); writeFileSync(path + '.takeover', JSON.stringify({ pid: dead })); const r = await attempt(kit, input); assert.equal((r as { code?: string }).code, 'CLAIM_RECOVERY_BUSY'); assert.equal(readFileSync(path, 'utf8'), stale); unlinkSync(path + '.takeover'); origin.close();
});

test('R2 · CARRERA: dos HILOS reales recuperan a la vez el MISMO reclamo obsoleto; en 20 rondas nunca hay más de un destino publicado', { timeout: 280_000 }, async () => {
  const ROUNDS = 20, { kit, origin, input } = await prep(), dead = await deadPid(), sab = new SharedArrayBuffer(4), go = new Int32Array(sab), path = claimFile(kit, input.name);
  const code = "const { parentPort, workerData: w } = require('node:worker_threads');(async () => { const { openKit, importCapsule } = await import(w.mod); const kit = openKit(w.kitDir), go = new Int32Array(w.sab);" +
    "parentPort.on('message', async m => { parentPort.postMessage({ type: 'ready', round: m.round }); Atomics.wait(go, 0, m.round - 1); const until = process.hrtime.bigint() + BigInt(m.jitterNs); while (process.hrtime.bigint() < until) {}" +
    "try { const r = await importCapsule(kit, w.input); parentPort.postMessage({ type: 'done', round: m.round, ok: true, id: r.destination.roomId }); } catch (e) { parentPort.postMessage({ type: 'done', round: m.round, ok: false, code: e.code || null, message: String(e.message).slice(0, 100) }); } }); })();";
  const workerFile = join(kit.dir, 'race-worker.cjs'); writeFileSync(workerFile, code); // el hilo se carga desde un FICHERO (con eval no se aplica la resolución de tsx)
  const mk = () => new Worker(workerFile, { workerData: { sab, kitDir: kit.dir, input, mod: pathToFileURL(resolve('server', 'rescue-capsule.ts')).href }, execArgv: ['--import', import.meta.resolve('tsx')] }), workers = [mk(), mk()];
  const once = (w: Worker, type: string, round: number) => new Promise<{ ok?: boolean; id?: string; code?: string; message?: string }>(ok => { const h = (m: { type: string; round: number }) => { if (m.type === type && m.round === round) { w.off('message', h); ok(m as never); } }; w.on('message', h); });
  const published = new Set<string>(); let duplicated = 0;
  try {
    for (let round = 1; round <= ROUNDS; round++) {
      try { unlinkSync(path); } catch { /* ausente */ } writeFileSync(path, JSON.stringify({ status: 'importing', destination: '55555555-5555-4555-8555-555555555555', pid: dead, at: 'x' }));
      const readies = workers.map(w => once(w, 'ready', round)), dones = workers.map(w => once(w, 'done', round)); workers.forEach((w, i) => w.postMessage({ round, jitterNs: i ? (round % 7) * 40_000 : 0 })); await Promise.all(readies); Atomics.store(go, 0, round); Atomics.notify(go, 0);
      const res = await Promise.all(dones), oks = res.filter(r => r.ok); for (const r of oks) { published.add(r.id!); trackFolder(join(TMP, 'rescue106-' + r.id)); } if (oks.length > 1) duplicated++;
      assert.ok(res.every(r => r.ok || r.code === 'ALREADY_IMPORTED' || r.code === 'CLAIM_RECOVERY_BUSY'), 'resultado inesperado: ' + JSON.stringify(res));
    }
  } finally { await Promise.all(workers.map(w => w.terminate())); try { unlinkSync(workerFile); } catch { /* ausente */ } origin.close(); }
  assert.equal(duplicated, 0, 'rondas con más de un destino: ' + duplicated); for (const id of published) assert.ok(isPublished(id));
});

test('R2 · el barrido de staging NO retira la importación ACTIVA (marcador con el pid vivo) ni una carpeta ajena sin pid; sí retira la de un importador muerto', async () => {
  const { kit, origin, input } = await prep(); let swept: string[] = [], during: string[] = [], id = ''; const files = (d: string) => ['rescue-room.marker.json', 'planb.sqlite', 'crm-sim.json'].filter(n => existsSync(join(d, n)));
  const w = watchClaim(kit, input.name, step => { if (step === 'import:components-written') { id = readClaim(kit, input.name)!.destination!; swept = sweepStaging(TMP); during = files(join(TMP, 'rescue116-staging-' + id)); } });
  const r = await attempt(kit, input); w.track(); assert.equal(r.ok, true, 'la importación activa NO se sabotea: ' + (r.ok ? '' : String((r as { error: Error }).error.message))); assert.ok(!swept.includes('rescue116-staging-' + id)); assert.ok(during.includes('rescue-room.marker.json') && during.includes('planb.sqlite'), 'el staging activo conservó sus ficheros: ' + during.join());
  const u = '66666666-6666-4666-8666-666666666666', alien = join(TMP, 'rescue116-staging-' + u); mkdirSync(alien); writeFileSync(join(alien, 'rescue-room.marker.json'), JSON.stringify({ kind: 'rescue106', roomId: u })); writeFileSync(join(alien, 'crm-sim.json'), 'x');
  assert.ok(!sweepStaging(TMP).includes('rescue116-staging-' + u), 'una carpeta con nombre y marcador válidos pero SIN pid no es nuestra: no se toca'); assert.ok(existsSync(join(alien, 'crm-sim.json'))); unlinkSync(join(alien, 'crm-sim.json')); unlinkSync(join(alien, 'rescue-room.marker.json')); rmdirSync(alien); origin.close();
});

// ─── R3 · propiedad del reclamo (revisión 148: dos instancias del módulo con el mismo PID) ───
// Barreras deterministas: un proceso o hilo se detiene SÍNCRONAMENTE en un paso del servicio (el servicio llama a onStep sin esperarlo) y no sigue hasta que el padre crea <flag>.go. Cada prueba dice qué intercalado consigue.
// Los procesos y hilos auxiliares se cargan desde ficheros que la propia prueba escribe en su carpeta de kit (con eval no se aplica la resolución de tsx).
const SERVER_URL = () => pathToFileURL(resolve('server', 'rescue-capsule.ts')).href;
const HOLD = "const wait = new Int32Array(new SharedArrayBuffer(4)); const hold = flag => { require('node:fs').writeFileSync(flag + '.reached', String(process.pid)); const dl = Date.now() + 90000; while (!require('node:fs').existsSync(flag + '.go')) { if (Date.now() > dl) process.exit(87); Atomics.wait(wait, 0, 0, 20); } };";
const CHILD_CODE = HOLD + "const job = JSON.parse(process.argv[2]); (async () => { const { openKit, importCapsule } = await import(job.mod); const kit = openKit(job.kitDir); kit.clock = () => Date.parse('2026-11-02T07:00:00.000Z');" +
  "if (job.mode === 'crash' || job.mode === 'block') kit.onStep = step => { if (step !== job.step) return; if (job.mode === 'crash') process.exit(86); hold(job.flag); };" +
  "try { const r = await importCapsule(kit, job.input); console.log('RESULT ' + JSON.stringify({ ok: true, id: r.destination.roomId })); } catch (e) { console.log('RESULT ' + JSON.stringify({ ok: false, code: e.code || null, details: e.details || null })); } })();";
const WORKER_CODE = HOLD + "const { parentPort, workerData: w } = require('node:worker_threads'); if (w.fakePid) Object.defineProperty(process, 'pid', { value: w.fakePid, configurable: true });" +
  "(async () => { const { openKit, importCapsule } = await import(w.mod); const kit = openKit(w.kitDir), go = new Int32Array(w.sab); kit.clock = () => Date.parse('2026-11-02T07:00:00.000Z');" +
  "parentPort.on('message', async m => { if (m.type === 'hold-import') { kit.onStep = step => { if (step === m.step) hold(m.flag); }; try { const r = await importCapsule(kit, w.input); parentPort.postMessage({ type: 'held-done', ok: true, id: r.destination.roomId }); } catch (e) { parentPort.postMessage({ type: 'held-done', ok: false, code: e.code || null }); } return; }" +
  "parentPort.postMessage({ type: 'ready', round: m.round }); Atomics.wait(go, 0, m.round - 1); const until = process.hrtime.bigint() + BigInt(m.jitterNs); while (process.hrtime.bigint() < until) {}" +
  "try { const r = await importCapsule(kit, w.input); parentPort.postMessage({ type: 'done', round: m.round, ok: true, id: r.destination.roomId }); } catch (e) { parentPort.postMessage({ type: 'done', round: m.round, ok: false, code: e.code || null, message: String(e.message).slice(0, 100) }); } }); })();";
const waitFile = async (p: string, ms = 60_000) => { const end = Date.now() + ms; while (!existsSync(p)) { if (Date.now() > end) throw new Error('espera agotada: ' + p); await new Promise(r => setTimeout(r, 25)); } };
const spawnChild = (kit: Kit, input: Input, opts: { mode?: 'crash' | 'block'; step?: string; flag?: string } = {}) => {
  const file = join(kit.dir, 'r3-child.cjs'); writeFileSync(file, CHILD_CODE);
  const p = spawn(process.execPath, ['--import', import.meta.resolve('tsx'), file, JSON.stringify({ mod: SERVER_URL(), kitDir: kit.dir, input, ...opts })], { cwd: resolve('.'), windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = ''; p.stdout!.on('data', d => { out += d; }); p.stderr!.on('data', d => { out += d; }); childProcs.add(p);
  const done = new Promise<{ code: number | null; result: { ok: boolean; id?: string; code?: string; details?: { holderPid?: number; holderAlive?: boolean | null } | null } | null }>(ok => p.once('exit', code => { const m = /^RESULT (.+)$/m.exec(out); ok({ code, result: m ? JSON.parse(m[1]) : null }); }));
  return { pid: p.pid!, done, release: (flag: string) => writeFileSync(flag + '.go', '1') };
};
const childProcs = new Set<ReturnType<typeof spawn>>(); process.on('exit', () => { for (const p of childProcs) { try { p.kill(); } catch { /* ya terminó */ } } });
const startWorker = (kit: Kit, input: Input, extra: Record<string, unknown> = {}) => { const file = join(kit.dir, 'r3-worker.cjs'); writeFileSync(file, WORKER_CODE); return new Worker(file, { workerData: { sab: new SharedArrayBuffer(4), kitDir: kit.dir, input, mod: SERVER_URL(), ...extra }, execArgv: ['--import', import.meta.resolve('tsx')] }); };
const nextMessage = (w: Worker, type: string) => new Promise<{ ok?: boolean; id?: string; code?: string }>(ok => { const h = (m: { type: string }) => { if (m.type === type) { w.off('message', h); ok(m as never); } }; w.on('message', h); });
const cleanup = (kit: Kit) => { for (const f of ['r3-child.cjs', 'r3-worker.cjs', 'race-worker.cjs']) { try { unlinkSync(join(kit.dir, f)); } catch { /* ausente */ } } };
const rawOrNull = (p: string) => { try { return readFileSync(p, 'utf8'); } catch { return null; } };
const stagingList = (id: string) => { try { return readdirSync(join(TMP, 'rescue116-staging-' + id)).sort(); } catch { return null; } };
/** Estado observable de «alguien importa»: reclamo (bytes), staging del importador y exclusión de recuperación. */
const snapshotOf = (kit: Kit, name: string, id: string) => ({ claim: rawOrNull(claimFile(kit, name)), staging: stagingList(id), takeover: rawOrNull(claimFile(kit, name) + '.takeover') });

test('R3 · dos INSTANCIAS del módulo con el MISMO PID: con la primera importación activa (retenida en components-written) la segunda se RECHAZA sin alterar reclamo ni staging; al soltar la primera hay exactamente un destino', async () => {
  const { kit, origin, input } = await prep(), flag = join(kit.dir, 'r3-same'), worker = startWorker(kit, input), held = nextMessage(worker, 'held-done');
  worker.postMessage({ type: 'hold-import', step: 'import:components-written', flag }); await waitFile(flag + '.reached');
  try {
    const claim = readClaim(kit, input.name)!, id = claim.destination!; assert.equal(claim.pid, process.pid, 'las dos instancias comparten PID (es el intercalado que se quiere probar)'); const before = snapshotOf(kit, input.name, id); assert.ok(before.staging, 'la primera tiene su staging activo');
    const second = await attempt(kit, input); assert.equal(second.ok, false); assert.equal((second as { code?: string }).code, 'ALREADY_IMPORTED', 'la segunda no puede probar que el reclamo sea obsoleto ⇒ ambiguo ⇒ bloquea'); assert.deepEqual(snapshotOf(kit, input.name, id), before, 'reclamo, staging y exclusión intactos');
    writeFileSync(flag + '.go', '1'); const r = await held; assert.deepEqual({ ok: r.ok, id: r.id }, { ok: true, id }, 'la primera termina bien con SU destino'); trackFolder(join(TMP, 'rescue106-' + id)); assert.ok(isPublished(id)); const fin = readClaim(kit, input.name)!; assert.deepEqual({ s: fin.status, d: fin.destination }, { s: 'imported', d: id });
    assert.equal(stagingList(id), null, 'sin staging residual'); assert.equal((await attempt(kit, input) as { code?: string }).code, 'ALREADY_IMPORTED', 'reintento tras terminar: importada'); assert.equal(rawOrNull(claimFile(kit, input.name) + '.takeover'), null);
  } finally { writeFileSync(flag + '.go', '1'); await worker.terminate(); cleanup(kit); origin.close(); }
});

test('R3 · PROCESOS reales de PID distinto: con el importador activo retenido en un paso el otro se rechaza sin tocar nada; al soltarlo, un solo destino', async () => {
  const { kit, origin, input } = await prep(), flag = join(kit.dir, 'r3-proc'), a = spawnChild(kit, input, { mode: 'block', step: 'import:components-written', flag }); await waitFile(flag + '.reached');
  try {
    const claim = readClaim(kit, input.name)!, id = claim.destination!; assert.equal(claim.pid, a.pid); assert.notEqual(a.pid, process.pid); const before = snapshotOf(kit, input.name, id);
    const second = await attempt(kit, input); assert.equal((second as { code?: string }).code, 'ALREADY_IMPORTED'); assert.deepEqual(snapshotOf(kit, input.name, id), before);
    a.release(flag); const r = await a.done; assert.deepEqual({ ok: r.result?.ok, id: r.result?.id }, { ok: true, id }); trackFolder(join(TMP, 'rescue106-' + id)); assert.ok(isPublished(id));
  } finally { writeFileSync(flag + '.go', '1'); cleanup(kit); origin.close(); }
});

for (const c of [{ step: 'import:before-publish', published: false }, { step: 'import:published', published: true }]) test('R3 · el PROPIETARIO muere en «' + c.step + '»: se distingue la caída y el reintento ' + (c.published ? 'consolida sin importar de nuevo' : 'importa una sola vez'), async () => {
  const { kit, origin, input } = await prep(), a = await spawnChild(kit, input, { mode: 'crash', step: c.step }).done; assert.equal(a.code, 86); const dead = readClaim(kit, input.name)!; assert.equal(dead.status, 'importing'); assert.equal(isPublished(dead.destination!), c.published);
  const w = watchClaim(kit, input.name), r = await attempt(kit, input); w.track(); trackFolder(join(TMP, 'rescue106-' + dead.destination!));
  if (c.published) { assert.equal((r as { code?: string }).code, 'ALREADY_IMPORTED'); assert.equal(readClaim(kit, input.name)!.recovered, true); assert.deepEqual(w.published(), [dead.destination]); }
  else { assert.equal(r.ok, true); assert.equal(w.published().length, 1); assert.notEqual(w.published()[0], dead.destination); assert.equal(isPublished(dead.destination!), false); }
  origin.close();
});

test('R3 · DOS RECUPERADORES de un reclamo huérfano, intercalado forzado: uno retiene la exclusión (recovery-locked) y el otro se rechaza con CLAIM_RECOVERY_BUSY sin tocar nada; al soltar, un solo destino', async () => {
  const { kit, origin, input } = await prep(), dead = await deadPid(), stale = JSON.stringify({ status: 'importing', destination: '77777777-7777-4777-8777-777777777777', pid: dead, owner: 'otra-instancia', at: 'x' }); writeFileSync(claimFile(kit, input.name), stale);
  const flag = join(kit.dir, 'r3-lock'), a = spawnChild(kit, input, { mode: 'block', step: 'import:recovery-locked', flag }); await waitFile(flag + '.reached');
  try {
    assert.ok(rawOrNull(claimFile(kit, input.name) + '.takeover'), 'A tiene la exclusión'); const r = await attempt(kit, input); assert.equal((r as { code?: string }).code, 'CLAIM_RECOVERY_BUSY'); const d = (r as { error: Error & { details?: { holderPid: number; holderAlive: boolean } } }).error.details!; assert.deepEqual({ pid: d.holderPid, alive: d.holderAlive }, { pid: a.pid, alive: true }, 'el error dice quién la tiene y que existe'); assert.equal(rawOrNull(claimFile(kit, input.name)), stale, 'el reclamo no se tocó');
    a.release(flag); const done = await a.done; assert.equal(done.result?.ok, true); const id = done.result!.id!; trackFolder(join(TMP, 'rescue106-' + id)); assert.equal(rawOrNull(claimFile(kit, input.name) + '.takeover'), null, 'A retiró SU exclusión'); assert.equal(readClaim(kit, input.name)!.destination, id);
    assert.equal((await attempt(kit, input) as { code?: string }).code, 'ALREADY_IMPORTED'); assert.ok(isPublished(id));
  } finally { writeFileSync(flag + '.go', '1'); cleanup(kit); origin.close(); }
});

test('R3 · el recuperador que LEYÓ el reclamo obsoleto pierde frente a otro que ya recuperó e importó: revalida bajo exclusión y se rechaza, sin segundo destino', async () => {
  const { kit, origin, input } = await prep(), dead = await deadPid(), stale = JSON.stringify({ status: 'importing', destination: '88888888-8888-4888-8888-888888888888', pid: dead, owner: 'otra-instancia', at: 'x' }); writeFileSync(claimFile(kit, input.name), stale);
  const flag = join(kit.dir, 'r3-read'), b = spawnChild(kit, input, { mode: 'block', step: 'import:claim-read', flag }); await waitFile(flag + '.reached');
  try {
    const w = watchClaim(kit, input.name), a = await attempt(kit, input); w.track(); assert.equal(a.ok, true, 'A recupera e importa mientras B tiene leído el reclamo viejo'); const id = [...w.ids].find(x => x !== '88888888-8888-4888-8888-888888888888')!; assert.ok(isPublished(id)); const claimA = rawOrNull(claimFile(kit, input.name));
    b.release(flag); const rb = await b.done; assert.deepEqual({ ok: rb.result?.ok, code: rb.result?.code }, { ok: false, code: 'ALREADY_IMPORTED' }, 'B no puede tomar un reclamo que ya no es el que leyó'); assert.equal(rawOrNull(claimFile(kit, input.name)), claimA, 'el reclamo de A sigue intacto'); assert.deepEqual(w.published(), [id], 'un solo destino');
  } finally { writeFileSync(flag + '.go', '1'); cleanup(kit); origin.close(); }
});

test('R3 · ciclo de vida de «.takeover»: abandonado por un proceso muerto o ilegible NO se retira solo; el error y describeClaim informan lo verificable; tras el paso humano verificado se recupera una vez', async () => {
  const { kit, origin, input } = await prep(), dead = await deadPid(), path = claimFile(kit, input.name), tk = path + '.takeover', stale = JSON.stringify({ status: 'importing', destination: '99999999-9999-4999-8999-999999999999', pid: dead, owner: 'otra-instancia', at: 'x' });
  writeFileSync(path, stale); const abandoned = JSON.stringify({ pid: dead, owner: 'otra-instancia', token: 't', at: '2026-11-02T07:00:00.000Z' }); writeFileSync(tk, abandoned);
  const a = await attempt(kit, input); assert.equal((a as { code?: string }).code, 'CLAIM_RECOVERY_BUSY'); const da = (a as { error: Error & { details?: { holderPid: number | null; holderAlive: boolean | null; since: string | null } } }).error.details!; assert.deepEqual({ p: da.holderPid, a: da.holderAlive, s: da.since }, { p: dead, a: false, s: '2026-11-02T07:00:00.000Z' }); assert.equal(rawOrNull(tk), abandoned); assert.equal(rawOrNull(path), stale);
  const rep = describeClaim(kit, input.name); assert.deepEqual({ tk: rep.takeover?.pidAlive, pub: rep.publication, st: rep.claim?.status }, { tk: false, pub: 'absent', st: 'importing' }); assert.match(rep.verdict, /exclusión de recuperación \(su proceso ya no existe\)/);
  writeFileSync(tk, '{no es json'); const b = await attempt(kit, input); assert.equal((b as { code?: string }).code, 'CLAIM_RECOVERY_BUSY'); assert.equal((b as { error: Error & { details?: { holderAlive: boolean | null } } }).error.details!.holderAlive, null); assert.equal(rawOrNull(tk), '{no es json');
  // paso humano VERIFICADO: el proceso del takeover no existe, el reclamo sigue igual y el destino no está publicado ⇒ se retira la exclusión (aquí lo hace la prueba) y se recupera una sola vez
  assert.equal(rawOrNull(path), stale); assert.equal(describeClaim(kit, input.name).publication, 'absent'); unlinkSync(tk); const w = watchClaim(kit, input.name), c = await attempt(kit, input); w.track(); assert.equal(c.ok, true); assert.equal(w.published().length, 1); origin.close();
});

test('R3 · propiedad ambigua: un reclamo sin propietario conocido con el PID de ESTE proceso, o escrito por otra instancia, bloquea sin tocarse; solo ESTA instancia recupera lo suyo', async () => {
  const { kit, origin, input } = await prep(), path = claimFile(kit, input.name);
  const legacy = JSON.stringify({ status: 'importing', destination: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', pid: process.pid, at: 'x' }); writeFileSync(path, legacy); assert.equal(((await attempt(kit, input)) as { code?: string }).code, 'ALREADY_IMPORTED'); assert.equal(rawOrNull(path), legacy, 'sin propietario: ambiguo');
  const other = JSON.stringify({ status: 'importing', destination: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', pid: process.pid, owner: 'otra-instancia-del-mismo-proceso', at: 'x' }); writeFileSync(path, other); assert.equal(((await attempt(kit, input)) as { code?: string }).code, 'ALREADY_IMPORTED'); assert.equal(rawOrNull(path), other, 'otra instancia con el mismo PID: ambiguo');
  assert.match(describeClaim(kit, input.name).verdict, /PID vivo con otro propietario/); unlinkSync(path); origin.close();
});

test('R3 · la confirmación no pisa un reclamo AJENO: si entre publicar y confirmar el reclamo ya no es el propio, se informa UNCONFIRMED y el reclamo ajeno queda intacto', async () => {
  const { kit, origin, input } = await prep(), foreign = JSON.stringify({ status: 'importing', destination: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', pid: process.pid, owner: 'otra-instancia', at: 'x' }); let armed = true;
  const w = watchClaim(kit, input.name, step => { if (step === 'import:first-start-ok' && armed) { armed = false; unlinkSync(claimFile(kit, input.name)); writeFileSync(claimFile(kit, input.name), foreign); } });
  const r = await attempt(kit, input); w.track(); assert.equal((r as { code?: string }).code, 'IMPORT_PUBLISHED_UNCONFIRMED'); assert.equal(w.published().length, 1); assert.equal(rawOrNull(claimFile(kit, input.name)), foreign, 'el reclamo ajeno no se sobrescribió'); unlinkSync(claimFile(kit, input.name)); origin.close();
});

test('R3 · describeClaim es de SOLO LECTURA y distingue los estados (sin reclamo, en curso, obsoleto publicado, obsoleto sin destino, importada, ilegible)', async () => {
  const { kit, origin, input } = await prep(), path = claimFile(kit, input.name), dead = await deadPid(), alive = spawn(process.execPath, ['-e', 'setInterval(()=>{},1000)'], { stdio: 'ignore', windowsHide: true });
  const listing = () => readdirSync(kit.capsules).sort().map(n => n + ':' + (rawOrNull(join(kit.capsules, n))?.length ?? 'd')).join('|'); const base = listing();
  try {
    assert.match(describeClaim(kit, input.name).verdict, /Sin reclamo/);
    writeFileSync(path, JSON.stringify({ status: 'importing', destination: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', pid: alive.pid, owner: 'x', at: 'x' })); assert.match(describeClaim(kit, input.name).verdict, /en curso/);
    const real = '11111111-2222-4333-8444-555555555555', dir = join(TMP, 'rescue106-' + real); mkdirSync(dir); writeFileSync(join(dir, 'rescue-room.marker.json'), JSON.stringify({ kind: 'rescue106', roomId: real })); trackFolder(dir);
    writeFileSync(path, JSON.stringify({ status: 'importing', destination: real, pid: dead, owner: 'x', at: 'x' })); assert.equal(describeClaim(kit, input.name).publication, 'published'); assert.match(describeClaim(kit, input.name).verdict, /consolida/);
    writeFileSync(path, JSON.stringify({ status: 'importing', destination: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', pid: dead, owner: 'x', at: 'x' })); assert.equal(describeClaim(kit, input.name).publication, 'absent'); assert.match(describeClaim(kit, input.name).verdict, /se recupera/);
    writeFileSync(path, JSON.stringify({ status: 'imported', destination: real, at: 'x' })); assert.match(describeClaim(kit, input.name).verdict, /Importada/); writeFileSync(path, '{roto'); assert.match(describeClaim(kit, input.name).verdict, /ilegible/);
    unlinkSync(path); assert.equal(listing(), base, 'describeClaim no creó ni cambió nada');
  } finally { alive.kill(); } origin.close();
});

for (const fake of [false, true]) test('R3 · ESTRÉS PROBABILÍSTICO (' + (fake ? 'hilos con PID de proceso ajeno vivo, emulan procesos' : 'dos instancias con el MISMO PID') + '): 20 rondas de recuperación simultánea de un reclamo obsoleto; el oráculo es un solo destino por ronda [no es determinista: alinea dos hilos con Atomics, no fuerza el intercalado]', { timeout: 280_000 }, async () => {
  const ROUNDS = 20, { kit, origin, input } = await prep(), dead = await deadPid(), sab = new SharedArrayBuffer(4), go = new Int32Array(sab), path = claimFile(kit, input.name), sleepers = fake ? [0, 1].map(() => spawn(process.execPath, ['-e', 'setInterval(()=>{},1000)'], { stdio: 'ignore', windowsHide: true })) : [];
  const workers = [0, 1].map(i => startWorker(kit, input, { sab, ...(fake ? { fakePid: sleepers[i].pid } : {}) })), once = (w: Worker, type: string, round: number) => new Promise<{ ok?: boolean; id?: string; code?: string }>(ok => { const h = (m: { type: string; round: number }) => { if (m.type === type && m.round === round) { w.off('message', h); ok(m as never); } }; w.on('message', h); });
  const published = new Set<string>(); let duplicated = 0;
  try {
    for (let round = 1; round <= ROUNDS; round++) {
      try { unlinkSync(path); } catch { /* ausente */ } writeFileSync(path, JSON.stringify({ status: 'importing', destination: '55555555-5555-4555-8555-555555555555', pid: dead, owner: 'otra-instancia', at: 'x' }));
      const readies = workers.map(w => once(w, 'ready', round)), dones = workers.map(w => once(w, 'done', round)); workers.forEach((w, i) => w.postMessage({ round, jitterNs: i ? (round % 7) * 40_000 : 0 })); await Promise.all(readies); Atomics.store(go, 0, round); Atomics.notify(go, 0);
      const res = await Promise.all(dones), oks = res.filter(r => r.ok); for (const r of oks) { published.add(r.id!); trackFolder(join(TMP, 'rescue106-' + r.id)); } if (oks.length > 1) duplicated++;
      assert.ok(res.every(r => r.ok || r.code === 'ALREADY_IMPORTED' || r.code === 'CLAIM_RECOVERY_BUSY'), 'resultado inesperado: ' + JSON.stringify(res));
    }
  } finally { await Promise.all(workers.map(w => w.terminate())); for (const s of sleepers) s.kill(); cleanup(kit); origin.close(); }
  assert.equal(duplicated, 0, 'rondas con más de un destino: ' + duplicated); for (const id of published) assert.ok(isPublished(id));
});

// ─── R4 · adquisición inicial y recuperación como UN solo protocolo (revisión 153 / caracterización 150 de Codex) ───
// Actores: R recupera un reclamo huérfano bajo «.takeover»; N es un importador NUEVO que intenta crear el reclamo sin pasar por la exclusión. «import:recovery-verified» es el último punto de R antes de dejar el reclamo en manos de su propio intento.
// Estas pruebas SÍ fuerzan el intercalado con barreras (no son de estrés): cada una dice qué aseguran y el paso en el que se detiene cada proceso.
const claimDestinations = (kit: Kit, name: string, ...extra: (string | undefined)[]) => { const ids = new Set<string>(); const c = readClaim(kit, name); if (c?.destination) ids.add(c.destination); for (const id of extra) if (id) ids.add(id); return [...ids]; };

test('R4 · RECUPERADOR retenido tras verificar «sin destino» + IMPORTADOR NUEVO en OTRO proceso (ambos con barrera): el nuevo se rechaza con CLAIM_RECOVERY_BUSY, el recuperador importa UNA vez y el reclamo final es el suyo; los archivos ajenos no cambian', async () => {
  const { kit, origin, input } = await prep(), dead = await deadPid(), path = claimFile(kit, input.name), tk = path + '.takeover', staleDest = '66666666-6666-4666-8666-666666666666';
  const stale = JSON.stringify({ status: 'importing', destination: staleDest, pid: dead, owner: 'otra-instancia', at: 'x' }); writeFileSync(path, stale);
  const foreignPath = claimFile(kit, 'ajena-00000001.capsule'), foreign = JSON.stringify({ status: 'imported', destination: 'ffffffff-ffff-4fff-8fff-ffffffffffff', at: 'x' }); writeFileSync(foreignPath, foreign);
  const flagR = join(kit.dir, 'r4-rec'), flagN = join(kit.dir, 'r4-new'), r = spawnChild(kit, input, { mode: 'block', step: 'import:recovery-verified', flag: flagR }); let n: ReturnType<typeof spawnChild> | undefined; let outcome: { recoverer: string; newImporter: string } | null = null, held: { claim: string | null; takeover: string | null } | null = null, rr: Awaited<typeof r.done> | undefined, rn: Awaited<NonNullable<typeof n>['done']> | undefined;
  try {
    await waitFile(flagR + '.reached'); const lock = rawOrNull(tk); assert.ok(lock, 'R tiene la exclusión y ya verificó que el destino anterior no se publicó');
    n = spawnChild(kit, input, { mode: 'block', step: 'import:start', flag: flagN }); await waitFile(flagN + '.reached'); // N existe como proceso propio y espera; se suelta solo con R retenido
    n.release(flagN); rn = await n.done; held = { claim: rawOrNull(path), takeover: rawOrNull(tk) };
    r.release(flagR); rr = await r.done;
    outcome = { recoverer: rr.result?.ok ? 'ok' : (rr.result?.code ?? 'ERROR-SIN-CODIGO-DE-DOMINIO'), newImporter: rn.result?.ok ? 'ok' : (rn.result?.code ?? 'ERROR-SIN-CODIGO-DE-DOMINIO') };
    assert.deepEqual(outcome, { recoverer: 'ok', newImporter: 'CLAIM_RECOVERY_BUSY' }, 'con el recuperador retenido, el importador nuevo debe ver la recuperación en curso; no puede publicar por su cuenta ni dejar al recuperador con un error de sistema');
    assert.equal(held.claim, stale, 'mientras R está retenido el reclamo es el obsoleto, sin tocar'); assert.equal(held.takeover, lock, 'N no tocó la exclusión de R'); assert.deepEqual({ pid: rn.result!.details?.holderPid, alive: rn.result!.details?.holderAlive }, { pid: r.pid, alive: true }, 'el error de N dice quién recupera y que existe');
    const id = rr.result!.id!; trackFolder(join(TMP, 'rescue106-' + id)); const fin = readClaim(kit, input.name)!; assert.deepEqual({ s: fin.status, d: fin.destination }, { s: 'imported', d: id }, 'el reclamo final es el del ganador, confirmado');
    assert.deepEqual(claimDestinations(kit, input.name, staleDest, id).filter(isPublished), [id], 'exactamente UN destino publicado: el de R'); assert.equal(isPublished(staleDest), false); assert.equal(rawOrNull(tk), null, 'R retiró su exclusión'); assert.equal(rawOrNull(foreignPath), foreign, 'el reclamo ajeno no cambió');
  } finally {
    writeFileSync(flagR + '.go', '1'); writeFileSync(flagN + '.go', '1'); await Promise.allSettled([r.done, n?.done]); for (const id of claimDestinations(kit, input.name, rr?.result?.id, rn?.result?.id)) trackFolder(join(TMP, 'rescue106-' + id)); cleanup(kit); origin.close();
  }
});

test('R4 · el reclamo CAMBIA entre verificar y sustituir (otro escritor pone un reclamo ajeno de proceso vivo): el recuperador no lo pisa, se rechaza, no publica y retira solo SU exclusión', async () => {
  const { kit, origin, input } = await prep(), dead = await deadPid(), path = claimFile(kit, input.name), staleDest = '12121212-1212-4121-8121-121212121212';
  writeFileSync(path, JSON.stringify({ status: 'importing', destination: staleDest, pid: dead, owner: 'otra-instancia', at: 'x' }));
  const foreign = JSON.stringify({ status: 'importing', destination: '34343434-3434-4343-8343-343434343434', pid: process.pid, owner: 'escritor-ajeno', at: 'x' }); const steps: string[] = [];
  const w = watchClaim(kit, input.name, step => { steps.push(step); if (step === 'import:recovery-verified') writeFileSync(path, foreign); });
  const r = await attempt(kit, input); w.track(); trackFolder(join(TMP, 'rescue106-' + staleDest));
  assert.deepEqual({ ok: r.ok, code: (r as { code?: string }).code }, { ok: false, code: 'ALREADY_IMPORTED' }, 'un reclamo ajeno de proceso vivo bloquea'); assert.ok(steps.includes('import:recovery-verified'));
  assert.equal(rawOrNull(path), foreign, 'el reclamo ajeno quedó intacto'); assert.equal(rawOrNull(path + '.takeover'), null, 'retiró su exclusión'); assert.deepEqual(w.published(), [], 'no se publicó nada'); assert.equal(isPublished(staleDest), false); assert.deepEqual(readdirSync(kit.capsules).filter(n => n.endsWith('.tmp')), [], 'sin temporales'); unlinkSync(path); origin.close();
});

test('R4 · estado DUDOSO: reclamo obsoleto cuyo destino existe SIN marcador propio ⇒ IMPORT_AMBIGUOUS; no se sustituye el reclamo, no se toca la carpeta y no se llega a la sustitución', async () => {
  const { kit, origin, input } = await prep(), dead = await deadPid(), path = claimFile(kit, input.name), id = randomUUID(), dir = join(TMP, 'rescue106-' + id);
  mkdirSync(dir); trackFolder(dir); writeFileSync(join(dir, 'ajeno.txt'), 'contenido ajeno'); const stale = JSON.stringify({ status: 'importing', destination: id, pid: dead, owner: 'otra-instancia', at: 'x' }); writeFileSync(path, stale); const steps: string[] = [];
  kit.onStep = step => { steps.push(step); }; const r = await attempt(kit, input);
  assert.deepEqual({ ok: r.ok, code: (r as { code?: string }).code }, { ok: false, code: 'IMPORT_AMBIGUOUS' }); assert.ok(!steps.includes('import:recovery-verified'), 'no llegó a sustituir'); assert.equal(rawOrNull(path), stale, 'el reclamo obsoleto se conserva'); assert.equal(rawOrNull(join(dir, 'ajeno.txt')), 'contenido ajeno'); assert.deepEqual(readdirSync(dir), ['ajeno.txt']); assert.equal(rawOrNull(path + '.takeover'), null); unlinkSync(path); unlinkSync(join(dir, 'ajeno.txt')); origin.close();
});

test('R4 · FALLO al sustituir el reclamo (reclamo de solo lectura donde el sistema lo impide): o se importa una vez, o CLAIM_RECOVERY_FAILED con el reclamo anterior comprobado intacto; nunca un error de sistema sin tratar ni dos destinos', async () => {
  const { kit, origin, input } = await prep(), dead = await deadPid(), path = claimFile(kit, input.name), staleDest = '78787878-7878-4787-8787-787878787878', stale = JSON.stringify({ status: 'importing', destination: staleDest, pid: dead, owner: 'otra-instancia', at: 'x' }); writeFileSync(path, stale);
  const w = watchClaim(kit, input.name, step => { if (step === 'import:recovery-verified') chmodSync(path, 0o444); }); let r: Awaited<ReturnType<typeof attempt>>;
  try { r = await attempt(kit, input); } finally { try { chmodSync(path, 0o666); } catch { /* ausente */ } } w.track();
  if (r.ok) { assert.equal(w.published().filter(id => id !== staleDest).length, 1, 'se importó UNA vez'); assert.equal(readClaim(kit, input.name)!.status, 'imported'); }
  else {
    assert.equal(r.code, 'CLAIM_RECOVERY_FAILED', 'error de dominio, no uno de sistema: ' + String((r.error as Error).message).slice(0, 120)); assert.equal(((r.error as Error & { details?: { claimUnchanged?: boolean } }).details ?? {}).claimUnchanged, true, 'se comprobó que el reclamo anterior quedó igual');
    assert.equal(rawOrNull(path), stale); assert.deepEqual(w.published(), [], 'no se publicó nada'); assert.equal(rawOrNull(path + '.takeover'), null, 'retiró su exclusión'); assert.deepEqual(readdirSync(kit.capsules).filter(n => n.endsWith('.tmp')), [], 'sin temporales propios');
    console.log('R4-NOTA: en este sistema el renombrado sobre un reclamo de solo lectura falla ⇒ se observó la rama CLAIM_RECOVERY_FAILED');
  } try { unlinkSync(path); } catch { /* ausente */ } origin.close();
});

test('R4 · un error de sistema al reclamar (carpeta de reclamos ausente) se devuelve como CLAIM_CHECK_FAILED sin afirmar que el origen o el destino estén en un estado que no se comprobó', async () => {
  const { kit, origin, input } = await prep(), broken: Kit = { ...kit, capsules: join(kit.dir, 'no-existe') }, r = await attempt(broken, input);
  assert.deepEqual({ ok: r.ok, code: (r as { code?: string }).code }, { ok: false, code: 'CLAIM_CHECK_FAILED' }); const m = String((r as { error: Error }).error.message); assert.match(m, /no importó nada/); assert.match(m, /no está comprobado/); assert.ok(!m.includes(kit.dir), 'sin rutas'); origin.close();
});
