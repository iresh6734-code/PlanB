import test from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdirSync, rmSync, symlinkSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { join, resolve } from 'node:path';
import type { AddressInfo } from 'node:net';
import { createRelayExecutor } from '../server/relay-rehearsal-executor.js';
import { createBaseApp } from '../server/app.js';
import { registerRelayRehearsalApi, storeRelayRecord, type RelayRehearsalDeps } from '../server/relay-rehearsal-api.js';
import { RELAY_REHEARSAL_ROUTE, RelayRehearsalStoredSchema, inspectRelayRecord, parseRelayRehearsalState, recordFromRehearsal, toPassportRecord, type RehearsalResultLike, type RelayRehearsalApiState } from '../shared/relay-rehearsal.js';
import { buildPassport } from '../shared/continuity-passport.js';

// Unidad 216. Contrato + API del ensayo de relevo con el KIT REAL (un ensayo completo en proceso nuevo) y con ejecutores simulados para las fronteras (doble clic, sesión, cancelación,
// fallos, interrupción). createBaseApp real (Store real, hooks de host/Origin/sesión). Sin red externa, sin HubSpot, ficción; no acredita otro equipo ni RTO/RPO.
const NOW = Date.parse('2026-11-05T12:00:00.000Z'), SECRET = 'secreto-del-error-/ruta/interna/clave';
const GOOD: RehearsalResultLike = { ok: true, wrongIdRejected: true, createCalls: 1, duplicates: 0, records: 63, finalStage: 'return-verified', capsule: { bytes: 100063, sha256: 'a'.repeat(64) }, ms: { export: 93, import: 1231 } };
const gate = () => { let release!: () => void; const promise = new Promise<void>(resolve => { release = resolve; }); return { promise, release }; };
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function rig(run: RelayRehearsalDeps['run'], options: { password?: boolean; timeoutMs?: number; closeGraceMs?: number } = {}) {
  const { app, store, security } = await createBaseApp({ dbPath: ':memory:', root: '.', staticDir: 'none' });
  let calls = 0; const wrapped: RelayRehearsalDeps['run'] = async context => { calls++; return run(context); };
  const handle = registerRelayRehearsalApi(app, { captureAuthorization: security.captureAuthorization, store: storeRelayRecord(store), run: wrapped, now: () => NOW, timeoutMs: options.timeoutMs, closeGraceMs: options.closeGraceMs ?? 300 });
  await app.listen({ host: '127.0.0.1', port: 0 }); const base = 'http://127.0.0.1:' + (app.server.address() as AddressInfo).port; let cookie = '';
  if (options.password) { const r = await fetch(base + '/api/v2/auth/setup', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base }, body: JSON.stringify({ password: 'contraseña-ficticia-216' }) }); cookie = (r.headers.get('set-cookie') ?? '').split(';')[0]; }
  const headers = (extra: Record<string, string> = {}) => ({ ...(cookie ? { Cookie: cookie } : {}), ...extra });
  const get = async () => { const r = await fetch(base + RELAY_REHEARSAL_ROUTE, { headers: headers() }); return { code: r.status, text: await r.text() }; };
  const state = async () => parseRelayRehearsalState(JSON.parse((await get()).text)) as RelayRehearsalApiState;
  const post = async (body: unknown = { fiction: true }, extra: Record<string, string> = { Origin: base }) => { const r = await fetch(base + RELAY_REHEARSAL_ROUTE, { method: 'POST', headers: headers({ 'Content-Type': 'application/json', ...extra }), body: JSON.stringify(body) }); const text = await r.text(); return { code: r.status, text, json: (r.status === 401 ? null : JSON.parse(text)) as RelayRehearsalApiState }; };
  const del = async () => (await fetch(base + RELAY_REHEARSAL_ROUTE, { method: 'DELETE', headers: headers({ Origin: base }) })).status;
  const lock = async () => (await fetch(base + '/api/v2/auth/lock', { method: 'POST', headers: headers({ 'Content-Type': 'application/json', Origin: base }), body: '{}' })).status;
  const login = async () => { const r = await fetch(base + '/api/v2/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base }, body: JSON.stringify({ password: 'contraseña-ficticia-216' }) }); cookie = (r.headers.get('set-cookie') ?? '').split(';')[0]; return r.status; };
  return { app, store, base, handle, calls: () => calls, get, state, post, del, lock, login, close: () => app.close() };
}
type Rig = Awaited<ReturnType<typeof rig>>;
const using = async (run: RelayRehearsalDeps['run'], fn: (r: Rig) => Promise<void>, options?: Parameters<typeof rig>[1]) => { const r = await rig(run, options); try { await fn(r); } finally { await r.close(); } };
const clean = (text: string) => { for (const secret of ['secreto-del-error', 'ruta/interna', 'C:\\', 'password', 'contraseña']) assert.ok(!text.toLowerCase().includes(secret.toLowerCase()), 'no sale «' + secret + '»'); };

test('CONTRATO: el resultado real del Kit se convierte en un registro estricto; completado exige ID equivocado rechazado, UN solo create, cero duplicados y retorno verificado; nada de ello es «otro equipo»', () => {
  const ok = recordFromRehearsal({ now: NOW, result: GOOD }); assert.equal(ok.outcome, 'completed'); assert.equal(RelayRehearsalStoredSchema.safeParse(ok).success, true); assert.equal(inspectRelayRecord(ok, NOW), null);
  assert.deepEqual(ok.scope, { computer: 'same', data: 'fiction', destination: 'new-folder-and-process' }); assert.equal(ok.capsule!.sha16, 'a'.repeat(16)); assert.ok(ok.notProven.some(t => /otro ordenador/.test(t)));
  assert.ok(ok.notInherited.some(t => /memoria/.test(t)) && ok.notInherited.some(t => /aprobación/.test(t)) && ok.notInherited.some(t => /acuse/.test(t)), 'qué NO se hereda, incluidos los intentos solo en memoria');
  assert.ok(!ok.included.some(t => /intento/.test(t)), 'un recuento de intentos en memoria no se anuncia como incluido');
  for (const [name, bad] of [['ID equivocado aceptado', { ...GOOD, wrongIdRejected: false }], ['duplicado', { ...GOOD, duplicates: 1 }], ['dos creates', { ...GOOD, createCalls: 2 }], ['sin verificar', { ...GOOD, finalStage: 'return-partial' }], ['ok falso', { ...GOOD, ok: false }]] as const) {
    const r = recordFromRehearsal({ now: NOW, result: bad }); assert.equal(r.outcome, 'failed', name); assert.equal(r.reconciledOnce, name === 'ID equivocado aceptado', name + ': solo hay conciliación única si hubo un create y ninguna duplicación');
  }
  for (const interrupted of [false, true]) { const r = recordFromRehearsal({ now: NOW, result: null, interrupted }); assert.equal(r.outcome, interrupted ? 'interrupted' : 'failed'); assert.deepEqual([r.destinationOpened, r.wrongIdRejected, r.reconciledOnce], [false, false, false]); assert.equal(r.capsule, null); }
  const p = toPassportRecord(ok); assert.equal(p.captureId, null); assert.equal(p.outcome, 'completed'); assert.ok(p.included.length && p.notInherited.length);
  const passport = buildPassport({ now: NOW, installId: null, copy: { status: 'not-provided', at: null, value: null }, hubspot: { status: 'not-provided', at: null, value: null }, work: { status: 'not-provided', at: null, value: null }, relay: { status: 'read', at: ok.rehearsedAt, value: p } });
  assert.ok(passport.sections.find(s => s.key === 'rehearsal')!.claims.some(c => /Ensayo de relevo.*completado.*se concilió una sola operación/.test(c.text) && /mismo equipo · datos ficticios/.test(c.scope)), 'el pasaporte lo consume con su alcance');
});

test('CONTRATO: un registro incoherente o con campos de más se rechaza (completado sin pruebas, fecha futura, interrumpido con éxito, conciliación con dos creates, ruta o contraseña colada)', () => {
  const ok = recordFromRehearsal({ now: NOW, result: GOOD });
  for (const [name, change] of [['completado sin destino', { destinationOpened: false }], ['completado sin ID equivocado', { wrongIdRejected: false }], ['completado con dos creates', { createCalls: 2 }], ['completado con duplicado', { duplicates: 1 }], ['fecha futura', { rehearsedAt: new Date(NOW + 3_600_000).toISOString() }],
    ['interrumpido con éxito', { outcome: 'interrupted' as const }], ['fallo que declara conciliación con dos creates', { outcome: 'failed' as const, createCalls: 2 }]] as const) assert.notEqual(inspectRelayRecord({ ...ok, ...change }, NOW), null, name);
  assert.equal(RelayRehearsalStoredSchema.safeParse({ ...ok, path: 'C:\\Users\\x' }).success, false); assert.equal(RelayRehearsalStoredSchema.safeParse({ ...ok, password: 'x' }).success, false); assert.equal(RelayRehearsalStoredSchema.safeParse({ ...ok, scope: { ...ok.scope, computer: 'other' } }).success, false);
});

test('GET solo devuelve lo guardado (nunca ejecuta); POST con ejecutor simulado guarda un ensayo completado y GET lo devuelve con su alcance', async () => {
  await using(async () => GOOD, async r => {
    const s0 = await r.state(); assert.equal(s0.last, null); assert.equal(s0.scope.fiction, true); assert.equal(s0.scope.exportsActiveSpace, false); assert.equal(r.calls(), 0, 'consultar no ejecuta');
    for (let i = 0; i < 3; i++) await r.get(); assert.equal(r.calls(), 0);
    const p = await r.post(); assert.equal(p.code, 200); assert.equal(p.json.last!.outcome, 'completed'); assert.equal(p.json.started, true); assert.equal(p.json.issue, null); clean(p.text); assert.equal(r.calls(), 1);
    const s1 = await r.state(); assert.equal(s1.last!.outcome, 'completed'); assert.equal(r.calls(), 1); assert.ok(s1.scope.notProven.length >= 3);
  });
});

test('DOBLE CLIC y SEGUNDA PESTAÑA: con el ensayo retenido, los demás POST reciben 202 sin iniciar otro; al terminar hay exactamente UN ensayo', async () => {
  const hold = gate();
  await using(async () => { await hold.promise; return GOOD; }, async r => {
    const first = r.post(); await sleep(100); const [a, b] = await Promise.all([r.post(), r.post()]);
    for (const x of [a, b]) { assert.equal(x.code, 202); assert.equal(x.json.issue, 'ALREADY_RUNNING'); assert.equal(x.json.started, false); assert.ok(x.json.running); }
    assert.ok((await r.state()).running); hold.release(); assert.equal((await first).code, 200); assert.equal(r.calls(), 1); assert.equal((await r.state()).running, null);
    assert.equal((await r.post()).code, 200); assert.equal(r.calls(), 2, 'una acción explícita nueva sí ensaya otra vez');
  });
});

test('FALLO e INTERRUPCIÓN sin éxito falso: el error (con ruta y secreto dentro) no sale, el registro es «falló»/«interrumpido» y no declara destino abierto ni conciliación', async () => {
  await using(async () => { throw new Error(SECRET); }, async r => {
    const p = await r.post(); assert.equal(p.code, 200); assert.equal(p.json.issue, 'RUN_FAILED'); assert.equal(p.json.last!.outcome, 'failed'); assert.equal(p.json.last!.reconciledOnce, false); assert.equal(p.json.last!.destinationOpened, false); clean(p.text);
  });
  await using(() => new Promise<RehearsalResultLike>(() => undefined), async r => { const p = await r.post(); assert.equal(p.json.last!.outcome, 'interrupted'); assert.equal(p.json.last!.reconciledOnce, false); }, { timeoutMs: 1000 });
  await using(async () => ({ ...GOOD, duplicates: 1 }), async r => { const p = await r.post(); assert.equal(p.json.last!.outcome, 'failed'); assert.equal(p.json.issue, 'RUN_FAILED'); assert.equal(p.json.last!.reconciledOnce, false); });
});

test('SESIÓN: sin cookie 401 sin ejecutar; revocar durante el ensayo ⇒ 401 sin devolver nada y sin guardar; la sesión nueva no recibe el ensayo antiguo; Origin ausente/externo 403; cuerpo inválido 422', async () => {
  const hold = gate();
  await using(async () => { await hold.promise; return GOOD; }, async r => {
    assert.equal((await fetch(r.base + RELAY_REHEARSAL_ROUTE, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: r.base }, body: '{"fiction":true}' })).status, 401);
    assert.equal((await r.post(undefined, {})).code, 403); assert.equal((await r.post(undefined, { Origin: 'http://evil.example' })).code, 403);
    for (const body of [{}, { fiction: false }, { fiction: true, exportActive: true }]) assert.equal((await r.post(body)).code, 422, JSON.stringify(body));
    assert.equal(r.calls(), 0);
    const started = r.post(); await sleep(100); assert.equal(await r.lock(), 200); hold.release(); const done = await started;
    assert.equal(done.code, 401); assert.ok(!/completed|last/.test(done.text)); assert.equal(r.store.get('relayRehearsal', null), null);
    assert.equal(await r.login(), 200); assert.equal((await r.state()).last, null, 'la sesión nueva no hereda el ensayo de la revocada');
  }, { password: true });
});

test('CANCELAR descarta el resultado y no guarda nada; la plaza sigue ocupada hasta que el ejecutor termina (aquí ignora la señal); sin Origin no cancela', async () => {
  const hold = gate();
  await using(async () => { await hold.promise; return GOOD; }, async r => {
    const started = r.post(); await sleep(100); assert.equal((await fetch(r.base + RELAY_REHEARSAL_ROUTE, { method: 'DELETE' })).status, 403); assert.ok((await r.state()).running);
    assert.equal(await r.del(), 200); hold.release(); const done = await started; assert.equal(done.code, 409); assert.equal(done.json.issue, 'CANCELLED'); assert.equal(r.store.get('relayRehearsal', null), null); assert.equal(r.handle.cancel(), false);
  });
});

test('dependencia de autorización OBLIGATORIA y con fallo cerrado; registro guardado ilegible o incoherente se declara y no se acredita', async () => {
  const { app, store } = await createBaseApp({ dbPath: ':memory:', root: '.', staticDir: 'none' });
  try { assert.throws(() => registerRelayRehearsalApi(app, { store: storeRelayRecord(store) } as unknown as RelayRehearsalDeps), /captureAuthorization es obligatoria/);
    assert.throws(() => registerRelayRehearsalApi(app, { captureAuthorization: () => () => true, store: storeRelayRecord(store) } as unknown as RelayRehearsalDeps), /run es obligatorio/, 'sin ejecutor no hay valor por defecto que use el cwd del servidor'); } finally { await app.close(); }
  await using(async () => GOOD, async r => { assert.equal((await r.post()).code, 401); assert.equal(r.calls(), 0); }, undefined).catch(() => undefined);
  const dep = await createBaseApp({ dbPath: ':memory:', root: '.', staticDir: 'none' });
  registerRelayRehearsalApi(dep.app, { captureAuthorization: () => { throw new Error('boom ' + SECRET); }, store: storeRelayRecord(dep.store), run: async () => GOOD, now: () => NOW });
  await dep.app.listen({ host: '127.0.0.1', port: 0 }); const base = 'http://127.0.0.1:' + (dep.app.server.address() as AddressInfo).port;
  const denied = await fetch(base + RELAY_REHEARSAL_ROUTE, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base }, body: '{"fiction":true}' }); assert.equal(denied.status, 401); clean(await denied.text()); await dep.app.close();
  await using(async () => GOOD, async r => {
    r.store.set('relayRehearsal', { basura: true }); let s = await r.state(); assert.equal(s.issue, 'RECORD_UNREADABLE'); assert.equal(s.last, null);
    const bad = { ...recordFromRehearsal({ now: NOW, result: GOOD }), createCalls: 2 }; r.store.set('relayRehearsal', bad); s = await r.state(); assert.equal(s.issue, 'RECORD_INCONSISTENT'); assert.equal(s.last, null); assert.equal(r.calls(), 0);
  });
});

test('KIT REAL (ejecutor aislado de la unidad 224, desde un código desplegado sin árbol de pruebas): un ensayo completo en proceso nuevo (exportar → inspeccionar → aprobar → importar → abrir → ID equivocado rechazado → un solo create) queda registrado y el pasaporte lo consume; el almacén del espacio activo no se toca', async () => {
  const work = resolve('tests', '.tmp', 'api216-' + randomUUID().slice(0, 8)), app = join(work, 'deployed'); mkdirSync(app, { recursive: true });
  for (const dir of ['server', 'shared']) cpSync(dir, join(app, dir), { recursive: true, filter: source => !/[\/]server[\/]team$/.test(source) });
  mkdirSync(join(app, 'scripts')); for (const file of ['relay-rehearsal-child.ts', 'rehearse-rescue-capsule.ts', 'demo-rescue-room.ts', 'block-external.cjs']) cpSync(join('scripts', file), join(app, 'scripts', file));
  cpSync('package.json', join(app, 'package.json')); symlinkSync(resolve('node_modules'), join(app, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir');
  const executor = createRelayExecutor({ installRoot: join(work, 'install'), appRoot: app });
  try { await using(context => executor.run(context), async r => {
    const before = r.store.records().length, p = await r.post(); assert.equal(p.code, 200, p.text.slice(0, 200)); clean(p.text);
    const last = p.json.last!; assert.equal(last.outcome, 'completed', JSON.stringify(last)); assert.equal(last.destinationOpened, true); assert.equal(last.wrongIdRejected, true); assert.equal(last.reconciledOnce, true); assert.equal(last.createCalls, 1); assert.equal(last.duplicates, 0); assert.equal(last.finalStage, 'return-verified');
    assert.ok(last.capsule!.bytes > 1000); assert.match(last.capsule!.sha16, /^[0-9a-f]{16}$/); assert.equal(inspectRelayRecord(last, Date.now() + 1000), null);
    assert.equal(r.store.records().length, before, 'no exporta ni modifica el espacio activo'); assert.deepEqual(Object.keys(r.store.get<Record<string, unknown>>('relayRehearsal', {})).includes('path'), false);
    assert.equal((await r.state()).last!.outcome, 'completed');
  }, { timeoutMs: 120_000 }); } finally { rmSync(join(app, 'node_modules'), { force: true }); rmSync(work, { recursive: true, force: true }); }
});

// ── R2 · exclusión física (dictamen independiente de 216 y misión 223). Ejecutores sintéticos RETENIDOS por barreras; se cuentan los ejecutores VIVOS (arrancados y sin asentar) y el máximo observado. ──
function fleet(options: { honorAbort?: boolean } = {}) {
  let alive = 0, max = 0, started = 0; const entries: { release(value?: RehearsalResultLike): void; fail(): void; aborted: boolean; settled: boolean }[] = [];
  const run: RelayRehearsalDeps['run'] = context => new Promise<RehearsalResultLike>((resolve, reject) => {
    alive++; started++; max = Math.max(max, alive);
    const entry = { aborted: false, settled: false, release: (value: RehearsalResultLike = GOOD) => { if (entry.settled) return; entry.settled = true; alive--; resolve(value); }, fail: () => { if (entry.settled) return; entry.settled = true; alive--; reject(new Error(SECRET)); } };
    entries.push(entry); context.signal.addEventListener('abort', () => { entry.aborted = true; if (options.honorAbort) entry.release(); }, { once: true });
  });
  return { run, alive: () => alive, max: () => max, started: () => started, entries };
}
const waitFor = async (probe: () => boolean, label: string) => { for (let i = 0; i < 100 && !probe(); i++) await sleep(20); assert.ok(probe(), 'tiempo agotado: ' + label); };

test('R2·1 POST → DELETE → POST con el ejecutor retenido: DELETE descarta y marca «deteniéndose»; el segundo POST recibe 409 STOPPING y NO arranca otro (máximo 1 vivo); al terminar el primero entra exactamente uno y su resultado tardío no se guarda', async () => {
  const f = fleet();
  await using(f.run, async r => {
    const first = r.post(); await waitFor(() => f.alive() === 1, 'primer ejecutor');
    assert.equal(await r.del(), 200); const mid = await r.state(); assert.equal(mid.running, null); assert.equal(mid.stopping?.reason, 'cancelled'); assert.ok(f.entries[0]!.aborted, 'se le pidió detenerse');
    const done = await first; assert.equal(done.code, 409, 'la petición del primero termina sin esperar al proceso'); assert.equal(done.json.issue, 'CANCELLED'); assert.equal(f.alive(), 1, 'pero su ejecutor sigue vivo');
    const second = await r.post(); assert.equal(second.code, 409); assert.equal(second.json.issue, 'STOPPING'); assert.equal(second.json.started, false); assert.equal(second.json.stopping?.reason, 'cancelled'); assert.match(second.json.message ?? '', /todavía se está deteniendo/);
    assert.equal(f.started(), 1); assert.equal(f.max(), 1); assert.equal(r.handle.occupied(), true); assert.equal(r.handle.running(), false);
    f.entries[0]!.release(); await r.handle.drained();
    assert.equal(r.store.get('relayRehearsal', null), null, 'el resultado tardío del descartado no se guardó'); assert.equal((await r.state()).stopping, null);
    const third = r.post(); await waitFor(() => f.started() === 2, 'segundo ejecutor'); assert.equal((await r.post()).code, 202, 'ya hay uno en curso'); f.entries[1]!.release(); assert.equal((await third).code, 200); assert.equal(f.max(), 1, 'nunca hubo dos vivos');
  });
});

test('R2·2 POST → tiempo agotado → POST: la respuesta por vencimiento registra «interrumpido» pero NO libera la plaza; el segundo POST ve STOPPING; el resultado tardío del vencido no sobrescribe; tras terminar se admite uno', async () => {
  const f = fleet();
  await using(f.run, async r => {
    const first = await r.post(); assert.equal(first.code, 200); assert.equal(first.json.last!.outcome, 'interrupted'); assert.equal(first.json.stopping?.reason, 'timeout'); assert.equal(f.alive(), 1);
    const second = await r.post(); assert.equal(second.code, 409); assert.equal(second.json.issue, 'STOPPING'); assert.equal(f.started(), 1); assert.equal(f.max(), 1);
    f.entries[0]!.release(GOOD); await r.handle.drained(); assert.equal((await r.state()).last!.outcome, 'interrupted', 'un resultado tardío tras el vencimiento no se publica');
    const third = r.post(); await waitFor(() => f.started() === 2, 'segundo ejecutor'); f.entries[1]!.release(); assert.equal((await third).json.last!.outcome, 'completed'); assert.equal(f.max(), 1);
  }, { timeoutMs: 200 });
});

test('R2·3 POST → bloquear → iniciar sesión → GET → POST: la sesión nueva ve «deteniéndose» (revocado), no hereda el ensayo y no salta la exclusión; la petición de la sesión revocada recibe 401', async () => {
  const f = fleet();
  await using(f.run, async r => {
    const first = r.post(); await waitFor(() => f.alive() === 1, 'ejecutor'); assert.equal(await r.lock(), 200); assert.equal(await r.login(), 200);
    const seen = await r.state(); assert.equal(seen.running, null); assert.equal(seen.stopping?.reason, 'revoked'); assert.equal(seen.last, null);
    assert.equal((await first).code, 401, 'la sesión revocada no recibe nada'); assert.equal(f.alive(), 1);
    const second = await r.post(); assert.equal(second.code, 409); assert.equal(second.json.issue, 'STOPPING'); assert.equal(f.started(), 1); assert.equal(f.max(), 1);
    f.entries[0]!.release(); await r.handle.drained(); assert.equal((await r.state()).last, null, 'lo ensayado por la sesión revocada no se publicó nunca');
    const third = r.post(); await waitFor(() => f.started() === 2, 'segundo ejecutor'); f.entries[1]!.release(); assert.equal((await third).code, 200);
  }, { password: true });
});

test('R2·4 los resultados anteriores se conservan hasta que otro pueda publicarse; fallar o cancelar un ensayo posterior no los borra', async () => {
  const f = fleet();
  await using(f.run, async r => {
    const a = r.post(); await waitFor(() => f.started() === 1, 'a'); f.entries[0]!.release(); assert.equal((await a).code, 200); const saved = JSON.stringify(r.store.get('relayRehearsal', null)); assert.match(saved, /completed/);
    const b = r.post(); await waitFor(() => f.started() === 2, 'b'); await r.del(); assert.equal((await b).code, 409); f.entries[1]!.release(); await r.handle.drained(); assert.equal(JSON.stringify(r.store.get('relayRehearsal', null)), saved);
    const c = r.post(); await waitFor(() => f.started() === 3, 'c'); f.entries[2]!.fail(); const done = await c; assert.equal(done.json.last!.outcome, 'failed'); clean(done.text);
  });
});

test('R2·5 CIERRE del servidor con ejecución retenida: pide detener y espera; un ejecutor que obedece termina (cero vivos) y uno que no obedece no bloquea el cierre más allá de la espera acotada', async () => {
  const obedient = fleet({ honorAbort: true }), r1 = await rig(obedient.run); const p1 = r1.post(); await waitFor(() => obedient.alive() === 1, 'ejecutor obediente');
  await r1.close(); assert.equal(obedient.alive(), 0, 'cerrar el servidor detuvo el ejecutor'); const closed = await p1; assert.equal(closed.code, 409, 'la petición en curso recibe «descartado» al cerrar'); assert.equal(closed.json.stopping?.reason, 'closing'); assert.equal(closed.json.last, null, 'nada se publicó');
  const stubborn = fleet(), r2 = await rig(stubborn.run, { closeGraceMs: 100 }); const p2 = r2.post(); await waitFor(() => stubborn.alive() === 1, 'ejecutor terco');
  const started = Date.now(); await r2.close(); assert.ok(Date.now() - started < 3000, 'el cierre no se cuelga'); assert.equal(stubborn.alive(), 1, 'sigue vivo y no se finge lo contrario'); stubborn.entries[0]!.release(); assert.equal((await p2).code, 409);
});

test('R2·6 el temporizador del recorrido se limpia al terminar, cancelar o cerrar (cero pendientes)', async () => {
  let pending = 0; const timers = { set: (callback: () => void, ms: number) => { pending++; return setTimeout(() => { pending--; callback(); }, ms); }, clear: (timer: ReturnType<typeof setTimeout>) => { pending--; clearTimeout(timer); } };
  const f = fleet(), { app, store, security } = await createBaseApp({ dbPath: ':memory:', root: '.', staticDir: 'none' });
  const handle = registerRelayRehearsalApi(app, { captureAuthorization: security.captureAuthorization, store: storeRelayRecord(store), run: f.run, now: () => NOW, timers, timeoutMs: 60_000, closeGraceMs: 200 });
  await app.listen({ host: '127.0.0.1', port: 0 }); const base = 'http://127.0.0.1:' + (app.server.address() as AddressInfo).port;
  const post = () => fetch(base + RELAY_REHEARSAL_ROUTE, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base }, body: '{"fiction":true}' });
  const one = post(); await waitFor(() => f.alive() === 1, 'ejecutor'); assert.equal(pending, 1); f.entries[0]!.release(); assert.equal((await one).status, 200); await handle.drained(); assert.equal(pending, 0, 'terminar limpia el temporizador');
  const two = post(); await waitFor(() => f.alive() === 1, 'ejecutor 2'); await fetch(base + RELAY_REHEARSAL_ROUTE, { method: 'DELETE', headers: { Origin: base } }); assert.equal(pending, 0, 'cancelar lo limpia'); await two; f.entries[1]!.release(); await handle.drained();
  await app.close(); assert.equal(pending, 0);
});

// ── R3 (dictamen independiente 258): la sesión que inició el ensayo se revalida junto a la persistencia y tras preparar la respuesta ─────────────────────────────────────────────────────────────────────────────
// Reloj y almacenamiento con barreras sobre Fastify real, SQLite en memoria y una contraseña ficticia. Las dos primeras son las sondas de Codex sin cambiar aserciones; las demás son controles positivos y fronteras vecinas.
const R3_START = Date.UTC(2026, 10, 6, 10), R3_EXPIRY = R3_START + 30 * 60_000 + 1, R3_HEADERS = { host: '127.0.0.1:4516', origin: 'http://127.0.0.1:4516' };
async function r3Rig(options: { onNow?: (state: { saved: boolean; completed: boolean }) => number | null; onLoad?: (state: { saved: boolean; completed: boolean }) => void; run?: RelayRehearsalDeps['run'] } = {}) {
  const real = Date.now; let wall = R3_START; const flags = { saved: false, completed: false, writes: 0 }; Date.now = () => wall;
  const { app, store, security } = await createBaseApp({ root: process.cwd(), dbPath: ':memory:', staticDir: 'no-assets' }), records = storeRelayRecord(store);
  const handle = registerRelayRehearsalApi(app, { captureAuthorization: security.captureAuthorization,
    store: { load() { const value = records.load(); options.onLoad?.(flags); return value; }, save(value) { flags.writes++; records.save(value); flags.saved = true; } },
    now: () => { const next = options.onNow?.(flags); if (next !== null && next !== undefined) wall = next; return wall; }, run: options.run ?? (async () => { flags.completed = true; return GOOD; }) });
  const setup = await app.inject({ method: 'POST', url: '/api/v2/auth/setup', headers: R3_HEADERS, payload: { password: 'fiction-only-relay258' } }); assert.equal(setup.statusCode, 200);
  const cookie = String(setup.headers['set-cookie']).split(';')[0]!, headers = { ...R3_HEADERS, cookie };
  return { app, store, flags, headers, handle, setWall: (value: number) => { wall = value; }, done: async () => { Date.now = real; await app.close(); } };
}
test('R3·1 (sonda 258·1) el reloj cruza el vencimiento al preparar el registro: cero escrituras, 401 y el cuerpo de error sin el resultado del ensayo', async () => {
  const x = await r3Rig({ onNow: state => state.completed ? R3_EXPIRY : null });
  try {
    const response = await x.app.inject({ method: 'POST', url: RELAY_REHEARSAL_ROUTE, headers: x.headers, payload: { fiction: true } });
    assert.equal((await x.app.inject({ url: RELAY_REHEARSAL_ROUTE, headers: x.headers })).statusCode, 401); assert.equal(x.flags.writes, 0); assert.equal(response.statusCode, 401); assert.equal(x.store.get('relayRehearsal', null), null); assert.deepEqual(Object.keys(response.json()), ['error']);
  } finally { await x.done(); }
});
test('R3·2 (sonda 258·2) la sesión vence mientras se lee el estado público final: el registro guardado con permiso se conserva, pero la respuesta es 401 y no lleva el resultado', async () => {
  const x = await r3Rig({ onLoad: flags => { if (flags.saved) x.setWall(R3_EXPIRY); } });
  try {
    const response = await x.app.inject({ method: 'POST', url: RELAY_REHEARSAL_ROUTE, headers: x.headers, payload: { fiction: true } });
    assert.equal(x.flags.saved, true); assert.equal((x.store.get('relayRehearsal', null) as unknown as { outcome: string }).outcome, 'completed'); assert.equal((await x.app.inject({ url: RELAY_REHEARSAL_ROUTE, headers: x.headers })).statusCode, 401);
    assert.equal(response.statusCode, 401); assert.deepEqual(Object.keys(response.json()), ['error']); assert.ok(!response.body.includes('capsule'), 'ni rastro del resultado');
  } finally { await x.done(); }
});
test('R3·3 CONTROL positivo: con la sesión vigente hasta el final se guarda UNA vez y se devuelve 200 con el resultado; el último registro válido se conserva si luego vence', async () => {
  const x = await r3Rig();
  try {
    const response = await x.app.inject({ method: 'POST', url: RELAY_REHEARSAL_ROUTE, headers: x.headers, payload: { fiction: true } });
    assert.equal(response.statusCode, 200); assert.equal(x.flags.writes, 1); assert.equal(response.json().last.outcome, 'completed'); assert.equal(response.json().issue, null);
    x.setWall(R3_EXPIRY); assert.equal((await x.app.inject({ url: RELAY_REHEARSAL_ROUTE, headers: x.headers })).statusCode, 401); assert.equal((x.store.get('relayRehearsal', null) as unknown as { outcome: string }).outcome, 'completed', 'el registro confirmado no se borra');
  } finally { await x.done(); }
});
test('R3·4 SESIÓN VENCIDA CON EL ENSAYO EN CURSO: ni el segundo POST ni el primero devuelven estado ni resultado; revocado antes de persistir no se guarda; los errores conservan no-store y cuerpo acotado', async () => {
  const y = await r3Rig({ run: async () => { await sleep(150); return GOOD; } });
  try {
    const first = y.app.inject({ method: 'POST', url: RELAY_REHEARSAL_ROUTE, headers: y.headers, payload: { fiction: true } }); await sleep(30);
    y.setWall(R3_EXPIRY);                                                                                                    // la sesión vence con el ensayo en curso
    const second = await y.app.inject({ method: 'POST', url: RELAY_REHEARSAL_ROUTE, headers: y.headers, payload: { fiction: true } }); assert.equal(second.statusCode, 401, 'ni siquiera entra: sesión vencida');
    const firstResult = await first; assert.equal(firstResult.statusCode, 401); assert.deepEqual(Object.keys(firstResult.json()), ['error']); assert.equal(String(firstResult.headers['cache-control']), 'no-store'); assert.ok(firstResult.body.length < 200, 'cuerpo acotado');
    assert.equal(y.flags.writes, 0, 'revocado antes de persistir: no se guarda');
  } finally { await y.done(); }
});

// ── R4 (dictamen independiente 267): GET y DELETE capturan la autorización original y la revalidan DESPUÉS de preparar el estado ─────────────────────────────────────────────────────────────────────────────
// Las dos primeras (una por método) son la sonda de Codex `relay216-r3-probe` sin cambiar aserciones; las demás cubren el origen rechazado, el control vigente, la cancelación autorizada cuyo estado ya no se puede entregar y el último registro válido para otra sesión.
for (const method of ['GET', 'DELETE'] as const) test('R4·1 (sonda 267) ' + method + ': la sesión vence durante la lectura final y NO se publica el resultado anterior; 401 con no-store y cuerpo acotado; el último registro válido se conserva', async () => {
  let expireOnRead = false;
  const x = await r3Rig({ onLoad: () => { if (expireOnRead) x.setWall(R3_EXPIRY); } });
  try {
    const saved = await x.app.inject({ method: 'POST', url: RELAY_REHEARSAL_ROUTE, headers: x.headers, payload: { fiction: true } }); assert.equal(saved.statusCode, 200); assert.equal(saved.json().last.outcome, 'completed');
    const live = await x.app.inject({ method, url: RELAY_REHEARSAL_ROUTE, headers: x.headers }); assert.equal(live.statusCode, 200, 'control vigente'); assert.equal(live.json().last.outcome, 'completed');
    expireOnRead = true; const expired = await x.app.inject({ method, url: RELAY_REHEARSAL_ROUTE, headers: x.headers });
    assert.equal((await x.app.inject({ url: RELAY_REHEARSAL_ROUTE, headers: x.headers })).statusCode, 401); assert.equal((x.store.get('relayRehearsal', null) as unknown as { outcome: string }).outcome, 'completed');
    assert.equal(expired.statusCode, 401); assert.equal(expired.headers['cache-control'], 'no-store'); assert.deepEqual(Object.keys(expired.json()), ['error']); assert.ok(expired.body.length < 200);
  } finally { await x.done(); }
});
test('R4·2 DELETE con ORIGEN rechazado y la sesión vencida durante la lectura: 401 (no el 403 con estado); con la sesión vigente el origen rechazado sigue siendo 403 y no cancela nada', async () => {
  let expireOnRead = false; const x = await r3Rig({ onLoad: () => { if (expireOnRead) x.setWall(R3_EXPIRY); } });
  try {
    await x.app.inject({ method: 'POST', url: RELAY_REHEARSAL_ROUTE, headers: x.headers, payload: { fiction: true } });
    const hostile = { host: x.headers.host, cookie: x.headers.cookie }, vigente = await x.app.inject({ method: 'DELETE', url: RELAY_REHEARSAL_ROUTE, headers: hostile }); assert.equal(vigente.statusCode, 403); assert.equal(vigente.json().issue, 'ORIGIN_REQUIRED');
    expireOnRead = true; const expired = await x.app.inject({ method: 'DELETE', url: RELAY_REHEARSAL_ROUTE, headers: hostile }); assert.equal(expired.statusCode, 401); assert.deepEqual(Object.keys(expired.json()), ['error']);
  } finally { await x.done(); }
});
test('R4·3 GET con cuerpo (422) y la sesión vencida durante la lectura: 401 sin estado; y sin sesión vigente al entrar, ni se lee el estado', async () => {
  let expireOnRead = false, loads = 0; const x = await r3Rig({ onLoad: () => { loads++; if (expireOnRead) x.setWall(R3_EXPIRY); } });
  try {
    const bad = await x.app.inject({ method: 'GET', url: RELAY_REHEARSAL_ROUTE, headers: { ...x.headers, 'content-length': '2' }, payload: '{}' }); assert.equal(bad.statusCode, 422, 'control vigente');
    expireOnRead = true; const expired = await x.app.inject({ method: 'GET', url: RELAY_REHEARSAL_ROUTE, headers: { ...x.headers, 'content-length': '2' }, payload: '{}' }); assert.equal(expired.statusCode, 401); assert.deepEqual(Object.keys(expired.json()), ['error']);
    loads = 0; const none = await x.app.inject({ method: 'GET', url: RELAY_REHEARSAL_ROUTE, headers: { host: R3_HEADERS.host, origin: R3_HEADERS.origin } }); assert.equal(none.statusCode, 401); assert.equal(loads, 0, 'sin sesión no se lee el almacenamiento');
  } finally { await x.done(); }
});
test('R4·4 CANCELACIÓN AUTORIZADA cuyo estado ya no se puede entregar: DELETE pide detener (la plaza sigue ocupada, drenando), responde 401 sin estado y el cierre físico del ejecutor se conserva; otra sesión válida ve STOPPING y luego el último registro', async () => {
  let expireOnRead = false, release!: () => void; const hold = new Promise<void>(resolve => { release = resolve; });
  const x = await r3Rig({ onLoad: () => { if (expireOnRead) { expireOnRead = false; x.setWall(R3_EXPIRY); } }, run: async () => { await hold; return GOOD; } });
  try {
    const running = x.app.inject({ method: 'POST', url: RELAY_REHEARSAL_ROUTE, headers: x.headers, payload: { fiction: true } }); await waitFor(() => x.handle.running(), 'ejecutor en curso');
    expireOnRead = true; const cancelled = await x.app.inject({ method: 'DELETE', url: RELAY_REHEARSAL_ROUTE, headers: x.headers });
    assert.equal(cancelled.statusCode, 401); assert.deepEqual(Object.keys(cancelled.json()), ['error']); assert.equal(x.handle.running(), false, 'se pidió detener'); assert.equal(x.handle.occupied(), true, 'la plaza sigue ocupada hasta que el ejecutor termine');
    release(); await x.handle.drained(); assert.equal(x.handle.occupied(), false); await running.catch(() => undefined);
    x.setWall(R3_START); const second = await x.app.inject({ method: 'POST', url: '/api/v2/auth/login', headers: R3_HEADERS, payload: { password: 'fiction-only-relay258' } }); assert.equal(second.statusCode, 200);
    const view = await x.app.inject({ url: RELAY_REHEARSAL_ROUTE, headers: { ...R3_HEADERS, cookie: String(second.headers['set-cookie']).split(';')[0]! } }); assert.equal(view.statusCode, 200); assert.equal(view.json().last, null, 'un resultado de una ejecución cancelada nunca se publicó');
  } finally { release(); await x.done(); }
});
