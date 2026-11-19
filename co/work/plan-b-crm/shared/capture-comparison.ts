import { entityNames, SnapshotSchema, reconcile, type CrmRecord, type CrmSnapshot, type EntityName, type FieldValue, type Link } from './model.js';

export class CaptureComparisonError extends Error {
  constructor(public code: 'INVALID_CAPTURE' | 'SOURCE_MISMATCH', message: string) { super(message); }
}
type ChangeKind = 'added' | 'absent' | 'changed';
export interface ValuePreview { present: boolean; value: FieldValue; truncated: boolean }
export interface RecordDifference {
  entity: EntityName; id: string; kind: ChangeKind; beforeLabel: string | null; afterLabel: string | null;
  totalFieldChanges: number;
  fields: { key: string; before: ValuePreview; after: ValuePreview }[];
  fieldsTruncated: boolean;
}
export interface CaptureComparison {
  chronological: boolean;
  records: {
    counts: Record<EntityName, { added: number; absent: number; changed: number; unchanged: number }>;
    totalDifferences: number; offset: number; limit: number; truncated: boolean; items: RecordDifference[];
  };
  schema: {
    totalFieldChanges: number; truncated: boolean;
    fields: { entity: EntityName; key: string; kind: ChangeKind; aspects: string[] }[];
    configurationSections: string[];
  };
  relations: {
    added: number; absent: number; unchanged: number; changedGroups: number; truncated: boolean;
    items: { kind: 'added' | 'absent'; count: number; link: Link }[];
  };
  limitations: string[];
}
const compare = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
function clip(value: string, limit: number) {
  let end = Math.min(value.length, limit);
  if (end > 0 && end < value.length && value.charCodeAt(end - 1) >= 0xd800 && value.charCodeAt(end - 1) <= 0xdbff && value.charCodeAt(end) >= 0xdc00 && value.charCodeAt(end) <= 0xdfff) end--;
  return value.slice(0, end);
}
// Object property order is irrelevant; array order remains part of declared configuration.
function canonical(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.keys(value).sort(compare).map(key => JSON.stringify(key) + ':' + canonical((value as Record<string, unknown>)[key])).join(',') + '}';
  return JSON.stringify(value) ?? 'null';
}
function validate(raw: CrmSnapshot) {
  const parsed = SnapshotSchema.safeParse(raw);
  if (!parsed.success || !reconcile(parsed.data).complete) throw new CaptureComparisonError('INVALID_CAPTURE', 'Las dos capturas deben tener formato válido y estar conciliadas.');
  return parsed.data;
}
function preview(record: CrmRecord | undefined, key: string): ValuePreview {
  const present = !!record && Object.hasOwn(record.values, key), value = present ? record!.values[key] : null;
  return { present, value: typeof value === 'string' ? clip(value, 500) : value, truncated: typeof value === 'string' && value.length > 500 };
}
function label(record: CrmRecord | undefined, snapshot: CrmSnapshot) {
  if (!record) return null;
  const field = snapshot.entities.find(e => e.id === record.entity)!.displayField;
  return clip(String(record.values[field] ?? record.id), 180);
}
function links(snapshot: CrmSnapshot) {
  const result = new Map<string, { count: number; link: Link }>();
  for (const link of snapshot.links) {
    const key = JSON.stringify([link.fromEntity, link.fromId, link.toEntity, link.toId, link.label]);
    const current = result.get(key); if (current) current.count++; else result.set(key, { count: 1, link });
  }
  return result;
}

/** Historical observation only: absence in a capture never proves a deletion in the remote CRM. */
export function compareCaptures(fromRaw: CrmSnapshot, toRaw: CrmSnapshot, options: { offset?: number; limit?: number } = {}): CaptureComparison {
  const { offset = 0, limit = 50 } = options;
  if (!Number.isInteger(offset) || offset < 0 || offset > 20_000 || !Number.isInteger(limit) || limit < 1 || limit > 200) throw new RangeError('Paginación fuera de límites.');
  const from = validate(fromRaw), to = validate(toRaw);
  if (!from.source.accountId.trim() || !to.source.accountId.trim() || from.source.accountId !== to.source.accountId
    || from.source.kind !== to.source.kind || from.source.isTestData !== to.source.isTestData
    || from.source.environment !== to.source.environment) {
    throw new CaptureComparisonError('SOURCE_MISMATCH', 'Compara capturas del mismo portal, origen y entorno explícito.');
  }
  const result: CaptureComparison = {
    chronological: Date.parse(from.capturedAt) <= Date.parse(to.capturedAt),
    records: { counts: Object.fromEntries(entityNames.map(entity => [entity, { added: 0, absent: 0, changed: 0, unchanged: 0 }])) as CaptureComparison['records']['counts'], totalDifferences: 0, offset, limit, truncated: false, items: [] },
    schema: { totalFieldChanges: 0, truncated: false, fields: [], configurationSections: [] },
    relations: { added: 0, absent: 0, unchanged: 0, changedGroups: 0, truncated: false, items: [] },
    limitations: [
      'Comparación de dos capturas locales conciliadas; no consulta ni modifica el CRM, la copia activa o sus cambios pendientes.',
      'Ausente significa que el registro o relación no figura en la segunda captura; no acredita un borrado remoto.',
      'Los valores son vistas previas de hasta 500 caracteres, con un máximo de 20 campos por registro; las comparaciones usan los valores completos.',
      'Recuentos completos antes de paginar registros; esquema y relaciones muestran muestras acotadas de 50 y 25 grupos.',
      'Un cambio de esquema no se interpreta automáticamente como cambio de datos o como aprobación para devolverlos.',
    ],
  };
  for (const entity of entityNames) {
    const before = new Map(from.records.filter(r => r.entity === entity).map(r => [r.id, r]));
    const after = new Map(to.records.filter(r => r.entity === entity).map(r => [r.id, r]));
    for (const id of [...new Set([...before.keys(), ...after.keys()])].sort(compare)) {
      const a = before.get(id), b = after.get(id);
      const keys = [...new Set([...Object.keys(a?.values ?? {}), ...Object.keys(b?.values ?? {})])].sort(compare)
        .filter(key => !a || !b || Object.hasOwn(a.values, key) !== Object.hasOwn(b.values, key) || a.values[key] !== b.values[key]);
      const kind = !a ? 'added' : !b ? 'absent' : keys.length ? 'changed' : 'unchanged';
      result.records.counts[entity][kind]++;
      if (kind === 'unchanged') continue;
      const index = result.records.totalDifferences++;
      if (index < offset || index >= offset + limit) continue;
      result.records.items.push({ entity, id, kind, beforeLabel: label(a, from), afterLabel: label(b, to), totalFieldChanges: keys.length, fields: keys.slice(0, 20).map(key => ({ key, before: preview(a, key), after: preview(b, key) })), fieldsTruncated: keys.length > 20 });
    }
    const a = from.entities.find(e => e.id === entity)!, b = to.entities.find(e => e.id === entity)!;
    const oldFields = new Map(a.fields.map(field => [field.key, field])), newFields = new Map(b.fields.map(field => [field.key, field]));
    for (const key of [...new Set([...oldFields.keys(), ...newFields.keys()])].sort(compare)) {
      const oldField = oldFields.get(key), newField = newFields.get(key);
      const aspects = [...new Set([...Object.keys(oldField ?? {}), ...Object.keys(newField ?? {})])].sort(compare)
        .filter(part => canonical(oldField?.[part as keyof typeof oldField]) !== canonical(newField?.[part as keyof typeof newField]));
      if (!oldField || !newField || aspects.length) {
        result.schema.totalFieldChanges++;
        if (result.schema.fields.length < 50) result.schema.fields.push({ entity, key, kind: !oldField ? 'added' : !newField ? 'absent' : 'changed', aspects });
      }
    }
    const presentation = ({ fields: _fields, ...rest }: typeof a) => rest;
    if (canonical(presentation(a)) !== canonical(presentation(b))) result.schema.configurationSections.push('entities.' + entity);
    if (canonical(a.fields.map(f => f.key)) !== canonical(b.fields.map(f => f.key))) result.schema.configurationSections.push('entities.' + entity + '.fieldOrder');
  }
  for (const key of ['stages', 'rules', 'pipelines', 'unsupported'] as const) if (canonical(from[key]) !== canonical(to[key])) result.schema.configurationSections.push(key);
  const oldLinks = links(from), newLinks = links(to);
  for (const key of [...new Set([...oldLinks.keys(), ...newLinks.keys()])].sort(compare)) {
    const a = oldLinks.get(key), b = newLinks.get(key), oldCount = a?.count ?? 0, newCount = b?.count ?? 0;
    result.relations.unchanged += Math.min(oldCount, newCount);
    if (newCount === oldCount) continue;
    const kind = newCount > oldCount ? 'added' : 'absent', count = Math.abs(newCount - oldCount);
    result.relations[kind] += count; result.relations.changedGroups++;
    if (result.relations.items.length < 25) result.relations.items.push({ kind, count, link: { ...(b ?? a)!.link } });
  }
  result.records.truncated = offset + result.records.items.length < result.records.totalDifferences;
  result.schema.truncated = result.schema.totalFieldChanges > result.schema.fields.length;
  result.relations.truncated = result.relations.changedGroups > result.relations.items.length;
  return result;
}
