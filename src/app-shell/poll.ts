type VisibilityDoc = Pick<Document, 'hidden' | 'addEventListener' | 'removeEventListener'>;

/** Repite `tick` cada `ms` solo mientras la pestaña está a la vista; al volver a ella, lee al momento.
 *  Devuelve la función que lo detiene todo. Sin `document` (pruebas, servidor) se comporta como un intervalo normal. */
export function pollWhileVisible(tick: () => void, ms: number, doc: VisibilityDoc | undefined = typeof document === 'undefined' ? undefined : document): () => void {
  const timer = setInterval(() => { if (!doc?.hidden) tick(); }, ms);
  const onVisible = () => { if (!doc?.hidden) tick(); };
  doc?.addEventListener('visibilitychange', onVisible);
  return () => { clearInterval(timer); doc?.removeEventListener('visibilitychange', onVisible); };
}
