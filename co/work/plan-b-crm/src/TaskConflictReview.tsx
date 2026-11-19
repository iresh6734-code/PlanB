import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, CircleAlert } from 'lucide-react';
import { displayFieldValue, formatInstant } from '../shared/local-task-focus.js';
import type { Field, FieldValue } from '../shared/model.js';
import { buildConflictReview, choiceOf, resolveConflictReview, type Choice, type ConflictInput, type FieldReview, type FieldState, type Proposal, type Resolution } from '../shared/task-conflict-review.js';
import './task-conflict-review.css';

// Comparador de decisiones de conflicto (unidad 199). PREPARACIÓN: todavía no está montado en la ficha. Recibe la base que la persona vio, su borrador y
// la versión actual (leída explícitamente) con sus identidades; por campo muestra «Lo que viste», «Tu propuesta» y «Lo que hay ahora» y deja elegir qué
// mantener. Entrega una PROPUESTA con `onPropose`: no guarda, no llama a la red y no crea otro gestor. Quien lo monte decide qué hacer con ella.
export interface TaskConflictReviewProps {
  input: ConflictInput;
  /** Recibe la propuesta cuando TODO está decidido y es válida. Nunca se llama con identidades distintas, sin decidir, con incidencias o sin cambios. */
  onPropose: (proposal: Proposal) => void;
  /** Volver al formulario conservando el borrador tal cual. */
  onKeepEditing: () => void;
  /** Texto legible de un valor (p. ej. el nombre de una referencia). Si devuelve null se usa el formato estándar. */
  describeValue?: (field: Field | null, value: FieldValue) => string | null;
}

const STATE_LABEL: Record<FieldState, string> = { untouched: '', 'theirs-only': 'Cambio ajeno', 'mine-only': 'Tu cambio', converged: 'Mismo valor', conflict: 'Conflicto: decide', incompatible: 'No se puede aplicar' };
const LONG = 160;

function Value({ review, row, value, describeValue }: { review: ReturnType<typeof buildConflictReview>; row: FieldReview; value: FieldValue; describeValue?: TaskConflictReviewProps['describeValue'] }) {
  const custom = value === null || value === '' ? null : describeValue?.(row.field, value) ?? null;
  const text = custom ?? displayFieldValue(review.input.entity, row.key, value);
  if (text === '—') return <span className="tcr-empty"><span aria-hidden="true">—</span><span className="tcr-sr">vacío</span></span>;
  if (text.length > LONG) return <details className="tcr-long"><summary>{text.slice(0, 100)}… <small>({text.length} caracteres)</small></summary><p>{text}</p></details>;
  return <span className="tcr-text">{text}</span>;
}

export function TaskConflictReview({ input, onPropose, onKeepEditing, describeValue }: TaskConflictReviewProps) {
  // La revisión depende del CONTENIDO, no de la identidad del objeto: un padre que reconstruye `input` en cada render no borra las elecciones.
  const contentKey = useMemo(() => JSON.stringify(input), [input]);
  const review = useMemo(() => buildConflictReview(input), [contentKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const initial = useMemo(() => Object.fromEntries(review.rows.filter(row => row.defaultChoice).map(row => [row.key, row.defaultChoice as Choice])), [review]);
  // Las elecciones pertenecen a UNA revisión (contenido de `input`): con otra lectura u otro borrador, las anteriores no cuentan ni siquiera en el render previo al efecto.
  const [stored, setStored] = useState<{ key: string; choices: Record<string, Choice | undefined> }>({ key: contentKey, choices: initial }), [tried, setTried] = useState<Resolution | null>(null);
  const choices = stored.key === contentKey ? stored.choices : initial;
  const heading = useRef<HTMLHeadingElement | null>(null), alert = useRef<HTMLDivElement | null>(null);
  // Otra versión actual u otro borrador = otra revisión: las elecciones anteriores no se arrastran.
  useEffect(() => { setStored({ key: contentKey, choices: initial }); setTried(null); }, [contentKey, initial]);
  useEffect(() => { heading.current?.focus(); }, [review]);
  const resolution = useMemo(() => resolveConflictReview(review, choices), [review, choices]);
  const pending = resolution.pending;
  const mismatch = review.identity.length > 0, decidable = review.rows.filter(row => row.options.length > 1);

  function submit() {
    if (mismatch) return;
    if (resolution.status !== 'ready') {
      setTried(resolution);
      requestAnimationFrame(() => {
        if (resolution.status === 'undecided') document.getElementById('tcr-' + resolution.pending[0] + '-' + (review.rows.find(r => r.key === resolution.pending[0])?.options[0] ?? 'mine'))?.focus();
        else alert.current?.focus();
      });
      return;
    }
    setTried(null); onPropose(resolution.proposal!);
  }
  const setChoice = (key: string, choice: Choice) => { setStored({ key: contentKey, choices: { ...choices, [key]: choice } }); setTried(null); };

  return <section className="tcr" aria-labelledby="tcr-title" data-identity={mismatch ? 'mismatch' : 'same'}>
    <h2 id="tcr-title" tabIndex={-1} ref={heading}>{mismatch ? 'No se puede combinar esta tarea' : 'Revisa qué mantener de «' + review.title + '»'}</h2>
    <p className="tcr-context"><span>Tarea <code>{review.taskId}</code></span><span>Copia «{input.currentContext.snapshotName ?? '—'}»</span>{input.currentContext.capturedAt ? <span>Captura del {formatInstant(input.currentContext.capturedAt)}</span> : null}</p>

    {mismatch ? <>
      <div className="tcr-banner tcr-danger" role="alert"><strong>La versión actual no es la misma tarea o la misma copia</strong>
        <ul>{review.identity.map(problem => <li key={problem.kind}>{problem.message}</li>)}</ul>
        <p>No se mezclan los valores y no se envía nada. Tu borrador se conserva.</p></div>
      <section aria-labelledby="tcr-kept"><h3 id="tcr-kept">Lo que escribiste (se conserva)</h3>
        {review.preserved.length ? <dl className="tcr-kept">{review.preserved.map(line => <div key={line.key}><dt>{line.label}</dt><dd>{line.value}</dd></div>)}</dl> : <p className="tcr-muted">No habías cambiado ningún campo.</p>}</section>
    </> : <>
      <p className="tcr-lede">Otra edición cambió esta tarea mientras la tenías abierta. Compara los tres valores y decide. Nada se guarda hasta que lo confirmes con un nuevo guardado.</p>
      <p id="tcr-status" role="status" className="tcr-summary">{pending.length ? pending.length + (pending.length === 1 ? ' campo por decidir' : ' campos por decidir') : decidable.length ? 'Todo decidido.' : 'No hay nada que decidir.'}</p>
      {tried && tried.status !== 'ready' ? <div ref={alert} id="tcr-alert" tabIndex={-1} role="alert" className="tcr-banner tcr-warning"><strong>{tried.status === 'undecided' ? 'Falta decidir' : tried.status === 'noop' ? 'No hay nada que guardar' : 'Revisa la propuesta'}</strong><p>{tried.message}</p>
        {tried.status === 'invalid' ? <ul>{Object.entries(tried.issues).map(([key, why]) => <li key={key}>{review.rows.find(r => r.key === key)?.label ?? input.entity.fields.find(f => f.key === key)?.label ?? key}: {why}</li>)}</ul> : null}</div> : null}
      <form className="tcr-form" noValidate onSubmit={event => { event.preventDefault(); submit(); }}>
        <ul className="tcr-rows">{review.rows.map(row => {
          const undecided = row.options.length > 1 && !choiceOf(choices, row.key), flagged = !!tried && undecided, id = 'tcr-' + row.key;
          return <li key={row.key} className="tcr-row" data-state={row.state} data-flagged={flagged ? 'true' : undefined}>
            <fieldset aria-describedby={id + '-why'}>
              <legend><span className="tcr-label">{row.label}</span> <span className="tcr-tag" data-state={row.state}>{STATE_LABEL[row.state]}</span></legend>
              <dl className="tcr-trio">
                <div><dt>Lo que viste</dt><dd><Value review={review} row={row} value={row.seen} describeValue={describeValue} /></dd></div>
                <div><dt>Tu propuesta</dt><dd><Value review={review} row={row} value={row.proposed} describeValue={describeValue} /></dd></div>
                <div><dt>Lo que hay ahora</dt><dd><Value review={review} row={row} value={row.now} describeValue={describeValue} /></dd></div>
              </dl>
              {row.reason ? <p id={id + '-why'} className="tcr-why">{row.reason}</p> : <span id={id + '-why'} />}
              {row.options.length > 1 ? <div className="tcr-choices" role="radiogroup" aria-label={'Qué mantener en ' + row.label} aria-required={row.defaultChoice === null}>
                {row.options.map(option => <label key={option} className="tcr-choice"><input id={id + '-' + option} type="radio" name={id} value={option} checked={choiceOf(choices, row.key) === option} onChange={() => setChoice(row.key, option)} />
                  <span>{option === 'mine' ? 'Mantener mi propuesta' : 'Usar lo que hay ahora'}</span></label>)}
              </div> : null}
              {flagged ? <em className="tcr-error" role="alert">Elige una de las dos opciones.</em> : null}
            </fieldset></li>;
        })}</ul>
        {review.untouched ? <p className="tcr-muted">{review.untouched} {review.untouched === 1 ? 'campo' : 'campos'} sin cambios no se muestran.</p> : null}
        <footer className="tcr-footer">
          <button type="button" className="button secondary" onClick={onKeepEditing}>Volver al formulario</button>
          <button type="submit" className="button primary" aria-disabled={resolution.status !== 'ready'} aria-describedby="tcr-status">Preparar el nuevo guardado<ArrowRight size={14} aria-hidden="true" /></button>
        </footer>
      </form>
    </>}
    {mismatch ? <footer className="tcr-footer"><button type="button" className="button primary" onClick={onKeepEditing}>Volver al formulario</button></footer> : null}
    <p className="tcr-limit"><CircleAlert size={13} aria-hidden="true" /> Esta revisión solo prepara una propuesta. No comprueba quién escribió cada valor ni garantiza que la tarea no vuelva a cambiar antes de guardar.</p>
  </section>;
}
