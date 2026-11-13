import { createHash } from 'node:crypto';
import { dirname } from 'node:path';
import type { FastifyInstance } from 'fastify';
import type { Store } from './store.js';
import type { registerSecurity } from './security.js';
import { localKey, open } from './crypto.js';
import { registerHubspotReadCheckApi, storeReadCheckEvidence } from './hubspot-read-check-api.js';

export function mountHubspotReadCheck(app: FastifyInstance, store: Store, security: ReturnType<typeof registerSecurity>) {
  return registerHubspotReadCheckApi(app, {
    captureAuthorization: security.captureAuthorization,
    evidence: storeReadCheckEvidence(store),
    config() {
      // Same persisted connection and encryption as Continuity.connection(), without constructing Jobs.
      const encoded = store.get<string | null>('hubspotConnection', null);
      if (encoded === null) return null;
      const connection = { mode: 'test', ...JSON.parse(open(encoded, localKey(dirname(store.filename)))) };
      return { ...connection, version: createHash('sha256').update(encoded).digest('hex') };
    },
  });
}
