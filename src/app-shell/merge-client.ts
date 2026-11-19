import type { EntityName, FieldValue } from '../../shared/model.js';

/** F8: cliente de «Fusionar duplicados». Valida a mano lo que devuelve la copia local antes de pintarlo. */
export type MergeChoiceView = { key: string; label: string; keeper: FieldValue; duplicate: FieldValue; keeperText: string; duplicateText: string; choosable: boolean; reason?: 'readonly' | 'empty' };
export type MergePreview = { entity: EntityName; keeper: { id: string; label: string }; duplicate: { id: string; label: string }; fields: MergeChoiceView[]; seen: { keeper: string; duplicate: string } };
export type MergeView = { id: string; at: string; entity: EntityName; keeperId: string; duplicateId: string; keeperLabel: string; duplicateLabel: string; fields: string[] };

const UNREADABLE = 'La copia no devolvió una fusión legible.';
const isObject = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const text = (value: unknown) => { if (typeof value !== 'string') throw Error(UNREADABLE); return value; };
const fieldValue = (value: unknown): FieldValue => {
  if (value === null || typeof value === 'string' || typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value))) return value;
  throw Error(UNREADABLE);
};
const ref = (value: unknown) => { if (!isObject(value)) throw Error(UNREADABLE); return { id: text(value.id), label: text(value.label) }; };

export const mergePreviewPath = (entity: EntityName, keeper: string, duplicate: string) =>
  '/v2/records/merge-preview?entity=' + entity + '&keeper=' + encodeURIComponent(keeper) + '&duplicate=' + encodeURIComponent(duplicate);
export const MERGES_PATH = '/v2/records/merges';
export const mergeActionPath = (id: string, action: 'undo' | 'release') => '/v2/records/merges/' + encodeURIComponent(id) + '/' + action;

export function parsePreview(body: unknown): MergePreview {
  if (!isObject(body) || !Array.isArray(body.fields) || !isObject(body.seen)) throw Error(UNREADABLE);
  const fields = body.fields.map(raw => {
    if (!isObject(raw) || typeof raw.choosable !== 'boolean') throw Error(UNREADABLE);
    const reason: MergeChoiceView['reason'] = raw.reason === 'readonly' || raw.reason === 'empty' ? raw.reason : undefined;
    return { key: text(raw.key), label: text(raw.label), keeper: fieldValue(raw.keeper), duplicate: fieldValue(raw.duplicate), keeperText: text(raw.keeperText), duplicateText: text(raw.duplicateText), choosable: raw.choosable, ...(reason ? { reason } : {}) };
  });
  return { entity: text(body.entity) as EntityName, keeper: ref(body.keeper), duplicate: ref(body.duplicate), fields, seen: { keeper: text(body.seen.keeper), duplicate: text(body.seen.duplicate) } };
}

export function parseMerges(body: unknown): MergeView[] {
  if (!isObject(body) || !Array.isArray(body.merges)) throw Error(UNREADABLE);
  return body.merges.map(raw => {
    if (!isObject(raw) || !Array.isArray(raw.fields)) throw Error(UNREADABLE);
    return { id: text(raw.id), at: text(raw.at), entity: text(raw.entity) as EntityName, keeperId: text(raw.keeperId), duplicateId: text(raw.duplicateId), keeperLabel: text(raw.keeperLabel), duplicateLabel: text(raw.duplicateLabel), fields: raw.fields.map(text) };
  });
}

/** Claves «tipo:id» de los duplicados apartados: no vuelven a salir como aviso de duplicado. */
export const setAsideKeys = (merges: readonly MergeView[]) => new Set(merges.map(merge => merge.entity + ':' + merge.duplicateId));
