import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { EntityNameSchema, SnapshotSchema } from '../shared/model.js';
import { recordThen } from '../shared/record-then.js';
import { AppError, type Store } from './store.js';
import { readWorkspaceVersion } from './workspace-search.js';

const paramsSchema = z.object({ entity: EntityNameSchema, id: z.string().min(1).max(400) }).strict();
const querySchema = z.object({ capture: z.string().min(1).max(400).optional() }).strict();

/** R3 «Ver cómo estaba»: one record in a saved capture against the local copy now.
 *  Read-only: never restores, promotes or writes; inherits the local session/host/origin guards. */
export function registerRecordHistory(app: FastifyInstance, store: Store) {
  app.get('/api/v2/records/:entity/:id/then', async request => {
    const { entity, id } = paramsSchema.parse(request.params);
    const query = querySchema.parse(request.query);
    const version = readWorkspaceVersion(store);
    const now = store.record(entity, id);
    if (!now) throw new AppError(404, 'Registro no encontrado.');
    const captures = store.captures().slice(0, 80).map(item => ({ captureId: item.id, capturedAt: item.at }));
    if (!captures.length) return { captures, capture: null, result: null };
    const captureId = query.capture ?? captures[0]!.captureId;
    if (!captures.some(item => item.captureId === captureId)) throw new AppError(404, 'No se encontró la captura.');
    const parsed = SnapshotSchema.safeParse(store.capture(captureId));
    if (readWorkspaceVersion(store) !== version) throw new AppError(409, 'La copia cambió durante la lectura. Vuelve a abrir la comparación.');
    if (!parsed.success || captureId !== parsed.data.id + ':' + parsed.data.capturedAt) throw new AppError(422, 'La captura guardada no se puede leer o no coincide con su identidad.');
    const active = store.snapshot;
    if (active && active.source.accountId !== parsed.data.source.accountId) throw new AppError(409, 'Esa captura es de otro portal.');
    const order = store.spec?.entities.find(item => item.id === entity)?.fields.map(field => field.key) ?? [];
    return {
      captures,
      capture: { captureId, capturedAt: parsed.data.capturedAt, isTestData: parsed.data.source.isTestData },
      result: recordThen(parsed.data, entity, id, now, order),
    };
  });
}
