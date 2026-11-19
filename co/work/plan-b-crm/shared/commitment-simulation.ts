import { z } from 'zod';
import { commitmentDetailResponse, type CommitmentDetail, type CommitmentEvidence } from './commitments.js';

export const commitmentSimulationFormat = 'planb-commitments-simulation-v1';
const maxObservationAgeMs = 24 * 60 * 60_000;
const delayMs = 48 * 60 * 60_000;
const evaluatedAtSchema = z.iso.datetime();
const proposalNote = 'Simulación propuesta: no se ha ejecutado ningún cambio ni se ha avisado a nadie.';

export type DeadlineEffect = 'late' | 'within-window' | 'unknown';

export type SimulationAlternative = {
  id: 'delay-two-days' | 'seek-stock';
  title: string;
  assumptions: string[];
  missing: string[];
  projectedDueAt: string | null;
  deadlineEffect: DeadlineEffect;
  requiresConfirmation: true;
};

export type CommitmentSimulation = {
  format: typeof commitmentSimulationFormat;
  kind: 'proposal';
  contextRevision: string;
  baseRevision: string;
  commitmentId: string;
  evaluatedAt: string;
  closedReason: string | null;
  alternatives: SimulationAlternative[];
};

export function simulateCommitment(detail: CommitmentDetail, evaluatedAt: string): CommitmentSimulation {
  const parsed = commitmentDetailResponse.parse(detail);
  const now = Date.parse(evaluatedAtSchema.parse(evaluatedAt));
  const sources = [...parsed.evidence.map(entry => entry.observation), ...parsed.events.flatMap(event => event.evidence)];
  if (sources.some(source => source && Date.parse(source.observedAt) > now)) {
    throw new RangeError('evaluatedAt es anterior a alguna observación del detalle');
  }
  const base: Omit<CommitmentSimulation, 'closedReason' | 'alternatives'> = {
    format: commitmentSimulationFormat,
    kind: 'proposal',
    contextRevision: parsed.contextRevision,
    baseRevision: parsed.item.revision,
    commitmentId: parsed.item.id,
    evaluatedAt,
  };
  if (parsed.item.closure || parsed.item.status === 'resolved') {
    const basis = parsed.item.closure?.basis ?? 'sin base registrada';
    return { ...base, closedReason: `El compromiso está cerrado (${basis}); no procede simular alternativas.`, alternatives: [] };
  }
  const gaps = parsed.evidence.flatMap(entry => evidenceGap(entry, now) ?? []);
  return { ...base, closedReason: null, alternatives: [delayTwoDays(parsed.item.dueAt, gaps), seekStock(gaps)] };
}

// Recalcula la antigüedad respecto a evaluatedAt: el estado del detalle pudo calcularse en otro instante.
function evidenceGap(entry: CommitmentEvidence, now: number): string | null {
  const source = entry.observation;
  if (entry.state !== 'observed' || !source || source.coverage !== 'complete') {
    return `${entry.role}: evidencia ${entry.state}; se necesita una observación completa y reciente.`;
  }
  if (now - Date.parse(source.observedAt) > maxObservationAgeMs) {
    return `${entry.role}: la observación supera 24 horas al evaluar; hay que refrescarla.`;
  }
  return null;
}

function delayTwoDays(dueAt: string, gaps: string[]): SimulationAlternative {
  const known = gaps.length === 0;
  const projected = Date.parse(dueAt) + delayMs;
  return {
    id: 'delay-two-days',
    title: 'Retrasar el compromiso dos días',
    assumptions: [
      proposalNote,
      'El vencimiento se desplaza exactamente 48 horas sobre la fecha acordada.',
      'La propuesta queda dos días después de la fecha comprometida original.',
      'El riesgo no desaparece: el nuevo plazo debe confirmarse con el cliente.',
    ],
    missing: gaps,
    projectedDueAt: known ? new Date(projected).toISOString() : null,
    deadlineEffect: known ? 'late' : 'unknown',
    requiresConfirmation: true,
  };
}

function seekStock(gaps: string[]): SimulationAlternative {
  return {
    id: 'seek-stock',
    title: 'Buscar stock alternativo',
    assumptions: [proposalNote, 'No se asume disponibilidad ni plazo hasta comprobarlos.'],
    missing: [...gaps, 'Comprobar stock disponible en otra fuente.', 'Comprobar plazo de entrega del stock alternativo.'],
    projectedDueAt: null,
    deadlineEffect: 'unknown',
    requiresConfirmation: true,
  };
}
