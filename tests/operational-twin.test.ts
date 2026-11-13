import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { fridayCase, fridayOptions, fridayPerturbations } from '../shared/operational-fixtures.js';
import {
  OperationalInputError, applySuppositions, canonicalJson, operationalBranchFormat, operationalEngineVersion, operationalLimits, operationalModel, operationalRevision, sha256Hex,
  type OperationalModel, type Supposition,
} from '../shared/operational-twin.js';

const nodeHash = (text: string) => createHash('sha256').update(text).digest('hex');
const clone = <T>(value: T): T => structuredClone(value);
const rejects = (change: (model: any) => void) => { const model = clone(fridayCase()); change(model); return !operationalModel.safeParse(model).success; };
const job = (model: { jobs: { id: string }[] }, id: string) => model.jobs.find(item => item.id === id)! as any;

test('la revisión es exacta, reproducible y coincide con SHA-256 de Node', () => {
  for (const text of ['', 'abc', 'ñandú €'.repeat(40), 'x'.repeat(55), 'x'.repeat(56), 'x'.repeat(64), 'x'.repeat(1000)]) assert.equal(sha256Hex(text), nodeHash(text));
  const model = fridayCase();
  assert.equal(operationalRevision(model), nodeHash(canonicalJson(model)));
  assert.equal(operationalRevision(model), operationalRevision(fridayCase()));
  assert.equal(canonicalJson({ b: 1, a: [2, { d: 1, c: 2 }] }), '{"a":[2,{"c":2,"d":1}],"b":1}');
  const changed = clone(model);
  changed.commitments[0].dueAt = '2026-11-13T15:01:00Z';
  assert.notEqual(operationalRevision(changed), operationalRevision(model));
});

test('el contrato rechaza entradas que confunden identidad, referencias o clases de conocimiento', () => {
  assert.ok(operationalModel.safeParse(fridayCase()).success);
  assert.ok(rejects(model => { model.jobs[1].id = model.jobs[0].id; }), 'IDs repetidos');
  assert.ok(rejects(model => { model.jobs[4].source = clone(model.jobs[3].source); }), 'misma identidad completa de fuente dos veces');
  assert.ok(rejects(model => { model.jobs[0].materials = ['no-existe']; }), 'material inexistente');
  assert.ok(rejects(model => { model.jobs[0].dependencies = [{ jobId: 'inst-norte', basis: 'explicit' }]; }), 'dependencia de sí mismo');
  assert.ok(rejects(model => { model.jobs[0].commitmentId = 'otro'; }), 'compromiso inexistente');
  assert.ok(rejects(model => { model.jobs[0].duration.provenance = { basis: 'assumed', suppositionId: 'x' }; }), 'un supuesto no entra como dato de entrada');
  assert.ok(rejects(model => { model.jobs[0].duration = { state: 'known', value: 0, provenance: model.jobs[0].duration.provenance }; }), 'duración cero');
  assert.ok(rejects(model => { model.jobs[0].duration = { state: 'known', value: 60 }; }), 'dato sin procedencia');
  assert.ok(rejects(model => { model.clock.horizonEnd = '2027-01-01T00:00:00Z'; }), 'horizonte fuera del límite');
  assert.ok(rejects(model => { model.currentPlan.plan.sequences[1].jobIds.push('inst-norte'); }), 'plan con un trabajo dos veces');
  assert.ok(rejects(model => { model.commitments[0].revision = 'abc'; }), 'revisión de compromiso inválida');
  assert.ok(rejects(model => { model.extra = true; }), 'campo desconocido');
});

test('dos IDs remotos iguales de cuentas distintas no se fusionan', () => {
  const model = fridayCase();
  const [a, b] = [job(model, 'pedido-sur'), job(model, 'cuadro-este')];
  assert.equal(a.source.remoteId, b.source.remoteId);
  assert.notEqual(a.source.accountId, b.source.accountId);
  // La caída de la cuenta A deja desconocido lo que acreditaba A y no toca lo que acredita B con el mismo ID remoto.
  const branch = applySuppositions(model, [fridayPerturbations.sourceDown]);
  assert.deepEqual(job(branch, 'pedido-sur').duration, { state: 'unknown', reason: 'source-unavailable' });
  assert.equal(job(branch, 'cuadro-este').duration.state, 'known');
  assert.deepEqual(branch.materials.map(item => item.availableAt.state), ['unknown', 'known', 'known']);
});

test('bifurcar no modifica el origen y la rama se identifica como hipotética también al exportarla', () => {
  const model = fridayCase(), before = clone(model), revision = operationalRevision(model);
  const every: Supposition[] = [...Object.values(fridayPerturbations), ...fridayOptions];
  const branch = applySuppositions(model, every);
  assert.deepEqual(model, before);
  assert.equal(operationalRevision(model), revision);
  assert.deepEqual({ ...branch.branch, suppositions: undefined, costs: undefined }, {
    format: operationalBranchFormat, hypothetical: true, baseRevision: revision, engineVersion: operationalEngineVersion, suppositions: undefined, costs: undefined,
  });
  assert.deepEqual(branch.branch!.suppositions, every);
  assert.notEqual(operationalRevision(branch), revision);
  const reopened = JSON.parse(JSON.stringify(branch));
  assert.equal(reopened.branch.hypothetical, true);
  assert.equal(reopened.branch.baseRevision, revision);
  assert.equal(operationalRevision(reopened), operationalRevision(branch));
  // Una rama no es una entrada observada: el contrato de entrada la rechaza.
  assert.equal(operationalModel.safeParse(branch).success, false);
});

test('cada supuesto deja su efecto con procedencia de supuesto', () => {
  const model = fridayCase();
  const material = applySuppositions(model, [fridayPerturbations.materialDelay]).materials[0].availableAt;
  assert.deepEqual(material, { state: 'known', value: '2026-11-13T07:00:00Z', provenance: { basis: 'assumed', suppositionId: 'p-bomba-tarde' } });

  const absent = applySuppositions(model, [fridayPerturbations.technicianOut]).resources[0].windows as any;
  assert.equal(absent.provenance.basis, 'assumed');
  assert.ok(!absent.value.some((value: { start: string }) => value.start.startsWith('2026-11-12')));
  assert.equal(absent.value.length, 5);
  const partial = applySuppositions(model, [{ id: 'p', type: 'resource-absence', resourceId: 'tech-ana', start: '2026-11-12T09:00:00Z', end: '2026-11-12T10:00:00Z' }]).resources[0].windows as any;
  assert.deepEqual(partial.value.filter((value: { start: string }) => value.start.startsWith('2026-11-12')), [
    { start: '2026-11-12T07:00:00.000Z', end: '2026-11-12T09:00:00.000Z' }, { start: '2026-11-12T10:00:00.000Z', end: '2026-11-12T15:00:00.000Z' },
  ]);

  const extra = applySuppositions(model, [fridayOptions[0]]);
  assert.equal(extra.branch!.costs.extraCapacityMinutes, 60);
  assert.ok((extra.resources[1].windows as any).value.some((value: { end: string }) => value.end === '2026-11-12T16:00:00.000Z'), 'la franja extra se funde con la jornada');

  const reopened = applySuppositions(model, [fridayPerturbations.reopen]);
  assert.deepEqual({ ...reopened.jobs.at(-1), title: undefined, travel: undefined }, {
    id: 'cuadro-este--p-reabre', kind: 'reopen', source: null, commitmentId: 'c-cuadro-este', title: undefined, travel: undefined,
    duration: { state: 'known', value: 90, provenance: { basis: 'assumed', suppositionId: 'p-reabre' } }, skills: ['electrica'], materials: [],
    earliestStart: '2026-11-10T07:00:00Z', dependencies: [{ jobId: 'cuadro-este', basis: 'confirmed' }], assumedBy: ['p-reabre'], reopens: 'cuadro-este',
  });

  const alternative = applySuppositions(model, [fridayOptions[1]]);
  assert.deepEqual(job(alternative, 'inst-norte').materials, ['mat-bomba-alt']);
  assert.equal(alternative.branch!.costs.alternativeMaterials, 1);

  const moved = applySuppositions(model, [fridayOptions[2]]).commitments[0];
  assert.deepEqual([moved.dueAt, moved.originalDueAt, moved.assumedBy], ['2026-11-16T15:00:00Z', '2026-11-13T15:00:00Z', ['o-mover-norte']]);

  const split = applySuppositions(model, [fridayOptions[3]]);
  assert.equal(job(split, 'inst-norte'), undefined);
  assert.deepEqual(['inst-norte--p1', 'inst-norte--p2'].map(id => [job(split, id).duration.value, job(split, id).splitOf, job(split, id).source]), [[300, 'inst-norte', null], [300, 'inst-norte', null]]);
  assert.deepEqual(job(split, 'ticket-norte').dependencies, [{ jobId: 'inst-norte--p1', basis: 'explicit' }, { jobId: 'inst-norte--p2', basis: 'explicit' }]);
  assert.deepEqual(split.currentPlan!.plan.sequences[0].jobIds, ['inst-urgente', 'inst-norte--p1', 'inst-norte--p2', 'ticket-norte']);
});

test('un recurso de horario desconocido sigue desconocido aunque se le añada o quite una franja', () => {
  const model = clone(fridayCase()) as OperationalModel;
  model.resources[1].windows = { state: 'unknown', reason: 'not-provided' };
  const branch = applySuppositions(model, [fridayOptions[0], { id: 'p', type: 'resource-absence', resourceId: 'tech-cruz', start: '2026-11-13T07:00:00Z', end: '2026-11-13T09:00:00Z' }]);
  assert.deepEqual(branch.resources[1].windows, { state: 'unknown', reason: 'not-provided' });
});

test('supuestos imposibles se rechazan con un error propio y sin tocar el origen', () => {
  const model = fridayCase(), before = clone(model);
  const fails = (list: Supposition[], code: string) => assert.throws(() => applySuppositions(model, list), (error: unknown) => error instanceof OperationalInputError && error.code === code);
  fails([{ id: 'x', type: 'material-availability', materialId: 'nada', availableAt: '2026-11-10T07:00:00Z' }], 'unknown-target');
  fails([fridayOptions[0], { ...fridayOptions[1], id: fridayOptions[0].id }], 'duplicate-supposition');
  fails([{ id: 'x', type: 'use-alternative-material', jobId: 'inst-urgente', fromMaterialId: 'mat-bomba', toMaterialId: 'mat-bomba-alt' }], 'material-mismatch');
  fails([{ id: 'x', type: 'add-capacity', resourceId: 'tech-ana', start: '2026-11-14T10:00:00Z', end: '2026-11-14T10:00:00Z' }], 'empty-interval');
  fails([fridayOptions[3], { ...fridayOptions[3], id: 'otra' }], 'unknown-target');
  fails([fridayOptions[3], { id: 'otra', type: 'split-job', jobId: 'inst-norte--p1', parts: [10, 10] }], 'split-derived');
  assert.throws(() => applySuppositions(model, Array.from({ length: operationalLimits.suppositions + 1 }, (_, at): Supposition => ({ id: `s${at}`, type: 'move-due', commitmentId: 'c-inst-norte', dueAt: '2026-11-16T15:00:00Z' }))));
  assert.deepEqual(model, before);
});
