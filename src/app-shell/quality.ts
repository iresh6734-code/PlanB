import type { AppSpec, CrmRecord, EntityName } from '../../shared/model.js';
import { MAX_PAGES, PAGE_SIZE, type RecordPage } from './related.js';

/** Un aviso de calidad sobre un registro concreto. Son comprobaciones de forma, no de negocio: no deciden nada ni cambian datos. */
export type QualityIssue = { kind: 'required' | 'email' | 'duplicate' | 'dangling'; record: CrmRecord; field: string; text: string };
export type QualityReport = { issues: QualityIssue[]; scanned: number; total: number; complete: boolean; unstable?: true };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const empty = (value: unknown) => value === null || value === undefined || (typeof value === 'string' && value.trim() === '');
const norm = (value: unknown) => String(value ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();

/** Revisa los registros dados según la especificación de la app:
 *  - campos obligatorios vacíos,
 *  - correos con formato no válido,
 *  - posibles duplicados (mismo correo, o mismo nombre visible dentro del mismo tipo),
 *  - referencias a un registro que no existe (solo si ese tipo se revisó completo; si no, no se puede afirmar). */
export function checkQuality(spec: AppSpec, records: CrmRecord[], completeEntities: ReadonlySet<EntityName>): QualityIssue[] {
  const issues: QualityIssue[] = [];
  const ids = new Set(records.map(record => record.entity + ':' + record.id));
  for (const entity of spec.entities) {
    const own = records.filter(record => record.entity === entity.id);
    for (const record of own) {
      for (const field of entity.fields) {
        const value = record.values[field.key];
        if (field.required && !field.readOnly && empty(value) && field.type !== 'boolean') issues.push({ kind: 'required', record, field: field.key, text: 'Falta ' + field.label.toLowerCase() });
        else if (field.type === 'email' && !empty(value) && !EMAIL.test(String(value).trim())) issues.push({ kind: 'email', record, field: field.key, text: field.label + ' con formato no válido' });
        else if (field.type === 'reference' && field.referenceEntity && !empty(value) && completeEntities.has(field.referenceEntity) && !ids.has(field.referenceEntity + ':' + String(value)))
          issues.push({ kind: 'dangling', record, field: field.key, text: field.label + ' apunta a un registro que no está en la copia' });
      }
    }
    // Duplicados: por correo en cualquier tipo, y por nombre completo solo en clientes y empresas (dos tareas u oportunidades
    // pueden llamarse igual con todo derecho). Se señala a partir del segundo registro que repite el valor, citando el primero.
    const name = (record: CrmRecord) => norm(record.values[entity.displayField]) + (entity.id === 'contacts' ? ' ' + norm(record.values.lastname) : '');
    const label = (record: CrmRecord) => (String(record.values[entity.displayField] ?? record.id) + (entity.id === 'contacts' && record.values.lastname ? ' ' + record.values.lastname : '')).trim();
    const keys: [string, (record: CrmRecord) => string][] = [
      ...(entity.id === 'contacts' || entity.id === 'companies' ? [[entity.displayField, name] as [string, (record: CrmRecord) => string]] : []),
      ...entity.fields.filter(field => field.type === 'email').map(field => [field.key, (record: CrmRecord) => norm(record.values[field.key])] as [string, (record: CrmRecord) => string])
    ];
    for (const [key, valueOf] of keys) {
      const seen = new Map<string, CrmRecord>();
      for (const record of own) {
        const value = valueOf(record).trim(); if (!value) continue;
        const first = seen.get(value);
        if (first) issues.push({ kind: 'duplicate', record, field: key, text: 'Posible duplicado de «' + label(first) + '»' });
        else seen.set(value, record);
      }
    }
  }
  // Un mismo registro y campo solo se cuenta una vez.
  const unique = new Map<string, QualityIssue>();
  for (const issue of issues) unique.set(issue.record.entity + ':' + issue.record.id + ':' + issue.field + ':' + issue.kind, issue);
  return [...unique.values()];
}

/** Lee la copia (como mucho MAX_PAGES de PAGE_SIZE por tipo) y la revisa. Dice cuánto revisó frente a cuánto hay. */
export async function loadQuality(
  spec: AppSpec,
  fetchPage: (entity: EntityName, offset: number, limit: number) => Promise<RecordPage>,
  signal?: AbortSignal,
): Promise<QualityReport> {
  signal?.throwIfAborted();
  const records: CrmRecord[] = [];
  const complete = new Set<EntityName>();
  let total = 0, unstable = false;
  for (const entity of spec.entities) {
    const own = new Map<string, CrmRecord>();
    let count: number | undefined;
    let consistent = true;
    for (let page = 0; page < MAX_PAGES; page++) {
      const offset = page * PAGE_SIZE;
      const result = await fetchPage(entity.id, offset, PAGE_SIZE);
      signal?.throwIfAborted();
      if (!Number.isSafeInteger(result.total) || result.total < 0) throw Error('La copia no devolvió un recuento de registros válido.');
      const expected = Math.min(PAGE_SIZE, Math.max(0, result.total - offset));
      if ((count !== undefined && count !== result.total) || result.records.length !== expected) consistent = false;
      count ??= result.total;
      for (const record of result.records) {
        if (record.entity !== entity.id || own.has(record.id)) consistent = false;
        else own.set(record.id, record);
      }
      if (own.size >= result.total || result.records.length === 0) break;
    }
    if (consistent && own.size === count) complete.add(entity.id);
    if (!consistent) unstable = true;
    records.push(...own.values());
    total += Math.max(count ?? 0, own.size);
  }
  return {
    issues: checkQuality(spec, records, complete), scanned: records.length, total,
    complete: complete.size === spec.entities.length, ...(unstable ? { unstable: true } : {}),
  };
}
