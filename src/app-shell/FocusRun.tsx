import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import type { AppSpec, CrmRecord } from '../../shared/model.js';
import { api } from '../api.js';
import { Modal, displayValue, recordName } from '../components.js';
import { madridDay } from '../task-display.js';
import { Skeleton } from '../ui/index.js';
import { daysBetween, doneOption, overdueTasks } from './focus.js';
import { MAX_PAGES, PAGE_SIZE } from './related.js';

type Outcome = 'done' | 'tomorrow' | 'skipped';
const LABEL: Record<Outcome, string> = { done: 'hecha', tomorrow: 'a mañana', skipped: 'saltada' };

/** «Despachar vencidas»: recorre las tareas vencidas una a una. Cada acción guarda con la validación de la ficha (saveField);
 *  «Saltar» no cambia nada. La lista se fija al abrir: lo que se resuelve no vuelve a aparecer. */
export function FocusRun({ spec, saveField, onOpen, close }: { spec: AppSpec; saveField: (record: CrmRecord, key: string, value: string | null) => Promise<string | null>; onOpen: (record: CrmRecord) => void; close: () => void }) {
  const [list, setList] = useState<CrmRecord[] | null>(null), [related, setRelated] = useState<CrmRecord[]>([]), [error, setError] = useState('');
  const [index, setIndex] = useState(0), [results, setResults] = useState<Record<string, Outcome>>({}), [busy, setBusy] = useState(false), [problem, setProblem] = useState('');
  const panel = useRef<HTMLDivElement>(null);
  const today = madridDay(new Date()), tomorrow = madridDay(new Date(Date.now() + 86_400_000));
  const done = doneOption(spec), dueKey = spec.roles?.dueDate ?? 'due_date';
  const tasks = spec.entities.find(entity => entity.id === 'tasks');
  useEffect(() => {
    let active = true;
    (async () => {
      const all: CrmRecord[] = [], extra: CrmRecord[] = [];
      for (let page = 0; page < MAX_PAGES; page++) {
        const data = await api<{ records: CrmRecord[]; related: CrmRecord[]; total: number }>('/v2/records/tasks?q=&offset=' + page * PAGE_SIZE + '&limit=' + PAGE_SIZE + '&pipeline=');
        all.push(...data.records); extra.push(...data.related);
        if (all.length >= data.total || !data.records.length) break;
      }
      if (active) { setList(overdueTasks(spec, all, today)); setRelated(extra); }
    })().catch(failure => { if (active) setError(failure instanceof Error ? failure.message : 'No se pudieron leer las tareas.'); });
    return () => { active = false; };
    // Solo al abrir: guardar refresca la app (y cambia `spec`), pero la lista de la sesión debe quedar fija.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { const timer = setTimeout(() => panel.current?.focus(), 40); return () => clearTimeout(timer); }, [index, list]);
  const current = list?.[index];
  const finished = !!list && index >= list.length;
  const act = async (outcome: Outcome) => {
    if (!current || busy) return;
    setProblem('');
    if (outcome !== 'skipped') {
      setBusy(true);
      const issue = outcome === 'done' && done ? await saveField(current, done.key, done.id) : await saveField(current, dueKey, tomorrow);
      setBusy(false);
      if (issue) { setProblem(issue); return; }
    }
    setResults(previous => ({ ...previous, [current.id]: outcome })); setIndex(position => position + 1);
  };
  const key = (event: KeyboardEvent) => {
    if (event.altKey || event.ctrlKey || event.metaKey || (event.target as HTMLElement).tagName === 'BUTTON' && (event.key === 'Enter' || event.key === ' ')) return;
    const letter = event.key.toLowerCase();
    if (letter === 'h' && done) { event.preventDefault(); void act('done'); }
    else if (letter === 'm') { event.preventDefault(); void act('tomorrow'); }
    else if (letter === 's' || event.key === 'ArrowRight') { event.preventDefault(); void act('skipped'); }
    else if (letter === 'a' && current) { event.preventDefault(); close(); onOpen(current); }
  };
  const counts = Object.values(results).reduce((sum, outcome) => ({ ...sum, [outcome]: (sum[outcome] ?? 0) + 1 }), {} as Partial<Record<Outcome, number>>);
  const details = current && tasks ? tasks.columns.map(column => tasks.fields.find(field => field.key === column)!).filter(field => field && field.key !== tasks.displayField && field.key !== dueKey && (!done || field.key !== done.key))
    .map(field => [field.label, displayValue(current.values[field.key], field, [...related, current], spec)] as const).filter(([, value]) => value) : [];
  return <Modal title="Despachar vencidas" close={close}><div className="modal-body gx-focus" ref={panel} tabIndex={-1} onKeyDown={key}>
    {error ? <p className="error-box" role="alert">{error}</p>
      : !list ? <Skeleton rows={4} label="Buscando tareas vencidas…" />
      : !list.length ? <div className="gx-focus-end"><p className="gx-focus-big">Nada vencido.</p><p>No hay tareas abiertas con fecha anterior a hoy.</p><button type="button" className="button primary" onClick={close}>Cerrar</button></div>
      : finished ? <div className="gx-focus-end" role="status"><p className="gx-focus-big">Listo: {list.length} {list.length === 1 ? 'tarea revisada' : 'tareas revisadas'}.</p>
          <p>{[counts.done ? counts.done + (counts.done === 1 ? ' hecha' : ' hechas') : '', counts.tomorrow ? counts.tomorrow + ' a mañana' : '', counts.skipped ? counts.skipped + (counts.skipped === 1 ? ' saltada' : ' saltadas') : ''].filter(Boolean).join(' · ')}. Todo lo cambiado está guardado en tu copia local y aparece en Cambios.</p>
          <button type="button" className="button primary" onClick={close}>Cerrar</button></div>
      : current ? <>
          <div className="gx-focus-progress" aria-hidden="true"><span style={{ width: (index / list.length * 100) + '%' }} /></div>
          <p className="gx-focus-count" aria-live="polite">Tarea {index + 1} de {list.length}</p>
          <div className="gx-focus-card">
            <p className="gx-focus-late">Vencida hace {daysBetween(String(current.values[dueKey]), today)} {daysBetween(String(current.values[dueKey]), today) === 1 ? 'día' : 'días'}</p>
            <h3>{recordName(current, spec)}</h3>
            {details.length ? <dl>{details.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl> : null}
          </div>
          {problem ? <p className="error-box" role="alert">No se guardó: {problem}</p> : null}
          <div className="gx-focus-actions">
            {done ? <button type="button" className="button primary" disabled={busy} onClick={() => void act('done')}>Marcar {done.label.toLowerCase()} <kbd>H</kbd></button> : null}
            <button type="button" className="button secondary" disabled={busy} onClick={() => void act('tomorrow')}>Pasar a mañana <kbd>M</kbd></button>
            <button type="button" className="button secondary" disabled={busy} onClick={() => { close(); onOpen(current); }}>Abrir ficha <kbd>A</kbd></button>
            <button type="button" className="text-button" disabled={busy} onClick={() => void act('skipped')}>Saltar <kbd>S</kbd></button>
          </div>
          {Object.keys(results).length ? <p className="gx-focus-trail">{list.slice(0, index).slice(-3).map(task => recordName(task, spec) + ': ' + LABEL[results[task.id]]).join(' · ')}</p> : null}
        </> : null}
  </div></Modal>;
}
