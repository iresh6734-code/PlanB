// Cuarentena de capturas que encogen (misión maestra A2, 22/11/2026). Lógica pura y compartida.
// Una captura puede estar completa respecto a su propio manifiesto (addCapture ya rechaza las que no) y aun así traer muchos
// menos registros que la anterior: un borrado masivo en HubSpot, permisos recortados o una integración que vació datos.
// Esa captura se CONSERVA, pero queda en cuarentena: no se abre para trabajar sin una confirmación ligada a ella.
// Se compara cada tipo de objeto por separado (un total agregado podría ocultar que desaparece uno entero).
import type { CrmSnapshot, EntityName } from './model.js';

export type Counts = Partial<Record<EntityName, number>>;
export interface ShrinkReason { entity: EntityName; before: number; after: number }
export interface QuarantineEntry { at: string; reasons: ShrinkReason[]; total: { before: number; after: number } }

/** Por debajo de este tamaño previo, una caída proporcional no es significativa (salvo que desaparezcan todos). */
export const SHRINK_MIN_BEFORE = 10;
/** Proporción mínima que debe conservar cada objeto respecto a la captura anterior. */
export const SHRINK_KEEP = 0.8;
const ENTITIES: EntityName[] = ['contacts', 'companies', 'deals', 'tasks'];

export function snapshotCounts(snapshot: Pick<CrmSnapshot, 'records'>): Counts {
  const counts: Counts = {};
  for (const record of snapshot.records) counts[record.entity] = (counts[record.entity] ?? 0) + 1;
  return counts;
}

/** null = no hay motivo de cuarentena. La primera captura solo se retiene si viene vacía. */
export function assessShrink(previous: Counts | null, next: Counts, at: string): QuarantineEntry | null {
  const sum = (counts: Counts) => ENTITIES.reduce((total, entity) => total + (counts[entity] ?? 0), 0);
  const after = sum(next);
  if (!previous) return after === 0 ? { at, reasons: [], total: { before: 0, after } } : null;
  const reasons: ShrinkReason[] = [];
  for (const entity of ENTITIES) {
    const before = previous[entity] ?? 0, now = next[entity] ?? 0;
    if (before > 0 && now === 0) reasons.push({ entity, before, after: now });
    else if (before >= SHRINK_MIN_BEFORE && now < before * SHRINK_KEEP) reasons.push({ entity, before, after: now });
  }
  return reasons.length ? { at, reasons, total: { before: sum(previous), after } } : null;
}

const LABEL: Record<EntityName, string> = { contacts: 'Clientes', companies: 'Empresas', deals: 'Oportunidades', tasks: 'Tareas' };
/** «Clientes 120 → 60 · Tareas 40 → 0» o «La captura no trae ningún registro». */
export function shrinkText(entry: QuarantineEntry): string {
  return entry.reasons.length ? entry.reasons.map(reason => LABEL[reason.entity] + ' ' + reason.before + ' → ' + reason.after).join(' · ') : 'La captura no trae ningún registro';
}
