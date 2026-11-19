import { GitMerge } from 'lucide-react';
import { useEffect, useId, useState } from 'react';
import type { AppSpec, CrmRecord, EntityName } from '../../shared/model.js';
import { ApiError, api, post } from '../api.js';
import { madridDay } from '../task-display.js';
import { ErrorState, Skeleton } from '../ui/index.js';
import { MergeDialog } from './lazy-pages.js';
import { MERGES_PATH, mergeActionPath, parseMerges, setAsideKeys, type MergeView } from './merge-client.js';
import { loadQuality, type QualityReport } from './quality.js';
import { addPoint, parseHistory, pointFrom, serializeHistory, sparkPoints, TREND_KEY, trendOf, type QualityPoint, type QualityTrend } from './quality-trend.js';
import { recordListPath } from './useRecordList.js';

const KIND: Record<string, string> = { required: 'Incompleto', email: 'Correo', duplicate: 'Duplicado', dangling: 'Relación rota' };
const shortDay = (day: string) => day.slice(8, 10) + '/' + day.slice(5, 7);
const deltaText = (trend: QualityTrend) => (trend.delta > 0 ? '+' + trend.delta + ' pts' : trend.delta < 0 ? '−' + -trend.delta + ' pts' : 'igual') + ' desde el ' + shortDay(trend.since);
const storage = () => { try { return globalThis.localStorage ?? null; } catch { return null; } };
type QualityRead = { spec: AppSpec; revision: unknown; attempt: number } &
  ({ report: QualityReport; merges: MergeView[] | null; error?: never } | { error: string; report?: never; merges?: never });
type Notice = { text: string; id?: string; stuck?: boolean };

/** «Calidad de los datos» en Inicio: avisos de forma sobre la copia local, cada uno con acceso a su ficha. Solo lee,
 *  salvo «Fusionar» (F8), que trae datos del duplicado a la ficha que se queda y aparta el duplicado sin borrarlo. */
export function QualityPanel({ spec, revision, onOpen, onChanged }: { spec: AppSpec; revision: unknown; onOpen: (record: CrmRecord) => void; onChanged?: () => void }) {
  const titleId = useId();
  const [read, setRead] = useState<QualityRead | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [all, setAll] = useState(false);
  const [merging, setMerging] = useState<{ entity: EntityName; keeperId: string; duplicateId: string } | null>(null);
  const [acting, setActing] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const current = read?.spec === spec && Object.is(read.revision, revision) && read.attempt === attempt ? read : null;
  const {report,error,merges} = current ?? {};
  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    const context = { spec, revision, attempt };
    setRead(null);
    setAll(false);
    // Los apartados se leen antes: no cuentan como duplicado. Si no se pueden leer, la revisión sigue sin ellos.
    const ledger = api<unknown>(MERGES_PATH, {signal}).then(parseMerges).catch(failure => { if (signal.aborted) throw failure; return null; });
    ledger.then(list => loadQuality(spec, (entity, offset, limit) => api(recordListPath(entity, '', offset, '', limit), {signal}), signal, list ? setAsideKeys(list) : undefined).then(report => ({report, merges: list})))
      .then(result => { if (!signal.aborted) setRead({...context,...result}); })
      .catch(failure => {
        if (!signal.aborted) setRead({...context,error:failure instanceof Error ? failure.message : 'La lectura se interrumpió.'});
      });
    return () => controller.abort();
  }, [spec, revision, attempt]);
  const retry = () => setAttempt(value => value+1);
  const changed = (wrote: boolean) => { if (wrote && onChanged) onChanged(); else retry(); };
  const act = async (merge: MergeView, action: 'undo' | 'release') => {
    setActing(merge.id); setNotice(null);
    try {
      const result = await post<{ change?: unknown }>(mergeActionPath(merge.id, action), {});
      setNotice({ text: action === 'undo' ? 'Fusión deshecha: «' + merge.keeperLabel + '» recupera sus datos.' : '«' + merge.duplicateLabel + '» ya no está apartada.' });
      changed(result?.change != null);
    } catch (failure) {
      setNotice({ id: merge.id, text: failure instanceof Error ? failure.message : 'No se pudo completar.', stuck: failure instanceof ApiError && failure.status === 409 });
    } finally { setActing(null); }
  };
  const [history, setHistory] = useState<QualityPoint[]>([]);
  // Solo una revisión completa y estable deja punto en la tendencia; una parcial mediría otra cosa.
  useEffect(() => {
    const store = storage();
    const raw = store?.getItem(TREND_KEY) ?? null;
    const saved = parseHistory(raw, spec.title);
    if (!report?.completeness?.length || !report.complete || report.unstable) { setHistory(saved); return; }
    const next = addPoint(saved, pointFrom(madridDay(new Date()), report.completeness));
    try { store?.setItem(TREND_KEY, serializeHistory(raw, spec.title, next)); } catch { /* sin espacio: la tendencia se ve igual en esta sesión */ }
    setHistory(next);
  }, [report, spec.title]);
  const name = (record: CrmRecord) => { const entity = spec.entities.find(item => item.id === record.entity); return (String(record.values[entity?.displayField ?? ''] || record.id) + (record.entity === 'contacts' && record.values.lastname ? ' ' + record.values.lastname : '')).trim(); };
  const entityLabel = (record: CrmRecord) => spec.entities.find(item => item.id === record.entity)?.singular ?? record.entity;
  const shown = report ? (all ? report.issues : report.issues.slice(0, 5)) : [];
  const issueCount = report?.issues.length ?? 0;
  return <article className="oc-card oc-side-card gx-quality" aria-labelledby={titleId}>
    <div className="oc-side-head"><h2 id={titleId}>Calidad de los datos</h2>
      {report ? <span className="oc-chip" data-tone={issueCount || !report.complete ? 'warn' : 'ok'}>
        {issueCount ? issueCount + (issueCount === 1 ? ' aviso' : ' avisos')
          : !report.complete ? (report.unstable ? 'Cobertura sin confirmar' : 'Revisión parcial')
          : report.scanned ? 'Sin avisos' : 'Sin registros'}
      </span> : null}
    </div>
    {report?.completeness?.length ? <div className="gx-qc">
      <p className="gx-qc-head">Registros completos{report.complete ? '' : ' (sobre los revisados)'}</p>
      <ul>{report.completeness.map(row => { const trend = trendOf(history, row.entity); return <li key={row.entity}>
        <span className="gx-qc-name">{row.label}</span>
        <span className="gx-qc-bar" aria-hidden="true"><i style={{ width: row.pct + '%' }} /></span>
        <strong>{row.pct} %</strong>
        {trend ? <svg className="gx-qc-spark" viewBox="0 0 48 16" preserveAspectRatio="none" aria-hidden="true"><polyline points={sparkPoints(trend.series, 48, 16)} /></svg> : <span className="gx-qc-spark" aria-hidden="true" />}
        <small>{row.complete} de {row.total}{row.gap ? ' · falta más: ' + row.gap.label.toLowerCase() + ' (' + row.gap.missing + ')' : ''}
          {trend ? <> · <span className="gx-qc-delta" data-dir={trend.delta > 0 ? 'up' : trend.delta < 0 ? 'down' : 'flat'}>{deltaText(trend)}</span></> : null}</small>
      </li>; })}</ul>
      {history.length < 2 && report.complete && !report.unstable ? <p className="oc-muted gx-quality-note">La tendencia aparece cuando revises la copia otro día. Se guarda solo en este navegador.</p> : null}
    </div> : null}
    {error ? <ErrorState title="No se pudo revisar la copia" onAction={retry}>{error}</ErrorState>
      : !report ? <Skeleton rows={3} label="Revisando la copia…" />
      : !issueCount ? <p className="oc-muted">{report.scanned ? 'No se encontraron avisos en los registros revisados.'
        : report.complete ? 'No hay registros que revisar en esta copia.' : 'No se pudieron revisar registros.'}</p>
      : <><ul className="gx-quality-list">{shown.map(issue => { const other = issue.kind === 'duplicate' && merges ? issue.other : undefined; return <li key={JSON.stringify([issue.record.entity,issue.record.id,issue.field,issue.kind])} className={other ? 'has-merge' : undefined}><button type="button" onClick={() => onOpen(issue.record)}>
          <span className="gx-quality-kind" data-kind={issue.kind}>{KIND[issue.kind]}</span><strong>{name(issue.record)}</strong><small>{entityLabel(issue.record)} · {issue.text}</small></button>
          {other ? <button type="button" className="gx-quality-merge" aria-label={'Fusionar «' + name(issue.record) + '» con «' + name(other) + '»'} onClick={() => setMerging({ entity: issue.record.entity, keeperId: other.id, duplicateId: issue.record.id })}><GitMerge size={14} aria-hidden="true" />Fusionar</button> : null}</li>; })}</ul>
        {report.issues.length > 5 ? <button type="button" className="oc-link" onClick={() => setAll(value => !value)}>{all ? 'Ver menos' : 'Ver los ' + report.issues.length}</button> : null}</>}
    {merges?.length ? <section className="gx-merge-aside" aria-label="Duplicados apartados">
      <p className="gx-qc-head">Apartados · pendientes de fusionar en HubSpot</p>
      <ul className="gx-merge-list">{merges.map(merge => <li key={merge.id}>
        <div><strong title={merge.duplicateLabel}>{merge.duplicateLabel}</strong>
          <small>se queda «{merge.keeperLabel}»{merge.fields.length ? ' · trajo ' + merge.fields.join(', ').toLowerCase() : ''}</small></div>
        <span className="gx-merge-acts">
          <button type="button" className="oc-link" disabled={!!acting} onClick={() => void act(merge, 'undo')}>{acting === merge.id ? 'Deshaciendo…' : 'Deshacer'}</button>
          {notice?.stuck && notice.id === merge.id ? <button type="button" className="oc-link" disabled={!!acting} onClick={() => void act(merge, 'release')}>Dejar de apartar</button> : null}
        </span>
      </li>)}</ul>
    </section> : null}
    {notice ? <p className="oc-muted gx-quality-note" role="status">{notice.text}</p> : null}
    {merging ? <MergeDialog {...merging} close={() => setMerging(null)} onDone={wrote => { setNotice(null); changed(wrote); }} /> : null}
    {report?.unstable ? <div className="gx-quality-note">
      <p className="oc-muted">Se revisaron {report.scanned} registros únicos. La información recibida no permite confirmar la cobertura.</p>
      <button type="button" className="oc-link" onClick={retry}>Revisar otra vez</button>
    </div> : report && !report.complete ? <p className="oc-muted gx-quality-note">Revisados {report.scanned} de {report.total} registros: puede haber más avisos.</p> : null}
  </article>;
}
