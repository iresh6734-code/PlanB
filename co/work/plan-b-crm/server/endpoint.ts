import { writeFileSync, readFileSync, unlinkSync } from 'node:fs';
import { join, dirname } from 'node:path';
import type { FastifyInstance } from 'fastify';
import type { Store } from './store.js';

export function publishEndpoint(app: FastifyInstance, store: Store, _requestedPort: number) {
  const address = app.server.address();
  if (!address || typeof address === 'string' || address.port <= 0) {
    throw new Error('Plan B debe estar escuchando en un puerto antes de publicar su dirección.');
  }
  const file = join(dirname(store.filename), '.endpoint.json');
  writeFileSync(file, JSON.stringify({
    pid: process.pid,
    url: 'http://127.0.0.1:' + address.port,
    instanceId: store.get('instanceId', null),
  }));
  const clear = () => {
    try {
      if (JSON.parse(readFileSync(file, 'utf8')).pid === process.pid) unlinkSync(file);
    } catch { /* The receipt may already have been removed. */ }
  };
  process.on('exit', clear);
}
