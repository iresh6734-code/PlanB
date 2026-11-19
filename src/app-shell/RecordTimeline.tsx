import { useEffect, useId, useState } from 'react';
import { changedFields, type HistoryField, type HistoryValue } from '../../shared/change-history.js';
import type { AppSpec, Change, CrmRecord } from '../../shared/model.js';
import { SavedChangesSchema } from '../../shared/recovery-integrity.js';
import { api } from '../api.js';
import { displayValue } from '../components.js';
import { ErrorState, Skeleton } from '../ui/index.js';

type Props = { spec: AppSpec; record: CrmRecord; records: CrmRecord[] };
type TimelineRead = { values: CrmRecord['values']; attempt: number } &
  ({ changes: Change[]; error?: never } | { error: string; changes?: never });
const historyDate = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

function isReadableDate(text: string, kind: 'date' | 'datetime'): boolean {
  const day = kind === 'date' ? text : text.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return false;
  const at = Date.parse(day);
  if (!Number.isFinite(at) || new Date(at).toISOString().slice(0, 10) !== day) return false;
  return kind === 'date' || (text[10] === 'T' && Number.isFinite(Date.parse(text)));
}

/** «Historial de esta ficha»: los cambios locales de este registro, del más reciente al más antiguo, con el nombre de cada campo
 *  y sus valores tal como se muestran en la app. Solo lee (`GET /v2/changes`). No incluye lo que cambió en el CRM de origen. */
export function RecordTimeline(props: Props) {
  return <TimelineForRecord key={JSON.stringify([props.record.entity, props.record.id])} {...props} />;
}

function TimelineForRecord({ spec, record, records }: Props) {
  const { entity: entityName, id, values } = record;
  const titleId = useId();
  const [read, setRead] = useState<TimelineRead | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [all, setAll] = useState(false);
  const { changes, error } = read?.values === values && read.attempt === attempt ? read : {};
  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    setRead(null);
    api<{ changes?: unknown }>('/v2/changes', { signal })
      .then(data => {
        if (signal.aborted) return;
        const saved = SavedChangesSchema.safeParse(data?.changes);
        if (!saved.success) throw Error('La copia no devolvió un historial legible.');
        const changes = saved.data.filter(change => change.entity === entityName && change.recordId === id).sort((a, b) => b.id - a.id);
        setRead({ values, attempt, changes });
      })
      .catch(failure => {
        if (!signal.aborted) setRead({ values, attempt, error: failure instanceof Error ? failure.message : 'La consulta se interrumpió.' });
      });
    return () => controller.abort();
  }, [entityName, id, values, attempt]);
  const entity = spec.entities.find(item => item.id === entityName);
  const show = (key: string, data: HistoryValue) => {
    if (!data.present) return 'Campo ausente';
    if (data.value === null) return 'Sin valor';
    if (data.value === '') return 'Texto vacío';
    const field = entity?.fields.find(item => item.key === key);
    const text = String(data.value);
    if (!field || ((field.type === 'date' || field.type === 'datetime') && !isReadableDate(text, field.type))) return text;
    return displayValue(data.value, field, records, spec) || text;
  };
  const label = (key: string) => entity?.fields.find(item => item.key === key)?.label ?? key;
  const when = (at: string) => isReadableDate(at, 'datetime') ? historyDate.format(new Date(at)) : 'Fecha no disponible';
  const line = (field: HistoryField, creating: boolean) => (
    <p key={field.key} className="gx-timeline-line"><span>{label(field.key)}</span>{' '}
      {!creating ? <>{show(field.key, field.before)} <b aria-label="pasa a">→</b>{' '}</> : null}
      {show(field.key, field.after)}
    </p>
  );
  const shown = changes ? (all ? changes : changes.slice(0, 5)) : [];
  return <section className="gx-timeline" aria-labelledby={titleId}>
    <h3 id={titleId}>Historial de esta ficha</h3>
    {error ? <ErrorState title="No se pudo leer el historial" onAction={() => setAttempt(value => value + 1)}>{error}</ErrorState>
      : !changes ? <Skeleton rows={2} label="Leyendo el historial…" />
      : !changes.length ? <p className="gx-related-note">Sin cambios locales: la ficha está como llegó en la copia.</p>
      : <ol>{shown.map(change => {
        const fields = changedFields(change);
        const creating = change.operation === 'create';
        const more = creating ? fields : fields.slice(4);
        return <li key={change.id}>
          <p className="gx-timeline-head"><strong>{creating ? 'Alta en la copia local' : 'Edición local'}</strong><time dateTime={change.at}>{when(change.at)}</time></p>
          {!fields.length ? <p className="gx-timeline-line">Guardado sin diferencias.</p> : null}
          {!creating ? fields.slice(0, 4).map(field => line(field, false)) : null}
          {more.length ? <details>
            <summary className="text-button">{creating ? 'Ver campos iniciales (' + more.length + ')' : 'Ver ' + more.length + (more.length === 1 ? ' campo más' : ' campos más')}</summary>
            <div style={{ paddingTop: 6 }}>{more.map(field => line(field, creating))}</div>
          </details> : null}
        </li>;
      })}</ol>}
    {changes && changes.length > 5 ? <button type="button" className="text-button" onClick={() => setAll(value => !value)}>{all ? 'Ver menos' : 'Ver los ' + changes.length + ' cambios'}</button> : null}
  </section>;
}
