import type { AppSpec, CrmRecord } from '../../shared/model.js';
import { dueDay } from '../task-display.js';
import { closeStatus, euros, stageKind } from './deal-insights.js';
import { doneOption } from './focus.js';
import type { RelatedGroup } from './related.js';

/** Salud de una empresa o un cliente (super plan V6): una frase y un nivel de tres, con cada motivo a la vista.
 *  Solo usa lo que ya está en la copia local (la propia ficha y lo que apunta a ella). Sin puntuaciones opacas. */
export type HealthTone = 'good' | 'watch' | 'risk';
export interface HealthReason { tone: HealthTone; text: string }
export interface AccountHealth { level: HealthTone; headline: string; reasons: HealthReason[]; partial: boolean }

export const QUIET_DAYS = 60;
const DAY = 86_400_000;
const daysBetween = (from: string, to: string) => Math.round((Date.parse(to + 'T00:00:00Z') - Date.parse(from + 'T00:00:00Z')) / DAY);
const plural = (n: number, one: string, many: string) => n + ' ' + (n === 1 ? one : many);
const shortDay = (day: string) => { const [, m, d] = day.split('-'); return Number(d) + '/' + Number(m); };

function uniqueRecords(groups: RelatedGroup[], entity: CrmRecord['entity']) {
  const seen = new Map<string, CrmRecord>();
  for (const group of groups) if (group.entity === entity) for (const record of group.records) seen.set(record.id, record);
  return [...seen.values()];
}

export function accountHealth(spec: AppSpec, record: CrmRecord, groups: RelatedGroup[], today: string): AccountHealth {
  const reasons: HealthReason[] = [];
  const entity = spec.entities.find(item => item.id === record.entity);

  const deals = uniqueRecords(groups, 'deals');
  const stageKey = spec.roles?.stage ?? 'dealstage', amountKey = spec.roles?.amount ?? 'amount';
  const dealEntity = spec.entities.find(item => item.id === 'deals');
  const closeKey = dealEntity?.fields.find(field => (field.type === 'date' || field.type === 'datetime') && /cierre|close/i.test(field.key + ' ' + field.label))?.key;
  const open = deals.filter(deal => stageKind(spec.stages.find(stage => stage.id === String(deal.values[stageKey] ?? ''))) === 'open');
  const won = deals.length - open.length - deals.filter(deal => stageKind(spec.stages.find(stage => stage.id === String(deal.values[stageKey] ?? ''))) === 'lost').length;
  const lateDeals = closeKey ? open.filter(deal => closeStatus(deal.values[closeKey], today, 'open').tone === 'late').length : 0;
  if (lateDeals) reasons.push({ tone: 'risk', text: plural(lateDeals, 'oportunidad abierta', 'oportunidades abiertas') + ' con el cierre vencido' });
  if (open.length) {
    const amount = open.reduce((sum, deal) => sum + (Number(deal.values[amountKey]) || 0), 0);
    reasons.push({ tone: 'good', text: plural(open.length, 'oportunidad abierta', 'oportunidades abiertas') + (amount ? ' por ' + euros(amount) : '') });
  } else if (dealEntity && groups.some(group => group.entity === 'deals')) {
    reasons.push({ tone: 'watch', text: won > 0 ? 'Sin oportunidades abiertas (' + plural(won, 'ganada', 'ganadas') + ' antes)' : 'Sin oportunidades abiertas' });
  }

  const tasks = uniqueRecords(groups, 'tasks');
  const done = doneOption(spec), dueKey = spec.roles?.dueDate ?? 'due_date';
  const isDone = (task: CrmRecord) => !!done && String(task.values[done.key] ?? '') === done.id;
  const pending = tasks.filter(task => !isDone(task));
  const overdue = pending.filter(task => { const day = dueDay(task.values[dueKey]); return day !== null && day < today; }).length;
  const next = pending.map(task => dueDay(task.values[dueKey])).filter((day): day is string => day !== null && day >= today).sort()[0];
  if (overdue) reasons.push({ tone: 'risk', text: plural(overdue, 'tarea vencida', 'tareas vencidas') });
  if (next) reasons.push({ tone: 'good', text: 'Próxima tarea el ' + shortDay(next) });
  else if (groups.some(group => group.entity === 'tasks') && !pending.length) reasons.push({ tone: open.length ? 'risk' : 'watch', text: open.length ? 'Oportunidades abiertas sin ninguna tarea pendiente' : 'Sin tareas pendientes' });

  const past = tasks.map(task => dueDay(task.values[dueKey])).filter((day): day is string => day !== null && day <= today).sort().pop();
  if (groups.some(group => group.entity === 'tasks')) {
    if (!past) reasons.push({ tone: 'watch', text: 'Sin actividad registrada en sus tareas' });
    else { const ago = daysBetween(past, today); if (ago > QUIET_DAYS) reasons.push({ tone: 'watch', text: 'Última actividad hace ' + ago + ' días' }); }
  }

  if (record.entity === 'companies' && groups.some(group => group.entity === 'contacts') && !uniqueRecords(groups, 'contacts').length) reasons.push({ tone: 'watch', text: 'Sin clientes asociados' });

  if (entity) {
    const wanted = entity.fields.filter(field => !field.readOnly && field.type !== 'reference' && (field.required || /e?mail|correo|phone|tel[eé]fono|domain|website|web/i.test(field.key)));
    const missing = wanted.filter(field => { const value = record.values[field.key]; return value == null || String(value).trim() === ''; }).map(field => field.label);
    if (missing.length) reasons.push({ tone: 'watch', text: 'Faltan datos: ' + missing.slice(0, 3).join(', ') + (missing.length > 3 ? ' y ' + (missing.length - 3) + ' más' : '') });
  }

  const level: HealthTone = reasons.some(item => item.tone === 'risk') ? 'risk' : reasons.some(item => item.tone === 'watch') ? 'watch' : 'good';
  const first = reasons.find(item => item.tone === level);
  const headline = level === 'risk' ? 'Necesita atención: ' + first!.text.toLowerCase()
    : level === 'watch' ? 'Conviene revisarla: ' + first!.text.toLowerCase()
    : reasons.length ? 'Al día: nada pendiente de atención' : 'Sin datos suficientes para valorarla';
  const order: Record<HealthTone, number> = { risk: 0, watch: 1, good: 2 };
  return { level, headline, reasons: reasons.sort((a, b) => order[a.tone] - order[b.tone]), partial: groups.some(group => group.scanned < group.total) };
}
