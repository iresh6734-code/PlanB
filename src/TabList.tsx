import { useRef, type KeyboardEvent } from 'react';

export const tabPanelProps = (prefix: string, id: string) => ({ role: 'tabpanel' as const, id: prefix + '-panel-' + id, 'aria-labelledby': prefix + '-tab-' + id });
/** Pestañas con el patrón ARIA completo: panel enlazado, tabIndex móvil y flechas/Inicio/Fin. */
export function TabList<T extends string>({ label, prefix, tabs, value, onChange }: { label: string; prefix: string; tabs: readonly { id: T; label: string }[]; value: T; onChange: (id: T) => void }) {
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});
  const move = (event: KeyboardEvent, index: number) => {
    let next = index;
    if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
    else if (event.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = tabs.length - 1;
    else return;
    event.preventDefault();
    onChange(tabs[next].id);
    refs.current[tabs[next].id]?.focus();
  };
  return <div className="commercial-tabs" role="tablist" aria-label={label}>{tabs.map((tab, index) => <button key={tab.id} type="button" role="tab" id={prefix + '-tab-' + tab.id} ref={node => { refs.current[tab.id] = node; }} aria-selected={value === tab.id} aria-controls={value === tab.id ? prefix + '-panel-' + tab.id : undefined} tabIndex={value === tab.id ? 0 : -1} onClick={() => onChange(tab.id)} onKeyDown={event => move(event, index)}>{tab.label}</button>)}</div>;
}
