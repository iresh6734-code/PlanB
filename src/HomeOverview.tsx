import { useEffect, useState } from 'react';
import { Check, CheckCircle2, Circle, Clock3, ShieldCheck } from 'lucide-react';
import type { AppState } from '../shared/model.js';
import type { ContinuityStatus } from '../shared/operations.js';
import type { LocalOperations as Operations } from '../shared/local-operations.js';
import { api } from './api.js';
import { Modal } from './components.js';
import { Skeleton } from './ui/index.js';
import { QualityPanel } from './app-shell/QualityPanel.js';
import type { CrmRecord } from '../shared/model.js';
import { loadLocalOperations } from './local-operations-client.js';
import { daysLate, dueLabel, splitTaskLabel, taskChip } from './task-display.js';
import { continuityAlerts, type AlertTarget } from './app-shell/continuity-alerts.js';
import { READINESS_ALERTS, readinessDetailFor, type NextActionId } from './app-shell/continuity-insights.js';
import { FirstRun, passportSeen } from './app-shell/FirstRun.js';
import { anyDrillPassed, firstRunPlan } from './app-shell/first-run.js';
import { CoolingCard, PipelineCard } from './app-shell/lazy-pages.js';
import { captureRecordCount, describeCapture, workspaceCopy } from './app-shell/workspace-copy.js';

/** INICIO · «puesto de mando» (misión maestra B4.1, 21/11/2026). Solo LEE: estado de la copia y tareas de Hoy. No captura, no decide ni escribe nada; cada acción abre la página que ya la hace.
 *  Tres zonas y cada dato una sola vez: el siguiente paso de trabajo, la columna de trabajo (prioridades, oportunidades y
 *  clientes que se enfrían) y el riel de la copia con el ÍNDICE DE PREPARACIÓN único. Lo que antes repetía estas cifras
 *  (parte de la mañana, la semana en una línea, sello y tira de primeros pasos) vive en su apartado.
 *  Lo que no se puede leer se muestra como «—» con su motivo, nunca como cero. */
type Props = {
  state: AppState; contextRevision: string | null;
  onOpenToday: () => void; onOpenTask: (taskId: string) => void; onOpenContinuity: () => void; onOpenChanges: () => void;
  /** Recuentos ya leídos aquí, para los avisos del menú. null = sin dato (nunca cero). */
  onSignals?: (signals: { overdue: number | null }) => void;
  /** Abre la ficha de un registro (avisos de calidad de los datos). */
  onOpenRecord?: (record: CrmRecord) => void;
  /** Una fusión de duplicados cambió la copia: la App vuelve a leer su estado (cambios pendientes). */
  onDataChanged?: () => void;
  /** Abre el tablero de Oportunidades (tarjeta «Oportunidades abiertas»). */
  onOpenDeals?: () => void;
  /** Entrega a la App el estado de Continuidad ya leído aquí (avisos del menú), sin otra lectura. */
  onContinuityStatus?: (status: ContinuityStatus) => void;
  /** Abre el sitio donde se arregla un aviso de la copia (pestaña de Continuidad o Exportar). */
  onOpenAlert?: (target: AlertTarget) => void;
  /** Primer uso: proteger el acceso y abrir la preparación de la copia. */
  onProtect?: () => void; onPrepare?: () => void;
  /** Primeros pasos: abrir el pasaporte (Continuidad › Evidencia). */
  onOpenPassport?: () => void;
};

export function HomeOverview({ state, contextRevision, onOpenToday, onOpenTask, onOpenContinuity, onOpenChanges, onSignals, onOpenRecord, onDataChanged, onOpenDeals, onContinuityStatus, onOpenAlert, onProtect, onPrepare, onOpenPassport }: Props) {
  const [ops, setOps] = useState<Operations | null>(null), [opsError, setOpsError] = useState('');
  const [status, setStatus] = useState<ContinuityStatus | null>(null);
  const [report, setReport] = useState(false), [copied, setCopied] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    if (!state.runtime) loadLocalOperations(controller.signal).then(setOps).catch(failure => { if (!controller.signal.aborted) setOpsError(failure instanceof Error ? failure.message : 'No se pudo leer Hoy.'); });
    else setOpsError('Hoy no está disponible en una copia restaurada.');
    api<ContinuityStatus>('/v2/continuity').then(value => { if (!controller.signal.aborted) { setStatus(value); onContinuityStatus?.(value); } }).catch(() => undefined);
    return () => controller.abort();
  }, [state.runtime, state.snapshot?.capturedAt]);

  const now = new Date();
  const snapshot = state.snapshot;
  const { activeId, activeReadiness, activeCaptureRecords, latest, latestIsDifferent } = workspaceCopy(state, status);
  // El índice de preparación: la misma fuente que el veredicto de Continuidad y el punto del menú.
  const readiness = readinessDetailFor(state, status, now);
  const copy = describeCapture(snapshot?.capturedAt, now.getTime());
  const stale = !!activeId && !state.runtime && copy.stale;
  const copyLabel = activeId ? 'Copia activa' : 'Captura importada';
  const counts = ops?.counts ?? null;
  const urgent = ops?.tasks.filter(task => task.bucket === 'overdue' || task.bucket === 'due-in-window') ?? [];
  const oldest = ops ? ops.tasks.filter(task => task.bucket === 'overdue').reduce((max, task) => Math.max(max, daysLate(task.due, now) ?? 0), 0) : 0;
  const today = new Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Madrid', weekday: 'long', day: 'numeric', month: 'long' }).format(now);
  const hour = Number(new Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Madrid', hour: 'numeric', hour12: false }).format(now));
  const greeting = hour < 14 ? 'Buenos días' : hour < 21 ? 'Buenas tardes' : 'Buenas noches';
  const changes = status?.pendingChanges ?? state.changes ?? 0;
  // Avisos de la copia que no dicen ya el título del riel (antigüedad y «sin copia») ni el índice de preparación (prueba y copia fuera del PC).
  const copyAlerts = status ? continuityAlerts(status, now).filter(alert => alert.id !== 'stale' && alert.id !== 'no-copy' && !READINESS_ALERTS.includes(alert.id)) : [];
  // Primer uso: sin copia (y fuera del paquete restaurado) Inicio enseña los pasos en lugar de un tablero vacío.
  const firstRun = !snapshot && !state.runtime;
  const firstSteps = firstRunPlan({ protectedAccess: status ? status.protected : null, hasCopy: !!snapshot || !!status?.captures.length, drillPassed: anyDrillPassed(status), passportSeen: passportSeen() });
  const firstActions = { onProtect, onPrepare, onTest: onOpenAlert ? () => onOpenAlert('estado') : undefined, onPassport: onOpenPassport, onOpenContinuity };
  const copyTone = !snapshot ? 'neutral' : stale || copyAlerts.length ? 'warn' : readiness?.level === 'ready' ? 'ok' : 'warn';
  const overdueCount = counts ? counts.overdue : null;
  useEffect(() => { onSignals?.({ overdue: overdueCount }); }, [overdueCount]);
  // «Tu siguiente paso»: una sola recomendación de TRABAJO, ordenada por lo que antes puede costarte algo: lo vencido,
  // la copia vieja y los cambios por revisar. La preparación (contraseña, prueba, copia fuera del PC) la dice el índice
  // del riel con su propio botón, para no repetirla. Es una sugerencia calculada con lo leído, no una decisión.
  type Advice = { tone: 'danger' | 'warn' | 'ok'; title: string; detail: string; label: string; run: () => void; taskId?: string };
  const advice: Advice[] = [];
  const oldestTask = ops ? ops.tasks.filter(task => task.bucket === 'overdue').sort((a, b) => (daysLate(b.due, now) ?? 0) - (daysLate(a.due, now) ?? 0))[0] : undefined;
  if (!snapshot) advice.push({ tone: 'warn', title: 'Prepara tu primera copia', detail: 'Sin una copia no hay nada que consultar ni que probar.', label: 'Ir a Continuidad', run: onOpenContinuity });
  if (oldestTask && counts) advice.push({ tone: 'danger', title: 'Revisa «' + (oldestTask.label || 'Tarea sin título') + '»', detail: (counts.overdue === 1 ? 'Es tu única tarea vencida' : 'Es la más antigua de ' + counts.overdue + ' tareas vencidas') + (oldest > 0 ? ': lleva ' + oldest + (oldest === 1 ? ' día.' : ' días.') : '.'), label: 'Abrir la tarea', run: () => onOpenTask(oldestTask.id), taskId: oldestTask.id });
  if (stale) advice.push({
    tone: 'warn', title: latestIsDifferent ? 'Revisa la copia activa' : 'Actualiza tu copia',
    detail: latestIsDifferent ? 'Hay otra captura guardada. El trabajo sigue en la copia activa.'
      : 'La copia activa se capturó ' + copy.age + '. Los cambios posteriores del CRM quedan fuera.',
    label: 'Ir a Continuidad', run: onOpenContinuity,
  });
  if (changes > 0) advice.push({ tone: 'ok', title: 'Revisa ' + (changes === 1 ? 'tu cambio local' : 'tus ' + changes + ' cambios locales'), detail: 'Están guardados en este ordenador; revisa cuáles quieres devolver al CRM.', label: 'Revisar cambios', run: onOpenChanges });
  const first = advice[0];
  const tasks = urgent.filter(task => task.id !== first?.taskId).slice(0, 5);
  // El botón del riel hace el siguiente paso del índice donde ya se hace; sin nada pendiente, abre el estado.
  const nextRun: Partial<Record<NextActionId, (() => void) | undefined>> = {
    protect: onProtect, drill: onOpenAlert ? () => onOpenAlert('estado') : undefined, export: onOpenAlert ? () => onOpenAlert('export') : undefined,
    confirm: onOpenAlert ? () => onOpenAlert('export') : undefined, prepare: onPrepare,
  };
  const pending = readiness && readiness.next.id !== 'none' ? readiness.next : null;
  const copyAction = !snapshot ? { label: 'Ir a Continuidad', run: onOpenContinuity }
    : pending ? { label: pending.label, run: nextRun[pending.id] ?? onOpenContinuity }
    : { label: 'Ver estado', run: onOpenContinuity };
  // Resumen de la semana: solo reordena lo ya leído para imprimirlo o copiarlo. No guarda nada.
  const week = { overdue: ops ? ops.tasks.filter(task => task.bucket === 'overdue') : [], soon: ops ? ops.tasks.filter(task => task.bucket === 'due-in-window') : [],
    later: ops ? ops.tasks.filter(task => { const late = daysLate(task.due, now); return task.bucket !== 'overdue' && task.bucket !== 'due-in-window' && late !== null && late < 0 && late >= -7; }) : [] };
  const taskLine = (task: Operations['tasks'][number]) => (task.label || 'Tarea sin título') + ' — ' + dueLabel(task.due, task.dueKind, now);
  const drillAlert = status ? continuityAlerts(status, now).find(alert => alert.id === 'drill' && !!activeReadiness) : undefined;
  const activeProof = activeReadiness?.status === 'passed' ? 'Prueba de esta captura vigente.'
    : drillAlert?.title ?? (latestIsDifferent ? 'Continuidad muestra la prueba de la última captura guardada.' : '');
  const activeCaptureDetail = (copy.date ?? 'Fecha no disponible') +
    (activeCaptureRecords === null ? '' : ' · ' + captureRecordCount(activeCaptureRecords) + ' en la captura');
  const copyLine = !snapshot ? 'Todavía no hay una copia.' : [
    copyLabel + ': ' + activeCaptureDetail + '.',
    changes + (changes === 1 ? ' cambio local.' : ' cambios locales.'),
    activeProof,
  ].filter(Boolean).join(' ');
  const reportText = () => ['Resumen de la semana · ' + (snapshot?.name ?? 'Plan B') + ' · ' + today, '',
    'VENCIDO (' + week.overdue.length + ')', ...week.overdue.map(task => '- ' + taskLine(task)), '',
    'PRÓXIMAS 24 H (' + week.soon.length + ')', ...week.soon.map(task => '- ' + taskLine(task)), '',
    'PRÓXIMOS 7 DÍAS (' + week.later.length + ')', ...week.later.map(task => '- ' + taskLine(task)), '',
    'TU COPIA', copyLine].join('\n');
  const tally = !counts ? (opsError ? '' : 'Leyendo…') : [counts.overdue === 0 ? 'nada vencido' : counts.overdue + (counts.overdue === 1 ? ' vencida' : ' vencidas'), counts.upcoming ? counts.upcoming + ' en 24 h' : ''].filter(Boolean).join(' · ');

  return <section className="oc-home pm-home" aria-labelledby="oc-home-title">
    <header className="oc-home-head">
      <div><h1 id="oc-home-title">{firstRun ? 'Bienvenido a Plan B' : 'Inicio'}</h1>
        <p>{greeting} · {today}{snapshot ? ' · ' + snapshot.name : ''}</p></div>
      {!firstRun && !state.runtime ? <button type="button" className="button secondary pm-report" disabled={!ops} onClick={() => { setCopied(false); setReport(true); }}>Resumen de la semana</button> : null}
    </header>

    {firstRun ? <FirstRun plan={firstSteps} {...firstActions} /> : <div className="oc-home-grid">
      <div className="oc-home-main-stack">
        <section className="fx-next" data-tone={first ? first.tone : 'ok'} aria-labelledby="fx-next-title">
          <h2 id="fx-next-title">Tu siguiente paso</h2>
          {first ? <>
            <p className="fx-next-title">{first.title}</p>
            <p className="fx-next-detail">{first.detail}</p>
            <button type="button" className="button primary" onClick={first.run}>{first.label}</button>
          </> : <p className="fx-next-detail" role="status">{state.runtime ? 'Consulta el estado de la copia restaurada en Continuidad.' : opsError || (ops && status ? 'No hay trabajo urgente en los datos consultados.' : 'Consultando tu copia…')}</p>}
        </section>
        {!state.runtime ? <article className="oc-card oc-home-main" aria-labelledby="oc-first-title">
          <div className="oc-card-head"><h2 id="oc-first-title">Prioridades de hoy</h2>{tally ? <span className="pm-tally" data-tone={counts && counts.overdue > 0 ? 'danger' : undefined}>{tally}</span> : null}<button type="button" className="oc-link" onClick={onOpenToday}>Ver cola de Hoy →</button></div>
          {!ops ? (opsError ? <p className="oc-empty-line" role="status">{opsError}</p> : <Skeleton rows={3} label="Leyendo las tareas de tu copia…" />)
            : tasks.length === 0 ? <p className={'oc-empty-line ui-empty' + (snapshot ? ' ui-empty-ok' : '')}>{urgent.length ? 'La única prioridad se muestra arriba.' : 'No hay tareas vencidas ni para las próximas 24 h.'}</p>
            : <ul className="oc-task-list">{tasks.map(task => { const chip = taskChip(task.bucket, task.due, now), [what, who] = splitTaskLabel(task.label || 'Tarea sin título'); return <li key={task.id}>
                <span className="oc-chip" data-tone={chip.tone}>{chip.text}</span>
                <div style={{ minWidth: 0 }}><strong title={task.label}>{what}{who ? <span className="oc-task-who">{who}</span> : null}</strong><span className="oc-due">{task.nextAction}</span></div>
                <span className="oc-due">{dueLabel(task.due, task.dueKind, now)}</span>
                <button type="button" className="oc-small-button" onClick={() => onOpenTask(task.id)} aria-label={'Abrir ' + (task.label || 'tarea') + ' en Hoy'}>Abrir</button>
              </li>; })}</ul>}
          {ops && urgent.length > tasks.length + (first?.taskId ? 1 : 0) ? <p className="pm-more">Y {urgent.length - tasks.length - (first?.taskId ? 1 : 0)} más en la cola de Hoy.</p> : null}
        </article> : null}
        {!state.runtime && state.spec ? <PipelineCard variant="home" spec={state.spec} revision={(snapshot?.capturedAt ?? '') + ':' + (state.changes ?? 0)} onOpenRecord={onOpenRecord} onOpenDeals={onOpenDeals} /> : null}
        {!state.runtime && state.spec ? <CoolingCard spec={state.spec} revision={(snapshot?.capturedAt ?? '') + ':' + (state.changes ?? 0)} onOpenRecord={onOpenRecord} /> : null}
      </div>
      <div className="oc-home-side">
        <article className="oc-card oc-status" data-tone={copyTone} aria-labelledby="oc-copy-title">
          <span className="oc-status-icon" aria-hidden="true">{copyTone === 'ok' ? <CheckCircle2 size={22}/> : copyTone === 'warn' ? <Clock3 size={22}/> : <ShieldCheck size={22}/>}</span>
          <div style={{ minWidth: 0 }}>
            <h2 id="oc-copy-title">{snapshot ? copyLabel : 'Todavía no hay una copia'}</h2>
            <p className="oc-muted">{snapshot ? activeCaptureDetail + ' · ' + changes + (changes === 1 ? ' cambio local' : ' cambios locales') : 'Prepara la primera copia desde Continuidad.'}</p>
            {stale ? <p className="oc-muted">Capturada {copy.age}.</p> : null}
            {latestIsDifferent && latest ? <p className="oc-muted">Última captura guardada: {describeCapture(latest.capturedAt).date ?? 'fecha no disponible'} · {captureRecordCount(latest.records)}.</p> : null}
            {activeReadiness?.status === 'passed' || latestIsDifferent ? <p className="oc-muted">{activeProof}</p> : null}
            {readiness ? <section className="pm-ready" data-level={readiness.level} aria-labelledby="pm-ready-title">
              <h3 id="pm-ready-title">{readiness.title}<span>{readiness.done} de {readiness.total}</span></h3>
              <ol className="pm-ready-steps">{readiness.steps.map(step => <li key={step.id} data-done={step.done ? 'true' : undefined} title={step.detail}>
                {step.done ? <Check size={13} aria-hidden="true" /> : <Circle size={11} aria-hidden="true" />}<span>{step.label}</span><span className="sr-only">{step.done ? ': hecho' : ': pendiente'}. {step.detail}</span>
              </li>)}</ol>
              {pending ? <p className="pm-ready-next">{pending.detail}</p> : null}
            </section> : null}
            {copyAlerts.length ? <ul className="oc-copy-alerts" aria-label="Avisos de la copia">{copyAlerts.map(alert => <li key={alert.id} data-tone={alert.tone}><span><strong>{alert.title}</strong> {alert.detail}</span>{onOpenAlert ? <button type="button" className="oc-link" aria-label={alert.action.label + ': ' + alert.title} onClick={() => onOpenAlert(alert.action.target)}>{alert.action.label}</button> : null}</li>)}</ul> : null}
            <div className="oc-row-actions"><button type="button" className={'button ' + (first ? 'secondary' : 'primary')} onClick={copyAction.run}>{copyAction.label}</button>{changes > 0 ? <button type="button" className="button secondary" onClick={onOpenChanges}>Revisar cambios</button> : null}{pending ? <button type="button" className="oc-link" onClick={onOpenContinuity}>Ver estado</button> : null}</div>
          </div>
        </article>
        {state.ready && state.spec && onOpenRecord ? <QualityPanel spec={state.spec} revision={state.snapshot?.capturedAt + ':' + state.changes} onOpen={onOpenRecord} onChanged={onDataChanged} /> : null}
      </div>
    </div>}
    {report ? <Modal title="Resumen de la semana" close={() => setReport(false)} wide><div className="modal-body fx-report">
      <p className="fx-report-meta">{snapshot?.name ?? 'Plan B'} · {today}. Calculado con lo leído ahora de tu copia local.</p>
      {([['Vencido', week.overdue, 'danger'], ['Próximas 24 h', week.soon, 'warn'], ['Próximos 7 días', week.later, 'later']] as const).map(([title, list, tone]) => <section key={title} data-tone={tone}><h3>{title}<span>{list.length}</span></h3>
        {list.length ? <ul>{list.map(task => <li key={task.id}><span>{task.label || 'Tarea sin título'}</span><time>{dueLabel(task.due, task.dueKind, now)}</time></li>)}</ul> : <p>Nada.</p>}</section>)}
      <section><h3>Tu copia</h3><p>{copyLine}</p></section>
      <div className="fx-report-actions"><button type="button" className="button primary" onClick={() => window.print()}>Imprimir</button>
        <button type="button" className="button secondary" onClick={() => { void navigator.clipboard?.writeText(reportText()).then(() => setCopied(true)).catch(() => setCopied(false)); }}>Copiar como texto</button>
        {copied ? <span role="status">Copiado.</span> : null}</div>
    </div></Modal> : null}
  </section>;
}
