import { AlertCircle, Building2, CalendarClock, Check, UserRound, X } from 'lucide-react';
import type { AppState, CrmRecord, FieldValue } from '../../shared/model.js';
import { displayValue } from '../components.js';
import { madridDay } from '../task-display.js';
import { closeStatus, euros, stageKind } from './deal-insights.js';
import { NewTaskButton } from './RecordSummary.js';
import { fieldList, missingFor, stageNeeds } from './stage-rules.js';

type Spec = NonNullable<AppState['spec']>;
/** Cabecera de la ficha de una oportunidad: importe, avance por el proceso y cierre de un vistazo.
 *  Pulsar un paso cambia la etapa del formulario (igual que el desplegable de abajo); no se guarda hasta «Guardar cambios».
 *  Evita la palabra «Etapa» en sus nombres accesibles: el desplegable de la ficha la usa como etiqueta. */
export function DealSummary({ spec, values, set, records, disabled, onNewTask, newTaskBlocked }: {
  spec: Spec; values: Record<string, FieldValue>; set: (key: string, value: FieldValue) => void; records: CrmRecord[]; disabled?: boolean;
  onNewTask?: () => void; newTaskBlocked?: boolean;
}) {
  const entity = spec.entities.find(item => item.id === 'deals');
  if (!entity) return null;
  const stageKey = spec.roles?.stage ?? 'dealstage', amountKey = spec.roles?.amount ?? 'amount';
  const pipeline = values.pipeline ? String(values.pipeline) : spec.stages.find(stage => stage.id === values[stageKey])?.pipelineId ?? null;
  const stages = spec.stages.filter(stage => !pipeline || !stage.pipelineId || stage.pipelineId === pipeline);
  const current = stages.find(stage => stage.id === values[stageKey]);
  const kind = stageKind(current);
  const open = stages.filter(stage => stageKind(stage) === 'open'), ends = stages.filter(stage => stageKind(stage) !== 'open');
  const reached = kind === 'open' ? open.findIndex(stage => stage.id === current?.id) : kind === 'won' ? open.length : -1;
  const closeField = entity.fields.find(field => field.type === 'date' && /cierre|close/i.test(field.key + ' ' + field.label));
  const status = closeStatus(closeField ? values[closeField.key] : null, madridDay(new Date()), kind);
  const refs = entity.fields.filter(field => field.type === 'reference').slice(0, 2)
    .map(field => ({ field, text: displayValue(values[field.key] ?? undefined, field, records, spec) })).filter(item => item.text !== '—');
  const needs = stageNeeds(spec);
  const missing = current ? missingFor(values, current.id, needs) : [];
  const step = (stage: Spec['stages'][number], state: 'done' | 'current' | 'todo' | 'won' | 'lost') => {
    const asks = stage.id === current?.id ? [] : missingFor(values, stage.id, needs);
    return <li key={stage.id} data-state={state}><button type="button" disabled={disabled} aria-current={stage.id === current?.id ? 'step' : undefined}
      title={stage.id === current?.id ? 'Paso actual' : 'Pasar a ' + stage.label + (asks.length ? '; conviene tener ' + fieldList(asks) : '') + ' (se guarda con «Guardar cambios»)'} onClick={() => set(stageKey, stage.id)}>
      <span className="ds-mark" aria-hidden="true">{state === 'done' || state === 'won' ? <Check size={12} /> : state === 'lost' ? <X size={12} /> : null}</span>{stage.label}</button></li>;
  };
  return <section className="deal-summary" data-kind={kind} aria-label="Resumen de la oportunidad">
    <div className="ds-top">
      <p className="ds-amount"><span>Importe</span><strong>{euros(values[amountKey])}</strong></p>
      <p className="ds-close" data-tone={status.tone}><CalendarClock size={15} aria-hidden="true" />{closeField || kind !== 'open' ? status.label : 'Sin fecha de cierre en el modelo'}</p>
    </div>
    {refs.length ? <ul className="ds-refs">{refs.map(({ field, text }) => <li key={field.key}>{field.referenceEntity === 'companies' ? <Building2 size={14} aria-hidden="true" /> : <UserRound size={14} aria-hidden="true" />}<span className="sr-only">{field.label}: </span>{text}</li>)}</ul> : null}
    {open.length ? <nav className="ds-steps" aria-label="Avance en el proceso comercial"><ol>
      {open.map((stage, index) => step(stage, stage.id === current?.id ? 'current' : index < reached ? 'done' : 'todo'))}
      {ends.map(stage => step(stage, stage.id === current?.id ? (stageKind(stage) === 'won' ? 'won' : 'lost') : 'todo'))}
    </ol></nav> : null}
    {current && missing.length ? <p className="ds-need" role="status"><AlertCircle size={14} aria-hidden="true" />En «{current.label}» conviene tener {fieldList(missing)}. Puedes guardar igualmente.</p> : null}
    {onNewTask || newTaskBlocked ? <div className="rs-actions"><NewTaskButton onNewTask={onNewTask} blocked={newTaskBlocked} /></div> : null}
  </section>;
}
