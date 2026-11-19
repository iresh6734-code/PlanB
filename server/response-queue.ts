import type { FastifyInstance } from 'fastify';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { buildResponseQueue } from '../shared/response-queue.js';
import { AppError, type Store } from './store.js';
import { readWorkspaceVersion, workspaceSearchIdentity } from './workspace-search.js';

const querySchema = z.object({
  horizonHours: z.coerce.number().int().min(1).max(720).default(24),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  contextRevision: z.string().regex(/^[a-f0-9]{64}$/).optional(),
}).strict();

/** Inherits the base app's local-host, session and no-store hooks; no provider or store writes. */
export function registerResponseQueue(app: FastifyInstance, store: Store, clock: () => number = Date.now) {
  app.get('/api/v2/continuity/response-queue', async request => {
    const { contextRevision: expected, ...query } = querySchema.parse(request.query);
    const version = readWorkspaceVersion(store);
    if (!store.ready) throw new AppError(409, 'Activa una copia conciliada antes de consultar las prioridades.');
    // A replaced copy can keep the same ID and date; the workspace identity tells them apart (468).
    const contextRevision = workspaceSearchIdentity(store)?.contextRevision ?? null;
    if (expected && expected !== contextRevision) {
      throw new AppError(409, 'La copia activa cambió. Actualiza el contexto antes de consultar las prioridades.', { code: 'RESPONSE_QUEUE_CONTEXT_CHANGED' });
    }
    const snapshot = store.snapshot!, spec = store.spec!, records = store.records();
    // Another SQLite connection can replace the copy between these synchronous reads.
    if (readWorkspaceVersion(store) !== version) {
      throw new AppError(409, 'La copia cambió durante la lectura. Vuelve a consultar las prioridades.');
    }
    const source = {
      view: 'active-local-records', captureId: snapshot.id + ':' + snapshot.capturedAt, snapshotId: snapshot.id,
      accountId: snapshot.source.accountId, capturedAt: snapshot.capturedAt, isTestData: snapshot.source.isTestData,
    };
    const revision = createHash('sha256').update(JSON.stringify({ source, spec, records })).digest('hex');
    return {
      source: { ...source, revision, contextRevision },
      ...buildResponseQueue({ spec, records, evaluatedAt: clock(), ...query }),
    };
  });
}
