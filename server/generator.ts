import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { makeDemoSpec, makeFixture } from '../shared/fixtures.js';
import { AppError, Store } from './store.js';
import { SnapshotSchema } from '../shared/model.js';
import { importHubspot } from './hubspot.js';

// La generación con un proveedor de IA está aparcada (rama archivo/aparcado-2026-11-22): solo queda la de ensayo.
export function registerGenerator(app: FastifyInstance, store: Store) {
  let working = false;
  async function exclusively<T>(fn: () => Promise<T>): Promise<T> {
    if (working) throw new AppError(409, 'Hay una importación o generación en curso. Espera a que termine.');
    working = true;
    try { return await fn(); } finally { working = false; }
  }
  app.post('/api/import/fixture', async request => {
    const body = z.object({ profile: z.enum(['agency', 'distribution']), replace: z.boolean().default(false) }).strict().parse(request.body);
    return exclusively(async () => ({ report: store.importSnapshot(makeFixture(body.profile), body.replace) }));
  });
  app.post('/api/import/snapshot', async request => {
    const body = z.object({ snapshot: z.unknown(), replace: z.boolean().default(false) }).strict().parse(request.body);
    const snapshot=SnapshotSchema.parse(body.snapshot);
    if(!snapshot.source.isTestData&&!store.get('password',null))throw new AppError(409,'Protege esta instalación con una contraseña antes de importar datos reales.');
    return exclusively(async () => ({ report: store.importSnapshot(snapshot, body.replace) }));
  });
  app.post('/api/import/hubspot', async request => {
    const body = z.object({
      token: z.string().max(4096).optional(), accountId: z.string(), name: z.string().max(100).optional(),
      confirmedTestAccount: z.literal(true), replace: z.boolean().default(false)
    }).strict().parse(request.body);
    return exclusively(async () => {
      if (store.disconnected) throw new AppError(409, 'Reconecta los servicios antes de importar HubSpot.');
      const snapshot = await importHubspot({ ...body, token: body.token || process.env.PLANB_HUBSPOT_TOKEN || '' });
      return { report: store.importSnapshot(snapshot, body.replace) };
    });
  });
  app.post('/api/generate', async request => {
    const body = z.object({ mode: z.literal('demo') }).strict().parse(request.body);
    return exclusively(async () => {
      store.assertRecoveryIntegrity();
      if(store.get('continuitySession',null))throw new AppError(409,'No se generan propuestas durante una sesión de continuidad.');
      const snapshot = store.candidate?.snapshot ?? store.snapshot;
      if (!snapshot) throw new AppError(409, 'Elige o importa primero una captura.');
      try {
        store.assertRecoveryIntegrity();
        const spec = makeDemoSpec(snapshot);
        store.saveGeneration(spec, { provider: 'demo', model: null, generatedAt: new Date().toISOString(), prompt: '', approved: false });
        return { spec, generation: store.candidate?.generation ?? store.generation,
          note: 'Especificación de ensayo construida a partir de la captura. No se ha llamado a una IA ni se han procesado instrucciones nuevas.' };
      } catch (error) {
        store.transaction(() => {
          store.assertRecoveryIntegrity();
          store.failGeneration(error instanceof AppError ? error.message : 'No se pudo completar la generación.');
        });
        throw error;
      }
    });
  });
}
