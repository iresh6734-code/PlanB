import { useEffect, useState } from 'react';
import type { AppSpec, Change, CrmRecord } from '../../shared/model.js';
import { SavedChangesSchema } from '../../shared/recovery-integrity.js';
import { api } from '../api.js';
import { madridDay } from '../task-display.js';
import { ErrorState, Skeleton } from '../ui/index.js';
import { euros } from './deal-insights.js';
import { BOARD_MAX_PAGES, readPages, type ListPage } from './pager.js';
import { journalNote, PERIOD_LABEL, periodRange, pipelineStats, type StatsPeriod } from './pipeline-stats.js';
import { recordListPath } from './useRecordList.js';

type Read = { key: string; deals: CrmRecord[]; changes: Change[]; complete: boolean } | { key: string; error: string };
const PERIODS = Object.keys(PERIOD_LABEL) as StatsPeriod[];
const percent = (value: number | null) => value === null ? '—' : Math.round(value * 100) + ' %';
const days = (value: number | null) => value === null ? '—' : Math.round(value) + (Math.round(value) === 1 ? ' día' : ' días');

/** F1 · Analítica del tablero de oportunidades: tasa de cierre, ciclo, conversión por etapa y dónde se pierden.
 *  Solo lee la copia local (oportunidades y diario de cambios); lo aproximado se dice como tal. */
export function PipelineStats({ spec, revision }: { spec: AppSpec; revision: string }) {
  const [read, setRead] = useState<Read | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [period, setPeriod] = useState<StatsPeriod>('quarter');
  const key = revision + ':' + attempt;
  useEffect(() => {
    const controller = new AbortController(), { signal } = controller;
    setRead(null);
    Promise.all([
      readPages((offset, limit, pageSignal) => api<ListPage>(recordListPath('deals', '', offset, '', limit), { signal: pageSignal }), signal, { maxPages: BOARD_MAX_PAGES, accept: record => record.entity === 'deals' }),
      api<{ changes?: unknown }>('/v2/changes', { signal }),
    ]).then(([deals, journal]) => {
      if (signal.aborted) return;
      const saved = SavedChangesSchema.safeParse(journal?.changes);
      if (!saved.success) throw Error('La copia no devolvió un historial de cambios legible.');
      setRead({ key, deals: deals.records, changes: saved.data, complete: deals.complete });
    }).catch(failure => { if (!signal.aborted) setRead({ key, error: failure instanceof Error ? failure.message : 'La consulta se interrumpió.' }); });
    return () => controller.abort();
  }, [key]);
  const current = read?.key === key ? read : null;
  const range = periodRange(period, madridDay(new Date()));
  const stats = current && 'deals' in current ? pipelineStats({ spec, deals: current.deals, changes: current.changes, ...range }) : null;
  const widest = stats ? Math.max(1, ...stats.conversion.map(item => item.entered)) : 1;
  const lostMax = stats ? Math.max(1, ...stats.lostByStage.map(item => item.count)) : 1;
  return <section className="gx-stats" aria-labelledby="gx-stats-title">
    <header className="gx-stats-head">
      <h2 id="gx-stats-title">Analítica del proceso</h2>
      <div className="gx-cool-days" role="group" aria-label="Periodo">{PERIODS.map(value => <button key={value} type="button" aria-pressed={period === value} onClick={() => setPeriod(value)}>{PERIOD_LABEL[value]}</button>)}</div>
    </header>
    {!current ? <Skeleton rows={3} label="Calculando con tus oportunidades y el diario de cambios…" />
      : 'error' in current ? <ErrorState title="No se pudo calcular la analítica" onAction={() => setAttempt(value => value + 1)}>{current.error}</ErrorState>
      : stats ? <>
        <dl className="gx-stats-figures">
          <div><dt>Tasa de cierre</dt><dd>{percent(stats.winRate)}</dd><span>{stats.won.count} ganadas · {stats.lost.count} perdidas</span></div>
          <div><dt>Ciclo medio</dt><dd>{days(stats.cycle.average)}</dd><span>{stats.cycle.sample ? 'De crear a ganar, en ' + (stats.cycle.sample === 1 ? '1 oportunidad' : stats.cycle.sample + ' oportunidades') : 'Sin oportunidades creadas y ganadas aquí'}</span></div>
          <div><dt>Importe medio ganado</dt><dd>{stats.won.average === null ? '—' : euros(stats.won.average)}</dd><span>{euros(stats.won.amount)} en total{stats.won.missingAmount ? ' · ' + stats.won.missingAmount + ' sin importe' : ''}</span></div>
          <div><dt>Cierres aproximados</dt><dd>{stats.won.approx + stats.lost.approx}</dd><span>Por la fecha de cierre, sin paso en el diario</span></div>
        </dl>
        <div className="gx-stats-cols">
          <section aria-labelledby="gx-conv-title">
            <h3 id="gx-conv-title">Conversión por etapa</h3>
            {stats.conversion.some(item => item.entered) ? <ol className="gx-stats-bars">{stats.conversion.map(item => <li key={item.stageId}>
              <span className="gx-stats-label">{item.label}</span>
              <span className="gx-stats-track" aria-hidden="true"><i style={{ width: (item.entered / widest * 100) + '%' }} /><b style={{ width: (item.advanced / widest * 100) + '%' }} /></span>
              <span className="gx-stats-value">{percent(item.rate)}<small>{item.advanced}/{item.entered}{item.lost ? ' · ' + item.lost + ' perdidas' : ''}</small></span>
            </li>)}</ol> : <p className="oc-empty-line">Nada entró en una etapa en este periodo según el diario.</p>}
          </section>
          <section aria-labelledby="gx-lost-title">
            <h3 id="gx-lost-title">Dónde se pierden</h3>
            {stats.lostByStage.length ? <ol className="gx-stats-bars" data-tone="danger">{stats.lostByStage.map(item => <li key={item.stageId ?? 'unknown'}>
              <span className="gx-stats-label">{item.label}</span>
              <span className="gx-stats-track" aria-hidden="true"><b style={{ width: (item.count / lostMax * 100) + '%' }} /></span>
              <span className="gx-stats-value">{item.count}</span>
            </li>)}</ol> : <p className="oc-empty-line ui-empty ui-empty-ok">Ninguna perdida en este periodo.</p>}
          </section>
        </div>
        <p className="gx-pipe-note">{journalNote(stats)}{current.complete ? '' : ' No se leyeron todas las oportunidades: las cifras pueden quedarse cortas.'}</p>
      </> : null}
  </section>;
}
