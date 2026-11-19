import { ArrowLeftRight } from 'lucide-react';
import { useEffect, useId, useState } from 'react';
import type { EntityName } from '../../shared/model.js';
import { Modal } from '../components.js';
import { ApiError, api, post } from '../api.js';
import { ErrorState, Skeleton } from '../ui/index.js';
import { mergePreviewPath, parsePreview, type MergePreview } from './merge-client.js';
import './merge.css';

type Props = { entity: EntityName; keeperId: string; duplicateId: string; close: () => void; onDone: (wrote: boolean) => void };
type Read = { key: string; preview?: MergePreview; error?: string };
const REASON = { readonly: 'Solo lectura', empty: 'Vacío en el duplicado' } as const;

/** F8 «Fusionar duplicados»: el usuario elige, campo a campo, qué dato se queda. La ficha apartada no se borra ni se envía. */
export function MergeDialog({ entity, keeperId, duplicateId, close, onDone }: Props) {
  const ids = useId();
  const [pair, setPair] = useState({ keeper: keeperId, duplicate: duplicateId });
  const [attempt, setAttempt] = useState(0);
  const [read, setRead] = useState<Read | null>(null);
  const [take, setTake] = useState<ReadonlySet<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<{ text: string; stale: boolean } | null>(null);
  const key = pair.keeper + '|' + pair.duplicate + '|' + attempt;
  useEffect(() => {
    const controller = new AbortController();
    setTake(new Set()); setFailure(null);
    api<unknown>(mergePreviewPath(entity, pair.keeper, pair.duplicate), { signal: controller.signal })
      .then(body => { if (!controller.signal.aborted) setRead({ key, preview: parsePreview(body) }); })
      .catch(error => { if (!controller.signal.aborted) setRead({ key, error: error instanceof Error ? error.message : 'No se pudieron comparar las fichas.' }); });
    return () => controller.abort();
  }, [entity, pair.keeper, pair.duplicate, attempt]);
  const current = read?.key === key ? read : null;
  const preview = current?.preview ?? null;
  const reload = () => setAttempt(value => value + 1);
  const swap = () => setPair(value => ({ keeper: value.duplicate, duplicate: value.keeper }));
  const choose = (field: string, fromDuplicate: boolean) => setTake(value => { const next = new Set(value); if (fromDuplicate) next.add(field); else next.delete(field); return next; });
  const submit = async () => {
    if (!preview || busy) return;
    setBusy(true); setFailure(null);
    try {
      const result = await post<{ change?: unknown }>('/v2/records/merge', {
        entity, keeperId: preview.keeper.id, duplicateId: preview.duplicate.id,
        take: preview.fields.filter(field => take.has(field.key)).map(field => field.key), seen: preview.seen,
      });
      onDone(result?.change != null);
      close();
    } catch (error) {
      setFailure({ text: error instanceof Error ? error.message : 'No se pudo fusionar.', stale: error instanceof ApiError && error.status === 409 });
      setBusy(false);
    }
  };
  const count = take.size;
  return <Modal title="Fusionar duplicados" close={close} wide confirmClose={() => !busy}>
    <div className="modal-body gx-merge">
      {current?.error ? <ErrorState title="No se pudieron comparar las fichas" onAction={reload}>{current.error}</ErrorState>
        : !preview ? <Skeleton rows={4} label="Comparando las dos fichas…" />
        : <>
          <div className="gx-merge-pair">
            <div className="gx-merge-card" data-role="keeper"><small>Se queda</small><strong title={preview.keeper.label}>{preview.keeper.label}</strong></div>
            <button type="button" className="icon-button gx-merge-swap" aria-label="Cambiar cuál se queda" title="Cambiar cuál se queda" onClick={swap} disabled={busy}><ArrowLeftRight size={16} /></button>
            <div className="gx-merge-card" data-role="duplicate"><small>Se aparta</small><strong title={preview.duplicate.label}>{preview.duplicate.label}</strong></div>
          </div>
          {preview.fields.length ? <div className="gx-merge-grid">
            <div className="gx-merge-head" aria-hidden="true"><span>Campo</span><span>Se queda</span><span>Del duplicado</span></div>
            {preview.fields.map(field => { const label = ids + field.key; return <div key={field.key} className="gx-merge-row" role="radiogroup" aria-labelledby={label}>
              <span id={label} className="gx-merge-key">{field.label}</span>
              <label className="gx-merge-opt"><input type="radio" name={ids + 'm-' + field.key} checked={!take.has(field.key)} onChange={() => choose(field.key, false)} disabled={busy} /><span>{field.keeperText || '—'}</span></label>
              <label className="gx-merge-opt" data-off={field.choosable ? undefined : 'true'}><input type="radio" name={ids + 'm-' + field.key} checked={take.has(field.key)} onChange={() => choose(field.key, true)} disabled={busy || !field.choosable} />
                <span>{field.duplicateText || '—'}{field.reason ? <small>{REASON[field.reason]}</small> : null}</span></label>
            </div>; })}
          </div> : <p className="gx-merge-same">Las dos fichas tienen los mismos datos: solo queda apartar el duplicado.</p>}
          <p className="gx-merge-note">La ficha apartada no se borra ni se envía a HubSpot: queda en «Calidad de los datos» para que la fusiones allí a mano. Sus tareas y oportunidades siguen enlazadas a ella. Puedes deshacerlo desde la misma lista.</p>
          {failure ? <div className="gx-merge-fail" role="alert"><p>{failure.text}</p>{failure.stale ? <button type="button" className="oc-link" onClick={reload}>Volver a comparar</button> : null}</div> : null}
        </>}
    </div>
    <footer className="modal-footer">
      <button type="button" className="button" onClick={close} disabled={busy}>Cancelar</button>
      <button type="button" className="button primary" disabled={!preview || busy} onClick={() => void submit()}>{count ? 'Fusionar y traer ' + count + (count === 1 ? ' dato' : ' datos') : 'Apartar el duplicado'}</button>
    </footer>
  </Modal>;
}
