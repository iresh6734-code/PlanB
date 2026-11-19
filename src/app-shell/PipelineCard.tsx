import { useEffect, useState } from 'react';
import type { AppState, CrmRecord } from '../../shared/model.js';
import { api } from '../api.js';
import { recordName } from '../components.js';
import { madridDay } from '../task-display.js';
import { ErrorState, Skeleton } from '../ui/index.js';
import { closeStatus, euros, stageKind } from './deal-insights.js';
import { COMMITTED_FROM, stageProbabilities, weightedForecast } from './forecast.js';
import { fieldList, missingFor, stageNeeds } from './stage-rules.js';
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
  const attention = withStatus.filter(item => item.status.tone === 'late' || item.status.tone === 'soon')
    .sort((a, b) => String(a.record.values[closeField!.key]).localeCompare(String(b.record.values[closeField!.key]))).slice(0, 3);
  const partial = !!page && page.total > deals.length;
  const probabilities = stageProbabilities(spec.stages.filter(stage => stageKind(stage) === 'open'));
  const forecast = closeField && open.length ? weightedForecast(open.map(item => ({ stageId: item.stage.id, amount: item.amount, close: item.record.values[closeField.key] })), probabilities, today) : null;
  const byPosition = probabilities.some(item => item.source === 'position');
  const needs = stageNeeds(spec);
  const unmet = open.flatMap(item => { const missing = missingFor(item.record.values, item.stage.id, needs); return missing.length ? [{ ...item, missing }] : []; });
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
        {attention.length ? <ul className="oc-task-list gx-pipe-list">{attention.map(({ record, stage, amount, status }) => <li key={record.id}>
          <span className="oc-chip" data-tone={status.tone === 'late' ? 'danger' : 'warn'}>{status.tone === 'late' ? 'Cierre vencido' : 'Cierra pronto'}</span>
          <div style={{ minWidth: 0 }}><strong title={recordName(record, spec)}>{recordName(record, spec)}</strong><span className="oc-due">{stage.label + ' · ' + (amount === null ? 'Sin importe' : euros(amount))}</span></div>
          <span className="oc-due">{status.label.replace(/^.* · /, '')}</span>
          {onOpenRecord ? <button type="button" className="oc-small-button" onClick={() => onOpenRecord(record)} aria-label={'Abrir la oportunidad ' + recordName(record, spec)}>Abrir</button> : null}
        </li>)}</ul> : null}
        {unmet.length ? <section className="gx-need" aria-labelledby="gx-need-title">
          <h3 id="gx-need-title">Les falta lo que pide su etapa <span>{unmet.length}</span></h3>
          <ul className="oc-task-list gx-pipe-list">{unmet.slice(0, 3).map(({ record, stage, missing }) => <li key={record.id}>
            <span className="oc-chip" data-tone="warn">{stage.label}</span>
            <div style={{ minWidth: 0 }}><strong title={recordName(record, spec)}>{recordName(record, spec)}</strong><span className="oc-due">Falta {fieldList(missing)}</span></div>
            <span />
            {onOpenRecord ? <button type="button" className="oc-small-button" onClick={() => onOpenRecord(record)} aria-label={'Completar la oportunidad ' + recordName(record, spec)}>Completar</button> : null}
          </li>)}</ul>
          {unmet.length > 3 ? <p className="gx-pipe-note">Y {unmet.length - 3} más. Aviso, no bloqueo: se puede guardar sin estos datos.</p> : <p className="gx-pipe-note">Aviso, no bloqueo: se puede guardar sin estos datos.</p>}
        </section> : null}
      </>}
    {amounts.missing ? <p className="gx-pipe-note">{amounts.missing === 1 ? '1 oportunidad abierta sin importe.' : amounts.missing + ' oportunidades abiertas sin importe.'}</p> : null}
    {uncertain ? <p className="gx-pipe-note">{uncertain === 1 ? '1 oportunidad con etapa por revisar.' : uncertain + ' oportunidades con etapa por revisar.'}</p> : null}
    {page && partial ? <p className="gx-pipe-note">Calculado con las primeras {deals.length} de {page.total} oportunidades.</p> : null}
  </article>;
}
