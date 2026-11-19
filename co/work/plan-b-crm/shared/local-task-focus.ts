import { z } from 'zod';
import { AppSpecSchema, EntitySchema, RecordSchema, RuleSchema, validateRecord, type AppSpec, type CrmRecord, type Entity, type FieldValue, type Rule } from './model.js';

// Contrato y lógica pura de la ficha de una tarea local. Solo entidad `tasks`. No toca la red.
// El servidor no compara versiones ni admite claves de idempotencia: nada de aquí lo simula.

export interface TaskContext {
  instanceId: string | null; snapshotId: string | null; snapshotName: string | null; capturedAt: string | null;
  captureStartedAt: string | null; accountId: string | null; generatedAt: string | null;
  isTestData: boolean | null; ready: boolean; runtime: boolean;
  contextRevision?: string;
}
// Identidad de la copia. El ID de captura NO basta: una captura nueva puede reutilizarlo con otra fecha (revisión 131, F2).
// La clave de agrupación del historial conserva sus seis campos. Para validar una observación usa también la huella.
export const contextKey = (context: Pick<TaskContext, 'instanceId' | 'snapshotId' | 'capturedAt' | 'captureStartedAt' | 'accountId' | 'generatedAt'>) =>
  JSON.stringify([context.instanceId, context.snapshotId, context.capturedAt, context.captureStartedAt, context.accountId, context.generatedAt]);
export const sameTaskCapture = (a: TaskContext, b: TaskContext) =>
  contextKey(a) === contextKey(b) && a.contextRevision === b.contextRevision;
export interface TaskSchema { entity: Entity; rules: Rule[]; spec: AppSpec | null; }
export interface TaskFocusProps {
  taskId: string;
  onClose: () => void;
  onSaved: (record: CrmRecord) => Promise<void>;
  onPrepare: () => void;
}

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
export function parseHealth(raw: unknown): { instanceId: string | null } | null {
  if (!isObject(raw) || raw.ok !== true) return null;
  return { instanceId: typeof raw.instanceId === 'string' ? raw.instanceId : null };
}
export interface ParsedState { context: Omit<TaskContext, 'instanceId'>; schema: TaskSchema | null; changes: number; }
const SnapshotIdentity = z.looseObject({ id: z.string().min(1), name: z.string(), capturedAt: z.string(), captureStartedAt: z.string().optional(), source: z.looseObject({ isTestData: z.boolean(), accountId: z.string().optional() }) });
const GenerationIdentity = z.looseObject({ generatedAt: z.string() });
// El estado compacto de /api/v2/state no trae registros. Una copia importada sin activar no tiene `spec`, pero sí las
// definiciones de campos en `snapshot.entities`; sirven para mostrar valores, nunca para editar.
export function parseState(raw: unknown): ParsedState | null {
  if (!isObject(raw) || typeof raw.ready !== 'boolean' || typeof raw.runtime !== 'boolean') return null;
  const changes = typeof raw.changes === 'number' && Number.isFinite(raw.changes) ? raw.changes : 0;
  const base = { ready: raw.ready, runtime: raw.runtime };
  const noIdentity = { captureStartedAt: null, accountId: null, generatedAt: null };
  if (raw.snapshot === null || raw.snapshot === undefined) return { context: { ...base, ...noIdentity, snapshotId: null, snapshotName: null, capturedAt: null, isTestData: null }, schema: null, changes };
  const identity = SnapshotIdentity.safeParse(raw.snapshot);
  if (!identity.success) return null;
  const generation = GenerationIdentity.safeParse(raw.generation);
  const context = { ...base, snapshotId: identity.data.id, snapshotName: identity.data.name, capturedAt: identity.data.capturedAt, captureStartedAt: identity.data.captureStartedAt ?? null,
    accountId: identity.data.source.accountId ?? null, generatedAt: generation.success ? generation.data.generatedAt : null, isTestData: identity.data.source.isTestData };
  let schema: TaskSchema | null = null;
  if (raw.ready) {
    const spec = AppSpecSchema.safeParse(raw.spec);
    if (!spec.success) return null;
    const entity = spec.data.entities.find(item => item.id === 'tasks');
    schema = entity ? { entity, rules: spec.data.rules.filter(rule => rule.entity === 'tasks'), spec: spec.data } : null;
  } else {
    const entities = z.array(EntitySchema).safeParse((raw.snapshot as Record<string, unknown>).entities);
    const rules = z.array(RuleSchema).safeParse((raw.snapshot as Record<string, unknown>).rules);
    const entity = entities.success ? entities.data.find(item => item.id === 'tasks') : undefined;
    schema = entity ? { entity, rules: rules.success ? rules.data.filter(rule => rule.entity === 'tasks') : [], spec: null } : null;
  }
  return { context, schema, changes };
}
// La respuesta debe ser exactamente la tarea pedida: otro ID u otra entidad nunca abre un editor.
export function parseTaskRecord(raw: unknown, taskId: string): CrmRecord | null {
  if (!isObject(raw)) return null;
  const parsed = RecordSchema.safeParse(raw.record);
  return parsed.success && parsed.data.entity === 'tasks' && parsed.data.id === taskId ? parsed.data : null;
}

// --- Borrador y comparación ---
const norm = (value: FieldValue | undefined): FieldValue => value === undefined || value === '' ? null : value;
export const sameValue = (a: FieldValue | undefined, b: FieldValue | undefined) => norm(a) === norm(b);
export function changedKeys(entity: Entity, baseline: CrmRecord, draft: Record<string, FieldValue>): string[] {
  return entity.fields.filter(field => !field.readOnly && !sameValue(baseline.values[field.key], draft[field.key])).map(field => field.key);
}
// Solo viajan los campos cambiados: así una edición no sobrescribe a ciegas campos que no tocaste. No es control de
// concurrencia: si otra pestaña cambia el mismo campo a la vez, prevalece el último guardado.
export function buildPatch(entity: Entity, baseline: CrmRecord, draft: Record<string, FieldValue>): Record<string, FieldValue> {
  return Object.fromEntries(changedKeys(entity, baseline, draft).map(key => [key, norm(draft[key])]));
}
// Misma validación que aplica el servidor sobre el registro fusionado (valores previos + cambios).
export function validateDraft(spec: AppSpec, baseline: CrmRecord, patch: Record<string, FieldValue>): Record<string, string> {
  return validateRecord(spec, { entity: 'tasks', id: baseline.id, values: { ...baseline.values, ...patch } }, baseline);
}
export interface Conflict { key: string; label: string; baseline: FieldValue; current: FieldValue; }
// Comprobación previa al guardado: ¿cambió fuera de esta ficha algún campo que vas a enviar?
export function findConflicts(entity: Entity, baseline: CrmRecord, current: CrmRecord, patch: Record<string, FieldValue>): Conflict[] {
  return Object.keys(patch).filter(key => !sameValue(baseline.values[key], current.values[key]))
    .map(key => ({ key, label: entity.fields.find(field => field.key === key)?.label ?? key, baseline: norm(baseline.values[key]), current: norm(current.values[key]) }));
}
// Al aceptar los valores actuales tras un aviso: lo que NO editaste toma el valor nuevo (para no pisar a ciegas el cambio ajeno)
// y lo que sí editaste se conserva.
export function rebaseDraft(entity: Entity, oldBaseline: CrmRecord, newBaseline: CrmRecord, draft: Record<string, FieldValue>): Record<string, FieldValue> {
  const next: Record<string, FieldValue> = { ...newBaseline.values };
  for (const field of entity.fields) if (!field.readOnly && !sameValue(oldBaseline.values[field.key], draft[field.key])) next[field.key] = draft[field.key] ?? null;
  return next;
}
// Tras un acuse perdido: ¿qué dice la lectura posterior sobre el cambio que se intentó?
export type Evidence = 'applied' | 'unchanged' | 'diverged';
export function judgeAfterUncertain(baseline: CrmRecord, current: CrmRecord, patch: Record<string, FieldValue>): Evidence {
  const keys = Object.keys(patch);
  if (keys.every(key => sameValue(current.values[key], patch[key]))) return 'applied';
  if (keys.every(key => sameValue(current.values[key], baseline.values[key]))) return 'unchanged';
  return 'diverged';
}

// --- Presentación ---
// Fecha civil (YYYY-MM-DD): se formatea por texto, sin pasar por Date, para que la zona horaria no la mueva de día.
export function formatCivilDate(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return match ? Number(match[3]) + '/' + Number(match[2]) + '/' + match[1] : value;
}
export function formatInstant(value: string): string {
  const time = Date.parse(value);
  return Number.isFinite(time) ? new Date(time).toLocaleString('es-ES', { timeZone: 'Europe/Madrid', dateStyle: 'short', timeStyle: 'short' }) + ' (Madrid)' : value;
}
// Instante ↔ <input type="datetime-local"> (hora local del navegador). El instante guardado no cambia si no se edita el campo.
const pad = (n: number) => String(n).padStart(2, '0');
export function instantToLocalInput(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate()) + 'T' + pad(date.getHours()) + ':' + pad(date.getMinutes());
}
export function localInputToInstant(text: string): string | null {
  if (!text) return null;
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}
export function displayFieldValue(entity: Entity, key: string, value: FieldValue | undefined): string {
  const field = entity.fields.find(item => item.key === key);
  if (value === null || value === undefined || value === '') return '—';
  if (!field) return String(value);
  if (field.type === 'date') return formatCivilDate(String(value));
  if (field.type === 'datetime') return formatInstant(String(value));
  if (field.type === 'boolean') return value ? 'Sí' : 'No';
  if (field.type === 'enum') return field.options.find(option => option.id === value)?.label ?? String(value) + ' (valor no reconocido)';
  if (field.type === 'multiselect') return String(value).split(';').map(id => field.options.find(option => option.id === id)?.label ?? id).join(', ');
  if (field.type === 'reference') return (field.referenceEntity ?? 'registro') + ' · ' + String(value);
  return String(value);
}
export const taskTitle = (entity: Entity, record: CrmRecord) => String(record.values[entity.displayField] ?? '').trim() || 'Tarea ' + record.id;
