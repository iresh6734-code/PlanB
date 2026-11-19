import { daysLate, madridDay } from '../task-display.js';

/** R6 · Parte de la mañana: lo primero que se ve al abrir la app cada día. Solo resume lo ya leído; en el navegador guarda únicamente el día de la última vez que se vio. */
export const BRIEF_KEY = 'planb:brief:seen';
export const BRIEF_STEPS = 3;
const SHOWN = 3;

type Store = Pick<Storage, 'getItem' | 'setItem'>;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
export function briefSeen(storage: Store | null | undefined): string | null {
  try { const value = storage?.getItem(BRIEF_KEY) ?? null; return value && DAY.test(value) ? value : null; } catch { return null; }
}
export function markBriefSeen(storage: Store | null | undefined, day: string): void {
  if (!DAY.test(day)) return;
  try { storage?.setItem(BRIEF_KEY, day); } catch { /* sin almacenamiento: se volverá a abrir, nada más */ }
}
export const shouldShowBrief = (lastSeen: string | null, today: string) => lastSeen !== today;

export interface BriefTask { label: string; due: string | null; bucket: string }
export interface BriefInput {
  now: Date;
  /** Tareas de Hoy; null = no se pudieron leer (nunca se muestra como cero). */
  tasks: readonly BriefTask[] | null;
  /** Diario de cambios locales; null = todavía sin leer o ilegible. */
  changes: readonly { at: string; entity: string; operation: string; recordId: string }[] | null;
  /** Nombre en plural de cada entidad («Empresas», «Tareas»…). */
  entityLabel?: (entity: string) => string;
  capturedAt: string | null | undefined;
  stale: boolean;
  steps: readonly { title: string; detail: string }[];
}
export type BriefTone = 'ok' | 'warn' | 'danger' | 'neutral';
export interface MorningBrief {
  day: string; dateLabel: string; tone: BriefTone; headline: string;
  overdue: { count: number; items: { label: string; late: number }[] } | null;
  soon: number | null;
  changes: { count: number; created: number; updated: number; records: number; byEntity: { entity: string; label: string; count: number }[] } | null;
  copy: { tone: BriefTone; label: string; detail: string };
  steps: { title: string; detail: string }[];
}

const plural = (count: number, one: string, many: string) => count + ' ' + (count === 1 ? one : many);
export function copyAge(capturedAt: string | null | undefined, now: Date): { hours: number | null; text: string } {
  const at = capturedAt ? Date.parse(capturedAt) : NaN;
  if (!Number.isFinite(at)) return { hours: null, text: 'sin fecha' };
  const hours = Math.max(0, (now.getTime() - at) / 3_600_000);
  const text = hours < 1 ? 'hace menos de una hora' : hours < 24 ? 'hace ' + plural(Math.floor(hours), 'hora', 'horas') : 'hace ' + plural(Math.floor(hours / 24), 'día', 'días');
  return { hours, text };
}

export function morningBrief(input: BriefInput): MorningBrief {
  const { now } = input;
  const day = madridDay(now), yesterday = madridDay(new Date(now.getTime() - 86_400_000));
  const dateLabel = new Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Madrid', weekday: 'long', day: 'numeric', month: 'long' }).format(now);
  const late = input.tasks ? input.tasks.filter(task => task.bucket === 'overdue').map(task => ({ label: task.label || 'Tarea sin título', late: Math.max(0, daysLate(task.due, now) ?? 0) })).sort((a, b) => b.late - a.late) : null;
  const overdue = late ? { count: late.length, items: late.slice(0, SHOWN) } : null;
  const soon = input.tasks ? input.tasks.filter(task => task.bucket === 'due-in-window').length : null;
  let changes: MorningBrief['changes'] = null;
  if (input.changes) {
    const recent = input.changes.filter(change => { const at = Date.parse(change.at); return Number.isFinite(at) && madridDay(new Date(at)) >= yesterday; });
    const counts = new Map<string, number>();
    for (const change of recent) counts.set(change.entity, (counts.get(change.entity) ?? 0) + 1);
    changes = {
      count: recent.length, created: recent.filter(change => change.operation === 'create').length, updated: recent.filter(change => change.operation === 'update').length,
      records: new Set(recent.map(change => change.entity + ':' + change.recordId)).size,
      byEntity: [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([entity, count]) => ({ entity, label: input.entityLabel?.(entity) ?? entity, count })),
    };
  }
  const age = copyAge(input.capturedAt, now);
  const copy = !input.capturedAt ? { tone: 'warn' as const, label: 'Sin copia todavía', detail: 'Prepara la primera desde Continuidad.' }
    : { tone: input.stale ? 'warn' as const : 'ok' as const, label: 'Copia ' + age.text, detail: input.stale ? 'Se ha quedado vieja: conviene capturar de nuevo.' : 'Está al día.' };
  const steps = input.steps.slice(0, BRIEF_STEPS).map(step => ({ title: step.title, detail: step.detail }));
  const tone: BriefTone = overdue && overdue.count > 0 ? 'danger' : copy.tone === 'warn' || (soon ?? 0) > 0 ? 'warn' : overdue ? 'ok' : 'neutral';
  const parts = [
    overdue ? (overdue.count ? plural(overdue.count, 'tarea vencida', 'tareas vencidas') : 'nada vencido') : '',
    soon ? plural(soon, 'para las próximas 24 h', 'para las próximas 24 h') : '',
    changes ? (changes.count ? plural(changes.count, 'cambio', 'cambios') + ' desde ayer' : 'sin cambios desde ayer') : '',
  ].filter(Boolean);
  const headline = parts.length ? parts.join(' · ').replace(/^./, letter => letter.toUpperCase()) + '.' : 'Leyendo tu día…';
  return { day, dateLabel, tone, headline, overdue, soon, changes, copy, steps };
}

/** Texto para copiar (correo, chat o notas). Sin datos de la copia más allá de lo que ya se ve en pantalla. */
export function briefText(brief: MorningBrief, title = 'Plan B'): string {
  const lines = ['Parte de la mañana · ' + title + ' · ' + brief.dateLabel, '', brief.headline, ''];
  lines.push('VENCIDO' + (brief.overdue ? ' (' + brief.overdue.count + ')' : ''));
  if (!brief.overdue) lines.push('- No se pudo leer.');
  else if (!brief.overdue.count) lines.push('- Nada vencido.');
  else { for (const item of brief.overdue.items) lines.push('- ' + item.label + (item.late ? ' (' + plural(item.late, 'día', 'días') + ')' : '')); if (brief.overdue.count > brief.overdue.items.length) lines.push('- y ' + (brief.overdue.count - brief.overdue.items.length) + ' más'); }
  lines.push('', 'CAMBIOS DESDE AYER');
  if (!brief.changes) lines.push('- Sin leer.');
  else if (!brief.changes.count) lines.push('- Ninguno.');
  else lines.push('- ' + plural(brief.changes.created, 'alta', 'altas') + ' y ' + plural(brief.changes.updated, 'edición', 'ediciones') + ' en ' + plural(brief.changes.records, 'registro', 'registros') + ': ' + brief.changes.byEntity.map(item => item.label + ' ' + item.count).join(', ') + '.');
  lines.push('', 'COPIA', '- ' + brief.copy.label + '. ' + brief.copy.detail);
  lines.push('', 'PRIMEROS PASOS');
  if (!brief.steps.length) lines.push('- Nada urgente.');
  brief.steps.forEach((step, index) => lines.push((index + 1) + '. ' + step.title + ' — ' + step.detail));
  return lines.join('\n');
}
