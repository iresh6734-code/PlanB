import { useEffect, useMemo, useState, type DragEvent } from 'react';
import { Check, ChevronLeft, ChevronRight, Copy, Download, RefreshCw } from 'lucide-react';
import type { AppSpec, CrmRecord } from '../../shared/model.js';
import { api } from '../api.js';
import { recordName } from '../components.js';
import { madridDay } from '../task-display.js';
import { ErrorState, Skeleton } from '../ui/index.js';
import { agendaDayLabel, agendaIcs, agendaIcsName, agendaItems, agendaText, agendaWeekday, buildAgenda, canMoveClose, closeFieldFor, compareItems, itemOnDay, shiftDay, stepAnchor, type AgendaItem, type AgendaView } from './agenda-grid.js';
import { downloadText } from './csv.js';
import { euros } from './deal-insights.js';
import { BOARD_MAX_PAGES, readPages, type ListPage } from './pager.js';
import { recordListPath } from './useRecordList.js';
import './agenda.css';

type Props = {
  spec: AppSpec; revision: string;
  saveField: (record: CrmRecord, key: string, value: string | null) => Promise<string | null>;
  onOpenRecord: (record: CrmRecord) => void;
};
type Read = { key: string } & ({ items: AgendaItem[]; undated: number; complete: boolean; error?: never } | { error: string; items?: never });
const VIEW_KEY = 'planb:agenda-view';
const SHOWN: Record<AgendaView, number> = { week: 10, month: 3 };
const OVERDUE_SHOWN = 8;
const TONE_LABEL = { late: 'Vencida', today: 'Hoy', soon: 'Esta semana', later: 'Más adelante' } as const;
const storedView = (): AgendaView => { try { return sessionStorage.getItem(VIEW_KEY) === 'month' ? 'month' : 'week'; } catch { return 'week'; } };
const lateBy = (day: string, today: string) => { const days = Math.round((Date.parse(today + 'T12:00:00Z') - Date.parse(day + 'T12:00:00Z')) / 86_400_000); return days === 1 ? 'hace 1 día' : 'hace ' + days + ' días'; };

/** Hoy › Agenda (F3): la semana o el mes con tareas y cierres; el cierre de una oportunidad se mueve arrastrándolo o desde el día. */
export function Agenda({ spec, revision, saveField, onOpenRecord }: Props) {
  const today = madridDay(new Date());
  const [view, setView] = useState<AgendaView>(storedView);
  const [anchor, setAnchor] = useState(today);
  const [picked, setPicked] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [read, setRead] = useState<Read | null>(null);
  const [moved, setMoved] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [dragging, setDragging] = useState<AgendaItem | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const close = closeFieldFor(spec), editable = !!close?.editable;
  const key = revision + ':' + attempt;
  const loading = read?.key !== key;

  useEffect(() => {
    const controller = new AbortController(), { signal } = controller;
    const page = (entity: 'tasks' | 'deals') => readPages((offset, limit, pageSignal) => api<ListPage>(recordListPath(entity, '', offset, '', limit), { signal: pageSignal }), signal, { maxPages: BOARD_MAX_PAGES, accept: record => record.entity === entity });
    const hasDeals = spec.entities.some(entity => entity.id === 'deals'), hasTasks = spec.entities.some(entity => entity.id === 'tasks');
    Promise.all([hasTasks ? page('tasks') : Promise.resolve(null), hasDeals ? page('deals') : Promise.resolve(null)])
      .then(([tasks, deals]) => {
        if (signal.aborted) return;
        const { items, undated } = agendaItems({ spec, tasks: tasks?.records ?? [], deals: deals?.records ?? [], today: madridDay(new Date()), nameOf: record => recordName(record, spec) });
        setMoved({});
        setRead({ key, items, undated, complete: (tasks?.complete ?? true) && (deals?.complete ?? true) });
      })
      .catch(failure => { if (!signal.aborted) setRead({ key, error: failure instanceof Error ? failure.message : 'La consulta se interrumpió.' }); });
    return () => controller.abort();
  }, [spec, key]);

  const items = useMemo(() => read?.items ? read.items.map(item => moved[item.key] ? itemOnDay(item, moved[item.key], today) : item).sort(compareItems) : [], [read, moved, today]);
  const agenda = useMemo(() => buildAgenda({ view, anchor, today, items }), [view, anchor, today, items]);
  const period = agenda.days.filter(day => day.inPeriod);
  const selected = picked && period.some(day => day.day === picked) ? picked
    : period.some(day => day.today) ? today : (period.find(day => day.items.length) ?? period[0]).day;
  const dayItems = agenda.days.find(day => day.day === selected)?.items ?? [];

  const changeView = (next: AgendaView) => { setView(next); try { sessionStorage.setItem(VIEW_KEY, next); } catch { /* sin almacenamiento de sesión */ } };
  const step = (by: number) => { setAnchor(value => stepAnchor(view, value, by)); setPicked(null); };
  const move = async (item: AgendaItem, day: string) => {
    if (!close || !canMoveClose(item, day, editable)) return;
    setBusy(item.key); setNote(null);
    const problem = await saveField(item.record, close.key, day);
    setBusy(null);
    if (problem) { setNote({ tone: 'error', text: problem }); return; }
    setMoved(value => ({ ...value, [item.key]: day }));
    setNote({ tone: 'ok', text: '«' + item.name + '» cierra ahora el ' + agendaDayLabel(day).toLocaleLowerCase('es') + '.' });
  };
  const dragProps = (item: AgendaItem) => item.kind === 'close' && editable && busy === null ? {
    draggable: true,
    onDragStart: (event: DragEvent) => { event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', item.key); setDragging(item); },
    onDragEnd: () => { setDragging(null); setOver(null); },
  } : {};
  const dropProps = (day: string) => dragging ? {
    onDragOver: (event: DragEvent) => { if (canMoveClose(dragging, day, editable)) { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; if (over !== day) setOver(day); } },
    onDragLeave: () => setOver(value => value === day ? null : value),
    onDrop: (event: DragEvent) => { event.preventDefault(); const item = dragging; setDragging(null); setOver(null); setPicked(day); if (item) void move(item, day); },
  } : {};
  const describe = (item: AgendaItem) => (item.kind === 'close' ? 'Cierre' + (item.amount !== null ? ' · ' + euros(item.amount) : '') : 'Tarea') + ' · ' + item.name + (item.tone === 'late' ? ' · vencida' : '');
  // «Copiado» vale para el periodo copiado: al cambiar de semana o de mes, el botón vuelve a ofrecer la copia.
  const copyPeriod = async () => {
    try { await navigator.clipboard.writeText(agendaText(agenda)); setCopied(agenda.title); }
    catch { setCopied(null); setNote({ tone: 'error', text: 'No se pudo copiar: el navegador no dejó usar el portapapeles.' }); }
  };
  const saveIcs = () => {
    const { text, count } = agendaIcs(agenda, new Date());
    downloadText(agendaIcsName(agenda), text, 'text/calendar;charset=utf-8');
    setNote({ tone: 'ok', text: (count === 1 ? '1 evento' : count + ' eventos') + ' en el archivo .ics. Ábrelo con Outlook o Google Calendar para añadirlos; si lo importas otra vez, se actualizan en lugar de duplicarse.' });
  };

  const head = <header className="page-header"><div><h1 id="ag-title">Agenda</h1>
      <p className="page-subtitle" title="Tareas pendientes con fecha y cierres previstos de tu copia">{agenda.title}</p></div>
    <div className="ag-head-actions">
      <div className="oc-filters" role="group" aria-label="Vista de la agenda">
        <button type="button" className="oc-filter" aria-pressed={view === 'week'} onClick={() => changeView('week')}>Semana</button>
        <button type="button" className="oc-filter" aria-pressed={view === 'month'} onClick={() => changeView('month')}>Mes</button>
      </div>
      <div className="ag-nav" role="group" aria-label="Cambiar de periodo">
        <button type="button" className="icon-button" aria-label={view === 'week' ? 'Semana anterior' : 'Mes anterior'} onClick={() => step(-1)}><ChevronLeft size={18} aria-hidden="true" /></button>
        <button type="button" className="button secondary" disabled={period.some(day => day.today) && selected === today} onClick={() => { setAnchor(today); setPicked(today); }}>Hoy</button>
        <button type="button" className="icon-button" aria-label={view === 'week' ? 'Semana siguiente' : 'Mes siguiente'} onClick={() => step(1)}><ChevronRight size={18} aria-hidden="true" /></button>
      </div>
      <button type="button" className="icon-button" aria-label="Volver a leer la copia" title="Volver a leer la copia" disabled={loading} onClick={() => setAttempt(value => value + 1)}><RefreshCw size={16} aria-hidden="true" /></button>
    </div>
  </header>;

  if (!read || (read.error !== undefined && loading)) return <section className="ag" aria-labelledby="ag-title">{head}<Skeleton rows={5} label="Leyendo tareas y oportunidades de tu copia…" /></section>;
  if (read.error !== undefined) return <section className="ag" aria-labelledby="ag-title">{head}<ErrorState title="No se pudo preparar la agenda" onAction={() => setAttempt(value => value + 1)}>{read.error}</ErrorState></section>;

  const { totals } = agenda;
  return <section className="ag" aria-labelledby="ag-title" aria-busy={loading || busy !== null}>
    {head}
    <p className="oc-sr" role="status">{note?.text ?? ''}</p>
    {note ? <p className="ag-note" data-tone={note.tone}>{note.text}</p> : null}
    <div className="ag-layout">
      <div className="ag-cal" data-view={view} data-dragging={dragging ? 'true' : undefined}>
        <div className="ag-bar">
          <dl className="ag-figures">
            <div><dt>Tareas</dt><dd>{totals.tasks}</dd></div>
            {close ? <div><dt>Cierres</dt><dd>{totals.closes}{totals.amount ? <small>{euros(totals.amount)}</small> : null}</dd></div> : null}
            <div data-tone={totals.late ? 'danger' : undefined}><dt>Vencidas aquí</dt><dd>{totals.late}</dd></div>
            <div data-tone={read.undated ? 'warn' : undefined}><dt>Sin fecha</dt><dd>{read.undated}</dd></div>
          </dl>
          <p className="ag-busiest" title={agenda.busiest ? 'Lo más cargado: ' + agendaDayLabel(agenda.busiest.day).toLocaleLowerCase('es') : undefined}>{agenda.busiest ? 'Más carga: ' + agendaWeekday(agenda.busiest.day) + ' ' + Number(agenda.busiest.day.slice(8)) + ' · ' + agenda.busiest.count : view === 'week' ? 'Semana sin nada previsto' : 'Mes sin nada previsto'}{read.complete ? '' : ' · copia leída en parte'}</p>
          <span className="ag-actions"><button type="button" className="text-button ag-copy" title={'Copia ' + (view === 'week' ? 'la semana' : 'el mes') + ' como texto para pegar en un correo o un chat'} onClick={() => void copyPeriod()}>{copied === agenda.title ? <Check size={13} aria-hidden="true" /> : <Copy size={13} aria-hidden="true" />}{copied === agenda.title ? (view === 'week' ? 'Semana copiada' : 'Mes copiado') : view === 'week' ? 'Copiar semana' : 'Copiar mes'}</button>
            <button type="button" className="text-button ag-copy" disabled={!totals.tasks && !totals.closes} title="Descarga el periodo como calendario .ics para Outlook o Google Calendar" onClick={saveIcs}><Download size={13} aria-hidden="true" />Al calendario</button></span>
        </div>
        <div className="ag-weekdays" aria-hidden="true">{agenda.days.slice(0, 7).map(day => <span key={day.day}>{agendaWeekday(day.day)}</span>)}</div>
        <ol className="ag-grid" aria-label={agenda.title}>
          {agenda.days.map(day => {
            const hidden = Math.max(0, day.items.length - SHOWN[view]);
            return <li key={day.day} className="ag-day" data-today={day.today ? 'true' : undefined} data-past={day.past ? 'true' : undefined} data-out={day.inPeriod ? undefined : 'true'} data-weekend={day.weekend ? 'true' : undefined}
              data-selected={day.day === selected ? 'true' : undefined} data-over={over === day.day ? 'true' : undefined} {...dropProps(day.day)}>
              <button type="button" className="ag-daynum" aria-pressed={day.day === selected} aria-current={day.today ? 'date' : undefined}
                aria-label={agendaDayLabel(day.day) + (day.items.length ? ', ' + day.items.length + (day.items.length === 1 ? ' elemento' : ' elementos') : ', sin nada previsto')} onClick={() => setPicked(day.day)}>
                <span className="ag-wd">{agendaWeekday(day.day)}</span><span className="ag-n">{Number(day.day.slice(8))}</span>
                {day.items.length ? <span className="ag-dots" aria-hidden="true">{day.items.length}</span> : null}
              </button>
              {day.items.length ? <ul className="ag-items">
                {day.items.slice(0, SHOWN[view]).map(item => <li key={item.key}>
                  <button type="button" className="ag-item" data-kind={item.kind} data-tone={item.tone} data-busy={busy === item.key ? 'true' : undefined} title={describe(item)} aria-label={'Abrir ' + describe(item)} onClick={() => onOpenRecord(item.record)} {...dragProps(item)}>
                    <span className="ag-item-name">{item.name}</span>{view === 'week' && item.kind === 'close' && item.amount !== null ? <span className="ag-item-amount">{euros(item.amount)}</span> : null}
                  </button>
                </li>)}
              </ul> : view === 'week' && day.inPeriod && !day.past ? <span className="ag-free" aria-hidden="true">Libre</span> : null}
              {hidden ? <button type="button" className="ag-more" onClick={() => setPicked(day.day)}>+{hidden} más</button> : null}
            </li>;
          })}
        </ol>
      </div>
      <aside className="ag-side" aria-labelledby="ag-day-title">
        <div className="ag-side-head"><h2 id="ag-day-title">{agendaDayLabel(selected)}</h2>{selected === today ? <span className="ag-stamp">Hoy</span> : null}</div>
        {dayItems.length ? <ul className="ag-list">{dayItems.map(item => <li key={item.key} data-tone={item.tone}>
          <span className="ag-kind" data-kind={item.kind}>{item.kind === 'close' ? 'Cierre' : 'Tarea'}</span>
          <div className="ag-what"><strong title={item.name}>{item.name}</strong>
            <span>{item.kind === 'close' ? [item.stage, item.amount !== null ? euros(item.amount) : null].filter(Boolean).join(' · ') || 'Oportunidad abierta' : TONE_LABEL[item.tone]}</span></div>
          <div className="ag-acts">
            {item.kind === 'close' && editable ? <label className="ag-move"><span className="oc-sr">Mover el cierre de «{item.name}»</span>
              <input type="date" value={item.day} disabled={busy !== null} onChange={event => void move(item, event.target.value)} /></label> : null}
            <button type="button" className="oc-small-button" onClick={() => onOpenRecord(item.record)} aria-label={'Abrir «' + item.name + '»'}>Abrir</button>
          </div>
        </li>)}</ul> : <p className="ag-empty">Nada previsto este día.{editable ? ' Arrastra aquí el cierre de una oportunidad desde el calendario.' : ''}</p>}
        {agenda.overdue.length ? <section className="ag-overdue" aria-labelledby="ag-overdue-title">
          <h3 id="ag-overdue-title"><span>Vencido sin resolver</span><span className="ag-overdue-n">{agenda.overdue.length}</span></h3>
          <ul className="ag-list ag-list-compact">{agenda.overdue.slice(0, OVERDUE_SHOWN).map(item => <li key={item.key} data-tone="late">
            <span className="ag-kind" data-kind={item.kind}>{item.kind === 'close' ? 'Cierre' : 'Tarea'}</span>
            <div className="ag-what"><strong title={item.name}>{item.name}</strong><span>{lateBy(item.day, today)}</span></div>
            <div className="ag-acts">
              {item.kind === 'close' && editable ? <button type="button" className="oc-small-button" disabled={busy !== null} onClick={() => void move(item, shiftDay(today, 7))} aria-label={'Pasar el cierre de «' + item.name + '» a dentro de siete días'}>A 7 días</button> : null}
              <button type="button" className="oc-small-button" onClick={() => onOpenRecord(item.record)} aria-label={'Abrir «' + item.name + '»'}>Abrir</button>
            </div>
          </li>)}</ul>
          {agenda.overdue.length > OVERDUE_SHOWN ? <p className="ag-empty">Y {agenda.overdue.length - OVERDUE_SHOWN} más: la revisión semanal las ordena por antigüedad.</p> : null}
        </section> : null}
        <p className="gx-pipe-note ag-foot">{editable ? 'Solo se mueve la fecha de cierre de las oportunidades, con el guardado de siempre: se deshace desde el aviso o desde Cambios. Las tareas se abren en su ficha.' : 'Las tareas y oportunidades se abren en su ficha; esta copia no permite mover el cierre desde aquí.'}</p>
      </aside>
    </div>
  </section>;
}
