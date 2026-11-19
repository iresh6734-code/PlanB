import { checkDate, dateCheckEngineVersion, dateCheckInput, dateCheckRevision, type DateCheckInput } from './operational-date-check.js';

// REVISAR UNA DECISIÓN (unidad CLAUDE-OPUS-DATE-CHECK-REVIEW). Puro: no guarda ni lee fuentes.
// Compara lo que se decidió con lo que pasó después, sin mezclar tres cosas distintas:
//   condición    lo que la decisión SUPONÍA (que Frioval llegara el jueves, que Cruz trabajara la franja)
//   observación  un hecho posterior con fecha, referencia y alcance (completo o parcial)
//   proyección   lo que el motor calcula con la revisión exacta de la decisión y los hechos observados en lugar de los supuestos (contrafactual)
// El desenlace observado (cuándo terminó de verdad) se guarda APARTE de la proyección contrafactual. La atribución solo reparte el retraso que la proyección explica;
// el resto queda «por comprobar», con su cifra, y nunca se atribuye por defecto.

export const reviewFormat = 'planb-date-check-review-v1' as const;

export type Observation = {
  id: string;
  kind: 'arrival' | 'slot' | 'finish';
  // arrival: ID de la llegada · slot: ID del cambio «añadir franja» · finish: ID de la solicitud
  subject: string;
  // arrival/finish: cuándo ocurrió (null = no ha ocurrido). slot: null.
  happenedAt: string | null;
  worked?: boolean;
  reference: string; recordedAt: string; scope: 'complete' | 'partial';
};
export type DecisionRef = { alternativeId: string; offerIds: string[]; inputRevision: string };

export type ConditionReview = {
  offerId: string; type: 'confirm-arrival' | 'add-slot' | 'use-reserved' | 'substitute'; label: string;
  assumed: { at: string | null; start: string | null; end: string | null };
  observation: Observation | null;
  // held: ocurrió como se supuso (o antes) · later: ocurrió, más tarde de lo supuesto · not-happened: no ocurrió · unobserved: no hay observación · not-observable: cambio interno sin hecho que observar
  status: 'held' | 'later' | 'not-happened' | 'unobserved' | 'not-observable';
  differenceMinutes: number | null;
};
export type DecisionReview = {
  format: typeof reviewFormat; engineVersion: typeof dateCheckEngineVersion; inputRevision: string;
  requestedAt: string;
  // Fecha que la decisión permitía ofrecer: la pedida si la alternativa la cumplía; si no, su primera fecha sustentada. El desenlace se juzga contra ella.
  offeredAt: string | null;
  planned: { alternativeId: string; finishAt: string | null; outcome: 'meets' | 'misses' | 'unknown' };
  conditions: ConditionReview[];
  // Proyección contrafactual: el mismo cálculo con lo observado en lugar de lo supuesto. null si no hay ninguna condición observada.
  counterfactual: { alternativeId: string; finishAt: string | null; outcome: 'meets' | 'misses' | 'unknown'; usedObservations: string[]; proven: boolean } | null;
  observed: { finishAt: string | null; met: boolean | null; observation: Observation | null };
  attribution: { delayMinutes: number | null; explainedMinutes: number | null; residualMinutes: number | null; explainedBy: string[]; partialEvidence: boolean };
  verdict: 'pending' | 'met-as-offered' | 'met-differently' | 'missed';
};

const minutesBetween = (later: string, earlier: string) => Math.round((Date.parse(later) - Date.parse(earlier)) / 60_000);
const altId = (offerIds: string[]) => (offerIds.length ? `alt-${[...offerIds].sort().join('+')}` : 'alt-mantener');

// El motor evalúa cada alternativa con independencia de los escenarios: se quitan para no recalcular la matriz ni dejar referencias a cambios retirados.
function evaluate(input: DateCheckInput, offerIds: string[]) {
  const result = checkDate(dateCheckInput.parse({ ...input, scenarios: [] }));
  const alternative = result.alternatives.find(item => item.id === altId(offerIds));
  if (!alternative) throw new RangeError('La alternativa decidida no existe en esta entrada.');
  return alternative;
}

export function reviewDecision(input: DateCheckInput, decision: DecisionRef, observations: Observation[]): DecisionReview {
  const parsed = dateCheckInput.parse(input);
  if (dateCheckRevision(parsed) !== decision.inputRevision) throw new RangeError('La entrada no es la revisión exacta de la decisión.');
  const planned = evaluate(parsed, decision.offerIds);
  const offers = parsed.offers.filter(item => decision.offerIds.includes(item.id));
  const finishObservation = observations.find(item => item.kind === 'finish') ?? null;

  const conditions: ConditionReview[] = offers.map(offer => {
    if (offer.type === 'confirm-arrival') {
      const observation = observations.find(item => item.kind === 'arrival' && item.subject === offer.inboundId) ?? null;
      const status: ConditionReview['status'] = !observation ? 'unobserved' : observation.happenedAt === null ? 'not-happened' : Date.parse(observation.happenedAt) <= Date.parse(offer.arrivalAt) ? 'held' : 'later';
      return { offerId: offer.id, type: offer.type, label: offer.label, assumed: { at: offer.arrivalAt, start: null, end: null }, observation, status,
        differenceMinutes: observation?.happenedAt ? minutesBetween(observation.happenedAt, offer.arrivalAt) : null };
    }
    if (offer.type === 'add-slot') {
      const observation = observations.find(item => item.kind === 'slot' && item.subject === offer.id) ?? null;
      const status: ConditionReview['status'] = !observation ? 'unobserved' : observation.worked ? 'held' : 'not-happened';
      return { offerId: offer.id, type: offer.type, label: offer.label, assumed: { at: null, start: offer.start, end: offer.end }, observation, status, differenceMinutes: null };
    }
    // Ceder reservadas o sustituir un SKU son decisiones internas: no hay un hecho externo que observar para ellas en este corte.
    return { offerId: offer.id, type: offer.type, label: offer.label, assumed: { at: null, start: null, end: null }, observation: null, status: 'not-observable', differenceMinutes: null };
  });

  // Contrafactual: lo observado sustituye a lo supuesto. Una llegada que no ocurrió deja de estar confirmada; una franja no trabajada desaparece.
  const used = conditions.filter(item => item.observation).map(item => item.observation!.id);
  let counterfactual: DecisionReview['counterfactual'] = null;
  if (used.length) {
    const kept: string[] = [];
    const nextOffers = parsed.offers.flatMap(offer => {
      if (!decision.offerIds.includes(offer.id)) return [offer];
      const condition = conditions.find(item => item.offerId === offer.id)!;
      if (condition.status === 'not-happened') return [];
      kept.push(offer.id);
      if (offer.type === 'confirm-arrival' && condition.observation?.happenedAt) return [{ ...offer, arrivalAt: condition.observation.happenedAt }];
      return [offer];
    });
    const alternative = evaluate(dateCheckInput.parse({ ...parsed, offers: nextOffers, scenarios: [] }), kept);
    counterfactual = { alternativeId: alternative.id, finishAt: alternative.candidate?.finishAt ?? null, outcome: alternative.requested.outcome, usedObservations: used, proven: alternative.search.complete };
  }
  return withFinish({
    format: reviewFormat, engineVersion: dateCheckEngineVersion, inputRevision: decision.inputRevision, requestedAt: parsed.request.requestedAt,
    offeredAt: planned.requested.outcome === 'meets' ? parsed.request.requestedAt : planned.supported.at,
    planned: { alternativeId: planned.id, finishAt: planned.candidate?.finishAt ?? null, outcome: planned.requested.outcome },
    conditions, counterfactual,
    observed: { finishAt: null, met: null, observation: null },
    attribution: { delayMinutes: null, explainedMinutes: null, residualMinutes: null, explainedBy: [], partialEvidence: false },
    verdict: 'pending',
  }, finishObservation, observations);
}

// Añade (o recalcula) el desenlace observado sin volver a ejecutar el motor: la proyección contrafactual no depende de cuándo terminó el trabajo.
export function withFinish(review: DecisionReview, finish: Observation | null, all: Observation[] = []): DecisionReview {
  const partialEvidence = [...all, ...(finish ? [finish] : [])].some(item => item.scope === 'partial');
  if (!finish) return { ...review, observed: { finishAt: null, met: null, observation: null }, attribution: { ...review.attribution, partialEvidence }, verdict: 'pending' };
  const met = finish.happenedAt !== null && review.offeredAt !== null && Date.parse(finish.happenedAt) <= Date.parse(review.offeredAt);
  const planned = review.planned.finishAt, cf = review.counterfactual?.finishAt ?? null;
  let delay: number | null = null, explained: number | null = null, residual: number | null = null;
  if (planned && finish.happenedAt) {
    delay = Math.max(0, minutesBetween(finish.happenedAt, planned));
    // Solo se atribuye lo que la proyección con lo observado explica, y nunca más que el retraso observado.
    explained = cf ? Math.min(delay, Math.max(0, minutesBetween(cf, planned))) : 0;
    residual = delay - explained;
  }
  const explainedBy = explained ? review.conditions.filter(item => item.status === 'later' || item.status === 'not-happened').map(item => item.offerId) : [];
  const allHeld = review.conditions.every(item => item.status === 'held' || item.status === 'not-observable');
  return {
    ...review, observed: { finishAt: finish.happenedAt, met, observation: finish },
    attribution: { delayMinutes: delay, explainedMinutes: explained, residualMinutes: residual, explainedBy, partialEvidence },
    verdict: !met ? 'missed' : allHeld ? 'met-as-offered' : 'met-differently',
  };
}

// ── Desenlaces de ficción ───────────────────────────────────────────────────────────────────────────────────────────────────────────
// Dos cierres reproducibles para la demostración. Las referencias son de proveedores «-fixture»; ninguna existe fuera del ensayo.
export type FictionEnding = 'met' | 'supplier-late';
export const fictionEndings: { id: FictionEnding; label: string }[] = [
  { id: 'met', label: 'Se cumplieron las condiciones' },
  { id: 'supplier-late', label: 'El proveedor llegó tarde' },
];
// Retraso del cierre «proveedor tarde» respecto a la fecha supuesta. Por defecto 4 días y 1 hora: en Almacén Sur, Frioval llega el lunes 16 a las 11:00 (Madrid).
export const DEFAULT_LATE_ARRIVAL_MINUTES = 4 * 24 * 60 + 60;

export function fictionEnding(input: DateCheckInput, decision: DecisionRef, ending: FictionEnding, recordedAt: string, options: { lateArrivalMinutes?: number } = {}): { observations: Observation[]; review: DecisionReview } {
  const lateBy = options.lateArrivalMinutes ?? DEFAULT_LATE_ARRIVAL_MINUTES;
  if (!(lateBy > 0)) throw new RangeError('Un cierre tardío necesita un retraso positivo.');
  const parsed = dateCheckInput.parse(input);
  const offers = parsed.offers.filter(item => decision.offerIds.includes(item.id));
  const arrivals = offers.filter(item => item.type === 'confirm-arrival');
  if (ending === 'supplier-late' && !arrivals.length) throw new RangeError('Este cierre necesita una decisión que dependa de una llegada.');
  const conditions: Observation[] = [];
  for (const offer of offers) {
    if (offer.type === 'confirm-arrival') {
      const inbound = parsed.inventory.inbound.find(item => item.id === offer.inboundId)!;
      const at = new Date(Date.parse(offer.arrivalAt) + (ending === 'met' ? -20 : lateBy) * 60_000).toISOString();
      conditions.push({ id: `obs-llegada-${offer.inboundId}`.slice(0, 64), kind: 'arrival', subject: offer.inboundId, happenedAt: at,
        reference: `${inbound.source ? `${inbound.source.provider} · ${inbound.source.accountId} · ` : ''}albarán ${ending === 'met' ? 'ALB-5531' : 'ALB-5602'}`, recordedAt, scope: 'complete' });
    }
    if (offer.type === 'add-slot') {
      // En el cierre tardío, el parte de jornada solo recoge la tarde de forma parcial: la observación conserva ese alcance.
      conditions.push({ id: `obs-franja-${offer.id}`.slice(0, 64), kind: 'slot', subject: offer.id, happenedAt: null, worked: true,
        reference: `rota-fixture · fixture-rota · parte de jornada ${offer.resourceId}`, recordedAt, scope: ending === 'met' ? 'complete' : 'partial' });
    }
  }
  const base = reviewDecision(parsed, decision, conditions);
  const anchor = base.counterfactual?.finishAt ?? base.planned.finishAt;
  if (!anchor) throw new RangeError('La decisión no tiene una terminación proyectada con la que cerrar el desenlace.');
  // Cumplido: termina 10 min antes de lo proyectado. Tarde: 40 min después de lo que explica la llegada tardía (sin parte que explique esos 40 min).
  const finishAt = new Date(Date.parse(anchor) + (ending === 'met' ? -10 : 40) * 60_000).toISOString();
  const finish: Observation = { id: 'obs-fin', kind: 'finish', subject: parsed.request.id, happenedAt: finishAt,
    reference: 'crm-fixture · fixture-crm · acta de instalación firmada', recordedAt, scope: 'complete' };
  const observations = [...conditions, finish];
  return { observations, review: withFinish(base, finish, observations) };
}
