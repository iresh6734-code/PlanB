import { useEffect, useRef, useState } from 'react';
import type { ComponentPropsWithoutRef } from 'react';

export type SelectKeyIntent = 'commit' | 'revert' | 'browse' | 'none';

/** Con el desplegable cerrado, las flechas o una letra cambian el valor sin que la persona lo haya decidido todavía. */
export function selectKeyIntent(key: string): SelectKeyIntent {
  if (key === 'Enter') return 'commit';
  if (key === 'Escape') return 'revert';
  if (/^(Arrow(Up|Down|Left|Right)|Home|End|Page(Up|Down))$/.test(key) || key.length === 1 && key !== ' ') return 'browse';
  return 'none';
}

type Props = Omit<ComponentPropsWithoutRef<'select'>, 'value' | 'onChange' | 'onKeyDown' | 'onBlur'> & { value: string; onCommit: (value: string) => void };

/** Lista de la tabla: con el ratón guarda al elegir; con el teclado recorre sin guardar y confirma con Intro o al salir (Esc deshace). */
export function InlineSelect({ value, onCommit, ...rest }: Props) {
  const [draft, setDraft] = useState<string | null>(null), browsing = useRef(false);
  useEffect(() => { setDraft(null); }, [value]);
  const commit = (next: string | null) => { browsing.current = false; setDraft(null); if (next !== null && next !== value) onCommit(next); };
  return <select {...rest} value={draft ?? value} data-pending={draft !== null && draft !== value ? 'true' : undefined}
    onKeyDown={event => {
      const intent = selectKeyIntent(event.key);
      if (intent === 'browse') browsing.current = true;
      else if (intent === 'commit' && draft !== null) { event.preventDefault(); commit(draft); }
      else if (intent === 'revert' && draft !== null) { event.preventDefault(); event.stopPropagation(); browsing.current = false; setDraft(null); }
    }}
    onChange={event => { if (browsing.current) setDraft(event.target.value); else commit(event.target.value); }}
    onBlur={() => { if (draft !== null) commit(draft); else browsing.current = false; }} />;
}
