import test from 'node:test';
import nodeAssert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

// QA091 · integridad persistida del plan de devolución (R1). Banco adverso INDEPENDIENTE: oráculos propios de bytes
// (meta/records/changes/archives/captures/usage por SQL directo), sin reutilizar helpers ni aserciones de los autores.
// Fuente bajo prueba = QA091_SRC (copia congelada o mutante efímero); por defecto este checkout. Todo es ficticio y vive en
// QA091_DIR (por defecto tests/.tmp/qa091-<uuid>/runs). La clave local de cada fixture es una clave de PRUEBA generada aquí
// (kind:'test'), de modo que no se invoca la protección de Windows ni se toca ninguna instalación.
process.env.NODE_ENV = 'test';
const SRC = path.resolve(process.env.QA091_SRC ?? process.cwd());
const BASE = path.resolve(process.env.QA091_DIR ?? 'tests/.tmp/qa091-c22e2b0b-4de1-4f92-b660-32338701c513/runs');
const RUN = path.join(BASE, 'persisted-' + randomUUID());
if (!/[\\/]tests[\\/]\.tmp[\\/]qa091-/.test(RUN)) throw new Error('QA091 solo escribe bajo tests/.tmp/qa091-*');
fs.mkdirSync(RUN, { recursive: true });
const load = (rel: string) => import(pathToFileURL(path.join(SRC, rel)).href);
const { Store, AppError } = await load('server/store.ts') as typeof import('../server/store.js');
const { Recovery } = await load('server/recovery.ts') as typeof import('../server/recovery.js');
const { createBaseApp } = await load('server/app.ts') as typeof import('../server/app.js');
const { makeFixture, makeDemoSpec } = await load('shared/fixtures.ts') as typeof import('../shared/fixtures.js');
const { INVALID_RECOVERY_MESSAGE } = await load('shared/recovery-integrity.ts') as typeof import('../shared/recovery-integrity.js');
const { seal } = await load('server/crypto.ts') as typeof import('../server/crypto.js');

// ---- aserciones contadas: un caso sin una sola aserción NO puede quedar verde -------------------------------------
let asserted = 0;
const A = {
  eq: (a: unknown, b: unknown, m?: string) => { asserted++; nodeAssert.equal(a, b, m); },
  deep: (a: unknown, b: unknown, m?: string) => { asserted++; nodeAssert.deepEqual(a, b, m); },
  ok: (v: unknown, m?: string) => { asserted++; nodeAssert.ok(v, m); },
  notIncludes: (text: string, needle: string, m?: string) => { asserted++; nodeAssert.ok(!text.includes(needle), m ?? ('no debe contener ' + needle)); },
  invalid409: (fn: () => unknown, m?: string) => { asserted++; nodeAssert.throws(fn, (e: any) => e instanceof AppError && e.status === 409 && e.message === INVALID_RECOVERY_MESSAGE && (e.details as any)?.code === 'RECOVERY_PLAN_INVALID', m); }
};
function check(name: string, fn: (t: any) => unknown | Promise<unknown>, opts: { todo?: string } = {}) {
  test(name, opts, async t => { const before = asserted; await fn(t); nodeAssert.ok(asserted > before, 'el caso no ejecutó ninguna aserción'); });
}

// ---- fixtures propios --------------------------------------------------------------------------------------------
const MARK = 'PRIVATE_QA091_MARKER';
const sha = (v: string | Buffer) => createHash('sha256').update(v).digest('hex');
function dir(name: string) {
  const d = path.join(RUN, name + '-' + randomUUID().slice(0, 8)); fs.mkdirSync(d, { recursive: true });
  fs.writeFileSync(path.join(d, '.planb-key'), JSON.stringify({ kind: 'test', data: randomBytes(32).toString('base64') }));
  return d;
}
const seed = (store: any, production = false) => {
  const snap: any = makeFixture();
  if (production) { snap.version = 3; Object.assign(snap.source, { kind: 'hubspot', accountId: '91091', isTestData: false, environment: 'production', accountType: 'STANDARD' }); }
  store.importSnapshot(snap);
  store.saveGeneration(makeDemoSpec(snap), { provider: 'demo', model: null, generatedAt: new Date().toISOString(), prompt: '', approved: false });
  store.activate();
  return store;
};
const edit = (store: any) => {
  const created = store.saveRecord('contacts', { firstname: 'Nuria', lastname: 'Qa091', email: 'nuria.qa091@example.test', company_id: 'company-1' });
  store.saveRecord('companies', { phone: '900 091 091' }, 'company-1');
  store.saveRecord('contacts', { phone: '600 091 091' }, 'contact-1');
  return created;
};
function backingRemote(store: any, source: 'hubspot' | 'simulation' = 'hubspot') {
  const snap = store.snapshot; const db = new Map<string, any>(snap.records.map((r: any) => [r.entity + ':' + r.id, structuredClone(r)]));
  const rel = new Set<string>(snap.links.map((l: any) => [l.fromEntity, l.fromId, l.toEntity, l.toId].join('|')));
  const log: string[] = []; let n = 9000;
  return {
    source, accountId: snap.source.accountId, log, db, rel,
    async verify() { log.push('verify'); },
    async read(e: string, id: string) { log.push('read:' + e + ':' + id); const r = db.get(e + ':' + id); return r ? structuredClone(r) : null; },
    async create(e: string, values: any) { log.push('create:' + e); const id = String(n++); db.set(e + ':' + id, { entity: e, id, values: structuredClone(values) }); return id; },
    async update(e: string, id: string, values: any) { log.push('update:' + e + ':' + id); const r = db.get(e + ':' + id); r.values = { ...r.values, ...values }; },
    async relate(e: string, id: string, t: string, tid: string) { log.push('relate'); rel.add([e, id, t, tid].join('|')); },
    async hasRelation(e: string, id: string, t: string, tid: string) { log.push('hasRelation'); return rel.has([e, id, t, tid].join('|')); }
  } as any;
}
const ledger = (store: any, exclude = ['returnBusy', 'instanceId', 'lastProbe']) => {
  const q = (sql: string) => store.db.prepare(sql).all().map((r: any) => Object.fromEntries(Object.entries(r).map(([k, v]: any) => [k, v instanceof Uint8Array ? 'hex:' + Buffer.from(v).toString('hex') : v])));
  return {
    meta: q('SELECT key,typeof(value) AS t,value FROM meta ORDER BY key').filter((r: any) => !exclude.includes(r.key)),
    records: q('SELECT entity,id,value FROM records ORDER BY entity,id'), changes: q('SELECT * FROM changes ORDER BY id'),
    archives: q('SELECT id,at,bundle FROM archives ORDER BY id'), captures: q('SELECT id,at,bytes,payload FROM captures ORDER BY id'), usage: q('SELECT * FROM usage ORDER BY id')
  };
};
const planRow = (store: any) => store.db.prepare("SELECT typeof(value) AS t,hex(value) AS h FROM meta WHERE key='recoveryPlan'").get() ?? null;
const sealFor = (store: any, text: string) => store.key ? seal(text, store.key) : text;
const putPlan = (store: any, text: string) => store.db.prepare("INSERT INTO meta(key,value) VALUES('recoveryPlan',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(sealFor(store, text));
const putRaw = (store: any, value: any) => store.db.prepare("INSERT INTO meta(key,value) VALUES('recoveryPlan',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(value);
async function realPlan(production = false) {
  const s = seed(new Store(':memory:'), production); edit(s);
  const plan = await new Recovery(s).preview(backingRemote(s));
  const out = structuredClone(plan); s.close(); return out;
}
const TEMPLATE = await realPlan();
const state = (s: any) => ({ i: s.recoveryIntegrity(), r: s.recoveryState() });

// ---- 1 · corpus: cada mutación parte de un plan VÁLIDO y cambia UNA sola propiedad ------------------------------
test('control del corpus: la plantilla real es válida y tiene operaciones, campos y referencias', () => {
  const s = new Store(':memory:'); try {
    putPlan(s, JSON.stringify(TEMPLATE)); A.eq(s.recoveryIntegrity().state, 'valid');
    A.ok(TEMPLATE.operations.length >= 3 && TEMPLATE.operations.some((o: any) => o.references.length) && TEMPLATE.operations.every((o: any) => o.fields.length || o.references.length));
  } finally { s.close(); }
});
const mutate = (fn: (p: any) => void) => { const p = structuredClone(TEMPLATE); fn(p); return JSON.stringify(p); };
const corpus: [string, string][] = [
  ['texto no JSON', '{not json ' + MARK],
  ['cadena vacía', ''],
  ['JSON truncado', JSON.stringify(TEMPLATE).slice(0, 120)],
  ['array vacío', '[]'], ['número', '0'], ['cadena JSON', '"' + MARK + '"'], ['booleano', 'true'], ['objeto vacío', '{}'],
  ['Infinity por 1e999', '1e999'],
  ['parcial: sin operaciones', JSON.stringify({ id: 'x', status: 'review', source: 'hubspot', warning: MARK })],
  ['operations es objeto', mutate(p => { p.operations = {}; })],
  ['operations es null', mutate(p => { p.operations = null; })],
  ['estado de plan desconocido', mutate(p => { p.status = 'bogus'; })],
  ['origen desconocido', mutate(p => { p.source = 'other'; })],
  ['entidad de operación desconocida', mutate(p => { p.operations[0].entity = 'invoices'; })],
  ['estado de operación desconocido', mutate(p => { p.operations[0].status = 'bogus'; })],
  ['clave extra en el plan (strict)', mutate(p => { p.extra = MARK; })],
  ['clave extra en la operación (strict)', mutate(p => { p.operations[0].extra = 1; })],
  ['decisión desconocida', mutate(p => { const f = p.operations.flatMap((o: any) => o.fields)[0]; f.decision = 'maybe'; })],
  ['createdAt no es fecha ISO', mutate(p => { p.createdAt = 'ayer'; })],
  ['approvedAt numérico', mutate(p => { p.approvedAt = 5; })],
  ['valor base objeto', mutate(p => { p.operations.flatMap((o: any) => o.fields)[0].base = { x: 1 }; })],
  ['valor local array', mutate(p => { p.operations.flatMap((o: any) => o.fields)[0].local = [1]; })],
  ['remoteId numérico en lugar de cadena', mutate(p => { p.operations[0].remoteId = 7; })],
  ['campo obligatorio ausente (remoteVersion)', mutate(p => { delete p.operations[0].remoteVersion; })],
  ['referencia con entidad desconocida', mutate(p => { const o = p.operations.find((x: any) => x.references.length); o.references[0].entity = 'x'; })],
  ['conflict no booleano', mutate(p => { p.operations.flatMap((o: any) => o.fields)[0].conflict = 'si'; })]
];
for (const [name, raw] of corpus) {
  check('persistido inválido · ' + name + ' → invalid, plan nulo, mensaje fijo sin eco, bytes conservados, barreras 409', () => {
    const s = new Store(':memory:'); try {
      seed(s); edit(s); putPlan(s, raw);
      const before = ledger(s), row = planRow(s);
      const st = state(s);
      A.deep(st.i, { state: 'invalid', code: 'RECOVERY_PLAN_INVALID', message: INVALID_RECOVERY_MESSAGE });
      A.eq(st.r.plan, null);
      A.notIncludes(JSON.stringify(st), MARK, 'el diagnóstico no debe repetir contenido guardado');
      A.invalid409(() => s.assertRecoveryIntegrity()); A.invalid409(() => s.validatedRecoveryPlan());
      A.invalid409(() => s.saveRecord('companies', { phone: '1' }, 'company-2'));
      new Recovery(s); new Recovery(s);
      A.deep(planRow(s), row, 'el constructor de Recovery no puede reescribir la fila');
      A.deep(ledger(s), before, 'ninguna tabla cambia por leer, construir o intentar editar');
    } finally { s.close(); }
  });
}
for (const [name, raw] of [['ausente', null], ['JSON null', 'null'], ['null con espacios', ' \n null\t']] as const) {
  check('persistido none · ' + name + ' → none sin inventar un plan; se puede editar', () => {
    const s = new Store(':memory:'); try {
      seed(s); if (raw !== null) putPlan(s, raw); else s.db.prepare("DELETE FROM meta WHERE key='recoveryPlan'").run(); // el sembrado deja una fila 'null': aquí se borra de verdad
      A.deep(s.recoveryIntegrity(), { state: 'none', code: null, message: null }); A.eq(s.recoveryState().plan, null); A.eq(s.validatedRecoveryPlan(), null);
      const row = planRow(s); new Recovery(s); A.deep(planRow(s), row, 'construir Recovery no crea, borra ni reescribe la fila (ausente=' + (row === null) + ')');
      A.ok(s.saveRecord('companies', { phone: '900 000 999' }, 'company-1').values.phone === '900 000 999');
    } finally { s.close(); }
  });
}
for (const [name, mut] of [
  ['plantilla tal cual', (p: any) => p], ['operaciones vacías', (p: any) => { p.operations = []; }], ['origen simulation', (p: any) => { p.source = 'simulation'; }],
  ['estado complete', (p: any) => { p.status = 'complete'; }], ['decisión null', (p: any) => { p.operations.flatMap((o: any) => o.fields)[0].decision = null; }],
  ['approvedAt cadena', (p: any) => { p.approvedAt = new Date().toISOString(); }], ['JSON con sangría (otros bytes)', (p: any) => p]
] as const) {
  check('persistido valid · ' + name + ' → valid y plan clonado', () => {
    const s = new Store(':memory:'); try {
      const p = structuredClone(TEMPLATE); mut(p); putPlan(s, name.startsWith('JSON con') ? JSON.stringify(p, null, 3) : JSON.stringify(p));
      A.deep(s.recoveryIntegrity(), { state: 'valid', code: null, message: null }); A.deep(s.recoveryState().plan, p); A.eq(s.validatedRecoveryPlan()!.id, p.id);
    } finally { s.close(); }
  });
}
for (const [name, value] of [['BLOB con {}', Buffer.from('{}')], ['BLOB con bytes del plan válido (cerrado en fallo)', Buffer.from(JSON.stringify(TEMPLATE))], ['INTEGER', 5], ['REAL', 1.5]] as const) {
  check('persistido con tipo SQL no textual · ' + name + ' → invalid y conservado', () => {
    const s = new Store(':memory:'); try {
      seed(s); putRaw(s, value); const before = ledger(s), row = planRow(s);
      A.eq(s.recoveryIntegrity().state, 'invalid'); A.eq(s.recoveryState().plan, null); A.invalid409(() => s.bundleOrNull());
      A.deep(planRow(s), row); A.deep(ledger(s), before);
    } finally { s.close(); }
  });
}

// ---- 2 · almacén cifrado: sellado, texto en claro, ciphertext alterado, reabrir y arranque repetido -------------------
check('almacén cifrado · plan sellado inválido conserva exactamente el texto cifrado tras reabrir 3 veces y arrancar la app', async () => {
  const d = dir('enc-invalid'), file = path.join(d, 'planb.sqlite');
  let s: any = seed(new Store(file)); edit(s); putPlan(s, '{"id":"x","status":"review","warning":"' + MARK + '"}');
  const row = planRow(s), before = ledger(s); A.ok(String(Buffer.from(row.h, 'hex')).startsWith('enc1:'), 'el fixture debe estar realmente sellado');
  s.close();
  for (let i = 0; i < 3; i++) { s = new Store(file); A.eq(s.recoveryIntegrity().state, 'invalid'); new Recovery(s); A.deep(planRow(s), row, 'reabrir #' + i); s.close(); }
  const { app, store } = await createBaseApp({ dbPath: file, root: d, staticDir: path.join(d, 'none') });
  try {
    const r = await app.inject({ url: '/api/v2/changes', headers: { host: '127.0.0.1:4489' } });
    A.eq(r.statusCode, 200); A.eq(r.json().plan, null); A.eq(r.json().recoveryIntegrity.state, 'invalid'); A.eq(r.json().changes.length, 3); A.notIncludes(r.body, MARK);
    A.deep(planRow(store), row, 'arrancar createBaseApp no puede tocar la fila');
    const after = ledger(store); A.deep(after, before);
  } finally { await app.close(); }
});
check('almacén cifrado · ciphertext con un bit alterado → invalid (no vacío), el resto de la app sigue leyendo', async () => {
  const d = dir('enc-flip'), file = path.join(d, 'planb.sqlite');
  let s: any = seed(new Store(file)); edit(s); await (async () => { const p = await realPlan(); putPlan(s, JSON.stringify(p)); })();
  A.eq(s.recoveryIntegrity().state, 'valid');
  const cur = s.db.prepare("SELECT value FROM meta WHERE key='recoveryPlan'").get().value as string;
  const buf = Buffer.from(cur.slice(5), 'base64'); buf[buf.length - 2] ^= 1; const flipped = 'enc1:' + buf.toString('base64');
  s.db.prepare("UPDATE meta SET value=? WHERE key='recoveryPlan'").run(flipped); s.close();
  s = new Store(file); try {
    A.eq(s.recoveryIntegrity().state, 'invalid'); A.eq(s.recoveryState().plan, null); A.eq(s.changes().length, 3); A.eq(s.db.prepare("SELECT value FROM meta WHERE key='recoveryPlan'").get().value, flipped);
  } finally { s.close(); }
});
check('almacén cifrado · fila de plan en texto claro (no sellada) y válida: se acepta y, al reabrir, se sella sin cambiar el contenido', async () => {
  const d = dir('enc-plain-valid'), file = path.join(d, 'planb.sqlite');
  let s: any = seed(new Store(file)); edit(s); const p = await realPlan();
  s.db.prepare("INSERT INTO meta(key,value) VALUES('recoveryPlan',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(JSON.stringify(p));
  A.eq(s.recoveryIntegrity().state, 'valid'); s.close();
  s = new Store(file); try { A.eq(s.recoveryIntegrity().state, 'valid'); A.deep(s.recoveryState().plan, p); A.ok(String(Buffer.from(planRow(s).h, 'hex')).startsWith('enc1:')); } finally { s.close(); }
});
const garbage = () => {
  const d = dir('enc-plain-garbage'), file = path.join(d, 'planb.sqlite');
  const s: any = seed(new Store(file)); edit(s);
  s.db.prepare("INSERT INTO meta(key,value) VALUES('recoveryPlan',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run('{garbage ' + MARK); s.close();
  return { d, file };
};
check('almacén cifrado · una fila de plan en texto claro y no JSON hace fallar la apertura SIN modificar el archivo (rollback íntegro)', () => {
  const { d, file } = garbage(); const digestBefore = sha(fs.readFileSync(file));
  let thrown: any = null; let opened: any = null; try { opened = new Store(file); } catch (e) { thrown = e; } finally { opened?.close(); }
  fs.writeFileSync(path.join(RUN, 'F1-observed-state.txt'), opened ? 'opened=true' : 'opened=false thrown=' + String(thrown?.constructor?.name) + ': ' + String(thrown?.message).slice(0, 120));
  if (!opened) A.ok(thrown instanceof Error);
  A.eq(sha(fs.readFileSync(file)), digestBefore, 'el archivo no cambia aunque la apertura falle'); A.ok(d.length > 0);
});
check('HALLAZGO F1 · una fila de plan en texto claro y no JSON debería abrirse como "invalid" (diagnóstico fijo), no como SyntaxError en bruto', () => {
  const { file } = garbage(); let opened: any = null, thrown: any = null;
  try { opened = new Store(file); } catch (e) { thrown = e; }
  try { A.ok(opened, 'Store no debería lanzar al abrir: ' + String(thrown?.constructor?.name) + ' ' + String(thrown?.message).slice(0, 80)); A.eq(opened.recoveryIntegrity().state, 'invalid'); } finally { opened?.close(); }
}, { todo: 'F1: server/store.ts migrateEncryption() hace JSON.parse de cualquier fila no sellada y lanza SyntaxError en el constructor' });

// ---- 3 · caché por bytes: A→B→A, otra conexión, mismos bytes, tocar sin cambiar -------------------------------------
check('caché · A→B→A→B′→none→A sigue los bytes reales (memoria)', () => {
  const s = new Store(':memory:'); try {
    const A_ = '{"id":"a","status":"review"}', B = JSON.stringify(TEMPLATE), B2 = JSON.stringify(TEMPLATE, null, 2);
    const seq: [string, string][] = [[A_, 'invalid'], [B, 'valid'], [A_, 'invalid'], [B2, 'valid'], ['null', 'none'], [A_, 'invalid'], [B, 'valid'], [B, 'valid']];
    for (const [raw, expected] of seq) { putPlan(s, raw); A.eq(s.recoveryIntegrity().state, expected, raw.slice(0, 20)); A.eq(s.recoveryState().plan === null, expected !== 'valid'); }
    s.db.prepare("DELETE FROM meta WHERE key='recoveryPlan'").run(); A.eq(s.recoveryIntegrity().state, 'none');
  } finally { s.close(); }
});
check('caché · el cambio hecho por OTRA conexión al mismo archivo se observa de inmediato (cifrado)', () => {
  const d = dir('enc-two-conn'), file = path.join(d, 'planb.sqlite'); const s: any = seed(new Store(file));
  const other = new DatabaseSync(file); try {
    const put = (text: string) => other.prepare("INSERT INTO meta(key,value) VALUES('recoveryPlan',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(seal(text, s.key));
    for (const [text, expected] of [['{"bad":1}', 'invalid'], [JSON.stringify(TEMPLATE), 'valid'], ['{"bad":1}', 'invalid'], ['null', 'none'], [JSON.stringify(TEMPLATE), 'valid']] as const) {
      A.eq(s.recoveryIntegrity().state, s.recoveryIntegrity().state); put(text); A.eq(s.recoveryIntegrity().state, expected);
    }
  } finally { other.close(); s.close(); }
});
check('caché · los mismos bytes no se revalidan con otro resultado: lecturas repetidas son idénticas y no alteran la fila', () => {
  const s = new Store(':memory:'); try {
    putPlan(s, '{"id":"a"}'); const row = planRow(s);
    const first = JSON.stringify(state(s)); for (let i = 0; i < 20; i++) A.eq(JSON.stringify(state(s)), first);
    A.deep(planRow(s), row);
  } finally { s.close(); }
});

// ---- 4 · clones devueltos ----------------------------------------------------------------------------------------------
check('clones · mutar lo devuelto (plan, integridad, validatedRecoveryPlan, Recovery.plan) no cambia lecturas posteriores ni la fila', () => {
  const s = new Store(':memory:'); try {
    putPlan(s, JSON.stringify(TEMPLATE)); const row = planRow(s);
    const r1 = s.recoveryState(); const p1: any = r1.plan; p1.status = 'complete'; p1.operations.push({ evil: true }); p1.operations[0].fields[0].local = 'EVIL'; r1.integrity.state = 'none';
    const v1: any = s.validatedRecoveryPlan(); v1.operations.length = 0; v1.id = 'EVIL';
    const i1 = s.recoveryIntegrity(); i1.state = 'none'; (i1 as any).code = 'EVIL';
    const via: any = new Recovery(s).plan(); via.operations.splice(0, 1); via.warning = 'EVIL';
    A.deep(s.recoveryState().plan, TEMPLATE); A.deep(s.validatedRecoveryPlan(), TEMPLATE); A.deep(s.recoveryIntegrity(), { state: 'valid', code: null, message: null });
    A.ok(s.recoveryState().plan !== s.recoveryState().plan, 'dos lecturas no comparten referencia'); A.deep(planRow(s), row);
  } finally { s.close(); }
});

// ---- 5 · arranque con estado en vuelo legítimo: normalización permitida, idempotente y acotada -----------------------
check('arranque · sending/applying válidos pasan a uncertain/partial una sola vez; approved sin envío no se reescribe; lo demás intacto', async () => {
  const mk = async (patch: (p: any) => void) => { const s = seed(new Store(':memory:')); edit(s); const p = await realPlan(); patch(p); putPlan(s, JSON.stringify(p)); return { s, p }; };
  const inflight = await mk(p => { p.status = 'applying'; p.approvedAt = new Date().toISOString(); p.operations[0].status = 'sending'; });
  try {
    const before = ledger(inflight.s); new Recovery(inflight.s);
    const plan = inflight.s.recoveryState().plan; A.eq(plan.status, 'partial'); A.eq(plan.approvedAt, null); A.eq(plan.operations[0].status, 'uncertain'); A.ok(plan.operations[0].error);
    const once = ledger(inflight.s); new Recovery(inflight.s); A.deep(ledger(inflight.s), once, 'idempotente');
    const { meta: m1, ...rest1 } = before, { meta: m2, ...rest2 } = once; A.deep(rest2, rest1, 'records/changes/archives/captures/usage intactos');
    A.deep(m2.filter((r: any) => r.key !== 'recoveryPlan'), m1.filter((r: any) => r.key !== 'recoveryPlan'));
  } finally { inflight.s.close(); }
  const approved = await mk(p => { p.status = 'approved'; p.approvedAt = new Date().toISOString(); });
  try { const row = planRow(approved.s); new Recovery(approved.s); A.deep(planRow(approved.s), row); A.eq(approved.s.recoveryState().plan.status, 'approved'); } finally { approved.s.close(); }
});

// ---- 6 · copia portátil: el plan válido NO se omite y viaja; el inválido no se convierte en copia aparentemente válida ---
check('portátil · plan hubspot válido viaja en returnState.plan, sobrevive a restaurar y no se omite', async () => {
  const s = seed(new Store(':memory:')); edit(s); const p = structuredClone(await new Recovery(s).preview(backingRemote(s))); // el plan nace en ESTE almacén: sus localId existen
  try {
    A.eq(s.recoveryIntegrity().state, 'valid'); const bundle = s.bundle(); A.deep(bundle.returnState.plan, p);
    const t = new Store(':memory:'); try {
      t.restoreBundle(JSON.parse(JSON.stringify(bundle))); A.eq(t.recoveryIntegrity().state, 'valid'); A.deep(t.recoveryState().plan, p);
      A.deep(t.changes().map((c: any) => c.id), s.changes().map((c: any) => c.id));
    } finally { t.close(); }
  } finally { s.close(); }
});
check('portátil · bundle con plan alterado se rechaza con 422 sin tocar el destino; origen inválido no exporta', async () => {
  const s = seed(new Store(':memory:')); edit(s); await new Recovery(s).preview(backingRemote(s));
  try {
    const bundle = JSON.parse(JSON.stringify(s.bundle())); bundle.returnState.plan.status = 'bogus';
    const t = seed(new Store(':memory:')); try {
      const before = ledger(t);
      nodeAssert.throws(() => t.restoreBundle(bundle), (e: any) => e instanceof AppError && e.status === 422); asserted++;
      A.deep(ledger(t), before);
    } finally { t.close(); }
    putPlan(s, '{"bad":true}'); A.invalid409(() => s.bundle()); A.invalid409(() => s.bundleOrNull());
  } finally { s.close(); }
});

// ---- 7 · lo que 'valid' NO promete (caracterización, no garantía inventada) ----------------------------------------------
check('HALLAZGO F2 · un plan "valid" con localId inexistente debería rechazarse con un AppError controlado en approve(), no con TypeError (500)', async () => {
  const s = seed(new Store(':memory:')); edit(s); const p = await realPlan();
  p.operations[0].localId = 'no-existe-qa091'; p.revision = new Recovery(s).revision(); putPlan(s, JSON.stringify(p));
  try {
    A.eq(s.recoveryIntegrity().state, 'valid', 'precondición: la estructura es válida'); const row = planRow(s), eng = new Recovery(s); let err: any = null;
    try { eng.approve(p.id); } catch (e) { err = e; }
    A.deep(planRow(s), row, 'la fila no cambia');
    fs.writeFileSync(path.join(RUN, 'F2-observed-state.txt'), String(err?.constructor?.name) + ': ' + String(err?.message).slice(0, 100));
    A.ok(err instanceof AppError, 'debería ser un AppError controlado y fue ' + String(err?.constructor?.name) + ': ' + String(err?.message).slice(0, 80));
  } finally { s.close(); }
}, { todo: 'F2: server/recovery.ts approve() usa store.record(...)! sin comprobar nulo; validatedRecoveryPlan solo valida estructura' });
check('HALLAZGO F3 · un Remote que devuelve un ID no cadena en create() NO debe dejar el plan guardado inválido por la propia escritura de Recovery', async () => {
  const s = seed(new Store(':memory:')); edit(s); const eng = new Recovery(s), remote = backingRemote(s);
  try {
    const plan = await eng.preview(remote); eng.approve(plan.id);
    const create = remote.create.bind(remote); remote.create = async (e: string, v: any) => Number(await create(e, v)); // contrato violado: Promise<number>
    let err: any = null; try { await eng.apply(plan.id, remote); } catch (e) { err = e; }
    const st = s.recoveryIntegrity().state;
    fs.writeFileSync(path.join(RUN, 'F3-observed-state.txt'), 'integrity=' + st + ' err=' + String(err && (err.status + ' ' + err.message)).slice(0, 200));
    A.ok(s.changes().length >= 3, 'el historial local sigue ahí');
    A.eq(st, 'valid', 'el plan lo escribió Recovery: no puede quedar inválido por una respuesta remota malformada (estado=' + st + ')');
  } finally { s.close(); }
}, { todo: 'F3: server/recovery.ts apply() persiste op.remoteId sin validar tipo ni validar el plan antes de guardar (save no usa RecoveryPlanSchema)' });
