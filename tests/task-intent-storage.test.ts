import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../server/store.js';
import { storeIntentStorage } from '../server/task-intent-storage.js';
import { KEY_PREFIX, createIntentJournal, type Current, type SendResult } from '../shared/task-intent-journal.js';

// Unidad 208 · el cuaderno sobre un Store REAL de archivo (carpeta temporal propia, clave local nueva de esa carpeta): reinicio entre fronteras, sellado en disco,
// valores corruptos o truncados, escritura con comparación. NO se monta en ninguna ruta ni se prueba exclusión entre procesos (queda para el montaje acordado con Codex).
process.env.NODE_ENV = 'test';
const A: Current = { installId: 'inst-1', contextKey: 'ctx-A' }, B: Current = { installId: 'inst-1', contextKey: 'ctx-B' };
const SECRET = 'Dato sensible: llamar a Ana Ruiz sobre el contrato 4471';
const draft = (current: Current, taskId = 'task-2', notes = SECRET) => ({ current, taskId, patch: { notes } as Record<string, string>, baseline: { id: taskId, entity: 'tasks', values: { notes: 'antes' } } as never, revision: 'tok' });
const unknown = async () => ({ kind: 'unknown' }) as SendResult;
const folder = mkdtempSync(join(tmpdir(), 'planb-intent-208-')), file = join(folder, 'planb.sqlite');
test.after(() => { try { rmSync(folder, { recursive: true, force: true }); } catch { /* carpeta temporal propia */ } });
let n = 0; const mk = (store: Store) => createIntentJournal({ storage: storeIntentStorage(store), now: () => '2026-11-05T10:00:00.000Z', newId: () => 'att-' + ++n });
const rows = (store: Store) => store.db.prepare("SELECT key,value FROM meta WHERE key LIKE 'task-intent:%' ORDER BY key").all() as { key: string; value: string }[];

test('el registro queda SELLADO en disco (sin el texto del cliente en claro) y sobrevive a un reinicio como intento INCIERTO', async () => {
  let store = new Store(file), journal = mk(store);
  const out = await journal.attempt(draft(A), unknown); assert.ok(out.journaled);
  const row = rows(store)[0]; assert.equal(row.key, KEY_PREFIX + 'att-1'); assert.doesNotMatch(row.value, /Ana Ruiz|contrato 4471|Dato sensible/, 'el valor en disco no contiene el texto del cliente');
  store.close();                                                                      // «reinicio»
  store = new Store(file); journal = mk(store);
  const boot = (await journal.boot(A)).entries; assert.deepEqual(boot.map(e => [e.cls, e.action]), [['unknown-outcome', 'check-by-reading']]); assert.equal(boot[0].record!.patch.notes, SECRET, 'el patch vuelve íntegro tras descifrar');
  const writes = rows(store).map(r => r.value); (await journal.boot(A)).entries; assert.deepEqual(rows(store).map(r => r.value), writes, 'arrancar no cambia ningún byte');
  assert.equal((await journal.acceptRead(A, 'att-1')).ok, false, 'sin lectura que muestre el cambio aplicado no se puede aceptar'); assert.ok((await journal.recordEvidence(A, 'att-1', { kind: 'applied', at: '2026-11-05T10:01:00.000Z' })).ok); assert.ok((await journal.acceptRead(A, 'att-1')).ok); assert.equal(((await journal.boot(A)).entries)[0].cls, 'settled');
  store.close();
});

test('un borrador de una captura no aparece en otra aunque el taskId sea el mismo, tampoco tras reiniciar', async () => {
  const store = new Store(file), journal = mk(store);
  await journal.saveDraft(draft(B, 'task-2', 'borrador de la captura B'));
  const inA = (await journal.boot(A)).entries, inB = (await journal.boot(B)).entries;
  assert.equal(inA.find(e => e.record?.patch.notes === 'borrador de la captura B')!.cls, 'other-context'); assert.equal(inB.find(e => e.record?.patch.notes === 'borrador de la captura B')!.cls, 'restorable-draft');
  store.close();
});

test('valores corruptos: un ilegible, un truncado y basura se conservan en cuarentena sin tocarse; los buenos siguen funcionando', async () => {
  const store = new Store(file), journal = mk(store), before = rows(store).length;
  store.set(KEY_PREFIX + 'x-basura', 'esto no es un registro'); store.set(KEY_PREFIX + 'x-truncado', rows(store)[0] ? JSON.stringify(store.get<string>(rows(store)[0].key, '').slice(0, 40)) : 'x');
  store.db.prepare('INSERT INTO meta(key,value) VALUES(?,?)').run(KEY_PREFIX + 'x-ilegible', 'enc1:AAAA-no-es-un-valor-sellado');   // ciphertext inválido: descifrar lanza
  const snapshot = JSON.stringify(rows(store)), boot = (await journal.boot(A)).entries;
  assert.equal(boot.length, before + 3); const q = boot.filter(e => e.cls === 'quarantined'); assert.deepEqual(q.map(e => e.key).sort(), [KEY_PREFIX + 'x-basura', KEY_PREFIX + 'x-ilegible', KEY_PREFIX + 'x-truncado']);
  assert.ok(q.every(e => e.record === null && e.action === 'none')); assert.match(q.find(e => e.key.endsWith('x-ilegible'))!.reason, /ilegibles/);
  assert.equal(JSON.stringify(rows(store)), snapshot, 'nada se modificó'); assert.equal((await journal.prune()).removed, 0);
  assert.ok(boot.some(e => e.cls === 'settled'), 'los registros válidos no se ven afectados por los corruptos');
  store.close();
});

test('comparar-y-escribir sobre el Store real: un segundo escritor con el valor viejo recibe conflicto y nunca sobrescribe lo ilegible', async () => {
  const store = new Store(file), storage = storeIntentStorage(store), key = KEY_PREFIX + 'cas';
  assert.equal(await storage.write(key, 'v1', null), 'ok'); assert.equal(await storage.write(key, 'v2', null), 'conflict', 'ya existe'); assert.equal(await storage.write(key, 'v2', 'v1'), 'ok'); assert.equal(await storage.write(key, 'v3', 'v1'), 'conflict');
  assert.equal(await storage.remove(key, 'v1'), 'conflict'); assert.equal(await storage.remove(key, 'v2'), 'ok');
  store.db.prepare('INSERT INTO meta(key,value) VALUES(?,?)').run(KEY_PREFIX + 'ilegible', 'enc1:AAAA'); assert.equal(await storage.write(KEY_PREFIX + 'ilegible', 'x', null), 'conflict'); assert.equal(await storage.write(KEY_PREFIX + 'ilegible', 'x', 'enc1:AAAA'), 'conflict');
  assert.equal(await storage.write('otra-clave', 'x', null), 'failed', 'solo escribe bajo su prefijo'); assert.equal(await storage.write('task-intent:', 'x', null), 'failed');
  assert.equal(store.get('otra-clave', null), null); store.close();
});

test('un fallo de almacenamiento (base cerrada) impide el envío: el intento no se hace duradero y `send` no corre', async () => {
  const store = new Store(file), journal = mk(store); store.close(); let sent = 0;
  const out = await journal.attempt(draft(A, 'task-9'), async () => { sent++; return { kind: 'ack' } as SendResult; });
  assert.equal(sent, 0); assert.equal(out.journaled, false); if (!out.journaled) assert.match(out.reason, /storage-failed/);
  assert.deepEqual(await journal.boot(A), { status: 'unavailable', entries: [] }, 'si no se puede ni leer, no se afirma nada');
});

test('en memoria (sin archivo) funciona igual pero SIN sellado: es un límite declarado, no una garantía', async () => {
  const store = new Store(':memory:'), journal = mk(store);
  await journal.saveDraft(draft(A, 'task-5', 'texto en memoria')); assert.equal(((await journal.boot(A)).entries)[0].cls, 'restorable-draft');
  assert.match(rows(store)[0].value, /texto en memoria/, 'la base en memoria no sella: solo las bases de archivo lo hacen'); store.close();
});

test('R2 · el tope se aplica en el punto de escritura del Store real: dos altas simultáneas (dos diarios, un Store) ocupan UN solo hueco', async () => {
  const store = new Store(':memory:'), storage = storeIntentStorage(store);
  const one = createIntentJournal({ storage, maxRecords: 1, now: () => '2026-11-05T10:00:00.000Z', newId: () => 'a-1' }), two = createIntentJournal({ storage, maxRecords: 1, now: () => '2026-11-05T10:00:00.000Z', newId: () => 'b-1' });
  const results = await Promise.all([one.saveDraft(draft(A, 'task-1')), two.saveDraft(draft(A, 'task-2'))]);
  assert.equal(rows(store).length, 1); assert.equal(results.filter(r => r.ok).length, 1); const lost = results.find(r => !r.ok)!; assert.equal(lost.ok === false && lost.reason, 'journal-full');
  assert.equal(await storage.write(KEY_PREFIX + 'c-1', 'x', null, { maxEntries: 1 }), 'full'); assert.equal(await storage.write(rows(store)[0].key, 'y', null, { maxEntries: 1 }), 'conflict', 'editar uno existente no es un alta'); store.close();
});

// ── R4 · propiedades del transporte de recuperación, con SQLite de ARCHIVO y barreras deterministas ────────────────────────────────────────
// «Transporte» = lo que lleva una intención desde que la persona pulsa Guardar hasta que, tras cualquier corte, la interfaz sabe qué ocurrió: persistir → despachar → aplicar → acusar → liquidar.
// Un servidor ficticio cuenta aplicaciones; cada «caída» cierra el Store en la frontera indicada y un Store NUEVO sobre el mismo archivo hace de arranque. Las barreras son promesas, sin esperas por tiempo.
//  P1 el intento es duradero y SELLADO antes de despachar (visible desde otra conexión mientras `send` está retenido);
//  P2 un corte en cualquier frontera deja el intento incierto («comprobable leyendo»), nunca «no enviado» ni «confirmado»;
//  P3 el arranque no escribe ni envía (el servidor ficticio no recibe nada y los bytes no cambian);
//  P4 «confirmado por el servidor» solo existe si la liquidación quedó escrita: con el acuse recibido y la liquidación retenida el registro sigue siendo un intento;
//  P5 caso feliz: persistir → despachar → acuse → liquidar con procedencia del servidor, y tras reiniciar sigue liquidado.
const gate = () => { let open!: () => void; const opened = new Promise<void>(resolve => { open = resolve; }); return { open, opened }; };
function transport(name: string) {
  const path = join(folder, name + '.sqlite'), server = { applied: 0, calls: 0 }, seq = { n: 0 };
  const open = () => { const store = new Store(path); return { store, journal: createIntentJournal({ storage: storeIntentStorage(store), now: () => '2026-11-05T10:00:00.000Z', newId: () => name + '-' + ++seq.n }) }; };
  return { path, server, open };
}
test('R4 transporte · caso feliz con barreras: persistido y sellado ANTES de despachar (P1), acuse → liquidado con procedencia del servidor (P5) y estable tras reiniciar (P3)', async () => {
  const t = transport('feliz'), { store, journal } = t.open(), reached = gate(), release = gate(); let seenDuringSend: { phase: string; sealed: boolean } | null = null;
  const pending = journal.attempt({ ...draft(A, 'task-1'), id: 'feliz-1' }, async () => { reached.open(); await release.opened; t.server.calls++; t.server.applied++; return { kind: 'ack' } as SendResult; });
  await reached.opened;                                                                    // barrera 1: `send` está retenido, todavía NO se despachó nada
  const probe = new Store(t.path), row = rows(probe)[0]; probe.close();                    // otra conexión al MISMO archivo ve el registro
  seenDuringSend = { phase: JSON.stringify(row?.key), sealed: !!row && !/Ana Ruiz|contrato 4471/.test(row.value) }; assert.equal(t.server.calls, 0, 'nada despachado todavía'); assert.deepEqual(seenDuringSend, { phase: JSON.stringify(KEY_PREFIX + 'feliz-1'), sealed: true });
  assert.equal(((await journal.boot(A)).entries)[0].cls, 'unknown-outcome', 'visto desde el arranque, lo persistido ya es un intento sin acuse');
  release.open(); const out = await pending; assert.ok(out.journaled && out.settled); assert.equal(t.server.applied, 1);
  const before = rows(store).map(r => r.value); store.close();
  const again = t.open(), boot = (await again.journal.boot(A)).entries; assert.deepEqual(boot.map(e => [e.cls, e.record!.provenance]), [['settled', 'server-ack']]); assert.equal(t.server.calls, 1, 'el arranque no reenvía'); assert.deepEqual(rows(again.store).map(r => r.value), before, 'ni un byte cambia al arrancar'); again.store.close();
});
test('R4 transporte · caídas por frontera: antes de persistir (nada), tras persistir y antes de despachar, tras aplicar y antes del acuse, y tras el acuse con la liquidación retenida (P2, P3, P4)', async () => {
  // 0) antes de persistir: la base no acepta la escritura → no hay intento, no se despacha, y el arranque dice «no sé» si ni siquiera puede leer.
  const t0 = transport('corte0'), a0 = t0.open(); a0.store.close(); let sends = 0;
  const out0 = await a0.journal.attempt({ ...draft(A, 'task-1'), id: 'c0' }, async () => { sends++; return { kind: 'ack' } as SendResult; }); assert.equal(out0.journaled, false); assert.equal(sends, 0);
  const b0 = t0.open(); assert.deepEqual((await b0.journal.boot(A)).entries, [], 'no quedó ningún registro'); b0.store.close();
  // 1) tras persistir, antes de despachar: el proceso muere en la barrera de `send` sin llegar al servidor.
  const t1 = transport('corte1'), a1 = t1.open();
  await assert.rejects(a1.journal.attempt({ ...draft(A, 'task-1'), id: 'c1' }, async () => { a1.store.close(); throw new Error('proceso muerto antes de despachar'); }), /proceso muerto/);   // el «proceso» muere: la excepción es la caída
  assert.equal(t1.server.calls, 0);
  // 2) tras aplicar, antes del acuse: el servidor ya aplicó y el proceso muere sin respuesta.
  const t2 = transport('corte2'), a2 = t2.open();
  await a2.journal.attempt({ ...draft(A, 'task-1'), id: 'c2' }, async () => { t2.server.calls++; t2.server.applied++; a2.store.close(); return { kind: 'unknown' } as SendResult; });
  // 3) tras el acuse, con la liquidación retenida: llegó el acuse pero no se pudo asentar.
  const t3 = transport('corte3'), a3 = t3.open();
  const out3 = await a3.journal.attempt({ ...draft(A, 'task-1'), id: 'c3' }, async () => { t3.server.calls++; t3.server.applied++; a3.store.close(); return { kind: 'ack' } as SendResult; });
  assert.ok(out3.journaled && out3.settled === false, 'P4: sin liquidación escrita no hay «confirmado»');
  for (const [t, id, applied] of [[t1, 'c1', 0], [t2, 'c2', 1], [t3, 'c3', 1]] as const) {
    const fresh = t.open(), before = rows(fresh.store).map(r => r.value), boot = await fresh.journal.boot(A), calls = t.server.calls;
    assert.deepEqual(boot.entries.map(e => [e.key, e.cls, e.action, e.record!.provenance, e.record!.outcome]), [[KEY_PREFIX + id, 'unknown-outcome', 'check-by-reading', null, null]], id + ': incierto y comprobable, nunca «no enviado» ni «confirmado»');
    assert.equal(t.server.calls, calls, id + ': el arranque no envía'); assert.equal(t.server.applied, applied); assert.deepEqual(rows(fresh.store).map(r => r.value), before, id + ': el arranque no escribe');
    // La salida es solo por lectura + decisión humana: una lectura que muestra el cambio aplicado permite aceptar, con procedencia humana (no «server-ack»).
    if (applied) { assert.ok((await fresh.journal.recordEvidence(A, id, { kind: 'applied', at: '2026-11-05T10:05:00.000Z' })).ok); const accepted = await fresh.journal.acceptRead(A, id); assert.ok(accepted.ok); if (accepted.ok) assert.deepEqual([accepted.record.outcome, accepted.record.provenance], ['accepted-read', 'person-accepted-read']); }
    fresh.store.close();
  }
});

// ── R5 · el ÁMBITO se fija al entrar (antes del primer await) y el transporte recibe una COPIA ──────────────────────────────────────────────────
// Las 5 sondas del dictamen (journal-r4 · independent-intent-journal-r4-scope), con un Store REAL de archivo y una barrera determinista en `readAll`: la solicitud nace en la captura A, el llamador
// cambia su objeto compartido a la captura B mientras el almacenamiento lee, y la solicitud NO adquiere acceso a B. Cada prueba exige además los bytes intactos.
const R5A: Current = { installId: 'fixture-r5', contextKey: 'copy-a' }, R5B: Current = { installId: 'fixture-r5', contextKey: 'copy-b' };
const r5 = (scope: Current, id = 'same-draft', text = 'fictional-edit') => ({ current: { ...scope }, id, taskId: 'same-task-in-two-captures', patch: { notes: text } as Record<string, string>, baseline: { notes: null } as never });
function r5rig(name: string) {
  const store = new Store(join(folder, 'r5-' + name + '.sqlite')), storage = storeIntentStorage(store);
  let waiting: { entered: ReturnType<typeof gate>; unblock: ReturnType<typeof gate> } | undefined;
  const journal = createIntentJournal({ now: () => '2026-11-06T10:00:00.000Z', storage: { ...storage, async readAll() {
    const records = await storage.readAll(), next = waiting;
    if (next) { waiting = undefined; next.entered.open(); await next.unblock.opened; }
    return records;
  } } });
  const hold = () => { waiting = { entered: gate(), unblock: gate() }; return { reached: waiting.entered.opened, resume: waiting.unblock.open }; };
  return { store, storage, journal, hold };
}
for (const operation of ['saveDraft', 'attempt'] as const) test('R5 · ' + operation + ' fija el ámbito al entrar: no puede sobrescribir un borrador de OTRA captura aunque el llamador cambie su objeto durante la lectura', async () => {
  const r = r5rig(operation); const held0 = (await r.journal.saveDraft(r5(R5B))); assert.ok(held0.ok); const before = await r.storage.readAll();
  const held = r.hold(), input = r5(R5A); let sends = 0;
  const pending = operation === 'saveDraft' ? r.journal.saveDraft(input) : r.journal.attempt(input, async () => { sends++; return { kind: 'ack' } as SendResult; });
  try { await held.reached; input.current.contextKey = R5B.contextKey; } finally { held.resume(); }
  const result = await pending; assert.deepEqual({ reason: 'reason' in result ? result.reason : null, sends }, { reason: 'wrong-context', sends: 0 }); assert.deepEqual(await r.storage.readAll(), before); r.store.close();
});
test('R5 · boot clasifica para la captura PEDIDA aunque su contexto mutable cambie durante la lectura', async () => {
  const r = r5rig('boot'); assert.ok((await r.journal.saveDraft(r5(R5B))).ok);
  const scope = { ...R5A }, held = r.hold(), pending = r.journal.boot(scope);
  try { await held.reached; scope.contextKey = R5B.contextKey; } finally { held.resume(); }
  const result = await pending; assert.equal(result.status, 'read'); assert.deepEqual([result.entries[0].cls, result.entries[0].action], ['other-context', 'none']); r.store.close();
});
for (const operation of ['abandon', 'acceptRead', 'recordEvidence'] as const) test('R5 · ' + operation + ' no puede liquidar ni anotar una entrada de una captura adoptada DESPUÉS de empezar la lectura', async () => {
  const r = r5rig('t-' + operation); assert.ok((await r.journal.attempt(r5(R5B), async () => ({ kind: 'unknown' }) as SendResult)).journaled); const before = await r.storage.readAll();
  const scope = { ...R5A }, held = r.hold(), pending = operation === 'abandon' ? r.journal.abandon(scope, 'same-draft') : operation === 'acceptRead' ? r.journal.acceptRead(scope, 'same-draft') : r.journal.recordEvidence(scope, 'same-draft', { kind: 'applied', at: '2026-11-06T10:01:00.000Z' });
  try { await held.reached; scope.contextKey = R5B.contextKey; } finally { held.resume(); }
  const result = await pending; assert.equal(result.ok, false); if (!result.ok) assert.equal(result.reason, 'wrong-context'); assert.deepEqual(await r.storage.readAll(), before); r.store.close();
});
test('R5 · el transporte recibe una COPIA: cambiar su id, ámbito o parche no redirige el acuse ni altera lo persistido; el acuse liquida SOLO el intento enviado', async () => {
  const r = r5rig('transport'); assert.ok((await r.journal.attempt(r5(R5A, 'other-intent', 'other-fiction'), async () => ({ kind: 'unknown' }) as SendResult)).journaled);
  const otherBefore = (await r.storage.readAll())[0];
  const result = await r.journal.attempt(r5(R5A, 'sent-intent'), async sent => { assert.equal(sent.id, 'sent-intent'); sent.id = 'other-intent'; sent.contextKey = 'copy-b'; sent.installId = 'otra-instalacion'; sent.patch.notes = 'cambiado por el transporte'; return { kind: 'ack' } as SendResult; });
  assert.ok(result.journaled); if (result.journaled) { assert.equal(result.settled, true); assert.deepEqual([result.record.id, result.record.outcome, result.record.patch.notes, result.record.contextKey], ['sent-intent', 'acknowledged', 'fictional-edit', 'copy-a']); }
  assert.deepEqual((await r.storage.readAll()).find(entry => entry.key === otherBefore.key), otherBefore, 'el otro intento no se tocó');
  const boot = await r.journal.boot(R5A); assert.equal(boot.entries.find(entry => entry.record?.id === 'other-intent')?.cls, 'unknown-outcome'); assert.equal(boot.entries.find(entry => entry.record?.id === 'sent-intent')?.cls, 'settled');
  // Error de transporte con el registro alterado: el intento propio sigue incierto con su identidad original.
  await assert.rejects(r.journal.attempt(r5(R5A, 'third'), async sent => { sent.id = 'other-intent'; throw new Error('transporte roto'); }), /transporte roto/);
  assert.equal((await r.journal.boot(R5A)).entries.find(entry => entry.record?.id === 'third')?.cls, 'unknown-outcome'); r.store.close();
});
