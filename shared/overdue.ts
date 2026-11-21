import type { AppSpec, CrmRecord, Field } from './model.js';

/**
 * Regla única de «vencida» (B4.4). Es la de la cola de Hoy (`response-queue`), sacada aquí para que Hoy, Inicio, Agenda,
 * revisión semanal y «Despachar vencidas» cuenten lo mismo:
 *  · un campo de fecha sin hora vence por día de Madrid: está vencida desde el día siguiente;
 *  · un campo con hora vence en su instante exacto: está vencida en cuanto pasa;
 *  · sin fecha, con una fecha ilegible o con un estado que no permite saber si sigue abierta, no está vencida: se revisa.
 */
export const TIME_ZONE = 'Europe/Madrid';
export const MAX_TIME = Date.parse('9999-12-31T23:59:59.999Z');
const formatter = new Intl.DateTimeFormat('en', { timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' });

export interface Due { kind: 'date' | 'instant' | 'missing' | 'invalid'; value: string | null; at: number | null; localDate: string | null }
export type TaskState = 'open' | 'completed' | 'unknown';

// Preserve the UTF-16 size cap without splitting a supplementary character at its boundary.
export function clip(value: string, limit: number) {
  let end = Math.min(value.length, limit);
  if (end > 0 && end < value.length && value.charCodeAt(end - 1) >= 0xd800 && value.charCodeAt(end - 1) <= 0xdbff && value.charCodeAt(end) >= 0xdc00 && value.charCodeAt(end) <= 0xdfff) end--;
  return value.slice(0, end);
}
export function localDay(at: number) {
  const parts = formatter.formatToParts(at);
  return ['year', 'month', 'day'].map(key => parts.find(p => p.type === key)!.value.padStart(key === 'year' ? 4 : 2, '0')).join('-');
}
export function validDay(value: string) {
  if (!/^(?!0000)\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const at = Date.parse(value + 'T00:00:00Z');
  return Number.isFinite(at) && new Date(at).toISOString().slice(0, 10) === value;
}
const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[\s_-]/g, '');
function meaning(value: string): TaskState {
  const normalized = normalize(value);
  if (['completed', 'complete', 'done', 'finished', 'completada', 'completado', 'terminada', 'terminado'].includes(normalized)) return 'completed';
  if (['open', 'pending', 'notstarted', 'inprogress', 'waiting', 'deferred', 'abierta', 'abierto', 'pendiente', 'enprogreso', 'enespera', 'aplazada', 'aplazado'].includes(normalized)) return 'open';
  return 'unknown';
}
export function taskStatus(value: unknown, field: Field | undefined): TaskState {
  if (!field || field.type !== 'enum' || typeof value !== 'string') return 'unknown';
  const option = field.options.find(o => o.id === value);
  if (!option) return 'unknown';
  const id = meaning(option.id), label = meaning(option.label);
  if (id !== 'unknown' && label !== 'unknown' && id !== label) return 'unknown';
  return id === 'unknown' ? label : id;
}
export function parseDue(value: unknown, field: Field | undefined): Due {
  if (value === null || value === undefined || value === '') return { kind: 'missing', value: null, at: null, localDate: null };
  const invalid: Due = { kind: 'invalid', value: typeof value === 'string' ? clip(value, 100) : null, at: null, localDate: null };
  if (typeof value !== 'string') return invalid;
  if (field?.type === 'date' && validDay(value)) return { kind: 'date', value, at: null, localDate: value };
  if (field?.type !== 'datetime') return invalid;
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/.exec(value);
  if (!m || !validDay(m[1]) || Number(m[2]) > 23 || Number(m[3]) > 59 || Number(m[4]) > 59) return invalid;
  const at = Date.parse(value);
  if (!Number.isFinite(at) || at < 0 || at > MAX_TIME) return invalid;
  return { kind: 'instant', value, at, localDate: localDay(at) };
}
/** `today` es el día de Madrid de `evaluatedAt`; se acepta ya calculado para no repetirlo en cada tarea. */
export function isOverdue(due: Due, evaluatedAt: number, today = localDay(evaluatedAt)): boolean {
  return due.kind === 'instant' ? due.at! < evaluatedAt : due.kind === 'date' ? due.localDate! < today : false;
}

/** Campos de estado y vencimiento de las tareas de un modelo, con la regla aplicada a un registro. */
export function taskRule(spec: AppSpec) {
  const entity = spec.entities.find(e => e.id === 'tasks');
  const statusKey = spec.roles?.taskStatus ?? (entity?.fields.some(f => f.key === 'hs_task_status') ? 'hs_task_status' : 'status');
  const dueKey = spec.roles?.dueDate ?? (entity?.fields.some(f => f.key === 'hs_timestamp') ? 'hs_timestamp' : 'due_date');
  const statusField = entity?.fields.find(f => f.key === statusKey), dueField = entity?.fields.find(f => f.key === dueKey);
  const status = (record: CrmRecord) => taskStatus(record.values[statusKey], statusField);
  const due = (record: CrmRecord) => parseDue(record.values[dueKey], dueField);
  const overdue = (record: CrmRecord, evaluatedAt: number, today = localDay(evaluatedAt)) => record.entity === 'tasks' && status(record) === 'open' && isOverdue(due(record), evaluatedAt, today);
  return { statusKey, dueKey, statusField, dueField, status, due, overdue };
}
