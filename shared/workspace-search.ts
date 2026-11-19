import { entityNames, MAX_RECORDS, type AppSpec, type CrmRecord, type Entity, type EntityName, type Field } from './model.js';
import { z } from 'zod';

const WorkspaceSearchContextSchema = z.object({
  instanceId: z.string().uuid(), captureId: z.string().min(1).max(800),
  accountId: z.string(), capturedAt: z.string(), isTestData: z.boolean(),
  contextRevision: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();
export type WorkspaceSearchContext = z.infer<typeof WorkspaceSearchContextSchema>;
export type WorkspaceSearchSource = WorkspaceSearchContext & { revision: string };
/** Select only public identity fields; a search response also contains its workspace revision. */
export function parseWorkspaceSearchContext(value: unknown): WorkspaceSearchContext | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const parsed = WorkspaceSearchContextSchema.safeParse({ instanceId: raw.instanceId, captureId: raw.captureId,
    accountId: raw.accountId, capturedAt: raw.capturedAt, isTestData: raw.isTestData, contextRevision: raw.contextRevision });
  return parsed.success ? parsed.data : null;
}
export function sameWorkspaceSearchContext(expected: WorkspaceSearchContext, value: unknown): boolean {
  const actual = parseWorkspaceSearchContext(value);
  return !!actual && Object.entries(expected).every(([key, item]) => actual[key as keyof WorkspaceSearchContext] === item);
}

export interface WorkspaceSearchHit {
  entity: EntityName; id: string; label: string; matchedId: boolean;
  matches: { field: string; label: string; preview: string; truncated: boolean }[];
  totalMatchedFields: number;
}
export interface WorkspaceSearchResult {
  query: string; offset: number; limit: number; total: number; hasMore: boolean;
  counts: Record<EntityName, number>; items: WorkspaceSearchHit[];
}
export const normalizeSearch = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es-ES').replace(/\s+/gu, ' ').trim();
function clip(value: string, max: number) {
  let end = Math.min(value.length, max);
  if (end < value.length && end > 0 && /[\uD800-\uDBFF]/.test(value[end - 1]) && /[\uDC00-\uDFFF]/.test(value[end])) end--;
  return { text: value.slice(0, end), truncated: end < value.length };
}
// Map normalized offsets back to the original Unicode code points so a late match is visible without splitting a pair.
function preview(value: string, terms: string[]) {
  let normalized = ''; const offsets: number[] = []; let offset = 0;
  for (const char of value) {
    const mapped = char.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es-ES');
    for (let i = 0; i < mapped.length; i++) offsets.push(offset);
    normalized += mapped; offset += char.length;
  }
  const found = terms.map(term => normalized.indexOf(term)).filter(index => index >= 0);
  let start = found.length ? Math.max(0, offsets[Math.min(...found)] - 35) : 0;
  if (start > 0 && /[\uDC00-\uDFFF]/.test(value[start])) start--;
  const part = clip(value.slice(start), 180);
  return { preview: (start ? '…' : '') + part.text + (part.truncated ? '…' : ''), truncated: start > 0 || part.truncated };
}
const cmp = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;

export interface PreparedSearchRecord {
  readonly record: CrmRecord; readonly id: string; readonly name: string; readonly normalizedName: string;
  readonly values: readonly { field: Field; text: string; normalized: string }[];
}
/** Searchable text of one spec + record list, normalized once. Only valid for exactly those two objects. */
export interface PreparedWorkspaceSearch { readonly spec: AppSpec; readonly records: readonly CrmRecord[]; readonly items: readonly PreparedSearchRecord[] }

/**
 * Normalizes every searchable text once so that several queries over the same copy reuse it (CLAUDE-SEARCH-PERF-R).
 * Pure: same fields, labels and normalization as a search without preparation. Records without a declared entity are skipped.
 * `reuse` may return the item prepared earlier for a record with IDENTICAL content under an IDENTICAL spec; the caller guarantees it.
 */
export function prepareWorkspaceSearch(spec: AppSpec, records: readonly CrmRecord[], reuse?: (record: CrmRecord, index: number) => PreparedSearchRecord | undefined): PreparedWorkspaceSearch {
  const definitions = new Map<string, Entity>(spec.entities.map(entity => [entity.id, entity]));
  const items: PreparedSearchRecord[] = [];
  for (const [index, record] of records.entries()) {
    const definition = definitions.get(record.entity); if (!definition) continue;
    const previous = reuse?.(record, index);
    if (previous) { items.push(previous); continue; }
    const values = definition.fields.flatMap(field => {
      const value = record.values[field.key]; if (value === undefined || value === null || value === '') return [];
      const text = typeof value === 'string' && field.type === 'enum' ? (field.options.find(option => option.id === value)?.label ?? '') + ' · ' + value : String(value);
      return [{ field, text, normalized: normalizeSearch(text) }];
    });
    const display = record.values[definition.displayField];
    const name = String(display === undefined || display === null || typeof display === 'string' && !display.trim() ? record.id : display) + (record.entity === 'contacts' && record.values.lastname && definition.fields.some(field => field.key === 'lastname') ? ' ' + record.values.lastname : '');
    items.push({ record, id: normalizeSearch(record.id), values, name, normalizedName: normalizeSearch(name) });
  }
  return { spec, records, items };
}

/**
 * Searches only the supplied active records and declared fields. No remote lookup, writes or hidden-field fallback.
 * `prepared` is reused only when it was built from these same `spec` and `records` objects; otherwise it is rebuilt.
 */
export function searchWorkspace(input: { spec: AppSpec; records: CrmRecord[]; query: string; entities?: EntityName[]; offset?: number; limit?: number; prepared?: PreparedWorkspaceSearch }): WorkspaceSearchResult {
  const query = input.query.trim(), normalized = normalizeSearch(query), terms = [...new Set(normalized.split(' ').filter(Boolean))];
  const offset = input.offset ?? 0, limit = input.limit ?? 25, selected = input.entities ?? [...entityNames];
  if (query.length < 2 || query.length > 160 || !normalized || terms.length > 12) throw new RangeError('Escribe entre 2 y 160 caracteres, con un máximo de 12 términos.');
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > MAX_RECORDS || !Number.isSafeInteger(limit) || limit < 1 || limit > 50) throw new RangeError('Página fuera de límites.');
  if (!selected.length || new Set(selected).size !== selected.length || selected.some(entity => !entityNames.includes(entity))) throw new TypeError('Tipos de registros inválidos.');
  if (input.records.length > MAX_RECORDS) throw new RangeError('Máximo 10.000 registros.');
  const counts = Object.fromEntries(entityNames.map(entity => [entity, 0])) as Record<EntityName, number>;
  const prepared = input.prepared && input.prepared.spec === input.spec && input.prepared.records === input.records
    ? input.prepared : prepareWorkspaceSearch(input.spec, input.records);
  const found: { item: PreparedSearchRecord; matching: PreparedSearchRecord['values']; score: number; name: string }[] = [];
  for (const item of prepared.items) {
    const { record, id, values, normalizedName } = item;
    if (!terms.every(term => id.includes(term) || values.some(value => value.normalized.includes(term)))) continue;
    counts[record.entity]++;
    if (!selected.includes(record.entity)) continue;
    const matching = values.filter(value => terms.some(term => value.normalized.includes(term)));
    const score = id === normalized ? 0 : normalizedName === normalized ? 1 : normalizedName.startsWith(normalized) ? 2 : terms.every(term => normalizedName.includes(term)) ? 3 : 4;
    found.push({ item, matching, score, name: normalizedName });
  }
  found.sort((a, b) => a.score - b.score || cmp(a.name, b.name) || entityNames.indexOf(a.item.record.entity) - entityNames.indexOf(b.item.record.entity) || cmp(a.item.record.id, b.item.record.id));
  // The order never depends on labels or previews, so they are built only for the returned page.
  const items: WorkspaceSearchHit[] = found.slice(offset, offset + limit).map(({ item: { record, id, name }, matching }) => ({
    entity: record.entity, id: record.id, label: clip(name, 160).text, matchedId: terms.some(term => id.includes(term)),
    totalMatchedFields: matching.length, matches: matching.slice(0, 3).map(value => ({ field: value.field.key, label: value.field.label, ...preview(value.text, terms) })),
  }));
  return { query, offset, limit, total: found.length, hasMore: offset + limit < found.length, counts, items };
}
