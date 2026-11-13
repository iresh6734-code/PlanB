import test from 'node:test';
import assert from 'node:assert/strict';
import { makeDemoSpec, makeFixture } from '../shared/fixtures.js';
import { buildResponseQueue } from '../shared/response-queue.js';
import { buildRescuePlan } from '../shared/rescue-plan.js';
import {
  blockTask, buildContinuityDay, candidatesFromQueue, candidatesFromToday, departedFromQueue, emptyDecisions, MISSING_REFERENCE_ACTION, moveTask, pickTask, printableDay, setPinned, skipTask, unpickTask, unskipTask,
  type DayCandidate, type DayDecisions, type DayInput,
} from '../shared/continuity-day.js';

// Unidad 205 · modelo puro de la Jornada de continuidad. Sin red; las entradas se congelan para probar que nada se muta.
const deepFreeze = <T,>(value: T): T => { if (value && typeof value === 'object') { Object.freeze(value); for (const inner of Object.values(value)) deepFreeze(inner); } return value; };
const cand = (id: string, over: Partial<DayCandidate> = {}): DayCandidate => ({ id, label: 'Tarea ' + id, bucket: 'overdue', statusKnown: true, dueText: '2026-11-01', reasons: ['El día de vencimiento es anterior a hoy en Madrid.'], missingReferences: [], ...over });
const list = [cand('a'), cand('b'), cand('c', { bucket: 'due-in-window' }), cand('d', { bucket: 'later' }), cand('e', { bucket: 'needs-review', statusKnown: false })];
const est = { a: 10, b: 20, c: 15, d: 5 };
const day = (over: Partial<DayInput> = {}) => buildContinuityDay(deepFreeze({ candidates: list, budgetMinutes: 30, estimates: est, decisions: emptyDecisions(), ...over }) as DayInput);
const ids = (plan: ReturnType<typeof day>) => plan.chosen.map(entry => entry.id);

test('sin decisiones: reutiliza la heurística voraz de buildRescuePlan (mismas inclusiones y mismos motivos)', () => {
  const plan = day(), queue = { items: list.map(c => ({ id: c.id, label: c.label, bucket: c.bucket, status: c.statusKnown ? 'open' : 'unknown' })), summary: { totalQueued: list.length } } as never;
  const reference = buildRescuePlan(queue, { budgetMinutes: 30, estimates: est });
  assert.deepEqual(ids(plan), reference.included.map(e => e.id)); assert.deepEqual(plan.excluded.map(e => [e.id, e.reason]), reference.excluded.map(e => [e.id, e.reason]));
  assert.deepEqual(ids(plan), ['a', 'b']); assert.equal(plan.usedMinutes, 30); assert.equal(plan.remainingMinutes, 0);
  assert.deepEqual(plan.excluded.map(e => [e.id, e.reason]), [['c', 'exceeds-remaining'], ['d', 'exceeds-remaining'], ['e', 'unknown-status']]);
  assert.ok(plan.chosen.every(entry => entry.why.length > 0 && entry.origin === 'auto'));
});

test('fijar una tarea la pone primero y recalcula lo automático con el tiempo que queda', () => {
  const plan = day({ decisions: pickTask(emptyDecisions(), 'c', true) });
  assert.deepEqual(ids(plan), ['c', 'a', 'd'], 'b (20 min) ya no cabe, pero la d, más corta y posterior, sí'); assert.equal(plan.chosen[0].origin, 'pinned'); assert.equal(plan.chosen[0].startMinute, 0); assert.equal(plan.chosen[1].startMinute, 15); assert.equal(plan.chosen[2].startMinute, 25); assert.equal(plan.usedMinutes, 30);
  assert.equal(plan.excluded.find(e => e.id === 'b')!.reason, 'exceeds-remaining');
});

test('lo fijado que desborda el tiempo NO se descarta: se incluye y se avisa, y entra en «por decidir»', () => {
  const plan = day({ budgetMinutes: 20, decisions: pickTask(pickTask(emptyDecisions(), 'a', true), 'b', true) });
  assert.deepEqual(ids(plan), ['a', 'b']); assert.equal(plan.overrunMinutes, 10); assert.equal(plan.remainingMinutes, 0);
  assert.equal(plan.chosen[1].warnings[0].kind, 'overrun'); assert.match(plan.chosen[1].warnings[0].text, /10 min de más/);
  assert.ok(plan.needsDecision.some(item => item.id === 'b' && item.kind === 'overrun'));
  assert.ok(!plan.excluded.some(e => e.id === 'a' || e.id === 'b'));
});

test('cambiar presupuesto o filtro conserva TODAS las decisiones manuales y su orden', () => {
  let decisions: DayDecisions = emptyDecisions();
  decisions = pickTask(decisions, 'd'); decisions = pickTask(decisions, 'c', true); decisions = skipTask(decisions, 'a'); decisions = blockTask(decisions, 'b', 'Espera al cliente');
  const frozen = JSON.stringify(decisions), owners = { a: 'ana', b: 'ana', c: 'luis', d: 'luis', e: 'ana' };
  for (const budgetMinutes of [10, 20, 45, 120, 480]) for (const ownerFilter of [null, 'ana', 'luis']) {
    const plan = day({ budgetMinutes, decisions, owners, ownerFilter });
    assert.deepEqual(plan.chosen.filter(e => e.origin !== 'auto').map(e => e.id), ['c', 'd'], 'fijada primero, luego la elegida: mismas en cualquier presupuesto/filtro');
    assert.ok(plan.excluded.some(e => e.id === 'a' && e.reason === 'skipped-by-person'), 'el descarte persiste');
    assert.equal(JSON.stringify(decisions), frozen, 'las decisiones no se mutan');
  }
  assert.equal(day({ decisions, budgetMinutes: 480 }).excluded.find(e => e.id === 'b')!.reason, 'blocked-by-operator');
});

test('el cálculo no muta ninguna entrada (todo congelado) y es determinista', () => {
  const a = day({ decisions: pickTask(emptyDecisions(), 'c', true) }), b = day({ decisions: pickTask(emptyDecisions(), 'c', true) });
  assert.deepEqual(a, b);
});

test('duración desconocida: se separa de lo que no cabe, y lo elegido sin estimación entra sin contar tiempo', () => {
  const plan = day({ estimates: { a: 10 }, decisions: pickTask(emptyDecisions(), 'b') });
  const b = plan.chosen.find(e => e.id === 'b')!; assert.equal(b.minutes, null); assert.equal(b.startMinute, null); assert.ok(b.warnings.some(w => w.kind === 'unknown-duration'));
  assert.equal(plan.usedMinutes, 10, 'lo desconocido no suma cero «inventado»: simplemente no cuenta y se avisa');
  assert.deepEqual(plan.unknownDuration.map(item => item.id).sort(), ['b', 'c', 'd', 'e']);
  assert.ok(plan.excluded.filter(e => e.reason === 'no-estimate').map(e => e.id).sort().join() === 'c,d'); assert.ok(!plan.excluded.some(e => e.id === 'c' && e.reason === 'exceeds-remaining'));
  assert.ok(plan.needsDecision.some(item => item.id === 'c' && item.kind === 'no-estimate'));
});

test('estado desconocido y referencias que faltan piden decisión y avisan, sin inferir dependencias', () => {
  const withRef = [cand('a', { missingReferences: ['contacts · contact-9'] }), cand('b')];
  const plan = buildContinuityDay({ candidates: withRef, budgetMinutes: 30, estimates: { a: 10, b: 10 }, decisions: emptyDecisions() });
  assert.ok(plan.chosen.find(e => e.id === 'a')!.warnings.some(w => w.kind === 'missing-reference' && /contact-9/.test(w.text)), 'se planifica, pero se avisa');
  assert.ok(plan.needsDecision.some(item => item.id === 'a' && item.kind === 'missing-reference'));
  assert.ok(day().needsDecision.some(item => item.id === 'e' && item.kind === 'unknown-status'));
});

test('homónimas: dos tareas con el mismo título son distintas por ID en el plan y en la vista imprimible', () => {
  const twins = [cand('x-1', { label: 'Llamar a Ana' }), cand('x-2', { label: 'Llamar a Ana' })];
  const plan = buildContinuityDay({ candidates: twins, budgetMinutes: 30, estimates: { 'x-1': 10, 'x-2': 10 }, decisions: pickTask(emptyDecisions(), 'x-2', true) });
  assert.deepEqual(ids(plan), ['x-2', 'x-1']); assert.deepEqual(printableDay(plan).lines.map(l => l.id), ['x-2', 'x-1']);
  assert.throws(() => buildContinuityDay({ candidates: [twins[0], twins[0]], budgetMinutes: 30, estimates: {}, decisions: emptyDecisions() }), /duplicada/);
});

test('reordenar: mover cambia el orden dentro del grupo, no el conjunto, y no cruza de fijadas a no fijadas', () => {
  let d = emptyDecisions(); d = pickTask(d, 'a', true); d = pickTask(d, 'b', true); d = pickTask(d, 'c'); d = pickTask(d, 'd');
  assert.deepEqual(day({ decisions: moveTask(d, 'b', -1), budgetMinutes: 480 }).chosen.slice(0, 4).map(e => e.id), ['b', 'a', 'c', 'd']);
  assert.deepEqual(day({ decisions: moveTask(d, 'b', 1), budgetMinutes: 480 }).chosen.slice(0, 4).map(e => e.id), ['a', 'b', 'c', 'd'], 'la última fijada no baja a las no fijadas');
  assert.deepEqual(day({ decisions: moveTask(d, 'd', -1), budgetMinutes: 480 }).chosen.slice(0, 4).map(e => e.id), ['a', 'b', 'd', 'c']);
  assert.deepEqual(day({ decisions: setPinned(d, 'c', true), budgetMinutes: 480 }).chosen.slice(0, 3).map(e => e.id), ['a', 'b', 'c']);
  assert.equal(moveTask(d, 'zzz', 1), d, 'una tarea desconocida no cambia nada');
});

test('quitar, descartar y volver a incluir: cada gesto es reversible y solo cambia lo suyo', () => {
  let d = pickTask(emptyDecisions(), 'c', true); d = unpickTask(d, 'c'); assert.deepEqual(d.manual, []);
  d = skipTask(d, 'a'); assert.ok(day({ decisions: d }).excluded.some(e => e.id === 'a' && e.reason === 'skipped-by-person')); d = unskipTask(d, 'a'); assert.deepEqual(ids(day({ decisions: d })), ['a', 'b']);
  assert.deepEqual(skipTask(pickTask(emptyDecisions(), 'a'), 'a').manual, [], 'descartar quita la elección');
  assert.deepEqual(pickTask(skipTask(emptyDecisions(), 'a'), 'a').skipped, [], 'elegir quita el descarte');
});

test('filtro por responsable: solo con dato real; sin dato no hay filtro, y lo elegido a mano sobrevive con aviso', () => {
  assert.deepEqual(ids(day({ ownerFilter: 'ana' })), ['a', 'b'], 'sin mapa de responsables el filtro no hace nada');
  const owners = { a: 'luis', b: 'ana', c: 'ana', d: 'ana', e: 'ana' };
  const plan = day({ owners, ownerFilter: 'ana', decisions: pickTask(emptyDecisions(), 'a') });
  assert.ok(plan.chosen.find(e => e.id === 'a')!.warnings.some(w => w.kind === 'other-owner')); assert.deepEqual(ids(plan), ['a', 'b']);
  assert.equal(day({ owners, ownerFilter: 'ana' }).excluded.find(e => e.id === 'a')!.reason, 'owner-filter');
});

test('resultados pendientes: solo el estado de guardados sin resolver; la tarea no se planifica sola y se pide comprobarla', () => {
  const plan = day({ hints: { a: 'uncertain', b: 'in_flight' } });
  assert.deepEqual(plan.excluded.filter(e => e.reason === 'outcome-pending').map(e => e.id), ['a', 'b']); assert.deepEqual(ids(plan), ['c', 'd']);
  assert.ok(plan.needsDecision.some(item => item.id === 'a' && item.kind === 'pending-save' && /sin resolver/.test(item.detail)));
  assert.ok(plan.needsDecision.some(item => item.id === 'b' && item.kind === 'pending-save' && /en curso/.test(item.detail)));
  assert.ok(day({ hints: { a: 'uncertain' }, decisions: pickTask(emptyDecisions(), 'a') }).chosen[0].warnings.some(w => w.kind === 'pending-save'), 'si la persona la elige, se avisa');
  const text = JSON.stringify(plan); assert.doesNotMatch(text, /uncertain":"|attempt|patch/i, 'el plan no arrastra datos del intento');
});

test('elecciones cuya tarea ya no está en la cola se señalan como «salidas», sin decir que se completaron', () => {
  const plan = buildContinuityDay({ candidates: list.slice(1), budgetMinutes: 30, estimates: est, decisions: pickTask(emptyDecisions(), 'a', true) });
  assert.deepEqual(plan.departed, ['a']); assert.ok(!plan.chosen.some(e => e.id === 'a')); assert.deepEqual(departedFromQueue(['a', 'b'], list.slice(1)), ['a']);
  assert.doesNotMatch(JSON.stringify(plan.limitations), /completad/i);
});

test('presupuesto o estimaciones inválidos: la estimación inválida es desconocida y el presupuesto inválido lanza', () => {
  for (const bad of [0, -1, 1.5, 481, NaN]) assert.throws(() => day({ budgetMinutes: bad }), RangeError);
  const plan = day({ estimates: { a: 3, b: 500, c: 7.5, d: 5 } }); assert.deepEqual(plan.unknownDuration.map(i => i.id).sort(), ['a', 'b', 'c', 'e']); assert.deepEqual(ids(plan), ['d']);
  assert.deepEqual(ids(day({ budgetMinutes: 1, estimates: est })), [], 'con 1 minuto nada cabe: la estimación mínima es 5');
});

test('vista imprimible por lista blanca: solo orden, ID, título, minutos y arranque', () => {
  const plan = day({ decisions: pickTask(emptyDecisions(), 'c', true), hints: { d: 'uncertain' } }), printable = printableDay(plan);
  assert.deepEqual(Object.keys(printable).sort(), ['budgetMinutes', 'lines', 'note', 'title', 'unknownDurations', 'usedMinutes']);
  for (const line of printable.lines) assert.deepEqual(Object.keys(line).sort(), ['id', 'label', 'minutes', 'order', 'startMinute']);
  assert.doesNotMatch(JSON.stringify(printable), /vencimiento|Madrid|contacts|uncertain|reasons|El día/, 'sin motivos, fechas, referencias ni estados');
  assert.deepEqual(printable.lines.map(l => l.order), [1, 2]); assert.match(printable.note, /No indica que las tareas estén guardadas ni completadas/);
});

test('con la cola REAL: el adaptador exacto conserva estado y referencias; el de Hoy es conservador y su texto de referencias coincide con la cola', () => {
  const snapshot = makeFixture('agency'), spec = makeDemoSpec(snapshot), records = snapshot.records.filter(r => r.id !== 'contact-2');   // task-2 pierde su contacto
  const queue = buildResponseQueue({ spec, records, evaluatedAt: Date.parse('2026-11-05T09:00:00Z'), horizonHours: 24, limit: 200 }), exact = candidatesFromQueue(queue);
  assert.equal(exact.length, queue.items.length); const withMissing = exact.find(c => c.id === 'task-2')!; assert.deepEqual(withMissing.missingReferences, ['contacts · contact-2']);
  const today = candidatesFromToday(queue.items.map(item => ({ id: item.id, label: item.label, bucket: item.bucket, due: item.due.localDate ?? item.due.value, reasons: item.reasons.map(r => r.detail), nextAction: item.nextAction })));
  assert.equal(queue.items.find(i => i.id === 'task-2')!.nextAction, MISSING_REFERENCE_ACTION, 'si la cola cambia ese texto, esta prueba avisa');
  assert.ok(today.find(c => c.id === 'task-2')!.missingReferences.length > 0);
  const real = buildContinuityDay({ candidates: exact, budgetMinutes: 60, estimates: Object.fromEntries(exact.slice(0, 6).map(c => [c.id, 10])), decisions: emptyDecisions(), notConsidered: queue.summary.totalQueued - queue.items.length });
  assert.equal(real.chosen.length, 6); assert.equal(real.usedMinutes, 60); assert.ok(real.unknownDuration.length > 0);
});

test('los gestos (fijar, elegir, descartar, bloquear, mover) devuelven decisiones NUEVAS y no mutan las de entrada', () => {
  const base = deepFreeze(pickTask(pickTask(emptyDecisions(), 'a', true), 'b')), snapshot = JSON.stringify(base);
  const results = [pickTask(base, 'c'), unpickTask(base, 'a'), setPinned(base, 'b', true), skipTask(base, 'a'), unskipTask(base, 'a'), blockTask(base, 'a', 'x')];
  moveTask(base, 'a', 1); moveTask(base, 'b', 1);   // sin hueco para moverse: devuelven la misma referencia, sin mutar
  const two = deepFreeze(pickTask(pickTask(emptyDecisions(), 'a'), 'b')); assert.notEqual(moveTask(two, 'b', -1), two); assert.deepEqual(two.manual.map(p => p.id), ['a', 'b']);
  assert.equal(JSON.stringify(base), snapshot); for (const result of results) assert.notEqual(result, base);
});

// ═══ R2 · dictamen 208 ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
test('R2 F1 · una tarea elegida SIN duración hace el saldo INDETERMINADO: subtotal conocido separado, sin «minutos libres» ni inicio exacto para lo que sigue', () => {
  const decisions = pickTask(emptyDecisions(), 'a'), estimates = { b: 25, c: 5 };   // a (elegida) sin estimar; b conocida
  const plan = buildContinuityDay({ candidates: list, budgetMinutes: 30, estimates, decisions });
  assert.deepEqual(plan.chosen.map(e => e.id), ['a', 'b', 'c'], 'se conservan ambas decisiones: la elegida a mano y la propuesta de 25 min');
  assert.equal(plan.usedMinutes, 30, 'subtotal conocido: 25 + 5'); assert.equal(plan.unknownDurations, 1); assert.equal(plan.remainingMinutes, null, 'el saldo NO se anuncia como conocido');
  const [manual, auto] = plan.chosen; assert.equal(manual.minutes, null); assert.equal(manual.startMinute, null); assert.equal(manual.endMinute, null);
  assert.equal(auto.provisional, true); assert.equal(auto.startMinute, null, 'sin comienzo exacto tras la tarea sin duración'); assert.equal(auto.endMinute, null); assert.doesNotMatch(auto.why, /Cabe en el tiempo restante/); assert.match(auto.why, /Propuesta provisional/);
  assert.equal(manual.provisional, false);
  const sole = buildContinuityDay({ candidates: list, budgetMinutes: 30, estimates: { b: 25 }, decisions }); assert.equal(sole.usedMinutes, 25); assert.equal(sole.remainingMinutes, null); assert.equal(sole.unknownDurations, 1);
});
test('R2 F1 · al declarar la duración se recupera el saldo exacto, las posiciones y el aviso de desborde', () => {
  const decisions = pickTask(emptyDecisions(), 'a');
  const exact = buildContinuityDay({ candidates: list, budgetMinutes: 30, estimates: { a: 5, b: 20 }, decisions });
  assert.equal(exact.unknownDurations, 0); assert.equal(exact.remainingMinutes, 5); assert.equal(exact.chosen[0].startMinute, 0); assert.equal(exact.chosen[1].startMinute, 5); assert.ok(exact.chosen.every(e => !e.provisional));
  const over = buildContinuityDay({ candidates: list, budgetMinutes: 20, estimates: { a: 15, b: 10 }, decisions: pickTask(pickTask(emptyDecisions(), 'a'), 'b') });
  assert.equal(over.overrunMinutes, 5); assert.equal(over.remainingMinutes, 0); assert.ok(over.chosen[1].warnings.some(w => w.kind === 'overrun'));
});
test('R2 F1 · con duraciones desconocidas, lo ya estimado que pasa del tiempo es un desborde cierto (cota inferior) y se avisa', () => {
  const plan = buildContinuityDay({ candidates: list, budgetMinutes: 15, estimates: { b: 20 }, decisions: pickTask(pickTask(emptyDecisions(), 'a'), 'b') });
  assert.equal(plan.remainingMinutes, null); assert.equal(plan.overrunMinutes, 5); const b = plan.chosen.find(e => e.id === 'b')!; assert.equal(b.startMinute, null);
  assert.match(b.warnings.find(w => w.kind === 'overrun')!.text, /5 min de más como mínimo/);
});
test('R2 F1 · la lista imprimible usa la misma semántica: subtotal conocido, tareas sin duración y ninguna posición inventada', () => {
  const plan = buildContinuityDay({ candidates: list, budgetMinutes: 30, estimates: { b: 25 }, decisions: pickTask(emptyDecisions(), 'a') }), printable = printableDay(plan);
  assert.equal(printable.usedMinutes, 25); assert.equal(printable.unknownDurations, 1); assert.deepEqual(printable.lines.map(l => [l.id, l.minutes, l.startMinute]), [['a', null, null], ['b', 25, null]]);
});
test('R2 · identificadores de CRM con caracteres especiales (segment/1 y segment:1, record"1 y record1, comillas, corchetes, saltos) se conservan tal cual y no se confunden', () => {
  const ids = ['segment/1', 'segment:1', 'record"1', 'record1', "a'b", 'x]y', 'p q'];
  const candidates = ids.map(id => cand(id)), estimates = Object.fromEntries(ids.map(id => [id, 10]));
  const plan = buildContinuityDay({ candidates, budgetMinutes: 120, estimates, decisions: pickTask(emptyDecisions(), 'record"1', true) });
  assert.deepEqual(plan.chosen.map(e => e.id), ['record"1', ...ids.filter(id => id !== 'record"1')], 'IDs intactos y distintos');
  assert.equal(new Set(plan.chosen.map(e => e.id)).size, ids.length);
});
