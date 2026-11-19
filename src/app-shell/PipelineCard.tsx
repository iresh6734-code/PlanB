import { useEffect, useState, type FormEvent } from 'react';
import type { AppState, CrmRecord } from '../../shared/model.js';
import { api } from '../api.js';
import { recordName } from '../components.js';
import { madridDay } from '../task-display.js';
import { ErrorState, Skeleton } from '../ui/index.js';
import { closeStatus, euros, stageKind } from './deal-insights.js';
import { dealRisks, riskBase, riskTally, type RiskKind } from './deal-risk.js';
import { COMMITTED_FROM, stageProbabilities, weightedForecast } from './forecast.js';
import { goalProgress, parseGoal, readGoal, wonInMonth, writeGoal } from './goal.js';
import { useDealPulse } from './useDealPulse.js';
import { recordListPath } from './useRecordList.js';
import { BOARD_MAX_PAGES, readPages, type ListPage } from './pager.js';

type Spec = NonNullable<AppState['spec']>;
type Page = { records: CrmRecord[]; total: number };
type PipelineRead = { spec: Spec; revision: string; attempt: number } &
  ({ page: Page; error?: never } | { error: string; page?: never });
const LIMIT = 100; // máximo que da la lista del servidor en una petición

function recordedAmount(value: unknown): number | null {
  if (typeof value !== 'number' && (typeof value !== 'string' || !value.trim())) return null;
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : null;
}

function amountSummary(rows: { amount: number | null }[]) {
  const known = rows.flatMap(row => row.amount === null ? [] : [row.amount]);
  const total = known.reduce((sum, amount) => sum + amount, 0);
  const overflow = !Number.isFinite(total);
  return { total: known.length > 0 && !overflow ? total : null, missing: rows.length - known.length, overflow };
}

const RISK_WORDS: Record<RiskKind, [string, string]> = {
  'close-late': ['con el cierre vencido', 'con el cierre vencido'],
  missing: ['le falta lo que pide su etapa', 'les falta lo que pide su etapa'],
  'no-next': ['sin próximo paso', 'sin próximo paso'],
  stalled: ['parada', 'paradas'],
};

/** F2 · Objetivo del mes: la cifra vive en este navegador; lo ganado, lo comprometido y lo probable salen de la copia. */
function GoalStrip({ goal, onChange, won, committed, probable, today, undatedWon }: {
  goal: number | null; onChange: (goal: number | null) => void; won: number; committed: number; probable: number; today: string; undatedWon: number;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const save = (event: FormEvent) => {
    event.preventDefault();
    const value = parseGoal(text);
    if (value === null) { setProblem('Escribe una cifra en euros, por ejemplo 12.500 o 12,5k.'); return; }
    if (!writeGoal(value)) { setProblem('Este navegador no deja guardar el objetivo.'); return; }
    onChange(value); setEditing(false); setProblem(null);
  };
  if (goal === null || editing) return <section className="gx-goal" data-state="edit" aria-labelledby="gx-goal-title">
    <h3 id="gx-goal-title">Objetivo del mes</h3>
    <form className="gx-goal-form" onSubmit={save}>
      <input inputMode="decimal" aria-label="Objetivo de ventas de este mes, en euros" aria-describedby="gx-goal-help" aria-invalid={problem ? 'true' : undefined} placeholder="Por ejemplo 12.500 €" maxLength={20}
        value={text} onChange={event => { setText(event.target.value); setProblem(null); }} onKeyDown={event => { if (event.key === 'Escape' && editing) { event.stopPropagation(); setEditing(false); setProblem(null); } }} />
      <button type="submit" className="button primary" disabled={!text.trim()}>Fijar objetivo</button>
      {editing ? <button type="button" className="button secondary" onClick={() => { setEditing(false); setProblem(null); }}>Cancelar</button> : null}
    </form>
    <p className="gx-pipe-note" id="gx-goal-help" data-tone={problem ? 'error' : undefined} role={problem ? 'alert' : undefined}>{problem ?? 'Se guarda solo en este navegador. Lo ganado son las oportunidades ganadas con el cierre en este mes.'}</p>
  </section>;
  const progress = goalProgress({ goal, won, committed, probable, today });
  const pct = (share: number) => Math.round(Math.min(1, Math.max(0, share)) * 1000) / 10 + '%';
  const pace = progress.perDay !== null ? ' Ritmo: ' + euros(progress.perDay) + ' por día laborable (' + (progress.daysLeft === 1 ? 'queda 1' : 'quedan ' + progress.daysLeft) + ', sin contar festivos).' : '';
  const line = progress.status === 'reached' ? 'Objetivo cumplido: ' + euros(won) + ' ganados este mes.'
    : progress.status === 'covered' ? 'Lo comprometido lo cubre: faltan ' + euros(progress.gap) + ' por cerrar y ya están en etapas seguras.' + pace
    : progress.status === 'reachable' ? 'Alcanzable si se cierra lo probable: faltan ' + euros(progress.gap) + '.' + pace
    : 'Faltan ' + euros(progress.gap) + ' y lo abierto este mes no llega a cubrirlos.' + pace;
  return <section className="gx-goal" data-status={progress.status} aria-labelledby="gx-goal-title">
    <div className="gx-goal-head">
      <h3 id="gx-goal-title">Objetivo del mes</h3>
      <strong>{euros(goal)}</strong>
      <span className="gx-goal-actions"><button type="button" className="oc-link" onClick={() => { setText(String(goal)); setEditing(true); }}>Cambiar</button><button type="button" className="oc-link" onClick={() => { if (writeGoal(null)) onChange(null); }}>Quitar</button></span>
    </div>
    <div className="gx-goal-bar" role="img" aria-label={'Ganado ' + euros(won) + ', comprometido ' + euros(committed) + ' y probable ' + euros(probable) + ' frente a un objetivo de ' + euros(goal)}>
      <i data-part="won" style={{ width: pct(progress.bars.won) }} />
      <i data-part="committed" style={{ width: pct(progress.bars.committed) }} />
      <i data-part="probable" style={{ width: pct(progress.bars.probable) }} />
      <b className="gx-goal-mark" style={{ left: pct(progress.mark) }} aria-hidden="true" />
    </div>
    <ul className="gx-goal-legend">
      <li data-part="won"><span aria-hidden="true" />Ganado<em>{euros(won)}</em></li>
      <li data-part="committed"><span aria-hidden="true" />Comprometido<em>{euros(committed)}</em></li>
      <li data-part="probable"><span aria-hidden="true" />Probable<em title="Importe por la probabilidad de su etapa, de las abiertas que cierran este mes">{euros(probable)}</em></li>
    </ul>
    <p className="gx-goal-line" role="status">{line}</p>
    {undatedWon ? <p className="gx-pipe-note">{undatedWon === 1 ? '1 ganada sin fecha de cierre no cuenta.' : undatedWon + ' ganadas sin fecha de cierre no cuentan.'}</p> : null}
  </section>;
}

/** Inicio · «Oportunidades abiertas»: cuánto hay en juego por etapa y las que antes piden atención (cierre vencido o próximo).
 *  Solo lee la copia local, por páginas y hasta 1.000; si hay más, lo dice en lugar de dar un total falso. */
export function PipelineCard({ spec, revision, onOpenRecord, onOpenDeals }: {
  spec: Spec; revision: string; onOpenRecord?: (record: CrmRecord) => void; onOpenDeals?: () => void;
}) {
  const [read, setRead] = useState<PipelineRead | null>(null);
  const [attempt, setAttempt] = useState(0);
  const target = read?.spec === spec && read.revision === revision && read.attempt === attempt ? read : null;
  const { page, error } = target ?? {};
  const hasDeals = spec.entities.some(entity => entity.id === 'deals');
  useEffect(() => {
    if (!hasDeals) return;
    const controller = new AbortController();
    const context = { spec, revision, attempt };
    setRead(null);
    readPages((offset, limit, signal) => api<ListPage>(recordListPath('deals', '', offset, '', limit), { signal }), controller.signal, { pageSize: LIMIT, maxPages: BOARD_MAX_PAGES, accept: record => record.entity === 'deals' })
      .then(read => { if (!controller.signal.aborted) setRead({ ...context, page: { records: read.records, total: read.total } }); })
      .catch(failure => {
        if (!controller.signal.aborted) setRead({ ...context, error: failure instanceof Error ? failure.message : 'La consulta se interrumpió.' });
      });
    return () => controller.abort();
  }, [hasDeals, spec, revision, attempt]);
  const pulse = useDealPulse({ active: hasDeals, spec, revision });
  const [goal, setGoal] = useState<number | null>(() => readGoal());
  const entity = spec.entities.find(item => item.id === 'deals');
  if (!entity) return null;
  const stageKey = spec.roles?.stage ?? 'dealstage', amountKey = spec.roles?.amount ?? 'amount';
  const closeField = entity.fields.find(field => field.type === 'date' && /cierre|close/i.test(field.key + ' ' + field.label));
  const today = madridDay(new Date());
  const deals = page?.records ?? [];
  const stagesById = new Map(spec.stages.map(stage => [stage.id, stage]));
  const classified = deals.map(record => ({
    record,
    stage: stagesById.get(String(record.values[stageKey] ?? '')),
    amount: recordedAmount(record.values[amountKey]),
  }));
  const uncertain = classified.filter(item => !item.stage).length;
  const open = classified.flatMap(item => item.stage && stageKind(item.stage) === 'open' ? [{ ...item, stage: item.stage }] : []);
  const amounts = amountSummary(open);
  const stages = spec.stages.filter(stage => stageKind(stage) === 'open').map(stage => {
    const list = open.filter(item => item.stage === stage);
    return { stage, count: list.length, total: amountSummary(list).total };
  }).filter(item => item.count > 0);
  const chartStages = stages.flatMap(item => item.total === null ? [] : [{ ...item, total: item.total }]);
  const withStatus = closeField ? open.map(item => ({ ...item, status: closeStatus(item.record.values[closeField.key], today, 'open') })) : [];
  const late = withStatus.filter(item => item.status.tone === 'late');
  const soon = withStatus.filter(item => item.status.tone === 'soon')
    .sort((a, b) => String(a.record.values[closeField!.key]).localeCompare(String(b.record.values[closeField!.key]))).slice(0, 3);
  const partial = !!page && page.total > deals.length;
  const probabilities = stageProbabilities(spec.stages.filter(stage => stageKind(stage) === 'open'));
  const forecast = closeField && open.length ? weightedForecast(open.map(item => ({ stageId: item.stage.id, amount: item.amount, close: item.record.values[closeField.key] })), probabilities, today) : null;
  const byPosition = probabilities.some(item => item.source === 'position');
  const base = riskBase(spec);
  const risks = dealRisks(deals, { ...base, closeKey: closeField?.key ?? null, today, pulse });
  const tally = riskTally(risks);
  const tallyText = (Object.keys(RISK_WORDS) as RiskKind[]).filter(kind => tally[kind]).map(kind => tally[kind] + ' ' + RISK_WORDS[kind][tally[kind] === 1 ? 0 : 1]).join(' · ');
  const wonMonth = wonInMonth(deals, { stageKey, amountKey, closeKey: closeField?.key ?? null, stages: stagesById }, today);
  const thisMonth = forecast?.months[0];
  const outside = forecast ? [
    forecast.late.deals ? forecast.late.deals + ' con el cierre vencido (' + euros(forecast.late.probable) + ' ponderado)' : '',
    forecast.later.deals ? forecast.later.deals + ' más adelante (' + euros(forecast.later.probable) + ')' : '',
    forecast.undated.deals ? forecast.undated.deals + ' sin fecha de cierre' : '',
  ].filter(Boolean) : [];
  return <article className="oc-card gx-pipe" aria-labelledby="gx-pipe-title">
    <div className="oc-card-head"><h2 id="gx-pipe-title">Oportunidades abiertas</h2>{onOpenDeals ? <button type="button" className="oc-link" onClick={onOpenDeals}>Ver tablero →</button> : null}</div>
    {!page ? (error ? <ErrorState title="No se pudieron leer las oportunidades" onAction={() => setAttempt(value => value + 1)}>{error}</ErrorState>
      : <Skeleton rows={2} label="Leyendo las oportunidades de tu copia…" />)
      : !open.length ? <p className="oc-empty-line ui-empty">{partial || uncertain ? 'No se han identificado oportunidades abiertas entre las leídas.' : 'No hay oportunidades abiertas.'}</p>
      : <>
        <div className="gx-pipe-figures">
          <p><strong>{amounts.total === null ? '—' : euros(amounts.total)}</strong><span>{amounts.overflow ? 'No se pudo sumar el importe' : amounts.total === null ? 'Sin importe conocido' : amounts.missing ? 'Importe conocido' : 'Importe en juego'}</span></p>
          <p><strong>{open.length}</strong><span>{open.length === 1 ? 'abierta' : 'abiertas'}</span></p>
          {closeField ? <p data-tone={late.length ? 'late' : 'ok'}><strong>{late.length}</strong><span>con el cierre vencido</span></p> : null}
        </div>
        {chartStages.length ? <div className="gx-pipe-bar" role="img" aria-label={chartStages.map(item => item.stage.label + ': ' + euros(item.total)).join(', ')}>
          {chartStages.map(item => <i key={item.stage.id} style={{ flexGrow: Math.max(item.total, 1), background: item.stage.color }} />)}
        </div> : null}
        <ul className="gx-pipe-legend">{stages.map(item => <li key={item.stage.id}><span style={{ background: item.stage.color }} aria-hidden="true" />{item.stage.label}<em>{item.count} · {item.total === null ? '—' : euros(item.total)}</em></li>)}</ul>
        <GoalStrip goal={goal} onChange={setGoal} won={wonMonth.amount} committed={thisMonth?.committed ?? 0} probable={thisMonth?.probable ?? 0} today={today} undatedWon={wonMonth.undated} />
        {forecast ? <section className="gx-fc" aria-labelledby="gx-fc-title">
          <h3 id="gx-fc-title">Previsión por mes de cierre</h3>
          <ol className="gx-fc-months">{forecast.months.map(month => <li key={month.month} data-empty={month.deals ? undefined : 'true'}>
            <span className="gx-fc-month">{month.label}</span>
            <strong title="Importe × probabilidad de la etapa">{euros(month.probable)}</strong>
            <span className="gx-fc-range">{month.deals ? euros(month.committed) + ' seguro · ' + euros(month.optimistic) + ' si cierran todas' : 'Nada previsto'}</span>
            <span className="gx-fc-count">{month.deals === 1 ? '1 oportunidad' : month.deals + ' oportunidades'}{month.missingAmount ? ', ' + month.missingAmount + ' sin importe' : ''}</span>
          </li>)}</ol>
          {outside.length ? <p className="gx-pipe-note">Fuera de estos meses: {outside.join(' · ')}.</p> : null}
          <p className="gx-pipe-note">«Seguro» suma las etapas desde el {Math.round(COMMITTED_FROM * 100)} %. Probabilidad por etapa: {probabilities.map(item => item.label + ' ' + Math.round(item.probability * 100) + ' %').join(' · ')}.{byPosition ? ' Estimada por su orden; escribe el porcentaje en el nombre de la etapa (por ejemplo «Propuesta 40 %») para fijarla.' : ''}</p>
        </section> : null}
        {risks.length ? <section className="gx-need gx-risk" aria-labelledby="gx-risk-title">
          <h3 id="gx-risk-title">En riesgo <span>{risks.length}</span></h3>
          <p className="gx-risk-tally">{tallyText}</p>
          <ul className="oc-task-list gx-pipe-list">{risks.slice(0, 4).map(({ record, stage, amount, reasons }) => <li key={record.id}>
            <span className="oc-chip" data-tone={reasons.some(reason => reason.tone === 'danger') ? 'danger' : 'warn'}>{stage.label}</span>
            <div style={{ minWidth: 0 }}><strong title={recordName(record, spec)}>{recordName(record, spec)}</strong>
              <span className="gx-risk-reasons">{reasons.map(reason => <em key={reason.kind} data-tone={reason.tone}>{reason.text}</em>)}</span></div>
            <span className="oc-due">{amount === null ? 'Sin importe' : euros(amount)}</span>
            {onOpenRecord ? <button type="button" className="oc-small-button" onClick={() => onOpenRecord(record)} aria-label={'Abrir la oportunidad ' + recordName(record, spec)}>Abrir</button> : null}
          </li>)}</ul>
          <p className="gx-pipe-note">{risks.length > 4 ? 'Y ' + (risks.length - 4) + ' más en la vista «En riesgo» del tablero. ' : ''}{pulse ? '' : 'Sin las tareas leídas no se valora el próximo paso. '}Son avisos con su motivo: nada impide guardar.</p>
        </section> : null}
        {soon.length ? <section className="gx-need gx-soon" aria-labelledby="gx-soon-title">
          <h3 id="gx-soon-title">Cierran pronto <span>{soon.length}</span></h3>
          <ul className="oc-task-list gx-pipe-list">{soon.map(({ record, stage, amount, status }) => <li key={record.id}>
            <span className="oc-chip" data-tone="warn">Cierra pronto</span>
            <div style={{ minWidth: 0 }}><strong title={recordName(record, spec)}>{recordName(record, spec)}</strong><span className="oc-due">{stage.label + ' · ' + (amount === null ? 'Sin importe' : euros(amount))}</span></div>
            <span className="oc-due">{status.label.replace(/^.* · /, '')}</span>
            {onOpenRecord ? <button type="button" className="oc-small-button" onClick={() => onOpenRecord(record)} aria-label={'Abrir la oportunidad ' + recordName(record, spec)}>Abrir</button> : null}
          </li>)}</ul>
        </section> : null}
      </>}
    {amounts.missing ? <p className="gx-pipe-note">{amounts.missing === 1 ? '1 oportunidad abierta sin importe.' : amounts.missing + ' oportunidades abiertas sin importe.'}</p> : null}
    {uncertain ? <p className="gx-pipe-note">{uncertain === 1 ? '1 oportunidad con etapa por revisar.' : uncertain + ' oportunidades con etapa por revisar.'}</p> : null}
    {page && partial ? <p className="gx-pipe-note">Calculado con las primeras {deals.length} de {page.total} oportunidades.</p> : null}
  </article>;
}
