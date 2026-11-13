import test from 'node:test';
import assert from 'node:assert/strict';
import cp, { spawn, type SpawnOptions } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { syncBuiltinESMExports } from 'node:module';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { join, resolve, sep } from 'node:path';
import { RUN_MARKER, createRelayExecutor, defaultProcessTools, ExecutorError, folderBytes, type ProcessTools } from '../server/relay-rehearsal-executor.js';
import { RunLease } from '../server/relay-rehearsal-lease.js';

// Unidad 224. Ejecutor REAL del Kit 116 en un proceso hijo con cwd aislado, desde un «código desplegado» SIN árbol de pruebas (solo server/, shared/, cuatro scripts, package.json y node_modules).
// Cuenta procesos vivos por la marca de la carpeta de cada ejecución, comprueba la cancelación con el destino ya abierto en otro proceso y la limpieza segura (solo carpetas marcadas; enlaces sin seguir).
const repo = process.cwd(), work = resolve(repo, 'tests', '.tmp', 'exec224-' + randomUUID().slice(0, 8));
const app = join(work, 'deployed'), installRoot = join(work, 'install');
const sha = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
function deployApp() {
  mkdirSync(app, { recursive: true });
  for (const dir of ['server', 'shared']) cpSync(join(repo, dir), join(app, dir), { recursive: true, filter: source => !/[\\/]server[\\/]team$/.test(source) });
  mkdirSync(join(app, 'scripts'), { recursive: true });
  for (const file of ['relay-rehearsal-child.ts', 'rehearse-rescue-capsule.ts', 'demo-rescue-room.ts', 'block-external.cjs']) cpSync(join(repo, 'scripts', file), join(app, 'scripts', file));
  cpSync(join(repo, 'package.json'), join(app, 'package.json'));
  symlinkSync(join(repo, 'node_modules'), join(app, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir');
}
test.before(() => { rmSync(work, { recursive: true, force: true }); deployApp(); mkdirSync(installRoot, { recursive: true }); });
test.after(() => { try { rmSync(join(app, 'node_modules'), { force: true }); } catch { /* ya no está */ } rmSync(work, { recursive: true, force: true }); });

const spy = () => { const seen: { args: string[]; cwd: string | undefined; env: Record<string, string | undefined> }[] = []; const impl = ((command: string, args: string[], options: SpawnOptions) => { seen.push({ args: [...args], cwd: options.cwd as string | undefined, env: { ...(options.env as Record<string, string | undefined>) } }); return spawn(command, args, options); }) as typeof spawn; return { seen, impl }; };
const alive = async (executorRoot: string) => { const names = existsSync(executorRoot) ? readdirSync(executorRoot).filter(n => n.startsWith('run-')) : []; const all = await Promise.all(names.map(name => defaultProcessTools.findByMarker(name))); return all.flat(); };
const until = async <T,>(probe: () => Promise<T | null | false>, ms: number, label: string): Promise<T> => { const end = Date.now() + ms; for (;;) { const value = await probe(); if (value) return value; if (Date.now() > end) throw new Error('Tiempo agotado esperando: ' + label); await new Promise(r => setTimeout(r, 250)); } };
const sourceDigest = () => {
  const lines: string[] = [];
  const walk = (dir: string, prefix: string, skip: (n: string) => boolean) => { for (const e of readdirSync(dir, { withFileTypes: true })) { if (skip(e.name)) continue; if (e.isDirectory()) walk(join(dir, e.name), prefix + e.name + '/', () => false); else lines.push(prefix + e.name + ':' + sha(readFileSync(join(dir, e.name)))); } };
  walk(join(app, 'server'), 'server/', n => n === 'team'); walk(join(app, 'shared'), 'shared/', () => false);
  for (const s of ['relay-rehearsal-child.ts', 'rehearse-rescue-capsule.ts', 'demo-rescue-room.ts', 'block-external.cjs']) lines.push('scripts/' + s + ':' + sha(readFileSync(join(app, 'scripts', s))));
  lines.push('package.json:' + sha(readFileSync(join(app, 'package.json')))); if (existsSync(join(app, 'tsconfig.json'))) lines.push('tsconfig.json:' + sha(readFileSync(join(app, 'tsconfig.json'))));
  return sha(Buffer.from(lines.sort().join('\n')));
};

test('el código desplegado NO contiene el árbol de pruebas, y la raíz de datos no puede estar dentro del código ni ser relativa', () => {
  assert.equal(existsSync(join(app, 'tests')), false); assert.equal(existsSync(join(app, 'tests', '.tmp')), false);
  assert.throws(() => createRelayExecutor({ installRoot: join(app, 'server'), appRoot: app }), /dentro del código/);
  assert.throws(() => createRelayExecutor({ installRoot: 'relativa', appRoot: app }), /absolutas/);
  assert.throws(() => createRelayExecutor({ installRoot, appRoot: join(work, 'no-existe') }), /no contiene el código/);
});

test('KIT REAL desde el código desplegado: un ensayo completo en proceso hijo con cwd aislado, un create, sin duplicados; sin contraseña ni secretos en argumentos/entorno/resultado; carpeta propia retirada; cero procesos vivos', { timeout: 180_000 }, async () => {
  const s = spy(); process.env.PLANB_CANARY_SECRET = 'canary-secret-value';
  try {
    const executor = createRelayExecutor({ installRoot, appRoot: app, spawnImpl: s.impl });
    const result = await executor.run({ signal: new AbortController().signal });
    assert.equal(result.ok, true); assert.equal(result.wrongIdRejected, true); assert.equal(result.createCalls, 1); assert.equal(result.duplicates, 0); assert.match(result.capsule.sha256, /^[0-9a-f]{64}$/);
    assert.deepEqual(Object.keys(result).sort(), ['capsule', 'createCalls', 'duplicates', 'finalStage', 'records', 'ms', 'ok', 'wrongIdRejected'].sort(), 'solo la lista blanca: sin rutas ni nombres de cápsula');
    assert.equal(s.seen.length, 1); const call = s.seen[0]!;
    assert.ok(call.cwd!.startsWith(executor.root) && /run-[0-9a-f-]{36}$/.test(call.cwd!), 'cwd aislado dentro de la raíz de la instalación'); assert.equal(resolve(call.cwd!, '..'), executor.root, 'cuelga directamente de la raíz de la instalación, no de tests/.tmp del repositorio');
    assert.deepEqual(call.args.filter(a => /pass|clave|secret/i.test(a)), [], 'la contraseña no viaja en argumentos'); assert.ok(call.args.every(a => a.length < 200));
    assert.equal(call.env.PLANB_CANARY_SECRET, undefined, 'el entorno del hijo es una lista blanca: no hereda secretos del servidor'); assert.equal(call.env.NODE_OPTIONS, undefined);
    assert.ok(!JSON.stringify(result).includes('canary-secret-value'));
    assert.deepEqual(readdirSync(executor.root), [], 'tras un ensayo completo la carpeta propia se retira'); assert.equal(existsSync(join(app, 'node_modules')), true, 'borrar la carpeta no siguió el enlace a node_modules');
    assert.deepEqual(await alive(executor.root), []); assert.equal(executor.active(), 0);
  } finally { delete process.env.PLANB_CANARY_SECRET; }
});

test('CANCELAR con el destino ya abierto en OTRO proceso: la ranura sigue ocupada hasta que cierra TODO el árbol (hijo y destino); POST→DELETE→POST no arranca otro; queda carpeta parcial marcada con el hash del código', { timeout: 240_000 }, async () => {
  const executor = createRelayExecutor({ installRoot, appRoot: app }), lease = new RunLease<unknown>({ timeoutMs: 200_000 });
  const first = lease.start(context => executor.run(context)); if (first.kind !== 'started') throw new Error('no arrancó');
  const pids = await until(async () => { const list = await alive(executor.root); return list.length >= 2 ? list : false; }, 120_000, 'el hijo y el destino abiertos');
  assert.ok(pids.length >= 2, 'hijo + destino en otro proceso');
  assert.equal(lease.cancel('cancelled'), true); assert.equal((await first.run.outcome).kind, 'discarded');
  const snapshot = lease.snapshot(); assert.equal(snapshot.phase === 'draining' || snapshot.phase === 'idle', true);
  if (snapshot.phase === 'draining') assert.equal(lease.start(context => executor.run(context)).kind, 'busy', 'mientras drena no se admite otro ensayo');
  await first.run.released;
  assert.deepEqual(await alive(executor.root), [], 'cero procesos del Kit vivos al liberarse la ranura'); assert.equal(executor.active(), 0);
  const dirs = readdirSync(executor.root); assert.equal(dirs.length, 1, 'el resultado parcial/incierto se conserva');
  const marker = JSON.parse(readFileSync(join(executor.root, dirs[0]!, RUN_MARKER), 'utf8')); assert.equal(marker.status, 'partial'); assert.equal(marker.codeDigest, sourceDigest(), 'el código ejecutado es exactamente el del paquete (hash por archivo)');
  const second = lease.start(context => executor.run(context)); assert.equal(second.kind, 'started'); if (second.kind === 'started') { lease.cancel('closing'); await second.run.released; }
  assert.deepEqual(await alive(executor.root), []);
});

test('LIMPIEZA SEGURA: solo carpetas con marca verificable, según antigüedad y tope; las ajenas, sin marca o con marca falsa no se tocan y los enlaces no se siguen', () => {
  const root = join(work, 'sweep'), outside = join(work, 'outside-target'), now = Date.parse('2026-11-05T12:00:00.000Z');
  rmSync(root, { recursive: true, force: true }); mkdirSync(root, { recursive: true }); mkdirSync(outside, { recursive: true }); writeFileSync(join(outside, 'sentinela.txt'), 'no debe borrarse');
  const executor = createRelayExecutor({ installRoot: join(work, 'sweep-install'), appRoot: app, now: () => now, keepPartial: 2, maxAgeMs: 3_600_000 });
  const own = executor.root; mkdirSync(own, { recursive: true });
  const make = (status: string, ageMs: number, extra?: (dir: string) => void, id = 'run-' + randomUUID()) => { const dir = join(own, id); mkdirSync(dir, { recursive: true }); writeFileSync(join(dir, RUN_MARKER), JSON.stringify({ format: 'planb-relay-run-v1', id, createdAt: new Date(now - ageMs).toISOString(), ownerPid: 2_000_000_000, status, codeDigest: 'a'.repeat(64) })); writeFileSync(join(dir, 'dato.bin'), 'x'); extra?.(dir); return dir; };
  const completed = make('completed', 1000), recent1 = make('partial', 10_000), recent2 = make('partial', 20_000), surplus = make('partial', 30_000), stale = make('partial', 2 * 3_600_000);
  const withLink = make('partial', 3_600_000 + 1, dir => symlinkSync(outside, join(dir, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir'));
  const noMarker = join(own, 'run-' + randomUUID()); mkdirSync(noMarker); writeFileSync(join(noMarker, 'ajeno.txt'), 'x');
  const wrongId = join(own, 'run-' + randomUUID()); mkdirSync(wrongId); writeFileSync(join(wrongId, RUN_MARKER), JSON.stringify({ format: 'planb-relay-run-v1', id: 'run-' + randomUUID(), createdAt: new Date(now).toISOString(), ownerPid: 1, status: 'completed', codeDigest: 'b'.repeat(64) }));
  const foreign = join(own, 'copia-del-usuario'); mkdirSync(foreign); writeFileSync(join(foreign, 'mis-datos.txt'), 'datos');
  const report = executor.sweep();
  assert.equal(existsSync(completed), false, 'completada: se retira'); assert.equal(existsSync(stale), false, 'más antigua que el máximo'); assert.equal(existsSync(surplus), false, 'por encima de las conservadas'); assert.equal(existsSync(withLink), false, 'antigua con enlace: se retira');
  assert.equal(existsSync(recent1) && existsSync(recent2), true, 'las parciales recientes se conservan'); assert.equal(report.kept, 2);
  assert.equal(existsSync(join(outside, 'sentinela.txt')), true, 'el enlace se retiró SIN seguirlo: el destino sigue intacto');
  assert.equal(existsSync(noMarker) && existsSync(wrongId) && existsSync(foreign), true, 'sin marca, con marca ajena o fuera del patrón: no se toca');
  assert.equal(readFileSync(join(foreign, 'mis-datos.txt'), 'utf8'), 'datos');
  assert.ok(folderBytes(own) > 0);
});

test('ESPACIO: con la raíz por encima del tope no se arranca (error genérico) y no se crea carpeta ni proceso', async () => {
  const dir = join(work, 'space-install'), executor = createRelayExecutor({ installRoot: dir, appRoot: app, maxTotalBytes: 100, keepPartial: 5 });
  mkdirSync(executor.root, { recursive: true }); const id = 'run-' + randomUUID(), kept = join(executor.root, id); mkdirSync(kept);
  writeFileSync(join(kept, RUN_MARKER), JSON.stringify({ format: 'planb-relay-run-v1', id, createdAt: new Date().toISOString(), ownerPid: 2_000_000_000, status: 'partial', codeDigest: 'c'.repeat(64) })); writeFileSync(join(kept, 'grande.bin'), Buffer.alloc(4096));
  await assert.rejects(executor.run({ signal: new AbortController().signal }), (error: unknown) => error instanceof ExecutorError && error.code === 'space');
  assert.deepEqual(readdirSync(executor.root), [id]); assert.deepEqual(await alive(executor.root), []);
  await assert.rejects(createRelayExecutor({ installRoot: dir, appRoot: app }).run({ signal: AbortSignal.abort() }), (error: unknown) => error instanceof ExecutorError && error.code === 'aborted');
});

test('un proceso que no muere a la primera sigue contando: run() no se asienta hasta que findByMarker confirma que no queda ninguno', { timeout: 120_000 }, async () => {
  let lingering = 4, kills = 0; const real = defaultProcessTools;
  const tools: ProcessTools = { killTree: async pid => { kills++; await real.killTree(pid); }, findByMarker: async marker => { const own = await real.findByMarker(marker); if (own.length) return own; return lingering > 0 ? (lingering--, [2_000_000_001]) : []; } };
  const executor = createRelayExecutor({ installRoot: join(work, 'linger-install'), appRoot: app, tools, pollMs: 20 });
  const controller = new AbortController(); setTimeout(() => controller.abort(), 1500);
  const started = Date.now(); await assert.rejects(executor.run({ signal: controller.signal }), (error: unknown) => error instanceof ExecutorError && error.code === 'aborted');
  assert.equal(lingering, 0, 'se siguió preguntando hasta que no quedó ninguno'); assert.ok(kills >= 5, 'se insistió en matar los restantes (' + kills + ')'); assert.ok(Date.now() - started >= 1500);
  assert.deepEqual(await alive(executor.root), []);
});

// ── R2 (dictamen independiente 238): inventario fallido ≠ vacío, cierre exitoso del hijo y raíz decidida por su destino real ─────────────────────────────────────────────
// Los hijos de estas pruebas son SINTÉTICOS (un EventEmitter con la salida acordada): sirven para inyectar el error que el Kit real no produce a voluntad. El Kit real se ejecuta en las pruebas anteriores.
const GOOD_RESULT = { ok: true, wrongIdRejected: true, createCalls: 1, duplicates: 0, records: 1, finalStage: 'return-verified', capsule: { bytes: 1, sha256: 'a'.repeat(64) }, ms: { export: 1, import: 1 } };
const resultLine = (over: Record<string, unknown> = {}) => 'RELAY_RESULT ' + JSON.stringify({ ...GOOD_RESULT, ...over }) + '\n';
function fakeKit(plan: { stdout?: string; code?: number | null; signal?: NodeJS.Signals | null; error?: boolean; throws?: boolean }) {
  let children = 0;
  const impl = (() => {
    if (plan.throws) throw new Error('EPERM simulado');
    children++;
    const child = Object.assign(new EventEmitter(), { pid: undefined, stdout: new PassThrough(), stderr: new PassThrough(), stdin: new PassThrough() });
    queueMicrotask(() => { if (plan.error) { child.emit('error', new Error('no arranca')); return; } child.stdout.end(plan.stdout ?? ''); child.stderr.end(); child.emit('close', plan.code === undefined ? 0 : plan.code, plan.signal ?? null); });
    return child;
  }) as unknown as typeof spawn;
  return { impl, children: () => children };
}
const fresh = (name: string) => join(work, name + '-' + randomUUID().slice(0, 6));
const noProcesses: ProcessTools = { killTree: async () => undefined, findByMarker: async () => [] };
const aborted = (code: string) => (error: unknown) => error instanceof ExecutorError && error.code === code;
const noAbort = () => new AbortController().signal;
const markerOf = (root: string) => { const dirs = readdirSync(root); return { dirs, marker: dirs.length ? JSON.parse(readFileSync(join(root, dirs[0]!, RUN_MARKER), 'utf8')) : null }; };

test('R2·1 INVENTARIO: una herramienta que falla (código ≠ 0, salida vacía o incompleta) RECHAZA: no es «cero procesos»', async t => {
  const original = cp.spawn; t.after(() => { cp.spawn = original; syncBuiltinESMExports(); });
  const mockExit = (code: number, stdout: string) => { cp.spawn = (() => { const child = Object.assign(new EventEmitter(), { stdout: new PassThrough() }); queueMicrotask(() => { child.stdout.end(stdout); child.emit('close', code, null); }); return child; }) as unknown as typeof cp.spawn; syncBuiltinESMExports(); };
  const marker = 'run-12345678-1234-1234-1234-123456789abc';
  mockExit(17, ''); await assert.rejects(defaultProcessTools.findByMarker(marker), /inventory/);
  mockExit(0, ''); await assert.rejects(defaultProcessTools.findByMarker(marker), /inventory/, 'salida vacía = sin la señal de fin: incompleta');
  mockExit(1, 'INVENTORY_COMPLETE\n'); await assert.rejects(defaultProcessTools.findByMarker(marker), /inventory/, 'la señal de fin con código de error tampoco vale');
  mockExit(0, process.platform === 'win32' ? '4242\nINVENTORY_COMPLETE\n' : '4242 node --run ' + marker + '\n'); assert.deepEqual(await defaultProcessTools.findByMarker(marker), [4242]);
  mockExit(0, process.platform === 'win32' ? 'INVENTORY_COMPLETE\n' : '1 init\n'); assert.deepEqual(await defaultProcessTools.findByMarker(marker), [], 'inventario completo y sin coincidencias = confirmado vacío');
  cp.spawn = original; syncBuiltinESMExports();
  await assert.rejects(defaultProcessTools.findByMarker('no-es-una-marca'), /inventory/);
});

test('R2·1 INVENTARIO: fallo seguido de inventario válido → run() se asienta solo tras el válido; fallo mantenido → no se asienta, la plaza sigue ocupada y el estado dice «sin verificar»', { timeout: 60_000 }, async () => {
  let calls = 0;
  const flaky: ProcessTools = { killTree: async () => undefined, findByMarker: async () => { calls++; if (calls <= 3) throw new Error('inventario caído'); return []; } };
  const executor = createRelayExecutor({ installRoot: fresh('inv-flaky'), appRoot: app, tools: flaky, pollMs: 15, spawnImpl: fakeKit({ stdout: resultLine() }).impl });
  const result = await executor.run({ signal: noAbort() }); assert.equal(result.ok, true); assert.equal(calls, 4, 'tres fallos no acreditaron nada; el cuarto inventario, completo y vacío, sí'); assert.equal(executor.active(), 0); assert.equal(executor.closure(), 'none');

  let broken = true;
  const stuck: ProcessTools = { killTree: async () => undefined, findByMarker: async () => { if (broken) throw new Error('PowerShell denegado'); return []; } };
  const held = createRelayExecutor({ installRoot: fresh('inv-stuck'), appRoot: app, tools: stuck, pollMs: 15, spawnImpl: fakeKit({ stdout: resultLine() }).impl });
  const lease = new RunLease<unknown>({ timeoutMs: 120_000 }), first = lease.start(context => held.run(context)); if (first.kind !== 'started') throw new Error('no arrancó');
  let settled = false; void first.run.released.then(() => { settled = true; });
  await until(async () => held.closure() === 'unverified', 15_000, 'el cierre sin verificar');
  assert.equal(lease.cancel('cancelled'), true); await new Promise(r => setTimeout(r, 400));
  assert.equal(settled, false, 'inventario fallido y mantenido: el cierre no está acreditado, la plaza sigue ocupada'); assert.equal(lease.start(context => held.run(context)).kind, 'busy', 'POST→DELETE→POST: no arranca otro'); assert.equal(held.active(), 1); assert.equal(held.closure(), 'unverified');
  broken = false; await first.run.released; assert.equal(settled, true); assert.equal(held.active(), 0); assert.equal(held.closure(), 'none');
});

test('R2·2 SALIDA: una línea válida seguida de código ≠ 0 o de una señal NO es éxito y conserva el rastro; solo 0 (ok) o 1 (fallo informado por el Kit) son coherentes; el rechazo del lanzador no deja carpeta', { timeout: 90_000 }, async () => {
  const run = (plan: Parameters<typeof fakeKit>[0], name: string) => { const install = fresh(name), executor = createRelayExecutor({ installRoot: install, appRoot: app, tools: noProcesses, pollMs: 15, spawnImpl: fakeKit(plan).impl }); return { executor, outcome: executor.run({ signal: noAbort() }) }; };
  const ok = run({ stdout: resultLine(), code: 0 }, 'exit-ok'); assert.equal((await ok.outcome).ok, true); assert.deepEqual(readdirSync(ok.executor.root), [], 'éxito real: carpeta propia retirada');
  const nonZero = run({ stdout: resultLine(), code: 17 }, 'exit-17'); await assert.rejects(nonZero.outcome, aborted('child-failed'));
  const kept = markerOf(nonZero.executor.root); assert.equal(kept.dirs.length, 1, 'el rastro del ensayo se conserva'); assert.equal(kept.marker.status, 'partial'); assert.equal(nonZero.executor.active(), 0);
  const signalled = run({ stdout: resultLine(), code: null, signal: 'SIGKILL' }, 'exit-signal'); await assert.rejects(signalled.outcome, aborted('child-failed')); assert.equal(markerOf(signalled.executor.root).marker.status, 'partial');
  const kitFailure = run({ stdout: resultLine({ ok: false, wrongIdRejected: false }), code: 1 }, 'exit-kit-failure'); const failed = await kitFailure.outcome; assert.equal(failed.ok, false, 'el fallo informado por el Kit (código 1) se devuelve como resultado, no como éxito'); assert.equal(markerOf(kitFailure.executor.root).marker.status, 'partial');
  const mismatch = run({ stdout: resultLine({ ok: false }), code: 0 }, 'exit-mismatch'); await assert.rejects(mismatch.outcome, aborted('child-failed'));
  const claimsOkButFails = run({ stdout: resultLine(), code: 1 }, 'exit-ok-code1'); await assert.rejects(claimsOkButFails.outcome, aborted('child-failed'));
  const noLine = run({ stdout: '', code: 0 }, 'exit-no-line'); await assert.rejects(noLine.outcome, aborted('child-failed'));
  const throws = run({ throws: true }, 'launcher-throws'); await assert.rejects(throws.outcome, aborted('setup-failed')); assert.deepEqual(readdirSync(throws.executor.root), [], 'el lanzador rechazó antes de ejecutar nada: no hay rastro que conservar');
  const errored = run({ error: true }, 'launcher-error'); await assert.rejects(errored.outcome, aborted('setup-failed')); assert.equal(errored.executor.active(), 0);
});

test('R2·3 RAÍZ: se decide por el DESTINO REAL — una unión (o ruta equivalente de Windows) hacia el código o hacia el árbol de fuentes se rechaza; una raíz nueva es válida; una raíz de ensayos sustituida no se usa ni se toca', { timeout: 60_000 }, async () => {
  const kind = process.platform === 'win32' ? 'junction' : 'dir', base = fresh('alias'); mkdirSync(base, { recursive: true });
  const code = join(app, 'server'), toCode = join(base, 'a-codigo'); symlinkSync(code, toCode, kind);
  assert.throws(() => createRelayExecutor({ installRoot: toCode, appRoot: app }), /dentro del código|alias/i, 'unión directa a server/');
  const nested = join(code, 'sub-datos'); mkdirSync(nested, { recursive: true }); const toNested = join(base, 'a-subcarpeta-de-codigo'); symlinkSync(nested, toNested, kind);
  assert.throws(() => createRelayExecutor({ installRoot: join(toNested, 'datos'), appRoot: app }), /dentro del código|alias/i, 'una raíz que aún no existe bajo un ancestro que es unión hacia el código');
  for (const dir of ['shared', 'scripts']) { const link = join(base, 'a-' + dir); symlinkSync(join(app, dir), link, kind); assert.throws(() => createRelayExecutor({ installRoot: link, appRoot: app }), /dentro del código|alias/i, dir); }
  const toApp = join(base, 'a-la-raiz-del-codigo'); symlinkSync(app, toApp, kind); assert.throws(() => createRelayExecutor({ installRoot: toApp, appRoot: app }), /dentro del código|alias/i, 'unión a la raíz del código');
  const sameAsApp = join(base, 'a-codigo-con-app-por-unión'); symlinkSync(app, sameAsApp, kind); assert.throws(() => createRelayExecutor({ installRoot: join(sameAsApp, 'server'), appRoot: sameAsApp }), /dentro del código|alias/i, 'código y raíz por la misma unión');
  const spellings = [join(app, 'server') + sep + '.', join(app, 'x', '..', 'server'), process.platform === 'win32' ? join(app, 'server').toUpperCase() : join(app, 'server'), process.platform === 'win32' ? '\\\\?\\' + join(app, 'server') : join(app, 'server') + sep, join(app, 'server').split(sep).join('/')];
  for (const spelling of spellings) assert.throws(() => createRelayExecutor({ installRoot: spelling, appRoot: app }), /dentro del código|alias|absolutas/i, 'grafía equivalente: ' + spelling);
  const viaAlias = join(base, 'ensayos-ajenos'); mkdirSync(join(base, 'destino-ajeno'), { recursive: true }); mkdirSync(join(base, 'raiz-con-alias'), { recursive: true }); symlinkSync(join(base, 'destino-ajeno'), join(base, 'raiz-con-alias', 'relay-rehearsals'), kind);
  assert.throws(() => createRelayExecutor({ installRoot: join(base, 'raiz-con-alias'), appRoot: app }), /alias/i, 'relay-rehearsals ya es una unión hacia otro destino'); void viaAlias;

  const brandNew = fresh('raiz-nueva'), executor = createRelayExecutor({ installRoot: join(brandNew, 'datos', 'instalacion'), appRoot: app, tools: noProcesses, pollMs: 15, spawnImpl: fakeKit({ stdout: resultLine() }).impl });
  assert.equal(existsSync(brandNew), false, 'crear el ejecutor no escribe nada'); assert.equal((await executor.run({ signal: noAbort() })).ok, true); assert.equal(existsSync(executor.root), true, 'una raíz ficticia nueva y propia se admite');

  const outside = join(base, 'ajeno'), sentinel = join(outside, 'sentinela.txt'); mkdirSync(outside, { recursive: true }); writeFileSync(sentinel, 'datos del usuario');
  const swapInstall = join(base, 'instalacion-sustituida'), swapped = createRelayExecutor({ installRoot: swapInstall, appRoot: app, tools: noProcesses, pollMs: 15, spawnImpl: fakeKit({ stdout: resultLine() }).impl });
  mkdirSync(swapped.root, { recursive: true }); rmSync(swapped.root, { recursive: true, force: true }); symlinkSync(outside, swapped.root, kind);   // la raíz de ensayos pasa a ser una unión hacia otro destino
  await assert.rejects(swapped.run({ signal: noAbort() }), aborted('setup-failed')); assert.deepEqual(swapped.sweep(), { removed: 0, kept: 0, skipped: 0 }); assert.deepEqual(readdirSync(outside), ['sentinela.txt'], 'no se escribió ni se barrió en el destino ajeno'); assert.equal(readFileSync(sentinel, 'utf8'), 'datos del usuario');
  rmSync(swapped.root, { force: true });
});
