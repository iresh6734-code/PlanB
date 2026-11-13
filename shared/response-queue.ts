import { MAX_RECORDS, type AppSpec, type CrmRecord, type EntityName, type Field } from './model.js';

export type ResponseBucket = 'overdue' | 'due-in-window' | 'needs-review' | 'later';
export interface ResponseQueueItem {
  id: string;
  label: string;
  bucket: ResponseBucket;
  status: 'open' | 'unknown';
  due: { kind: 'date' | 'instant' | 'missing' | 'invalid'; value: string | null; at: number | null; localDate: string | null };
  reasons: { code: string; detail: string }[];
  references: { field: string; entity: EntityName; id: string; label: string | null; available: boolean }[];
  nextAction: string;
}
export interface ResponseQueue {
  evaluatedAt: string;
  horizonEndsAt: string;
  timeZone: 'Europe/Madrid';
  summary: {
    totalTasks: number; completedTasks: number; knownOpenTasks: number; unknownStatusTasks: number;
    buckets: Record<ResponseBucket, number>; totalQueued: number; returned: number; truncated: boolean;
  };
  items: ResponseQueueItem[];
  limitations: string[];
}
const TIME_ZONE = 'Europe/Madrid', HOUR = 3_600_000, MAX_TIME = Date.parse('9999-12-31T23:59:59.999Z');
const formatter = new Intl.DateTimeFormat('en', { timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' });
const order: Record<ResponseBucket, number> = { overdue: 0, 'due-in-window': 1, 'needs-review': 2, later: 3 };
const compare = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
// Preserve the UTF-16 size cap without splitting a supplementary character at its boundary.
function clip(value: string, limit: number) {
  let end = Math.min(value.length, limit);
  if (end > 0 && end < value.length && value.charCodeAt(end - 1) >= 0xd800 && value.charCodeAt(end - 1) <= 0xdbff && value.charCodeAt(end) >= 0xdc00 && value.charCodeAt(end) <= 0xdfff) end--;
  return value.slice(0, end);
}
function localDay(at: number) {
  const parts = formatter.formatToParts(at);
  return ['year', 'month', 'day'].map(key => parts.find(p => p.type === key)!.value.padStart(key === 'year' ? 4 : 2, '0')).join('-');
}
function validDay(value: string) {
  if (!/^(?!0000)\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const at = Date.parse(value + 'T00:00:00Z');
  return Number.isFinite(at) && new Date(at).toISOString().slice(0, 10) === value;
}
const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[\s_-]/g, '');
function meaning(value: string): 'open' | 'completed' | 'unknown' {
  const normalized = normalize(value);
  if (['completed', 'complete', 'done', 'finished', 'completada', 'completado', 'terminada', 'terminado'].includes(normalized)) return 'completed';
  if (['open', 'pending', 'notstarted', 'inprogress', 'waiting', 'deferred', 'abierta', 'abierto', 'pendiente', 'enprogreso', 'enespera', 'aplazada', 'aplazado'].includes(normalized)) return 'open';
  return 'unknown';
}
function taskStatus(value: unknown, field: Field | undefined) {
  if (!field || field.type !== 'enum' || typeof value !== 'string') return 'unknown';
  const option = field.options.find(o => o.id === value);
  if (!option) return 'unknown';
  const id = meaning(option.id), label = meaning(option.label);
  if (id !== 'unknown' && label !== 'unknown' && id !== label) return 'unknown';
  return id === 'unknown' ? label : id;
}
function parseDue(value: unknown, field: Field | undefined): ResponseQueueItem['due'] {
  if (value === null || value === undefined || value === '') return { kind: 'missing', value: null, at: null, localDate: null };
  const invalid: ResponseQueueItem['due'] = { kind: 'invalid', value: typeof value === 'string' ? clip(value, 100) : null, at: null, localDate: null };
  if (typeof value !== 'string') return invalid;
  if (field?.type === 'date' && validDay(value)) return { kind: 'date', value, at: null, localDate: value };
  if (field?.type !== 'datetime') return invalid;
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/.exec(value);
  if (!m || !validDay(m[1]) || Number(m[2]) > 23 || Number(m[3]) > 59 || Number(m[4]) > 59) return invalid;
  const at = Date.parse(value);
  if (!Number.isFinite(at) || at < 0 || at > MAX_TIME) return invalid;
  return { kind: 'instant', value, at, localDate: localDay(at) };
}

/** Read-only triage of current local records. References describe associations, never inferred dependencies. */
export function buildResponseQueue(input: { spec: AppSpec; records: CrmRecord[]; evaluatedAt: number; horizonHours?: number; limit?: number }): ResponseQueue {
  const { spec, records, evaluatedAt, horizonHours = 24, limit = 50 } = input;
  if (!Number.isSafeInteger(evaluatedAt) || evaluatedAt < 0 || evaluatedAt > MAX_TIME) throw new RangeError('Fecha de evaluación inválida.');
  if (!Number.isInteger(horizonHours) || horizonHours < 1 || horizonHours > 720) throw new RangeError('El horizonte admite entre 1 y 720 horas.');
  if (!Number.isInteger(limit) || limit < 1 || limit > 200) throw new RangeError('El límite admite entre 1 y 200 tareas.');
  const horizon = evaluatedAt + horizonHours * HOUR;
  if (horizon > MAX_TIME) throw new RangeError('El horizonte supera el calendario admitido.');
  if (records.length > MAX_RECORDS) throw new RangeError('Máximo 10.000 registros totales.');
  const byEntity = new Map<EntityName, Map<string, CrmRecord>>();
  for (const record of records) {
    if (!record.id.trim()) throw new TypeError('Registro sin ID.');
    const map = byEntity.get(record.entity) ?? new Map<string, CrmRecord>();
    if (map.has(record.id)) throw new TypeError('Registro duplicado dentro de una entidad.');
    map.set(record.id, record); byEntity.set(record.entity, map);
  }
  const taskEntity = spec.entities.find(e => e.id === 'tasks');
  if (!taskEntity) throw new TypeError('Falta la configuración de tareas.');
  const statusKey = spec.roles?.taskStatus ?? (taskEntity.fields.some(f => f.key === 'hs_task_status') ? 'hs_task_status' : 'status');
  const dueKey = spec.roles?.dueDate ?? (taskEntity.fields.some(f => f.key === 'hs_timestamp') ? 'hs_timestamp' : 'due_date');
  const statusField = taskEntity.fields.find(f => f.key === statusKey), dueField = taskEntity.fields.find(f => f.key === dueKey);
  const today = localDay(evaluatedAt), lastDay = localDay(horizon);
  const buckets: Record<ResponseBucket, number> = { overdue: 0, 'due-in-window': 0, 'needs-review': 0, later: 0 };
  const items: ResponseQueueItem[] = [];
  let completedTasks = 0, knownOpenTasks = 0, unknownStatusTasks = 0;
  const tasks = [...(byEntity.get('tasks')?.values() ?? [])];
  const label = (record: CrmRecord) => {
    const key = spec.entities.find(e => e.id === record.entity)?.displayField;
    const text = key ? record.values[key] : null;
    return typeof text === 'string' && text.trim() ? clip(text, 180) : clip(record.id, 180);
  };
  for (const record of tasks) {
    const status = taskStatus(record.values[statusKey], statusField);
    if (status === 'completed') { completedTasks++; continue; }
    status === 'open' ? knownOpenTasks++ : unknownStatusTasks++;
    const due = parseDue(record.values[dueKey], dueField);
    const reasons: ResponseQueueItem['reasons'] = [];
    let bucket: ResponseBucket;
    if (status === 'unknown') {
      bucket = 'needs-review'; reasons.push({ code: 'unknown-status', detail: 'El estado no permite confirmar si esta tarea sigue abierta; no se ha descartado.' });
    } else if (due.kind === 'missing' || due.kind === 'invalid') bucket = 'needs-review';
    else if (due.kind === 'instant' ? due.at! < evaluatedAt : due.localDate! < today) {
      bucket = 'overdue'; reasons.push({ code: 'overdue', detail: due.kind === 'date' ? 'El día de vencimiento es anterior a hoy en Madrid.' : 'El instante de vencimiento ya ha pasado.' });
    } else if (due.kind === 'instant' ? due.at! <= horizon : due.localDate! <= lastDay) {
      bucket = 'due-in-window'; reasons.push({ code: 'due-in-window', detail: due.kind === 'date' ? 'El día de vencimiento coincide con un día del horizonte; no consta una hora exacta.' : 'El vencimiento está dentro del horizonte seleccionado, incluidos sus extremos.' });
    } else {
      bucket = 'later'; reasons.push({ code: 'later', detail: 'El vencimiento queda después del horizonte seleccionado.' });
    }
    if (due.kind === 'missing') reasons.push({ code: 'missing-due', detail: 'No consta fecha de vencimiento; no se interpreta como una tarea sin urgencia.' });
    if (due.kind === 'invalid') reasons.push({ code: 'invalid-due', detail: 'La fecha no cumple el formato configurado o le falta zona horaria; hay que revisarla.' });
    const references: ResponseQueueItem['references'] = [];
    for (const field of taskEntity.fields) {
      if (field.type !== 'reference' || !field.referenceEntity) continue;
      const value = record.values[field.key]; if (value === null || value === undefined || value === '') continue;
      const id = String(value), target = byEntity.get(field.referenceEntity)?.get(id);
      references.push({ field: field.key, entity: field.referenceEntity, id, label: target ? label(target) : null, available: !!target });
      if (!target) reasons.push({ code: 'missing-reference', detail: 'No está disponible el registro relacionado del campo «' + field.label + '»; comprueba la asociación.' });
    }
    buckets[bucket]++;
    const nextAction = bucket === 'needs-review' ? 'Revisar estado y vencimiento antes de decidir la prioridad.'
      : references.some(r => !r.available) ? 'Comprobar los registros relacionados antes de trabajar esta tarea.'
      : bucket === 'later' ? 'Planificar esta tarea para después del horizonte actual.' : 'Abrir la tarea y continuar el trabajo en la copia local.';
    items.push({ id: record.id, label: label(record), bucket, status, due, reasons, references, nextAction });
  }
  items.sort((a, b) => order[a.bucket] - order[b.bucket]
    || compare(a.due.localDate ?? '9999-12-32', b.due.localDate ?? '9999-12-32')
    || (a.due.kind === b.due.kind ? (a.due.at ?? 0) - (b.due.at ?? 0) : a.due.kind === 'instant' ? -1 : b.due.kind === 'instant' ? 1 : 0)
    || compare(a.id, b.id));
  return {
    evaluatedAt: new Date(evaluatedAt).toISOString(), horizonEndsAt: new Date(horizon).toISOString(), timeZone: TIME_ZONE,
    summary: { totalTasks: tasks.length, completedTasks, knownOpenTasks, unknownStatusTasks, buckets, totalQueued: items.length, returned: Math.min(limit, items.length), truncated: items.length > limit },
    items: items.slice(0, limit),
    limitations: [
      'Prioridad determinista por estado y vencimiento de registros locales; no consulta el CRM ni predice pérdidas comerciales.',
      'Una fecha sin hora se compara por día en Europe/Madrid: su día puede intersectar el horizonte sin conocerse el instante exacto.',
      'Los registros relacionados son asociaciones explícitas, no dependencias ni acciones bloqueadas inferidas.',
      'Los recuentos cubren todos los registros locales aportados antes del límite visible; no acreditan el inventario actual del portal.',
    ],
  };
}
