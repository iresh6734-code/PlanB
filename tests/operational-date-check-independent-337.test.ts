import assert from 'node:assert/strict';
import test from 'node:test';
import { checkDate, dateCheckInput, dateCheckInputFormat, type DateCheckInput, type DateCheckControl } from '../shared/operational-date-check.js';
import { operationalTwinFormat, sha256Hex } from '../shared/operational-twin.js';
import { inventoryFormat } from '../shared/operational-inventory.js';

const clock = Date.UTC(2026, 10, 11, 8);
const at = (minutes: number) => new Date(clock + minutes * 60_000).toISOString();
const provenance = { basis: 'declared', by: 'Ensayo', declaredAt: at(0) } as const;
const known = <T>(value: T) => ({ state: 'known', value, provenance } as const);
const resource = (id: string) => ({
  id, title: id, kind: 'technician', source: null, executesJobs: true, skills: ['instalar'],
  windows: known([{ start: at(0), end: at(120) }]),
});
const job = (id: string, commitmentId: string, work: number, start: number) => ({
  id, title: id, kind: 'installation', source: null, commitmentId, duration: known(work),
  travel: known(0), skills: ['instalar'], materials: [], earliestStart: at(start), dependencies: [],
});
const commitment = (id: string, due: number) => ({ id, revision: sha256Hex(id), title: id, dueAt: at(due) });
const example = dateCheckInput.parse({
  format: dateCheckInputFormat,
  base: {
    format: operationalTwinFormat, clock: { now: at(0), timeZone: 'Europe/Madrid', horizonEnd: at(120) },
    rules: { staleAfterMinutes: 60 }, resources: [resource('r-a'), resource('r-b')], materials: [],
    commitments: [commitment('proteger-a', 100), commitment('proteger-b', 60)],
    jobs: [job('t-a', 'proteger-a', 80, 10), job('t-b', 'proteger-b', 60, 0)],
    currentPlan: { provenance, plan: { sequences: [
      { resourceId: 'r-a', jobIds: ['t-b'] },
      { resourceId: 'r-b', jobIds: ['t-a'] },
    ] } },
  },
  inventory: { format: inventoryFormat, skus: [], compatibility: [], lots: [], inbound: [], demands: [] },
  request: {
    id: 'solicitud', title: 'Solicitud', source: null, requestedAt: at(100), window: { start: at(40), end: null },
    duration: known(35), travel: known(0), skills: ['instalar'], materials: [], requestedBy: provenance,
  },
  policy: { protected: ['proteger-a', 'proteger-b'], tiers: [] },
  offers: [],
  scenarios: [{
    id: 'baja', label: 'Baja',
    changes: [{ type: 'resource-absence', resourceId: 'r-b', start: at(0), end: at(120) }],
  }],
});

const only = (input: DateCheckInput, control?: DateCheckControl) => checkDate(input, control).alternatives[0];

test('337 · una instalación de 35 minutos no cabe en una ventana de 30 aunque la fecha pedida sea posterior', () => {
  const input = dateCheckInput.parse({
    ...example,
    base: { ...example.base, commitments: [], jobs: [], currentPlan: { provenance, plan: { sequences: [] } } },
    policy: { protected: [], tiers: [] },
    scenarios: [],
    request: { ...example.request, window: { start: at(40), end: at(70) } },
  });
  const result = only(input);
  assert.notEqual(result.requested.outcome, 'meets');
  assert.notEqual(result.requested.classification, 'verified');
  assert.equal(result.supported.at, null);
});

test('337 · terminar en el minuto exacto del cierre sigue siendo un plan válido', () => {
  const input = dateCheckInput.parse({
    ...example,
    base: { ...example.base, commitments: [], jobs: [], currentPlan: { provenance, plan: { sequences: [] } } },
    policy: { protected: [], tiers: [] },
    scenarios: [],
    request: { ...example.request, window: { start: at(40), end: at(75) } },
  });
  const result = only(input);
  assert.equal(result.requested.outcome, 'meets');
  assert.equal(result.candidate?.finishAt, at(75));
  assert.equal(result.supported.at, at(75));
  assert.equal(result.supported.proven, true);
});

test('337 · la baja de un técnico no puede conservar dos protecciones que exigen 140 minutos con 120 de capacidad', () => {
  const result = checkDate(example);
  const reference = result.alternatives[0];
  assert.equal(reference.requested.outcome, 'meets');
  assert.equal(reference.protections.length, 2);
  assert.ok(reference.protections.every(item => item.kept));
  const absence = result.scenarios.find(cell => cell.scenarioId === 'baja' && cell.alternativeId === 'alt-mantener');
  assert.ok(absence);
  assert.equal(absence.protectionsKept, false);
});

test('337 · cancelar después de las alternativas impide certificar la matriz de escenarios', () => {
  let checks = 0;
  const base = checkDate({ ...example, scenarios: [] }, { shouldStop: () => { checks++; return false; } });
  assert.equal(base.search.complete, true);
  const completedChecks = checks;
  checks = 0;
  const result = checkDate(example, { shouldStop: () => ++checks > completedChecks });
  assert.ok(checks > completedChecks);
  assert.deepEqual(result.alternatives, base.alternatives);
  const absence = result.scenarios.find(cell => cell.scenarioId === 'baja' && cell.alternativeId === 'alt-mantener');
  assert.ok(absence);
  assert.equal(result.search.complete, false);
  assert.equal(result.search.stoppedBy, 'cancelled');
  assert.equal(absence.outcome, 'unknown');
  assert.equal(absence.protectionsKept, null);
});
