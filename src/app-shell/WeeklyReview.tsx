import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, Copy, RefreshCw } from 'lucide-react';
import type { AppSpec, CrmRecord, FieldValue } from '../../shared/model.js';
import { SavedChangesSchema } from '../../shared/recovery-integrity.js';
import { api } from '../api.js';
import { recordName } from '../components.js';
import { madridDay } from '../task-display.js';
import { ErrorState, Skeleton } from '../ui/index.js';
import { euros } from './deal-insights.js';
import { doneOption } from './focus.js';
import { BOARD_MAX_PAGES, readPages, type ListPage } from './pager.js';
import { followUpDates } from './task-preset.js';
import { recordListPath } from './useRecordList.js';
import { nextStepTask, POSTPONE_LIMIT, reviewDay, reviewHeadline, reviewText, weeklyReview, type WeeklyReview as Review } from './weekly-review.js';
import './weekly-review.css';

type Props = {
  spec: AppSpec; revision: string; title: string;
  saveField: (record: CrmRecord, key: string, value: string | null) => Promise<string | null>;
  createTask: (values: Record<string, FieldValue>) => Promise<string | null>;
  onOpenRecord: (record: CrmRecord) => void;
};
type Read = { key: string } & ({ review: Review; error?: never } | { error: string; review?: never });
const SHOWN = 6;

/** Hoy › Revisión semanal (H3): lo hecho en siete días y lo que pide una decisión, con la acción en la misma fila. */
export function WeeklyReview({ spec, revision, title, saveField, createTask, onOpenRecord }: Props) {
  const [attempt, setAttempt] = useState(0);
  const [read, setRead] = useState<Read | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [more, setMore] = useState<Record<string, boolean>>({});
  const [copied, setCopied] = useState(false);
  const firstPending = useRef<number | null>(null);
  const key = revision + ':' + attempt;
  const current = read?.key === key ? read : null;
  useEffect(() => {
    const controller = new AbortController(), { signal } = controller;
    const page = (entity: 'tasks' | 'deals') => readPages((offset, limit, pageSignal) => api<ListPage>(recordListPath(entity, '', offset, '', limit), { signal: pageSignal }), signal, { maxPages: BOARD_MAX_PAGES, accept: record => record.entity === entity });
    const hasDeals = spec.entities.some(entity => entity.id === 'deals');
    Promise.all([page('tasks'), hasDeals ? page('deals') : Promise.resolve(null), api<{ changes?: unknown }>('/v2/changes', { signal })])
      .then(([tasks, deals, journal]) => {
        if (signal.aborted) return;
        const saved = SavedChangesSchema.safeParse(journal?.changes);
        if (!saved.success) throw Error('La copia no devolvió un historial de cambios legible.');
        const review = weeklyReview({ spec, tasks: tasks.records, deals: deals?.records ?? [], changes: saved.data, now: new Date(), tasksComplete: tasks.complete, nameOf: record => recordName(record, spec) });
        if (firstPending.current === null) firstPending.current = review.pending;
        setRead({ key, review });
      })
      .catch(failure => { if (!signal.aborted) setRead({ key, error: failure instanceof Error ? failure.message : 'La consulta se interrumpió.' }); });
    return () => controller.abort();
  }, [spec, key]);

  const review = current?.review;
  const done = doneOption(spec), dueKey = spec.roles?.dueDate ?? 'due_date';
  const dates = review ? followUpDates(review.to) : [];
  const tomorrow = dates.find(item => item.id === 'tomorrow'), monday = dates.find(item => item.id === 'monday');
  const run = async (id: string, action: () => Promise<string | null>, ok: string) => {
    setBusy(id); setNote(null);
    const problem = await action();
    setBusy(null);
    setNote(problem ? { tone: 'error', text: problem } : { tone: 'ok', text: ok });
  };
  const markDone = (record: CrmRecord, name: string) => done ? run(record.id, () => saveField(record, done.key, done.id), '«' + name + '» marcada como hecha.') : undefined;
  const moveTo = (record: CrmRecord, name: string, day: string, label: string) => run(record.id, () => saveField(record, dueKey, day), '«' + name + '» pasa a ' + label.toLocaleLowerCase('es') + '.');
  const follow = (record: CrmRecord, name: string) => {
    const values = tomorrow ? nextStepTask(spec, record, name, tomorrow.date) : null;
    return values ? run(record.id, () => createTask(values), 'Seguimiento de «' + name + '» creado para mañana.') : undefined;
  };
  const list = <T,>(id: string, items: T[]) => more[id] ? items : items.slice(0, SHOWN);
  const showMore = (id: string, total: number) => total > SHOWN ? <button type="button" className="oc-link wr-more" aria-expanded={!!more[id]} onClick={() => setMore(value => ({ ...value, [id]: !value[id] }))}>{more[id] ? 'Ver menos' : 'Ver las ' + total}</button> : null;
  const start = firstPending.current ?? 0, decided = review ? Math.max(0, start - review.pending) : 0;
  const copy = () => { if (!review) return; void navigator.clipboard?.writeText(reviewText(review, title)).then(() => setCopied(true)).catch(() => setCopied(false)); };

  return <section className="wr" aria-labelledby="wr-title">
    <header className="page-header"><div><h1 id="wr-title">Revisión semanal</h1>
      <p className="page-subtitle">{review ? 'Del ' + reviewDay(review.from) + ' al ' + reviewDay(review.to) + '. ' : ''}Lo hecho en siete días y lo que pide una decisión antes de la semana que viene.</p></div>
      <div className="wr-head-actions">
        <button type="button" className="button secondary" disabled={!review} onClick={copy}><Copy size={16} aria-hidden="true" />Copiar como texto</button>
        <button type="button" className="button secondary" disabled={!current} onClick={() => setAttempt(value => value + 1)}><RefreshCw size={16} aria-hidden="true" />Actualizar</button>
      </div>
    </header>
    <p className="oc-sr" role="status">{copied ? 'Revisión copiada.' : ''}{note ? ' ' + note.text : ''}</p>
    {!current ? <Skeleton rows={4} label="Leyendo tareas, oportunidades y cambios de tu copia…" />
      : current.error !== undefined ? <ErrorState title="No se pudo preparar la revisión" onAction={() => setAttempt(value => value + 1)}>{current.error}</ErrorState>
      : review ? <>
        <div className="wr-summary" data-clear={review.pending === 0 ? 'true' : undefined}>
          <div className="wr-summary-text">
            {review.pending === 0 ? <CheckCircle2 size={22} aria-hidden="true" /> : null}
            <p><strong>{review.pending === 0 ? 'Semana en orden.' : reviewHeadline(review)}</strong>{review.pending === 0 ? ' ' + reviewHeadline(review) : ''}</p>
          </div>
          {start > 0 ? <div className="wr-meter"><span>Decididas en esta revisión: {decided} de {start}</span><progress max={start} value={decided} aria-label={'Decididas ' + decided + ' de ' + start} /></div> : null}
          <dl className="wr-figures">
            <div><dt>Hechas</dt><dd>{review.done.length}</dd></div>
            <div><dt>Ganadas</dt><dd>{review.won.length}{review.won.some(item => item.amount !== null) ? <small>{euros(review.won.reduce((sum, item) => sum + (item.amount ?? 0), 0))}</small> : null}</dd></div>
            <div data-tone={review.postponed.length ? 'warn' : undefined}><dt>Pospuestas de más</dt><dd>{review.postponed.length}</dd></div>
            <div data-tone={review.overdue.length ? 'danger' : undefined}><dt>Vencidas</dt><dd>{review.overdue.length}</dd></div>
            <div data-tone={review.noNext?.length ? 'warn' : undefined}><dt>Sin próximo paso</dt><dd>{review.noNext === null ? '—' : review.noNext.length}</dd></div>
          </dl>
        </div>
        {note ? <p className="wr-note" data-tone={note.tone}>{note.text}</p> : null}
        <div className="wr-grid">
          <article className="oc-card wr-card" data-wide={review.postponed.length ? 'true' : undefined} aria-labelledby="wr-postponed">
            <div className="oc-card-head"><h2 id="wr-postponed">Pospuestas más de {POSTPONE_LIMIT} veces <span className="oc-count">{review.postponed.length}</span></h2></div>
            <p className="wr-hint">Si siempre se aplaza, decide: hazla hoy, ciérrala o cámbiala por algo que sí vayas a hacer.</p>
            {review.postponed.length ? <ul className="oc-task-list wr-list">{list('postponed', review.postponed).map(item => <li key={item.record.id}>
              <span className="oc-chip" data-tone="warn">{item.postponed} veces</span>
              <div style={{ minWidth: 0 }}><strong title={item.name}>{item.name}</strong><span className="oc-due">{item.due ? (item.late ? 'Venció hace ' + (item.late === 1 ? '1 día' : item.late + ' días') : 'Vence el ' + reviewDay(item.due)) : 'Sin fecha'}</span></div>
              <span className="wr-actions">{done ? <button type="button" className="oc-small-button" disabled={busy !== null} onClick={() => void markDone(item.record, item.name)} aria-label={'Marcar como hecha «' + item.name + '»'}>Hecha</button> : null}
                <button type="button" className="oc-small-button" onClick={() => onOpenRecord(item.record)} aria-label={'Abrir «' + item.name + '» para cambiarla'}>Abrir</button></span>
            </li>)}</ul> : <p className="oc-empty-line ui-empty ui-empty-ok">Ninguna tarea se ha aplazado más de {POSTPONE_LIMIT} veces.</p>}
            {showMore('postponed', review.postponed.length)}
          </article>
          <article className="oc-card wr-card" data-wide={review.overdue.length ? 'true' : undefined} aria-labelledby="wr-overdue">
            <div className="oc-card-head"><h2 id="wr-overdue">Vencidas <span className="oc-count">{review.overdue.length}</span></h2></div>
            {review.overdue.length ? <ul className="oc-task-list wr-list">{list('overdue', review.overdue).map(item => <li key={item.record.id}>
              <span className="oc-chip" data-tone="danger">{item.late === 1 ? '1 día' : item.late + ' días'}</span>
              <div style={{ minWidth: 0 }}><strong title={item.name}>{item.name}</strong><span className="oc-due">{item.postponed ? 'Aplazada ' + (item.postponed === 1 ? '1 vez' : item.postponed + ' veces') : 'Venció el ' + reviewDay(item.due!)}</span></div>
              <span className="wr-actions">{done ? <button type="button" className="oc-small-button" disabled={busy !== null} onClick={() => void markDone(item.record, item.name)} aria-label={'Marcar como hecha «' + item.name + '»'}>Hecha</button> : null}
                {tomorrow ? <button type="button" className="oc-small-button" disabled={busy !== null} onClick={() => void moveTo(item.record, item.name, tomorrow.date, tomorrow.label)} aria-label={'Pasar «' + item.name + '» a mañana'}>Mañana</button> : null}
                {monday ? <button type="button" className="oc-small-button" disabled={busy !== null} onClick={() => void moveTo(item.record, item.name, monday.date, monday.label)} aria-label={'Pasar «' + item.name + '» al lunes'}>Lunes</button> : null}
                <button type="button" className="oc-small-button" onClick={() => onOpenRecord(item.record)} aria-label={'Abrir «' + item.name + '»'}>Abrir</button></span>
            </li>)}</ul> : <p className="oc-empty-line ui-empty ui-empty-ok">No hay tareas vencidas{review.postponed.some(item => item.late) ? ' aparte de las pospuestas' : ''}.</p>}
            {showMore('overdue', review.overdue.length)}
          </article>
          {spec.entities.some(entity => entity.id === 'deals') ? <article className="oc-card wr-card" data-wide={review.noNext?.length ? 'true' : undefined} aria-labelledby="wr-nonext">
            <div className="oc-card-head"><h2 id="wr-nonext">Oportunidades sin próximo paso {review.noNext ? <span className="oc-count">{review.noNext.length}</span> : null}</h2></div>
            {review.noNext === null ? <p className="wr-hint">No se puede saber: {spec.entities.find(entity => entity.id === 'tasks')?.fields.some(field => field.type === 'reference' && field.referenceEntity === 'deals') ? 'no se pudieron leer todas las tareas de la copia.' : 'las tareas de esta copia no se enlazan con oportunidades.'}</p>
              : review.noNext.length ? <>
                <p className="wr-hint">Abiertas y sin ninguna tarea pendiente. Un seguimiento para mañana las vuelve a poner en marcha.</p>
                <ul className="oc-task-list wr-list">{list('nonext', review.noNext).map(item => <li key={item.record.id}>
                  <span className="oc-chip" data-tone="warn">{item.stage}</span>
                  <div style={{ minWidth: 0 }}><strong title={item.name}>{item.name}</strong><span className="oc-due">{item.amount === null ? 'Sin importe' : euros(item.amount)}</span></div>
                  <span className="wr-actions">{tomorrow && nextStepTask(spec, item.record, item.name, tomorrow.date) ? <button type="button" className="oc-small-button" disabled={busy !== null} onClick={() => void follow(item.record, item.name)} aria-label={'Crear un seguimiento para mañana de «' + item.name + '»'}>Seguimiento</button> : null}
                    <button type="button" className="oc-small-button" onClick={() => onOpenRecord(item.record)} aria-label={'Abrir la oportunidad «' + item.name + '»'}>Abrir</button></span>
                </li>)}</ul>
                {showMore('nonext', review.noNext.length)}
              </> : <p className="oc-empty-line ui-empty ui-empty-ok">Todas las oportunidades abiertas tienen una tarea pendiente.</p>}
          </article> : null}
          <article className="oc-card wr-card wr-done" aria-labelledby="wr-done">
            <div className="oc-card-head"><h2 id="wr-done">Hecho esta semana <span className="oc-count">{review.done.length + review.won.length}</span></h2></div>
            {review.done.length + review.won.length ? <ul className="wr-done-list">
              {review.won.map(item => <li key={'w' + item.id}><span className="oc-chip" data-tone="ok">Ganada</span><span className="wr-done-name">{item.name}</span><span className="oc-due">{item.amount === null ? '' : euros(item.amount)}</span></li>)}
              {list('done', review.done).map(item => <li key={'d' + item.id}><CheckCircle2 size={15} aria-hidden="true" /><span className="wr-done-name">{item.name}</span><span className="oc-due">{reviewDay(madridDay(new Date(item.at)))}</span></li>)}
            </ul> : <p className="oc-empty-line ui-empty">Esta semana no se ha cerrado nada desde Plan B.</p>}
            {showMore('done', review.done.length)}
          </article>
        </div>
        <p className="gx-pipe-note wr-foot">Sale de lo guardado en esta copia: lo que se cerró directamente en el CRM de origen no deja rastro aquí. Cada cambio se puede deshacer desde el aviso o desde Cambios.</p>
      </> : null}
  </section>;
}
