import { useEffect, useState } from 'react';
import type { AppSpec, CrmRecord } from '../../shared/model.js';
import { api } from '../api.js';
import { displayValue, recordName } from '../components.js';
import { ErrorState, InlineConfirm, Skeleton } from '../ui/index.js';
import { madridDay } from '../task-display.js';
import { accountHealth } from './account-health.js';
import { loadRelated, type RelatedGroup } from './related.js';
import { recordListPath } from './useRecordList.js';

type RelatedRead = {
  spec: AppSpec;
  entity: CrmRecord['entity'];
  id: string;
  attempt: number;
} & ({ groups: RelatedGroup[]; error?: never } | { error: string; groups?: never });

/** «Relacionado»: los registros que apuntan a la ficha abierta (sus tareas, sus oportunidades, sus contactos…).
 *  Solo lee de la copia local. Si hay más registros de los que revisa, lo dice. */
export function RelatedPanel({ spec, record, dirty, onOpen }: { spec: AppSpec; record: CrmRecord; dirty: boolean; onOpen: (record: CrmRecord) => void }) {
  const [read, setRead] = useState<RelatedRead | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [pending, setPending] = useState<CrmRecord | null>(null);
  const { entity, id } = record;
  const current = read?.spec === spec && read.entity === entity && read.id === id && read.attempt === attempt ? read : null;
  const groups = current?.groups;
  const error = current?.error;
  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    const target = { spec, entity, id, attempt };
    setRead(null); setPending(null);
    loadRelated(spec, { entity, id }, (source, offset, limit) => api(recordListPath(source, '', offset, '', limit), { signal }), signal)
      .then(groups => { if (!signal.aborted) setRead({ ...target, groups }); })
      .catch(failure => {
        if (!signal.aborted) setRead({ ...target, error: failure instanceof Error ? failure.message : 'La consulta se interrumpió.' });
      });
    return () => controller.abort();
  }, [spec, entity, id, attempt]);
  const open = (target: CrmRecord) => { if (dirty) setPending(target); else onOpen(target); };
  const detail = (target: CrmRecord) => {
    const entity = spec.entities.find(item => item.id === target.entity); if (!entity) return '';
    return entity.columns.map(key => entity.fields.find(field => field.key === key)).filter(field => field && field.key !== entity.displayField && field.type !== 'reference' && field.type !== 'text' && field.type !== 'email')
      .slice(0, 2).map(field => displayValue(target.values[field!.key], field!, [], spec)).filter(Boolean).join(' · ');
  };
  if (groups && !groups.length) return null;
  const health = groups && (entity === 'companies' || entity === 'contacts') ? accountHealth(spec, record, groups, madridDay(new Date())) : null;
  const filled = health ? { good: 3, watch: 2, risk: 1 }[health.level] : 0;
  return <section className="gx-related" aria-labelledby="gx-related-title">
    <h3 id="gx-related-title">Relacionado</h3>
    {health ? <div className="gx-health" data-level={health.level}>
      <p className="gx-health-head"><span className="gx-health-meter" aria-hidden="true">{[1, 2, 3].map(n => <i key={n} data-on={n <= filled ? 'true' : undefined} />)}</span>
        <strong>{health.headline}</strong></p>
      {health.reasons.length ? <ul>{health.reasons.map(item => <li key={item.text} data-tone={item.tone}>{item.text}</li>)}</ul> : null}
      {health.partial ? <p className="gx-related-note">Valorada con los registros revisados; puede haber más.</p> : null}
    </div> : null}
    {pending && dirty ? <InlineConfirm id="gx-related-leave" question={<>Esta ficha tiene cambios sin guardar que se perderán. ¿Abrir «{recordName(pending, spec)}» de todos modos?</>} confirmLabel="Abrir sin guardar" onConfirm={() => { const target = pending; setPending(null); onOpen(target); }} onCancel={() => setPending(null)} /> : null}
    {error ? <ErrorState title="No se pudieron leer las relaciones" onAction={() => setAttempt(value => value + 1)}>{error}</ErrorState> : !groups ? <Skeleton rows={3} label="Leyendo lo relacionado…" /> : groups.map(group => <div key={group.entity + ':' + group.fieldKey} className="gx-related-group">
      <h4>{group.label}<span>{group.records.length}</span>{groups.filter(other => other.entity === group.entity).length > 1 ? <small>como {group.fieldLabel.toLowerCase()}</small> : null}</h4>
      {group.records.length ? <ul>{group.records.slice(0, 8).map(item => <li key={item.id}><button type="button" onClick={() => open(item)}><strong>{recordName(item, spec)}</strong><span>{detail(item)}</span></button></li>)}</ul>
        : <p className="gx-related-note">Ninguno.</p>}
      {group.records.length > 8 ? <p className="gx-related-note">Y {group.records.length - 8} más.</p> : null}
      {group.scanned < group.total ? <p className="gx-related-note">Revisados los primeros {group.scanned} de {group.total}: puede haber más.</p> : null}
    </div>)}
  </section>;
}
