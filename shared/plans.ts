// Planes de Plan B: datos puros sin dependencias, compartidos por la licencia (M1), Ajustes y la landing (M5).
export type PlanId = 'personal' | 'pro' | 'team';
export type FeatureId = 'manual-copies' | 'drills' | 'scheduled-captures' | 'passport' | 'forecast' | 'monthly-report' | 'bulk-edit' | 'incident-file' | 'continuity-seal' | 'pipeline-analytics' | 'team-space';
export const PLAN_LABEL: Record<PlanId, string> = { personal: 'Personal', pro: 'Pro', team: 'Equipo' };
export const FEATURES: { id: FeatureId; label: string; plans: PlanId[] }[] = [
  { id: 'manual-copies', label: 'Copias manuales y trabajo sin conexión', plans: ['personal', 'pro', 'team'] },
  { id: 'drills', label: 'Simulacros de caída', plans: ['personal', 'pro', 'team'] },
  { id: 'scheduled-captures', label: 'Capturas programadas cada hora', plans: ['pro', 'team'] },
  { id: 'passport', label: 'Pasaporte de continuidad', plans: ['pro', 'team'] },
  { id: 'forecast', label: 'Previsión «si el CRM cae ahora»', plans: ['pro', 'team'] },
  { id: 'monthly-report', label: 'Informe mensual', plans: ['pro', 'team'] },
  { id: 'bulk-edit', label: 'Cambio en bloque', plans: ['pro', 'team'] },
  { id: 'incident-file', label: 'Expediente del incidente', plans: ['pro', 'team'] },
  { id: 'continuity-seal', label: 'Sello de continuidad', plans: ['pro', 'team'] },
  { id: 'pipeline-analytics', label: 'Analítica de oportunidades', plans: ['pro', 'team'] },
  { id: 'team-space', label: 'Espacio de equipo', plans: ['team'] },
];
export const planAllows = (plan: PlanId, feature: FeatureId) => FEATURES.find(item => item.id === feature)?.plans.includes(plan) ?? false;

/** N1 · Prueba de Pro: 14 días contados en este equipo desde que se pulsa «Empezar». Solo se guarda la fecha de inicio. */
export const TRIAL_DAYS = 14;
export type TrialStatus = 'available' | 'active' | 'ended';
export interface TrialState { status: TrialStatus; startedAt: string | null; endsAt: string | null; daysLeft: number | null }
const DAY_MS = 86_400_000;
export function trialState(startedAt: string | null | undefined, now: Date): TrialState {
  const start = startedAt && /^\d{4}-\d{2}-\d{2}T/.test(startedAt) ? Date.parse(startedAt) : NaN;
  if (!Number.isFinite(start)) return { status: 'available', startedAt: null, endsAt: null, daysLeft: null };
  // Un inicio en el futuro (reloj cambiado) cuenta desde ahora: nunca alarga la prueba.
  const from = Math.min(start, now.getTime()), end = from + TRIAL_DAYS * DAY_MS;
  const daysLeft = Math.max(0, Math.ceil((end - now.getTime()) / DAY_MS));
  return { status: daysLeft > 0 ? 'active' : 'ended', startedAt: new Date(from).toISOString(), endsAt: new Date(end).toISOString(), daysLeft };
}
/** Plan con el que se muestran las insignias: la prueba eleva Personal a Pro; una licencia de pago nunca baja. */
export const effectivePlan = (licensed: PlanId, trial: TrialState): PlanId => licensed === 'personal' && trial.status === 'active' ? 'pro' : licensed;

/** Puertas suaves: dicen a qué plan pertenece una función, pero nunca la desactivan. Los datos, la exportación y la recuperación no tienen puerta. */
export interface FeatureAccess { feature: FeatureId; label: string; plan: PlanId; included: boolean; via: 'plan' | 'trial' | 'none'; badge: string; hint: string }
export function featureAccess(feature: FeatureId, licensed: PlanId, trial: TrialState): FeatureAccess {
  const item = FEATURES.find(entry => entry.id === feature);
  const label = item?.label ?? feature, minimum = item?.plans[0] ?? 'pro';
  const badge = PLAN_LABEL[minimum];
  if (planAllows(licensed, feature)) return { feature, label, plan: licensed, included: true, via: 'plan', badge, hint: label + ': incluido en tu plan ' + PLAN_LABEL[licensed] + '.' };
  const plan = effectivePlan(licensed, trial);
  if (planAllows(plan, feature)) return { feature, label, plan, included: true, via: 'trial', badge, hint: label + ': incluido en la prueba de Pro (' + (trial.daysLeft === 1 ? 'queda 1 día' : 'quedan ' + trial.daysLeft + ' días') + ').' };
  return { feature, label, plan: licensed, included: false, via: 'none', badge, hint: label + ': forma parte del plan ' + badge + '. Puedes seguir usándolo; Plan B nunca bloquea tus datos, la exportación ni la recuperación.' };
}

/** Precio mostrado mientras el usuario no fije las tarifas. Sustituir aquí (y solo aquí) cuando estén decididas. */
export const PRICE_PENDING = 'Precio a decidir';
export interface PlanOffer { id: PlanId; label: string; audience: string; price: string; note: string; featured: boolean }
export const PLAN_OFFERS: PlanOffer[] = [
  { id: 'personal', label: PLAN_LABEL.personal, audience: 'Para una persona que quiere su copia a mano.', price: 'Gratis', note: 'Sin licencia y sin límite de tiempo.', featured: false },
  { id: 'pro', label: PLAN_LABEL.pro, audience: 'Para quien vive del CRM y no puede quedarse parado.', price: PRICE_PENDING, note: 'Licencia anual que se verifica sin conexión.', featured: true },
  { id: 'team', label: PLAN_LABEL.team, audience: 'Para equipos que deben poder seguir juntos durante un corte.', price: PRICE_PENDING, note: 'Una licencia para todo el equipo.', featured: false },
];

/** Qué añade cada plan respecto al anterior, en el orden de la tarifa. */
export function planHighlights(plan: PlanId): string[] {
  const order: PlanId[] = ['personal', 'pro', 'team'], previous = order[order.indexOf(plan) - 1];
  return FEATURES.filter(item => item.plans.includes(plan) && (!previous || !item.plans.includes(previous))).map(item => item.label);
}
