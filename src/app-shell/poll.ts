import { useCallback, useRef, useState } from 'react';

type VisibilityDoc = Pick<Document, 'hidden' | 'addEventListener' | 'removeEventListener'>;

/** Aviso discreto cuando falla una lectura periódica: cuánto tiempo tiene lo que se está viendo. */
export function staleReadNote(lastOkAt: number | null, failedAt: number): string {
  if (lastOkAt === null) return 'No se pudo leer el estado. Se reintentará automáticamente.';
  const s = Math.max(0, Math.round((failedAt - lastOkAt) / 1000));
  const ago = s < 60 ? s + ' s' : s < 3600 ? Math.floor(s / 60) + ' min' : Math.floor(s / 3600) + ' h';
  return 'No se pudo actualizar. Lo que ves es la lectura de hace ' + ago + '; se reintentará automáticamente.';
}

/** Recuerda la última lectura correcta sin repintar en cada acierto; solo cambia de estado al fallar o al recuperarse. */
export function useReadHealth() {
  const lastOkAt = useRef<number | null>(null);
  const [failedAt, setFailedAt] = useState<number | null>(null);
  const ok = useCallback(() => { lastOkAt.current = Date.now(); setFailedAt(null); }, []);
  const fail = useCallback(() => setFailedAt(Date.now()), []);
  return { ok, fail, note: failedAt === null ? '' : staleReadNote(lastOkAt.current, failedAt) };
}

/** Repite `tick` cada `ms` solo mientras la pestaña está a la vista; al volver a ella, lee al momento.
 *  Devuelve la función que lo detiene todo. Sin `document` (pruebas, servidor) se comporta como un intervalo normal. */
export function pollWhileVisible(tick: () => void, ms: number, doc: VisibilityDoc | undefined = typeof document === 'undefined' ? undefined : document): () => void {
  const timer = setInterval(() => { if (!doc?.hidden) tick(); }, ms);
  const onVisible = () => { if (!doc?.hidden) tick(); };
  doc?.addEventListener('visibilitychange', onVisible);
  return () => { clearInterval(timer); doc?.removeEventListener('visibilitychange', onVisible); };
}
