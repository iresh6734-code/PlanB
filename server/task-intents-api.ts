import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import { TASK_INTENTS_PATH as PATH, TASK_INTENT_REQUEST_BYTES, TaskIntentScope } from '../shared/task-intents.js';
import { createTaskIntentService, type TaskIntentServiceOptions } from './task-intents-service.js';
import { getLocalAuthorizationCapture } from './security.js';
import { AppError, type Store } from './store.js';

const querySchema = z.object({ identity: z.string().min(1).max(6000), contextRevision: z.string().regex(/^[a-f0-9]{64}$/),
  limit: z.coerce.number().int().min(1).max(25).optional(), cursor: z.string().regex(/^[A-Za-z0-9_-]{1,2048}$/).optional() }).strict();
const paramsSchema = z.object({ attemptId: z.string().uuid() }).strict();
const registrations = new WeakMap<FastifyInstance, { store: Store; options: TaskIntentServiceOptions | undefined }>();

/** Opt in only within a protected base app and its single-owner installation. No main/App mount here. */
export function registerTaskIntents(app: FastifyInstance, store: Store, options?: TaskIntentServiceOptions) {
  const prior = registrations.get(app);
  if (prior) { if (prior.store !== store || prior.options !== options) throw Error('Task intents already registered with another owner'); return; }
  const capture = getLocalAuthorizationCapture(app), service = createTaskIntentService(store, options);
  const query = (input: unknown, listing: boolean) => {
    const value = querySchema.parse(input);
    if (!listing && (value.limit !== undefined || value.cursor !== undefined)) throw new AppError(422, 'La consulta de intento no admite paginación.');
    let identity: unknown;
    try { identity = JSON.parse(value.identity); } catch { throw new AppError(422, 'La identidad de la copia no es válida.'); }
    const scope = TaskIntentScope.parse({ identity, contextRevision: value.contextRevision });
    return listing ? { ...scope, ...(value.limit === undefined ? {} : { limit: value.limit }), ...(value.cursor === undefined ? {} : { cursor: value.cursor }) } : scope;
  };
  app.addHook('onSend', async (request, reply, payload) => {
    const path = request.url.split('?')[0]!;
    if (path === PATH || path.startsWith(PATH + '/')) {
      reply.header('Cache-Control', 'no-store').header('Pragma', 'no-cache');
      const vary = String(reply.getHeader('Vary') ?? '').split(',').map(v => v.trim()).filter(Boolean);
      if (!vary.some(v => v.toLowerCase() === 'cookie')) vary.push('Cookie'); reply.header('Vary', vary.join(', '));
    }
    return payload;
  });
  app.post(PATH + '/attempts', { bodyLimit: TASK_INTENT_REQUEST_BYTES }, request => service.execute(request.body, capture(request.headers.cookie)));
  app.get(PATH, { exposeHeadRoute: false }, request => service.list(query(request.query, true), capture(request.headers.cookie)));
  app.get(PATH + '/:attemptId', { exposeHeadRoute: false }, request => service.detail(paramsSchema.parse(request.params).attemptId, query(request.query, false), capture(request.headers.cookie)));
  app.get(PATH + '/:attemptId/check', { exposeHeadRoute: false }, request => service.check(paramsSchema.parse(request.params).attemptId, query(request.query, false), capture(request.headers.cookie)));
  app.post(PATH + '/:attemptId/accept', { bodyLimit: TASK_INTENT_REQUEST_BYTES }, request => service.accept(paramsSchema.parse(request.params).attemptId, request.body, capture(request.headers.cookie)));
  app.post(PATH + '/:attemptId/abandon', { bodyLimit: TASK_INTENT_REQUEST_BYTES }, request => service.abandon(paramsSchema.parse(request.params).attemptId, request.body, capture(request.headers.cookie)));
  registrations.set(app, { store, options });
  return service;
}
