import type { FieldValue } from '../../shared/model.js';
import type { ReturnCheck, ReturnCheckItem } from '../../shared/return-check.js';

export const RETURN_CHECK_PATH = '/v2/return/check';
const STATES = new Set(['same', 'changed', 'missing']), ENTITIES = new Set(['contacts', 'companies', 'deals', 'tasks']);
const isValue = (value: unknown): value is FieldValue => value === null || ['string', 'number', 'boolean'].includes(typeof value);
const count = (value: unknown) => typeof value === 'number' && Number.isInteger(value) && value >= 0;
const BAD = 'La copia no devolvió una comprobación legible.';

/** Valida la respuesta de la comprobación antes de pintarla (nunca se confía en la forma). */
export function parseReturnCheck(raw: unknown): ReturnCheck {
  const data = raw && typeof raw === 'object' ? raw as Record<string, unknown> : null;
  const summary = data?.summary && typeof data.summary === 'object' ? data.summary as Record<string, unknown> : null;
  if (!data || typeof data.planId !== 'string' || (data.source !== 'hubspot' && data.source !== 'simulation') || typeof data.checkedAt !== 'string'
    || !Array.isArray(data.items) || !summary || !['same', 'changed', 'missing', 'notSent', 'skipped'].every(key => count(summary[key]))) throw new Error(BAD);
  const items = data.items.map((raw): ReturnCheckItem => {
    const item = raw && typeof raw === 'object' ? raw as Record<string, unknown> : null;
    if (!item || typeof item.operationId !== 'string' || typeof item.label !== 'string' || typeof item.remoteId !== 'string' || !STATES.has(String(item.state)) || !ENTITIES.has(String(item.entity))
      || (item.kind !== 'create' && item.kind !== 'update') || !count(item.checked) || !Array.isArray(item.fields)) throw new Error(BAD);
    const fields = item.fields.map(raw => {
      const field = raw && typeof raw === 'object' ? raw as Record<string, unknown> : null;
      if (!field || typeof field.field !== 'string' || typeof field.label !== 'string' || !isValue(field.sent) || !isValue(field.now)) throw new Error(BAD);
      return { field: field.field, label: field.label, sent: field.sent, now: field.now };
    });
    return { operationId: item.operationId, entity: item.entity as ReturnCheckItem['entity'], label: item.label, kind: item.kind, remoteId: item.remoteId, state: item.state as ReturnCheckItem['state'], checked: item.checked as number, fields };
  });
  return { planId: data.planId, source: data.source, checkedAt: data.checkedAt, items, summary: summary as ReturnCheck['summary'] };
}

export const checkValue = (value: FieldValue) => value === null || value === '' ? 'vacío' : typeof value === 'boolean' ? (value ? 'Sí' : 'No') : '«' + String(value) + '»';

/** Una línea para leer de un vistazo: qué sigue igual, qué cambió después y qué no aparece. */
export function checkHeadline(check: ReturnCheck) {
  const { same, changed, missing, notSent, skipped } = check.summary;
  const plural = (n: number, one: string, many: string) => n + ' ' + (n === 1 ? one : many);
  const parts = [plural(same, 'sigue igual', 'siguen igual')];
  if (changed) parts.push(plural(changed, 'cambió después', 'cambiaron después'));
  if (missing) parts.push(plural(missing, 'ya no aparece', 'ya no aparecen'));
  if (notSent) parts.push(plural(notSent, 'no se envió', 'no se enviaron'));
  if (skipped) parts.push(plural(skipped, 'sin comprobar (límite)', 'sin comprobar (límite)'));
  return parts.join(' · ');
}
