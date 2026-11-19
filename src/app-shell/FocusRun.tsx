import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import type { AppSpec, CrmRecord, FieldValue } from '../../shared/model.js';
import { api } from '../api.js';
import { Modal, displayValue, recordName } from '../components.js';
import { madridDay } from '../task-display.js';
import { Skeleton } from '../ui/index.js';
import { daysBetween, doneOption, loadFocusReview, nextMonday } from './focus.js';
import { followUpDates, followUpSubject, followUpTask } from './task-preset.js';
import { recordListPath } from './useRecordList.js';

type Outcome = 'done' | 'tomorrow' | 'monday' | 'skipped';
export type FocusScope = 'overdue' | 'sweep';
const LABEL: Record<Outcome, string> = { done: 'hecha', tomorrow: 'a mañana', monday: 'al lunes', skipped: 'saltada' };

/** «Despachar vencidas»: recorre las tareas vencidas una a una. Cada acción guarda con la validación de la ficha (saveField);
 *  «Saltar» no cambia nada. La lista se fija al abrir: lo que se resuelve no vuelve a aparecer.
 *  El modo «sweep» (barrido de la mañana) añade al final las que vencen hoy; se puede cambiar antes de empezar.
 *  Con `createTask`, al marcar una como hecha se propone el siguiente paso (H2): una tarea nueva con los mismos enlaces y una fecha rápida. */
export function FocusRun({ spec, saveField, createTask, onOpen, close, initialScope = 'overdue' }: { spec: AppSpec; saveField: (record: CrmRecord, key: string, value: string | null) => Promise<string | null>; createTask?: (values: Record<string, FieldValue>) => Promise<string | null>; onOpen: (record: CrmRecord) => void; close: () => void; initialScope?: FocusScope }) {
  const [review, setReview] = useState<Awaited<ReturnType<typeof loadFocusReview>> | null>(null);
  const [error, setError] = useState(''), [attempt, setAttempt] = useState(0), [scope, setScope] = useState<FocusScope>(initialScope);
  const [index, setIndex] = useState(0), [results, setResults] = useState<Record<string, Outcome>>({}), [busy, setBusy] = useState(false), [problem, setProblem] = useState('');
  const [follow, setFollow] = useState<CrmRecord | null>(null), [subject, setSubject] = useState(''), [followed, setFollowed] = useState(0);
  const panel = useRef<HTMLDivElement>(null);
  const today = madridDay(new Date()), tomorrow = madridDay(new Date(Date.now() + 86_400_000));
  const done = doneOption(spec), dueKey = spec.roles?.dueDate ?? 'due_date';
  const tasks = spec.entities.find(entity => entity.id === 'tasks');
  useEffect(() => {
    const controller = new AbortController();
    setReview(null); setIndex(0); setResults({}); setError(''); setFollow(null); setFollowed(0);
    loadFocusReview(spec, today, (offset, limit, signal) => api(recordListPath('tasks', '', offset, '', limit), { signal }), controller.signal, scope === 'sweep')
      .then(result => { if (!controller.signal.aborted) setReview(result); })
      .catch(failure => {
        if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : 'No se pudieron leer las tareas.');
      });
    return () => controller.abort();
    // Guardar refresca el esquema, pero la lista queda fija desde la lectura inicial, el reintento o el cambio de alcance.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt, scope]);
  const list = review?.tasks;
  useEffect(() => { const timer = setTimeout(() => panel.current?.focus(), 40); return () => clearTimeout(timer); }, [index, list, follow]);
  const dates = followUpDates(today);
  const offerFollow = !!createTask && !!done && !!tasks;
  const current = list?.[index];
  const finished = !!list && index >= list.length;
  const act = async (outcome: Outcome) => {
    if (!current || busy) return;
    setProblem('');
    if (outcome !== 'skipped') {
      setBusy(true);
      const issue = outcome === 'done' && done ? await saveField(current, done.key, done.id) : await saveField(current, dueKey, outcome === 'monday' ? nextMonday(today) : tomorrow);
      setBusy(false);
      if (issue) { setProblem(issue); return; }
    }
    setResults(previous => ({ ...previous, [current.id]: outcome }));
    if (outcome === 'done' && offerFollow) { setSubject(followUpSubject(spec, current)); setFollow(current); return; }
    setIndex(position => position + 1);
  };
  // Siguiente paso tras «Hecha»: crea la tarea o se salta; en ambos casos se pasa a la siguiente vencida.
  const plan = async (due: string | null) => {
    if (!follow || busy) return;
    setProblem('');
    if (due && createTask) {
      const values = followUpTask(spec, follow, subject, due);
      if (!values) { setProblem('Escribe un asunto para la tarea de seguimiento.'); return; }
      setBusy(true);
      const issue = await createTask(values);
      setBusy(false);
      if (issue) { setProblem(issue); return; }
      setFollowed(count => count + 1);
    }
    setFollow(null); setIndex(position => position + 1);
  };
  const key = (event: KeyboardEvent) => {
    if (event.altKey || event.ctrlKey || event.metaKey || (event.target as HTMLElement).tagName === 'BUTTON' && (event.key === 'Enter' || event.key === ' ')) return;
    const letter = event.key.toLowerCase();
    if (follow) {
      if ((event.target as HTMLElement).tagName === 'INPUT') return;
      const quick = dates.find(item => item.key.toLowerCase() === letter);
      if (quick) { event.preventDefault(); void plan(quick.date); }
      else if (letter === 'n' || letter === 's' || event.key === 'ArrowRight') { event.preventDefault(); void plan(null); }
      return;
    }
    if (letter === 'h' && done) { event.preventDefault(); void act('done'); }
    else if (letter === 'm') { event.preventDefault(); void act('tomorrow'); }
    else if (letter === 'l') { event.preventDefault(); void act('monday'); }
    else if (letter === 's' || event.key === 'ArrowRight') { event.preventDefault(); void act('skipped'); }
    else if (letter === 'a' && current) { event.preventDefault(); close(); onOpen(current); }
  };
  const counts = Object.values(results).reduce((sum, outcome) => ({ ...sum, [outcome]: (sum[outcome] ?? 0) + 1 }), {} as Partial<Record<Outcome, number>>);
  const details = review && current && tasks ? tasks.columns.map(column => tasks.fields.find(field => field.key === column)!).filter(field => field && field.key !== tasks.displayField && field.key !== dueKey && (!done || field.key !== done.key))
    .map(field => [field.label, displayValue(current.values[field.key], field, [...review.related, current], spec)] as const).filter(([, value]) => value) : [];
  const started = Object.keys(results).length > 0;
  const late = current ? daysBetween(String(current.values[dueKey]), today) : 0;
  return <Modal title={scope === 'sweep' ? 'Despachar vencidas y de hoy' : 'Despachar vencidas'} close={close}><div className="modal-body gx-focus" ref={panel} tabIndex={-1} onKeyDown={key}>
    {!started ? <div className="gx-focus-scope" role="radiogroup" aria-label="Qué tareas despachar">
      {([['overdue', 'Solo vencidas'], ['sweep', 'Vencidas y de hoy']] as const).map(([value, label]) => <button key={value} type="button" role="radio" aria-checked={scope === value} className={scope === value ? 'active' : ''} disabled={busy} onClick={() => { if (scope !== value) setScope(value); }}>{label}</button>)}
    </div> : null}
    {review && !review.complete ? <p role="status">
      {review.scanned < review.total ? `Se revisaron ${review.scanned} de ${review.total} tareas.` : 'El listado cambió durante la lectura.'} Puede haber más tareas {scope === 'sweep' ? 'pendientes' : 'vencidas'}.
    </p> : null}
    {error ? <><p className="error-box" role="alert">{error}</p>
        <button type="button" className="button secondary" onClick={() => { setError(''); setAttempt(value => value + 1); }}>Reintentar</button></>
      : !list ? <Skeleton rows={4} label={scope === 'sweep' ? 'Buscando tareas vencidas y de hoy…' : 'Buscando tareas vencidas…'} />
      : !list.length ? <div className="gx-focus-end">
          <p className="gx-focus-big">{review?.complete ? (scope === 'sweep' ? 'Nada pendiente para hoy.' : 'Nada vencido.') : 'No hay tareas ' + (scope === 'sweep' ? 'pendientes' : 'vencidas') + ' entre las revisadas.'}</p>
          {review?.complete ? <p>{scope === 'sweep' ? 'No hay tareas abiertas con fecha de hoy o anterior.' : 'No hay tareas abiertas con fecha anterior a hoy.'}</p> : null}
          <button type="button" className="button primary" onClick={close}>Cerrar</button>
        </div>
      : finished ? <div className="gx-focus-end" role="status"><p className="gx-focus-big">Listo: {list.length} {list.length === 1 ? 'tarea revisada' : 'tareas revisadas'}.</p>
          <p>{[counts.done ? counts.done + (counts.done === 1 ? ' hecha' : ' hechas') : '', counts.tomorrow ? counts.tomorrow + ' a mañana' : '', counts.monday ? counts.monday + ' al lunes' : '', counts.skipped ? counts.skipped + (counts.skipped === 1 ? ' saltada' : ' saltadas') : '', followed ? followed + (followed === 1 ? ' seguimiento creado' : ' seguimientos creados') : ''].filter(Boolean).join(' · ')}. Todo lo cambiado está guardado en tu copia local y aparece en Cambios.</p>
          <button type="button" className="button primary" onClick={close}>Cerrar</button></div>
      : current ? <>
          <div className="gx-focus-progress" role="progressbar" aria-label="Avance al despachar" aria-valuemin={0} aria-valuemax={list.length} aria-valuenow={index} aria-valuetext={index + ' de ' + list.length + ' revisadas'}><span style={{ width: (index / list.length * 100) + '%' }} /></div>
          <p className="gx-focus-count" aria-live="polite" aria-atomic="true">Tarea {index + 1} de {list.length}<span className="sr-only">: {recordName(current, spec)}. {late <= 0 ? 'Vence hoy' : 'Vencida hace ' + late + (late === 1 ? ' día' : ' días')}.</span></p>
          <div className="gx-focus-card">
            <p className="gx-focus-late" data-today={late <= 0 ? 'true' : undefined}>{late <= 0 ? 'Vence hoy' : 'Vencida hace ' + late + (late === 1 ? ' día' : ' días')}</p>
            <h3>{recordName(current, spec)}</h3>
            {details.length ? <dl>{details.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl> : null}
          </div>
          {problem ? <p className="error-box" role="alert">{follow ? 'No se creó: ' : 'No se guardó: '}{problem}</p> : null}
          {follow ? <section className="gx-follow" aria-labelledby="gx-follow-title">
            <p className="gx-follow-done" role="status"><span aria-hidden="true">✓</span> Marcada como {done!.label.toLowerCase()}.</p>
            <h4 id="gx-follow-title">¿Siguiente paso?</h4>
            <label className="field gx-follow-subject"><span>Asunto de la tarea nueva</span><input value={subject} maxLength={200} disabled={busy} onChange={event => setSubject(event.target.value)} /></label>
            <div className="gx-focus-actions">
              {dates.map((item, position) => <button key={item.id} type="button" className={'button ' + (position === 0 ? 'primary' : 'secondary')} disabled={busy || !subject.trim()} onClick={() => void plan(item.date)}
                aria-label={item.label + ', ' + new Intl.DateTimeFormat('es-ES', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(item.date + 'T12:00:00Z'))}>
                {item.label} <small>{new Intl.DateTimeFormat('es-ES', { weekday: 'short', day: 'numeric', timeZone: 'UTC' }).format(new Date(item.date + 'T12:00:00Z'))}</small> <kbd>{item.key}</kbd></button>)}
              <button type="button" className="text-button" disabled={busy} onClick={() => void plan(null)}>Sin seguimiento <kbd>N</kbd></button>
            </div>
            <p className="gx-follow-note">La tarea nueva hereda el cliente y la oportunidad de esta, y se guarda en tu copia local.</p>
          </section> : <div className="gx-focus-actions">
            {done ? <button type="button" className="button primary" disabled={busy} onClick={() => void act('done')}>Marcar {done.label.toLowerCase()} <kbd>H</kbd></button> : null}
            <button type="button" className="button secondary" disabled={busy} onClick={() => void act('tomorrow')}>Pasar a mañana <kbd>M</kbd></button>
            <button type="button" className="button secondary" disabled={busy} onClick={() => void act('monday')}>Al lunes <kbd>L</kbd></button>
            <button type="button" className="button secondary" disabled={busy} onClick={() => { close(); onOpen(current); }}>Abrir ficha <kbd>A</kbd></button>
            <button type="button" className="text-button" disabled={busy} onClick={() => void act('skipped')}>Saltar <kbd>S</kbd></button>
          </div>}
          {Object.keys(results).length ? <p className="gx-focus-trail">{list.slice(0, index).slice(-3).map(task => recordName(task, spec) + ': ' + LABEL[results[task.id]]).join(' · ')}</p> : null}
        </> : null}
  </div></Modal>;
}
