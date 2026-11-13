import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Store } from '../server/store.js';
import { makeDemoSpec, makeFixture } from '../shared/fixtures.js';
import { buildResponseQueue } from '../shared/response-queue.js';
import { candidatesFromQueue, buildContinuityDay, emptyDecisions } from '../shared/continuity-day.js';
import { contextKey } from '../shared/local-task-focus.js';
import { inspectLocalWorkQueue } from '../server/local-operations.js';
import { LocalWorkQueueSchema } from '../shared/local-operations.js';
import { dayInputFromWorkQueue, referenceNoteOf, shortId, workIdentityKey } from '../shared/work-queue-day.js';

// Unidad A3 (adaptador) · la cola estructurada de 230 R3 → la Jornada. Datos ficticios, sin red; las copias entran por la importación normal de Store.
const NOW = Date.parse('2026-11-02T08:00:00Z'), clock = () => NOW;
const generation = (at = '2026-11-02T07:00:00.000Z') => ({ provider: 'demo' as const, model: null, generatedAt: at, prompt: '', approved: false });
function copy(snapshot = makeFixture('agency'), active = true) {
  const store = new Store(':memory:'); store.set('instanceId', randomUUID()); assert.equal(store.importSnapshot(snapshot).complete, true);
  if (active) { store.saveGeneration(makeDemoSpec(snapshot), generation()); store.activate(); }
  return store;
}
function big({ refs = 0, idLength = 6, taskCount = 1, ghosts = 0, label = '' }: { refs?: number; idLength?: number; taskCount?: number; ghosts?: number; label?: string }) {
  const snapshot = makeFixture('agency'), tasks = snapshot.entities.find(e => e.id === 'tasks')!, reference = tasks.fields.find(f => f.type === 'reference' && f.referenceEntity === 'contacts')!;
  const keys = Array.from({ length: refs }, (_, i) => 'verified_ref_' + String(i).padStart(2, '0')); for (const key of keys) tasks.fields.push({ ...reference, key, label: key, required: false });
  const contact = snapshot.records.find(r => r.entity === 'contacts')!, contactId = 'ficticio_contacto_' + 'x'.repeat(idLength);
  snapshot.records.push({ ...structuredClone(contact), id: contactId }); snapshot.manifest.expectedCounts.contacts++;
  const ghostIds = Array.from({ length: ghosts }, (_, i) => 'fantasma_' + i); for (const id of ghostIds) { snapshot.records.push({ ...structuredClone(contact), id }); snapshot.manifest.expectedCounts.contacts++; }
  const template = snapshot.records.find(r => r.entity === 'tasks' && r.values.status === 'pending')!;
  const fill = (values: Record<string, unknown>) => keys.forEach((key, i) => { values[key] = i >= refs - ghosts ? ghostIds[i - (refs - ghosts)] : contactId; });
  if (taskCount === 1) fill(template.values);
  else { for (let i = 0; i < taskCount; i++) { const extra = structuredClone(template); extra.id = 'frontera-' + String(i).padStart(3, '0') + label; extra.values.due_date = '2001-01-01'; fill(extra.values); snapshot.records.push(extra); } snapshot.manifest.expectedCounts.tasks += taskCount; }
  return { snapshot, taskId: template.id, ghostIds };
}

test('equivalencia: sobre la misma copia, los candidatos son los de candidatesFromQueue (mismo orden, estado, vencimiento, motivos y asociaciones)', () => {
  const store = copy(); try {
    const work = inspectLocalWorkQueue(store, clock), queue = buildResponseQueue({ spec: store.spec!, records: store.records(), evaluatedAt: NOW, horizonHours: 24, limit: 200 });
    const input = dayInputFromWorkQueue(work), reference = candidatesFromQueue(queue).map(candidate => ({ ...candidate, reasons: [...new Set(candidate.reasons)] }));
    assert.deepEqual(input.candidates, reference); assert.ok(input.candidates.length > 3);
    assert.deepEqual({ phase: input.phase, notConsidered: input.notConsidered, partial: input.coverage.partial, notice: input.coverage.notice }, { phase: 'active', notConsidered: 0, partial: false, notice: null });
    assert.equal(input.coverage.queued, queue.summary.totalQueued); assert.equal(input.coverage.returned, queue.items.length);
  } finally { store.close(); }
});
test('identidad: la clave es la contextKey de la FICHA para la misma copia; otra captura u otra generación con los MISMOS IDs es otra clave; copia vacía = null', () => {
  const store = copy(); try {
    const a = dayInputFromWorkQueue(inspectLocalWorkQueue(store, clock)), identity = inspectLocalWorkQueue(store, clock).identity!;
    assert.equal(a.key, contextKey({ instanceId: identity.instanceId, snapshotId: identity.snapshotId, capturedAt: identity.capturedAt, captureStartedAt: identity.captureStartedAt, accountId: identity.accountId, generatedAt: identity.generatedAt })); assert.equal(a.key, workIdentityKey(identity));
    assert.equal(dayInputFromWorkQueue(inspectLocalWorkQueue(store, clock)).key, a.key, 'recargar la MISMA copia no cambia la clave');
    const next = makeFixture('agency'); next.id = store.snapshot!.id + '-otra'; next.capturedAt = '2026-11-09T09:00:00.000Z'; store.importSnapshot(next, true); store.saveGeneration(makeDemoSpec(next), generation()); store.activate();
    const b = dayInputFromWorkQueue(inspectLocalWorkQueue(store, clock)); assert.deepEqual(b.candidates.map(c => c.id), a.candidates.map(c => c.id), 'mismos IDs de tarea'); assert.notEqual(b.key, a.key, 'otra captura = otra Jornada');
    store.saveGeneration(makeDemoSpec(next), generation('2026-11-10T07:00:00.000Z')); store.activate(); assert.notEqual(dayInputFromWorkQueue(inspectLocalWorkQueue(store, clock)).key, b.key, 'otra generación = otra Jornada');
  } finally { store.close(); }
  const empty = new Store(':memory:'); empty.set('instanceId', randomUUID()); try { const input = dayInputFromWorkQueue(inspectLocalWorkQueue(empty, clock)); assert.deepEqual({ key: input.key, phase: input.phase, candidates: input.candidates, queued: input.coverage.queued, partial: input.coverage.partial }, { key: null, phase: 'empty', candidates: [], queued: null, partial: false }); } finally { empty.close(); }
});
test('vacío válido (cero tareas en cola) ≠ copia sin captura; importada conserva identidad y estado', () => {
  const snapshot = makeFixture('agency'); for (const r of snapshot.records) if (r.entity === 'tasks') r.values.status = 'completed';
  const done = copy(snapshot); try { const input = dayInputFromWorkQueue(inspectLocalWorkQueue(done, clock)); assert.equal(input.candidates.length, 0); assert.equal(input.coverage.queued, 0, 'cero exacto, no null'); assert.notEqual(input.key, null); assert.equal(input.coverage.partial, false); } finally { done.close(); }
  const imported = copy(makeFixture('agency'), false); try { const input = dayInputFromWorkQueue(inspectLocalWorkQueue(imported, clock)); assert.equal(input.phase, 'imported'); assert.ok(input.key); assert.ok(input.candidates.length > 0); } finally { imported.close(); }
});
test('página recortada: por límite de tareas y por bytes se declaran por separado; notConsidered = no devueltas y el aviso no habla de cerradas', () => {
  const { snapshot } = big({ taskCount: 230 }); const store = copy(snapshot);
  try {
    const byLimit = dayInputFromWorkQueue(inspectLocalWorkQueue(store, clock));
    assert.equal(byLimit.candidates.length, 200); assert.ok(byLimit.notConsidered > 0); assert.equal(byLimit.coverage.omittedByLimit, byLimit.notConsidered); assert.equal(byLimit.coverage.partial, true);
    assert.match(byLimit.coverage.notice!, /fuera del límite de 200/); assert.match(byLimit.coverage.notice!, /no significa que las demás estén cerradas/); assert.doesNotMatch(byLimit.coverage.notice!, /completada/i);
    const small = dayInputFromWorkQueue(inspectLocalWorkQueue(store, clock, { byteBudget: 20_000 }));
    assert.ok(small.coverage.omittedByBytes > 0 && small.candidates.length < 200); assert.equal(small.notConsidered, small.coverage.omittedByLimit + small.coverage.omittedByBytes); assert.match(small.coverage.notice!, /tamaño de la respuesta/);
  } finally { store.close(); }
});
test('fila que SOLA no cabe: se declara aparte y no se fabrica ni se trunca un ID; el resto sigue', () => {
  const { snapshot, taskId } = big({ refs: 3, idLength: 9_900 }); const store = copy(snapshot);
  try {
    const input = dayInputFromWorkQueue(inspectLocalWorkQueue(store, clock, { byteBudget: 20_000 }));
    assert.equal(input.coverage.omittedOversize, 1); assert.match(input.coverage.notice!, /demasiado grande para mostrarse aquí/); assert.ok(!input.candidates.some(c => c.id === taskId)); assert.ok(input.candidates.length > 0);
    assert.ok(!JSON.stringify(input).includes('x'.repeat(100)), 'ni un fragmento del ID omitido');
  } finally { store.close(); }
});
test('IDs largos: los datos viajan íntegros y solo la presentación los recorta, con su longitud real', () => {
  const { snapshot } = big({ taskCount: 2, label: '-' + 'z'.repeat(2_000) }); const store = copy(snapshot);
  try {
    const input = dayInputFromWorkQueue(inspectLocalWorkQueue(store, clock)), long = input.candidates.filter(c => c.id.length > 2_000);
    assert.equal(long.length, 2); assert.ok(long.every(c => c.id.length === 'frontera-000'.length + 2_001)); assert.equal(new Set(input.candidates.map(x => x.id)).size, input.candidates.length);
  } finally { store.close(); }
  const id = 'a'.repeat(100); assert.equal(shortId(id), 'a'.repeat(48) + '… (100 caracteres)'); assert.equal(shortId('corto'), 'corto');
  const pair = 'a'.repeat(47) + '😀' + 'b'.repeat(10); assert.doesNotMatch(shortId(pair), /[\ud800-\udbff]…/, 'no parte un par sustituto'); assert.match(shortId(pair), /\(\d+ caracteres\)$/);
});
test('asociaciones: `missing` se cuenta por cobertura aunque la lista esté recortada; las ausentes se muestran recortadas y con «y N más»; not-captured NO es «falta»; lo no mostrado se declara', () => {
  const { snapshot, taskId, ghostIds } = big({ refs: 60, ghosts: 5 }); const store = copy(snapshot);
  try {
    for (const id of ghostIds) store.db.prepare('DELETE FROM records WHERE entity=? AND id=?').run('contacts', id);
    const input = dayInputFromWorkQueue(inspectLocalWorkQueue(store, clock)), candidate = input.candidates.find(c => c.id === taskId)!, notes = input.referenceNotes[taskId];
    assert.equal(notes.missing, 5); assert.ok(notes.notShown > 0, 'hay asociaciones que la página no muestra'); assert.equal(candidate.missingReferences.length, 4, 'tres ausentes y «y 2 más»'); assert.equal(candidate.missingReferences.at(-1), 'y 2 más');
    assert.match(candidate.reasons.join(' '), /asociaciones no se muestran/);
    // Jornada real: la tarea con asociaciones ausentes avisa y se mantiene como candidata.
    const plan = buildContinuityDay({ candidates: input.candidates, budgetMinutes: 60, estimates: { [taskId]: 10 }, decisions: { ...emptyDecisions(), manual: [{ id: taskId, pinned: true }] }, notConsidered: input.notConsidered });
    assert.ok(plan.chosen.find(e => e.id === taskId)!.warnings.some(w => w.kind === 'missing-reference'));
  } finally { store.close(); }
  // not-captured (rama defensiva: solo con una copia alterada fuera de Store): no es «falta», es «no comprobable».
  const store2 = copy(); try {
    const snapshot2 = structuredClone(store2.snapshot!); snapshot2.entities = snapshot2.entities.filter(e => e.id !== 'deals'); store2.set('snapshot', snapshot2); store2.db.prepare('DELETE FROM records WHERE entity=?').run('deals');
    const input = dayInputFromWorkQueue(inspectLocalWorkQueue(store2, clock)), withDeal = input.candidates.filter(c => /no se puede(n)? comprobar/.test(c.reasons.join(' ')));
    assert.ok(withDeal.length > 0); for (const c of withDeal) { assert.equal(input.referenceNotes[c.id].unverifiable > 0, true); assert.equal(c.missingReferences.length, 0, 'no comprobable no es falta'); }
  } finally { store2.close(); }
});
test('homónimas: dos tareas con el mismo nombre son dos candidatos con IDs distintos y la cola no las funde', () => {
  const snapshot = makeFixture('agency'); for (const id of ['task-2', 'task-3']) { const row = snapshot.records.find(r => r.entity === 'tasks' && r.id === id)!; row.values.subject = 'Llamar a Ana'; row.values.status = 'pending'; }
  const store = copy(snapshot); try { const input = dayInputFromWorkQueue(inspectLocalWorkQueue(store, clock)), same = input.candidates.filter(c => c.label.startsWith('Llamar a Ana')); assert.deepEqual(same.map(c => c.id).sort(), ['task-2', 'task-3']); } finally { store.close(); }
});
test('función pura: no muta la entrada, es determinista y el resultado es independiente de ella', () => {
  const store = copy(); try {
    const work = inspectLocalWorkQueue(store, clock), frozen = JSON.stringify(work), first = dayInputFromWorkQueue(structuredClone(work));
    const input = dayInputFromWorkQueue(work); assert.equal(JSON.stringify(work), frozen, 'la entrada no cambia'); assert.deepEqual(input, first);
    input.candidates[0].label = 'cambiado'; input.candidates[0].reasons.push('x'); assert.equal(JSON.stringify(work), frozen, 'mutar el resultado no toca la entrada');
    assert.equal(LocalWorkQueueSchema.safeParse(work).success, true);
  } finally { store.close(); }
});
test('un código de motivo que la interfaz no conoce no se inventa: se omite su texto y la tarea sigue siendo candidata', () => {
  const store = copy(); try {
    const work = structuredClone(inspectLocalWorkQueue(store, clock)); work.tasks[0].reasonCodes = [...work.tasks[0].reasonCodes, 'codigo-del-futuro'];
    const input = dayInputFromWorkQueue(work); assert.equal(input.candidates.length, work.tasks.length); assert.ok(!input.candidates[0].reasons.some(text => /futuro/.test(text)));
  } finally { store.close(); }
});
test('estado desconocido e instantes: «unknown» no se planifica sola y el vencimiento con hora se muestra por su día local de Madrid, igual que la cola', () => {
  const snapshot = makeFixture('agency'); const entity = snapshot.entities.find(e => e.id === 'tasks')!; entity.fields.find(f => f.key === 'due_date')!.type = 'datetime';
  for (const r of snapshot.records) if (r.entity === 'tasks') r.values.due_date = '2026-11-02T23:30:00Z';   // 00:30 del 3/11 en Madrid
  const store = copy(snapshot); try {
    store.db.prepare('UPDATE records SET value=json_set(value, ?, ?) WHERE entity=? AND id=?').run('$.values.status', 'estado-que-no-existe', 'tasks', 'task-2');
    const work = inspectLocalWorkQueue(store, clock), input = dayInputFromWorkQueue(work), queue = buildResponseQueue({ spec: store.spec!, records: store.records(), evaluatedAt: NOW, horizonHours: 24, limit: 200 });
    const unknown = input.candidates.find(c => c.id === 'task-2')!; assert.equal(unknown.statusKnown, false); assert.ok(input.candidates.some(c => c.statusKnown));
    const instants = input.candidates.filter(c => c.dueText !== null); assert.ok(instants.length > 0); assert.ok(instants.every(c => c.dueText === '2026-11-03'), 'día local de Madrid, no el instante UTC');
    assert.deepEqual(input.candidates.map(c => c.dueText), candidatesFromQueue(queue).map(c => c.dueText));
  } finally { store.close(); }
});
test('IDs de tarea que son nombres de propiedad (`__proto__`, `constructor`, `toString`): entradas propias en el índice, sin tocar el prototipo y conservadas al serializar', () => {
  const snapshot = makeFixture('agency'), rename: Record<string, string> = { 'task-2': '__proto__', 'task-3': 'constructor', 'task-4': 'toString' };
  for (const record of snapshot.records) if (record.entity === 'tasks' && rename[record.id]) record.id = rename[record.id];
  for (const link of snapshot.links) { if (link.fromEntity === 'tasks' && rename[link.fromId]) link.fromId = rename[link.fromId]; if (link.toEntity === 'tasks' && rename[link.toId]) link.toId = rename[link.toId]; }
  const store = copy(snapshot); try {
    const work = inspectLocalWorkQueue(store, clock); assert.equal(LocalWorkQueueSchema.safeParse(work).success, true);
    const names = Object.values(rename), input = dayInputFromWorkQueue(work);
    assert.equal(Object.getPrototypeOf(input.referenceNotes), null, 'diccionario sin prototipo');
    for (const id of names) {
      assert.ok(input.candidates.some(c => c.id === id), id + ' sigue siendo candidato con su ID íntegro'); assert.equal(Object.hasOwn(input.referenceNotes, id), true, id + ' tiene entrada PROPIA');
      assert.deepEqual(referenceNoteOf(input.referenceNotes, id), { unverifiable: 0, notShown: 0, missing: 0 });
    }
    assert.equal(referenceNoteOf(input.referenceNotes, 'valueOf'), null, 'un ID ausente no devuelve nada heredado'); assert.equal(referenceNoteOf(input.referenceNotes, 'hasOwnProperty'), null);
    // Serializado y vuelto a leer: las tres entradas siguen ahí (como propias) y el prototipo del objeto leído no cambió.
    const roundTrip = JSON.parse(JSON.stringify(input)) as typeof input;
    for (const id of names) { assert.equal(Object.hasOwn(roundTrip.referenceNotes, id), true, id + ' sobrevive a JSON'); assert.deepEqual(referenceNoteOf(roundTrip.referenceNotes, id), { unverifiable: 0, notShown: 0, missing: 0 }); }
    assert.equal(Object.getPrototypeOf(roundTrip.referenceNotes), Object.prototype); assert.deepEqual(Object.keys(roundTrip.referenceNotes).sort(), Object.keys(input.referenceNotes).sort());
    // Con asociaciones ausentes bajo un ID peligroso: la nota cuenta lo suyo y no contamina a otras.
    assert.equal(input.candidates.length, work.tasks.length); assert.equal(new Set(Object.keys(input.referenceNotes)).size, input.candidates.length);
  } finally { store.close(); }
});
