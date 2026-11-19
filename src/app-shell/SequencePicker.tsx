import { useState } from 'react';
import { Check, ListChecks, PenLine, Plus, Trash2 } from 'lucide-react';
import type { AppSpec, CrmRecord, FieldValue } from '../../shared/model.js';
import { madridDay } from '../task-display.js';
import { parseTemplates, TEMPLATES_KEY } from './templates.js';
import { KIND_LABEL, MAX_SEQUENCES, parseSequences, SEQUENCES_KEY, sequenceContext, sequencePlan, sequenceTasks, serializeSequences, stepsText, upsertSequence, type Sequence } from './sequences.js';

type Props = { spec: AppSpec; record: CrmRecord; name: string; createTask: (values: Record<string, FieldValue>) => Promise<string | null> };

const dayFormat = new Intl.DateTimeFormat('es-ES', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
const dayLabel = (day: string, today: string) => day === today ? 'Hoy' : dayFormat.format(new Date(day + 'T12:00:00Z'));

function readStored() {
  try { return parseSequences(window.localStorage.getItem(SEQUENCES_KEY)); } catch { return parseSequences(null); }
}
function store(list: Sequence[]) {
  try { window.localStorage.setItem(SEQUENCES_KEY, serializeSequences(list)); return true; } catch { return false; }
}
function storedTemplates() {
  try { return parseTemplates(window.localStorage.getItem(TEMPLATES_KEY)); } catch { return parseTemplates(null); }
}

/** Secuencias de seguimiento (F4): una cadencia crea de una vez las tareas enlazadas a la ficha. No se envía nada. */
export function SequencePicker({ spec, record, name, createTask }: Props) {
  const today = madridDay(new Date());
  const [list, setList] = useState<Sequence[]>(readStored);
  const [current, setCurrent] = useState(() => list[0]?.id ?? '');
  const [start, setStart] = useState(today);
  const [draft, setDraft] = useState<{ id?: string; name: string; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [made, setMade] = useState('');
  const [result, setResult] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const chosen = list.find(item => item.id === current) ?? list[0];
  const from = /^\d{4}-\d{2}-\d{2}$/.test(start) && start >= today ? start : today;
  const plan = chosen ? sequencePlan(chosen, from) : [];
  const key = chosen ? chosen.id + '@' + from : '';
  const commit = (next: Sequence[]) => { setList(next); if (!store(next)) setResult({ tone: 'error', text: 'No se ha podido guardar en este navegador; la secuencia dura hasta que cierres la ventana.' }); };
  const run = async () => {
    if (!chosen || busy) return;
    const values = sequenceTasks({ spec, record, name, sequence: chosen, start: from, templates: storedTemplates(), context: sequenceContext(spec, record, today) });
    if (!values) { setResult({ tone: 'error', text: 'Esta ficha no tiene un enlace claro con las tareas.' }); return; }
    let created = 0;
    for (const item of values) {
      setBusy('Creando ' + (created + 1) + ' de ' + values.length + '…');
      const issue = await createTask(item);
      if (issue) {
        setBusy(null);
        setResult({ tone: 'error', text: (created ? 'Se crearon ' + created + ' de ' + values.length + ' tareas. ' : '') + issue });
        return;
      }
      created++;
    }
    setBusy(null); setMade(key);
    const last = plan[plan.length - 1]?.day ?? from;
    setResult({ tone: 'ok', text: (created === 1 ? 'Tarea creada' : created + ' tareas creadas') + ' hasta ' + dayLabel(last, today).toLocaleLowerCase('es') + '. Las verás en Hoy y en la Agenda.' });
  };
  const save = () => {
    if (!draft) return;
    const next = upsertSequence(list, draft, () => 's' + Date.now().toString(36));
    if (next.error) { setResult({ tone: 'error', text: next.error }); return; }
    setResult(null); commit(next.list); setCurrent(next.id ?? current); setDraft(null);
  };
  const remove = () => {
    if (!chosen) return;
    const next = list.filter(item => item.id !== chosen.id);
    commit(next); setCurrent(next[0]?.id ?? ''); setDraft(null); setResult(null);
  };
  return <details className="qa-seq">
    <summary>Secuencia de seguimiento</summary>
    {draft ? <div className="rs-tpl-edit">
      <label>Nombre<input value={draft.name} maxLength={60} onChange={event => setDraft({ ...draft, name: event.target.value })} /></label>
      <label>Pasos<textarea rows={5} value={draft.text} maxLength={800} spellCheck={false} onChange={event => setDraft({ ...draft, text: event.target.value })} /></label>
      <p className="rs-tpl-hint">Un paso por línea: días laborables desde el inicio, tipo (llamada, correo, reunión o tarea) y un título opcional. Por ejemplo «0 llamada Presentarme» o «3 correo Enviar el resumen».</p>
      <div className="rs-actions">
        <button type="button" className="button primary" onClick={save}><Check size={15} aria-hidden="true" />Guardar secuencia</button>
        <button type="button" className="button secondary" onClick={() => { setDraft(null); setResult(null); }}>Cancelar</button>
      </div>
    </div> : <>
      {chosen ? <div className="qa-seq-pick">
        <label>Cadencia<select value={chosen.id} disabled={!!busy} onChange={event => { setCurrent(event.target.value); setResult(null); }}>
          {list.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label>Empieza<input type="date" value={from} min={today} disabled={!!busy} onChange={event => { setStart(event.target.value); setResult(null); }} /></label>
      </div> : <p className="rs-tpl-hint">No tienes secuencias. Crea una, por ejemplo «0 llamada», «3 correo», «7 llamada».</p>}
      {plan.length ? <ol className="qa-seq-steps" aria-label="Tareas que se crearán">
        {plan.map(({ step, day }, index) => <li key={index}><span>{dayLabel(day, today)}</span><span>{KIND_LABEL[step.kind]}</span><span>{step.title}</span></li>)}
      </ol> : null}
      <div className="rs-actions">
        {chosen ? <button type="button" className="button primary" disabled={!!busy || made === key} onClick={() => void run()}>
          <ListChecks size={15} aria-hidden="true" />{busy ?? (made === key ? 'Tareas creadas' : 'Crear ' + plan.length + (plan.length === 1 ? ' tarea' : ' tareas'))}</button> : null}
        {chosen ? <button type="button" className="button secondary" disabled={!!busy} onClick={() => { setDraft({ id: chosen.id, name: chosen.name, text: stepsText(chosen.steps) }); setResult(null); }}><PenLine size={15} aria-hidden="true" />Editar</button> : null}
        {list.length < MAX_SEQUENCES ? <button type="button" className="button secondary" disabled={!!busy} onClick={() => { setDraft({ name: '', text: '0 llamada Llamar\n3 correo Correo de seguimiento' }); setResult(null); }}><Plus size={15} aria-hidden="true" />Nueva</button> : null}
        {chosen ? <button type="button" className="button secondary" disabled={!!busy} onClick={remove}><Trash2 size={15} aria-hidden="true" />Borrar</button> : null}
      </div>
    </>}
    <p className="qa-hint" aria-live="polite" data-tone={result?.tone}>
      {result ? result.text : 'Cuenta solo días laborables. Plan B no envía nada: cada tarea lleva en sus notas el texto de la plantilla, listo para copiar.'}
    </p>
  </details>;
}
