import type { AppSpec, CrmRecord } from '../../shared/model.js';
import { dueDay } from '../task-display.js';
import { euros, stageKind } from './deal-insights.js';
import { doneOption } from './focus.js';

const DAY = 86_400_000;
const daysBetween = (from: string, to: string) => Math.round((Date.parse(to + 'T00:00:00Z') - Date.parse(from + 'T00:00:00Z')) / DAY);
const plural = (n: number, one: string, many: string) => n + ' ' + (n === 1 ? one : many);

/** F6 · Clientes que se enfrían: empresas o clientes con alguna oportunidad abierta, sin ningún paso previsto y sin actividad en
 *  sus tareas desde hace más de `days` días (o nunca). Cada fila lleva su motivo. La oportunidad cuenta para su empresa si la tiene
 *  y, si no, para su cliente; una tarea cuenta para lo que enlaza, para la empresa de su cliente y para el dueño de su oportunidad. */
export const COOLING_DAYS = 30;
export interface CoolingAccount { record: CrmRecord; openDeals: number; amount: number; lastActivity: string | null; days: number | null; reason: string }

export function coolingAccounts(spec: AppSpec, data: { accounts: readonly CrmRecord[]; deals: readonly CrmRecord[]; tasks: readonly CrmRecord[] }, today: string, days = COOLING_DAYS): CoolingAccount[] {
  const refs = (entity: CrmRecord['entity'], target: CrmRecord['entity']) => spec.entities.find(item => item.id === entity)?.fields.filter(field => field.type === 'reference' && field.referenceEntity === target).map(field => field.key) ?? [];
  const valuesOf = (record: CrmRecord, keys: string[]) => keys.map(key => record.values[key]).filter(value => value != null && value !== '').map(String);
  const key = (entity: string, id: string) => entity + ':' + id;
  const byKey = new Map(data.accounts.filter(record => record.entity === 'companies' || record.entity === 'contacts').map(record => [key(record.entity, record.id), record]));
  const companyOfContact = new Map<string, string>();
  for (const record of data.accounts) if (record.entity === 'contacts') { const company = valuesOf(record, refs('contacts', 'companies'))[0]; if (company) companyOfContact.set(record.id, company); }

  const stageKey = spec.roles?.stage ?? 'dealstage', amountKey = spec.roles?.amount ?? 'amount';
  const dealCompany = refs('deals', 'companies'), dealContact = refs('deals', 'contacts');
  const ownerOfDeal = new Map<string, string>();
  const open = new Map<string, { deals: number; amount: number }>();
  for (const deal of data.deals) {
    if (deal.entity !== 'deals') continue;
    const company = valuesOf(deal, dealCompany)[0], contact = valuesOf(deal, dealContact)[0];
    const owner = company ? key('companies', company) : contact ? key('contacts', contact) : null;
    if (!owner) continue;
    ownerOfDeal.set(deal.id, owner);
    const stage = spec.stages.find(item => item.id === String(deal.values[stageKey] ?? ''));
    if (!stage || stageKind(stage) !== 'open') continue;
    const item = open.get(owner) ?? { deals: 0, amount: 0 };
    item.deals++; item.amount += Number(deal.values[amountKey]) || 0;
    open.set(owner, item);
  }

  const done = doneOption(spec), dueKey = spec.roles?.dueDate ?? 'due_date';
  const taskCompany = refs('tasks', 'companies'), taskContact = refs('tasks', 'contacts'), taskDeal = refs('tasks', 'deals');
  const last = new Map<string, string>(), planned = new Set<string>();
  for (const task of data.tasks) {
    if (task.entity !== 'tasks') continue;
    const touched = new Set<string>();
    for (const id of valuesOf(task, taskCompany)) touched.add(key('companies', id));
    for (const id of valuesOf(task, taskContact)) { touched.add(key('contacts', id)); const company = companyOfContact.get(id); if (company) touched.add(key('companies', company)); }
    for (const id of valuesOf(task, taskDeal)) { const owner = ownerOfDeal.get(id); if (owner) touched.add(owner); }
    const day = dueDay(task.values[dueKey]);
    const pending = !(done && String(task.values[done.key] ?? '') === done.id);
    for (const account of touched) {
      if (pending && (day === null || day >= today)) planned.add(account);
      if (day !== null && day <= today && (last.get(account) ?? '') < day) last.set(account, day);
    }
  }

  const list: CoolingAccount[] = [];
  for (const [account, figures] of open) {
    const record = byKey.get(account);
    if (!record || planned.has(account)) continue;
    const lastActivity = last.get(account) ?? null;
    const ago = lastActivity ? daysBetween(lastActivity, today) : null;
    if (ago !== null && ago <= days) continue;
    const deals = plural(figures.deals, 'oportunidad abierta', 'oportunidades abiertas') + (figures.amount ? ' por ' + euros(figures.amount) : '');
    list.push({ record, openDeals: figures.deals, amount: figures.amount, lastActivity, days: ago, reason: (ago === null ? 'Ninguna tarea registrada' : 'Sin actividad desde hace ' + ago + ' días') + ' y nada previsto · ' + deals });
  }
  const age = (item: CoolingAccount) => item.days ?? Number.MAX_SAFE_INTEGER;
  return list.sort((a, b) => b.amount - a.amount || age(b) - age(a));
}
