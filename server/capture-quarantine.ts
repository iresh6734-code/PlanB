// Cuarentena de capturas que encogen (misión maestra A2, 22/11/2026): guardado y consulta en la copia.
// La regla está en shared/capture-quarantine.ts. Aquí: comparar con la captura anterior al capturar, guardar el motivo junto a
// la captura y exigir una confirmación ligada a ESA captura antes de abrirla para trabajar.
import { assessShrink, shrinkText, snapshotCounts, type QuarantineEntry } from '../shared/capture-quarantine.js';
import type { CrmSnapshot } from '../shared/model.js';
import { AppError, type Store } from './store.js';

const KEY = 'captureQuarantine';
type Map = Record<string, QuarantineEntry>;

/** Motivo de cuarentena de una captura nueva frente a la más reciente ya guardada (null si no hay motivo). */
export function quarantineFor(store: Store, snapshot: Pick<CrmSnapshot, 'records' | 'id' | 'capturedAt'>, at: string): QuarantineEntry | null {
  const id = snapshot.id + ':' + snapshot.capturedAt;
  const previousId = store.captures().map(item => item.id).find(item => item !== id) ?? null;
  if (!previousId) return assessShrink(null, snapshotCounts(snapshot), at);
  let previous;
  try { previous = snapshotCounts(store.capture(previousId)); }
  catch { return null; } // si la anterior no se puede leer, no se compara: nunca se pierde la captura nueva por esto
  return assessShrink(previous, snapshotCounts(snapshot), at);
}
export function saveQuarantine(store: Store, captureId: string, entry: QuarantineEntry) {
  store.set(KEY, { ...store.get<Map>(KEY, {}), [captureId]: entry });
}
export function quarantined(store: Store): Map {
  const known = new Set(store.captures().map(item => item.id));
  return Object.fromEntries(Object.entries(store.get<Map>(KEY, {})).filter(([id]) => known.has(id)));
}
/** Abrir una captura retenida exige confirmarla por su identificador exacto; al confirmarla, sale de la cuarentena. */
export function requireReleased(store: Store, captureId: string, confirm: string | undefined) {
  const map = store.get<Map>(KEY, {}), entry = map[captureId];
  if (!entry) return;
  if (confirm !== captureId) throw new AppError(409, 'Esta captura tiene menos registros que la anterior (' + shrinkText(entry) + '). Abre la anterior o confírmala si sabes por qué ha encogido.');
  const { [captureId]: _released, ...rest } = map;
  store.set(KEY, rest);
}
