import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, CircleHelp, FlaskConical, OctagonX, Plus, Trash2 } from 'lucide-react';
import {
  evaluateContinuityScenario,
  type ContinuityCheck, type ContinuityLabInput, type ContinuityLabResult, type ContinuityScope, type TimedDrill,
} from '../shared/continuity-lab.js';

/**
 * Laboratorio de caídas (CLAUDE-LAB-036). Componente controlado y aislado: recibe la entrada del motor por props y
 * avisa de cada cambio con `onInputChange`. Todo cálculo lo hace `evaluateContinuityScenario`; aquí solo se presenta,
 * se edita el fixture y se explica. No usa red, almacenamiento del navegador, cuentas ni datos de ninguna instalación,
 * y ningún control ejecuta ni simula una recuperación. La hoja `continuity-lab.css` la carga quien monta el componente.
 */

export const SIMULATION_BANNER = 'Simulación · datos ficticios · no ejecuta recuperación';
const MINUTE = 60_000, HOUR = 60 * MINUTE, DAY = 24 * HOUR;
type Scenario = ContinuityLabInput['scenario'];
type Availability = ContinuityLabInput['localRuntime'];
type DrillKey = 'localDrill' | 'restoreDrill';

export interface LabCase { id: string; label: string; description: string; input: ContinuityLabInput }
export interface ContinuityLabProps {
  /** Entrada actual del motor. `null` muestra el estado vacío. */
  input: ContinuityLabInput | null;
  onInputChange: (next: ContinuityLabInput | null) => void;
  /** Casos ficticios opcionales que la persona puede cargar. */
  cases?: readonly LabCase[];
  activeCaseId?: string | null;
  onSelectCase?: (id: string) => void;
}

/* ---------- Formato (solo presentación) ---------- */

/** Duración legible. Un valor medido de cero se muestra como «0 min»; la ausencia de dato nunca llega aquí. */
export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms)) return 'valor no válido';
  if (ms < 0) return '−' + formatDuration(-ms);
  if (ms === 0) return '0 min';
  const parts: string[] = [];
  let rest = Math.round(ms);
  for (const [size, unit] of [[DAY, 'd'], [HOUR, 'h'], [MINUTE, 'min'], [1000, 's']] as const) {
    const n = Math.floor(rest / size);
    if (n > 0) { parts.push(n + ' ' + unit); rest -= n * size; }
  }
  if (rest > 0) parts.push(rest + ' ms');
  return parts.join(' ');
}
const madrid = new Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Madrid', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
export const formatInstant = (ms: number) => madrid.format(new Date(ms)) + ' (Madrid)';
/** El motor escribe milisegundos en algunos detalles; la interfaz los muestra con unidades legibles. */
const humanize = (text: string) => text.replace(/(\d+) ms/g, (_, n: string) => formatDuration(Number(n)));
const plural = (n: number, one: string, many: string) => n + ' ' + (n === 1 ? one : many);

/* ---------- Fixture sintético ---------- */

const SCOPE: ContinuityScope = { spaceId: 'demo-space', sourceKey: 'demo-source', captureId: 'demo-capture' };
export const DEMO_EVALUATED_AT = Date.UTC(2026, 9, 29, 12);

function baseInput(): ContinuityLabInput {
  const now = DEMO_EVALUATED_AT, scope = () => ({ ...SCOPE });
  return {
    scope: scope(), evaluatedAt: now, scenario: 'crm-outage', outageDurationMs: 8 * HOUR,
    objectives: { maxDataAgeMs: 60 * MINUTE, maxRecoveryMs: 15 * MINUTE, maxEvidenceAgeMs: DAY },
    snapshot: { scope: scope(), capturedAt: now - 45 * MINUTE, verifiedAt: now - 44 * MINUTE },
    localRuntime: 'available', recoveryKit: 'available',
    backup: { scope: scope(), createdAt: now - 43 * MINUTE, verifiedAt: now - 42 * MINUTE },
    localDrill: { scope: scope(), startedAt: now - 40 * MINUTE, completedAt: now - 35 * MINUTE, outcome: 'passed' },
    restoreDrill: null,
    workload: { scope: scope(), tasks: [
      { id: 'demo-task-1', dueAt: now - MINUTE, status: 'open' },
      { id: 'demo-task-2', dueAt: now + HOUR, status: 'open' },
      { id: 'demo-task-3', dueAt: null, status: 'open' },
    ] },
  };
}

/** Casos totalmente ficticios; ninguno procede de una instalación, un CRM o un archivo del usuario. */
export function buildSyntheticCases(): LabCase[] {
  const now = DEMO_EVALUATED_AT, scope = () => ({ ...SCOPE });
  const device = (): ContinuityLabInput => ({ ...baseInput(), scenario: 'device-loss' });
  const restored = device();
  restored.restoreDrill = { scope: scope(), startedAt: now - 30 * MINUTE, completedAt: now - 22 * MINUTE, outcome: 'passed' };
  const stale = baseInput(); stale.objectives.maxDataAgeMs = 30 * MINUTE;
  const failed = baseInput(); failed.localDrill!.outcome = 'failed';
  const bare = baseInput();
  Object.assign(bare, { snapshot: null, backup: null, localDrill: null, restoreDrill: null, workload: null, localRuntime: 'unknown', recoveryKit: 'unknown' });
  return [
    { id: 'crm-local', label: 'Caída del CRM con simulacro local', description: 'Captura de hace 45 min, simulacro local de 5 min y tres tareas.', input: baseInput() },
    { id: 'device-no-restore', label: 'Pérdida del equipo sin restauración', description: 'Hay copia verificada, pero nadie ha restaurado en otro equipo.', input: device() },
    { id: 'device-restored', label: 'Pérdida del equipo con restauración', description: 'La copia se restauró en otro equipo en 8 min.', input: restored },
    { id: 'old-capture', label: 'Captura fuera de objetivo', description: 'El objetivo de antigüedad baja a 30 min con una captura de 45 min.', input: stale },
    { id: 'drill-failed', label: 'Simulacro fallido', description: 'El simulacro local aplicable terminó con fallo.', input: failed },
    { id: 'no-evidence', label: 'Sin evidencia', description: 'No hay captura, ensayos, copia ni tareas; la disponibilidad no está declarada.', input: bare },
  ];
}

/* ---------- Edición del fixture (funciones puras) ---------- */

const sameScope = (a: ContinuityScope, b: ContinuityScope) => a.spaceId === b.spaceId && a.sourceKey === b.sourceKey && a.captureId === b.captureId;
export function nextCaptureId(id: string): string {
  const match = /^(.*)-r(\d+)$/.exec(id);
  return match ? match[1] + '-r' + (Number(match[2]) + 1) : id + '-r2';
}
/**
 * Registra una captura nueva con otro identificador de generación. Copia, ensayos y tareas conservan su identificador
 * anterior: no se reetiquetan, de modo que el motor los deja de contar.
 */
export function replaceSyntheticCapture(input: ContinuityLabInput, ageMs: number): ContinuityLabInput {
  const next = structuredClone(input);
  next.scope = { ...input.scope, captureId: nextCaptureId(input.scope.captureId) };
  const capturedAt = input.evaluatedAt - ageMs;
  next.snapshot = { scope: { ...next.scope }, capturedAt, verifiedAt: Math.min(capturedAt + MINUTE, input.evaluatedAt) };
  return next;
}
function defaultDrill(input: ContinuityLabInput, key: DrillKey, outcome: TimedDrill['outcome']): TimedDrill {
  const after = key === 'restoreDrill' && input.backup ? input.backup.verifiedAt : input.snapshot?.verifiedAt ?? input.evaluatedAt - 30 * MINUTE;
  const startedAt = after + MINUTE;
  return { scope: { ...input.scope }, startedAt, completedAt: startedAt + 5 * MINUTE, outcome };
}

/* ---------- Validación de campos numéricos ---------- */

function validateInteger(raw: string, min: number, max: number): string | null {
  const text = raw.trim();
  if (!text) return 'Escribe un número entero de minutos.';
  if (!/^[+-]?\d+$/.test(text)) return 'Usa solo cifras enteras, sin decimales ni unidades.';
  const n = Number(text);
  if (!Number.isSafeInteger(n) || n < min || n > max) {
    return 'Debe estar entre ' + min.toLocaleString('es-ES') + ' y ' + max.toLocaleString('es-ES') + ' minutos (' + formatDuration(min * MINUTE) + ' a ' + formatDuration(max * MINUTE) + ').';
  }
  return null;
}

/* ---------- Etiquetas ---------- */

const SCENARIOS: { value: Scenario; label: string; hint: string }[] = [
  { value: 'crm-outage', label: 'Caída del CRM', hint: 'Trabajar con la instalación local mientras el CRM no responde.' },
  { value: 'device-loss', label: 'Pérdida del equipo', hint: 'Recuperar el trabajo en otro equipo desde una copia.' },
];
const scenarioLabel = (s: Scenario) => SCENARIOS.find(x => x.value === s)!.label;
const availabilityText: Record<Availability, string> = { available: 'Disponible', unavailable: 'No disponible', unknown: 'Sin declarar' };
function checkLabel(code: string, scenario: Scenario): string {
  const device = scenario === 'device-loss';
  switch (code) {
    case 'snapshot': return 'Captura verificada';
    case 'data-age': return 'Antigüedad de la captura';
    case 'availability': return device ? 'Otro equipo y medios de recuperación (declarado)' : 'Instalación local sin el CRM (declarada)';
    case 'backup': return 'Copia verificada de esta captura';
    case 'drill': return device ? 'Restauración en otro equipo' : 'Simulacro local';
    case 'recovery-time': return 'Tiempo de recuperación medido';
    case 'workload': return 'Inventario de tareas de esta captura';
    default: return code;
  }
}
const categoryText: Record<ContinuityCheck['category'], string> = { blocker: 'Bloqueo', evidence: 'Evidencia', objective: 'Objetivo' };
const checkStatusText: Record<ContinuityCheck['status'], string> = { pass: 'Cumple', fail: 'Falla', unknown: 'Sin comprobar' };
const STATUS: Record<ContinuityLabResult['status'], { label: string; tone: 'success' | 'warning' | 'neutral' | 'danger'; line: string }> = {
  ready: { label: 'Preparado según estas entradas', tone: 'success', line: 'Las comprobaciones cumplen sus objetivos con la evidencia escrita en esta simulación. No acredita ninguna recuperación real.' },
  'at-risk': { label: 'Fuera de objetivo', tone: 'warning', line: 'Hay evidencia válida, pero al menos una medición supera su objetivo.' },
  unproven: { label: 'Sin comprobar', tone: 'neutral', line: 'Falta evidencia válida para afirmar que esta recuperación funcionaría. Falta de evidencia no es lo mismo que fallo.' },
  blocked: { label: 'Bloqueado', tone: 'danger', line: 'Un requisito declarado o un ensayo aplicable ha fallado; hay que resolverlo antes de contar con esta recuperación.' },
};
const STATUS_ICON = { success: CheckCircle2, warning: AlertTriangle, neutral: CircleHelp, danger: OctagonX } as const;

function evaluate(input: ContinuityLabInput): { result: ContinuityLabResult; error: null } | { result: null; error: string } {
  try { return { result: evaluateContinuityScenario(input), error: null }; }
  catch (error) { return { result: null, error: error instanceof Error ? error.message : String(error) }; }
}
function leadingCheck(result: ContinuityLabResult): ContinuityCheck | null {
  return result.checks.find(c => c.category === 'blocker' && c.status === 'fail') ?? result.checks.find(c => c.status === 'unknown') ?? result.checks.find(c => c.status === 'fail') ?? null;
}
const pending = (result: ContinuityLabResult) => result.checks.filter(c => c.status !== 'pass').map(c => checkLabel(c.code, result.scenario));

/* ---------- Componente ---------- */

interface Draft { text: string; error: string; label: string }

export function ContinuityLab({ input, onInputChange, cases = [], activeCaseId = null, onSelectCase }: ContinuityLabProps) {
  const uid = useId();
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const own = useRef<ContinuityLabInput | null>(null);
  // Un cambio de la entrada que no proviene de este componente descarta los borradores inválidos.
  useEffect(() => { if (input !== own.current) setDrafts({}); }, [input]);

  const evaluation = useMemo(() => input ? evaluate(input) : null, [input]);
  const otherEvaluation = useMemo(() => input ? evaluate({ ...input, scenario: input.scenario === 'device-loss' ? 'crm-outage' : 'device-loss' }) : null, [input]);
  const invalid = Object.entries(drafts);

  function apply(next: ContinuityLabInput, keepDrafts = false) {
    own.current = next;
    if (!keepDrafts) setDrafts({});
    onInputChange(next);
  }
  function change(edit: (draft: ContinuityLabInput) => void, keepDrafts = false) {
    if (!input) return;
    const next = structuredClone(input); edit(next); apply(next, keepDrafts);
  }

  const id = (name: string) => uid + name;
  const stale = (scope: ContinuityScope | undefined | null) => !!input && !!scope && !sameScope(scope, input.scope);

  /** Campo de minutos con borrador: un texto inválido se queda visible, no cambia la entrada y bloquea el resultado. */
  function minutes(key: string, label: string, value: number, min: number, max: number, commit: (draft: ContinuityLabInput, minutes: number) => void, options: { hint?: string; disabled?: boolean } = {}) {
    const draft = drafts[key], text = draft ? draft.text : String(value), fid = id('-' + key);
    const shown = draft ? null : value;
    return (
      <div className="clab-field" key={key}>
        <label htmlFor={fid}>{label}</label>
        <div className="clab-num">
          <input id={fid} type="text" inputMode="numeric" autoComplete="off" spellCheck={false} value={text} disabled={options.disabled}
            aria-invalid={draft ? true : undefined} aria-describedby={fid + '-help' + (draft ? ' ' + fid + '-error' : '')}
            onChange={event => {
              const raw = event.target.value, error = validateInteger(raw, min, max);
              if (error) { setDrafts(current => ({ ...current, [key]: { text: raw, error, label } })); return; }
              setDrafts(current => { const { [key]: _gone, ...rest } = current; return rest; });
              change(d => commit(d, Number(raw)), true);
            }} />
          <span className="clab-unit" aria-hidden="true">min</span>
        </div>
        <p className="clab-help" id={fid + '-help'}>{options.hint ? options.hint + ' ' : ''}{shown !== null ? '= ' + formatDuration(shown * MINUTE) + '.' : ''}</p>
        {draft ? <p className="clab-error" id={fid + '-error'} role="alert">{draft.error}</p> : null}
      </div>
    );
  }
  function choice<T extends string>(name: string, label: string, value: T, options: [T, string][], onPick: (draft: ContinuityLabInput, value: T) => void, hint?: string, disabled?: boolean) {
    const fid = id('-' + name);
    return (
      <div className="clab-field" key={name}>
        <label htmlFor={fid}>{label}</label>
        <select id={fid} value={value} disabled={disabled} aria-describedby={hint ? fid + '-help' : undefined} onChange={event => change(d => onPick(d, event.target.value as T))}>
          {options.map(([v, text]) => <option key={v} value={v}>{text}</option>)}
        </select>
        {hint ? <p className="clab-help" id={fid + '-help'}>{hint}</p> : null}
      </div>
    );
  }

  /* --- Cabecera --- */
  const header = (
    <>
      <div className="clab-banner" data-testid="simulation-banner">
        <FlaskConical size={18} aria-hidden="true" /><strong>{SIMULATION_BANNER}</strong>
      </div>
      <header className="clab-header">
        <h1>Laboratorio de caídas</h1>
        <p className="clab-lead">Compara una caída del CRM con la pérdida de un equipo: qué evidencia falta, qué tareas quedan expuestas y qué hacer después. Todo son datos de ejemplo que puedes editar; nada aquí se conecta con tu instalación.</p>
        {cases.length ? (
          <div className="clab-field clab-case">
            <label htmlFor={id('-case')}>Caso de ejemplo</label>
            <select id={id('-case')} value={activeCaseId ?? ''} onChange={event => { if (event.target.value) { setDrafts({}); onSelectCase?.(event.target.value); } }}
              aria-describedby={id('-case-help')}>
              <option value="" disabled>{input ? 'Caso modificado' : 'Elige un caso'}</option>
              {cases.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
            <p className="clab-help" id={id('-case-help')}>{cases.find(c => c.id === activeCaseId)?.description ?? 'Cargar un caso sustituye los datos escritos a mano.'}</p>
          </div>
        ) : null}
      </header>
    </>
  );

  if (!input || !evaluation || !otherEvaluation) {
    return (
      <div className="clab">
        {header}
        <section className="clab-empty" aria-labelledby={id('-empty')}>
          <h2 id={id('-empty')}>Sin simulación cargada</h2>
          <p>Elige un caso de ejemplo para ver su resultado. Mientras no haya datos no se calcula nada: un laboratorio vacío no es un laboratorio preparado.</p>
        </section>
      </div>
    );
  }

  const other: Scenario = input.scenario === 'device-loss' ? 'crm-outage' : 'device-loss';
  const result = evaluation.result;
  const staleEvidence: string[] = [];
  const inspect = (scope: ContinuityScope | undefined | null, label: string) => { if (scope && stale(scope)) staleEvidence.push(label + ' (' + scope.captureId + ')'); };
  inspect(input.backup?.scope, 'Copia'); inspect(input.localDrill?.scope, 'Simulacro local');
  inspect(input.restoreDrill?.scope, 'Restauración en otro equipo'); inspect(input.workload?.scope, 'Inventario de tareas');

  /* --- Bloques de resultado --- */
  const blockedByDrafts = invalid.length > 0;
  let resultBlock;
  if (blockedByDrafts) {
    resultBlock = (
      <section className="clab-panel clab-result" aria-labelledby={id('-result')} data-state="invalid">
        <h2 id={id('-result')}>Resultado de la simulación</h2>
        <div role="status" className="clab-note clab-note-danger">
          <strong>Sin resultado: hay entradas inválidas.</strong>
          <span> No se muestra el resultado anterior porque ya no corresponde a lo escrito. Corrige: {invalid.map(([, d]) => d.label).join(', ')}.</span>
        </div>
      </section>
    );
  } else if (evaluation.error || !result) {
    resultBlock = (
      <section className="clab-panel clab-result" aria-labelledby={id('-result')} data-state="engine-error">
        <h2 id={id('-result')}>Resultado de la simulación</h2>
        <div role="alert" className="clab-note clab-note-danger">
          <strong>El motor rechazó esta entrada.</strong> <span>{evaluation.error}</span>
          <p className="clab-help">No hay resultado: una entrada rechazada no se trata como correcta ni como cero.</p>
        </div>
      </section>
    );
  } else {
    const meta = STATUS[result.status], Icon = STATUS_ICON[meta.tone], lead = leadingCheck(result);
    const dataAge = result.checks.find(c => c.code === 'data-age'), recovery = result.checks.find(c => c.code === 'recovery-time');
    const verdict = (check: ContinuityCheck | undefined) => check ? (check.status === 'pass' ? 'Dentro del objetivo' : 'Fuera del objetivo') : 'Sin medir';
    const measures: { key: string; label: string; value: number | null; objective: number; check: ContinuityCheck | undefined; missing: string }[] = [
      { key: 'age', label: 'Antigüedad de la captura', value: result.snapshotAgeMs, objective: input.objectives.maxDataAgeMs, check: dataAge, missing: 'No medida: falta una captura verificada de esta generación.' },
      { key: 'recovery', label: 'Tiempo de recuperación medido', value: result.measuredRecoveryMs, objective: input.objectives.maxRecoveryMs, check: recovery, missing: 'No medido: no hay un ensayo correcto, vigente y de esta captura.' },
    ];
    const end = input.evaluatedAt + input.outageDurationMs;
    const currentPending = new Set(pending(result)), otherResult = otherEvaluation.result;
    const comparison = otherResult ? pending(otherResult).filter(label => !currentPending.has(label)) : [];
    resultBlock = (
      <section className="clab-panel clab-result" aria-labelledby={id('-result')} data-state="result" data-status={result.status}>
        <h2 id={id('-result')}>Resultado: {scenarioLabel(result.scenario)}</h2>
        <div role="status" aria-live="polite" className={'clab-verdict clab-tone-' + meta.tone}>
          <p className="clab-verdict-line"><Icon size={20} aria-hidden="true" /><strong data-testid="status-label">{meta.label}</strong></p>
          <p>{meta.line}</p>
        </div>
        <dl className="clab-cause">
          <div><dt>Por qué</dt><dd data-testid="cause">{lead ? checkLabel(lead.code, result.scenario) + ': ' + humanize(lead.detail) : 'Todas las comprobaciones aportadas cumplen sus objetivos.'}</dd></div>
          <div><dt>Siguiente paso</dt><dd data-testid="next-step">
            {result.nextActions.length ? (
              <>{humanize(lead?.nextAction ?? result.nextActions[0])}
                {result.nextActions.length > 1 ? <> <span className="clab-help">Después: {result.nextActions.filter(a => a !== (lead?.nextAction ?? result.nextActions[0])).join(' · ')}</span></> : null}</>
            ) : 'Sin acciones pendientes dentro de la simulación. Una recuperación real sigue sin haberse ejecutado.'}
          </dd></div>
        </dl>

        <h3>Mediciones frente a objetivos</h3>
        <ul className="clab-measures">
          {measures.map(m => (
            <li key={m.key} data-measure={m.key} data-state={m.value === null ? 'missing' : 'measured'}>
              <span className="clab-m-label">{m.label}</span>
              {m.value === null
                ? <span className="clab-m-value clab-missing">{m.missing}</span>
                : <span className="clab-m-value">{formatDuration(m.value)}</span>}
              <span className="clab-m-goal">Objetivo: como máximo {formatDuration(m.objective)}</span>
              <span className={'clab-tag clab-tag-' + (m.check?.status === 'pass' ? 'success' : m.check?.status === 'fail' ? 'warning' : 'neutral')}>{verdict(m.check)}</span>
            </li>
          ))}
          <li data-measure="evidence">
            <span className="clab-m-label">Vigencia de la evidencia</span>
            <span className="clab-m-value">Como máximo {formatDuration(input.objectives.maxEvidenceAgeMs)}</span>
            <span className="clab-m-goal">El ensayo debe haber terminado dentro de ese plazo.</span>
          </li>
          <li data-measure="outage">
            <span className="clab-m-label">Caída simulada</span>
            <span className="clab-m-value">{formatDuration(input.outageDurationMs)}</span>
            <span className="clab-m-goal">{formatInstant(input.evaluatedAt)} → {formatInstant(end)}</span>
          </li>
        </ul>
        <p className="clab-help clab-age-note">
          La antigüedad de la captura indica cuánto trabajo posterior a ella no está en la copia; no cuenta cuántos datos se perdieron, y con estos datos no se puede saber.
        </p>

        <h3>Tareas aportadas frente a la caída</h3>
        {result.exposure ? (
          <>
            <ul className="clab-exposure" data-state="known">
              <li><strong data-testid="overdue">{result.exposure.overdueTasks}</strong><span>Vencidas antes de la caída</span></li>
              <li><strong data-testid="during">{result.exposure.tasksDueDuringOutage}</strong><span>Vencen durante la caída</span></li>
              <li><strong data-testid="undated">{result.exposure.tasksWithoutDate}</strong><span>Sin fecha</span></li>
              <li><strong data-testid="open">{result.exposure.openTasks}</strong><span>Abiertas en el inventario</span></li>
            </ul>
            <p className="clab-help">
              Durante la caída: de {formatInstant(input.evaluatedAt)} a {formatInstant(end)}, ambos límites incluidos. Las abiertas que vencen después no se cuentan en estas tres cifras. Solo se cubren las tareas aportadas, no el portal completo.
              {result.exposure.openTasks === 0 ? ' Aquí 0 es un dato declarado: el inventario está aportado y no tiene tareas abiertas.' : ''}
            </p>
          </>
        ) : (
          <p className="clab-missing-block" data-state="missing" data-testid="exposure-missing">
            <strong>Sin inventario utilizable.</strong> No se puede calcular qué tareas quedan expuestas; esto no equivale a 0 tareas, solo a que no se sabe. Aporta las tareas de la captura seleccionada.
          </p>
        )}

        <h3>Comprobaciones</h3>
        <ul className="clab-checks">
          {result.checks.map(c => (
            <li key={c.code} data-check={c.code} data-status={c.status}>
              <div className="clab-check-head">
                <span className="clab-check-name">{checkLabel(c.code, result.scenario)}</span>
                <span className="clab-check-meta">{categoryText[c.category]}</span>
                <span className={'clab-tag clab-tag-' + (c.status === 'pass' ? 'success' : c.status === 'fail' ? 'danger' : 'neutral')}>{checkStatusText[c.status]}</span>
              </div>
              <p>{humanize(c.detail)}</p>
              {c.nextAction ? <p className="clab-next">Siguiente paso: {c.nextAction}</p> : null}
            </li>
          ))}
        </ul>
        {staleEvidence.length ? (
          <p className="clab-note clab-note-warning" data-testid="stale-evidence">
            <strong>Evidencia de otra captura, no cuenta:</strong> {staleEvidence.join(', ')}. La captura actual es {input.scope.captureId}; esos registros se hicieron sobre otra y no se han reetiquetado.
          </p>
        ) : null}

        <h3>Qué cambia al cambiar de escenario</h3>
        <div className="clab-compare" data-testid="comparison">
          {[result, otherResult].map((r, index) => r ? (
            <div key={r.scenario} className={index === 0 ? 'clab-compare-current' : undefined} data-scenario={r.scenario}>
              <p className="clab-compare-title"><strong>{scenarioLabel(r.scenario)}</strong>{index === 0 ? <span className="clab-tag clab-tag-neutral">Seleccionado</span> : null}</p>
              <p><span className={'clab-tag clab-tag-' + STATUS[r.status].tone}>{STATUS[r.status].label}</span></p>
              <p className="clab-help">{pending(r).length ? 'Falta o falla: ' + pending(r).join('; ') + '.' : 'Ninguna comprobación pendiente.'}</p>
            </div>
          ) : <div key={other}><p className="clab-error">El otro escenario no se pudo calcular con estas entradas.</p></div>)}
        </div>
        <p className="clab-help" data-testid="comparison-diff">
          {comparison.length ? 'Pasar a «' + scenarioLabel(other) + '» añade estas pruebas pendientes: ' + comparison.join('; ') + '.' : 'Pasar a «' + scenarioLabel(other) + '» no añade pruebas pendientes con estos datos.'}
        </p>

        <h3>Límites del cálculo</h3>
        <ul className="clab-limits">
          {result.limitations.map(text => <li key={text}>{text}</li>)}
          <li>Los registros son texto escrito en esta pantalla; el motor no puede comprobar de dónde vienen.</li>
        </ul>
      </section>
    );
  }

  /* --- Editores --- */
  const inScenario = (scenario: Scenario) => input.scenario === scenario;
  const counts = (yes: boolean) => <span className={'clab-tag ' + (yes ? 'clab-tag-info' : 'clab-tag-neutral')}>{yes ? 'Cuenta en este escenario' : 'No cuenta en este escenario'}</span>;
  const drillOptions: ['none' | 'passed' | 'failed', string][] = [['none', 'Sin ensayo'], ['passed', 'Correcto'], ['failed', 'Fallido']];

  function drillEditor(key: DrillKey, title: string, applies: boolean, help: string) {
    const record = input![key];
    const old = !!record && stale(record.scope);
    return (
      <fieldset className="clab-group" data-group={key}>
        <legend>{title}</legend>
        <p className="clab-group-meta">{counts(applies)}</p>
        <p className="clab-help">{help}</p>
        {record && old ? (
          <div className="clab-stale">
            <p><strong>Registro de otra captura</strong> ({record.scope.captureId}): {record.outcome === 'passed' ? 'correcto' : 'fallido'}, {formatDuration(record.completedAt - record.startedAt)}. No se edita ni se reetiqueta.</p>
            <button type="button" className="clab-button" onClick={() => change(d => { d[key] = null; })}>Descartar este registro</button>
          </div>
        ) : (
          <>
            {choice(key + '-outcome', 'Resultado del ensayo', (record ? record.outcome : 'none') as 'none' | 'passed' | 'failed', drillOptions, (d, v) => {
              if (v === 'none') d[key] = null;
              else if (d[key]) d[key]!.outcome = v;
              else d[key] = defaultDrill(d, key, v);
            })}
            {record ? (
              <>
                {minutes(key + '-start', 'Empezó hace', Math.round((input!.evaluatedAt - record.startedAt) / MINUTE), 0, 129_600, (d, n) => {
                  const length = d[key]!.completedAt - d[key]!.startedAt; d[key]!.startedAt = d.evaluatedAt - n * MINUTE; d[key]!.completedAt = d[key]!.startedAt + length;
                }, { hint: 'Debe ser posterior a la verificación.' })}
                {minutes(key + '-duration', 'Duración medida', Math.round((record.completedAt - record.startedAt) / MINUTE), 0, 43_200, (d, n) => {
                  d[key]!.completedAt = d[key]!.startedAt + n * MINUTE;
                }, { hint: 'Desde empezar la recuperación hasta confirmar un flujo usable.' })}
              </>
            ) : <p className="clab-missing-inline" data-state="missing">Sin ensayo registrado: no hay tiempo medido, ni siquiera cero.</p>}
          </>
        )}
      </fieldset>
    );
  }

  const workload = input.workload, oldWorkload = !!workload && stale(workload.scope);
  const editors = (
    <aside className="clab-editors" aria-label="Datos de la simulación">
      <h2>Datos de la simulación</h2>
      <p className="clab-help">Edita los datos ficticios y el resultado se recalcula. Un registro que no pertenece a la captura actual no cuenta.</p>

      <fieldset className="clab-group" data-group="objectives">
        <legend>Objetivos</legend>
        {minutes('maxData', 'Antigüedad máxima de la captura', Math.round(input.objectives.maxDataAgeMs / MINUTE), 1, 43_200, (d, n) => { d.objectives.maxDataAgeMs = n * MINUTE; })}
        {minutes('maxRecovery', 'Tiempo máximo de recuperación', Math.round(input.objectives.maxRecoveryMs / MINUTE), 1, 43_200, (d, n) => { d.objectives.maxRecoveryMs = n * MINUTE; })}
        {minutes('maxEvidence', 'Vigencia máxima de la evidencia', Math.round(input.objectives.maxEvidenceAgeMs / MINUTE), 1, 129_600, (d, n) => { d.objectives.maxEvidenceAgeMs = n * MINUTE; })}
      </fieldset>

      <fieldset className="clab-group" data-group="capture">
        <legend>Captura de datos</legend>
        {choice('capture-state', 'Captura verificada', input.snapshot ? 'present' : 'none', [['none', 'Sin captura verificada'], ['present', 'Con captura verificada']], (d, v) => {
          if (v === 'none') d.snapshot = null; else Object.assign(d, replaceSyntheticCapture(d, 30 * MINUTE));
        })}
        {input.snapshot
          ? minutes('capture-age', 'Antigüedad de la captura', Math.round((input.evaluatedAt - input.snapshot.capturedAt) / MINUTE), 0, 129_600, (d, n) => { Object.assign(d, replaceSyntheticCapture(d, n * MINUTE)); })
          : <p className="clab-missing-inline" data-state="missing">Sin captura: la antigüedad no está medida.</p>}
        <p className="clab-help">Generación actual: <code>{input.scope.captureId}</code>. Cambiar la captura crea otra generación; la copia, los ensayos y las tareas se quedan con la anterior y dejan de contar.</p>
      </fieldset>

      <fieldset className="clab-group" data-group="availability">
        <legend>Disponibilidad declarada</legend>
        <p className="clab-help">Es lo que alguien afirma, no una comprobación.</p>
        {choice<Availability>('runtime', 'Instalación local sin el CRM', input.localRuntime, Object.entries(availabilityText) as [Availability, string][], (d, v) => { d.localRuntime = v; }, inScenario('crm-outage') ? 'Cuenta en la caída del CRM.' : 'No cuenta en la pérdida del equipo.')}
        {choice<Availability>('kit', 'Otro equipo y medios de recuperación', input.recoveryKit, Object.entries(availabilityText) as [Availability, string][], (d, v) => { d.recoveryKit = v; }, inScenario('device-loss') ? 'Cuenta en la pérdida del equipo.' : 'No cuenta en la caída del CRM.')}
      </fieldset>

      {drillEditor('localDrill', 'Simulacro local', inScenario('crm-outage'), 'Prueba de abrir la instalación local sin el CRM, sobre esta captura.')}

      <fieldset className="clab-group" data-group="backup">
        <legend>Copia para otro equipo</legend>
        <p className="clab-group-meta">{counts(inScenario('device-loss'))}</p>
        {input.backup && stale(input.backup.scope) ? (
          <div className="clab-stale">
            <p><strong>Copia de otra captura</strong> ({input.backup.scope.captureId}). No se edita ni se reetiqueta.</p>
            <button type="button" className="clab-button" onClick={() => change(d => { d.backup = null; })}>Descartar esta copia</button>
          </div>
        ) : (
          <>
            {choice('backup-state', 'Copia', input.backup ? 'present' : 'none', [['none', 'Sin copia verificada'], ['present', 'Copia verificada']], (d, v) => {
              d.backup = v === 'none' ? null : { scope: { ...d.scope }, createdAt: (d.snapshot ? d.snapshot.verifiedAt : d.evaluatedAt - 30 * MINUTE) + MINUTE, verifiedAt: (d.snapshot ? d.snapshot.verifiedAt : d.evaluatedAt - 30 * MINUTE) + 2 * MINUTE };
            })}
            {input.backup
              ? minutes('backup-ago', 'Verificada hace', Math.round((input.evaluatedAt - input.backup.verifiedAt) / MINUTE), 0, 129_600, (d, n) => { d.backup!.verifiedAt = d.evaluatedAt - n * MINUTE; d.backup!.createdAt = d.backup!.verifiedAt - MINUTE; }, { hint: 'Debe crearse después de la captura.' })
              : <p className="clab-missing-inline" data-state="missing">Sin copia verificada de esta captura.</p>}
          </>
        )}
      </fieldset>

      {drillEditor('restoreDrill', 'Restauración en otro equipo', inScenario('device-loss'), 'Restaurar la copia en otro equipo y confirmar un flujo usable. Es distinta del simulacro local.')}

      <fieldset className="clab-group" data-group="workload">
        <legend>Tareas de la captura</legend>
        {workload && oldWorkload ? (
          <div className="clab-stale">
            <p><strong>Inventario de otra captura</strong> ({workload.scope.captureId}), {plural(workload.tasks.length, 'tarea', 'tareas')}. No se edita ni se reetiqueta.</p>
            <button type="button" className="clab-button" onClick={() => change(d => { d.workload = null; })}>Descartar este inventario</button>
          </div>
        ) : (
          <>
            {choice('workload-state', 'Inventario', workload ? 'present' : 'none', [['none', 'No aportado'], ['present', 'Aportado']], (d, v) => {
              d.workload = v === 'none' ? null : { scope: { ...d.scope }, tasks: [] };
            }, workload ? undefined : 'Sin inventario no se calcula exposición.')}
            {workload ? (
              <>
                {workload.tasks.length === 0 ? <p className="clab-missing-inline" data-state="empty">Inventario vacío: 0 tareas declaradas.</p> : null}
                <ol className="clab-tasks">
                  {workload.tasks.map((task, index) => (
                    <li key={task.id} data-task={task.id}>
                      <p className="clab-task-name">Tarea ficticia {index + 1} <code>{task.id}</code></p>
                      {choice('task-' + task.id + '-status', 'Estado de la tarea ' + (index + 1), task.status, [['open', 'Abierta'], ['done', 'Hecha']], (d, v) => { d.workload!.tasks[index].status = v; })}
                      <div className="clab-field">
                        <label className="clab-check">
                          <input type="checkbox" checked={task.dueAt === null} onChange={event => change(d => { d.workload!.tasks[index].dueAt = event.target.checked ? null : d.evaluatedAt + HOUR; })} />
                          <span>Tarea {index + 1} sin fecha de vencimiento</span>
                        </label>
                      </div>
                      {task.dueAt !== null
                        ? minutes('task-' + task.id + '-due', 'Vence en (minutos desde el instante evaluado; negativo = ya vencida) · tarea ' + (index + 1), Math.round((task.dueAt - input.evaluatedAt) / MINUTE), -525_600, 525_600,
                          (d, n) => { d.workload!.tasks[index].dueAt = d.evaluatedAt + n * MINUTE; })
                        : null}
                      <button type="button" className="clab-button clab-remove" aria-label={'Quitar la tarea ficticia ' + (index + 1)} onClick={() => change(d => { d.workload!.tasks.splice(index, 1); })}>
                        <Trash2 size={16} aria-hidden="true" /> Quitar
                      </button>
                    </li>
                  ))}
                </ol>
                <button type="button" className="clab-button" disabled={workload.tasks.length >= 50} onClick={() => change(d => {
                  const next = d.workload!.tasks.reduce((max, t) => Math.max(max, Number(/(\d+)$/.exec(t.id)?.[1] ?? 0)), 0) + 1;
                  d.workload!.tasks.push({ id: 'demo-task-' + next, dueAt: d.evaluatedAt + HOUR, status: 'open' });
                })}><Plus size={16} aria-hidden="true" /> Añadir tarea ficticia</button>
              </>
            ) : null}
          </>
        )}
      </fieldset>
    </aside>
  );

  return (
    <div className="clab">
      {header}
      <div className="clab-grid">
        <div className="clab-main">
          <section className="clab-panel clab-setup" aria-labelledby={id('-setup')}>
            <h2 id={id('-setup')}>Escenario</h2>
            <fieldset className="clab-radios">
              <legend>Qué se simula</legend>
              <div className="clab-radio-list">
              {SCENARIOS.map(s => (
                <label key={s.value} className={'clab-radio' + (input.scenario === s.value ? ' is-selected' : '')}>
                  <input type="radio" name={id('-scenario')} value={s.value} checked={input.scenario === s.value} onChange={() => change(d => { d.scenario = s.value; })} />
                  <span><strong>{s.label}</strong><small>{s.hint}</small></span>
                </label>
              ))}
              </div>
            </fieldset>
            {minutes('outage', 'Duración de la caída', Math.round(input.outageDurationMs / MINUTE), 1, 43_200, (d, n) => { d.outageDurationMs = n * MINUTE; }, { hint: 'Mueve las tareas que vencen durante la caída.' })}
            <p className="clab-help">Instante evaluado (fijo en el fixture): {formatInstant(input.evaluatedAt)}.</p>
            <button type="button" className="clab-text-button" onClick={() => { own.current = null; setDrafts({}); onInputChange(null); }}>Vaciar la simulación</button>
          </section>
          {resultBlock}
        </div>
        {editors}
      </div>
    </div>
  );
}

export default ContinuityLab;
