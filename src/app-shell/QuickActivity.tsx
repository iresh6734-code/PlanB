import { useId, useState, type FormEvent } from 'react';
import type { AppSpec, CrmRecord, FieldValue } from '../../shared/model.js';
import { madridDay } from '../task-display.js';
import { activitySubject, activityTask, describeActivity, parseActivity } from './quick-activity.js';

type Props = { spec: AppSpec; record: CrmRecord; name: string; createTask: (values: Record<string, FieldValue>) => Promise<string | null> };

/** «Registrar actividad» (super plan V7): una línea en la ficha crea la tarea enlazada, pendiente o ya hecha. */
export function QuickActivity({ spec, record, name, createTask }: Props) {
  const inputId = useId(), hintId = useId();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const today = madridDay(new Date());
  const parsed = parseActivity(text, today);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!parsed || busy) return;
    const values = activityTask(spec, record, parsed, name);
    if (!values) { setResult({ tone: 'error', text: 'Esta ficha no tiene un enlace claro con las tareas.' }); return; }
    setBusy(true);
    const issue = await createTask(values);
    setBusy(false);
    if (issue) { setResult({ tone: 'error', text: issue }); return; }
    setResult({ tone: 'ok', text: (parsed.done ? 'Registrado: ' : 'Tarea creada: ') + activitySubject(parsed, name) + '.' });
    setText('');
  };
  return <form className="qa" onSubmit={event => void submit(event)} aria-busy={busy}>
    <label htmlFor={inputId}>Registrar actividad</label>
    <div className="qa-row">
      <input id={inputId} type="text" value={text} maxLength={300} autoComplete="off" spellCheck
        placeholder="llamar mañana 10:00 · reunión el lunes · nota: …" aria-describedby={hintId}
        onChange={event => { setText(event.target.value); setResult(null); }} />
      <button type="submit" className="button" disabled={!parsed || busy}>{busy ? 'Guardando…' : 'Registrar'}</button>
    </div>
    <p id={hintId} className="qa-hint" aria-live="polite" data-tone={result?.tone}>
      {result ? result.text : parsed ? describeActivity(parsed, today) : 'Escribe qué pasó o qué toca hacer. «Llamé…», «hecho: …» o «nota: …» quedan como hechas hoy.'}
    </p>
  </form>;
}
