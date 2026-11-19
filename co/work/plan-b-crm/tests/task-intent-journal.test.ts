import test from 'node:test';
import assert from 'node:assert/strict';
import {
  KEY_PREFIX, classify, createIntentJournal, decodeRecord, encodeRecord, summarizeForPassport, type Current, type IntentRecord, type IntentStorage, type SendResult, type StorageWrite, type StoredEntry,
} from '../shared/task-intent-journal.js';

// Unidad 208 · protocolo y modelo del cuaderno con almacenamiento en memoria e inyección de fallos. Sin red, sin Store.
class Memory implements IntentStorage {
  data = new Map<string, string>(); writes = 0; removes = 0; failWrites = false; failReads = false; unreadable = new Set<string>(); log: string[] = [];
  async readAll(): Promise<StoredEntry[]> {
    if (this.failReads) throw new Error('lectura rota');
    return [...this.data.entries()].map(([key, raw]) => this.unreadable.has(key) ? { key, raw: null, unreadable: true } : { key, raw }).sort((a, b) => a.key < b.key ? -1 : 1);
  }
  async write(key: string, raw: string, expected: string | null, options?: { maxEntries?: number }): Promise<StorageWrite> {
    if (this.failWrites) return 'failed'; if ((this.data.get(key) ?? null) !== expected) return 'conflict';
    if (expected === null && options?.maxEntries !== undefined && this.data.size >= options.maxEntries) return 'full';
    this.data.set(key, raw); this.writes++; this.log.push('write:' + key); return 'ok';
  }
  async remove(key: string, expected: string): Promise<StorageWrite> { if (this.data.get(key) !== expected) return 'conflict'; this.data.delete(key); this.removes++; return 'ok'; }
}
const A: Current = { installId: 'inst-1', contextKey: 'ctx-A' }, B: Current = { installId: 'inst-1', contextKey: 'ctx-B' }, OTHER_INSTALL: Current = { installId: 'inst-2', contextKey: 'ctx-A' };
let clock = Date.parse('2026-11-05T10:00:00Z'), counter = 0;
const rig = (over: Partial<Parameters<typeof createIntentJournal>[0]> = {}) => { const storage = new Memory(); counter = 0; return { storage, journal: createIntentJournal({ storage, now: () => new Date(clock).toISOString(), newId: () => 'id-' + ++counter, ...over }) }; };
const draft = (current: Current = A, taskId = 'task-2', patch: Record<string, string | number | boolean | null> = { notes: 'Texto del cliente: llamar a Ana' }) => ({ current, taskId, patch, baseline: { id: taskId, entity: 'tasks', values: { notes: 'antes', status: 'pending' } } as never, revision: 'tok-1' });
const phaseOf = (storage: Memory, id: string) => (decodeRecord(storage.data.get(KEY_PREFIX + id)!) as { ok: true; record: IntentRecord }).record;
const ack: SendResult = { kind: 'ack' };

test('el intento es DURADERO antes de enviar: cuando `send` corre, el registro ya está guardado como «attempt»', async () => {
  const { journal, storage } = rig(); let seen: IntentRecord | null = null, writesAtSend = -1;
  const out = await journal.attempt(draft(), async record => { writesAtSend = storage.writes; seen = phaseOf(storage, record.id); return ack; });
  assert.equal(out.journaled, true); assert.equal(writesAtSend, 1, 'una escritura durable antes del envío'); assert.equal(seen!.phase, 'attempt'); assert.deepEqual(seen!.patch, { notes: 'Texto del cliente: llamar a Ana' });
  assert.deepEqual(seen!.baseline, { notes: 'antes' }, 'solo el valor base de lo cambiado'); assert.equal(seen!.revision, 'tok-1');
  if (out.journaled) { assert.equal(out.settled, true); assert.equal(out.record.phase, 'settled'); assert.equal(out.record.outcome, 'acknowledged'); assert.equal(out.record.provenance, 'server-ack'); }
});

test('si la escritura del intento FALLA no se envía nada y el motivo es claro; nada queda a medias', async () => {
  const { journal, storage } = rig(); storage.failWrites = true; let sent = 0;
  const out = await journal.attempt(draft(), async () => { sent++; return ack; });
  assert.equal(sent, 0, '`send` no se llama'); assert.equal(out.journaled, false); if (!out.journaled) { assert.equal(out.reason, 'storage-failed'); assert.match(out.message, /No se envió nada: tu borrador sigue en pantalla/); }
  assert.equal(storage.data.size, 0);
  storage.failWrites = false; storage.failReads = true; assert.equal((await journal.attempt(draft(), async () => { sent++; return ack; })).journaled, false); assert.equal(sent, 0, 'sin poder leer el cuaderno tampoco se envía');
});

test('corte entre el intento y el acuse: tras reiniciar queda INCIERTO, el arranque no escribe ni envía y la acción es solo comprobar leyendo', async () => {
  const { journal, storage } = rig(); let sent = 0;
  await journal.attempt(draft(), async () => { sent++; return { kind: 'unknown' } as SendResult; });   // el proceso «muere» sin acuse
  assert.equal(sent, 1); const before = new Map(storage.data), writes = storage.writes;
  const restarted = createIntentJournal({ storage, now: () => new Date(clock).toISOString() });   // proceso nuevo: sin memoria
  const first = (await restarted.boot(A)).entries, second = (await restarted.boot(A)).entries;
  assert.deepEqual(first.map(e => [e.cls, e.action]), [['unknown-outcome', 'check-by-reading']]); assert.deepEqual(second, first, 'arrancar dos veces da lo mismo');
  assert.equal(storage.writes, writes, 'el arranque no escribe'); assert.deepEqual([...storage.data], [...before]); assert.equal(sent, 1, 'ni reenvía');
  assert.deepEqual(Object.keys(restarted).sort(), ['abandon', 'acceptRead', 'attempt', 'boot', 'prune', 'recordEvidence', 'saveDraft'], 'la API no tiene ninguna función que ejecute una cola');
});

test('un envío que lanza una excepción deja el intento incierto (nunca «no enviado» por suposición)', async () => {
  const { journal, storage } = rig();
  await assert.rejects(journal.attempt(draft(), async () => { throw new Error('red caída'); }), /red caída/);
  assert.equal(phaseOf(storage, 'id-1').phase, 'attempt'); assert.equal(((await journal.boot(A)).entries)[0].cls, 'unknown-outcome');
});

test('la lectura posterior solo anota evidencia; aceptar el estado leído es decisión humana con su procedencia; descartar cierra sin envío', async () => {
  const { journal, storage } = rig(); await journal.attempt(draft(), async () => ({ kind: 'unknown' }) as SendResult);
  const evidence = await journal.recordEvidence(A, 'id-1', { kind: 'applied', at: '2026-11-05T10:01:00Z' }); assert.ok(evidence.ok); assert.equal(phaseOf(storage, 'id-1').phase, 'attempt'); assert.equal(phaseOf(storage, 'id-1').provenance, null);
  const accepted = await journal.acceptRead(A, 'id-1'); assert.ok(accepted.ok);
  const settled = phaseOf(storage, 'id-1'); assert.equal(settled.outcome, 'accepted-read'); assert.equal(settled.provenance, 'person-accepted-read'); assert.match(((await journal.boot(A)).entries)[0].reason, /el servidor no confirmó el envío/);
  const two = await journal.attempt(draft(A, 'task-3'), async () => ({ kind: 'unknown' }) as SendResult); assert.ok(two.journaled);
  await journal.recordEvidence(A, 'id-2', { kind: 'unchanged', at: '2026-11-05T10:02:00Z' }); await journal.abandon(A, 'id-2'); assert.equal(phaseOf(storage, 'id-2').outcome, 'abandoned'); assert.equal(phaseOf(storage, 'id-2').provenance, null);
});

test('el borrador: dice si pudo conservarse; pasa a intento conservando su identidad; y se actualiza sin duplicarse', async () => {
  const { journal, storage } = rig();
  const kept = await journal.saveDraft(draft()); assert.ok(kept.ok); const id = (kept as { record: IntentRecord }).record.id;
  const again = await journal.saveDraft({ ...draft(A, 'task-2', { notes: 'segunda versión' }), id }); assert.ok(again.ok); assert.equal(storage.data.size, 1); assert.equal(phaseOf(storage, id).patch.notes, 'segunda versión'); assert.equal(phaseOf(storage, id).seq, 2);
  storage.failWrites = true; const lost = await journal.saveDraft(draft(A, 'task-9')); assert.equal(lost.ok, false); if (!lost.ok) assert.equal(lost.reason, 'storage-failed'); storage.failWrites = false;
  const out = await journal.attempt({ ...draft(A, 'task-2', { notes: 'definitiva' }), id }, async () => ack); assert.ok(out.journaled); if (out.journaled) { assert.equal(out.record.id, id); assert.equal(out.record.createdAt, phaseOf(storage, id).createdAt); }
  assert.equal(storage.data.size, 1, 'el borrador se convierte en el intento, no se duplica');
});

test('contexto: el borrador de una captura NO se ofrece en otra, y una instalación distinta tampoco; se conservan sin aplicarse', async () => {
  const { journal, storage } = rig(); await journal.saveDraft(draft(A, 'task-2')); await journal.saveDraft(draft(B, 'task-2', { notes: 'de la otra captura' }));
  const inA = (await journal.boot(A)).entries; assert.deepEqual(inA.map(e => [e.record!.contextKey, e.cls]), [['ctx-A', 'restorable-draft'], ['ctx-B', 'other-context']]);
  assert.deepEqual(((await journal.boot(OTHER_INSTALL)).entries).map(e => e.cls), ['other-context', 'other-context']);
  assert.equal(storage.data.size, 2, 'no se borra nada por ser de otra copia');
  assert.equal((await journal.recordEvidence(B, 'id-1', { kind: 'applied', at: 'x' })).ok, false, 'no se puede operar un registro desde otra copia'); assert.equal((await journal.acceptRead(OTHER_INSTALL, 'id-1')).ok, false);
});

test('registros corruptos, truncados, de otra versión, ilegibles o demasiado grandes: se conservan sin tocar y nunca se aplican', async () => {
  const { journal, storage } = rig(); await journal.attempt(draft(), async () => ({ kind: 'unknown' }) as SendResult);
  const good = storage.data.get(KEY_PREFIX + 'id-1')!, record = JSON.parse(good);
  storage.data.set(KEY_PREFIX + 'z-truncado', good.slice(0, good.length - 25));
  storage.data.set(KEY_PREFIX + 'z-checksum', good.replace('Texto del cliente', 'Texto manipulado'));
  storage.data.set(KEY_PREFIX + 'z-version', JSON.stringify({ ...record, v: 2 }));
  storage.data.set(KEY_PREFIX + 'z-forma', JSON.stringify({ v: 1, id: 'x' }));
  storage.data.set(KEY_PREFIX + 'z-basura', 'no es json'); storage.data.set(KEY_PREFIX + 'z-ilegible', 'xx'); storage.unreadable.add(KEY_PREFIX + 'z-ilegible');
  storage.data.set(KEY_PREFIX + 'z-grande', JSON.stringify({ ...record, patch: { notes: 'x'.repeat(300_000) } }));
  const snapshot = JSON.stringify([...storage.data]), boot = (await journal.boot(A)).entries;
  assert.equal(boot.length, 8); assert.deepEqual(boot.filter(e => e.cls === 'quarantined').map(e => e.key).sort(), ['z-basura', 'z-checksum', 'z-forma', 'z-grande', 'z-ilegible', 'z-truncado', 'z-version'].map(k => KEY_PREFIX + k));
  assert.equal(boot.filter(e => e.cls === 'unknown-outcome').length, 1, 'el bueno sigue siendo utilizable'); assert.ok(boot.filter(e => e.cls === 'quarantined').every(e => e.record === null && /Se conserva sin modificar/.test(e.reason) && e.action === 'none'));
  assert.equal(JSON.stringify([...storage.data]), snapshot, 'el arranque no tocó nada'); assert.equal((await journal.prune()).removed, 0, 'ni la retención');
  for (const reason of ['bad-checksum', 'unsupported-version', 'bad-shape', 'not-json', 'too-large'] as const) assert.ok(['z-checksum', 'z-version', 'z-forma', 'z-basura', 'z-grande'].some(k => { const d = decodeRecord(storage.data.get(KEY_PREFIX + k)!); return !d.ok && d.reason === reason; }), reason);
});

test('retención: solo se quitan TERMINADOS con TTL cumplido; borradores e intentos sin resolver sobreviven a cualquier edad', async () => {
  const { journal, storage } = rig({ ttlMs: 1000 });
  await journal.saveDraft(draft(A, 'd')); await journal.attempt(draft(A, 'u'), async () => ({ kind: 'unknown' }) as SendResult); await journal.attempt(draft(A, 's1'), async () => ack); const old = (await journal.attempt(draft(A, 's2'), async () => ({ kind: 'rejected' }) as SendResult));
  assert.ok(old.journaled); clock += 5_000; await journal.attempt(draft(A, 's3'), async () => ack);
  const removed = await journal.prune(); assert.equal(removed.removed, 2, 's1 (acuse) y s2 (rechazado) vencen; s3 es reciente');
  assert.deepEqual([...storage.data.keys()].map(k => decodeRecord(storage.data.get(k)!)).filter(d => d.ok).map(d => (d as { record: IntentRecord }).record.taskId).sort(), ['d', 's3', 'u']);
  clock += 10 * 365 * 86_400_000; await journal.prune(); assert.ok([...storage.data.values()].some(raw => raw.includes('"phase":"draft"')) && [...storage.data.values()].some(raw => raw.includes('"phase":"attempt"')), 'lo no resuelto nunca se purga');
});

test('tope: al llenarse de lo no resuelto se RECHAZA el alta con un motivo claro (sin desplazar lo antiguo); si hay terminados vencidos se liberan solos', async () => {
  const { journal, storage } = rig({ maxRecords: 3, ttlMs: 1000 });
  for (const task of ['a', 'b', 'c']) assert.ok((await journal.saveDraft(draft(A, task))).ok);
  const refused = await journal.saveDraft(draft(A, 'd')); assert.equal(refused.ok, false); if (!refused.ok) { assert.equal(refused.reason, 'journal-full'); assert.match(refused.message, /resuélvelos antes/); }
  const attempt = await journal.attempt(draft(A, 'e'), async () => ack); assert.equal(attempt.journaled, false); assert.equal(storage.data.size, 3);
  await journal.abandon(A, 'id-1'); clock += 5_000; assert.ok((await journal.saveDraft(draft(A, 'd'))).ok, 'el cerrado vencido se retiró para hacer sitio'); assert.equal(storage.data.size, 3);
});

test('dos escritores sobre el mismo registro: el segundo recibe «conflict» y no pisa (comparar-y-escribir)', async () => {
  const storage = new Memory(), one = createIntentJournal({ storage, now: () => '2026-11-05T10:00:00.000Z', newId: () => 'id-1' }), two = createIntentJournal({ storage, now: () => '2026-11-05T10:00:05.000Z', newId: () => 'id-9' });
  await one.attempt(draft(), async () => ({ kind: 'unknown' }) as SendResult);
  const realWrite = storage.write.bind(storage); let first = true; storage.write = async (key, raw, expected) => { if (first) { first = false; await two.recordEvidence(A, 'id-1', { kind: 'applied', at: '2026-11-05T10:01:00.000Z' }); } return realWrite(key, raw, expected); };   // otro proceso gana la carrera
  const lost = await one.recordEvidence(A, 'id-1', { kind: 'unchanged', at: '2026-11-05T10:02:00.000Z' }); assert.equal(lost.ok, false); if (!lost.ok) assert.equal(lost.reason, 'conflict');
  assert.equal(phaseOf(storage, 'id-1').evidence!.kind, 'applied', 'prevalece lo que ya estaba escrito');
});

test('el intento no se puede aplicar dos veces ni fuera de fase', async () => {
  const { journal } = rig(); await journal.attempt(draft(), async () => ack);
  for (const act of [() => journal.acceptRead(A, 'id-1'), () => journal.recordEvidence(A, 'id-1', { kind: 'applied', at: '2026-11-05T10:01:00.000Z' }), () => journal.abandon(A, 'id-1')]) { const r = await act(); assert.equal(r.ok, false); if (!r.ok) assert.equal(r.reason, 'wrong-phase'); }
  assert.equal((await journal.abandon(A, 'inexistente')).ok, false);
});

test('contenido demasiado grande: se rechaza con motivo y nada se envía', async () => {
  const { journal, storage } = rig(); let sent = 0;
  const out = await journal.attempt(draft(A, 'task-2', { notes: 'x'.repeat(250_000) }), async () => { sent++; return ack; });
  assert.equal(out.journaled, false); if (!out.journaled) assert.equal(out.reason, 'too-large'); assert.equal(sent, 0); assert.equal(storage.data.size, 0);
});

test('resumen provisional para el pasaporte: solo alcance, instante y recuentos; nada de IDs, valores ni borradores', async () => {
  const { journal, storage } = rig(); await journal.saveDraft(draft(A, 'task-secreta', { notes: 'dato sensible del cliente' })); await journal.attempt(draft(A, 'task-2'), async () => ({ kind: 'unknown' }) as SendResult);
  await journal.saveDraft(draft(B, 'task-3')); storage.data.set(KEY_PREFIX + 'roto', '{');
  const summary = summarizeForPassport(await journal.boot(A), A, '2026-11-05T10:05:00Z');
  assert.deepEqual(summary, { source: 'intent-journal', observed: true, scope: { installId: 'inst-1', contextKey: 'ctx-A' }, status: 'read', at: '2026-11-05T10:05:00Z', counts: { drafts: 1, unknownOutcome: 1, settled: 0, otherContext: 1, unreadable: 1 } });
  assert.doesNotMatch(JSON.stringify(summary), /task-|sensible|notes|Texto/);
});

test('codificación: ida y vuelta exacta; cualquier cambio de un carácter se detecta', () => {
  const record: IntentRecord = { v: 1, id: 'x', installId: null, contextKey: 'k', taskId: 't', phase: 'draft', outcome: null, provenance: null, patch: { a: 'ñ', b: null, c: 3, d: false }, baseline: {}, revision: null, createdAt: '2026-11-05T10:00:00.000Z', updatedAt: '2026-11-05T10:00:01.000Z', evidence: null, seq: 1 };
  const raw = encodeRecord(record), back = decodeRecord(raw); assert.ok(back.ok); assert.deepEqual(back.ok && back.record, record);
  for (let i = 0; i < raw.length; i += 7) { const mutated = raw.slice(0, i) + (raw[i] === 'a' ? 'b' : 'a') + raw.slice(i + 1); if (mutated !== raw) assert.equal(decodeRecord(mutated).ok, false, 'posición ' + i); }
  assert.deepEqual(classify([{ key: KEY_PREFIX + 'x', raw }], { installId: null, contextKey: 'k' })[0].cls, 'restorable-draft');
});


// ═══ R2 · dictamen 210 ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
const bytes = (storage: Memory) => JSON.stringify([...storage.data]);
test('R2 F1 · promover un borrador desde OTRA captura u OTRA instalación: ni un byte cambia ni se llama a `send`', async () => {
  const { journal, storage } = rig(); const original = await journal.saveDraft(draft(A)); assert.ok(original.ok); const id = (original as { record: IntentRecord }).record.id, before = bytes(storage); let calls = 0;
  for (const other of [B, OTHER_INSTALL]) {
    const out = await journal.attempt({ ...draft(other), id }, async (): Promise<SendResult> => { calls++; return ack; });
    assert.equal(out.journaled, false); if (!out.journaled) assert.equal(out.reason, 'wrong-context'); assert.equal(calls, 0); assert.equal(bytes(storage), before, 'el borrador de A sigue byte a byte');
    const edit = await journal.saveDraft({ ...draft(other), id }); assert.equal(edit.ok, false); assert.equal(bytes(storage), before, 'tampoco se puede editar el borrador desde otra copia');
  }
});
test('R2 F2 · el ID de un borrador de OTRA tarea de la misma captura no se ejecuta ni se edita; la promoción válida conserva ID y fecha de creación', async () => {
  const { journal, storage } = rig(); const original = await journal.saveDraft(draft(A, 'task-1')); assert.ok(original.ok); const rec = (original as { record: IntentRecord }).record, before = bytes(storage); let calls = 0;
  const out = await journal.attempt({ ...draft(A, 'task-2'), id: rec.id }, async () => { calls++; return ack; });
  assert.equal(out.journaled, false); if (!out.journaled) assert.equal(out.reason, 'wrong-task'); assert.equal(calls, 0); assert.equal(bytes(storage), before);
  const edit = await journal.saveDraft({ ...draft(A, 'task-2'), id: rec.id }); assert.equal(edit.ok, false); if (!edit.ok) assert.equal(edit.reason, 'wrong-task'); assert.equal(bytes(storage), before);
  clock += 60_000; const valid = await journal.attempt({ ...draft(A, 'task-1', { notes: 'definitiva' }), id: rec.id }, async () => ({ kind: 'unknown' }) as SendResult);
  assert.ok(valid.journaled); if (valid.journaled) { assert.equal(valid.record.id, rec.id); assert.equal(valid.record.createdAt, rec.createdAt); assert.equal(valid.record.phase, 'attempt'); assert.equal(valid.record.seq, rec.seq + 1); }
  assert.equal(storage.data.size, 1);
});
test('R2 F3 · la promoción guarda JUNTOS parche, valor base de los campos enviados y revisión; el callback lo lee y una instancia nueva lo clasifica igual', async () => {
  const { journal, storage } = rig(); const original = await journal.saveDraft(draft(A, 'task-2', { notes: 'borrador de notas' })); const id = (original as { record: IntentRecord }).record.id; let observed: IntentRecord | null = null;
  const changed = { current: A, taskId: 'task-2', id, patch: { status: 'completed' }, baseline: { id: 'task-2', entity: 'tasks', values: { status: 'pending', notes: 'otra' } } as never, revision: 'tok-2' };
  const out: Awaited<ReturnType<typeof journal.attempt>> = await journal.attempt(changed, async (record: IntentRecord): Promise<SendResult> => { observed = record; assert.deepEqual(phaseOf(storage, id).patch, { status: 'completed' }, 'ya está escrito cuando corre el callback'); return { kind: 'unknown' }; });
  assert.ok(out.journaled); assert.deepEqual(observed!.patch, { status: 'completed' }); assert.deepEqual(observed!.baseline, { status: 'pending' }, 'base de ESE campo, no la de las notas del borrador'); assert.equal(observed!.revision, 'tok-2');
  const fresh = createIntentJournal({ storage, now: () => new Date(clock).toISOString() }), entry = (await fresh.boot(A)).entries[0];
  assert.equal(entry.cls, 'unknown-outcome'); assert.deepEqual(entry.record!.patch, { status: 'completed' }); assert.deepEqual(entry.record!.baseline, { status: 'pending' }); assert.equal(entry.record!.revision, 'tok-2');
  storage.failWrites = true; const second = await journal.saveDraft(draft(A, 'task-5')); let calls = 0; const blocked = await journal.attempt(draft(A, 'task-6'), async () => { calls++; return ack; });
  assert.equal(second.ok, false); assert.equal(blocked.journaled, false); assert.equal(calls, 0, 'con la escritura retenida/fallida el callback no corre');
});
test('R2 F4 · el tope se hace cumplir EN el punto de escritura: dos altas simultáneas (y dos instancias sobre la misma base) solo ocupan UN hueco; editar con la base llena sigue permitido', async () => {
  const storage = new Memory(), mk = () => createIntentJournal({ storage, maxRecords: 1, now: () => new Date(clock).toISOString(), newId: (() => { let n = 0; return () => 'x' + Math.random().toString(36).slice(2) + ++n; })() });
  const one = mk(), two = mk(); let calls = 0;
  const results = await Promise.all([one.saveDraft(draft(A, 'task-1')), two.saveDraft(draft(A, 'task-2')), one.attempt(draft(A, 'task-3'), async () => { calls++; return ack; })]);
  assert.equal(storage.data.size, 1, 'el límite total se conserva'); assert.equal(results.filter(r => ('ok' in r && r.ok) || ('journaled' in r && r.journaled)).length, 1, 'solo gana una alta');
  const lost = results.filter(r => ('ok' in r && !r.ok) || ('journaled' in r && !r.journaled)); assert.equal(lost.length, 2); for (const r of lost) assert.equal((r as { reason: string }).reason, 'journal-full');
  if (results[2].journaled === false) assert.equal(calls, 0, 'un intento rechazado no llama a su callback');
  const survivor = [...storage.data.keys()][0].slice(KEY_PREFIX.length); const edit = await one.saveDraft({ ...draft(A, 'task-1', { notes: 'editado' }), id: survivor }); const second = await two.saveDraft({ ...draft(A, 'task-2', { notes: 'x' }), id: survivor });
  assert.ok(edit.ok || second.ok, 'editar un registro existente con la base llena no se rechaza por el tope'); assert.equal(storage.data.size, 1);
});
test('R2 F5 · forma incoherente (fechas inválidas con checksum coherente, fase/procedencia incompatibles, ID interno distinto de la clave): cuarentena, intacto, sin purgar; el terminado válido y vencido sí sale', async () => {
  const { journal, storage } = rig({ ttlMs: 1000 }); const saved = await journal.attempt(draft(A, 'task-1'), async () => ack); assert.ok(saved.journaled && saved.settled);
  const good = saved.record, key = KEY_PREFIX + good.id; clock += 5_000;
  const variants: Record<string, IntentRecord> = {
    'x-fecha': { ...good, id: 'x-fecha', updatedAt: 'fecha inválida' }, 'x-creada': { ...good, id: 'x-creada', createdAt: '' }, 'x-fase': { ...good, id: 'x-fase', phase: 'attempt' }, 'x-prov': { ...good, id: 'x-prov', provenance: 'person-accepted-read' },
    'x-sin-prov': { ...good, id: 'x-sin-prov', provenance: null }, 'x-draft-con-resultado': { ...good, id: 'x-draft-con-resultado', phase: 'draft' }, 'x-evidencia': { ...good, id: 'x-evidencia', evidence: { kind: 'otra' as never, at: 'nunca' } },
    'x-valor': { ...good, id: 'x-valor', patch: { a: { b: 1 } as never } }, 'x-seq': { ...good, id: 'x-seq', seq: 0 },
  };
  for (const [name, record] of Object.entries(variants)) storage.data.set(KEY_PREFIX + name, encodeRecord(record));
  storage.data.set(KEY_PREFIX + 'otra-clave', encodeRecord({ ...good, id: 'distinto' }));   // ID interno ≠ clave
  const invalid = new Map([...storage.data].filter(([k]) => k !== key)), report = await journal.boot(A);
  assert.equal(report.status, 'read'); assert.deepEqual(report.entries.filter(e => e.cls === 'quarantined').map(e => e.key).sort(), [...invalid.keys()].sort(), 'todas las incoherentes en cuarentena, ninguna aplicable');
  assert.ok(report.entries.filter(e => e.cls === 'quarantined').every(e => e.record === null && e.action === 'none'));
  const removed = await journal.prune(); assert.equal(removed.removed, 1, 'solo el terminado válido y vencido sale'); assert.equal(storage.data.has(key), false);
  for (const [k, v] of invalid) assert.equal(storage.data.get(k), v, 'el inválido se conserva byte a byte: ' + k);
  assert.equal((await journal.recordEvidence(A, 'x-fecha', { kind: 'applied', at: '2026-11-05T10:00:00Z' })).ok, false, 'tampoco se opera sobre él');
});
test('R2 F5 · la caducidad exige una fecha de liquidación VÁLIDA y vencida: con fecha inválida el registro se conserva (probe del revisor)', async () => {
  const { journal, storage } = rig(); const saved = await journal.attempt(draft(A), async () => ack); assert.ok(saved.journaled && saved.settled);
  const key = KEY_PREFIX + saved.record.id, valid = storage.data.get(key)!; assert.equal(await storage.write(key, encodeRecord({ ...saved.record, updatedAt: 'fecha inválida' }), valid), 'ok');
  const prior = bytes(storage); assert.equal((await journal.prune()).removed, 0); assert.equal(bytes(storage), prior);
});
test('R2 · si la lectura COMPLETA falla, el arranque lo dice («unavailable»): no afirma vacío ni «sin pendientes», y el resumen para el pasaporte lleva counts null', async () => {
  const { journal, storage } = rig(); await journal.saveDraft(draft(A)); storage.failReads = true;
  const report = await journal.boot(A); assert.deepEqual(report, { status: 'unavailable', entries: [] });
  assert.deepEqual(summarizeForPassport(report, A, '2026-11-05T10:05:00Z'), { source: 'intent-journal', observed: false, scope: { installId: 'inst-1', contextKey: 'ctx-A' }, status: 'unavailable', at: '2026-11-05T10:05:00Z', counts: null });
  storage.failReads = false; assert.equal((await journal.boot(A)).status, 'read');
});
test('R2 · aceptar la lectura exige una lectura que muestre el cambio APLICADO; «sin cambios» o «divergente» no bastan; la procedencia sigue siendo humana', async () => {
  const { journal, storage } = rig(); await journal.attempt(draft(A, 'task-1'), async () => ({ kind: 'unknown' }) as SendResult);
  const none = await journal.acceptRead(A, 'id-1'); assert.equal(none.ok, false); if (!none.ok) assert.equal(none.reason, 'no-evidence');
  for (const kind of ['unchanged', 'diverged'] as const) { await journal.recordEvidence(A, 'id-1', { kind, at: '2026-11-05T10:01:00.000Z' }); const r = await journal.acceptRead(A, 'id-1'); assert.equal(r.ok, false, kind); assert.equal(phaseOf(storage, 'id-1').phase, 'attempt'); }
  await journal.recordEvidence(A, 'id-1', { kind: 'applied', at: '2026-11-05T10:02:00.000Z' }); const ok = await journal.acceptRead(A, 'id-1'); assert.ok(ok.ok);
  assert.equal(phaseOf(storage, 'id-1').provenance, 'person-accepted-read'); assert.equal(phaseOf(storage, 'id-1').outcome, 'accepted-read');
});
test('R2 · identificadores no válidos se rechazan antes de escribir', async () => {
  const { journal, storage } = rig(); for (const id of ['', 'a b', 'a/b', 'x'.repeat(200), '../x']) { const r = await journal.saveDraft({ ...draft(A), id }); assert.equal(r.ok, false, JSON.stringify(id)); }
  assert.equal(storage.data.size, 0);
});

// ═══ R3 · dictamen 210 (segunda ronda) ═══════════════════════════════════════════════════════════════════════════════════════════════════
import { validDate } from '../shared/task-intent-journal.js';
/** Intercala un cambio de OTRO escritor justo después de que el diario toma su lectura (antes de que vuelva a su llamador). */
function interfering(storage: Memory, change: () => Promise<void>) { const real = storage.readAll.bind(storage); let armed = true; storage.readAll = async () => { const snapshot = await real(); if (armed) { armed = false; await change(); } return snapshot; }; }
for (const kind of ['diverged', 'unchanged'] as const) test('R3 F1 · aceptar la lectura no liquida si otro escritor cambia la evidencia a «' + kind + '» entre la lectura y la escritura; el valor nuevo se conserva byte a byte', async () => {
  const { journal, storage } = rig(); await journal.attempt(draft(A, 'task-1'), async () => ({ kind: 'unknown' }) as SendResult);
  assert.ok((await journal.recordEvidence(A, 'id-1', { kind: 'applied', at: '2026-11-05T10:01:00.000Z' })).ok);
  const other = createIntentJournal({ storage, now: () => '2026-11-05T10:02:00.000Z' }); let after = '';
  interfering(storage, async () => { assert.ok((await other.recordEvidence(A, 'id-1', { kind, at: '2026-11-05T10:02:00.000Z' })).ok); after = bytes(storage); });
  const accepting = createIntentJournal({ storage, now: () => '2026-11-05T10:03:00.000Z' }); const result = await accepting.acceptRead(A, 'id-1');
  const final = phaseOf(storage, 'id-1'); assert.deepEqual({ accepted: result.ok, phase: final.phase, evidence: final.evidence?.kind, sameBytes: bytes(storage) === after }, { accepted: false, phase: 'attempt', evidence: kind, sameBytes: true });
  if (!result.ok) assert.ok(['conflict', 'no-evidence'].includes(result.reason));
});
test('R3 F1 · la retirada de la evidencia entre la lectura y la escritura tampoco permite aceptar', async () => {
  const { journal, storage } = rig(); await journal.attempt(draft(A, 'task-1'), async () => ({ kind: 'unknown' }) as SendResult); await journal.recordEvidence(A, 'id-1', { kind: 'applied', at: '2026-11-05T10:01:00.000Z' });
  let after = ''; interfering(storage, async () => { const key = KEY_PREFIX + 'id-1', current = storage.data.get(key)!, record = phaseOf(storage, 'id-1'); assert.equal(await storage.write(key, encodeRecord({ ...record, evidence: null, seq: record.seq + 1 }), current), 'ok'); after = bytes(storage); });
  const result = await journal.acceptRead(A, 'id-1'); assert.equal(result.ok, false); assert.equal(bytes(storage), after); assert.equal(phaseOf(storage, 'id-1').evidence, null); assert.equal(phaseOf(storage, 'id-1').phase, 'attempt');
});
test('R3 F1 · control positivo sin carrera: con evidencia applied se liquida con procedencia humana; el contexto ajeno y la fase siguen rechazándose', async () => {
  const { journal, storage } = rig(); await journal.attempt(draft(A, 'task-1'), async () => ({ kind: 'unknown' }) as SendResult); await journal.recordEvidence(A, 'id-1', { kind: 'applied', at: '2026-11-05T10:01:00.000Z' });
  const wrong = await journal.acceptRead(B, 'id-1'); assert.equal(wrong.ok, false); if (!wrong.ok) assert.equal(wrong.reason, 'wrong-context');
  const ok = await journal.acceptRead(A, 'id-1'); assert.ok(ok.ok); const settled = phaseOf(storage, 'id-1'); assert.equal(settled.phase, 'settled'); assert.equal(settled.outcome, 'accepted-read'); assert.equal(settled.provenance, 'person-accepted-read'); assert.equal(settled.evidence!.kind, 'applied');
  const again = await journal.acceptRead(A, 'id-1'); assert.equal(again.ok, false); if (!again.ok) assert.equal(again.reason, 'wrong-phase');
});
test('R3 F2 · fechas de calendario: formas ISO válidas (con o sin milisegundos, Z u offset, solo fecha) y bisiestos; 30 de febrero, 29/02 de año no bisiesto y valores fuera de rango no lo son', () => {
  for (const ok of ['2026-11-05T10:00:00.000Z', '2026-11-05T10:00:00Z', '2026-11-05T10:00:00.5Z', '2026-11-05T10:00:00+01:00', '2026-11-05T23:59:59-05:30', '2026-11-05', '2024-02-29', '2024-02-29T10:00:00Z', '2000-02-29T00:00:00Z', '2026-12-31T23:59:59.999Z']) assert.equal(validDate(ok), true, ok);
  for (const bad of ['2026-02-30T10:00:00.000Z', '2026-02-29T10:00:00Z', '1900-02-29', '2025-02-29', '2026-04-31', '2026-13-01', '2026-00-10', '2026-11-00', '2026-11-05T24:00:00Z', '2026-11-05T10:60:00Z', '2026-11-05T10:00:60Z', '2026-11-05T10:00:00+24:00', '2026-11-05T10:00:00+01:60', '2026-11-05 10:00:00', 'fecha inválida', '', '2026-11-05T10:00Z', '2026-1-5', '0000-01-01', 'x'.repeat(50)]) assert.equal(validDate(bad), false, bad);
  assert.equal(validDate(20261105 as never), false); assert.equal(validDate(null as never), false);
});
test('R3 F2 · un 30 de febrero (createdAt, updatedAt o evidence.at) con checksum coherente queda en CUARENTENA: ni opera, ni se purga; el terminado válido y vencido sí se retira', async () => {
  const { journal, storage } = rig({ ttlMs: 1000 }); const saved = await journal.attempt(draft(A, 'task-1'), async () => ack); assert.ok(saved.journaled && saved.settled); const good = saved.record, goodKey = KEY_PREFIX + good.id; clock += 5_000;
  const impossible = '2026-02-30T10:00:00.000Z', ev = { kind: 'applied' as const, at: impossible };
  const variants: Record<string, IntentRecord> = { 'x-updated': { ...good, id: 'x-updated', updatedAt: impossible }, 'x-created': { ...good, id: 'x-created', createdAt: impossible }, 'x-evidence': { ...good, id: 'x-evidence', phase: 'settled', outcome: 'accepted-read', provenance: 'person-accepted-read', evidence: ev } };
  for (const [name, record] of Object.entries(variants)) { const raw = encodeRecord(record); storage.data.set(KEY_PREFIX + name, raw); assert.deepEqual(decodeRecord(raw, KEY_PREFIX + name), { ok: false, reason: 'bad-shape' }, name); }
  const invalid = new Map([...storage.data].filter(([k]) => k !== goodKey)), report = await journal.boot(A);
  assert.deepEqual(report.entries.filter(e => e.cls === 'quarantined').map(e => e.key).sort(), [...invalid.keys()].sort()); assert.equal((await journal.prune()).removed, 1, 'solo el válido y vencido'); assert.equal(storage.data.has(goodKey), false);
  for (const [k, v] of invalid) assert.equal(storage.data.get(k), v, k); assert.equal((await journal.abandon(A, 'x-updated')).ok, false);
});

// ── R4 · validar ANTES de serializar, de podar y de llamar a `send`; reloj y evidencia son entradas ───────────────────────────────────────────
type Patch = Record<string, string | number | boolean | null>;
const bytesOfAll = (storage: Memory) => JSON.stringify([...storage.data.entries()]);
const valuesOf = (patch: Patch, baseline: Record<string, unknown> = { notes: 'antes', amount: 12 }) => ({ current: A, id: 'att-r4', taskId: 'task-2', patch, baseline: { id: 'task-2', entity: 'tasks', values: baseline } as never, revision: 'tok-1' });
function clocked() {
  const state: { mode: 'ok' | 'impossible' | 'throws' | 'garbage'; at: string } = { mode: 'ok', at: '2026-11-05T10:00:00.000Z' };
  const now = () => { if (state.mode === 'throws') throw new Error('reloj roto'); if (state.mode === 'impossible') return '2026-02-30T10:00:00.000Z'; if (state.mode === 'garbage') return 'ayer'; return state.at; };
  const storage = new Memory(); return { state, storage, journal: createIntentJournal({ storage, now, newId: () => 'id-' + ++counter }) };
}

test('R4·1 un número no finito (NaN, ±Infinity) o `undefined` en el parche o en la base NO se escribe, NO se normaliza a null y NO llega a `send`; null explícito sí se conserva', async () => {
  for (const [name, input] of [
    ['NaN en el parche', valuesOf({ amount: Number.NaN })], ['+Infinity', valuesOf({ amount: Number.POSITIVE_INFINITY })], ['-Infinity', valuesOf({ amount: Number.NEGATIVE_INFINITY })],
    ['NaN junto a un valor válido', valuesOf({ notes: 'ok', amount: Number.NaN })], ['undefined en el parche', valuesOf({ amount: undefined as never })],
    ['NaN en el valor BASE de un campo enviado', valuesOf({ amount: 17 }, { amount: Number.NaN })], ['Infinity en la base', valuesOf({ amount: 17 }, { amount: Number.POSITIVE_INFINITY })],
  ] as const) {
    const { storage, journal } = rig(); let sends = 0;
    const out = await journal.attempt(input, async () => { sends++; return { kind: 'unknown' } as SendResult; });
    assert.deepEqual({ name, journaled: out.journaled, reason: out.journaled ? null : out.reason, sends, rows: storage.data.size, writes: storage.writes }, { name, journaled: false, reason: 'invalid-input', sends: 0, rows: 0, writes: 0 });
    const draftResult = await journal.saveDraft(input); assert.equal(draftResult.ok, false, name + ' (borrador)'); assert.equal(storage.data.size, 0);
  }
  // CONTROL: valores finitos y null explícito se conservan, y el callback recibe exactamente lo persistido.
  const { storage, journal } = rig(); let seen: IntentRecord | null = null;
  const out = await journal.attempt(valuesOf({ amount: 17, note: null, flag: false, text: 'ñ€😀' }), async sent => { seen = sent; return { kind: 'unknown' } as SendResult; });
  assert.equal(out.journaled, true); const stored = (decodeRecord(storage.data.get(KEY_PREFIX + 'att-r4')!, KEY_PREFIX + 'att-r4') as { ok: true; record: IntentRecord }).record;
  assert.deepEqual(seen, stored, 'lo que recibe send == lo que hay en el almacenamiento'); assert.deepEqual(stored.patch, { amount: 17, note: null, flag: false, text: 'ñ€😀' }); assert.equal(stored.patch.note, null, 'null explícito sigue siendo null');
});
test('R4·1 el cero negativo no puede diferir entre lo enviado y lo guardado: send recibe la relectura de lo escrito', async () => {
  const { storage, journal } = rig(); let seen: IntentRecord | null = null;
  assert.equal((await journal.attempt(valuesOf({ amount: -0 }), async sent => { seen = sent; return { kind: 'unknown' } as SendResult; })).journaled, true);
  const stored = (decodeRecord(storage.data.get(KEY_PREFIX + 'att-r4')!) as { ok: true; record: IntentRecord }).record;
  assert.ok(Object.is(seen!.patch.amount, stored.patch.amount), 'misma representación en el callback y en disco'); assert.deepEqual(seen, stored);
});
test('R4·1 una entrada inválida NO ocupa plaza ni dispara la poda: con el cuaderno lleno y un terminado vencido, la alta inválida deja la retención y los bytes intactos', async () => {
  const { storage, journal } = rig({ maxRecords: 2 });
  assert.ok((await journal.attempt({ ...draft(A, 'task-1'), id: 'viejo' }, async () => ack)).journaled);   // terminado, se hará viejo
  assert.ok((await journal.saveDraft({ ...draft(A, 'task-2'), id: 'borrador' })).ok);
  clock += 15 * 24 * 3_600_000;                                                                             // el terminado supera su TTL de 14 días
  const before = bytesOfAll(storage), removes = storage.removes;
  const invalidAttempt = await journal.attempt({ ...draft(A, 'task-3', { amount: Number.NaN }), id: 'nuevo' }, async () => ack);
  assert.equal(invalidAttempt.journaled, false); if (!invalidAttempt.journaled) assert.equal(invalidAttempt.reason, 'invalid-input', 'no «cuaderno lleno»');
  assert.equal((await journal.saveDraft({ ...draft(A, 'task-3', { amount: Number.POSITIVE_INFINITY }), id: 'nuevo-2' })).ok, false);
  assert.equal(storage.removes, removes, 'ninguna poda'); assert.equal(bytesOfAll(storage), before, 'ni un byte cambia: el terminado vencido sigue ahí');
  // CONTROL: la misma alta con entrada válida sí hace la retención y entra.
  const valid = await journal.attempt({ ...draft(A, 'task-3'), id: 'nuevo' }, async () => ack); assert.equal(valid.journaled, true); assert.equal(storage.removes, removes + 1, 'la poda ocurre solo para una alta válida'); assert.ok(!storage.data.has(KEY_PREFIX + 'viejo'));
  clock = Date.parse('2026-11-05T10:00:00Z');
});
test('R4·1 promover un borrador con una entrada inválida conserva el borrador byte a byte y sigue siendo promovible', async () => {
  const { storage, journal } = rig(); assert.ok((await journal.saveDraft({ ...draft(A, 'task-2', { notes: 'v1' }), id: 'D' })).ok);
  const before = bytesOfAll(storage); let sends = 0;
  for (const patch of [{ notes: Number.NaN }, { notes: Number.POSITIVE_INFINITY }] as Patch[]) {
    const out = await journal.attempt({ ...draft(A, 'task-2', patch), id: 'D' }, async (): Promise<SendResult> => { sends++; return ack; }); assert.equal(out.journaled, false); if (!out.journaled) assert.equal(out.reason, 'invalid-input');
    assert.equal((await journal.saveDraft({ ...draft(A, 'task-2', patch), id: 'D' })).ok, false);
  }
  assert.equal(sends, 0); assert.equal(bytesOfAll(storage), before); assert.equal((await journal.boot(A)).entries[0].cls, 'restorable-draft');
  const good = await journal.attempt({ ...draft(A, 'task-2', { notes: 'v2' }), id: 'D' }, async () => ack); assert.equal(good.journaled, true); assert.equal(phaseOf(storage, 'D').phase, 'settled'); assert.equal(phaseOf(storage, 'D').patch.notes, 'v2');
});
test('R4·2 evidencia con fecha de calendario imposible, forma inválida o campos extra se RECHAZA: el intento válido conserva sus bytes y su clasificación («comprobable»)', async () => {
  const { storage, journal } = rig(); assert.ok((await journal.attempt({ ...draft(), id: 'E' }, async () => ({ kind: 'unknown' }) as SendResult)).journaled);
  const before = bytesOfAll(storage);
  for (const evidence of [
    { kind: 'applied', at: '2026-02-30T10:00:00.000Z' }, { kind: 'applied', at: '2025-02-29' }, { kind: 'applied', at: '2026-13-01T00:00:00Z' }, { kind: 'applied', at: 'x' }, { kind: 'applied', at: '2026-11-05T25:00:00Z' },
    { kind: 'bogus', at: '2026-11-05T10:00:00Z' }, { kind: 'applied', at: 12345 }, { kind: 'applied', at: '2026-11-05T10:00:00Z', extra: 1 }, null, 'applied',
  ] as never[]) {
    const out = await journal.recordEvidence(A, 'E', evidence); assert.equal(out.ok, false, JSON.stringify(evidence)); if (!out.ok) assert.equal(out.reason, 'invalid-input');
    assert.equal(bytesOfAll(storage), before, 'bytes intactos'); const boot = await journal.boot(A); assert.deepEqual([boot.entries[0].cls, boot.entries[0].action], ['unknown-outcome', 'check-by-reading']);
  }
  assert.equal((await journal.acceptRead(A, 'E')).ok, false, 'sin evidencia válida no se puede aceptar');
  assert.ok((await journal.recordEvidence(A, 'E', { kind: 'applied', at: '2024-02-29T10:00:00.000Z' })).ok, 'el 29 de febrero de un año bisiesto es válido'); assert.equal((await journal.boot(A)).entries[0].cls, 'unknown-outcome', 'sigue clasificable');
  assert.ok((await journal.acceptRead(A, 'E')).ok);
});
test('R4·2 el reloj es una entrada: un instante imposible, ilegible o que lanza no escribe NADA, no llama a `send` y no purga; si falla al liquidar, el intento queda incierto y comprobable', async () => {
  for (const mode of ['impossible', 'throws', 'garbage'] as const) {
    const { state, storage, journal } = clocked(); state.mode = mode; let sends = 0;
    const out = await journal.attempt({ ...draft(), id: 'C' }, async (): Promise<SendResult> => { sends++; return ack; });
    assert.deepEqual({ mode, journaled: out.journaled, reason: out.journaled ? null : out.reason, sends, rows: storage.data.size }, { mode, journaled: false, reason: 'invalid-input', sends: 0, rows: 0 });
    assert.equal((await journal.saveDraft({ ...draft(), id: 'C2' })).ok, false); assert.equal(storage.data.size, 0);
  }
  // El reloj falla justo al liquidar: send ya salió, el acuse no se puede asentar y el registro sigue siendo un intento válido (incierto), nunca «acknowledged».
  const { state, storage, journal } = clocked(); let sends = 0;
  const out = await journal.attempt({ ...draft(), id: 'S' }, async () => { sends++; state.mode = 'impossible'; return ack; });
  assert.equal(out.journaled, true); if (out.journaled) { assert.equal(out.settled, false); assert.equal(out.record.phase, 'attempt'); } assert.equal(sends, 1);
  state.mode = 'ok'; const boot = await journal.boot(A); assert.deepEqual([boot.entries[0].cls, boot.entries[0].action], ['unknown-outcome', 'check-by-reading']);
  // Transiciones con el reloj roto: rechazo de entrada y bytes intactos; con el reloj bueno, funcionan.
  const before = bytesOfAll(storage); state.mode = 'throws';
  for (const act of [() => journal.recordEvidence(A, 'S', { kind: 'applied', at: '2026-11-05T10:00:00Z' }), () => journal.abandon(A, 'S'), () => journal.acceptRead(A, 'S')]) { const r = await act(); assert.equal(r.ok, false); if (!r.ok) assert.ok(['invalid-input', 'no-evidence'].includes(r.reason)); assert.equal(bytesOfAll(storage), before); }
  state.mode = 'ok'; assert.ok((await journal.recordEvidence(A, 'S', { kind: 'applied', at: '2026-11-05T10:00:00Z' })).ok); assert.ok((await journal.abandon(A, 'S')).ok);
  // Sin hora fiable no se acredita que nada haya vencido: la retención no purga.
  clock += 30 * 24 * 3_600_000; const settledBefore = bytesOfAll(storage); state.mode = 'impossible'; assert.deepEqual(await journal.prune(), { removed: 0 }); assert.equal(bytesOfAll(storage), settledBefore); clock = Date.parse('2026-11-05T10:00:00Z');
});
test('R4·3 ningún `send` recibe una intención que el arranque no pueda clasificar: toda intención entregada se relee, es válida y se clasifica como «unknown-outcome» desde otra instancia', async () => {
  const { storage, journal } = rig(); const delivered: IntentRecord[] = [];
  for (const [index, patch] of ([{ a: 1 }, { a: null }, { a: 'x'.repeat(500) }, { a: 1.5e300 }, { a: -0 }, { a: true }] as Patch[]).entries()) await journal.attempt({ ...draft(A, 'task-' + index, patch), id: 'ok-' + index }, async sent => { delivered.push(sent); return { kind: 'unknown' } as SendResult; });
  const fresh = createIntentJournal({ storage, now: () => new Date(clock).toISOString() }), boot = await fresh.boot(A);
  assert.equal(boot.status, 'read'); assert.equal(boot.entries.length, delivered.length); assert.ok(boot.entries.every(entry => entry.cls === 'unknown-outcome'));
  for (const sent of delivered) assert.deepEqual(boot.entries.find(entry => entry.record?.id === sent.id)!.record, sent);
});
