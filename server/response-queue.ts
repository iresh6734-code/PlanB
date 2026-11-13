import type { FastifyInstance } from 'fastify';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { buildResponseQueue } from '../shared/response-queue.js';
import { AppError, type Store } from './store.js';

const querySchema = z.object({
  horizonHours: z.coerce.number().int().min(1).max(720).default(24),
  limit: z.coerce.number().int().min(1).max(200).default(50),
}).strict();

/** Inherits the base app's local-host, session and no-store hooks; no provider or store writes. */
export function registerResponseQueue(app: FastifyInstance, store: Store, clock: () => number = Date.now) {
  app.get('/api/v2/continuity/response-queue', async request => {
    const query = querySchema.parse(request.query);
    if (!store.ready) throw new AppError(409, 'Activa una copia conciliada antes de consultar las prioridades.');
    // Synchronous reads: no async provider work or other request can interleave on this app instance.
    const snapshot = store.snapshot!, spec = store.spec!, records = store.records();
    const captureId = snapshot.id + ':' + snapshot.capturedAt;
    const revision = createHash('sha256').update(JSON.stringify({ captureId, spec, records })).digest('hex');
    return {
      source: { view: 'active-local-records', captureId, snapshotId: snapshot.id, accountId: snapshot.source.accountId, capturedAt: snapshot.capturedAt, isTestData: snapshot.source.isTestData, revision },
      ...buildResponseQueue({ spec, records, evaluatedAt: clock(), ...query }),
    };
  });
}
