import assert from 'node:assert/strict';
import test from 'node:test';
import { DEMO, demoInput, initialDemoState } from '../shared/date-check-demo.js';
import { dateCheckRevision } from '../shared/operational-date-check.js';
import { reviewDecision, withFinish, type Observation } from '../shared/date-check-outcome.js';

const input = demoInput(DEMO.defaults(), initialDemoState());
const decision = {
  alternativeId: 'alt-o-franja-cruz-jueves+o-frioval-jueves',
  offerIds: ['o-frioval-jueves', 'o-franja-cruz-jueves'],
  inputRevision: dateCheckRevision(input),
};
const recordedAt = '2026-11-20T10:00:00.000Z';
const finish: Observation = {
  id: 'obs-fin-propia', kind: 'finish', subject: input.request.id, happenedAt: '2026-11-16T12:00:00.000Z',
  reference: 'Acta de ensayo propia', recordedAt, scope: 'complete',
};

test('339 · el ID de alternativa debe corresponder a las ofertas exactas de la decisión', () => {
  assert.throws(() => reviewDecision(input, { ...decision, alternativeId: 'alt-mantener' }, []), RangeError);
  assert.equal(reviewDecision(input, decision, []).planned.alternativeId, decision.alternativeId);
});

test('339 · un acta de otra solicitud no sustituye el acta de la instalación revisada', () => {
  const unrelated = { ...finish, id: 'obs-fin-otra', subject: 'otro-trabajo-ficticio', happenedAt: '2026-11-13T10:00:00.000Z' };
  const review = reviewDecision(input, decision, [unrelated, finish]);
  assert.equal(review.observed.observation?.id, finish.id);
  assert.equal(review.observed.met, false);
  assert.equal(review.verdict, 'missed');
  assert.equal(reviewDecision(input, decision, [unrelated]).verdict, 'pending');
});

test('339 · una terminación observada sin fecha ofrecida no acredita incumplimiento', () => {
  const long = demoInput({ ...DEMO.defaults(), durationMinutes: 2940, materialKey: 'none', quantity: 0 }, initialDemoState());
  const result = reviewDecision(long, {
    alternativeId: 'alt-mantener', offerIds: [], inputRevision: dateCheckRevision(long),
  }, [{ ...finish, subject: long.request.id }]);
  assert.equal(result.offeredAt, null);
  assert.equal(result.observed.finishAt, finish.happenedAt);
  assert.equal(result.observed.met, null);
  assert.equal(result.verdict, 'pending');
});

test('339 · una proyección no probada conserva el retraso observado sin dar por acreditada su atribución', () => {
  const arrival: Observation = {
    id: 'obs-llegada', kind: 'arrival', subject: 'in-frioval-4', happenedAt: '2026-11-16T10:00:00.000Z',
    reference: 'Albarán de ensayo', recordedAt, scope: 'complete',
  };
  const review = reviewDecision(input, decision, [arrival]);
  assert.ok(review.counterfactual?.finishAt);
  const control = withFinish(review, finish, [arrival]);
  assert.ok((control.attribution.explainedMinutes ?? 0) > 0);
  const uncertain = withFinish({ ...review, counterfactual: { ...review.counterfactual, proven: false } }, finish, [arrival]);
  assert.equal(uncertain.attribution.delayMinutes, control.attribution.delayMinutes);
  assert.equal(uncertain.attribution.explainedMinutes, 0);
  assert.equal(uncertain.attribution.residualMinutes, uncertain.attribution.delayMinutes);
  assert.deepEqual(uncertain.attribution.explainedBy, []);
});
