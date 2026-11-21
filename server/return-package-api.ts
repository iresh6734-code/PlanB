// Paquete de vuelta (misión maestra, A4 · 21/11/2026). Ruta que genera los CSV de importación para HubSpot a partir de los
// cambios locales pendientes. NUNCA escribe en HubSpot ni en la copia: solo lee la copia y, si se pide, LEE HubSpot con la
// conexión del mismo portal para detectar conflictos. No mueve la marca de devolución ni marca nada como devuelto; eso solo
// ocurre en la comprobación por relectura (/api/v3/manual-recovery/verify), atada a la misma revisión que lleva el paquete.
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { CrmRecord, EntityName } from '../shared/model.js';
import { buildReturnPackage, pendingByRecord } from '../shared/return-package.js';
import type { Remote } from './recovery.js';
import { AppError, type Store } from './store.js';

/** Lecturas máximas a HubSpot por paquete: por encima, mejor dividir la vuelta que dejar una petición larga sin control. */
export const RETURN_PACKAGE_MAX_READS = 500;
const CANONICAL_ID = /^(?:0|[1-9]\d*)$/;

export interface ReturnPackageDeps {
  /** Revisión local (sesión + cambios + especificación): la misma que exige la comprobación manual. */ revision: () => string;
  /** Lector del mismo portal, o null si no hay conexión configurada. Solo se usa read() y verify(). */ readRemote: () => Remote | null;
  /** Hay una captura, simulacro u otro trabajo en marcha. */ busy: () => boolean;
}

export function registerReturnPackage(app: FastifyInstance, store: Store, deps: ReturnPackageDeps) {
  app.post('/api/v3/return-package', async request => {
    store.assertRecoveryIntegrity();
    const body = z.object({ readHubspot: z.boolean().default(true) }).strict().parse(request.body ?? {});
    const snapshot = store.snapshot, spec = store.spec;
    if (!snapshot || !store.ready || !spec) throw new AppError(409, 'Necesitas una copia activa.');
    if (deps.busy()) throw new AppError(409, 'Espera a que termine el trabajo actual.');
    const revision = deps.revision();
    const watermark = store.get<number>('returnWatermark:hubspot', 0);
    const mapping = store.get<Record<string, string>>('remoteMapping:hubspot', {});
    const changes = store.changes();
    let remote: Map<string, CrmRecord | null> | undefined;
    if (body.readHubspot) {
      const reader = deps.readRemote();
      if (!reader) throw new AppError(422, 'Para detectar conflictos hace falta la conexión de lectura del mismo portal. Configúrala o genera el paquete sin leer HubSpot.');
      if (reader.accountId !== snapshot.source.accountId) throw new AppError(422, 'La conexión es de otro portal que la captura.');
      const targets: { entity: EntityName; id: string }[] = [];
      for (const [key, item] of pendingByRecord(changes, watermark)) {
        if (!item.before) continue;
        const id = mapping[key] ?? item.after.id;
        if (CANONICAL_ID.test(id)) targets.push({ entity: item.after.entity, id });
      }
      if (targets.length > RETURN_PACKAGE_MAX_READS) throw new AppError(413, 'Son ' + targets.length + ' registros por comprobar (máximo ' + RETURN_PACKAGE_MAX_READS + ' por paquete). Devuelve los cambios por tandas.');
      await reader.verify();
      remote = new Map();
      for (const target of targets) {
        store.assertRecoveryIntegrity();
        remote.set(target.entity + ':' + target.id, await reader.read(target.entity, target.id));
      }
      if (deps.revision() !== revision) throw new AppError(409, 'Hay ediciones locales nuevas. Vuelve a generar el paquete.');
    }
    return buildReturnPackage({ spec, changes, accountId: snapshot.source.accountId, captureId: snapshot.id + ':' + snapshot.capturedAt, revision,
      generatedAt: new Date().toISOString(), watermark, mapping, remote });
  });
}
