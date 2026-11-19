import type { HistoryValue } from '../../shared/change-history.js';
import type { FieldValue } from '../../shared/model.js';

export interface CaptureRef { captureId: string; capturedAt: string }
export interface ThenField { key: string; then: HistoryValue; now: HistoryValue; clipped: boolean }
export interface ThenRead {
  captures: CaptureRef[];
  capture: (CaptureRef & { isTestData: boolean }) | null;
  result: { present: boolean; fields: ThenField[]; unchanged: number; total: number; truncated: boolean } | null;
}

const UNREADABLE = 'La copia no devolvió una comparación legible.';
const captureDate = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

export function thenPath(entity: string, id: string, capture?: string): string {
  return '/v2/records/' + encodeURIComponent(entity) + '/' + encodeURIComponent(id) + '/then' + (capture ? '?capture=' + encodeURIComponent(capture) : '');
}

export function captureLabel(at: string): string {
  const time = Date.parse(at);
  return Number.isFinite(time) ? captureDate.format(new Date(time)) : 'Fecha no disponible';
}

const isObject = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const isFieldValue = (value: unknown): value is FieldValue => value === null || ['string', 'number', 'boolean'].includes(typeof value);
const isCount = (value: unknown): value is number => Number.isInteger(value) && (value as number) >= 0;

function captureRef(value: unknown): CaptureRef {
  if (!isObject(value) || typeof value.captureId !== 'string' || typeof value.capturedAt !== 'string') throw Error(UNREADABLE);
  return { captureId: value.captureId, capturedAt: value.capturedAt };
}
function preview(value: unknown): [HistoryValue, boolean] {
  if (!isObject(value) || typeof value.present !== 'boolean' || !isFieldValue(value.value)) throw Error(UNREADABLE);
  return value.present ? [{ present: true, value: value.value }, value.truncated === true] : [{ present: false }, false];
}

/** Validates the `/then` answer before showing it; anything unexpected becomes a readable error. */
export function parseThen(data: unknown): ThenRead {
  if (!isObject(data) || !Array.isArray(data.captures)) throw Error(UNREADABLE);
  const captures = data.captures.map(captureRef);
  if (data.capture === null || data.result === null) return { captures, capture: null, result: null };
  if (!isObject(data.capture) || typeof data.capture.isTestData !== 'boolean' || !isObject(data.result)) throw Error(UNREADABLE);
  const { present, fields, unchanged, total, truncated } = data.result;
  if (typeof present !== 'boolean' || !Array.isArray(fields) || !isCount(unchanged) || !isCount(total) || typeof truncated !== 'boolean') throw Error(UNREADABLE);
  return {
    captures,
    capture: { ...captureRef(data.capture), isTestData: data.capture.isTestData },
    result: {
      present, unchanged, total, truncated,
      fields: fields.map(field => {
        if (!isObject(field) || typeof field.key !== 'string') throw Error(UNREADABLE);
        const [then, a] = preview(field.then), [now, b] = preview(field.now);
        return { key: field.key, then, now, clipped: a || b };
      }),
    },
  };
}

/** Plain text of a value from back then, for the clipboard. */
export function copyText(value: HistoryValue): string {
  return value.present && value.value !== null ? String(value.value) : '';
}
