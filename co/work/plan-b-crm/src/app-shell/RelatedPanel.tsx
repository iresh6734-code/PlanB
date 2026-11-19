import { useEffect, useState } from 'react';
import type { AppSpec, CrmRecord } from '../../shared/model.js';
import { api } from '../api.js';
import { displayValue, recordName } from '../components.js';
import { Skeleton } from '../ui/index.js';
import { loadRelated, type RelatedGroup } from './related.js';

/** «Relacionado»: los registros que apuntan a la ficha abierta (sus tareas, sus oportunidades, sus contactos…).
 *  Solo lee de la copia local. Si hay más registros de los que revisa, lo dice. */
export function RelatedPanel({ spec, record, dirty, onOpen }: { spec: AppSpec; record: CrmRecord; dirty: boolean; onOpen: (record: CrmRecord) => void }) {
  const [groups, setGroups] = useState<RelatedGroup[] | null>(null), [error, setError] = useState('');
  useEffect(() => {
    let active = true; setGroups(null); setError('');
    loadRelated(spec, record, (entity, offset, limit) => api('/v2/records/' + entity + '?q=&offset=' + offset + '&limit=' + limit + '&pipeline='))
      .then(result => { if (active) setGroups(result); })
      .catch(failure => { if (active) setError(failure instanceof Error ? failure.message : 'No se pudo leer lo relacionado.'); });
    return () => { active = false; };
  }, [spec, record.entity, record.id]);
  const open = (target: CrmRecord) => { if (!dirty || confirm('Esta ficha tiene cambios sin guardar que se perderán. ¿Abrir «' + recordName(target, spec) + '»?')) onOpen(target); };
  const detail = (target: CrmRecord) => {
    const entity = spec.entities.find(item => item.id === target.entity); if (!entity) return '';
    return entity.columns.map(key => entity.fields.find(field => field.key === key)).filter(field => field && field.key !== entity.displayField && field.type !== 'reference' && field.type !== 'text' && field.type !== 'email')
      .slice(0, 2).map(field => displayValue(target.values[field!.key], field!, [], spec)).filter(Boolean).join(' · ');
  };
  if (groups && !groups.length) return null;
  return <section className="gx-related" aria-labelledby="gx-related-title">
    <h3 id="gx-related-title">Relacionado</h3>
    {error ? <p className="gx-related-note" role="alert">{error}</p> : !groups ? <Skeleton rows={3} label="Leyendo lo relacionado…" /> : groups.map(group => <div key={group.entity + ':' + group.fieldKey} className="gx-related-group">
      <h4>{group.label}<span>{group.records.length}</span>{groups.filter(other => other.entity === group.entity).length > 1 ? <small>como {group.fieldLabel.toLowerCase()}</small> : null}</h4>
      {group.records.length ? <ul>{group.records.slice(0, 8).map(item => <li key={item.id}><button type="button" onClick={() => open(item)}><strong>{recordName(item, spec)}</strong><span>{detail(item)}</span></button></li>)}</ul>
        : <p className="gx-related-note">Ninguno.</p>}
      {group.records.length > 8 ? <p className="gx-related-note">Y {group.records.length - 8} más.</p> : null}
      {group.scanned < group.total ? <p className="gx-related-note">Revisados los primeros {group.scanned} de {group.total}: puede haber más.</p> : null}
    </div>)}
  </section>;
}
