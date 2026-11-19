import type { AppSpec, CrmRecord, FieldValue } from '../../shared/model.js';
import { linkedPreset } from './task-preset.js';
import { fillTemplate, type FollowUpTemplate, type TemplateContext } from './templates.js';

/**
 * Secuencias de seguimiento (F4, super plan 2): cadencias guardadas («llamar hoy, correo a los 3 días, llamar a los 7»)
 * que crean de una vez las tareas enlazadas a la ficha. Los días son laborables (lunes a viernes). Plan B no envía nada:
 * cada tarea lleva en sus notas el texto de la plantilla H6 que toque, listo para copiar. Solo se guardan los nombres y
 * los pasos de las cadencias en este navegador, nunca datos de clientes.
 */
export type StepKind = 'call' | 'email' | 'meeting' | 'task';
export interface SequenceStep { offset: number; kind: StepKind; title: string }
export interface Sequence { id: string; name: string; steps: SequenceStep[] }

export const SEQUENCES_KEY = 'planb.sequences.v1';
export const MAX_SEQUENCES = 8;
export const MAX_STEPS = 8;
export const MAX_OFFSET = 60;
const MAX_TITLE = 80, MAX_NAME = 60, NOTES_MAX = 2000;

export const KIND_LABEL: Record<StepKind, string> = { call: 'Llamada', email: 'Correo', meeting: 'Reunión', task: 'Tarea' };
const KIND_TITLE: Record<StepKind, string> = { call: 'Llamar', email: 'Escribir', meeting: 'Reunión', task: 'Tarea' };
/** Plantilla H6 de ejemplo que acompaña a cada tipo de paso, si sigue existiendo. */
const KIND_TEMPLATE: Partial<Record<StepKind, string>> = { call: 'llamada', email: 'correo' };
const KIND_WORDS: [RegExp, StepKind][] = [[/^(llamad[ao]|llamar|call|tel[eé]fono)$/i, 'call'], [/^(correo|email|e-mail|mail|escribir)$/i, 'email'], [/^(reuni[oó]n|reunir|meeting|visita)$/i, 'meeting'], [/^(tarea|task|otro)$/i, 'task']];

export const DEFAULT_SEQUENCES: Sequence[] = [
  { id: 'primer-contacto', name: 'Primer contacto', steps: [{ offset: 0, kind: 'call', title: 'Llamar' }, { offset: 3, kind: 'email', title: 'Correo de seguimiento' }, { offset: 7, kind: 'call', title: 'Segunda llamada' }] },
  { id: 'tras-propuesta', name: 'Tras enviar una propuesta', steps: [{ offset: 2, kind: 'call', title: 'Confirmar que la ha recibido' }, { offset: 5, kind: 'email', title: 'Resolver dudas de la propuesta' }, { offset: 10, kind: 'call', title: 'Pedir una decisión' }] },
  { id: 'reactivar', name: 'Reactivar un cliente parado', steps: [{ offset: 0, kind: 'email', title: 'Correo para retomar' }, { offset: 4, kind: 'call', title: 'Llamada para retomar' }, { offset: 15, kind: 'task', title: 'Decidir si sigue en cartera' }] },
];

const DAY = 86_400_000;
const shift = (day: string, days: number) => new Date(Date.parse(day + 'T12:00:00Z') + days * DAY).toISOString().slice(0, 10);
const weekend = (day: string) => { const wd = new Date(Date.parse(day + 'T12:00:00Z')).getUTCDay(); return wd === 0 || wd === 6; };

/** Día laborable `n` contando desde `start` (0 = el propio día, o el lunes siguiente si cae en fin de semana). */
export function addWorkingDays(start: string, n: number): string {
  let day = start;
  while (weekend(day)) day = shift(day, 1);
  for (let left = Math.max(0, Math.floor(n)); left > 0;) { day = shift(day, 1); if (!weekend(day)) left--; }
  return day;
}

/** Fechas de cada paso a partir del día de inicio. */
export const sequencePlan = (sequence: Sequence, start: string) => sequence.steps.map(step => ({ step, day: addWorkingDays(start, step.offset) }));

/** Valores de las tareas de la secuencia, enlazadas a la ficha; null si el modelo no permite enlazarlas con seguridad. */
export function sequenceTasks({ spec, record, name, sequence, start, templates = [], context = {} }: {
  spec: AppSpec; record: CrmRecord; name: string; sequence: Sequence; start: string; templates?: readonly FollowUpTemplate[]; context?: TemplateContext;
}): Record<string, FieldValue>[] | null {
  const tasks = spec.entities.find(item => item.id === 'tasks');
  const links = record.entity !== 'tasks' ? linkedPreset(spec, 'tasks', record) : null;
  if (!tasks || !links || !sequence.steps.length || !/^\d{4}-\d{2}-\d{2}$/.test(start)) return null;
  const dueKey = spec.roles?.dueDate ?? 'due_date', statusKey = spec.roles?.taskStatus ?? 'status';
  const status = tasks.fields.find(field => field.key === statusKey);
  const open = status && !status.readOnly && status.type === 'enum' ? status.options.find(option => !/complet|hech|cerrad|termin|finaliz|done|closed/i.test(option.label + ' ' + option.id)) : undefined;
  if (status && !status.readOnly && status.type === 'enum' && !open) return null;
  const due = tasks.fields.find(field => field.key === dueKey && !field.readOnly);
  const notes = tasks.fields.find(field => field.key === 'notes' && field.type === 'text' && !field.readOnly);
  const who = name.trim() || 'ficha';
  return sequencePlan(sequence, start).map(({ step, day }, index) => {
    const values: Record<string, FieldValue> = {};
    for (const field of tasks.fields) if (!field.readOnly) values[field.key] = field.type === 'boolean' ? false : field.type === 'number' && field.required ? 0 : '';
    Object.assign(values, links);
    if (status && open) values[status.key] = open.id;
    if (due?.type === 'date') values[due.key] = day;
    else if (due?.type === 'datetime') values[due.key] = new Date(day + 'T09:00:00').toISOString();
    values[tasks.displayField] = (step.title + ': ' + who).slice(0, 200);
    if (notes) {
      const template = templates.find(item => item.id === KIND_TEMPLATE[step.kind]);
      const head = 'Secuencia «' + sequence.name + '» · paso ' + (index + 1) + ' de ' + sequence.steps.length + ' · ' + KIND_LABEL[step.kind];
      values[notes.key] = (template ? head + '\n\n' + fillTemplate(template.body, context).text : head).slice(0, NOTES_MAX);
    }
    return values;
  });
}

/** Datos de la ficha para rellenar las plantillas H6 que acompañan a cada paso. */
export function sequenceContext(spec: AppSpec, record: CrmRecord, today: string): TemplateContext {
  const entity = spec.entities.find(item => item.id === record.entity);
  if (!entity) return {};
  const text = (key: string | undefined) => key && record.values[key] != null && record.values[key] !== '' ? String(record.values[key]) : '';
  const email = entity.fields.find(field => field.type === 'email' || /^e?mail$|correo/i.test(field.key));
  const phone = entity.fields.find(field => /phone|tel[eé]fono|movil|mobile/i.test(field.key));
  const company = record.entity === 'companies' ? entity.displayField : entity.fields.find(field => field.type === 'text' && /company|empresa/i.test(field.key))?.key;
  const [y, m, d] = today.split('-');
  return { nombre: record.entity === 'contacts' ? text(entity.displayField) : '', empresa: text(company), correo: text(email?.key), telefono: text(phone?.key), hoy: d + '/' + m + '/' + y };
}

/** Lee los pasos escritos uno por línea: «3 correo Correo de seguimiento». El título es opcional. */
export function parseSteps(text: string): { steps: SequenceStep[]; error?: string } {
  const lines = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  if (!lines.length) return { steps: [], error: 'Escribe al menos un paso, por ejemplo «0 llamada».' };
  if (lines.length > MAX_STEPS) return { steps: [], error: 'Caben ' + MAX_STEPS + ' pasos por secuencia.' };
  const steps: SequenceStep[] = [];
  for (const [index, line] of lines.entries()) {
    const match = /^(\d{1,3})\s+(\S+)\s*(.*)$/.exec(line);
    const kind = match ? KIND_WORDS.find(([test]) => test.test(match[2]))?.[1] : undefined;
    if (!match || !kind) return { steps: [], error: 'Línea ' + (index + 1) + ': escribe los días y el tipo (llamada, correo, reunión o tarea), por ejemplo «3 correo».' };
    const offset = Number(match[1]);
    if (offset > MAX_OFFSET) return { steps: [], error: 'Línea ' + (index + 1) + ': como mucho ' + MAX_OFFSET + ' días laborables.' };
    steps.push({ offset, kind, title: (match[3].trim() || KIND_TITLE[kind]).slice(0, MAX_TITLE) });
  }
  return { steps: steps.sort((a, b) => a.offset - b.offset) };
}

/** Los pasos en el mismo formato que se escriben, para editarlos. */
export const stepsText = (steps: readonly SequenceStep[]) => steps.map(step => step.offset + ' ' + KIND_LABEL[step.kind].toLocaleLowerCase('es') + ' ' + step.title).join('\n');

/** Cadencias guardadas; si no hay o están dañadas, las de ejemplo. Una lista vacía guardada se respeta. */
export function parseSequences(raw: string | null | undefined): Sequence[] {
  if (!raw) return DEFAULT_SEQUENCES.map(item => ({ ...item, steps: item.steps.map(step => ({ ...step })) }));
  try {
    const data: unknown = JSON.parse(raw);
    if (!Array.isArray(data)) throw new Error('formato');
    const seen = new Set<string>(), list: Sequence[] = [];
    for (const item of data) {
      if (!item || typeof item !== 'object') continue;
      const { id, name, steps } = item as Record<string, unknown>;
      if (typeof id !== 'string' || !id || id.length > 40 || seen.has(id) || typeof name !== 'string' || !name.trim() || !Array.isArray(steps)) continue;
      const clean = steps.slice(0, MAX_STEPS).flatMap(step => {
        const { offset, kind, title } = (step ?? {}) as Record<string, unknown>;
        return typeof offset === 'number' && Number.isInteger(offset) && offset >= 0 && offset <= MAX_OFFSET && typeof kind === 'string' && kind in KIND_LABEL && typeof title === 'string' && title.trim()
          ? [{ offset, kind: kind as StepKind, title: title.trim().slice(0, MAX_TITLE) }] : [];
      });
      if (!clean.length) continue;
      seen.add(id);
      list.push({ id, name: name.trim().slice(0, MAX_NAME), steps: clean.sort((a, b) => a.offset - b.offset) });
      if (list.length === MAX_SEQUENCES) break;
    }
    return list;
  } catch {
    return parseSequences(null);
  }
}

export const serializeSequences = (list: readonly Sequence[]) => JSON.stringify(list.slice(0, MAX_SEQUENCES).map(item => ({ id: item.id, name: item.name, steps: item.steps })));

/** Crea o sustituye una cadencia escrita a mano. */
export function upsertSequence(list: readonly Sequence[], draft: { id?: string; name: string; text: string }, newId: () => string): { list: Sequence[]; error?: string; id?: string } {
  const name = draft.name.trim();
  if (!name) return { list: [...list], error: 'Ponle un nombre a la secuencia.' };
  if (name.length > MAX_NAME) return { list: [...list], error: 'El nombre admite hasta ' + MAX_NAME + ' caracteres.' };
  const { steps, error } = parseSteps(draft.text);
  if (error) return { list: [...list], error };
  if (draft.id && list.some(item => item.id === draft.id)) return { list: list.map(item => item.id === draft.id ? { id: item.id, name, steps } : item), id: draft.id };
  if (list.length >= MAX_SEQUENCES) return { list: [...list], error: 'Caben ' + MAX_SEQUENCES + ' secuencias; borra alguna antes.' };
  const id = newId();
  return { list: [...list, { id, name, steps }], id };
}
