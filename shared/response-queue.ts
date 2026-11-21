import { MAX_RECORDS, type AppSpec, type CrmRecord, type EntityName } from './model.js';
import { clip, isOverdue, localDay, MAX_TIME, TIME_ZONE, taskRule, type Due } from './overdue.js';

export type ResponseBucket = 'overdue' | 'due-in-window' | 'needs-review' | 'later';
export interface ResponseQueueItem {
  id: string;
  label: string;
  bucket: ResponseBucket;
  status: 'open' | 'unknown';
  due: Due;
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
const HOUR = 3_600_000;
const order: Record<ResponseBucket, number> = { overdue: 0, 'due-in-window': 1, 'needs-review': 2, later: 3 };
const compare = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;

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
  const rule = taskRule(spec);
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
    const status = rule.status(record);
    if (status === 'completed') { completedTasks++; continue; }
    status === 'open' ? knownOpenTasks++ : unknownStatusTasks++;
    const due = rule.due(record);
    const reasons: ResponseQueueItem['reasons'] = [];
    let bucket: ResponseBucket;
    if (status === 'unknown') {
      bucket = 'needs-review'; reasons.push({ code: 'unknown-status', detail: 'El estado no permite confirmar si esta tarea sigue abierta; no se ha descartado.' });
    } else if (due.kind === 'missing' || due.kind === 'invalid') bucket = 'needs-review';
    else if (isOverdue(due, evaluatedAt, today)) {
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
