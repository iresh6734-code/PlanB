import type { CrmRecord, EntityName, FieldValue } from './model.js';
import type { RecoveryPlan } from './operations.js';

/** T6 «Comprobar la devolución»: relee en el destino cada operación ya verificada de un plan y dice si sigue con lo que se
 *  envió. Solo lee: no cambia el plan, la copia ni el destino. */
export type ReturnCheckState = 'same' | 'changed' | 'missing';
export interface ReturnCheckField { field: string; label: string; sent: FieldValue; now: FieldValue }
export interface ReturnCheckItem {
  operationId: string; entity: EntityName; label: string; kind: 'create' | 'update'; remoteId: string;
  state: ReturnCheckState; checked: number; fields: ReturnCheckField[];
}
export interface ReturnCheck {
  planId: string; source: RecoveryPlan['source']; checkedAt: string; items: ReturnCheckItem[];
  summary: { same: number; changed: number; missing: number; notSent: number; skipped: number };
}
export const RETURN_CHECK_LIMIT = 200;
const equal = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

export async function checkReturn(plan: RecoveryPlan, read: (entity: EntityName, id: string) => Promise<CrmRecord | null>, checkedAt: string): Promise<ReturnCheck> {
  const applied = plan.operations.filter(op => op.status === 'applied' && op.remoteId);
  const items: ReturnCheckItem[] = [];
  for (const op of applied.slice(0, RETURN_CHECK_LIMIT)) {
    const sent = op.fields.filter(field => field.decision === 'local'), record = await read(op.entity, op.remoteId!);
    const fields = record ? sent.filter(field => !equal(record.values[field.field], field.local))
      .map(field => ({ field: field.field, label: field.label, sent: field.local ?? null, now: record.values[field.field] ?? null })) : [];
    items.push({ operationId: op.id, entity: op.entity, label: op.label, kind: op.kind, remoteId: op.remoteId!, state: !record ? 'missing' : fields.length ? 'changed' : 'same', checked: sent.length, fields });
  }
  const count = (state: ReturnCheckState) => items.filter(item => item.state === state).length;
  return {
    planId: plan.id, source: plan.source, checkedAt, items,
    summary: { same: count('same'), changed: count('changed'), missing: count('missing'), notSent: plan.operations.length - applied.length, skipped: applied.length - items.length },
  };
}
