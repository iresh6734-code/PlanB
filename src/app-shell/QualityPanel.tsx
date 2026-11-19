import { useEffect, useId, useState } from 'react';
import type { AppSpec, CrmRecord } from '../../shared/model.js';
import { api } from '../api.js';
import { ErrorState, Skeleton } from '../ui/index.js';
import { loadQuality, type QualityReport } from './quality.js';
import { recordListPath } from './useRecordList.js';

const KIND: Record<string, string> = { required: 'Incompleto', email: 'Correo', duplicate: 'Duplicado', dangling: 'Relación rota' };
type QualityRead = { spec: AppSpec; revision: unknown; attempt: number } &
  ({ report: QualityReport; error?: never } | { error: string; report?: never });

/** «Calidad de los datos» en Inicio: avisos de forma sobre la copia local, cada uno con acceso a su ficha. Solo lee. */
export function QualityPanel({ spec, revision, onOpen }: { spec: AppSpec; revision: unknown; onOpen: (record: CrmRecord) => void }) {
  const titleId = useId();
  const [read, setRead] = useState<QualityRead | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [all, setAll] = useState(false);
  const current = read?.spec === spec && Object.is(read.revision, revision) && read.attempt === attempt ? read : null;
  const {report,error} = current ?? {};
  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    const context = { spec, revision, attempt };
    setRead(null);
    setAll(false);
    loadQuality(spec, (entity, offset, limit) => api(recordListPath(entity, '', offset, '', limit), {signal}), signal)
      .then(report => { if (!signal.aborted) setRead({...context,report}); })
      .catch(failure => {
        if (!signal.aborted) setRead({...context,error:failure instanceof Error ? failure.message : 'La lectura se interrumpió.'});
      });
    return () => controller.abort();
  }, [spec, revision, attempt]);
  const retry = () => setAttempt(value => value+1);
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
    {error ? <ErrorState title="No se pudo revisar la copia" onAction={retry}>{error}</ErrorState>
      : !report ? <Skeleton rows={3} label="Revisando la copia…" />
      : !issueCount ? <p className="oc-muted">{report.scanned ? 'No se encontraron avisos en los registros revisados.'
        : report.complete ? 'No hay registros que revisar en esta copia.' : 'No se pudieron revisar registros.'}</p>
      : <><ul className="gx-quality-list">{shown.map(issue => <li key={JSON.stringify([issue.record.entity,issue.record.id,issue.field,issue.kind])}><button type="button" onClick={() => onOpen(issue.record)}>
          <span className="gx-quality-kind" data-kind={issue.kind}>{KIND[issue.kind]}</span><strong>{name(issue.record)}</strong><small>{entityLabel(issue.record)} · {issue.text}</small></button></li>)}</ul>
        {report.issues.length > 5 ? <button type="button" className="oc-link" onClick={() => setAll(value => !value)}>{all ? 'Ver menos' : 'Ver los ' + report.issues.length}</button> : null}</>}
    {report?.unstable ? <div className="gx-quality-note">
      <p className="oc-muted">Se revisaron {report.scanned} registros únicos. La información recibida no permite confirmar la cobertura.</p>
      <button type="button" className="oc-link" onClick={retry}>Revisar otra vez</button>
    </div> : report && !report.complete ? <p className="oc-muted gx-quality-note">Revisados {report.scanned} de {report.total} registros: puede haber más avisos.</p> : null}
  </article>;
}
