import Fastify, { type FastifyInstance } from 'fastify';
import staticPlugin from '@fastify/static';
import { existsSync } from 'node:fs';
import { z } from 'zod';
import { AppError } from './store.js';
import type { RescueRoom } from './rescue-room.js';
import { MAX_JSON_BYTES, Requests, RescueError } from '../shared/rescue-room.js';
// API del ensayo: servidor PROPIO en loopback, no se monta en los servidores de producto. Cada mutación valida su entrada, exige
// versión esperada, contexto e idempotencia, y responde con el acuse persistido (saved/uncertain) o un rechazo sin aplicar.
const post = [
  ['plan', 'choosePlan', 'choosePlan'], ['estimates-script', 'loadScriptEstimates', 'loadScriptEstimates'], ['estimate', 'setEstimate', 'setEstimate'], ['note', 'saveNote', 'saveNote'],
  ['blocker', 'declareBlocker', 'declareBlocker'], ['select', 'select', 'select'], ['edit', 'editTask', 'editTask'], ['create', 'createTask', 'createTask'],
  ['crm-return', 'crmReturn', 'crmReturn'], ['arm-lost-ack', 'armLostAck', 'armLostAck'], ['prepare', 'prepareReturn', 'prepareReturn'], ['decide', 'decide', 'decide'],
  ['approve', 'approve', 'approve'], ['refresh', 'refresh', 'refreshReturn'], ['apply', 'apply', 'apply'], ['resolve', 'resolve', 'resolve'], ['close', 'closeIncident', 'close'],
] as const;
export interface RescueServerOptions { staticDir?: string }
export async function createRescueServer(room: RescueRoom, options: RescueServerOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, bodyLimit: 100_000, requestTimeout: 60_000 });
  app.addHook('onRequest', async (request, reply) => {
    const host = request.headers.host ?? '';
    if (!/^(127\.0\.0\.1|localhost|\[::1\])(?::\d+)?$/i.test(host)) return reply.code(403).send({ error: 'La sala de rescate solo acepta acceso local.', code: 'HOST_NOT_ALLOWED' });
    const origin = request.headers.origin;
    if (origin) { let ok = false; try { const u = new URL(origin); ok = u.protocol === 'http:' && u.host === host; } catch { /* origen inválido */ } if (!ok) return reply.code(403).send({ error: 'Origen no permitido.', code: 'ORIGIN_NOT_ALLOWED' }); }
    reply.header('X-Content-Type-Options', 'nosniff'); reply.header('Referrer-Policy', 'no-referrer'); reply.header('Cache-Control', 'no-store');
    reply.header('Content-Security-Policy', "default-src 'self'; connect-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
  });
  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof RescueError) return reply.code(error.status).send({ error: error.message, code: error.code, details: error.details ?? null });
    if (error instanceof AppError) return reply.code(error.status).send({ error: error.message, code: 'ENGINE_REFUSED', details: error.details ?? null });
    if (error instanceof z.ZodError) return reply.code(422).send({ error: 'Revisa los datos enviados.', code: 'INVALID_INPUT', details: error.flatten() });
    const status = error && typeof error === 'object' && 'statusCode' in error ? Number(error.statusCode) : 500;
    return reply.code(status >= 400 && status < 500 ? status : 500).send({ error: status === 413 ? 'La petición es demasiado grande.' : 'No se pudo completar la operación. El estado guardado no se ha modificado.', code: status === 413 ? 'TOO_LARGE' : 'INTERNAL' });
  });
  app.get('/api/rescue/state', async () => room.view());
  app.post('/api/rescue/preview-edit', async request => { const body = z.object({ taskId: z.string().min(1).max(200), values: z.record(z.string(), z.union([z.string().max(2000), z.number(), z.boolean(), z.null()])) }).strict().parse(request.body); return room.previewEdit(body.taskId, body.values); });
  app.get('/api/rescue/candidates', async request => { const q = z.object({ planId: z.string().min(1).max(100), operationId: z.string().min(1).max(100) }).strict().parse(request.query); return { candidates: room.candidates(q.planId, q.operationId) }; });
  for (const [route, method, schema] of post) {
    app.post('/api/rescue/' + route, async (request, reply) => {
      const body = (Requests as Record<string, z.ZodType>)[schema].parse(request.body);
      const run = await (room as unknown as Record<string, (r: unknown) => Promise<{ result: unknown; replayed: boolean; outcome: string; version: number }>>)[method](body);
      return reply.send({ ok: true, outcome: run.outcome, replayed: run.replayed, version: run.version, result: run.result });
    });
  }
  app.get('/api/rescue/report.json', async (_request, reply) => reply.header('Content-Type', 'application/json; charset=utf-8').header('Content-Disposition', 'attachment; filename="informe-rescate.json"').send(room.reportJson()));
  app.get('/api/rescue/report.html', async (_request, reply) => reply.header('Content-Type', 'text/html; charset=utf-8').header('Content-Disposition', 'attachment; filename="informe-rescate.html"').send(room.reportHtml()));
  app.get('/api/rescue/health', async () => ({ ok: true, roomId: room.roomId }));
  if (options.staticDir && existsSync(options.staticDir)) await app.register(staticPlugin, { root: options.staticDir, prefix: '/' });
  app.addHook('onClose', async () => { /* El dueño de la sala cierra el Store; aquí solo se detiene el servidor. */ });
  void MAX_JSON_BYTES;
  return app;
}
/** Escucha en loopback en el puerto pedido. Si está ocupado falla: no busca otro puerto ni toca procesos ajenos. */
export async function listenRescue(app: FastifyInstance, port: number) {
  try { await app.listen({ host: '127.0.0.1', port }); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'EADDRINUSE') throw new RescueError(409, 'PORT_BUSY', 'El puerto ' + port + ' está ocupado. Elige otro; no se detiene ningún proceso ajeno.'); throw error; }
  return port;
}
