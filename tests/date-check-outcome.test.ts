import assert from 'node:assert/strict';
import test from 'node:test';
import { DEMO, demoInput, initialDemoState } from '../shared/date-check-demo.js';
import { fictionEnding, reviewDecision, withFinish, type Observation } from '../shared/date-check-outcome.js';
import { SERVICES_CASE, servicesDateCheck } from '../shared/date-check-services-fixture.js';
import { checkDate, dateCheckRevision } from '../shared/operational-date-check.js';

const lumen = demoInput(DEMO.defaults(), initialDemoState());
const LUMEN = { alternativeId: 'alt-o-franja-cruz-jueves+o-frioval-jueves', offerIds: ['o-frioval-jueves', 'o-franja-cruz-jueves'], inputRevision: dateCheckRevision(lumen) };
const RECORDED = '2026-11-20T10:00:00.000Z';
const obs = (partial: Partial<Observation> & Pick<Observation, 'id' | 'kind' | 'subject'>): Observation => ({ happenedAt: null, reference: 'ficción', recordedAt: RECORDED, scope: 'complete', ...partial });

test('solo se revisa con la revisión exacta de la decisión', () => {
  assert.throws(() => reviewDecision(lumen, { ...LUMEN, inputRevision: 'a'.repeat(64) }, []), /revisión exacta/);
});

test('sin observaciones: todo queda pendiente y no hay contrafactual ni atribución', () => {
  const review = reviewDecision(lumen, LUMEN, []);
  assert.equal(review.verdict, 'pending');
  assert.equal(review.counterfactual, null);
  assert.deepEqual(review.conditions.map(item => item.status), ['unobserved', 'unobserved']);
  assert.equal(review.offeredAt, '2026-11-13T15:00:00.000Z');
  assert.equal(review.planned.finishAt, '2026-11-13T13:30:00.000Z');
});

test('una franja no trabajada desaparece del contrafactual; la llegada a tiempo no explica nada', () => {
  const review = reviewDecision(lumen, LUMEN, [
    obs({ id: 'a', kind: 'arrival', subject: 'in-frioval-4', happenedAt: '2026-11-12T08:00:00.000Z' }),
    obs({ id: 's', kind: 'slot', subject: 'o-franja-cruz-jueves', worked: false }),
  ]);
  assert.deepEqual(review.conditions.map(item => item.status), ['held', 'not-happened']);
  // Sin franja, Cruz no llega el viernes: la proyección contrafactual es la de «solo llegada» (lunes 16, 09:15 de Madrid).
  assert.deepEqual([review.counterfactual?.alternativeId, review.counterfactual?.finishAt, review.counterfactual?.outcome], ['alt-o-frioval-jueves', '2026-11-16T08:15:00.000Z', 'misses']);
  const closed = withFinish(review, obs({ id: 'f', kind: 'finish', subject: 'solicitud-nueva', happenedAt: '2026-11-16T09:00:00.000Z' }));
  assert.equal(closed.verdict, 'missed');
  assert.deepEqual([closed.attribution.explainedBy, closed.attribution.residualMinutes], [['o-franja-cruz-jueves'], 45]);
});

test('lo observado no se atribuye por encima del retraso real ni cuando termina antes de lo proyectado', () => {
  const review = reviewDecision(lumen, LUMEN, [obs({ id: 'a', kind: 'arrival', subject: 'in-frioval-4', happenedAt: '2026-11-16T10:00:00.000Z' })]);
  // Termina antes de lo que proyecta el contrafactual: lo explicado no supera el retraso observado y no queda resto negativo.
  const early = withFinish(review, obs({ id: 'f', kind: 'finish', subject: 'solicitud-nueva', happenedAt: '2026-11-16T15:00:00.000Z' }));
  assert.equal(early.attribution.explainedMinutes, early.attribution.delayMinutes);
  assert.equal(early.attribution.residualMinutes, 0);
  const onTime = withFinish(review, obs({ id: 'f', kind: 'finish', subject: 'solicitud-nueva', happenedAt: '2026-11-13T13:00:00.000Z' }));
  assert.deepEqual([onTime.attribution.delayMinutes, onTime.attribution.explainedMinutes, onTime.verdict], [0, 0, 'met-differently']);
});

test('los dos cierres de ficción del caso Almacén Sur', () => {
  const met = fictionEnding(lumen, LUMEN, 'met', RECORDED).review;
  assert.deepEqual([met.verdict, met.observed.finishAt, met.attribution.delayMinutes], ['met-as-offered', '2026-11-13T13:20:00.000Z', 0]);
  const late = fictionEnding(lumen, LUMEN, 'supplier-late', RECORDED).review;
  assert.deepEqual([late.verdict, late.counterfactual?.finishAt, late.observed.finishAt], ['missed', '2026-11-17T08:30:00.000Z', '2026-11-17T09:10:00.000Z']);
  assert.deepEqual(late.attribution, { delayMinutes: 5500, explainedMinutes: 5460, residualMinutes: 40, explainedBy: ['o-frioval-jueves'], partialEvidence: true });
  assert.throws(() => fictionEnding(lumen, { ...LUMEN, alternativeId: 'alt-mantener', offerIds: [] }, 'supplier-late', RECORDED), /llegada/);
});

test('servicios y proyectos: capacidad de personas y aprobación del cliente recorren el mismo flujo', () => {
  const input = servicesDateCheck();
  assert.equal(input.base.jobs.length, 7, 'el caso de Fable sin cambios en trabajos');
  const result = checkDate(input);
  const keep = result.alternatives.find(item => item.id === 'alt-mantener')!;
  // Sin fecha de aprobación, la entrega queda sin determinar y lo dice.
  assert.deepEqual([keep.requested.outcome, keep.requested.classification], ['unknown', 'conditioned']);
  assert.ok(keep.conditions.some(item => item.code === 'unknown-material' && item.pendingInbound.includes(SERVICES_CASE.approvalInbound)));
  // Solo la aprobación: Inés no llega (16 h para 20 h). Aprobación + horas extra: cabe exactamente el miércoles a las 17:00.
  const approval = result.alternatives.find(item => item.id === `alt-${SERVICES_CASE.offers.approval}`)!;
  assert.deepEqual([approval.requested.outcome, approval.supported.at], ['misses', '2026-11-19T12:00:00.000Z']);
  const both = result.alternatives.find(item => item.id === `alt-${[SERVICES_CASE.offers.approval, SERVICES_CASE.offers.overtime].sort().join('+')}`)!;
  assert.deepEqual([both.requested.outcome, both.requested.classification, both.candidate?.finishAt, both.extraMinutes], ['meets', 'conditioned', '2026-11-18T16:00:00.000Z', 240]);
  assert.equal(result.ranking[0], both.id);
  assert.equal(result.checkFirst[0].kind, 'inbound-arrival');

  // Revisión: la aprobación llega 6 h tarde. La proyección con lo observado explica 22 de las 22 h 40 min; quedan 40 min por comprobar.
  const decision = { alternativeId: both.id, offerIds: both.offerIds, inputRevision: dateCheckRevision(input) };
  const late = fictionEnding(input, decision, 'supplier-late', RECORDED, { lateArrivalMinutes: 360 }).review;
  assert.deepEqual([late.verdict, late.counterfactual?.finishAt, late.observed.finishAt], ['missed', '2026-11-19T14:00:00.000Z', '2026-11-19T14:40:00.000Z']);
  assert.deepEqual(late.attribution, { delayMinutes: 1360, explainedMinutes: 1320, residualMinutes: 40, explainedBy: [SERVICES_CASE.offers.approval], partialEvidence: true });
  const met = fictionEnding(input, decision, 'met', RECORDED).review;
  assert.equal(met.verdict, 'met-as-offered');
});
