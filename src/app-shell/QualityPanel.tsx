import { useEffect, useState } from 'react';
import type { AppSpec, CrmRecord } from '../../shared/model.js';
import { api } from '../api.js';
import { Skeleton } from '../ui/index.js';
import { loadQuality, type QualityReport } from './quality.js';

const KIND: Record<string, string> = { required: 'Incompleto', email: 'Correo', duplicate: 'Duplicado', dangling: 'Relación rota' };

/** «Calidad de los datos» en Inicio: avisos de forma sobre la copia local, cada uno con acceso a su ficha. Solo lee. */
export function QualityPanel({ spec, revision, onOpen }: { spec: AppSpec; revision: unknown; onOpen: (record: CrmRecord) => void }) {
  const [report, setReport] = useState<QualityReport | null>(null), [error, setError] = useState(''), [all, setAll] = useState(false);
  useEffect(() => {
    let active = true; setError('');
    loadQuality(spec, (entity, offset, limit) => api('/v2/records/' + entity + '?q=&offset=' + offset + '&limit=' + limit + '&pipeline='))
      .then(result => { if (active) setReport(result); })
      .catch(failure => { if (active) setError(failure instanceof Error ? failure.message : 'No se pudo revisar la copia.'); });
    return () => { active = false; };
  }, [spec, revision]);
  const name = (record: CrmRecord) => { const entity = spec.entities.find(item => item.id === record.entity); return (String(record.values[entity?.displayField ?? ''] || record.id) + (record.entity === 'contacts' && record.values.lastname ? ' ' + record.values.lastname : '')).trim(); };
  const entityLabel = (record: CrmRecord) => spec.entities.find(item => item.id === record.entity)?.singular ?? record.entity;
  const shown = report ? (all ? report.issues : report.issues.slice(0, 5)) : [];
  return <article className="oc-card oc-side-card gx-quality" aria-labelledby="gx-quality-title">
    <div className="oc-side-head"><h2 id="gx-quality-title">Calidad de los datos</h2>{report ? <span className="oc-chip" data-tone={report.issues.length ? 'warn' : 'ok'}>{report.issues.length ? report.issues.length + (report.issues.length === 1 ? ' aviso' : ' avisos') : 'Sin avisos'}</span> : null}</div>
    {error ? <p className="oc-muted" role="alert">{error}</p>
      : !report ? <Skeleton rows={3} label="Revisando la copia…" />
      : !report.issues.length ? <p className="oc-muted">Ni campos obligatorios vacíos, ni correos mal escritos, ni duplicados, ni relaciones rotas en los {report.scanned} registros revisados.</p>
      : <><ul className="gx-quality-list">{shown.map(issue => <li key={issue.record.entity + issue.record.id + issue.field + issue.kind}><button type="button" onClick={() => onOpen(issue.record)}>
          <span className="gx-quality-kind" data-kind={issue.kind}>{KIND[issue.kind]}</span><strong>{name(issue.record)}</strong><small>{entityLabel(issue.record)} · {issue.text}</small></button></li>)}</ul>
        {report.issues.length > 5 ? <button type="button" className="oc-link" onClick={() => setAll(value => !value)}>{all ? 'Ver menos' : 'Ver los ' + report.issues.length}</button> : null}</>}
    {report && !report.complete ? <p className="oc-muted gx-quality-note">Revisados {report.scanned} de {report.total} registros: puede haber más avisos.</p> : null}
  </article>;
}
