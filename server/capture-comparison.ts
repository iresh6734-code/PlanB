import type { FastifyInstance } from 'fastify';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { compareCaptures, CaptureComparisonError } from '../shared/capture-comparison.js';
import type { CrmSnapshot } from '../shared/model.js';
import { AppError, type Store } from './store.js';
import { readWorkspaceVersion } from './workspace-search.js';

const querySchema = z.object({
  from: z.string().min(1).max(400), to: z.string().min(1).max(400),
  offset: z.coerce.number().int().min(0).max(20_000).default(0),
  limit: z.coerce.number().int().min(1).max(200).default(50),
}).strict();
function describe(snapshot: CrmSnapshot) {
  return { captureId: snapshot.id + ':' + snapshot.capturedAt, name: snapshot.name, accountId: snapshot.source.accountId, capturedAt: snapshot.capturedAt, isTestData: snapshot.source.isTestData, contentHash: createHash('sha256').update(JSON.stringify(snapshot)).digest('hex') };
}
/** Saved captures only. Inherits local session/host/origin guards and never promotes either capture. */
export function registerCaptureComparison(app: FastifyInstance, store: Store) {
  app.get('/api/v2/captures/compare', async request => {
    const query = querySchema.parse(request.query);
    const version = readWorkspaceVersion(store);
    const from = store.capture(query.from), to = store.capture(query.to);
    if (readWorkspaceVersion(store) !== version) {
      throw new AppError(409, 'El historial cambió durante la lectura. Actualiza las capturas y vuelve a comparar.');
    }
    if (query.from !== from.id + ':' + from.capturedAt || query.to !== to.id + ':' + to.capturedAt) throw new AppError(422, 'La identidad guardada no coincide con el contenido de la captura.');
    try {
      const comparison = compareCaptures(from, to, query);
      return { from: describe(from), to: describe(to), ...comparison };
    } catch (error) {
      if (error instanceof CaptureComparisonError) throw new AppError(error.code === 'SOURCE_MISMATCH' ? 409 : 422, error.message);
      throw error;
    }
  });
}
