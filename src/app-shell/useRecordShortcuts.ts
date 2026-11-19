// F5 · Estado de recientes y anclados de la copia abierta y lectura de sus nombres (un registro por petición, solo lectura).
import { useCallback, useEffect, useState } from 'react';
import type { CrmRecord } from '../../shared/model.js';
import { api } from '../api.js';
import { EMPTY_SHORTCUTS, movePinned, readShortcuts, refKey, rememberOpened, shortcutRefs, togglePin, writeShortcuts, type RecordRef, type RecordShortcuts } from './recents.js';

export type ShortcutEntry = { ref: RecordRef; pinned: boolean; record: CrmRecord };

/** `scope` vacío = sin copia: no se lee ni se guarda nada. Un registro que ya no existe en la copia simplemente no se muestra. */
export function useRecordShortcuts(scope: string, active: boolean, revision: string) {
  const [shortcuts, setShortcuts] = useState<RecordShortcuts>(EMPTY_SHORTCUTS);
  const [found, setFound] = useState<Map<string, CrmRecord>>(new Map());
  useEffect(() => { setShortcuts(scope ? readShortcuts(scope) : EMPTY_SHORTCUTS); }, [scope]);
  const update = useCallback((change: (current: RecordShortcuts) => RecordShortcuts) => setShortcuts(current => {
    const next = change(current);
    if (next !== current && scope) writeShortcuts(scope, next);
    return next;
  }), [scope]);
  const refs = shortcutRefs(shortcuts), wanted = refs.map(item => refKey(item.ref)).join('|');
  useEffect(() => {
    if (!active || !scope || !refs.length) { setFound(new Map()); return; }
    let live = true;
    void Promise.all(refs.map(({ ref }) => api<{ record: CrmRecord }>('/v2/records/' + ref.entity + '/' + encodeURIComponent(ref.id)).then(data => [refKey(ref), data.record] as const).catch(() => null)))
      .then(pairs => { if (live) setFound(new Map(pairs.filter((pair): pair is readonly [string, CrmRecord] => !!pair))); });
    return () => { live = false; };
  }, [active, scope, wanted, revision]);
  const entries: ShortcutEntry[] = refs.flatMap(({ ref, pinned }) => { const record = found.get(refKey(ref)); return record ? [{ ref, pinned, record }] : []; });
  return {
    shortcuts, entries,
    remember: (ref: RecordRef) => update(current => rememberOpened(current, ref)),
    /** Devuelve si quedó anclado; `full` si no cabía. */
    toggle: (ref: RecordRef) => { const result = togglePin(shortcuts, ref); if (result.shortcuts !== shortcuts) update(() => result.shortcuts); return result; },
    move: (ref: RecordRef, step: -1 | 1) => update(current => movePinned(current, ref, step)),
  };
}
