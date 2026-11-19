import { useEffect, useRef, useState } from 'react';
import { BellRing, X } from 'lucide-react';
import type { AppState, CrmRecord } from '../../shared/model.js';
import { api } from '../api.js';
import { recordName } from '../components.js';
import { dueReminders, reminderKey, reminderText } from './due-reminder.js';
import { doneOption } from './focus.js';
import { BOARD_MAX_PAGES, readPages, type ListPage } from './pager.js';
import { pollWhileVisible } from './poll.js';
import { recordListPath } from './useRecordList.js';

const TICK_MS = 30_000, RELOAD_MS = 5 * 60_000, STORE = 'planb.dismissedReminders';
const readDismissed = (): Set<string> => {
  try { const raw = sessionStorage.getItem(STORE); return new Set(raw ? (JSON.parse(raw) as string[]).filter(item => typeof item === 'string').slice(-200) : []); }
  catch { return new Set(); }
};

/**
 * Aviso discreto en la barra superior (H4) cuando una tarea con hora vence durante la sesión. Lee las tareas de la copia
 * local al abrir, tras cada cambio y cada 5 minutos; recalcula cada 30 segundos. Todo se pausa con la pestaña oculta.
 * Las tareas con solo día no avisan: no hay hora a la que hacerlo. Se aísla en su propio componente para que el reloj
 * no repinte la App entera.
 */
export function DueReminder({ active, spec, revision, onOpen }: { active: boolean; spec: AppState['spec'] | null | undefined; revision: string; onOpen: (record: CrmRecord) => void }) {
  const [tasks, setTasks] = useState<CrmRecord[]>([]);
  const [now, setNow] = useState(() => Date.now()), [dismissed, setDismissed] = useState(readDismissed), [reload, setReload] = useState(0);
  const since = useRef(Date.now());
  useEffect(() => {
    if (!active || !spec) { setTasks([]); return; }
    const controller = new AbortController(), { signal } = controller;
    readPages((offset, limit, pageSignal) => api<ListPage>(recordListPath('tasks', '', offset, '', limit), { signal: pageSignal }), signal, { maxPages: BOARD_MAX_PAGES, accept: record => record.entity === 'tasks' })
      .then(read => { if (!signal.aborted) { setTasks(read.records); setNow(Date.now()); } })
      .catch(() => { /* sin lectura no hay aviso; se reintenta en la próxima recarga */ });
    return () => controller.abort();
  }, [active, spec, revision, reload]);
  useEffect(() => {
    if (!active) return;
    const stopTick = pollWhileVisible(() => setNow(Date.now()), TICK_MS), stopReload = pollWhileVisible(() => setReload(value => value + 1), RELOAD_MS);
    return () => { stopTick(); stopReload(); };
  }, [active]);
  if (!active || !spec) return null;
  const done = doneOption(spec);
  const items = dueReminders(tasks, { dueKey: spec.roles?.dueDate ?? 'due_date', isDone: task => !!done && String(task.values[done.key] ?? '') === done.id, now, since: since.current, dismissed });
  const dismiss = (key: string) => setDismissed(previous => {
    const next = new Set(previous).add(key);
    try { sessionStorage.setItem(STORE, JSON.stringify([...next].slice(-200))); } catch { /* sin almacenamiento de sesión: solo en memoria */ }
    return next;
  });
  const first = items[0];
  const title = first ? recordName(first.record, spec) : '', text = first ? reminderText(first.at, now) : '';
  const late = first ? first.at < now - 60_000 : false;
  return <span className="gx-due-slot" aria-live="polite">{first ? <span className="gx-due-alert" data-late={late ? 'true' : undefined}>
    <button type="button" className="gx-due-open" title={'Abrir la tarea «' + title + '»' + (items.length > 1 ? ' · ' + (items.length - 1) + ' más con hora próxima' : '')} onClick={() => { dismiss(reminderKey(first)); onOpen(first.record); }}>
      <BellRing size={13} aria-hidden="true" /><span className="gx-due-what">{title}</span><b>{text}</b>{items.length > 1 ? <small>+{items.length - 1}</small> : null}
    </button>
    <button type="button" className="gx-due-close" aria-label={'Descartar el recordatorio de «' + title + '»'} title="Descartar" onClick={() => dismiss(reminderKey(first))}><X size={12} aria-hidden="true" /></button>
  </span> : null}</span>;
}
