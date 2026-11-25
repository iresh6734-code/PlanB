import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { AppError, type Store } from '../store.js';
import { MigrationInputError } from '../../shared/migration-verifier.js';
import { CleanRoomError, newSalt } from '../../shared/verifica/clean-room.js';
import { MIGRATION_BUDGET } from '../../shared/migration-budget.js';
import { READ_LIMITS } from '../../shared/verifica/engagement.js';
import { VerificaInputError } from '../../shared/verifica/inputs.js';
import { EquivalenceInputError, equivalenceWorkList, prepareEquivalenceFiles, releaseEquivalence } from '../../shared/verifica/migration.js';
import { ReadAuthorizationError, type ReadRecord } from '../../shared/verifica/read-authorization.js';
import { WatchInputError, watchReportToJson } from '../../shared/verifica/watch.js';
import { WATCH_ARTIFACTS, WATCH_MIGRATION, WATCH_RESOURCE, type WatchMigrationResult, type WatchSigningChoice, type WatchView } from '../../shared/verifica/watch-contract.js';
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
const migrationBody = z.object({
  target: z.string().min(1).max(MIGRATION_BUDGET.maxExportBytes),
  map: z.string().min(1).max(MIGRATION_BUDGET.maxExportBytes),
  asOf: z.iso.date(),
}).strict();

type Signing = { captureText: string; record: ReadRecord };
type WatchOptions = Parameters<typeof createWatchTimer>[1];

function input<T>(run: () => T): T {
  try { return run(); }
  catch (error) {
    if (error instanceof ReadAuthorizationError) throw new AppError(422, error.code === 'MALFORMED' ? 'La autorización tiene un formato incorrecto.' : error.message);
    if (error instanceof WatchInputError || error instanceof CleanRoomError) throw new AppError(422, error.message);
    if (error instanceof VerificaInputError || error instanceof MigrationInputError || error instanceof EquivalenceInputError) throw new AppError(422, error.message);
    if (error instanceof SyntaxError) throw new AppError(422, 'El destino o el mapa no es un JSON válido.');
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

  // Migración (D5) sobre la captura de cierre de la vigilancia. Si la última está retenida, se para hasta que las partes
  // acepten su huella: el parte sigue tomando la última captura como cierre y no se sustituye por otra.
  // El destino y el mapa pueden pesar hasta MIGRATION_BUDGET.maxExportBytes cada uno y viajan juntos en JSON, que escapa
  // comillas y saltos de línea: el cuerpo admite el doble de los dos más un margen, en vez del límite global de 20 MB, para
  // que un archivo dentro del presupuesto reciba el aviso del presupuesto y no un 413 genérico (Mega Plan 3, fase 2).
  app.post(WATCH_MIGRATION, { bodyLimit: 4 * MIGRATION_BUDGET.maxExportBytes + 64 * 1024 }, async (request, reply) => {
    const { id } = params.parse(request.params);
    engagements.name(id);
    if (!timer.configured(id)) throw new AppError(404, 'Falta fijar la captura de firma.');
    const body = migrationBody.parse(request.body);
    const result = input((): WatchMigrationResult => {
      const closing = timer.closing(id, new Date(Date.parse(body.asOf)).toISOString());
      if (closing.retained) throw new AppError(409, 'La última captura de la vigilancia está retenida. Acepta su huella en «Vigilancia» antes de comparar la migración.');
      const { input: equivalence } = prepareEquivalenceFiles({ closing: closing.captureText, target: body.target, map: body.map,
        watch: watchReportToJson(closing.report), salt: timer.privateSalt(id), asOf: body.asOf });
      const { report, comparison } = releaseEquivalence(equivalence);
      // El informe se guarda para que el paquete del comprador pueda llevarlo (Mega Plan 3, fase 2).
      store.set('verifica:equivalence:' + id, { report: report.fingerprint, json: JSON.stringify(report) });
      return { report, workList: equivalenceWorkList(comparison) };
    });
    reply.header('Cache-Control', 'no-store');
    return result;
  });

  return timer;
}
