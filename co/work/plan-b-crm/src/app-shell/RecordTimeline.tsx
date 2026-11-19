import { useEffect, useState } from 'react';
import { changedFields, type HistoryValue } from '../../shared/change-history.js';
import type { AppSpec, Change, CrmRecord } from '../../shared/model.js';
import { api } from '../api.js';
import { displayValue } from '../components.js';
import { Skeleton } from '../ui/index.js';

/** «Historial de esta ficha»: los cambios locales de este registro, del más reciente al más antiguo, con el nombre de cada campo
 *  y sus valores tal como se muestran en la app. Solo lee (`GET /v2/changes`). No incluye lo que cambió en el CRM de origen. */
export function RecordTimeline({ spec, record, records }: { spec: AppSpec; record: CrmRecord; records: CrmRecord[] }) {
  const [changes, setChanges] = useState<Change[] | null>(null), [error, setError] = useState(''), [all, setAll] = useState(false);
  useEffect(() => {
    let active = true; setChanges(null); setError('');
    api<{ changes: Change[] }>('/v2/changes').then(data => { if (active) setChanges(data.changes.filter(change => change.entity === record.entity && change.recordId === record.id).sort((a, b) => b.id - a.id)); })
      .catch(failure => { if (active) setError(failure instanceof Error ? failure.message : 'No se pudo leer el historial.'); });
    return () => { active = false; };
  }, [record.entity, record.id, record.values]);
  const entity = spec.entities.find(item => item.id === record.entity);
  const show = (key: string, data: HistoryValue) => {
    if (!data.present || data.value === null || data.value === '') return '—';
    const field = entity?.fields.find(item => item.key === key);
    return field ? displayValue(data.value, field, records, spec) || String(data.value) : String(data.value);
  };
  const label = (key: string) => entity?.fields.find(item => item.key === key)?.label ?? key;
  const when = (at: string) => Number.isNaN(Date.parse(at)) ? 'Fecha no disponible' : new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(at));
  const shown = changes ? (all ? changes : changes.slice(0, 5)) : [];
  return <section className="gx-timeline" aria-labelledby="gx-timeline-title">
    <h3 id="gx-timeline-title">Historial de esta ficha</h3>
    {error ? <p className="gx-related-note" role="alert">{error}</p>
      : !changes ? <Skeleton rows={2} label="Leyendo el historial…" />
      : !changes.length ? <p className="gx-related-note">Sin cambios locales: la ficha está como llegó en la copia.</p>
      : <ol>{shown.map(change => { const fields = changedFields(change); return <li key={change.id}>
          <p className="gx-timeline-head"><strong>{change.operation === 'create' ? 'Alta en la copia local' : 'Edición local'}</strong><time dateTime={change.at}>{when(change.at)}</time></p>
          {change.operation === 'create' ? <p className="gx-timeline-line">{fields.length} {fields.length === 1 ? 'campo' : 'campos'}</p>
            : fields.length ? fields.slice(0, 4).map(field => <p key={field.key} className="gx-timeline-line"><span>{label(field.key)}</span> {show(field.key, field.before)} <b aria-label="pasa a">→</b> {show(field.key, field.after)}</p>)
            : <p className="gx-timeline-line">Guardado sin diferencias.</p>}
          {fields.length > 4 && change.operation !== 'create' ? <p className="gx-timeline-line">y {fields.length - 4} campos más</p> : null}
        </li>; })}</ol>}
    {changes && changes.length > 5 ? <button type="button" className="text-button" onClick={() => setAll(value => !value)}>{all ? 'Ver menos' : 'Ver los ' + changes.length + ' cambios'}</button> : null}
  </section>;
}
