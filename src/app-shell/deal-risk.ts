import type { AppState, CrmRecord } from '../../shared/model.js';
import { closeStatus, dealSignal, stageKind, type DealPulse } from './deal-insights.js';
import { closeFieldOf, fieldList, missingFor, stageNeeds, type StageNeeds } from './stage-rules.js';

/** F7 · Oportunidades en riesgo: una sola lista con los motivos a la vista, sin puntuaciones opacas.
 *  Une el cierre ya pasado, lo que pide la etapa y falta (D2) y la falta de próximo paso o la parada (V5). */
type Spec = NonNullable<AppState['spec']>;
type Stage = Spec['stages'][number];
export type RiskKind = 'close-late' | 'missing' | 'no-next' | 'stalled';
export interface RiskReason { kind: RiskKind; tone: 'danger' | 'warn'; text: string }
export interface DealRisk { record: CrmRecord; stage: Stage; amount: number | null; reasons: RiskReason[] }
export interface RiskBase { stageKey: string; amountKey: string; closeKey: string | null; needs: StageNeeds; stages: Map<string, Stage> }
export interface RiskContext extends RiskBase { today: string; /** Tareas por oportunidad; sin ellas no se juzga el próximo paso. */ pulse?: Map<string, DealPulse> | null }

export function riskBase(spec: Spec): RiskBase {
  const deals = (spec.entities ?? []).find(entity => entity.id === 'deals');
  return {
    stageKey: spec.roles?.stage ?? 'dealstage', amountKey: spec.roles?.amount ?? 'amount',
    closeKey: deals ? closeFieldOf(deals.fields)?.key ?? null : null,
    needs: deals ? stageNeeds(spec) : new Map(), stages: new Map((spec.stages ?? []).map(stage => [stage.id, stage])),
  };
}

const amountOf = (value: unknown) => {
  if (typeof value !== 'number' && (typeof value !== 'string' || !value.trim())) return null;
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : null;
};

/** Motivos de una oportunidad ABIERTA; ganadas, perdidas o de etapa desconocida no tienen ninguno. */
export function dealRiskReasons(record: CrmRecord, context: RiskContext): RiskReason[] {
  const stage = context.stages.get(String(record.values[context.stageKey] ?? ''));
  if (!stage || stageKind(stage) !== 'open') return [];
  const reasons: RiskReason[] = [];
  if (context.closeKey) {
    const status = closeStatus(record.values[context.closeKey], context.today, 'open');
    if (status.tone === 'late') reasons.push({ kind: 'close-late', tone: 'danger', text: 'Cierre vencido ' + status.label.replace(/^Venció /, '').replace(/ · .*$/, '') });
  }
  const missing = missingFor(record.values, stage.id, context.needs);
  if (missing.length) reasons.push({ kind: 'missing', tone: 'warn', text: 'Falta ' + fieldList(missing) + ' para «' + stage.label + '»' });
  if (context.pulse) {
    const signal = dealSignal(context.pulse.get(record.id), context.today);
    if (signal?.noNext) reasons.push({ kind: 'no-next', tone: 'warn', text: 'Sin próximo paso' });
    if (signal?.idleDays != null) reasons.push({ kind: 'stalled', tone: 'warn', text: 'Parada: último paso hace ' + signal.idleDays + ' días' });
  }
  return reasons;
}

/** Las que tienen algún motivo: primero las que llevan alguno grave, luego las de más motivos y, a igualdad, las de más importe. */
export function dealRisks(records: readonly CrmRecord[], context: RiskContext): DealRisk[] {
  const list: DealRisk[] = [];
  for (const record of records) {
    if (record.entity !== 'deals') continue;
    const reasons = dealRiskReasons(record, context);
    if (reasons.length) list.push({ record, stage: context.stages.get(String(record.values[context.stageKey]))!, amount: amountOf(record.values[context.amountKey]), reasons });
  }
  const grave = (item: DealRisk) => item.reasons.filter(reason => reason.tone === 'danger').length;
  return list.sort((a, b) => grave(b) - grave(a) || b.reasons.length - a.reasons.length || (b.amount ?? -1) - (a.amount ?? -1));
}

/** Recuento por motivo, para el resumen («3 con el cierre vencido · 2 sin próximo paso»). */
export function riskTally(risks: readonly DealRisk[]): Record<RiskKind, number> {
  const tally: Record<RiskKind, number> = { 'close-late': 0, missing: 0, 'no-next': 0, stalled: 0 };
  for (const risk of risks) for (const reason of risk.reasons) tally[reason.kind]++;
  return tally;
}
