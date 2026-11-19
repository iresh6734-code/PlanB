import test from 'node:test';
import nodeAssert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';

// QA091 · barreras de devolución, concurrencia, continuidad, inspector y arranque. Banco adverso INDEPENDIENTE.
// Oráculos propios: (1) "ledger" = volcado SQL bruto de meta/records/changes/archives/captures/usage; (2) conteo de llamadas
// remotas despachadas por separado de las barreras; (3) barridos de fallo que corrompen la fila de plan en CADA punto de
// espera remota y ANTES de CADA transacción. Todo ficticio, bajo QA091_DIR. La fuente probada es QA091_SRC (congelada o mutante).
process.env.NODE_ENV = 'test';
const SRC = path.resolve(process.env.QA091_SRC ?? process.cwd());
const BASE = path.resolve(process.env.QA091_DIR ?? 'tests/.tmp/qa091-c22e2b0b-4de1-4f92-b660-32338701c513/runs');
const RUN = path.join(BASE, 'barriers-' + randomUUID());
if (!/[\\/]tests[\\/]\.tmp[\\/]qa091-/.test(RUN)) throw new Error('QA091 solo escribe bajo tests/.tmp/qa091-*');
fs.mkdirSync(RUN, { recursive: true });
const PORT0 = Number(process.env.QA091_PORT_BASE ?? 4481);
const load = (rel: string) => import(pathToFileURL(path.join(SRC, rel)).href);
const { Store, AppError } = await load('server/store.ts') as typeof import('../server/store.js');
const { Recovery } = await load('server/recovery.ts') as typeof import('../server/recovery.js');
const { verifyManualRecovery } = await load('server/manual-recovery.ts') as typeof import('../server/manual-recovery.js');
const { Continuity } = await load('server/continuity.ts') as typeof import('../server/continuity.js');
const { createBaseApp } = await load('server/app.ts') as typeof import('../server/app.js');
const { registerGenerator } = await load('server/generator.ts') as typeof import('../server/generator.js');
const { ProviderSettings } = await load('server/provider.ts') as typeof import('../server/provider.js');
const { registerCopyInspection } = await load('server/copy-inspection.ts') as typeof import('../server/copy-inspection.js');
const { rememberExport, confirmRecoveryCopy, recoveryCopyStatus, exportSummary } = await load('server/recovery-copy.ts') as typeof import('../server/recovery-copy.js');
const { makeFixture, makeDemoSpec } = await load('shared/fixtures.ts') as typeof import('../shared/fixtures.js');
const { INVALID_RECOVERY_MESSAGE } = await load('shared/recovery-integrity.ts') as typeof import('../shared/recovery-integrity.js');

let asserted = 0;
const A = {
  eq: (a: unknown, b: unknown, m?: string) => { asserted++; nodeAssert.equal(a, b, m); },
  deep: (a: unknown, b: unknown, m?: string) => { asserted++; nodeAssert.deepEqual(a, b, m); },
  ok: (v: unknown, m?: string) => { asserted++; nodeAssert.ok(v, m); },
  no: (text: string, needle: string, m?: string) => { asserted++; nodeAssert.ok(!text.includes(needle), m ?? ('no debe contener ' + needle)); }
};
const isInvalidError = (e: any) => e instanceof AppError && e.status === 409 && e.message === INVALID_RECOVERY_MESSAGE && (e.details as any)?.code === 'RECOVERY_PLAN_INVALID';
function check(name: string, fn: (t: any) => unknown | Promise<unknown>, opts: { todo?: string } = {}) {
  test(name, opts, async t => { const before = asserted; await fn(t); nodeAssert.ok(asserted > before, 'el caso no ejecutó ninguna aserción'); });
}
async function settle<T>(p: Promise<T> | (() => T | Promise<T>)) {
  try { const v = await (typeof p === 'function' ? Promise.resolve().then(p) : p); return { ok: true as const, v }; } catch (e) { return { ok: false as const, e: e as any }; }
}

// ---- fixtures propios ---------------------------------------------------------------------------------------------
const MARK = 'PRIVATE_QA091_MARKER';
const BAD = '{"id":"qa091-corrupt","status":"bogus","warning":"' + MARK + '"}';
function dir(name: string) {
  const d = path.join(RUN, name + '-' + randomUUID().slice(0, 8)); fs.mkdirSync(d, { recursive: true });
  fs.writeFileSync(path.join(d, '.planb-key'), JSON.stringify({ kind: 'test', data: randomBytes(32).toString('base64') })); return d;
}
const seed = (store: any, production = false) => {
  const snap: any = makeFixture();
  if (production) { snap.version = 3; Object.assign(snap.source, { kind: 'hubspot', accountId: '91091', isTestData: false, environment: 'production', accountType: 'STANDARD' }); }
  store.importSnapshot(snap);
  store.saveGeneration(makeDemoSpec(snap), { provider: 'demo', model: null, generatedAt: new Date().toISOString(), prompt: '', approved: false });
  store.activate(); return store;
};
const edit = (store: any) => {
  const created = store.saveRecord('contacts', { firstname: 'Nuria', lastname: 'Qa091', email: 'nuria.qa091@example.test', company_id: 'company-1' });
  store.saveRecord('companies', { phone: '900 091 091' }, 'company-1');
  store.saveRecord('contacts', { phone: '600 091 091' }, 'contact-1');
  return created;
};
/** Remoto ficticio con efecto despachado ANTES de la espera y respuesta entregada DESPUÉS (promesa retenida). */
function backingRemote(store: any, o: { source?: 'hubspot' | 'simulation'; readOnly?: boolean } = {}) {
  const snap = store.snapshot; const db = new Map<string, any>(snap.records.map((r: any) => [r.entity + ':' + r.id, structuredClone(r)])); // estado remoto = captura original (previo a las ediciones locales)
  const rel = new Set<string>(snap.links.map((l: any) => [l.fromEntity, l.fromId, l.toEntity, l.toId].join('|')));
  const log: string[] = []; let n = 9000, idx = 0;
  const R: any = { source: o.source ?? 'hubspot', accountId: snap.source.accountId, readOnly: o.readOnly, log, db, rel, hook: null as null | ((i: number, m: string) => Promise<void>), failNextCreate: false };
  const pass = async (m: string) => { const i = idx++; log.push(m); if (R.hook) await R.hook(i, m); };
  R.verify = async () => { await pass('verify'); };
  R.read = async (e: string, id: string) => { const r = db.get(e + ':' + id); const out = r ? structuredClone(r) : null; await pass('read'); return out; };
  R.create = async (e: string, values: any) => { const id = String(n++); db.set(e + ':' + id, { entity: e, id, values: structuredClone(values) }); await pass('create'); if (R.failNextCreate) { R.failNextCreate = false; throw new Error('transporte roto tras despachar'); } return id; };
  R.update = async (e: string, id: string, values: any) => { const r = db.get(e + ':' + id); r.values = { ...r.values, ...values }; await pass('update'); };
  R.relate = async (e: string, id: string, t: string, tid: string) => { rel.add([e, id, t, tid].join('|')); await pass('relate'); };
  R.hasRelation = async (e: string, id: string, t: string, tid: string) => { const has = rel.has([e, id, t, tid].join('|')); await pass('hasRelation'); return has; };
  return R;
}
const ledger = (store: any, exclude = ['returnBusy', 'instanceId', 'lastProbe']) => {
  const q = (sql: string) => store.db.prepare(sql).all().map((r: any) => Object.fromEntries(Object.entries(r).map(([k, v]: any) => [k, v instanceof Uint8Array ? 'hex:' + Buffer.from(v).toString('hex') : v])));
  return {
    meta: q('SELECT key,typeof(value) AS t,value FROM meta ORDER BY key').filter((r: any) => !exclude.includes(r.key)),
    records: q('SELECT entity,id,value FROM records ORDER BY entity,id'), changes: q('SELECT * FROM changes ORDER BY id'),
    archives: q('SELECT id,at,bundle FROM archives ORDER BY id'), captures: q('SELECT id,at,bytes,payload FROM captures ORDER BY id'), usage: q('SELECT * FROM usage ORDER BY id')
  };
};
const planRow = (s: any) => s.db.prepare("SELECT typeof(value) AS t,hex(value) AS h FROM meta WHERE key='recoveryPlan'").get() ?? null;
const corrupt = (s: any) => { s.db.prepare("INSERT INTO meta(key,value) VALUES('recoveryPlan',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(s.key ? rawSeal(s, BAD) : BAD); };
let sealer: any = null; const rawSeal = (s: any, text: string) => sealer(text, s.key);
sealer = (await load('server/crypto.ts') as typeof import('../server/crypto.js')).seal;
const effects = (log: string[]) => log.filter(m => ['create', 'update', 'relate'].includes(m)).length;
const deferred = () => { let res!: () => void, rej!: (e: any) => void; const promise = new Promise<void>((a, b) => { res = a; rej = b; }); return { promise, res, rej }; };
const results: any[] = []; // matriz propia que se vuelca a JSON para el informe
process.on('exit', () => { try { fs.writeFileSync(path.join(RUN, 'matrix-results.json'), JSON.stringify(results, null, 1)); } catch { /* evidencia best-effort */ } });

// ======================================================================================================================
// A · Familias de escenario (reutilizadas por el barrido de concurrencia)
// ======================================================================================================================
type Family = 'preview' | 'refresh' | 'apply' | 'resolve' | 'manual';
async function build(family: Family) {
  const production = family === 'manual';
  const store: any = seed(new Store(':memory:'), production); const created = edit(store); const eng = new Recovery(store);
  if (family === 'manual') {
    const remote = backingRemote(store, { readOnly: true });
    for (const r of store.records()) remote.db.set(r.entity + ':' + r.id, structuredClone(r)); // el portal ya refleja el estado final aplicado a mano
    remote.db.set('contacts:5001', { entity: 'contacts', id: '5001', values: structuredClone(created.values) }); remote.rel.add('contacts|5001|companies|company-1');
    const revision = eng.revision();
    return { store, remote, run: () => verifyManualRecovery(store, remote, { revision, mapping: [{ entity: 'contacts', localId: created.id, remoteId: '5001' }] }) };
  }
  const remote = backingRemote(store);
  if (family === 'preview') return { store, remote, run: () => eng.preview(remote) };
  const plan = await eng.preview(remote); remote.log.length = 0; remote.hook = null;
  if (family === 'refresh') return { store, remote, run: () => eng.refresh(plan.id, remote) };
  eng.approve(plan.id);
  if (family === 'apply') return { store, remote, run: () => eng.apply(plan.id, remote) };
  // resolve: primero se provoca un resultado incierto real (el efecto se despacha y el transporte falla)
  remote.failNextCreate = true; await settle(eng.apply(plan.id, remote));
  const stored = store.recoveryState().plan; const op = stored.operations.find((o: any) => o.status === 'uncertain');
  nodeAssert.ok(op, 'el escenario "resolve" debe partir de una operación incierta real'); asserted++;
  const remoteId = [...remote.db.keys()].find(k => k.startsWith('contacts:9')) ?.split(':')[1];
  remote.log.length = 0; remote.hook = null;
  return { store, remote, run: () => eng.resolveUncertain(stored.id, op.id, remoteId!, remote) };
}

// El índice de llamada de run() = posición en la que el gancho lo ve; build() ya consumió llamadas, así que se mide relativo.
async function profile(family: Family) {
  const sc: any = await build(family); const base = sc.remote.log.length; let calls = 0, txns = 0; const methods: string[] = [];
  const orig = sc.store.transaction.bind(sc.store); sc.store.transaction = (fn: any) => { txns++; return orig(fn); };
  const startIdx = base; sc.remote.hook = async (_i: number, m: string) => { calls++; methods.push(m); };
  const r = await settle(sc.run()); sc.remote.hook = null;
  return { r, calls, txns, methods, sc, startIdx };
}

// ---- A0 · controles positivos: cada familia, sin fallo, completa y deja sus marcas -------------------------------------------
for (const family of ['preview', 'refresh', 'apply', 'resolve', 'manual'] as Family[]) {
  check('control positivo · ' + family + ' sin corrupción termina correctamente y deja exactamente sus marcas', async () => {
    const p = await profile(family); A.ok(p.r.ok, family + ' debía terminar: ' + String((p.r as any).e?.message)); A.ok(p.calls >= 3, 'el escenario debe tener al menos 3 llamadas remotas');
    const s = p.sc.store; const v: any = (p.r as any).v;
    if (family === 'preview') { A.eq(s.recoveryIntegrity().state, 'valid'); A.eq(v.operations.length, 3); A.eq(s.get('returnWatermark:hubspot', 0), 0); }
    if (family === 'refresh') { A.eq(s.recoveryState().plan.status, 'review'); }
    if (family === 'apply') { A.eq(v.status, 'complete'); A.eq(s.get('returnWatermark:hubspot', 0), Math.max(...s.changes().map((c: any) => c.id))); A.eq(s.get('returnComplete', false), true); A.eq(effects(p.sc.remote.log), 4, 'efectos despachados: 2 updates + 1 create + 1 relate'); }
    if (family === 'resolve') { A.eq(v.status, 'partial'); A.ok(v.operations.some((o: any) => o.status === 'pending' && o.remoteId)); }
    if (family === 'manual') { A.eq(v.passed, true); A.ok(v.report); A.eq(s.get('returnComplete', false), true); A.eq(s.get('manualRecoveryReport', null).id, v.report.id); A.eq(effects(p.sc.remote.log), 0, 'la comprobación manual nunca escribe'); }
  });
}

// ---- A1 · barrido de espera remota: corromper con la promesa retenida y liberarla con éxito / con error ---------------------
const FAMILIES: Family[] = ['preview', 'refresh', 'apply', 'resolve', 'manual'];
const prof: Record<string, { calls: number; txns: number; methods: string[] }> = {};
// Un perfil que falla NO tumba el módulo (eso sería un fallo de arnés indistinguible de una causa): se registra un caso rojo con su causa y no se generan barridos.
for (const family of FAMILIES) {
  try { const p = await profile(family); if (!p.r.ok) throw (p.r as any).e; prof[family] = { calls: p.calls, txns: p.txns, methods: p.methods }; }
  catch (e) { prof[family] = { calls: 0, txns: 0, methods: [] }; const why = String((e as any)?.message ?? e); check('perfil de escenario · ' + family + ' debe completarse sin corrupción (precondición de sus barridos)', () => { A.ok(false, 'el escenario ' + family + ' falló sin corrupción: ' + why); }); }
}
async function sweepAwait(family: Family, k: number, outcome: 'ok' | 'error') {
  const sc: any = await build(family); const gate = deferred(); let reached = false, callsBefore = 0;
  const baseIdx = sc.remote.log.length; let seen = 0; const hit = deferred();
  sc.remote.hook = async () => { if (seen++ === k) { reached = true; hit.res(); await gate.promise; } };
  const done = settle(sc.run()); await Promise.race([hit.promise, done.then(() => undefined)]);
  A.ok(reached, family + ' k=' + k + ': la espera no se alcanzó (el perfil no coincide)');
  corrupt(sc.store); const S1 = ledger(sc.store); callsBefore = sc.remote.log.length; const row = planRow(sc.store); const eff = effects(sc.remote.log);
  if (outcome === 'ok') gate.res(); else gate.rej(new Error('fallo tardío del remoto'));
  const r: any = await done;
  A.ok(!r.ok, family + ' k=' + k + ' ' + outcome + ': NO puede haber éxito local tras corromper el plan durante la espera');
  if (outcome === 'ok') A.ok(isInvalidError(r.e), family + ' k=' + k + ': el rechazo debe ser el diagnóstico de integridad, no otro error: ' + String(r.e?.message));
  A.deep(ledger(sc.store), S1, family + ' k=' + k + ' ' + outcome + ': ninguna tabla cambia después de la corrupción');
  A.deep(planRow(sc.store), row, 'la fila corrupta se conserva byte a byte');
  A.eq(sc.remote.log.length, callsBefore, family + ' k=' + k + ': ninguna llamada remota posterior a la corrupción');
  results.push({ kind: 'await', family, k, method: prof[family].methods[k], outcome, effectsDispatchedBeforeCorruption: eff, callsAfterCorruption: sc.remote.log.length - callsBefore, ledgerUnchanged: true, rejected: true, baseIdx });
}
for (const family of FAMILIES) for (let k = 0; k < prof[family].calls; k++) for (const outcome of ['ok', 'error'] as const)
  check('concurrencia · ' + family + ' · espera remota #' + k + ' (' + prof[family].methods[k] + ') corrupta y liberada con ' + outcome, () => sweepAwait(family, k, outcome));

// ---- A2 · barrido de transacción: corromper justo antes de CADA transacción -------------------------------------------------
async function sweepTxn(family: Family, k: number) {
  const sc: any = await build(family); let seen = 0, S1: any = null, callsBefore = -1, row: any = null;
  const orig = sc.store.transaction.bind(sc.store);
  sc.store.transaction = (fn: any) => { if (++seen === k) { corrupt(sc.store); S1 = ledger(sc.store); callsBefore = sc.remote.log.length; row = planRow(sc.store); } return orig(fn); };
  const r: any = await settle(sc.run());
  A.ok(S1 !== null, family + ' txn#' + k + ': la transacción no se alcanzó');
  A.ok(!r.ok, family + ' txn#' + k + ': no puede haber éxito local');
  A.ok(isInvalidError(r.e), family + ' txn#' + k + ': debe ser el diagnóstico de integridad: ' + String(r.e?.message));
  A.deep(ledger(sc.store), S1, family + ' txn#' + k + ': la transacción abortada no escribe nada (sin plan, mapeo, marca ni informe)');
  A.deep(planRow(sc.store), row); A.eq(sc.remote.log.length, callsBefore, 'sin llamadas remotas tras la corrupción');
  results.push({ kind: 'txn', family, k, ledgerUnchanged: true, callsAfterCorruption: sc.remote.log.length - callsBefore });
}
for (const family of FAMILIES) for (let k = 1; k <= prof[family].txns; k++) check('concurrencia · ' + family + ' · corrupción justo antes de la transacción #' + k, () => sweepTxn(family, k));

// ======================================================================================================================
// B · Matriz de barreras directas (válido vs inválido) — mismos pasos, estados distintos
// ======================================================================================================================
interface Ctx { store: any; eng: any; remote: any; cont: any; plan: any; clean: any; other: any }
async function ctxFor(kind: 'review' | 'approved'): Promise<Ctx> {
  const d = dir('matrix'); const store: any = seed(new Store(path.join(d, 'planb.sqlite'))); edit(store); const eng = new Recovery(store); const remote = backingRemote(store);
  const plan = await eng.preview(remote); if (kind === 'approved') eng.approve(plan.id); remote.log.length = 0;
  const other: any = seed(new Store(':memory:')); const clean = JSON.parse(JSON.stringify(other.bundle()));
  return { store, eng, remote, cont: new Continuity(store, d), plan: structuredClone(store.recoveryState().plan), clean, other };
}
type Action = { name: string; kind?: 'review' | 'approved'; run: (c: Ctx) => unknown; positive: 'ok' | 'other' };
const ACTIONS: Action[] = [
  { name: 'saveRecord(update)', run: c => c.store.saveRecord('companies', { phone: '911' }, 'company-2'), positive: 'ok' },
  { name: 'saveRecord(create)', run: c => c.store.saveRecord('contacts', { firstname: 'Otra', lastname: 'Qa091', email: 'otra.qa091@example.test' }), positive: 'ok' },
  { name: 'importSnapshot(replace)', run: c => c.store.importSnapshot(makeFixture(), true), positive: 'ok' },
  { name: 'importSnapshot(sin replace)', run: c => c.store.importSnapshot(makeFixture(), false), positive: 'other' },
  { name: 'saveGeneration', run: c => c.store.saveGeneration(makeDemoSpec(c.store.snapshot), { provider: 'demo', model: null, generatedAt: new Date().toISOString(), prompt: '', approved: false }), positive: 'ok' },
  { name: 'activate', run: c => c.store.activate(), positive: 'ok' },
  { name: 'restoreBundle', run: c => c.store.restoreBundle(c.clean), positive: 'ok' },
  { name: 'bundle', run: c => c.store.bundle(), positive: 'ok' },
  { name: 'bundleOrNull', run: c => c.store.bundleOrNull(), positive: 'ok' },
  { name: 'reserveUsage', run: c => c.store.reserveUsage(0.01), positive: 'ok' },
  { name: 'exportSummary', run: c => exportSummary(c.store), positive: 'ok' },
  { name: 'rememberExport', run: c => rememberExport(c.store, c.clean, 'bytes-ficticios-qa091'), positive: 'ok' },
  { name: 'confirmRecoveryCopy', run: c => confirmRecoveryCopy(c.store), positive: 'other' },
  { name: 'Recovery.preview', run: c => c.eng.preview(c.remote), positive: 'ok' },
  { name: 'Recovery.decide', run: c => c.eng.decide(c.plan.id, [{ operationId: c.plan.operations.find((o: any) => o.fields.length).id, field: c.plan.operations.find((o: any) => o.fields.length).fields[0].field, decision: 'local' }]), positive: 'ok' },
  { name: 'Recovery.approve', run: c => c.eng.approve(c.plan.id), positive: 'ok' },
  { name: 'Recovery.refresh', run: c => c.eng.refresh(c.plan.id, c.remote), positive: 'ok' },
  { name: 'Recovery.apply', kind: 'approved', run: c => c.eng.apply(c.plan.id, c.remote), positive: 'ok' },
  { name: 'Recovery.resolveUncertain', run: c => c.eng.resolveUncertain(c.plan.id, c.plan.operations[0].id, '1', c.remote), positive: 'other' },
  { name: 'Continuity.capture', run: c => c.cont.capture(), positive: 'other' },
  { name: 'Continuity.begin', run: c => c.cont.begin('x'), positive: 'other' },
  { name: 'Continuity.end', run: c => c.cont.end(), positive: 'other' },
  { name: 'Continuity.configureSchedule', run: c => c.cont.configureSchedule(true), positive: 'ok' },
  { name: 'Continuity.saveConnection', run: c => c.cont.saveConnection('token-ficticio-qa091-0001', '12345'), positive: 'ok' }
];
for (const a of ACTIONS) {
  check('barrera · ' + a.name + ' · estado válido (control)', async () => {
    const c = await ctxFor(a.kind ?? 'review'); try {
      const r = await settle(() => a.run(c)); A.ok(!(r.ok === false && isInvalidError(r.e)), 'con plan válido no debe aparecer el bloqueo de integridad');
      if (a.positive === 'ok') A.ok(r.ok, 'con plan válido debía funcionar: ' + String((r as any).e?.message)); else A.ok(!r.ok && !isInvalidError(r.e), 'con plan válido falla por OTRA causa: ' + String((r as any).e?.message));
    } finally { c.store.close(); c.other.close(); }
  });
  check('barrera · ' + a.name + ' · estado inválido → 409 RECOVERY_PLAN_INVALID, ningún cambio, ninguna llamada remota', async () => {
    const c = await ctxFor(a.kind ?? 'review'); try {
      corrupt(c.store); const before = ledger(c.store), row = planRow(c.store), calls = c.remote.log.length;
      const r = await settle(() => a.run(c)); A.ok(!r.ok, 'debía rechazar'); A.ok(isInvalidError((r as any).e), 'código/motivo exactos: ' + String((r as any).e?.message));
      A.no(JSON.stringify({ m: (r as any).e.message, d: (r as any).e.details }), MARK); A.no(String((r as any).e.stack ?? '').split('\n')[0], MARK);
      A.deep(ledger(c.store), before, a.name + ' dejó rastro en la base'); A.deep(planRow(c.store), row); A.eq(c.remote.log.length, calls);
    } finally { c.store.close(); c.other.close(); }
  });
}
check('barrera · manual (verifyManualRecovery) con plan inválido al inicio: 409, ninguna lectura, nada marcado', async () => {
  const sc: any = await build('manual'); corrupt(sc.store); const before = ledger(sc.store); const r = await settle(sc.run());
  A.ok(!r.ok && isInvalidError((r as any).e)); A.eq(sc.remote.log.length, 0); A.deep(ledger(sc.store), before);
});

// ---- B1b · barrido de transacción en el almacén: corrupción justo antes de la PRIMERA transacción de cada operación --------------
// La guarda de entrada ya se ejecutó cuando la fila se corrompe aquí: solo la guarda interna de la transacción puede impedir la escritura.
const STORE_TXN: { name: string; empty?: boolean; run: (s: any, other: any) => unknown }[] = [
  { name: 'saveRecord(update)', run: s => s.saveRecord('companies', { phone: '933' }, 'company-2') },
  { name: 'saveRecord(create)', run: s => s.saveRecord('contacts', { firstname: 'Z', lastname: 'Q', email: 'z.q@example.test' }) },
  { name: 'saveGeneration', run: s => s.saveGeneration(makeDemoSpec(s.snapshot), { provider: 'demo', model: null, generatedAt: new Date().toISOString(), prompt: '', approved: false }) },
  { name: 'activate', run: s => s.activate() },
  { name: 'restoreBundle', run: (s, o) => s.restoreBundle(JSON.parse(JSON.stringify(o.bundle()))) },
  { name: 'importSnapshot(sin captura previa)', empty: true, run: s => s.importSnapshot(makeFixture(), false) },
  { name: 'reserveUsage', run: s => s.reserveUsage(0.01) }
];
for (const a of STORE_TXN) {
  const mk = () => { const s: any = new Store(':memory:'); if (!a.empty) { seed(s); edit(s); } return s; };
  check('barrera interna · ' + a.name + ' · sin corrupción termina (control) y con corrupción justo antes de su transacción no escribe nada', () => {
    const other: any = seed(new Store(':memory:'));
    try {
      const ok = mk(); let reached = 0; const o0 = ok.transaction.bind(ok); ok.transaction = (fn: any) => { reached++; return o0(fn); };
      try { a.run(ok, other); A.ok(reached >= 1, 'control: la operación termina sin error y llega a su transacción'); } finally { ok.close(); }
      const s = mk(); let S1: any = null, txns = 0; const orig = s.transaction.bind(s);
      s.transaction = (fn: any) => { if (++txns === 1) { corrupt(s); S1 = ledger(s); } return orig(fn); };
      try {
        let err: any = null; try { a.run(s, other); } catch (e) { err = e; }
        A.ok(S1 !== null, a.name + ': no abrió ninguna transacción (escenario inválido)'); A.ok(isInvalidError(err), a.name + ': debía rechazar con el diagnóstico: ' + String(err?.message));
        A.deep(ledger(s), S1, a.name + ': escribió tras detectar/permitir corrupción dentro de la transacción');
      } finally { s.close(); }
    } finally { other.close(); }
  });
}

// ---- B1c · captura YA en vuelo cuando se corrompe el plan (observación, no garantía) -------------------------------------------------------
// Lo único exigible aquí: la captura no toca plan, registros, historial, mapeo ni marcas. Si persiste la captura y 'captureLastSuccess' se registra
// en 'observed', porque R1 no declara qué hacer con un trabajo ya iniciado; el informe lo trata como observación O1, no como defecto.
check('captura en vuelo · corromper el plan mientras el importador está retenido: el plan/registros/historial/marcas no cambian y se documenta qué sí se persiste', async () => {
  const d = dir('capture-inflight'); const store: any = seed(new Store(path.join(d, 'planb.sqlite'))); edit(store);
  let release!: () => void; const gate = new Promise<void>(r => { release = r; });
  const snap: any = makeFixture(); snap.source.accountId = '12345'; snap.capturedAt = new Date(Date.now() + 60000).toISOString(); snap.id = 'captura-qa091';
  const cont = new Continuity(store, d, false, (async () => { await gate; return snap; }) as any);
  try {
    cont.saveConnection('token-ficticio-qa091-0001', '12345'); const job = cont.capture();
    for (let i = 0; i < 100 && !cont.jobs.list().some((j: any) => j.id === job.id && j.status === 'running'); i++) await new Promise(r => setTimeout(r, 20));
    corrupt(store); const S1 = ledger(store); const countBefore = store.captures().length;
    release(); for (let i = 0; i < 200 && cont.jobs.list().some((j: any) => j.id === job.id && ['queued', 'running'].includes(j.status)); i++) await new Promise(r => setTimeout(r, 20));
    const after = ledger(store); const final = cont.jobs.list().find((j: any) => j.id === job.id);
    const changedMeta = after.meta.filter((m: any) => JSON.stringify(S1.meta.find((b: any) => b.key === m.key)) !== JSON.stringify(m)).map((m: any) => m.key).sort();
    results.push({ kind: 'observed', name: 'capture-in-flight', jobStatus: final?.status, capturesBefore: countBefore, capturesAfter: store.captures().length, metaKeysChanged: changedMeta });
    A.ok(final && ['succeeded', 'failed'].includes(final.status), 'el trabajo terminó: ' + final?.status);
    A.deep(after.records, S1.records, 'registros intactos'); A.deep(after.changes, S1.changes, 'historial intacto'); A.deep(planRow(store), planRow(store));
    for (const key of ['recoveryPlan', 'remoteMapping:hubspot', 'returnWatermark:hubspot', 'returnComplete', 'manualRecoveryReport', 'snapshot', 'spec']) A.deep(after.meta.find((m: any) => m.key === key), S1.meta.find((m: any) => m.key === key), key + ' no cambia');
  } finally { release(); store.close(); }
});

// ---- B2 · tick / pausa / lastAttempt no inventado ----------------------------------------------------------------------------
check('continuidad · plan inválido pausa captura programada sin inventar lastAttempt ni errores; plan válido sí intenta (control)', async () => {
  const mk = async (bad: boolean) => {
    const d = dir('tick'); const s: any = seed(new Store(path.join(d, 'planb.sqlite'))); edit(s);
    s.set('schedule', { enabled: true, intervalMinutes: 60, lastAttempt: '2026-01-01T00:00:00.000Z' }); if (bad) corrupt(s);
    return { s, c: new Continuity(s, d) };
  };
  const good = await mk(false);
  try {
    good.c.tick(); const sched = good.s.get('schedule', null); A.ok(sched.lastAttempt !== '2026-01-01T00:00:00.000Z', 'control: con plan válido el programador sí intenta (sin conexión, falla controlado)'); A.ok(good.s.get('operationError', null));
  } finally { good.s.close(); }
  const bad = await mk(true);
  try {
    const before = ledger(bad.s), st = bad.c.status();
    A.eq(st.operations!.paused, true); A.eq(st.operations!.lastAttempt, '2026-01-01T00:00:00.000Z', 'lastAttempt es el real, no la hora actual'); A.eq(st.recoveryIntegrity!.state, 'invalid');
    bad.c.tick(); bad.c.tick();
    A.deep(ledger(bad.s), before, 'tick() no escribe nada'); A.eq(bad.s.get('captureLastAttempt', null), null); A.eq(bad.s.get('operationError', null), null);
    A.eq(bad.c.status().operations!.lastAttempt, '2026-01-01T00:00:00.000Z');
    const r = await settle(() => bad.c.capture()); A.ok(!r.ok && isInvalidError((r as any).e)); A.eq(bad.s.get('captureLastAttempt', null), null, 'un capture() bloqueado tampoco registra intento');
  } finally { bad.s.close(); }
});
check('custodia · tras corromper, una copia confirmada deja de ser actual, no conserva confirmedAt como actual y no se puede reconfirmar', async () => {
  const c = await ctxFor('review'); try {
    const bundle = c.store.bundle(); rememberExport(c.store, bundle, 'bytes-qa091'); confirmRecoveryCopy(c.store);
    const good = recoveryCopyStatus(c.store)!; A.eq(good.current, true); A.ok(good.confirmedAt);
    corrupt(c.store); const before = ledger(c.store); const bad = recoveryCopyStatus(c.store)!;
    A.eq(bad.current, false); A.eq((bad as any).confirmedAt, undefined); A.eq(bad.previousConfirmedAt, good.confirmedAt);
    A.ok(isInvalidError((await settle(() => confirmRecoveryCopy(c.store)) as any).e)); A.ok(isInvalidError((await settle(() => rememberExport(c.store, bundle, 'x')) as any).e));
    A.deep(ledger(c.store), before);
  } finally { c.store.close(); c.other.close(); }
});

// ======================================================================================================================
// C · HTTP: lecturas siguen vivas y legibles; todo lo que muta o simula validez se rechaza sin rastro
// ======================================================================================================================
async function httpCtx(bad: boolean) {
  const d = dir('http'); const { app, store } = await createBaseApp({ dbPath: path.join(d, 'planb.sqlite'), root: d, staticDir: path.join(d, 'none') }) as any;
  registerGenerator(app, store, new ProviderSettings(path.join(d, '.ai.local.json'))); registerCopyInspection(app, store);
  seed(store); edit(store); const eng = new Recovery(store); const remote = backingRemote(store); const plan = await eng.preview(remote); eng.approve(plan.id);
  const other: any = seed(new Store(':memory:')); const bundleText = JSON.stringify(other.bundle()); other.close();
  const captureId = store.captures()[0].id;
  if (bad) corrupt(store);
  await app.ready();
  const call = (method: string, url: string, payload?: unknown) => app.inject({ method: method as any, url, payload: payload as any, headers: { host: '127.0.0.1:' + PORT0 } });
  return { app, store, d, call, plan: structuredClone(plan), bundleText, captureId };
}
const HTTP: { name: string; method: string; url: string; body: (c: any) => unknown }[] = [
  { name: 'POST records', method: 'POST', url: '/api/records/contacts', body: () => ({ values: { firstname: 'H', lastname: 'T', email: 'h.t@example.test' } }) },
  { name: 'PATCH records', method: 'PATCH', url: '/api/records/companies/company-2', body: () => ({ values: { phone: '922' } }) },
  { name: 'POST activate', method: 'POST', url: '/api/activate', body: () => ({ reviewed: true }) },
  { name: 'POST import/fixture', method: 'POST', url: '/api/import/fixture', body: () => ({ profile: 'agency', replace: true }) },
  { name: 'POST import/snapshot', method: 'POST', url: '/api/import/snapshot', body: () => ({ snapshot: makeFixture(), replace: true }) },
  { name: 'POST generate(demo)', method: 'POST', url: '/api/generate', body: () => ({ mode: 'demo' }) },
  { name: 'POST history/prepare', method: 'POST', url: '/api/v2/history/prepare', body: c => ({ captureId: c.captureId }) },
  { name: 'POST restore', method: 'POST', url: '/api/v2/restore', body: c => ({ file: c.bundleText, replace: true }) },
  { name: 'POST export/encrypted', method: 'POST', url: '/api/v2/export/encrypted', body: () => ({ password: 'qa091-contraseña-ficticia-1' }) },
  { name: 'POST export/package', method: 'POST', url: '/api/v2/export/package', body: () => ({ password: 'qa091-contraseña-ficticia-1' }) },
  { name: 'GET export/bundle', method: 'GET', url: '/api/export/bundle', body: () => undefined },
  { name: 'GET export/package', method: 'GET', url: '/api/export/package', body: () => undefined },
  { name: 'GET v4/export-summary', method: 'GET', url: '/api/v4/export-summary', body: () => undefined },
  { name: 'POST return/preview', method: 'POST', url: '/api/v2/return/preview', body: () => ({ simulation: true }) },
  { name: 'POST return/refresh', method: 'POST', url: '/api/v2/return/refresh', body: c => ({ planId: c.plan.id, simulation: true }) },
  { name: 'POST return/decisions', method: 'POST', url: '/api/v2/return/decisions', body: c => ({ planId: c.plan.id, decisions: [] }) },
  { name: 'POST return/approve', method: 'POST', url: '/api/v2/return/approve', body: c => ({ planId: c.plan.id, reviewedWorkflows: true }) },
  { name: 'POST return/apply', method: 'POST', url: '/api/v2/return/apply', body: c => ({ planId: c.plan.id, simulation: true, approved: true }) },
  { name: 'POST return/verify-uncertain', method: 'POST', url: '/api/v2/return/verify-uncertain', body: c => ({ planId: c.plan.id, operationId: c.plan.operations[0].id, remoteId: '1', simulation: true }) },
  { name: 'POST manual-recovery/verify', method: 'POST', url: '/api/v3/manual-recovery/verify', body: () => ({ revision: 'x', mapping: [], reviewed: true }) },
  { name: 'POST captures', method: 'POST', url: '/api/v2/captures', body: () => undefined },
  { name: 'POST schedule', method: 'POST', url: '/api/v2/schedule', body: () => ({ enabled: true }) },
  { name: 'POST session/begin', method: 'POST', url: '/api/v2/session/begin', body: c => ({ captureId: c.captureId }) },
  { name: 'POST session/end', method: 'POST', url: '/api/v2/session/end', body: () => undefined },
  { name: 'POST recovery-copy/confirm', method: 'POST', url: '/api/v3/recovery-copy/confirm', body: () => ({ storedSeparately: true }) }
];
for (const h of HTTP) {
  check('HTTP · ' + h.name + ' · plan inválido: 409 con código y mensaje fijos, sin eco ni pila, sin rastro (y control con plan válido)', async () => {
    const good = await httpCtx(false); const bad = await httpCtx(true);
    try {
      const g = await good.call(h.method, h.url, h.body(good));
      A.ok(!(g.statusCode === 409 && g.json()?.details?.code === 'RECOVERY_PLAN_INVALID'), 'control: con plan válido no aparece el bloqueo de integridad (' + g.statusCode + ')');
      const ex = h.name === 'POST generate(demo)' ? ['returnBusy', 'instanceId', 'lastProbe', 'candidate'] : undefined; // 'candidate' se trata aparte en HALLAZGO F4
      const before = ledger(bad.store, ex); const row = planRow(bad.store);
      const r = await bad.call(h.method, h.url, h.body(bad)); const body = r.json();
      A.eq(r.statusCode, 409, h.name + ' → ' + r.statusCode + ' ' + r.body.slice(0, 160)); A.eq(body.error, INVALID_RECOVERY_MESSAGE); A.eq(body.details?.code, 'RECOVERY_PLAN_INVALID');
      A.no(r.body, MARK); A.no(r.body, 'stack'); A.no(r.body, '.ts:');
      const after = ledger(bad.store, ex); A.deep(after, before, h.name + ' dejó rastro persistido tras un rechazo'); A.deep(planRow(bad.store), row);
    } finally { await good.app.close(); await bad.app.close(); }
  });
}
check('HTTP · lecturas con plan inválido: historial JSON/CSV legible, estado, continuidad y contexto del inspector responden y no escriben', async () => {
  const c = await httpCtx(true);
  try {
    const before = ledger(c.store);
    const changes = (await c.call('GET', '/api/v2/changes')).json(); A.eq(changes.plan, null); A.eq(changes.recoveryIntegrity.state, 'invalid'); A.eq(changes.changes.length, 3); A.eq(changes.pendingChanges, 3); A.ok(/^[a-f0-9]{64}$/.test(changes.revision));
    A.ok(changes.changes.every((x: any) => x.after && x.after.entity && x.after.values), 'cada cambio conserva su registro posterior');
    const csv = await c.call('GET', '/api/export/changes?format=csv'); A.eq(csv.statusCode, 200); A.ok(csv.body.startsWith('﻿"fecha"')); A.eq(csv.body.split('\r\n').length, 4); A.no(csv.body, MARK);
    const js = await c.call('GET', '/api/export/changes'); A.eq(js.statusCode, 200); A.eq(js.json().changes.length, 3); A.no(js.body, MARK);
    const legacy = await c.call('GET', '/api/changes'); A.eq(legacy.json().changes.length, 3);
    const cont = (await c.call('GET', '/api/v2/continuity')).json(); A.eq(cont.recoveryIntegrity.state, 'invalid'); A.eq(cont.operations.paused, true); A.eq(cont.pendingChanges, 3); A.no(JSON.stringify(cont), MARK);
    const ctx = (await c.call('GET', '/api/v7/copy-review/context')).json(); A.eq(ctx.available, false); A.eq(ctx.reason, 'RECOVERY_STATE_INVALID'); A.eq(ctx.revision, null);
    A.eq((await c.call('GET', '/api/state')).statusCode, 200); A.eq((await c.call('GET', '/api/health')).statusCode, 200);
    A.deep(ledger(c.store), before, 'las lecturas no escriben');
  } finally { await c.app.close(); }
});
check('HALLAZGO F4 · POST /api/generate(demo) con plan inválido no debe persistir un candidato con copia de la captura ni un error (oráculo: ledger completo)', async () => {
  const c = await httpCtx(true);
  try {
    const before = ledger(c.store); const r = await c.call('POST', '/api/generate', { mode: 'demo' }); A.eq(r.statusCode, 409);
    const after = ledger(c.store);
    const keysChanged = after.meta.filter((m: any) => JSON.stringify(before.meta.find((b: any) => b.key === m.key)) !== JSON.stringify(m)).map((m: any) => m.key).concat(before.meta.filter((b: any) => !after.meta.find((m: any) => m.key === b.key)).map((b: any) => b.key));
    fs.writeFileSync(path.join(RUN, 'F4-observed-keys-changed.txt'), JSON.stringify(keysChanged));
    A.deep(keysChanged, [], 'claves meta modificadas por una generación bloqueada: ' + JSON.stringify(keysChanged));
  } finally { await c.app.close(); }
}, { todo: 'F4: server/generator.ts catch → store.failGeneration escribe meta.candidate tras el 409 (store.ts failGeneration no consulta la integridad)' });

// ======================================================================================================================
// D · Inspector de archivos: integridad del archivo verificable por separado, sin cobertura ni custodia inventadas
// ======================================================================================================================
check('inspector · con plan inválido: archivo correcto → valid sin cobertura/custodia; archivo alterado → no valid; contexto antiguo → 409; nada se escribe', async () => {
  const c = await httpCtx(true);
  try {
    const before = ledger(c.store);
    const ok64 = Buffer.from(c.bundleText, 'utf8').toString('base64');
    const good = await c.call('POST', '/api/v7/copy-review/inspect', { encoded: ok64, referenceRevision: null }); A.eq(good.statusCode, 200);
    const gj = good.json(); A.eq(gj.inspection.status, 'valid'); A.eq(gj.coverage, null); A.eq(gj.reference.available, false); A.eq(gj.reference.reason, 'RECOVERY_STATE_INVALID');
    A.ok(/no (demuestran|confirma)[^"]*custodia|custodia/i.test(JSON.stringify(gj.limitations)), 'las limitaciones aclaran que no hay custodia');
    A.eq(gj.artifact.sha256, createHash('sha256').update(c.bundleText, 'utf8').digest('hex'));
    const tampered = JSON.parse(c.bundleText); tampered.records[0].values.name = 'ALTERADO'; // el historial/captura ya no explica el registro
    const bad = await c.call('POST', '/api/v7/copy-review/inspect', { encoded: Buffer.from(JSON.stringify(tampered), 'utf8').toString('base64'), referenceRevision: null }); A.eq(bad.statusCode, 200);
    A.ok(bad.json().inspection.status !== 'valid', 'un archivo alterado no puede salir valid: ' + bad.json().inspection.status); A.eq(bad.json().coverage, null);
    const stale = await c.call('POST', '/api/v7/copy-review/inspect', { encoded: ok64, referenceRevision: 'a'.repeat(64) }); A.eq(stale.statusCode, 409);
    A.deep(ledger(c.store), before);
  } finally { await c.app.close(); }
});
check('inspector · sin espacio activo la razón es NO_ACTIVE_COPY (no se confunde con plan inválido) y con espacio válido hay cobertura', async () => {
  const d = dir('insp'); const { app, store } = await createBaseApp({ dbPath: path.join(d, 'planb.sqlite'), root: d, staticDir: path.join(d, 'none') }) as any; registerCopyInspection(app, store); await app.ready();
  try {
    const empty = (await app.inject({ url: '/api/v7/copy-review/context', headers: { host: '127.0.0.1:' + PORT0 } })).json(); A.eq(empty.available, false); A.eq(empty.reason, 'NO_ACTIVE_COPY');
    seed(store); edit(store);
    const live = (await app.inject({ url: '/api/v7/copy-review/context', headers: { host: '127.0.0.1:' + PORT0 } })).json(); A.eq(live.available, true); A.eq(live.reason, null); A.ok(/^[a-f0-9]{64}$/.test(live.revision));
    const own = JSON.stringify(store.bundle());
    const res = await app.inject({ method: 'POST', url: '/api/v7/copy-review/inspect', headers: { host: '127.0.0.1:' + PORT0 }, payload: { encoded: Buffer.from(own).toString('base64'), referenceRevision: live.revision } as any });
    A.eq(res.statusCode, 200); A.eq(res.json().inspection.status, 'valid'); A.ok(res.json().coverage, 'con referencia válida sí hay cobertura');
  } finally { await app.close(); }
});

// ======================================================================================================================
// E · Arranque real (main/runtime) con procesos propios: semilla ausente, plan inválido, semilla válida
// ======================================================================================================================
let portCursor = PORT0;
async function boot(entry: 'server/main.ts' | 'server/runtime.ts', opts: { plan: 'invalid' | 'none' | 'snapshot'; seedFile: boolean; tamperedEntryDir?: string }) {
  const root = dir('boot-' + path.basename(entry, '.ts')), data = path.join(root, 'data'); fs.mkdirSync(data, { recursive: true });
  fs.copyFileSync(path.join(root, '.planb-key'), path.join(data, '.planb-key'));
  fs.mkdirSync(path.join(root, 'dist'), { recursive: true }); fs.writeFileSync(path.join(root, 'dist', 'index.html'), '<!doctype html><title>qa091</title>');
  const seedStore: any = seed(new Store(':memory:')); const bundleText = JSON.stringify(seedStore.bundle()); seedStore.close();
  if (opts.seedFile) fs.writeFileSync(path.join(root, entry === 'server/main.ts' ? 'demo.seed.json' : 'continuity.seed.json'), bundleText);
  const file = path.join(data, 'planb.sqlite'); const pre: any = new Store(file);
  if (opts.plan === 'invalid') pre.set('recoveryPlan', JSON.parse(BAD)); // JSON válido pero con forma de plan inválida
  if (opts.plan === 'snapshot') { seed(pre); edit(pre); }
  const snapshotBefore = pre.get('snapshot', null) !== null; pre.close();
  const rawBefore = (() => { const s: any = new Store(file); try { return planRow(s); } finally { s.close(); } })();
  const port = portCursor++; if (portCursor > PORT0 + 8) portCursor = PORT0;
  const entryPath = path.join(opts.tamperedEntryDir ?? SRC, entry);
  const env: any = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^PLANB_|TOKEN|SECRET|API_KEY|NODE_OPTIONS/i.test(k)));
  Object.assign(env, { NODE_ENV: 'test', PLANB_PORT: String(port), PLANB_DATA_DIR: data });
  const blocker = path.resolve('scripts/block-external.cjs');
  const child = spawn(process.execPath, ['--require', blocker, '--import', 'tsx', entryPath], { cwd: root, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = ''; child.stdout.on('data', x => out += x); child.stderr.on('data', x => out += x);
  let exited: number | null = null; child.on('exit', code => { exited = code ?? -1; });
  let up = false; const t0 = Date.now();
  while (Date.now() - t0 < 60000 && exited === null) {
    try { const r = await fetch('http://127.0.0.1:' + port + '/api/health'); if (r.ok) { up = true; break; } } catch { /* aún arrancando */ }
    await new Promise(r => setTimeout(r, 250));
  }
  const done = async () => { if (exited === null) { child.kill(); await new Promise(r => setTimeout(r, 300)); } fs.writeFileSync(path.join(root, 'boot.log'), out); };
  const get = async (p: string) => (await fetch('http://127.0.0.1:' + port + p)).json() as Promise<any>;
  return { up, exited, out: () => out, get, done, file, rawBefore, snapshotBefore, root };
}
const rawAfter = (file: string) => { const s: any = new Store(file); try { return { row: planRow(s), snapshot: s.get('snapshot', null), records: s.records().length, changes: s.changes().length, state: s.recoveryIntegrity().state }; } finally { s.close(); } };
for (const entry of ['server/main.ts', 'server/runtime.ts'] as const) {
  const seedName = entry === 'server/main.ts' ? 'demo.seed.json' : 'continuity.seed.json';
  check('arranque ' + entry + ' · sin snapshot + plan inválido + semilla válida: la API arranca, la semilla NO sustituye evidencia y la fila se conserva', async () => {
    const b = await boot(entry, { plan: 'invalid', seedFile: true });
    try {
      A.ok(b.up, 'el servidor debía arrancar. salida: ' + b.out().slice(-400)); A.eq(b.exited, null, 'sigue vivo');
      const ch = await b.get('/api/v2/changes'); A.eq(ch.recoveryIntegrity.state, 'invalid'); A.eq(ch.changes.length, 0); A.eq(ch.plan, null);
      const st = await b.get('/api/state'); A.eq(st.snapshot, null, 'la semilla no se presenta como datos restaurados');
    } finally { await b.done(); }
    const after = rawAfter(b.file); A.deep(after.row, b.rawBefore, 'la fila de plan se conserva'); A.eq(after.snapshot, null); A.eq(after.records, 0); A.eq(after.state, 'invalid');
  });
  check('arranque ' + entry + ' · sin snapshot + sin plan + semilla válida (control positivo): la semilla se restaura', async () => {
    const b = await boot(entry, { plan: 'none', seedFile: true });
    try {
      A.ok(b.up, 'el servidor debía arrancar. salida: ' + b.out().slice(-400));
      const st = await b.get('/api/state'); A.ok(st.snapshot, 'la semilla legítima debe restaurarse'); A.ok(st.snapshot.name);
    } finally { await b.done(); }
    const after = rawAfter(b.file); A.ok(after.snapshot); A.eq(after.records, 62); A.eq(after.state, 'none');
  });
  check('arranque ' + entry + ' · con snapshot existente la semilla se ignora y los datos propios sobreviven', async () => {
    const b = await boot(entry, { plan: 'snapshot', seedFile: true });
    try { A.ok(b.up, b.out().slice(-300)); const ch = await b.get('/api/v2/changes'); A.eq(ch.changes.length, 3); } finally { await b.done(); }
    const after = rawAfter(b.file); A.eq(after.changes, 3); A.ok(after.snapshot);
  });
}
