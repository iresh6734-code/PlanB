import type { AppSpec, CrmRecord, FieldValue } from '../../shared/model.js';
import { doneOption } from './focus.js';
import { linkedPreset } from './task-preset.js';

export type ActivityKind = 'call' | 'meeting' | 'email' | 'note' | 'task';
export type ParsedActivity = { kind: ActivityKind; subject: string; day: string; time: string | null; done: boolean; dated: boolean };

export const ACTIVITY_LABEL: Record<ActivityKind, string> = { call: 'Llamada', meeting: 'Reunión', email: 'Correo', note: 'Nota', task: 'Tarea' };
const SUBJECT_MAX = 120;
const NOTES_MAX = 2000;
const WEEKDAYS = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];
const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const NUMBERS: Record<string, number> = { un: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, diez: 10, quince: 15 };

const plain = (text: string) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const addDays = (day: string, days: number) => new Date(Date.parse(day + 'T12:00:00Z') + days * 86_400_000).toISOString().slice(0, 10);
const realDay = (year: number, month: number, date: number) => {
  const day = String(year).padStart(4, '0') + '-' + String(month).padStart(2, '0') + '-' + String(date).padStart(2, '0');
  return month >= 1 && month <= 12 && date >= 1 && new Date(day + 'T12:00:00Z').toISOString().slice(0, 10) === day ? day : null;
};
/** Día y mes sin año: este año, o el siguiente si ya ha pasado. */
const upcoming = (today: string, month: number, date: number) => {
  const year = Number(today.slice(0, 4));
  const day = realDay(year, month, date);
  return day && day >= today ? day : realDay(year + 1, month, date);
};

type Rule = { pattern: RegExp; read: (match: RegExpExecArray, today: string) => string | null };
// Se buscan sobre el texto en minúsculas y sin tildes; la longitud se conserva para poder recortar el original.
const DATE_RULES: Rule[] = [
  { pattern: /\bpasado\s+manana\b/, read: (_, today) => addDays(today, 2) },
  { pattern: /(?<!\bla\s)\bmanana\b/, read: (_, today) => addDays(today, 1) },
  { pattern: /\bhoy\b/, read: (_, today) => today },
  { pattern: /\ben\s+(\d{1,3}|un|una|dos|tres|cuatro|cinco|seis|siete|diez|quince)\s+(dias?|semanas?)\b/, read: (match, today) => {
    const count = /^\d+$/.test(match[1]) ? Number(match[1]) : NUMBERS[match[1]];
    return count > 0 && count <= 365 ? addDays(today, match[2].startsWith('semana') ? count * 7 : count) : null;
  } },
  { pattern: /\b(?:el\s+)?(?:proximo\s+)?(lunes|martes|miercoles|jueves|viernes|sabado|domingo)(?:\s+que\s+viene)?\b/, read: (match, today) => {
    const now = new Date(today + 'T12:00:00Z').getUTCDay();
    return addDays(today, ((WEEKDAYS.indexOf(match[1]) - now + 7) % 7) || 7);
  } },
  { pattern: /\b(?:el\s+)?(\d{1,2})[/-](\d{1,2})(?:[/-](\d{4}|\d{2}))?\b/, read: (match, today) => {
    const date = Number(match[1]), month = Number(match[2]);
    if (!match[3]) return upcoming(today, month, date);
    return realDay(match[3].length === 2 ? 2000 + Number(match[3]) : Number(match[3]), month, date);
  } },
  { pattern: /\b(?:el\s+)?(\d{1,2})\s+de\s+(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)\b/, read: (match, today) =>
    upcoming(today, match[2] === 'setiembre' ? 9 : MONTHS.indexOf(match[2]) + 1, Number(match[1])) },
];
const TIME_RULES: RegExp[] = [
  /\b(?:a\s+las?\s+)?(\d{1,2})(?::|\.|h)(\d{2})\s*h?\b/,
  /\ba\s+las?\s+(\d{1,2})(?:\s*h)?\b/,
  /\b(\d{1,2})\s*h\b/,
];

const DONE_PREFIX = /^(?:hecho|hecha|ya)\b[\s:,-]*/;
const PAST = /^(?:llame|he llamado|hable|he hablado|envie|he enviado|mande|he mandado|escribi|he escrito|me reuni|nos reunimos|reuni|visite|he visitado)\b/;
const NOTE_PREFIX = /^(?:nota|apunte)\b\s*:?\s*/;
const KINDS: [ActivityKind, RegExp][] = [
  ['call', /^(?:llam|telefon|habl)/],
  ['meeting', /^(?:reuni|reun|me reun|nos reun|qued|visit|cita\b)/],
  ['email', /^(?:e-?mail|correo|mail|escrib|he escrito|envi|he enviado|mand|he mandado)/],
];

function cut(text: string, start: number, length: number) { return text.slice(0, start) + ' ' + text.slice(start + length); }

/** Analiza una línea como «llamar mañana 10:00 sobre la propuesta», «reunión el lunes» o «llamé, le interesa».
 *  Devuelve el tipo, el asunto limpio, el día (AAAA-MM-DD), la hora y si ya está hecha. `today` es hoy en Madrid. */
export function parseActivity(input: string, today: string): ParsedActivity | null {
  let text = input.normalize('NFC').replace(/\s+/g, ' ').trim();
  if (!text || !/^\d{4}-\d{2}-\d{2}$/.test(today)) return null;
  let done = false;
  let kind: ActivityKind = 'task';
  const lead = DONE_PREFIX.exec(plain(text.toLowerCase()));
  if (lead && lead[0].length < text.length) { done = true; text = text.slice(lead[0].length); }
  const note = NOTE_PREFIX.exec(plain(text.toLowerCase()));
  if (note) { kind = 'note'; done = true; text = text.slice(note[0].length); }
  let day: string | null = null;
  let time: string | null = null;
  for (const rule of DATE_RULES) {
    const match = rule.pattern.exec(plain(text.toLowerCase()));
    if (!match) continue;
    const found = rule.read(match, today);
    if (found) { day = found; text = cut(text, match.index, match[0].length); }
    break;
  }
  for (const pattern of TIME_RULES) {
    const match = pattern.exec(plain(text.toLowerCase()));
    if (!match) continue;
    const hour = Number(match[1]), minute = match[2] === undefined ? 0 : Number(match[2]);
    if (hour > 23 || minute > 59) continue;
    time = String(hour).padStart(2, '0') + ':' + String(minute).padStart(2, '0');
    text = cut(text, match.index, match[0].length);
    break;
  }
  const subject = text.replace(/\s+/g, ' ').replace(/^[\s,;:·.-]+|[\s,;:·-]+$/g, '').replace(/\s+([,;:.])/g, '$1').trim();
  const head = plain(subject.toLowerCase());
  if (kind !== 'note') {
    if (PAST.test(head)) done = true;
    kind = KINDS.find(([, pattern]) => pattern.test(head))?.[0] ?? 'task';
  }
  if (done && day && day > today) done = false;
  return { kind, subject: subject ? subject[0].toUpperCase() + subject.slice(1) : '', day: day ?? today, time, done, dated: day !== null };
}

/** Asunto final: el texto escrito, o el tipo con el nombre de la ficha, y la hora al final. Las notas largas se resumen. */
export function activitySubject(activity: ParsedActivity, name: string): string {
  const who = name.trim();
  let subject = activity.subject || ACTIVITY_LABEL[activity.kind] + (who ? ' con ' + who : '');
  if (activity.kind === 'note') subject = 'Nota: ' + subject;
  if (activity.time) subject += ' · ' + activity.time;
  return subject.length > SUBJECT_MAX ? subject.slice(0, SUBJECT_MAX - 1).trimEnd() + '…' : subject;
}

/** True si se puede registrar actividad desde esta ficha: hay tareas y un único enlace directo de la tarea a su entidad. */
export function canLogActivity(spec: AppSpec, record: CrmRecord): boolean {
  return record.entity !== 'tasks' && !!linkedPreset(spec, 'tasks', record);
}

/** Valores de la tarea que registra la actividad: enlazada a la ficha, con asunto, fecha y estado (hecha o abierta).
 *  El texto completo de una nota va también al campo `notes` si existe. Null si no se puede crear con seguridad. */
export function activityTask(spec: AppSpec, record: CrmRecord, activity: ParsedActivity, name: string): Record<string, FieldValue> | null {
  const tasks = spec.entities.find(item => item.id === 'tasks');
  const links = canLogActivity(spec, record) ? linkedPreset(spec, 'tasks', record) : null;
  if (!tasks || !links) return null;
  const dueKey = spec.roles?.dueDate ?? 'due_date', statusKey = spec.roles?.taskStatus ?? 'status';
  const values: Record<string, FieldValue> = {};
  for (const field of tasks.fields) {
    if (field.readOnly) continue;
    values[field.key] = field.type === 'boolean' ? false : field.type === 'number' && field.required ? 0 : '';
  }
  Object.assign(values, links);
  const status = tasks.fields.find(field => field.key === statusKey);
  if (status && !status.readOnly && status.type === 'enum') {
    const option = activity.done ? doneOption(spec)?.id : status.options.find(item => !/complet|hech|cerrad|termin|finaliz|done|closed/i.test(item.label + ' ' + item.id))?.id;
    if (!option) return null;
    values[status.key] = option;
  }
  const due = tasks.fields.find(field => field.key === dueKey);
  if (due && !due.readOnly) {
    if (due.type === 'date') values[due.key] = activity.day;
    else if (due.type === 'datetime') values[due.key] = new Date(activity.day + 'T' + (activity.time ?? '09:00') + ':00').toISOString();
  }
  const notes = tasks.fields.find(field => field.key === 'notes' && field.type === 'text' && !field.readOnly);
  if (notes && activity.kind === 'note' && activity.subject) values[notes.key] = activity.subject.slice(0, NOTES_MAX);
  values[tasks.displayField] = activitySubject(activity, name);
  return values;
}

const dayFormat = new Intl.DateTimeFormat('es-ES', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
/** Vista previa en una línea: «Llamada · mañana, jue 20 nov · 10:00 · pendiente». */
export function describeActivity(activity: ParsedActivity, today: string): string {
  const relative = activity.day === today ? 'hoy' : activity.day === addDays(today, 1) ? 'mañana' : activity.day === addDays(today, -1) ? 'ayer' : '';
  const date = dayFormat.format(new Date(activity.day + 'T12:00:00Z')).replace(/[.,]/g, '');
  return [ACTIVITY_LABEL[activity.kind], relative ? relative + ', ' + date : date, activity.time, activity.done ? 'queda como hecha' : 'pendiente'].filter(Boolean).join(' · ');
}
