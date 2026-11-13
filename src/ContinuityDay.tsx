import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowRight, ArrowUp, Pin, PinOff, Printer, X } from 'lucide-react';
import {
  BUCKET_LABEL, MAX_ESTIMATE_MINUTES, MIN_ESTIMATE_MINUTES, buildContinuityDay, emptyDecisions, moveTask, pickTask, printableDay, setPinned, skipTask, unpickTask, unskipTask,
  type DayCandidate, type DayDecisions, type DayEntry, type DecisionItem, type OutcomeHints,
} from '../shared/continuity-day.js';
import './continuity-day.css';

// Jornada de continuidad (unidad 205). PREPARACIÓN: todavía NO está montada en Hoy. Convierte un tiempo disponible declarado en una selección editable
// sobre candidatos ya calculados (cola de prioridad). No guarda, no escribe en tareas y no crea otro gestor: «Abrir la tarea» entrega el ID a quien lo monte.
// Estimación (lo que declaras), elegida (entra en tu jornada), guardada (la ficha) y finalizada (la tarea deja de estar en la cola) son cosas distintas.
export interface ContinuityDayProps {
  candidates: readonly DayCandidate[];
  /** Cuántas tareas de la cola no se consideraron por el tope (se muestra, no se oculta). */
  notConsidered?: number;
  /** Solo si hay dato real de responsable: sin él no hay filtro. */
  owners?: Record<string, string | null>;
  /** Solo estado de guardados sin resolver por ID de tarea. */
  hints?: OutcomeHints;
  onOpenTask: (taskId: string) => void;
  initialBudget?: number;
}
const PRESETS = [15, 30, 60, 120];
const plural = (n: number, one: string, many: string) => n + ' ' + (n === 1 ? one : many);

function EstimateField({ id, label, minutes, onChange }: { id: string; label: string; minutes: number | null; onChange: (value: number | null) => void }) {
  const [text, setText] = useState(minutes === null ? '' : String(minutes)), [bad, setBad] = useState(false);
  useEffect(() => { setText(minutes === null ? '' : String(minutes)); setBad(false); }, [minutes]);
  // Identidad ÚNICA del control: nunca se deriva del ID de CRM (`segment/1` y `segment:1` colisionaban al sustituir caracteres).
  const fieldId = 'cd-est-' + useId();
  return <div className="cd-estimate"><label htmlFor={fieldId}>Minutos estimados <span className="cd-sr">de {label} ({id})</span></label>
    <input id={fieldId} type="number" inputMode="numeric" min={MIN_ESTIMATE_MINUTES} max={MAX_ESTIMATE_MINUTES} step={5} value={text} aria-invalid={bad} aria-describedby={fieldId + '-hint'} placeholder="¿Cuántos?"
      onChange={event => {
        const value = event.target.value; setText(value);
        if (value === '') { setBad(false); onChange(null); return; }
        const n = Number(value), ok = Number.isInteger(n) && n >= MIN_ESTIMATE_MINUTES && n <= MAX_ESTIMATE_MINUTES; setBad(!ok); if (ok) onChange(n);
      }} />
    <small id={fieldId + '-hint'} className={bad ? 'cd-error' : 'cd-hint'} role={bad ? 'alert' : undefined}>{bad ? 'Entre ' + MIN_ESTIMATE_MINUTES + ' y ' + MAX_ESTIMATE_MINUTES + ' minutos enteros.' : 'Estimación declarada por ti.'}</small></div>;
}

export function ContinuityDay({ candidates, notConsidered = 0, owners, hints, onOpenTask, initialBudget = 30 }: ContinuityDayProps) {
  const [budget, setBudget] = useState(initialBudget), [custom, setCustom] = useState(PRESETS.includes(initialBudget) ? '' : String(initialBudget)), [customBad, setCustomBad] = useState(false);
  const [estimates, setEstimates] = useState<Record<string, number>>({}), [decisions, setDecisions] = useState<DayDecisions>(emptyDecisions()), [ownerFilter, setOwnerFilter] = useState<string | null>(null);
  const plan = useMemo(() => buildContinuityDay({ candidates, budgetMinutes: budget, estimates, decisions, owners, ownerFilter, hints, notConsidered }), [candidates, budget, estimates, decisions, owners, ownerFilter, hints, notConsidered]);
  const known = useRef(new Map<string, string>()); for (const candidate of candidates) known.current.set(candidate.id, candidate.label);
  const [focusTarget, setFocusTarget] = useState<{ id: string; kind: string; n: number } | null>(null), heading = useRef<HTMLHeadingElement | null>(null), root = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (!focusTarget) return;
    // Comparación EXACTA del atributo, acotada a este componente: el ID de CRM no se interpreta como selector ni se le quitan caracteres.
    const wanted = focusTarget.kind + ':' + focusTarget.id, target = [...(root.current?.querySelectorAll<HTMLElement>('[data-cd-focus]') ?? [])].find(element => element.getAttribute('data-cd-focus') === wanted) ?? heading.current;
    target?.focus();
  }, [focusTarget]);
  const act = (next: DayDecisions, id: string, kind: string) => { setDecisions(next); setFocusTarget(previous => ({ id, kind, n: (previous?.n ?? 0) + 1 })); };
  const setEstimate = (id: string, value: number | null) => setEstimates(previous => {
    // Una propiedad calculada crea una entrada propia también para el ID válido `__proto__`.
    if (value !== null) return { ...previous, [id]: value };
    const next = { ...previous }; delete next[id]; return next;
  });
  const owner = owners ? [...new Set(Object.values(owners).filter((value): value is string => !!value))].sort() : [];
  const chosenIds = new Set(plan.chosen.map(entry => entry.id));
  const groups = new Map<string, DecisionItem[]>(); for (const item of plan.needsDecision) groups.set(item.id, [...(groups.get(item.id) ?? []), item]);
  const decide = [...groups.entries()];
  const printable = printableDay(plan);
  const minutesLabel = (entry: DayEntry) => entry.minutes === null ? 'Duración desconocida' : 'Estimación: ' + entry.minutes + ' min';

  return <section className="cd" aria-labelledby="cd-title" ref={root}>
    <header className="cd-head"><h2 id="cd-title">Jornada de continuidad</h2>
      <p>Di cuánto tiempo tienes y decide qué entra. Es una selección tuya: <strong>no guarda ni cambia ninguna tarea</strong>.</p></header>

    <div className="cd-controls">
      <fieldset className="cd-budget"><legend>Tiempo disponible</legend>
        <div className="cd-presets">{PRESETS.map(value => <label key={value} className="cd-preset"><input type="radio" name="cd-budget" checked={budget === value && !custom} onChange={() => { setBudget(value); setCustom(''); setCustomBad(false); }} /><span>{value} min</span></label>)}</div>
        <label className="cd-custom" htmlFor="cd-custom">Otro (minutos)
          <input id="cd-custom" type="number" inputMode="numeric" min={1} max={MAX_ESTIMATE_MINUTES} value={custom} aria-invalid={customBad} aria-describedby="cd-custom-hint"
            onChange={event => { const value = event.target.value; setCustom(value); if (value === '') { setCustomBad(false); if (!PRESETS.includes(budget)) setBudget(30); return; } const n = Number(value), ok = Number.isInteger(n) && n >= 1 && n <= MAX_ESTIMATE_MINUTES; setCustomBad(!ok); if (ok) setBudget(n); }} /></label>
        <small id="cd-custom-hint" className={customBad ? 'cd-error' : 'cd-hint'} role={customBad ? 'alert' : undefined}>{customBad ? 'Entre 1 y ' + MAX_ESTIMATE_MINUTES + ' minutos enteros; se mantiene ' + budget + ' min.' : 'Cambiar el tiempo no borra lo que fijaste, elegiste o descartaste.'}</small>
      </fieldset>
      {owners && owner.length ? <label className="cd-owner">Responsable<select value={ownerFilter ?? ''} onChange={event => setOwnerFilter(event.target.value || null)}><option value="">Todos</option>{owner.map(name => <option key={name} value={name}>{name}</option>)}</select></label> : null}
    </div>

    <p className="cd-summary" role="status" data-over={plan.overrunMinutes > 0 ? 'true' : 'false'} data-indeterminate={plan.unknownDurations ? 'true' : 'false'}>
      En {plan.budgetMinutes} min: {plural(plan.chosen.length, 'tarea', 'tareas')} ({plan.usedMinutes} min estimados{plan.unknownDurations ? ' + ' + plural(plan.unknownDurations, 'tarea sin duración', 'tareas sin duración') + ': el tiempo libre es indeterminado' + (plan.overrunMinutes ? '; lo estimado ya pasa ' + plan.overrunMinutes + ' min' : '') : plan.overrunMinutes ? ', ' + plan.overrunMinutes + ' min por encima' : plan.remainingMinutes ? ', ' + plan.remainingMinutes + ' min libres' : ''}). {decide.length ? plural(decide.length, 'tarea pide', 'tareas piden') + ' una decisión.' : 'Nada pide decisión.'}</p>

    <section aria-labelledby="cd-chosen-h"><h3 id="cd-chosen-h" tabIndex={-1} ref={heading}>Tu jornada</h3>
      {plan.chosen.length ? <ol className="cd-list">{plan.chosen.map((entry, index) => {
        const manual = entry.origin !== 'auto', pinned = entry.origin === 'pinned', manualIndex = decisions.manual.filter(pick => pick.pinned === pinned).findIndex(pick => pick.id === entry.id);
        const groupSize = decisions.manual.filter(pick => pick.pinned === pinned).length;
        return <li key={entry.id} className="cd-item" data-origin={entry.origin} data-id={entry.id}>
          <div className="cd-line"><span className="cd-order" aria-hidden="true">{index + 1}</span><strong>{entry.label}</strong> <code>{entry.id}</code>
            <span className="cd-chip" data-kind="bucket">{BUCKET_LABEL[entry.bucket]}</span><span className="cd-chip" data-kind={entry.origin}>{pinned ? 'Fijada' : manual ? 'Elegida por ti' : 'Propuesta'}</span><span className="cd-chip" data-kind={entry.minutes === null ? 'unknown' : 'estimate'}>{minutesLabel(entry)}</span>{entry.provisional ? <span className="cd-chip" data-kind="unknown">Provisional</span> : null}</div>
          <p className="cd-why">{entry.why}</p>
          {entry.warnings.length ? <ul className="cd-warnings">{entry.warnings.map(warning => <li key={warning.kind} data-kind={warning.kind}>{warning.text}</li>)}</ul> : null}
          <EstimateField id={entry.id} label={entry.label} minutes={entry.minutes} onChange={value => setEstimate(entry.id, value)} />
          <div className="cd-actions">
            <button type="button" className="button secondary" data-cd-focus={'open:' + entry.id} aria-label={'Abrir la tarea ' + entry.label + ' (ID ' + entry.id + ')'} onClick={() => onOpenTask(entry.id)}>Abrir la tarea<ArrowRight size={14} aria-hidden="true" /></button>
            {manual ? <button type="button" className="button secondary" data-cd-focus={'pin:' + entry.id} aria-pressed={pinned} aria-label={(pinned ? 'Quitar la fijación de ' : 'Fijar ') + entry.label + ' (ID ' + entry.id + ')'} onClick={() => act(setPinned(decisions, entry.id, !pinned), entry.id, 'pin')}>{pinned ? <PinOff size={14} aria-hidden="true" /> : <Pin size={14} aria-hidden="true" />}{pinned ? 'Quitar fijación' : 'Fijar'}</button>
              : <button type="button" className="button secondary" data-cd-focus={'pin:' + entry.id} aria-label={'Fijar ' + entry.label + ' (ID ' + entry.id + ')'} onClick={() => act(pickTask(decisions, entry.id, true), entry.id, 'pin')}><Pin size={14} aria-hidden="true" />Fijar</button>}
            {manual ? <><button type="button" className="button secondary" data-cd-focus={'up:' + entry.id} aria-disabled={manualIndex <= 0} aria-label={'Subir ' + entry.label + ' (ID ' + entry.id + ')'} onClick={() => { if (manualIndex > 0) act(moveTask(decisions, entry.id, -1), entry.id, 'up'); }}><ArrowUp size={14} aria-hidden="true" />Subir</button>
              <button type="button" className="button secondary" data-cd-focus={'down:' + entry.id} aria-disabled={manualIndex < 0 || manualIndex >= groupSize - 1} aria-label={'Bajar ' + entry.label + ' (ID ' + entry.id + ')'} onClick={() => { if (manualIndex >= 0 && manualIndex < groupSize - 1) act(moveTask(decisions, entry.id, 1), entry.id, 'down'); }}><ArrowDown size={14} aria-hidden="true" />Bajar</button></> : null}
            <button type="button" className="text-button" aria-label={'Quitar de la jornada ' + entry.label + ' (ID ' + entry.id + ')'} onClick={() => act(skipTask(decisions, entry.id), entry.id, 'none')}><X size={14} aria-hidden="true" />Quitar de la jornada</button>
          </div></li>;
      })}</ol> : <p className="cd-empty">{candidates.length ? 'Con ' + plan.budgetMinutes + ' min y las estimaciones que has declarado no entra ninguna tarea. Declara cuánto tardarías en las de abajo o elige una a mano.' : 'No hay tareas que planificar en esta copia.'}</p>}
      {plan.departed.length ? <div className="cd-departed" role="status"><strong>Ya no aparecen en la cola</strong><ul>{plan.departed.map(id => <li key={id}>{known.current.get(id) ?? 'Tarea'} <code>{id}</code> <button type="button" className="text-button" aria-label={'Quitar de la lista ' + id} onClick={() => act(unpickTask(decisions, id), id, 'none')}>Quitar de la lista</button></li>)}</ul>
        <p className="cd-hint">«Ya no aparece» no demuestra que se completara: pudo guardarse, borrarse o salir del horizonte.</p></div> : null}
    </section>

    <section aria-labelledby="cd-decide-h"><h3 id="cd-decide-h">Por decidir ({decide.length})</h3>
      {decide.length ? <ul className="cd-list">{decide.map(([id, items]) => { const first = items[0], chosen = chosenIds.has(id);
        return <li key={id} className="cd-item" data-id={id}>
          <div className="cd-line"><strong>{first.label}</strong> <code>{id}</code>{chosen ? <span className="cd-chip" data-kind="manual">En tu jornada</span> : null}</div>
          <ul className="cd-warnings">{items.map(item => <li key={item.kind} data-kind={item.kind}><span>{item.detail}</span> <span className="cd-hint">{item.action}</span></li>)}</ul>
          {items.some(item => item.kind === 'no-estimate') && !chosen ? <EstimateField id={id + '-d'} label={first.label} minutes={null} onChange={value => { if (value !== null) setEstimate(id, value); }} /> : null}
          <div className="cd-actions"><button type="button" className="button secondary" aria-label={'Abrir la tarea ' + first.label + ' (ID ' + id + ')'} onClick={() => onOpenTask(id)}>Abrir la tarea<ArrowRight size={14} aria-hidden="true" /></button>
            {!chosen ? <button type="button" className="button secondary" aria-label={'Incluir igualmente ' + first.label + ' (ID ' + id + ')'} onClick={() => act(pickTask(decisions, id), id, 'pin')}>Incluir igualmente</button> : null}</div></li>; })}</ul>
        : <p className="cd-empty">Nada pide una decisión ahora.</p>}
    </section>

    <details className="cd-out"><summary>Fuera de la jornada ({plan.excluded.length})</summary>
      {plan.excluded.length ? <ul className="cd-list cd-compact">{plan.excluded.map(item => <li key={item.id} data-reason={item.reason} data-id={item.id}><strong>{item.label}</strong> <code>{item.id}</code> <span className="cd-chip" data-kind="bucket">{BUCKET_LABEL[item.bucket]}</span><span className="cd-why">{item.detail}</span>
        <span className="cd-actions">{item.reason === 'skipped-by-person' ? <button type="button" className="text-button" aria-label={'Volver a incluir ' + item.label + ' (ID ' + item.id + ')'} onClick={() => act(unskipTask(decisions, item.id), item.id, 'none')}>Volver a incluir</button> : <button type="button" className="text-button" aria-label={'Elegir ' + item.label + ' (ID ' + item.id + ')'} onClick={() => act(pickTask(decisions, item.id), item.id, 'none')}>Elegir a mano</button>}</span></li>)}</ul> : <p className="cd-empty">No se ha dejado fuera ninguna tarea.</p>}
      {plan.notConsidered ? <p className="cd-hint">{plural(plan.notConsidered, 'tarea más no se considera', 'tareas más no se consideran')} porque la cola devuelve un máximo.</p> : null}
    </details>

    <details className="cd-help"><summary>Cómo leer esto</summary>
      <dl><div><dt>Estimación</dt><dd>Lo que tú declaras que tardarías. No se deduce de nada.</dd></div><div><dt>Elegida</dt><dd>Entra en tu jornada. No cambia la tarea.</dd></div>
        <div><dt>Guardada</dt><dd>Solo cuando guardas en la ficha de la tarea y el servidor responde.</dd></div><div><dt>Finalizada</dt><dd>Cuando la tarea ya no aparece en la cola tras guardarla; aquí solo se indica que «ya no aparece».</dd></div></dl>
      <p>{plan.method}</p><ul>{plan.limitations.map(text => <li key={text}>{text}</li>)}</ul></details>

    <div className="cd-print-actions"><button type="button" className="button secondary" onClick={() => window.print()} disabled={!plan.chosen.length}><Printer size={14} aria-hidden="true" />Imprimir la lista</button></div>
    <div className="cd-print" aria-hidden="true" data-testid="cd-print"><h2>{printable.title}</h2><p>Tiempo: {printable.budgetMinutes} min · Estimado: {printable.usedMinutes} min{printable.unknownDurations ? ' + ' + printable.unknownDurations + (printable.unknownDurations === 1 ? ' tarea sin duración' : ' tareas sin duración') : ''}</p>
      <ol>{printable.lines.map(line => <li key={line.id}>{line.label} ({line.id}){line.minutes === null ? ' · duración desconocida' : ' · ' + line.minutes + ' min'}</li>)}</ol><p>{printable.note}</p></div>
  </section>;
}
