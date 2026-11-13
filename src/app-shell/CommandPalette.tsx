import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Modal } from '../components.js';

import { matchCommands, type Command } from './commands.js';

/** Paleta de órdenes (Ctrl J): ir a un apartado, lanzar una acción o abrir un registro escribiendo.
 *  No hace nada que no pueda hacerse con los botones de la app. Los registros se buscan en la copia local (`findRecords`). */
export function CommandPalette({ commands, close, findRecords }: { commands: Command[]; close: () => void; findRecords?: (query: string) => Promise<Command[]> }) {
  const [query, setQuery] = useState(''), [index, setIndex] = useState(0);
  const [found, setFound] = useState<{ query: string; items: Command[] } | null>(null), [searching, setSearching] = useState(false);
  const input = useRef<HTMLInputElement>(null), list = useRef<HTMLUListElement>(null), sequence = useRef(0);
  // La función llega nueva en cada pintado de App: se guarda en una referencia para no relanzar la búsqueda por eso.
  const finder = useRef(findRecords); finder.current = findRecords;
  const records = found && found.query === query.trim() ? found.items : [];
  const shown = [...matchCommands(commands, query), ...records];
  // El modal enfoca su primer control (cerrar) en el siguiente ciclo; el campo se enfoca justo después.
  useEffect(() => { const timer = setTimeout(() => input.current?.focus(), 30); return () => clearTimeout(timer); }, []);
  useEffect(() => { setIndex(0); }, [query]);
  useEffect(() => { list.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' }); }, [index]);
  // Búsqueda de registros con una pausa breve; una respuesta antigua nunca sustituye a la de lo último escrito.
  useEffect(() => {
    const text = query.trim();
    if (!finder.current || text.length < 2) { setFound(null); setSearching(false); return; }
    const mine = ++sequence.current; setSearching(true);
    const timer = setTimeout(() => {
      finder.current!(text).then(items => { if (mine === sequence.current) setFound({ query: text, items }); })
        .catch(() => { if (mine === sequence.current) setFound({ query: text, items: [] }); })
        .finally(() => { if (mine === sequence.current) setSearching(false); });
    }, 160);
    return () => clearTimeout(timer);
  }, [query]);
  const run = (command: Command | undefined) => { if (!command) return; close(); command.run(); };
  const key = (event: KeyboardEvent) => {
    if (event.key === 'ArrowDown') { event.preventDefault(); setIndex(current => Math.min(shown.length - 1, current + 1)); }
    else if (event.key === 'ArrowUp') { event.preventDefault(); setIndex(current => Math.max(0, current - 1)); }
    else if (event.key === 'Enter') { event.preventDefault(); run(shown[index]); }
  };
  const firstRecord = shown.findIndex(command => command.group === 'Registros');
  return <Modal title="Órdenes" close={close}><div className="modal-body gx-commands">
    <input ref={input} type="text" role="combobox" aria-expanded="true" aria-controls="gx-commands-list" aria-activedescendant={shown[index] ? 'gx-command-' + shown[index].id : undefined} aria-label="Escribe una orden o un nombre" placeholder="Ir a…, hacer… o buscar un cliente, una tarea…" autoComplete="off" value={query} onChange={event => setQuery(event.target.value)} onKeyDown={key} />
    {shown.length ? <ul ref={list} id="gx-commands-list" role="listbox" aria-label="Órdenes y registros">{shown.map((command, position) => <li key={command.id} id={'gx-command-' + command.id} role="option" aria-selected={position === index} data-first-record={position === firstRecord ? 'true' : undefined} onMouseEnter={() => setIndex(position)} onClick={() => run(command)}>
      <span>{command.label}</span><small>{command.hint ?? command.group}</small></li>)}</ul>
      : searching ? <p className="gx-commands-none" role="status">Buscando en tu copia…</p>
      : <p className="gx-commands-none" role="status">Nada coincide con «{query}»{findRecords && query.trim().length >= 2 ? ', ni órdenes ni registros' : ''}.</p>}
    <p className="helper">↑ ↓ para elegir, Intro para ejecutar, Esc para cerrar.{findRecords ? ' Escribe dos letras o más para buscar también clientes, empresas, oportunidades y tareas.' : ''}</p>
  </div></Modal>;
}
