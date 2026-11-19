import { api, post } from '../api.js';
import type { EntityName } from '../../shared/model.js';
import { readSavedViews, sanitizeSavedViews, writeSavedViews, type SavedView } from './saved-views.js';

/** T5: las vistas guardadas viven en la copia local (viajan con sus copias de seguridad); este navegador guarda un reflejo
 *  para pintarlas al instante y para cuando la copia no responde. */
export const viewsPath = (entity: EntityName) => '/v2/views/' + entity;
export interface ViewsIo { get: (path: string, signal?: AbortSignal) => Promise<unknown>; post: (path: string, body: unknown) => Promise<unknown> }
type Mirror = Pick<Storage, 'getItem' | 'setItem'> | null | undefined;
const http: ViewsIo = { get: (path, signal) => api<unknown>(path, { signal }), post: (path, body) => post<unknown>(path, body) };

function parseReply(raw: unknown): { views: SavedView[]; stored: boolean } {
  const reply = raw && typeof raw === 'object' ? raw as { views?: unknown; stored?: unknown } : {};
  if (!Array.isArray(reply.views) || typeof reply.stored !== 'boolean') throw new Error('La copia no devolvió unas vistas legibles.');
  return { views: sanitizeSavedViews(reply.views), stored: reply.stored };
}

/** Vistas de la copia. Si la copia aún no guardó ninguna de este tipo y este navegador sí, las sube una vez.
 *  null si la copia no responde o la lectura se canceló: se queda lo que ya se ve. */
export async function loadSavedViews(entity: EntityName, signal?: AbortSignal, io: ViewsIo = http, mirror?: Mirror): Promise<SavedView[] | null> {
  try {
    const reply = parseReply(await io.get(viewsPath(entity), signal));
    if (signal?.aborted) return null;
    if (reply.stored) { writeSavedViews(entity, reply.views, mirror); return reply.views; }
    const local = readSavedViews(entity, mirror);
    if (!local.length) return reply.views;
    const moved = parseReply(await io.post(viewsPath(entity), { views: local }));
    return signal?.aborted ? null : moved.views;
  } catch { return null; }
}

/** Guarda la lista entera en la copia y la refleja en este navegador. null si la copia no la aceptó. */
export async function storeSavedViews(entity: EntityName, views: SavedView[], io: ViewsIo = http, mirror?: Mirror): Promise<SavedView[] | null> {
  try {
    const reply = parseReply(await io.post(viewsPath(entity), { views }));
    writeSavedViews(entity, reply.views, mirror);
    return reply.views;
  } catch { return null; }
}
