import assert from 'node:assert/strict';
import test from 'node:test';
import type { CommitmentDetail, CommitmentEvidence } from '../shared/commitments.js';
import { simulateCommitment } from '../shared/commitment-simulation.js';

type Role = CommitmentEvidence['role'];
const evaluatedAt = '2026-11-06T10:00:00Z';
const reference = (kind: Role) => ({ provider: 'demo', accountId: 'cuenta-demo', kind, remoteId: `${kind}-1` });

function observed(role: Role, observedAt = '2026-11-06T08:00:00Z', partial = false): CommitmentEvidence {
  return {
    role, state: partial ? 'partial' : 'observed', candidates: [],
    linked: { reference: reference(role), basis: 'explicit' },
    observation: { reference: reference(role), observedAt, coverage: partial ? 'partial' : 'complete', condition: 'clear', label: `Fuente ${role}` },
  };
}

function absent(role: Role, state: 'missing' | 'ambiguous'): CommitmentEvidence {
  return { role, state, linked: null, observation: null, candidates: state === 'ambiguous' ? [reference(role)] : [] };
}

function detail(item: Partial<CommitmentDetail['item']> = {}, delivery = observed('delivery')): CommitmentDetail {
  return {
    format: 'planb-commitments-detail-v1', mode: 'fiction', contextRevision: 'a'.repeat(64),
    item: {
      id: 'pedido-1', title: 'Entrega de pedido', dueAt: '2026-11-10T09:00:00Z', revision: 'b'.repeat(64),
      status: 'no-risk-detected', cause: 'no-blocker-observed', affectedRole: null, action: null, closure: null, ...item,
    },
    evidence: [observed('sale'), delivery, observed('support')],
    events: [], canCloseObserved: false,
  };
}

test('propone dos alternativas versionadas sin afirmar ejecución', () => {
  const result = simulateCommitment(detail(), evaluatedAt);
  assert.equal(result.format, 'planb-commitments-simulation-v1');
  assert.equal(result.contextRevision, 'a'.repeat(64));
  assert.equal(result.baseRevision, 'b'.repeat(64));
  assert.equal(result.evaluatedAt, evaluatedAt);
  assert.equal(result.closedReason, null);
  assert.deepEqual(result.alternatives.map(option => option.id), ['delay-two-days', 'seek-stock']);
  assert.ok(result.alternatives.every(option => option.requiresConfirmation === true));
  assert.ok(result.alternatives.every(option => option.assumptions.some(text => text.includes('no se ha ejecutado'))));
  const [delay, stock] = result.alternatives;
  assert.ok(delay && stock);
  assert.equal(delay.projectedDueAt, '2026-11-12T09:00:00.000Z');
  assert.equal(delay.deadlineEffect, 'late');
  assert.deepEqual(delay.missing, []);
  assert.equal(stock.projectedDueAt, null);
  assert.equal(stock.deadlineEffect, 'unknown');
  assert.ok(stock.missing.some(text => text.includes('stock')));
  assert.ok(stock.missing.some(text => text.includes('plazo')));
});

test('el retraso sigue vencido si el nuevo plazo ya pasó en UTC', () => {
  const [late] = simulateCommitment(detail({ dueAt: '2026-11-04T09:59:59Z', status: 'at-risk', cause: 'deadline-passed' }), evaluatedAt).alternatives;
  assert.equal(late?.projectedDueAt, '2026-11-06T09:59:59.000Z');
  assert.equal(late?.deadlineEffect, 'late');
  const [exact] = simulateCommitment(detail({ dueAt: '2026-11-04T10:00:00Z' }), evaluatedAt).alternatives;
  assert.equal(exact?.deadlineEffect, 'late');
});

test('un compromiso cerrado no tiene alternativas y explica por qué', () => {
  const closure = { basis: 'manual' as const, note: 'Entregado en mano' };
  const result = simulateCommitment(detail({ status: 'resolved', cause: 'closed-manual', closure }), evaluatedAt);
  assert.deepEqual(result.alternatives, []);
  assert.match(result.closedReason ?? '', /cerrado/);
});

const gaps: [string, CommitmentEvidence][] = [
  ['parcial', observed('delivery', '2026-11-06T08:00:00Z', true)],
  ['de más de 24 horas aunque figure observada', observed('delivery', '2026-11-05T09:59:59Z')],
  ['ausente', absent('delivery', 'missing')],
  ['ambigua', absent('delivery', 'ambiguous')],
];

for (const [name, delivery] of gaps) {
  test(`evidencia ${name}: ambas alternativas quedan desconocidas`, () => {
    const result = simulateCommitment(detail({}, delivery), evaluatedAt);
    assert.equal(result.alternatives.length, 2);
    for (const option of result.alternatives) {
      assert.equal(option.deadlineEffect, 'unknown');
      assert.equal(option.projectedDueAt, null);
      assert.ok(option.missing.some(text => text.startsWith('delivery')));
    }
  });
}

test('una observación de exactamente 24 horas sigue siendo reciente', () => {
  const [delay] = simulateCommitment(detail({}, observed('delivery', '2026-11-05T10:00:00Z')), evaluatedAt).alternatives;
  assert.equal(delay?.projectedDueAt, '2026-11-12T09:00:00.000Z');
  assert.deepEqual(delay?.missing, []);
});

test('rechaza evaluatedAt inválido, con desfase o anterior a las observaciones', () => {
  for (const value of ['ayer', '2026-11-06T12:00:00+02:00', '2026-11-06T07:59:59Z']) {
    assert.throws(() => simulateCommitment(detail(), value));
  }
});

test('no muta la entrada y es reproducible', () => {
  const input = detail();
  const before = structuredClone(input);
  const first = simulateCommitment(input, evaluatedAt);
  assert.deepEqual(input, before);
  assert.deepEqual(simulateCommitment(input, evaluatedAt), first);
});

test('retrasar dos días incumple la fecha prometida aunque ambas fechas estén en el futuro', () => {
  const [option] = simulateCommitment(detail(), evaluatedAt).alternatives;
  assert.equal(option.deadlineEffect, 'late');
  assert.match(option.assumptions.join(' '), /fecha comprometida original/);
});
