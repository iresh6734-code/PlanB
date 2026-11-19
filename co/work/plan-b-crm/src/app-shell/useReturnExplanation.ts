// Devolución explicada en la pantalla de Cambios (C4, segunda parte; CLAUDE-RETURN-EXPLAIN-UI, 18/11/2026).
// La explicación (shared/return-explain.ts) necesita los registros del plan para nombrar empresas y personas y agrupar
// por cliente. Aquí se cargan SOLO esos, por la ruta de lectura que ya existe, y se aplica la explicación. Sin rutas nuevas.
import { useEffect, useState } from 'react';
import type { AppSpec, CrmRecord, EntityName } from '../../shared/model.js';
import type { RecoveryPlan } from '../../shared/operations.js';
import { explainReturnPlan, type ReturnExplanation } from '../../shared/return-explain.js';
import { api } from '../api.js';

const MAX_RECORDS = 400, ROUNDS = 3;
type Fetch = (entity: EntityName, id: string) => Promise<CrmRecord | null>;

/**
 * Registros que necesita la explicación: los de cada operación y, en hasta tres rondas, los que ellos enlazan (su empresa,
 * su persona y la empresa de esa persona, más los destinos de las relaciones del plan). Cada uno se pide una sola vez;
 * los que no existen o fallan se omiten (la explicación dice entonces «un registro que ya no está en la copia»). Pura
 * salvo por `fetchRecord`.
 */
export async function collectRecords(plan: RecoveryPlan, spec: AppSpec, fetchRecord: Fetch): Promise<CrmRecord[]> {
  const found = new Map<string, CrmRecord>(), asked = new Set<string>();
  const ask = async (wanted: [EntityName, string][]) => {
    const fresh = wanted.filter(([entity, id]) => { const key = entity + ':' + id; if (asked.has(key) || asked.size >= MAX_RECORDS) return false; asked.add(key); return true; });
    const results = await Promise.all(fresh.map(([entity, id]) => fetchRecord(entity, id).catch(() => null)));
    const added = results.filter((record): record is CrmRecord => !!record);
    for (const record of added) found.set(record.entity + ':' + record.id, record);
    return added;
  };
  let round = await ask([...plan.operations.map(op => [op.entity, op.localId] as [EntityName, string]), ...plan.operations.flatMap(op => op.references.filter(ref => ref.id).map(ref => [ref.entity, ref.id!] as [EntityName, string]))]);
  for (let i = 1; i < ROUNDS && round.length; i++) {
    const links = round.flatMap(record => (spec.entities.find(e => e.id === record.entity)?.fields ?? [])
      .filter(field => field.type === 'reference' && field.referenceEntity && record.values[field.key])
      .map(field => [field.referenceEntity!, String(record.values[field.key])] as [EntityName, string]));
    round = await ask(links);
  }
  return [...found.values()];
}

/** Clave que cambia cuando cambia lo que se explica: el plan, su estado y cada decisión. */
export const planKey = (plan: RecoveryPlan | null) => plan ? JSON.stringify([plan.id, plan.status, plan.operations.map(op => [op.id, op.status, op.fields.map(f => [f.field, f.decision, f.remote])])]) : '';

/** Explicación del plan para la pantalla; null mientras carga, si no hay plan o si no se pudo preparar. */
export function useReturnExplanation(plan: RecoveryPlan | null, spec: AppSpec | null): ReturnExplanation | null {
  // La explicación se guarda con la clave del plan y la especificación para los que se calculó. Solo se devuelve si
  // coinciden con lo que se está pintando ahora: con un plan nuevo y su lectura pendiente, la pantalla usa el respaldo
  // desde el primer pintado, sin esperar a que corra ningún efecto (R2, revisión 430 F2).
  const [stored, setStored] = useState<{ key: string; spec: AppSpec; explanation: ReturnExplanation } | null>(null);
  const key = planKey(plan);
  useEffect(() => {
    if (!plan || !spec) return;
    let alive = true;
    const fetchRecord: Fetch = (entity, id) => api<{ record: CrmRecord }>('/v2/records/' + entity + '/' + encodeURIComponent(id)).then(data => data.record);
    collectRecords(plan, spec, fetchRecord)
      .then(records => { if (alive) setStored({ key, spec, explanation: explainReturnPlan(plan, spec, records) }); })
      .catch(() => undefined);
    return () => { alive = false; };
  }, [key, spec]);
  return explanationFor(stored, key, spec);
}

/** La explicación guardada solo vale para el mismo plan (clave) y la misma especificación. Lógica pura. */
export const explanationFor = (stored: { key: string; spec: AppSpec; explanation: ReturnExplanation } | null, key: string, spec: AppSpec | null) =>
  stored && key && stored.key === key && stored.spec === spec ? stored.explanation : null;
