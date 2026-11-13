import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { X } from 'lucide-react';
import { contactLabel, filterContacts, type ContactLike } from './commercial-drafts.js';
import './customer-combobox.css';

interface Props {
  label: string;
  contacts: ContactLike[];
  /** ID del cliente elegido. Un ID que no está en `contacts` se muestra como selección no disponible y no se sustituye. */
  value: string;
  onChange: (id: string) => void;
  disabled?: boolean;
  /** Máximo de opciones que se pintan a la vez; el resto se alcanza afinando la búsqueda. */
  limit?: number;
}

/** Selector de clientes accesible (patrón combobox con lista): escribir solo filtra, elegir exige Enter o un clic. */
export function CustomerCombobox({ label, contacts, value, onChange, disabled = false, limit = 50 }: Props) {
  const uid = useId(), listId = uid + '-list', inputRef = useRef<HTMLInputElement>(null), listRef = useRef<HTMLUListElement>(null);
  const [openRaw, setOpen] = useState(false), [query, setQuery] = useState<string | null>(null), [active, setActive] = useState(0);
  // Los homónimos (misma etiqueta nombre · correo) se distinguen añadiendo el ID del cliente.
  const frequency = new Map<string, number>();
  for (const contact of contacts) { const text = contactLabel(contact); frequency.set(text, (frequency.get(text) ?? 0) + 1); }
  const nameOf = (contact: ContactLike) => { const text = contactLabel(contact); return (frequency.get(text) ?? 0) > 1 ? text + ' · ID ' + contact.id : text; };
  const selected = contacts.find(contact => contact.id === value), missing = !!value && !selected;
  // Deshabilitado manda sobre el estado abierto: la lista no se muestra y, al habilitar de nuevo, no reaparece (el efecto la cierra).
  const open = openRaw && !disabled;
  const found = filterContacts(contacts, query ?? '', limit), items = found.items;
  const current = Math.min(active, Math.max(items.length - 1, 0));
  const text = query ?? (selected ? nameOf(selected) : '');
  const optionId = (index: number) => uid + '-option-' + index;
  const openAt = (index: number) => { setOpen(true); setActive(index); };
  const close = () => { setOpen(false); setQuery(null); };
  const choose = (id: string) => { if (disabled) return; onChange(id); close(); inputRef.current?.focus(); };
  useEffect(() => { if (disabled) close(); }, [disabled]);
  useEffect(() => { if (open) listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView?.({ block: 'nearest' }); }, [open, current]);
  const selectedIndex = Math.max(items.findIndex(contact => contact.id === value), 0);
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') { event.preventDefault(); if (!open) openAt(query === null ? selectedIndex : 0); else setActive(Math.min(current + 1, Math.max(items.length - 1, 0))); }
    else if (event.key === 'ArrowUp') { event.preventDefault(); if (!open) openAt(query === null ? selectedIndex : 0); else setActive(Math.max(current - 1, 0)); }
    else if (event.key === 'Enter') { if (open && items[current]) { event.preventDefault(); choose(items[current].id); } }
    else if (event.key === 'Escape') { if (open || query !== null) { event.preventDefault(); event.stopPropagation(); close(); } }
    else if (event.key === 'Tab') close();
  };
  const summary = !open ? '' : !contacts.length ? 'No hay clientes disponibles.' : !found.total ? 'Ningún cliente coincide.' : found.total === 1 ? '1 cliente. Usa las flechas y Intro para elegir.' : found.total + ' clientes. Usa las flechas y Intro para elegir.';
  return <div className="customer-combobox">
    <div className="field">
      <label htmlFor={uid + '-input'}><span>{label}</span></label>
      <div className="customer-combobox__control">
        <input id={uid + '-input'} ref={inputRef} type="text" role="combobox" autoComplete="off" spellCheck={false} disabled={disabled} value={text}
          placeholder="Busca por nombre, correo o teléfono" aria-autocomplete="list" aria-expanded={open} aria-controls={open ? listId : undefined}
          aria-activedescendant={open && items.length ? optionId(current) : undefined} aria-invalid={missing || undefined}
          onChange={event => { setQuery(event.target.value); setOpen(true); setActive(0); }}
          onClick={() => { if (!open) openAt(query === null ? selectedIndex : 0); }}
          onBlur={close} onKeyDown={onKeyDown} />
        {value && !disabled ? <button type="button" className="customer-combobox__clear" aria-label={'Quitar el cliente de «' + label + '»'} onMouseDown={event => event.preventDefault()} onClick={() => { if (disabled) return; onChange(''); close(); inputRef.current?.focus(); }}><X size={16} /></button> : null}
      </div>
    </div>
    {open ? <ul id={listId} ref={listRef} role="listbox" aria-label={label} className="customer-combobox__list">
      {items.map((contact, index) => <li key={contact.id} id={optionId(index)} role="option" data-contact-id={contact.id} data-active={index === current ? 'true' : undefined} aria-selected={contact.id === value}
        className="customer-combobox__option" onMouseDown={event => event.preventDefault()} onMouseEnter={() => setActive(index)} onClick={() => choose(contact.id)}>{nameOf(contact)}</li>)}
      {!contacts.length ? <li role="presentation" className="customer-combobox__note">No hay clientes disponibles en esta fuente.</li> : null}
      {contacts.length && !found.total ? <li role="presentation" className="customer-combobox__note">Ningún cliente coincide con «{query}». Prueba con otro nombre, correo o teléfono.</li> : null}
      {found.total > items.length ? <li role="presentation" className="customer-combobox__note">Se muestran {items.length} de {found.total} coincidencias. Escribe para afinar la búsqueda.</li> : null}
    </ul> : null}
    {/* Región viva sin role="status": la pantalla ya tiene mensajes de estado propios y deben seguir siendo únicos. */}
    <span className="sr-only" aria-live="polite" aria-atomic="true" data-customer-combobox-summary>{summary}</span>
    {missing ? <p className="error-box" role="alert">El cliente seleccionado ya no está disponible en esta fuente. No se ha sustituido por otro: elige uno de la lista.</p> : null}
  </div>;
}
