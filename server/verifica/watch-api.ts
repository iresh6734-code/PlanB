import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { AppError, type Store } from '../store.js';
import { CleanRoomError, newSalt } from '../../shared/verifica/clean-room.js';
import { READ_LIMITS } from '../../shared/verifica/engagement.js';
import { ReadAuthorizationError, type ReadRecord } from '../../shared/verifica/read-authorization.js';
import { WatchInputError } from '../../shared/verifica/watch.js';
import { WATCH_ARTIFACTS, WATCH_RESOURCE, type WatchSigningChoice, type WatchView } from '../../shared/verifica/watch-contract.js';
import { createWatchTimer, inspectWatchObservation } from './watch-timer.js';

const roles = ['previous', 'latest'] as const;
const fingerprint = z.string().regex(/^[a-f0-9]{64}$/);
const id = z.uuid();
const params = z.object({ id }).strict();
const artifactParams = z.object({ id, file: z.enum(['report', 'salt']) }).strict();
const action = z.discriminatedUnion('action', [
  z.object({ action: z.literal('set-signing'), role: z.enum(roles), fingerprint, salt: z.string().trim().min(16).max(1024).optional() }).strict(),
  z.object({ action: z.literal('resume'), token: z.string().min(1).max(4096), authorization: z.string().max(READ_LIMITS.authorizationChars),
    documentBase64: z.base64().min(4).max(Math.ceil(READ_LIMITS.documentBytes / 3) * 4), confirmRecurring: z.literal(true) }).strict(),
  z.object({ action: z.literal('pause') }).strict(),
  z.object({ action: z.literal('accept'), fingerprint, confirmed: z.literal(true) }).strict(),
]);

type Signing = { captureText: string; record: ReadRecord };
type WatchOptions = Parameters<typeof createWatchTimer>[1];

function input<T>(run: () => T): T {
  try { return run(); }
  catch (error) {
    if (error instanceof ReadAuthorizationError) throw new AppError(422, error.code === 'MALFORMED' ? 'La autorización tiene un formato incorrecto.' : error.message);
    if (error instanceof WatchInputError || error instanceof CleanRoomError) throw new AppError(422, error.message);
    throw error;
  }
}

export function registerWatchApi(app: FastifyInstance, store: Store, engagements: {
  name: (id: string) => string;
  signing: (id: string, role: WatchSigningChoice['role']) => Signing | null;
}, options?: WatchOptions) {
  const timer = createWatchTimer(store, options);
  app.addHook('preClose', () => timer.close());

  function signingChoice(id: string, role: WatchSigningChoice['role']) {
    const observation = engagements.signing(id, role);
    if (!observation) return null;
    try { return { observation, choice: { role, ...inspectWatchObservation(observation).ref } }; }
    catch (error) {
      if (error instanceof WatchInputError) return null;
      throw error;
    }
  }

  function view(id: string, name: string): WatchView {
    if (timer.configured(id)) return { name, schedule: timer.status(id) };
    const choices = roles.flatMap(role => {
      const signing = signingChoice(id, role);
      return signing ? [signing.choice] : [];
    });
    return { name, schedule: null, choices };
  }

  app.get(WATCH_RESOURCE, async request => {
    const { id } = params.parse(request.params);
    return view(id, engagements.name(id));
  });

  app.post(WATCH_RESOURCE, async request => {
    const { id } = params.parse(request.params);
    const name = engagements.name(id);
    const body = action.parse(request.body);
    input(() => {
      switch (body.action) {
        case 'set-signing': {
          const signing = signingChoice(id, body.role);
          if (!signing || signing.choice.fingerprint !== body.fingerprint) throw new AppError(409, 'La captura cambió o ya no tiene su acta. Actualiza la pantalla antes de fijarla.');
          timer.setSigning(id, signing.observation, body.salt ?? newSalt());
          break;
        }
        case 'resume': {
          let authorization: unknown;
          try { authorization = JSON.parse(body.authorization); }
          catch { throw new AppError(422, 'La autorización tiene que ser un archivo JSON válido.'); }
          const signedDocument = Buffer.from(body.documentBase64, 'base64');
          if (signedDocument.length > READ_LIMITS.documentBytes) throw new AppError(413, 'El documento firmado es demasiado grande.');
          timer.resume(id, { token: body.token, authorization, signedDocument, confirmRecurring: body.confirmRecurring });
          break;
        }
        case 'pause':
          timer.pause(id);
          break;
        case 'accept': {
          const capture = timer.report(id).entries.find(entry => entry.fingerprint === body.fingerprint);
          if (!capture?.shrink) throw new AppError(409, 'No hay una captura retenida con esa huella.');
          timer.accept(id, body.fingerprint);
          break;
        }
      }
    });
    return view(id, name);
  });

  app.get(WATCH_ARTIFACTS, async (request, reply) => {
    const { id, file } = artifactParams.parse(request.params);
    engagements.name(id);
    if (!timer.configured(id)) throw new AppError(404, 'Falta fijar la captura de firma.');
    reply.header('Cache-Control', 'no-store');
    if (file === 'salt') return reply.type('text/plain; charset=utf-8').send(timer.privateSalt(id) + '\n');
    return { report: input(() => timer.report(id)) };
  });

  return timer;
}
