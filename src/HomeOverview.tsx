import { useEffect, useState } from 'react';
import { CheckCircle2, Clock3, ShieldCheck } from 'lucide-react';
import type { AppState } from '../shared/model.js';
import type { ContinuityStatus } from '../shared/operations.js';
import type { LocalOperations as Operations } from '../shared/local-operations.js';
import type { CommitmentSummary } from '../shared/commitments.js';
import { api } from './api.js';
import { Modal } from './components.js';
import { Skeleton } from './ui/index.js';
import { QualityPanel } from './app-shell/QualityPanel.js';
import type { CrmRecord } from '../shared/model.js';
import { loadLocalOperations } from './local-operations-client.js';
import { loadCommitments, loadRadarCapability } from './commitment-radar-client.js';
import { daysLate, dueLabel, splitTaskLabel, taskChip } from './task-display.js';
import { continuityAlerts, type AlertTarget } from './app-shell/continuity-alerts.js';
import { readinessFor } from './app-shell/continuity-insights.js';
import { FirstRun, FirstRunStrip, passportSeen } from './app-shell/FirstRun.js';
import { anyDrillPassed, firstRunPlan } from './app-shell/first-run.js';
import { CoolingCard, HomeSeal, MorningBrief, PipelineCard } from './app-shell/lazy-pages.js';
import { captureRecordCount, describeCapture, workspaceCopy } from './app-shell/workspace-copy.js';

/** INICIO («Operaciones claras», 11/11/2026). Solo LEE: estado de la copia, tareas de Hoy y Radar. No captura, no decide ni escribe nada; cada acción abre la página que ya la hace.
 *  Lo que no se puede leer se muestra como «—» con su motivo, nunca como cero. */
type Props = {
  state: AppState; contextRevision: string | null;
  onOpenToday: () => void; onOpenTask: (taskId: string) => void; onOpenRadar: () => void; onRehearse: (commitmentId: string) => void;
  onOpenDateCheck: () => void; onOpenContinuity: () => void; onOpenChanges: () => void;
  /** Recuentos ya leídos aquí, para los avisos del menú. null = sin dato (nunca cero). */
  onSignals?: (signals: { overdue: number | null; atRisk: number | null }) => void;
  /** Abre la ficha de un registro (avisos de calidad de los datos). */
  onOpenRecord?: (record: CrmRecord) => void;
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
  /** El Laboratorio (Radar) solo existe con datos de prueba: sin él, Inicio no lee ni enseña el Radar. */
  lab?: boolean;
};
type Radar = { state: 'loading' } | { state: 'off'; reason: string } | { state: 'ready'; items: CommitmentSummary[] };

export function HomeOverview({ state, contextRevision, onOpenToday, onOpenTask, onOpenRadar, onRehearse, onOpenDateCheck, onOpenContinuity, onOpenChanges, onSignals, onOpenRecord, onOpenDeals, onContinuityStatus, onOpenAlert, onProtect, onPrepare, onOpenPassport, lab = true }: Props) {
  const [ops, setOps] = useState<Operations | null>(null), [opsError, setOpsError] = useState('');
  const [status, setStatus] = useState<ContinuityStatus | null>(null);
  const [radar, setRadar] = useState<Radar>({ state: 'loading' });
  const [report, setReport] = useState(false), [copied, setCopied] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    if (!state.runtime) loadLocalOperations(controller.signal).then(setOps).catch(failure => { if (!controller.signal.aborted) setOpsError(failure instanceof Error ? failure.message : 'No se pudo leer Hoy.'); });
    else setOpsError('Hoy no está disponible en una copia restaurada.');
    api<ContinuityStatus>('/v2/continuity').then(value => { if (!controller.signal.aborted) { setStatus(value); onContinuityStatus?.(value); } }).catch(() => undefined);
    return () => controller.abort();
  }, [state.runtime, state.snapshot?.capturedAt]);
  useEffect(() => {
    const controller = new AbortController();
    if (!lab) { setRadar({ state: 'off', reason: 'El Radar forma parte del Laboratorio y solo funciona con datos de prueba.' }); return () => controller.abort(); }
    if (!contextRevision) { setRadar({ state: 'off', reason: 'La copia aún no tiene una referencia autorizada.' }); return () => controller.abort(); }
    setRadar({ state: 'loading' });
    loadRadarCapability(contextRevision, controller.signal).then(async capability => {
      if (capability.status !== 'available') { setRadar({ state: 'off', reason: capability.status === 'not-initialized' ? 'El escenario de ensayo del Radar está sin activar.' : 'El Radar no está disponible en esta copia.' }); return; }
      const list = await loadCommitments(contextRevision, controller.signal);
      setRadar({ state: 'ready', items: list.items });
    }).catch(() => { if (!controller.signal.aborted) setRadar({ state: 'off', reason: 'No se pudo leer el Radar.' }); });
    return () => controller.abort();
  }, [contextRevision, lab]);

  const now = new Date();
  const snapshot = state.snapshot;
  const { activeId, activeReadiness, activeCaptureRecords, latest, latestIsDifferent } = workspaceCopy(state, status);
  // El mismo veredicto que abre Continuidad (y el punto del menú).
  const verdict = readinessFor(state, status, now);
  const copy = describeCapture(snapshot?.capturedAt, now.getTime());
  const stale = !!activeId && !state.runtime && copy.stale;
  const copyLabel = activeId ? 'Copia activa' : 'Captura importada';
  const counts = ops?.counts ?? null;
  const urgent = ops?.tasks.filter(task => task.bucket === 'overdue' || task.bucket === 'due-in-window') ?? [];
  const oldest = ops ? ops.tasks.filter(task => task.bucket === 'overdue').reduce((max, task) => Math.max(max, daysLate(task.due, now) ?? 0), 0) : 0;
  const nextUp = ops?.tasks.find(task => task.bucket === 'due-in-window');
  const open = radar.state === 'ready' ? radar.items.filter(item => item.status !== 'resolved') : [];
  const atRisk = open.filter(item => item.status === 'at-risk'), unconfirmed = open.filter(item => item.status === 'unconfirmed'), clear = open.filter(item => item.status === 'no-risk-detected');
  const uncertaintyFirst = atRisk.length === 0 && unconfirmed.length > 0;
  const radarCount = uncertaintyFirst ? unconfirmed.length : atRisk.length;
  const radarLabel = uncertaintyFirst ? 'Compromisos sin confirmar' : 'Compromisos en riesgo';
  const worst = atRisk.slice().sort((a, b) => a.dueAt.localeCompare(b.dueAt))[0];
  const today = new Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Madrid', weekday: 'long', day: 'numeric', month: 'long' }).format(now);
  const hour = Number(new Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Madrid', hour: 'numeric', hour12: false }).format(now));
  const greeting = hour < 14 ? 'Buenos días' : hour < 21 ? 'Buenas tardes' : 'Buenas noches';
  const changes = status?.pendingChanges ?? state.changes ?? 0;
  // Avisos de la copia que no dice ya el título de la tarjeta (antigüedad y «sin copia» van en el título).
  const copyAlerts = status ? continuityAlerts(status, now).filter(alert => alert.id !== 'stale' && alert.id !== 'no-copy' && (alert.id !== 'drill' || activeReadiness)) : [];
  // Primer uso: sin copia (y fuera del paquete restaurado) Inicio enseña los tres pasos en lugar de un tablero vacío.
  const firstRun = !snapshot && !state.runtime;
  const firstSteps = firstRunPlan({ protectedAccess: status ? status.protected : null, hasCopy: !!snapshot || !!status?.captures.length, drillPassed: anyDrillPassed(status), passportSeen: passportSeen() });
  const firstActions = { onProtect, onPrepare, onTest: onOpenAlert ? () => onOpenAlert('estado') : undefined, onPassport: onOpenPassport, onOpenContinuity };
  const copyTone = !snapshot ? 'neutral' : stale || copyAlerts.length ? 'warn' : 'ok';
  const overdueCount = counts ? counts.overdue : null, riskCount = radar.state === 'ready' ? atRisk.length : null;
  useEffect(() => { onSignals?.({ overdue: overdueCount, atRisk: riskCount }); }, [overdueCount, riskCount]);
  // «Tu siguiente paso»: una sola recomendación, ordenada por lo que antes puede costarte algo: un compromiso con fecha en riesgo, lo vencido, la antigüedad de la copia, la prueba pendiente y los cambios por revisar. Es una sugerencia calculada con lo leído, no una decisión.
  type Advice = { tone: 'danger' | 'warn' | 'ok'; title: string; detail: string; label: string; run: () => void; taskId?: string };
  const advice: Advice[] = [];
  const oldestTask = ops ? ops.tasks.filter(task => task.bucket === 'overdue').sort((a, b) => (daysLate(b.due, now) ?? 0) - (daysLate(a.due, now) ?? 0))[0] : undefined;
  if (!snapshot) advice.push({ tone: 'warn', title: 'Prepara tu primera copia', detail: 'Sin una copia no hay nada que consultar ni que probar.', label: 'Ir a Continuidad', run: onOpenContinuity });
  if (worst) advice.push({ tone: 'danger', title: '«' + worst.title + '» está en riesgo', detail: 'Comprometido para el ' + new Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Madrid', weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(worst.dueAt)) + '. Ensaya la semana antes de dar otra fecha.', label: 'Ensayar mi semana', run: () => onRehearse(worst.id) });
  if (oldestTask && counts) advice.push({ tone: 'danger', title: 'Revisa «' + (oldestTask.label || 'Tarea sin título') + '»', detail: (counts.overdue === 1 ? 'Es tu única tarea vencida' : 'Es la más antigua de ' + counts.overdue + ' tareas vencidas') + (oldest > 0 ? ': lleva ' + oldest + (oldest === 1 ? ' día.' : ' días.') : '.'), label: 'Abrir la tarea', run: () => onOpenTask(oldestTask.id), taskId: oldestTask.id });
  if (stale) advice.push({
    tone: 'warn', title: latestIsDifferent ? 'Revisa la copia activa' : 'Actualiza tu copia',
    detail: latestIsDifferent ? 'Hay otra captura guardada. El trabajo sigue en la copia activa.'
      : 'La copia activa se capturó ' + copy.age + '. Los cambios posteriores del CRM quedan fuera.',
    label: 'Ir a Continuidad', run: onOpenContinuity,
  });
  const drillAlert = copyAlerts.find(alert => alert.id === 'drill');
  if (snapshot && drillAlert) advice.push({ tone: drillAlert.tone, title: drillAlert.title, detail: drillAlert.detail, label: drillAlert.action.label, run: onOpenContinuity });
  if (changes > 0) advice.push({ tone: 'ok', title: 'Revisa ' + (changes === 1 ? 'tu cambio local' : 'tus ' + changes + ' cambios locales'), detail: 'Están guardados en este ordenador; revisa cuáles quieres devolver al CRM.', label: 'Revisar cambios', run: onOpenChanges });
  const first = advice[0];
  const tasks = urgent.filter(task => task.id !== first?.taskId).slice(0, 3);
  // Resumen de la semana: solo reordena lo ya leído para imprimirlo o copiarlo. No guarda nada.
  const week = { overdue: ops ? ops.tasks.filter(task => task.bucket === 'overdue') : [], soon: ops ? ops.tasks.filter(task => task.bucket === 'due-in-window') : [],
    later: ops ? ops.tasks.filter(task => { const late = daysLate(task.due, now); return task.bucket !== 'overdue' && task.bucket !== 'due-in-window' && late !== null && late < 0 && late >= -7; }) : [] };
  const taskLine = (task: Operations['tasks'][number]) => (task.label || 'Tarea sin título') + ' — ' + dueLabel(task.due, task.dueKind, now);
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
    ...(radar.state === 'ready' ? ['COMPROMISOS DEL RADAR', ...atRisk.map(item => '- En riesgo: ' + item.title), ...unconfirmed.map(item => '- Sin confirmar: ' + item.title), ''] : []),
    'TU COPIA', copyLine].join('\n');
  // «La semana en una línea»: cada tarea y cada compromiso abierto, colocados en su día. Solo dibuja lo ya leído; lo que no tiene fecha legible no se inventa.
  type Mark = { key: string; kind: 'task' | 'commitment'; tone: 'danger' | 'warn' | 'later'; label: string; aria: string; open: () => void; offset: number };
  const marks: Mark[] = [];
  for (const task of ops?.tasks ?? []) { const late = daysLate(task.due, now); if (late === null) continue; marks.push({ key: 't:' + task.id, kind: 'task', tone: task.bucket === 'overdue' ? 'danger' : task.bucket === 'due-in-window' ? 'warn' : 'later', label: (task.label || 'Tarea sin título') + ' · ' + dueLabel(task.due, task.dueKind, now), aria: 'Abrir tarea ' + (task.label || 'sin título') + ', ' + dueLabel(task.due, task.dueKind, now), open: () => onOpenTask(task.id), offset: -late }); }
  for (const item of open) { const late = daysLate(item.dueAt, now); if (late === null) continue; marks.push({ key: 'c:' + item.id, kind: 'commitment', tone: item.status === 'at-risk' ? 'danger' : item.status === 'unconfirmed' ? 'warn' : 'later', label: item.title + ' · compromiso ' + (item.status === 'at-risk' ? 'en riesgo' : item.status === 'unconfirmed' ? 'sin confirmar' : 'sin riesgo detectado'), aria: 'Abrir el Radar: ' + item.title, open: onOpenRadar, offset: -late }); }
  const lineFrom = Math.max(-10, Math.min(-2, ...marks.map(mark => mark.offset))), lineTo = Math.min(12, Math.max(7, ...marks.map(mark => mark.offset)));
  const lineDays = ops || open.length ? Array.from({ length: lineTo - lineFrom + 1 }, (_, index) => {
    const offset = lineFrom + index, date = new Date(now.getTime() + offset * 86_400_000);
    const weekday = new Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Madrid', weekday: 'short' }).format(date).replace('.', '');
    const clamped = index === 0 && marks.some(mark => mark.offset < lineFrom);
    return { offset, weekday, clamped, weekend: /^(s[áa]b|dom)/i.test(weekday), number: new Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Madrid', day: 'numeric' }).format(date),
      marks: marks.filter(mark => mark.offset === offset || index === 0 && mark.offset < lineFrom || index === lineTo - lineFrom && mark.offset > lineTo) };
  }) : [];
  const lineSummary = !ops && !open.length ? 'Todavía no hay fechas que colocar.' : [counts ? (counts.overdue === 0 ? 'Nada vencido' : counts.overdue + (counts.overdue === 1 ? ' tarea vencida' : ' tareas vencidas')) : '', counts && counts.upcoming ? counts.upcoming + ' para las próximas 24 h' : '', atRisk.length ? atRisk.length + (atRisk.length === 1 ? ' compromiso en riesgo' : ' compromisos en riesgo') : ''].filter(Boolean).join(', ').replace(/^(.+)$/, '$1. Pulsa un punto para abrirlo.') || 'Todavía no hay fechas que colocar.';


  return <section className="oc-home" aria-labelledby="oc-home-title">
    <header className="oc-home-head">
      <h1 id="oc-home-title">{firstRun ? 'Bienvenido a Plan B' : 'Inicio'}</h1>
      <p>{greeting} · {today}{snapshot ? ' · ' + snapshot.name : ''}</p>
    </header>

    {firstRun ? <FirstRun plan={firstSteps} {...firstActions} /> : <>
    {!state.runtime && status ? <FirstRunStrip plan={firstSteps} {...firstActions} /> : null}
    {!state.runtime && snapshot ? <MorningBrief tasks={ops ? ops.tasks : null} tasksNote={opsError || 'Leyendo tus tareas…'} capturedAt={snapshot.capturedAt} stale={stale} steps={advice} spec={state.spec} title={snapshot.name} revision={(snapshot.capturedAt ?? '') + ':' + (state.changes ?? 0)} onOpenToday={onOpenToday} onOpenChanges={onOpenChanges} /> : null}
    {!state.runtime ? <>
    <section className="fx-line" aria-labelledby="fx-line-title">
      <div className="fx-line-head">
        <div><h2 id="fx-line-title">La semana en una línea</h2><p>{lineSummary}</p></div>
        <button type="button" className="fx-report-open" disabled={!ops} onClick={() => { setCopied(false); setReport(true); }}>Resumen de la semana</button>
        <div className="fx-counts">
      <button type="button" className="oc-card oc-kpi" data-tone={counts && counts.overdue > 0 ? 'danger' : 'ok'} onClick={onOpenToday} aria-label={'Tareas vencidas: ' + (counts ? counts.overdue : 'sin dato') + '. Abrir Hoy'}>
        <span className="oc-kpi-label">Tareas vencidas</span><span className="oc-kpi-value">{counts ? counts.overdue : '—'}</span>
        <span className="oc-kpi-note">{!counts ? (opsError || 'Leyendo…') : counts.overdue === 0 ? 'Nada atrasado' : oldest > 0 ? 'La más antigua, hace ' + oldest + (oldest === 1 ? ' día' : ' días') : 'Revisa las de hoy'}</span>
      </button>
      <button type="button" className="oc-card oc-kpi" data-tone={counts && counts.upcoming > 0 ? 'warn' : undefined} onClick={onOpenToday} aria-label={'Próximas 24 horas: ' + (counts ? counts.upcoming : 'sin dato') + '. Abrir Hoy'}>
        <span className="oc-kpi-label">Próximas 24 h</span><span className="oc-kpi-value">{counts ? counts.upcoming : '—'}</span>
        <span className="oc-kpi-note" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{nextUp ? nextUp.label : counts ? 'Sin vencimientos cercanos' : '—'}</span>
      </button>
      {lab ? <button type="button" className="oc-card oc-kpi" data-tone={atRisk.length > 0 ? 'danger' : uncertaintyFirst ? 'warn' : undefined} onClick={onOpenRadar} aria-label={radarLabel + ': ' + (radar.state === 'ready' ? radarCount : 'sin dato') + '. Abrir Radar'}>
        <span className="oc-kpi-label">{radarLabel}</span><span className="oc-kpi-value">{radar.state === 'ready' ? radarCount : '—'}</span>
        <span className="oc-kpi-note">{radar.state === 'ready' ? 'De ' + open.length + ' abiertos en el Radar' : radar.state === 'off' ? radar.reason : 'Leyendo…'}</span>
      </button> : null}
        </div>
      </div>
      {lineDays.length ? <ol className="fx-days" style={{ gridTemplateColumns: 'repeat(' + lineDays.length + ', minmax(0, 1fr))' }}>
        {lineDays.map(day => <li key={day.offset} data-today={day.offset === 0 ? 'true' : undefined} data-past={day.offset < 0 ? 'true' : undefined} data-weekend={day.weekend ? 'true' : undefined}>
          {day.marks.length ? <div className="fx-pop" aria-hidden="true"><strong>{day.offset === 0 ? 'Hoy' : day.weekday + ' ' + day.number}{day.clamped ? ' y antes' : ''}</strong>{day.marks.slice(0, 5).map(mark => <span key={mark.key} data-tone={mark.tone} data-kind={mark.kind}>{mark.label}</span>)}{day.marks.length > 5 ? <em>y {day.marks.length - 5} más</em> : null}</div> : null}
          <div className="fx-stack">
            {day.marks.slice(0, 7).map(mark => <button key={mark.key} type="button" className="fx-dot" data-kind={mark.kind} data-tone={mark.tone} title={mark.label} aria-label={mark.aria} onClick={mark.open}/>)}
            {day.marks.length > 7 ? <span className="fx-more">+{day.marks.length - 7}</span> : null}
          </div>
          <span className="fx-day"><b>{day.offset === 0 ? 'Hoy' : day.number}</b><i>{day.clamped ? 'y antes' : day.weekday}</i></span>
        </li>)}
      </ol> : <p className={'oc-empty-line' + (opsError ? '' : ' ui-loading ui-loading-sm')} role="status">{opsError || 'Leyendo las fechas de tu copia…'}</p>}
      <p className="fx-key"><span data-tone="danger">Vencido</span><span data-tone="warn">Próximas 24 h</span><span data-tone="later">Más adelante</span>{lab ? <span data-kind="commitment">Compromiso del Radar</span> : null}</p>
    </section>
    </> : null}
    <div className="oc-home-grid">
      <div className="oc-home-main-stack">
    <section className="fx-next" data-tone={first ? first.tone : 'ok'} aria-labelledby="fx-next-title">
      <h2 id="fx-next-title">Tu siguiente paso</h2>
      {first ? <>
        <p className="fx-next-title">{first.title}</p>
        <p className="fx-next-detail">{first.detail}</p>
        <button type="button" className="button primary" onClick={first.run}>{first.label}</button>
      </> : <p className="fx-next-detail" role="status">{state.runtime ? 'Consulta el estado de la copia restaurada en Continuidad.' : opsError || (ops && status ? 'No hay acciones urgentes en los datos consultados.' : 'Consultando el estado de la copia…')}</p>}
    </section>
      {!state.runtime ? <article className="oc-card oc-home-main" aria-labelledby="oc-first-title">
        <div className="oc-card-head"><h2 id="oc-first-title">Prioridades de hoy</h2><button type="button" className="oc-link" onClick={onOpenToday}>Ver cola de Hoy →</button></div>
        {!ops ? (opsError ? <p className="oc-empty-line" role="status">{opsError}</p> : <Skeleton rows={3} label="Leyendo las tareas de tu copia…" />)
          : tasks.length === 0 ? <p className={'oc-empty-line ui-empty' + (snapshot ? ' ui-empty-ok' : '')}>{urgent.length ? 'La única prioridad se muestra arriba.' : 'No hay tareas vencidas ni para las próximas 24 h.'}</p>
          : <ul className="oc-task-list">{          tasks.map(task => { const chip = taskChip(task.bucket, task.due, now), [what, who] = splitTaskLabel(task.label || 'Tarea sin título'); return <li key={task.id}>
              <span className="oc-chip" data-tone={chip.tone}>{chip.text}</span>
                        <div style={{ minWidth: 0 }}><strong title={task.label}>{what}{who ? <span className="oc-task-who">{who}</span> : null}</strong><span className="oc-due">{task.nextAction}</span></div>
              <span className="oc-due">{dueLabel(task.due, task.dueKind, now)}</span>
              <button type="button" className="oc-small-button" onClick={() => onOpenTask(task.id)} aria-label={'Abrir ' + (task.label || 'tarea') + ' en Hoy'}>Abrir</button>
            </li>; })}</ul>}
      </article> : null}
      {!state.runtime && state.spec ? <PipelineCard spec={state.spec} revision={(snapshot?.capturedAt ?? '') + ':' + (state.changes ?? 0)} onOpenRecord={onOpenRecord} onOpenDeals={onOpenDeals} /> : null}
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
            {verdict ? <p className="oc-verdict" data-tone={verdict.tone}>
              <span className="oc-verdict-steps" role="img" aria-label={verdict.progress}>{verdict.steps.map((stepDone, index) => <i key={index} data-done={stepDone ? 'true' : undefined}/>)}</span>
              <span><strong>{verdict.title}</strong> · {verdict.progress} · {verdict.next}</span>
            </p> : null}
            {verdict && status && !state.runtime ? <HomeSeal status={status} steps={verdict.steps} onOpen={onOpenAlert ? () => onOpenAlert('estado') : onOpenContinuity} /> : null}
            {copyAlerts.length ? <ul className="oc-copy-alerts" aria-label="Avisos de la copia">{copyAlerts.map(alert => <li key={alert.id} data-tone={alert.tone}><span><strong>{alert.title}</strong> {alert.detail}</span>{onOpenAlert ? <button type="button" className="oc-link" aria-label={alert.action.label + ': ' + alert.title} onClick={() => onOpenAlert(alert.action.target)}>{alert.action.label}</button> : null}</li>)}</ul> : null}
            <div className="oc-row-actions"><button type="button" className={'button ' + (first ? 'secondary' : 'primary')} onClick={onOpenContinuity}>{stale || !snapshot ? 'Ir a Continuidad' : 'Ver estado'}</button>{changes > 0 ? <button type="button" className="button secondary" onClick={onOpenChanges}>Revisar cambios</button> : null}</div>
          </div>
        </article>
        {lab ? <article className="oc-card oc-side-card" aria-labelledby="oc-radar-title">
          <div className="oc-side-head"><h2 id="oc-radar-title">Radar de compromisos</h2><button type="button" className="oc-link" onClick={onOpenRadar}>Abrir</button></div>
          {radar.state !== 'ready' ? <p className={'oc-muted' + (radar.state === 'off' ? '' : ' ui-loading ui-loading-sm')}>{radar.state === 'off' ? radar.reason : 'Leyendo el Radar…'}</p> : open.length === 0 ? <p className="oc-muted ui-empty">No hay compromisos abiertos.</p> : <>
            <div className="oc-bar" role="img" aria-label={atRisk.length + ' en riesgo, ' + unconfirmed.length + ' sin confirmar, ' + clear.length + ' sin riesgo detectado'}>
              {atRisk.length ? <span style={{ flex: atRisk.length, background: 'var(--oc-danger-bar)' }}/> : null}
              {unconfirmed.length ? <span style={{ flex: unconfirmed.length, background: 'var(--oc-warn-bar)' }}/> : null}
              {clear.length ? <span style={{ flex: clear.length, background: 'var(--oc-ok-bar)' }}/> : null}
            </div>
            <p className="oc-legend">{!uncertaintyFirst ? <span><strong>{atRisk.length}</strong> en riesgo</span> : null}<span><strong>{unconfirmed.length}</strong> sin confirmar</span><span><strong>{clear.length}</strong> sin riesgo detectado</span></p>
            {worst ? <div className="oc-alert"><strong>{worst.title}</strong><p>Comprometido para el {new Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Madrid', weekday: 'long', day: 'numeric' }).format(new Date(worst.dueAt))}: en riesgo con lo observado.</p>
              <div className="oc-row-actions" style={{ marginTop: 2 }}><button type="button" className="oc-alert-button" onClick={() => onRehearse(worst.id)}>Ensayar mi semana</button><button type="button" className="oc-alert-button" onClick={onOpenDateCheck}>Comprobar una fecha</button></div></div> : null}
          </>}
        </article> : null}
        {state.ready && state.spec && onOpenRecord ? <QualityPanel spec={state.spec} revision={state.snapshot?.capturedAt + ':' + state.changes} onOpen={onOpenRecord} /> : null}
      </div>
    </div>
    </>}
    {report ? <Modal title="Resumen de la semana" close={() => setReport(false)} wide><div className="modal-body fx-report">
      <p className="fx-report-meta">{snapshot?.name ?? 'Plan B'} · {today}. Calculado con lo leído ahora de tu copia local.</p>
      {([['Vencido', week.overdue, 'danger'], ['Próximas 24 h', week.soon, 'warn'], ['Próximos 7 días', week.later, 'later']] as const).map(([title, list, tone]) => <section key={title} data-tone={tone}><h3>{title}<span>{list.length}</span></h3>
        {list.length ? <ul>{list.map(task => <li key={task.id}><span>{task.label || 'Tarea sin título'}</span><time>{dueLabel(task.due, task.dueKind, now)}</time></li>)}</ul> : <p>Nada.</p>}</section>)}
      {radar.state === 'ready' ? <section data-tone="danger"><h3>Compromisos del Radar<span>{atRisk.length + unconfirmed.length}</span></h3>
        {atRisk.length + unconfirmed.length ? <ul>{atRisk.map(item => <li key={item.id}><span>{item.title}</span><time>En riesgo</time></li>)}{unconfirmed.map(item => <li key={item.id}><span>{item.title}</span><time>Sin confirmar</time></li>)}</ul> : <p>Ninguno en riesgo ni sin confirmar.</p>}</section> : null}
      <section><h3>Tu copia</h3><p>{copyLine}</p></section>
      <div className="fx-report-actions"><button type="button" className="button primary" onClick={() => window.print()}>Imprimir</button>
        <button type="button" className="button secondary" onClick={() => { void navigator.clipboard?.writeText(reportText()).then(() => setCopied(true)).catch(() => setCopied(false)); }}>Copiar como texto</button>
        {copied ? <span role="status">Copiado.</span> : null}</div>
    </div></Modal> : null}
  </section>;
}
