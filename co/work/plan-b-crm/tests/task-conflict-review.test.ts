import test from 'node:test';
import assert from 'node:assert/strict';
import { makeDemoSpec, makeFixture } from '../shared/fixtures.js';
import type { CrmRecord, Entity, FieldValue, Rule } from '../shared/model.js';
import type { TaskContext } from '../shared/local-task-focus.js';
import { buildConflictReview, compareIdentity, pendingDecisions, resolveConflictReview, type Choice, type ConflictInput } from '../shared/task-conflict-review.js';

// Unidad 199 · modelo puro del comparador de decisiones. Sin red: datos ficticios de makeFixture. El borrador y las lecturas se congelan para
// comprobar que el modelo no muta sus entradas.
const snapshot = makeFixture('agency'), spec = makeDemoSpec(snapshot), entity = spec.entities.find(e => e.id === 'tasks')!;
const context: TaskContext = { instanceId: 'i-1', snapshotId: 's-1', snapshotName: 'Copia A', capturedAt: '2026-11-02T09:00:00Z', captureStartedAt: null, accountId: null, generatedAt: '2026-11-02T09:00:00Z', isTestData: true, ready: true, runtime: false };
const task = (id = 'task-2', patch: Record<string, FieldValue> = {}): CrmRecord => { const source = snapshot.records.find(r => r.entity === 'tasks' && r.id === id)!; return { ...structuredClone(source), values: { ...structuredClone(source.values), ...patch } }; };
const deepFreeze = <T,>(value: T): T => { if (value && typeof value === 'object') { Object.freeze(value); for (const inner of Object.values(value)) deepFreeze(inner); } return value; };
function input(over: { draft?: Record<string, FieldValue>; current?: Record<string, FieldValue>; currentContext?: Partial<TaskContext>; currentId?: string; entity?: Entity; spec?: ConflictInput['spec']; base?: Record<string, FieldValue> } = {}): ConflictInput {
  const base = task('task-2', over.base ?? {});
  const current = over.currentId ? { ...task(over.currentId, over.current ?? {}) } : { ...task('task-2', { ...(over.base ?? {}), ...(over.current ?? {}) }) };
  return deepFreeze({ entity: over.entity ?? entity, spec: over.spec === undefined ? spec : over.spec, base, baseContext: context, draft: { ...base.values, ...(over.draft ?? {}) }, current, currentContext: { ...context, ...(over.currentContext ?? {}) } });
}
const row = (review: ReturnType<typeof buildConflictReview>, key: string) => review.rows.find(r => r.key === key);

test('clasifica cada campo: propio, ajeno, convergente, en conflicto y sin tocar', () => {
  const review = buildConflictReview(input({
    draft: { subject: 'Asunto mío', due_date: '2026-12-01', status: 'completed', notes: null },   // yo cambio asunto, fecha, estado y vacío las notas
    current: { due_date: '2026-12-01', notes: 'Nota ajena', deal_id: 'deal-5' },
  }));
  assert.deepEqual(review.identity, []);
  assert.equal(row(review, 'subject')!.state, 'mine-only');
  assert.equal(row(review, 'due_date')!.state, 'converged', 'los dos llegaron al mismo valor');
  assert.equal(row(review, 'status')!.state, 'mine-only', 'el estado no cambió fuera: solo lo cambié yo');
  assert.equal(row(review, 'notes')!.state, 'conflict', 'yo las vacié y otra edición las cambió');
  assert.equal(row(review, 'deal_id')!.state, 'theirs-only');
  assert.equal(row(review, 'contact_id'), undefined, 'lo no tocado no genera fila');
  assert.equal(review.untouched, 1); assert.equal(review.hasForeignChanges, true);
});

test('un campo en conflicto no tiene valor preseleccionado y bloquea la propuesta hasta decidir; lo solo mío viene marcado «mío»', () => {
  const review = buildConflictReview(input({ draft: { subject: 'Mío', status: 'completed' }, current: { status: 'completed', notes: 'x' } }));
  const base = buildConflictReview(input({ draft: { subject: 'Mío', notes: 'Mías' }, current: { notes: 'Ajenas' } }));
  assert.equal(row(base, 'notes')!.state, 'conflict'); assert.equal(row(base, 'notes')!.defaultChoice, null); assert.deepEqual(row(base, 'notes')!.options, ['mine', 'current']);
  assert.equal(row(base, 'subject')!.defaultChoice, 'mine');
  assert.deepEqual(pendingDecisions(base, {}), ['notes']);
  const blocked = resolveConflictReview(base, {}); assert.equal(blocked.status, 'undecided'); assert.deepEqual(blocked.pending, ['notes']); assert.equal(blocked.proposal, null);
  assert.equal(resolveConflictReview(base, { subject: 'mine' }).status, 'undecided', 'decidir otro campo no cubre el conflicto');
  assert.equal(row(review, 'status')!.state, 'converged');
});

test('la propuesta toma la versión ACTUAL como base y solo lleva lo que la persona decidió mantener', () => {
  const data = input({ draft: { subject: 'Mío', notes: 'Mías' }, current: { notes: 'Ajenas', deal_id: 'deal-5', status: 'completed' } });
  const review = buildConflictReview(data);
  const mine = resolveConflictReview(review, { notes: 'mine' });
  assert.equal(mine.status, 'ready'); const p = mine.proposal!;
  assert.deepEqual(p.patch, { subject: 'Mío', notes: 'Mías' }); assert.equal(p.baseline.values.deal_id, 'deal-5', 'el cambio ajeno ya está en la base y no se envía'); assert.equal(p.baseline.values.status, 'completed');
  assert.equal(p.values.deal_id, 'deal-5'); assert.deepEqual(p.adopted.sort(), ['deal_id', 'status']); assert.deepEqual(p.discarded, []); assert.equal(p.provenance, 'person-decision');
  assert.deepEqual(p.decisions.map(d => [d.key, d.choice, d.origin]).sort(), [['notes', 'mine', 'person'], ['subject', 'mine', 'default']]);
  const theirs = resolveConflictReview(review, { notes: 'current' }); assert.deepEqual(theirs.proposal!.patch, { subject: 'Mío' }); assert.deepEqual(theirs.proposal!.discarded, ['notes']);
  const none = resolveConflictReview(review, { notes: 'current', subject: 'current' }); assert.equal(none.status, 'noop'); assert.deepEqual(none.proposal!.patch, {}); assert.match(none.message, /no queda nada que guardar/);
});

test('no muta el borrador ni las lecturas de entrada, y la propuesta no comparte referencias con ellas', () => {
  const data = input({ draft: { subject: 'Mío', notes: 'Mías' }, current: { notes: 'Ajenas' } }), before = JSON.stringify(data);
  const review = buildConflictReview(data); const r = resolveConflictReview(review, { notes: 'mine' });
  assert.equal(JSON.stringify(data), before); r.proposal!.baseline.values.subject = 'cambiado'; r.proposal!.values.subject = 'cambiado'; assert.equal(JSON.stringify(data), before);
  assert.notEqual(review.input, data, 'el modelo trabaja sobre su propia copia');
});

test('identidades distintas: sin filas, sin decisiones, sin propuesta; el borrador se conserva y se muestra', () => {
  const cases: Array<[string, Partial<TaskContext>, string]> = [
    ['captura distinta con el MISMO ID', { capturedAt: '2026-11-09T09:00:00Z' }, 'capture'], ['otra captura (ID de captura)', { snapshotId: 's-2' }, 'capture'],
    ['otra instalación', { instanceId: 'i-2' }, 'installation'], ['otra cuenta de origen', { accountId: 'acc-9' }, 'account'], ['aplicación regenerada', { generatedAt: '2026-11-03T09:00:00Z' }, 'generation'],
  ];
  for (const [name, change, kind] of cases) {
    const data = input({ draft: { subject: 'Texto largo que no quiero perder', notes: 'Notas mías' }, currentContext: change });
    const review = buildConflictReview(data);
    assert.ok(review.identity.some(p => p.kind === kind), name); assert.deepEqual(review.rows, [], name + ': sin mezcla');
    assert.deepEqual(review.preserved.map(l => l.key).sort(), ['notes', 'subject'], name + ': lo escrito se conserva');
    const r = resolveConflictReview(review, { subject: 'mine' }); assert.equal(r.status, 'identity-mismatch'); assert.equal(r.proposal, null);
  }
});

test('homónimas: dos tareas con el mismo título pero distinto ID no son la misma; el título nunca decide', () => {
  const data = input({ currentId: 'task-6', draft: { notes: 'Mías' } });
  const homonym = { ...data, current: { ...data.current, values: { ...data.current.values, subject: data.base.values.subject } } };
  const problems = compareIdentity(homonym); assert.deepEqual(problems.map(p => p.kind), ['task']); assert.match(problems[0].message, /task-6/);
  const review = buildConflictReview(homonym); assert.deepEqual(review.rows, []); assert.equal(resolveConflictReview(review, {}).status, 'identity-mismatch');
  assert.deepEqual(compareIdentity(input()), [], 'la misma tarea y la misma copia coinciden');
});

test('vacío y null son lo mismo; vaciar un campo es un cambio propio y se envía como null', () => {
  const same = buildConflictReview(input({ base: { notes: '' }, draft: { notes: null }, current: { notes: null } }));
  assert.equal(row(same, 'notes'), undefined, '«» y null no son un cambio');
  const cleared = buildConflictReview(input({ base: { notes: 'Algo' }, draft: { notes: '' } }));
  assert.equal(row(cleared, 'notes')!.state, 'mine-only'); const r = resolveConflictReview(cleared, {}); assert.deepEqual(r.proposal!.patch, { notes: null });
  const theirsEmpty = buildConflictReview(input({ base: { notes: 'Algo' }, draft: { notes: 'Mío' }, current: { notes: '' } }));
  assert.equal(row(theirsEmpty, 'notes')!.state, 'conflict', 'otra edición la dejó vacía: conflicto con lo mío');
});

test('referencias: se compara el ID, se muestra como «entidad · id» y un cambio propio sin conflicto se puede mantener', () => {
  const review = buildConflictReview(input({ draft: { contact_id: 'contact-9' }, current: { contact_id: 'contact-4' } }));
  const r = row(review, 'contact_id')!; assert.equal(r.state, 'conflict'); assert.equal(r.seen, 'contact-2'); assert.equal(r.proposed, 'contact-9'); assert.equal(r.now, 'contact-4');
  const keep = resolveConflictReview(review, { contact_id: 'mine' }); assert.equal(keep.status, 'ready'); assert.equal(keep.proposal!.patch.contact_id, 'contact-9');
});

test('fechas: una fecha civil inválida no se puede aplicar y se señala como incompatible, conservando la actual', () => {
  const review = buildConflictReview(input({ draft: { due_date: '2026-02-31' }, current: { due_date: '2026-11-30' } }));
  const r = row(review, 'due_date')!; assert.equal(r.state, 'incompatible'); assert.deepEqual(r.options, ['current']); assert.equal(r.defaultChoice, 'current'); assert.match(r.reason, /fecha válida/);
  const resolved = resolveConflictReview(review, {}); assert.equal(resolved.status, 'noop'); assert.deepEqual(resolved.proposal!.decisions, [{ key: 'due_date', choice: 'current', origin: 'forced' }]);
  assert.equal(review.preserved.find(l => l.key === 'due_date')!.value, '31/2/2026', 'lo escrito se sigue viendo, con el formato de la ficha');
});

test('enumerado que ya no existe en la versión actual, campo de solo lectura y campo que ya no existe: incompatibles, nunca enviados', () => {
  const withoutArchived = buildConflictReview(input({ draft: { status: 'archived' } })); assert.equal(row(withoutArchived, 'status')!.state, 'incompatible'); assert.match(row(withoutArchived, 'status')!.reason, /opción válida/);
  const readOnly: Entity = { ...entity, fields: entity.fields.map(f => f.key === 'notes' ? { ...f, readOnly: true } : f) };
  const ro = buildConflictReview(input({ entity: readOnly, draft: { notes: 'forzado' } })); assert.equal(row(ro, 'notes')!.state, 'incompatible'); assert.match(row(ro, 'notes')!.reason, /solo lectura/);
  const orphan = buildConflictReview(input({ draft: { campo_antiguo: 'valor' } })); const o = row(orphan, 'campo_antiguo')!; assert.equal(o.state, 'incompatible'); assert.equal(o.field, null); assert.match(o.reason, /ya no existe/);
  for (const review of [withoutArchived, ro, orphan]) { const r = resolveConflictReview(review, {}); assert.equal(r.status, 'noop'); assert.deepEqual(r.proposal!.patch, {}); }
});

test('texto muy largo: se compara, se conserva entero y respeta el límite del servidor', () => {
  const big = 'ñ'.repeat(9_000) + '<img src=x onerror=alert(1)>', other = 'a'.repeat(9_500);
  const review = buildConflictReview(input({ draft: { notes: big }, current: { notes: other } }));
  assert.equal(row(review, 'notes')!.state, 'conflict'); assert.equal(review.preserved.find(l => l.key === 'notes')!.value, big);
  const ok = resolveConflictReview(review, { notes: 'mine' }); assert.equal(ok.status, 'ready'); assert.equal(ok.proposal!.patch.notes, big);
  const tooLong = buildConflictReview(input({ draft: { notes: 'x'.repeat(10_001) } })); assert.equal(row(tooLong, 'notes')!.state, 'incompatible'); assert.match(row(tooLong, 'notes')!.reason, /demasiado largo/);
});

test('una regla entre campos que solo falla al combinar las decisiones se señala (no se envía una propuesta que el servidor rechazaría)', () => {
  const rule: Rule = { id: 'done-needs-notes', entity: 'tasks', kind: 'conditional_required', field: 'notes', value: null, whenField: 'status', whenValue: 'completed', origin: 'configuration', description: 'Explica el resultado antes de completar.', evidence: 'prueba' };
  const strict = { ...spec, rules: [...spec.rules, rule] };
  const review = buildConflictReview(input({ spec: strict, base: { notes: null }, draft: { status: 'completed' } }));
  const r = resolveConflictReview(review, {}); assert.equal(r.status, 'invalid'); assert.equal(r.issues.notes, 'Explica el resultado antes de completar.'); assert.deepEqual(r.proposal!.patch, { status: 'completed' });
  const fixed = buildConflictReview(input({ spec: strict, base: { notes: null }, draft: { status: 'completed', notes: 'Hecho' } })); assert.equal(resolveConflictReview(fixed, {}).status, 'ready');
  // Una incidencia que ya tenía la versión actual (sin relación con las decisiones) no bloquea.
  const preexisting = buildConflictReview(input({ spec: strict, base: { status: 'completed', notes: null }, current: { status: 'completed', notes: null }, draft: { subject: 'Nuevo asunto' } }));
  assert.equal(resolveConflictReview(preexisting, {}).status, 'ready', 'la regla ya incumplida en la versión actual no es culpa de esta decisión');
});

test('sin esquema validable (copia no activada) no se propone nada', () => {
  const review = buildConflictReview(input({ spec: null, draft: { subject: 'Mío' } }));
  assert.equal(row(review, 'subject')!.state, 'incompatible', 'sin esquema no se puede comprobar el valor'); assert.match(row(review, 'subject')!.reason, /no está activada/);
  assert.equal(resolveConflictReview(review, {}).proposal!.patch.subject, undefined);
});

test('el borrador puede ser parcial: lo que falta es «sin cambio» y da el mismo resultado que el completo', () => {
  const full = input({ draft: { subject: 'Mío' }, current: { notes: 'Ajena' } }), partial = { ...full, draft: { subject: 'Mío' } };
  const a = resolveConflictReview(buildConflictReview(full), {}), b = resolveConflictReview(buildConflictReview(partial), {});
  assert.deepEqual(a.proposal!.patch, b.proposal!.patch); assert.deepEqual(a.proposal!.patch, { subject: 'Mío' }); assert.deepEqual(a.proposal!.adopted, ['notes']);
});

test('sin cambios ajenos: no hay nada que comparar, y una decisión cambia solo lo decidido (no reabre otros campos)', () => {
  const review = buildConflictReview(input({ draft: { subject: 'Mío', status: 'completed' } }));
  assert.equal(review.hasForeignChanges, false); assert.deepEqual(review.rows.map(r => r.state), ['mine-only', 'mine-only']);
  const r = resolveConflictReview(review, { status: 'current' }); assert.deepEqual(r.proposal!.patch, { subject: 'Mío' }); assert.deepEqual(r.proposal!.discarded, ['status']);
});

test('una decisión no sobrescribe el cambio ajeno: elegir «mío» en un campo no toca los que solo cambió la otra edición', () => {
  const review = buildConflictReview(input({ draft: { notes: 'Mías' }, current: { notes: 'Ajenas', status: 'completed', due_date: '2026-12-24' } }));
  const p = resolveConflictReview(review, { notes: 'mine' }).proposal!;
  assert.deepEqual(p.patch, { notes: 'Mías' }); assert.equal(p.values.status, 'completed'); assert.equal(p.values.due_date, '2026-12-24');
  const choices: Record<string, Choice> = { notes: 'mine', status: 'mine' as Choice };   // elegir sobre un campo sin decisión se ignora: nadie puede forzar «mío» sobre un cambio ajeno
  assert.deepEqual(resolveConflictReview(review, choices).proposal!.patch, { notes: 'Mías' });
});

// ═══ R2 · dictamen 204 ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
const withField = (key: string, base: string, mine: string, theirs: string) => {
  const field = { key, label: 'Campo ' + key, type: 'text' as const, required: false, readOnly: false, options: [], referenceEntity: null };
  const e: Entity = { ...entity, fields: [...entity.fields, field] }, s = { ...spec, entities: spec.entities.map(x => x.id === 'tasks' ? e : x) };
  const data = input({ entity: e, spec: s, base: { [key]: base }, draft: { [key]: mine }, current: { [key]: theirs } });
  return { data, e, s };
};
test('R2 F1 · claves de campo que coinciden con propiedades heredadas de Object (constructor, toString, hasOwnProperty): conflicto real que exige elección, no un «incompatible»', () => {
  for (const key of ['constructor', 'toString', 'hasOwnProperty', 'valueOf']) {
    const { data } = withField(key, 'Original', 'Mi versión', 'Versión ajena'); const review = buildConflictReview(data), r = row(review, key)!;
    assert.equal(r.state, 'conflict', key); assert.equal(r.defaultChoice, null); assert.deepEqual(r.options, ['mine', 'current']); assert.equal(r.reason.includes('function'), false);
    assert.equal(resolveConflictReview(review, {}).status, 'undecided', key + ': sin decidir');
    for (const bad of ['banana', 'MINE', '', null, 1, {}, ['mine']]) assert.equal(resolveConflictReview(review, { [key]: bad as never }).status, 'undecided', key + ': elección inválida ' + JSON.stringify(bad));
    assert.equal(resolveConflictReview(review, Object.fromEntries([[key, 'mine']])).proposal!.patch[key], 'Mi versión'); assert.equal(resolveConflictReview(review, Object.fromEntries([[key, 'current']])).status, 'noop');
    assert.deepEqual(pendingDecisions(review, {}), [key], 'los valores heredados no cuentan como decididos');
  }
});
test('R2 F1 · un campo con clave heredada que falta en las lecturas no inventa un cambio (lectura por propiedad propia)', () => {
  const field = { key: 'constructor', label: 'Constructor', type: 'text' as const, required: false, readOnly: false, options: [], referenceEntity: null };
  const e: Entity = { ...entity, fields: [...entity.fields, field] }, s = { ...spec, entities: spec.entities.map(x => x.id === 'tasks' ? e : x) };
  const review = buildConflictReview(input({ entity: e, spec: s, draft: { subject: 'Mío' } })); assert.equal(row(review, 'constructor'), undefined);
  assert.deepEqual(resolveConflictReview(review, {}).proposal!.patch, { subject: 'Mío' });
});
test('R2 F2 · una regla entre campos se evalúa sobre la COMBINACIÓN: pasar a pendiente y vaciar las notas es válido; completada con notas vacías no', () => {
  const rule: Rule = { id: 'done-needs-notes', entity: 'tasks', kind: 'conditional_required', field: 'notes', value: null, whenField: 'status', whenValue: 'completed', origin: 'configuration', description: 'Explica el resultado antes de completar.', evidence: 'prueba' };
  const strict = { ...spec, rules: [...spec.rules, rule] };
  const ok = buildConflictReview(input({ spec: strict, base: { status: 'completed', notes: 'Informe anterior' }, draft: { status: 'pending', notes: null } }));
  assert.equal(row(ok, 'notes')!.state, 'mine-only', 'no se marca incompatible: la regla depende del estado elegido'); const r = resolveConflictReview(ok, {}); assert.equal(r.status, 'ready'); assert.deepEqual(r.proposal!.patch, { status: 'pending', notes: null });
  const no = resolveConflictReview(ok, { status: 'current' }); assert.equal(no.status, 'invalid', 'se conserva «completada» y se vacían las notas: la regla lo rechaza'); assert.equal(no.issues.notes, rule.description); assert.deepEqual(no.proposal!.patch, { notes: null });
  const keep = resolveConflictReview(ok, { status: 'current', notes: 'current' }); assert.equal(keep.status, 'noop');
});
test('R2 F2 · los problemas PROPIOS del valor siguen siendo incompatibles (tipo, solo lectura, campo desaparecido, enumerado, longitud)', () => {
  assert.equal(row(buildConflictReview(input({ draft: { due_date: 'mañana' } })), 'due_date')!.state, 'incompatible'); assert.equal(row(buildConflictReview(input({ draft: { status: 'archived' } })), 'status')!.state, 'incompatible');
  assert.equal(row(buildConflictReview(input({ draft: { subject: null } })), 'subject')!.state, 'incompatible', 'obligatorio vacío es un problema propio del campo'); assert.equal(row(buildConflictReview(input({ draft: { notes: 'x'.repeat(10_001) } })), 'notes')!.state, 'incompatible');
});
test('R2 F3 · exige registros y esquema de TAREA: dos contactos con el mismo ID no producen una propuesta', () => {
  const data = input({ draft: { subject: 'Mío' } }), contacts = { ...data, base: { ...data.base, entity: 'contacts' as const }, current: { ...data.current, entity: 'contacts' as const } };
  for (const bad of [contacts, { ...data, current: { ...data.current, entity: 'contacts' as const } }, { ...data, entity: { ...data.entity, id: 'contacts' as const } }]) {
    const review = buildConflictReview(bad); assert.ok(review.identity.some(p => p.kind === 'entity')); assert.deepEqual(review.rows, []); assert.equal(resolveConflictReview(review, {}).status, 'identity-mismatch');
  }
});
test('R2 F4 · la identidad MÍNIMA debe constar: dos instalaciones desconocidas (o capturas sin ID/fecha) no se acreditan por ser iguales; la cuenta ausente sí es legítima', () => {
  for (const missing of [{ instanceId: null }, { snapshotId: null }, { capturedAt: null }] as const) {
    const data = input({ draft: { subject: 'Mío' } }); const same = { ...data, baseContext: { ...data.baseContext, ...missing }, currentContext: { ...data.currentContext, ...missing } };
    const review = buildConflictReview(same); assert.ok(review.identity.length > 0, 'iguales y ausentes: ' + JSON.stringify(missing)); assert.deepEqual(review.rows, []); assert.equal(resolveConflictReview(review, {}).status, 'identity-mismatch'); assert.deepEqual(review.preserved.map(l => l.key), ['subject'], 'el borrador se conserva');
    assert.ok(buildConflictReview({ ...data, currentContext: { ...data.currentContext, ...missing } }).identity.length > 0, 'solo una lectura sin identidad también bloquea');
  }
  const optional = buildConflictReview(input({ draft: { subject: 'Mío' }, currentContext: { accountId: null, captureStartedAt: null, generatedAt: context.generatedAt } })); assert.deepEqual(optional.identity, []);
  const fiction = input({ draft: { subject: 'Mío' } }); assert.equal(fiction.baseContext.accountId, null); assert.deepEqual(buildConflictReview(fiction).identity, [], 'cuenta ausente en ambas: válido');
});
