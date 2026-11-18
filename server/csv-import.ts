// Importar registros desde CSV (mejora C9; CLAUDE-CSV-IMPORT, 17/11/2026).
// Dos pasos: vista previa (no escribe) y aplicación. La aplicación exige la marca de la vista previa, que depende del
// archivo, del mapeo y del estado de la copia: si algo cambió entre medias, se rechaza y hay que volver a mirar.
// Solo se dan de alta las filas válidas, cada una por saveRecord (mismas reglas que la ficha y un cambio local por alta,
// que se verá en Cambios y viajará con una devolución al CRM si la persona la hace).
import { createHash } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { CSV_LIMITS, planImport, type ImportPlan } from '../shared/csv-import.js';
import { EntityNameSchema, MAX_RECORDS, type EntityName } from '../shared/model.js';
import { AppError, type Store } from './store.js';

const PREVIEW_ROWS = 50, ERROR_ROWS = 200;

/**
 * Marca de la vista previa. Liga la aprobación a cuatro cosas:
 * - lo enviado: tipo, archivo y mapeo final;
 * - la identidad de la copia: captura (id y fecha) y sesión. Restaurar otra copia la cambia aunque tenga el mismo
 *   número de registros y el historial vacío (revisión 416/418 de Codex);
 * - su vigencia: último cambio y número de registros;
 * - el resultado que la persona revisó: los valores y errores de cada fila, con las relaciones ya resueltas a su ID.
 *   Si el mismo nombre de empresa apunta ahora a otro registro, la marca cambia.
 */
export function previewToken(store: Store, entity: EntityName, csv: string, plan: ImportPlan) {
  const latest = store.latestChange(), snapshot = store.snapshot;
  const count = Number((store.db.prepare('SELECT COUNT(*) AS n FROM records').get() as { n: number }).n);
  const copy = [snapshot?.id ?? '', snapshot?.capturedAt ?? '', store.get<string>('sessionId', '')];
  const reviewed = plan.rows.map(row => [row.line, row.values, row.errors]);
  return createHash('sha256').update(JSON.stringify([entity, csv, plan.mapping, copy, latest?.id ?? 0, latest?.at ?? '', count, reviewed])).digest('hex');
}

export function registerCsvImport(app: FastifyInstance, store: Store) {
  const base = z.object({
    entity: EntityNameSchema,
    csv: z.string().min(1).max(CSV_LIMITS.bytes),
    mapping: z.record(z.string(), z.string().nullable()).optional(),
  });
  const plan = (entity: EntityName, csv: string, mapping?: Record<string, string | null>) => {
    if (!store.ready || !store.spec) throw new AppError(409, 'Revisa y activa primero la aplicación.');
    const result = planImport(store.spec, entity, csv, store.records(), mapping);
    if (!result.headers.length) throw new AppError(422, 'El archivo no tiene cabecera: la primera fila debe nombrar las columnas.');
    if (result.rows.length > CSV_LIMITS.rows) throw new AppError(413, 'Como máximo ' + CSV_LIMITS.rows + ' filas por importación.');
    return result;
  };

  app.post('/api/v2/import/csv/preview', async request => {
    const body = base.strict().parse(request.body);
    const result = plan(body.entity, body.csv, body.mapping);
    return {
      entity: result.entity, headers: result.headers, mapping: result.mapping, ignoredColumns: result.ignoredColumns,
      total: result.rows.length, valid: result.valid, invalid: result.invalid,
      preview: result.rows.slice(0, PREVIEW_ROWS),
      errors: result.rows.filter(row => Object.keys(row.errors).length).slice(0, ERROR_ROWS).map(row => ({ line: row.line, errors: row.errors })),
      token: previewToken(store, body.entity, body.csv, result),
    };
  });

  app.post('/api/v2/import/csv/apply', async request => {
    const body = base.extend({ token: z.string().regex(/^[a-f0-9]{64}$/) }).strict().parse(request.body);
    const result = plan(body.entity, body.csv, body.mapping);
    if (previewToken(store, body.entity, body.csv, result) !== body.token) throw new AppError(409, 'La copia o el archivo cambiaron desde la vista previa. Vuelve a revisarla.', { code: 'STALE_PREVIEW' });
    const valid = result.rows.filter(row => !Object.keys(row.errors).length);
    const count = Number((store.db.prepare('SELECT COUNT(*) AS n FROM records').get() as { n: number }).n);
    if (count + valid.length > MAX_RECORDS) throw new AppError(413, 'La importación superaría el máximo de ' + MAX_RECORDS.toLocaleString('es-ES') + ' registros de la copia.');
    const created: string[] = [], failed: { line: number; error: string }[] = [];
    for (const row of valid) {
      try { created.push(store.saveRecord(body.entity, row.values).id); }
      catch (error) { failed.push({ line: row.line, error: error instanceof Error ? error.message : 'No se pudo guardar.' }); }
    }
    return { created: created.length, skipped: result.invalid, failed, ids: created };
  });
}
