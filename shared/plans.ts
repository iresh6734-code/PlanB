// Planes de Plan B: datos puros sin dependencias, compartidos por la licencia (M1), Ajustes y la landing (M5).
export type PlanId = 'personal' | 'pro' | 'team';
export type FeatureId = 'manual-copies' | 'drills' | 'scheduled-captures' | 'passport' | 'forecast' | 'monthly-report' | 'bulk-edit' | 'team-space';
export const PLAN_LABEL: Record<PlanId, string> = { personal: 'Personal', pro: 'Pro', team: 'Equipo' };
export const FEATURES: { id: FeatureId; label: string; plans: PlanId[] }[] = [
  { id: 'manual-copies', label: 'Copias manuales y trabajo sin conexión', plans: ['personal', 'pro', 'team'] },
  { id: 'drills', label: 'Simulacros de caída', plans: ['personal', 'pro', 'team'] },
  { id: 'scheduled-captures', label: 'Capturas programadas cada hora', plans: ['pro', 'team'] },
  { id: 'passport', label: 'Pasaporte de continuidad', plans: ['pro', 'team'] },
  { id: 'forecast', label: 'Previsión «si el CRM cae ahora»', plans: ['pro', 'team'] },
  { id: 'monthly-report', label: 'Informe mensual', plans: ['pro', 'team'] },
  { id: 'bulk-edit', label: 'Cambio en bloque', plans: ['pro', 'team'] },
  { id: 'team-space', label: 'Espacio de equipo', plans: ['team'] },
];
export const planAllows = (plan: PlanId, feature: FeatureId) => FEATURES.find(item => item.id === feature)?.plans.includes(plan) ?? false;

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
