import type { AppSpec, CrmRecord, EntityName } from '../../shared/model.js';

/** Un tipo de registro que apunta al registro abierto mediante un campo de referencia. */
export type RelatedSource = { entity: EntityName; label: string; fieldKey: string; fieldLabel: string };
export type RelatedGroup = RelatedSource & { records: CrmRecord[]; /** registros revisados */ scanned: number; /** registros que existen de ese tipo */ total: number };
export type RecordPage = { records: CrmRecord[]; total: number };

export const PAGE_SIZE = 100, MAX_PAGES = 3;

/** Qué campos de qué tipos de registro apuntan al tipo `target` (p. ej. las tareas y las oportunidades apuntan a un cliente). */
export function sourcesFor(spec: AppSpec, target: EntityName): RelatedSource[] {
  return spec.entities.flatMap(entity => entity.fields
    .filter(field => field.type === 'reference' && field.referenceEntity === target)
    .map(field => ({ entity: entity.id, label: entity.label, fieldKey: field.key, fieldLabel: field.label })));
}

/** Registros de una página cuyo campo de referencia apunta exactamente a `id`. */
export const pointingTo = (records: CrmRecord[], fieldKey: string, id: string) => records.filter(record => String(record.values[fieldKey] ?? '') === id);

/** Lee, tipo por tipo, los registros que apuntan a `record`. Solo consulta: recorre como mucho MAX_PAGES páginas de PAGE_SIZE por tipo
 *  y devuelve cuántos revisó frente a cuántos hay, para que la interfaz no dé por completo lo que no lo es. */
export async function loadRelated(
  spec: AppSpec,
  record: Pick<CrmRecord, 'entity' | 'id'>,
  fetchPage: (entity: EntityName, offset: number, limit: number) => Promise<RecordPage>,
  signal?: AbortSignal,
): Promise<RelatedGroup[]> {
  signal?.throwIfAborted();
  const groups: RelatedGroup[] = [];
  const pages = new Map<EntityName, { records: CrmRecord[]; total: number }>();
  for (const source of sourcesFor(spec, record.entity)) {
    let loaded = pages.get(source.entity);
    if (!loaded) {
      loaded = { records: [], total: 0 };
      for (let page = 0; page < MAX_PAGES; page++) {
        const result = await fetchPage(source.entity, page * PAGE_SIZE, PAGE_SIZE);
        signal?.throwIfAborted();
        loaded.records.push(...result.records); loaded.total = result.total;
        if (loaded.records.length >= result.total || result.records.length === 0) break;
      }
      pages.set(source.entity, loaded);
    }
    groups.push({ ...source, records: pointingTo(loaded.records, source.fieldKey, record.id), scanned: loaded.records.length, total: loaded.total });
  }
  return groups;
}
