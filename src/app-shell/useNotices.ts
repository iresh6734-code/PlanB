import { useEffect, useState } from 'react';

/** Último guardado que se puede deshacer desde el aviso (solo ediciones; el servidor comprueba que sigue siendo el último cambio). */
export type Undoable = { changeId: number; at: string; copy: string };
export const NOTICE_MS = 5000, UNDO_NOTICE_MS = 8000;
export const noticeDelay = (canUndo: boolean) => canUndo ? UNDO_NOTICE_MS : NOTICE_MS;
export const undoTarget = (change?: { id: number; at: string; copy: string } | null): Undoable | null => change ? { changeId: change.id, at: change.at, copy: change.copy } : null;

/** T2 · El aviso flotante de App y su «Deshacer»: se cierra solo, y con «Deshacer» dura algo más. */
export function useNotices() {
  const [notice, setNotice] = useState('');
  const [undoable, setUndoable] = useState<Undoable | null>(null);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => { setNotice(''); setUndoable(null); }, noticeDelay(!!undoable)); return () => clearTimeout(timer);
  }, [notice, undoable]);
  return { notice, setNotice, undoable, setUndoable };
}
