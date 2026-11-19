import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import type { AppState, CrmRecord } from '../../shared/model.js';
import { Modal } from '../components.js';
import { madridDay } from '../task-display.js';
import type { AskAnswer, AskReader } from './ask.js';
import { matchCommands, rememberCommand, withRecent, type Command } from './commands.js';

/** R4 · Preguntas a la copia desde la paleta. App da el modelo, la lectura y cómo abrir cada registro; el intérprete
 *  (ask.ts) se descarga al abrir la paleta para no pesar en el arranque. */
export type PaletteAsk = { spec: NonNullable<AppState['spec']>; read: AskReader; toCommand: (record: CrmRecord, hint: string) => Command };
type AskLib = typeof import('./ask.js');
type AskResult = { text: string; answer: AskAnswer | null; failed: boolean };
const count = (n: number, one: string, many: string) => n.toLocaleString('es-ES') + ' ' + (n === 1 ? one : many);

const RECENT_KEY = 'planb:commands:recent';
const readRecent = (): string[] => { try { const value = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]'); return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []; } catch { return []; } };
const writeRecent = (recent: string[]) => { try { localStorage.setItem(RECENT_KEY, JSON.stringify(recent)); } catch { /* sin almacenamiento: no se recuerdan */ } };

/** Paleta de órdenes (Ctrl J): ir a un apartado, lanzar una acción o abrir un registro escribiendo.
 *  No hace nada que no pueda hacerse con los botones de la app. Los registros se buscan en la copia local (`findRecords`). */
export function CommandPalette({ commands, close, findRecords, ask, shortcuts = [], initialQuery = '' }: { commands: Command[]; close: () => void; findRecords?: (query: string) => Promise<Command[]>;
  ask?: PaletteAsk; /** Anclados y abiertos hace poco (F5): se muestran con el buscador vacío. */ shortcuts?: Command[]; initialQuery?: string }) {
  const [query, setQuery] = useState(initialQuery), [index, setIndex] = useState(0);
  const [found, setFound] = useState<{ query: string; items: Command[] } | null>(null), [searching, setSearching] = useState(false);
  const input = useRef<HTMLInputElement>(null), list = useRef<HTMLUListElement>(null), sequence = useRef(0);
  // Las funciones llegan nuevas en cada pintado de App: se guardan en referencias para no relanzar la búsqueda por eso.
  const finder = useRef(findRecords); finder.current = findRecords;
  const asker = useRef(ask); asker.current = ask;
  const [lib, setLib] = useState<AskLib | null>(null);
  useEffect(() => { if (!ask) return; let live = true; void import('./ask.js').then(module => { if (live) setLib(module); }).catch(() => { /* sin intérprete: la paleta sigue con órdenes y registros */ }); return () => { live = false; }; }, [!!ask]);
  const [recent] = useState(readRecent);
  const text = query.trim();
  // Una frase como «oportunidades abiertas que cierran este mes» se responde; «empresas» a secas sigue siendo «Ir a Empresas».
  const question = useMemo(() => { const parsed = ask && lib && text.length >= 3 ? lib.parseAsk(text, ask.spec, madridDay(new Date())) : null; return parsed && lib && lib.isQuestion(parsed) ? parsed : null; }, [text, lib, ask?.spec]);
  const questionKey = question ? JSON.stringify(question) : '';
  const [result, setResult] = useState<AskResult | null>(null);
  const answer = result && result.text === questionKey ? result : null;
  const answerItems = question && answer?.answer && ask && lib ? answer.answer.records.slice(0, lib.ASK_SHOWN).map(record => ask.toCommand(record, lib.answerHint(record, question, ask.spec))) : [];
  const records = found && found.query === text ? found.items : [];
  const shown = [...answerItems, ...(text ? [] : shortcuts), ...withRecent(matchCommands(commands, query), recent, query), ...(question ? [] : records)];
  // El buscador se enfoca al pintarse (autoFocus) y el modal respeta ese foco: lo escrito justo tras Ctrl J llega aquí.
  useEffect(() => { setIndex(0); }, [query, answer?.answer]);
  useEffect(() => { list.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' }); }, [index]);
  // La respuesta se lee con una pausa algo mayor que la búsqueda y se cancela si la pregunta cambia.
  useEffect(() => {
    if (!question || !asker.current || !lib) { setResult(null); return; }
    const controller = new AbortController(), key = questionKey, current = asker.current;
    const timer = setTimeout(() => {
      lib.runAsk(question, current.spec, madridDay(new Date()), current.read, controller.signal)
        .then(value => { if (!controller.signal.aborted) setResult({ text: key, answer: value, failed: false }); })
        .catch(() => { if (!controller.signal.aborted) setResult({ text: key, answer: null, failed: true }); });
    }, 260);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [questionKey]);
  // Búsqueda de registros con una pausa breve; una respuesta antigua nunca sustituye a la de lo último escrito.
  useEffect(() => {
    if (!finder.current || text.length < 2 || question) { setFound(null); setSearching(false); return; }
    const mine = ++sequence.current; setSearching(true);
    const timer = setTimeout(() => {
      finder.current!(text).then(items => { if (mine === sequence.current) setFound({ query: text, items }); })
        .catch(() => { if (mine === sequence.current) setFound({ query: text, items: [] }); })
        .finally(() => { if (mine === sequence.current) setSearching(false); });
    }, 160);
    return () => clearTimeout(timer);
  }, [query]);
  const run = (command: Command | undefined) => { if (!command) return; writeRecent(rememberCommand(recent, command.id)); close(); command.run(); };
  const key = (event: KeyboardEvent) => {
    if (event.key === 'ArrowDown') { event.preventDefault(); setIndex(current => Math.max(0, Math.min(shown.length - 1, current + 1))); }
    else if (event.key === 'ArrowUp') { event.preventDefault(); setIndex(current => Math.max(0, current - 1)); }
    else if (event.key === 'Enter') { event.preventDefault(); run(shown[index]); }
  };
  const firstRecord = shown.findIndex(command => command.group === 'Registros');
  const firstQuiet = shown.findIndex(command => command.group !== 'Respuesta' && command.group !== 'Anclados' && command.group !== 'Abiertos hace poco');
  const unknown = question?.unknown.length ? question.unknown.join(' ') : '';
  return <Modal title="Órdenes" close={close}><div className="modal-body gx-commands">
    <input ref={input} autoFocus type="text" role="combobox" aria-expanded="true" aria-controls="gx-commands-list" aria-activedescendant={shown[index] ? 'gx-command-' + shown[index].id : undefined} aria-label="Escribe una orden, un nombre o una pregunta" placeholder="Ir a…, buscar un cliente o preguntar: «oportunidades abiertas que cierran este mes»" autoComplete="off" value={query} onChange={event => setQuery(event.target.value)} onKeyDown={key} />
    {question && lib ? <section className="gx-answer" aria-label="Respuesta de tu copia" aria-live="polite">
      <p className="gx-answer-reading"><span className="gx-answer-tag">Pregunta</span>{lib.describeAsk(question).split(' · ').map((part, position) => <span key={position} className="gx-answer-chip">{part}</span>)}</p>
      {unknown ? <p className="gx-answer-note">No entiendo «{unknown}»: lo dejo fuera de la respuesta.</p> : null}
      {question.notes.map(note => <p key={note} className="gx-answer-note">{note}</p>)}
      <p className="gx-answer-status" role="status">{!answer ? 'Leyendo tu copia…'
        : answer.failed || !answer.answer ? 'No se pudo leer la copia para responder. Prueba otra vez.'
        : answer.answer.matched === 0 ? 'Ninguna coincide en tu copia.'
        : <><strong>{count(answer.answer.matched, 'coincide', 'coinciden')}</strong>{lib.shownNote(answer.answer, !!question.limit)}.</>}
        {answer?.answer && !answer.answer.complete ? <span className="gx-answer-partial"> Respuesta parcial: se leyeron {count(answer.answer.scanned, 'registro', 'registros')} de {answer.answer.available.toLocaleString('es-ES')}.</span> : null}</p>
    </section> : null}
    {shown.length ? <ul ref={list} id="gx-commands-list" role="listbox" aria-label="Órdenes y registros">{shown.map((command, position) => <li key={command.id} id={'gx-command-' + command.id} role="option" aria-selected={position === index} data-first-record={position === firstRecord || (position === firstQuiet && position > 0) ? 'true' : undefined} data-group={command.group === 'Respuesta' || command.group === 'Anclados' ? command.group.toLowerCase() : undefined} onMouseEnter={() => setIndex(position)} onClick={() => run(command)}>
      <span>{command.label}</span><small>{command.hint ?? command.group}</small></li>)}</ul>
      : searching ? <p className="gx-commands-none" role="status">Buscando en tu copia…</p>
      : question ? null
      : <p className="gx-commands-none" role="status">Nada coincide con «{query}»{findRecords && text.length >= 2 ? ', ni órdenes ni registros' : ''}.</p>}
    <p className="helper">↑ ↓ para elegir, Intro para ejecutar, Esc para cerrar.{findRecords ? ' Escribe dos letras o más para buscar también clientes, empresas, oportunidades y tareas.' : ''}{ask ? ' O pregunta: «tareas vencidas», «las 5 oportunidades más grandes», «empresas sin teléfono».' : ''}</p>
  </div></Modal>;
}
