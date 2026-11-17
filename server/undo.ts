// Deshacer el último guardado local (mejora C8 del informe; CLAUDE-UNDO-LAST, R2 por CODEX-UNDO-REVIEW-392).
// Se deshace UN guardado concreto, identificado por su cambio (id y fecha) tal como lo devolvió la ruta de guardado.
// Solo procede si ese cambio sigue siendo el último y el registro sigue exactamente como lo dejó. Las dos comprobaciones
// se repiten DENTRO de la transacción que escribe el inverso (saveRecord con guard), así que ni otra conexión ni otra
// petición pueden colarse entre la comprobación y la escritura. Repetir la misma petición tras un éxito se rechaza
// (el último cambio ya es el inverso): nunca se crea un segundo inverso. No borra historial; las altas no se deshacen.
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Change, CrmRecord } from '../shared/model.js';
import { AppError, type Store } from './store.js';

export type ChangeIdentity = { changeId: number; at: string };
type Refusal = { ok: false; status: 404 | 409; code: 'NO_CHANGES' | 'NOT_AN_UPDATE' | 'RECORD_CHANGED' | 'NOT_LATEST' | 'RECORD_MISSING'; message: string };
export type UndoPlan = { ok: true; change: Change; values: CrmRecord['values'] } | Refusal;

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const refuse = (status: Refusal['status'], code: Refusal['code'], message: string): Refusal => ({ ok: false, status, code, message });
const NOT_LATEST = 'Ese guardado ya no es el último: hubo otro cambio después.';
const RECORD_CHANGED = 'El registro cambió después de ese guardado; ábrelo y revísalo a mano.';

/**
 * Decide si se puede deshacer el guardado identificado y con qué valores. Lógica pura.
 * Los campos que la edición añadió y antes no existían vuelven a quedar vacíos (null).
 */
export function planUndo(changes: Change[], current: CrmRecord | null, expected: ChangeIdentity): UndoPlan {
  const last = changes.at(-1);
  if (!last) return refuse(404, 'NO_CHANGES', 'No hay cambios locales que deshacer.');
  if (last.id !== expected.changeId || last.at !== expected.at) return refuse(409, 'NOT_LATEST', NOT_LATEST);
  if (last.operation !== 'update' || !last.before) return refuse(409, 'NOT_AN_UPDATE', 'Un registro creado no se puede deshacer aquí; edítalo o consérvalo.');
  if (!current) return refuse(409, 'RECORD_MISSING', 'El registro ya no está en la copia.');
  if (!same(current.values, last.after.values)) return refuse(409, 'RECORD_CHANGED', RECORD_CHANGED);
  const values: CrmRecord['values'] = { ...last.before.values };
  for (const key of Object.keys(last.after.values)) if (!(key in last.before.values)) values[key] = null;
  return { ok: true, change: last, values };
}

export function registerUndo(app: FastifyInstance, store: Store) {
  const body = z.object({ changeId: z.number().int().positive(), at: z.string().min(1).max(40) }).strict();
  app.post('/api/v2/changes/undo-last', async request => {
    const expected = body.parse(request.body ?? {});
    const changes = store.changes(), last = changes.at(-1);
    const plan = planUndo(changes, last ? store.record(last.entity, last.recordId) : null, expected);
    if (!plan.ok) throw new AppError(plan.status, plan.message, { code: plan.code });
    const { change } = plan;
    let inverse: { id: number; at: string } | null = null;
    // La guarda corre dentro de la transacción de escritura: el cambio sigue siendo el último y el registro está intacto.
    const record = store.saveRecord(change.entity, plan.values, change.recordId, {
      guard: () => {
        const latest = store.latestChange();
        if (!latest || latest.id !== change.id || latest.at !== change.at) throw new AppError(409, NOT_LATEST, { code: 'NOT_LATEST' });
        if (!same(store.record(change.entity, change.recordId)?.values, change.after.values)) throw new AppError(409, RECORD_CHANGED, { code: 'RECORD_CHANGED' });
      },
      onChange: value => { inverse = value; },
    });
    return { undone: change.id, record, change: inverse };
  });
}
