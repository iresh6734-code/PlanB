import { Check, Copy } from 'lucide-react';
import { useEffect, useId, useState } from 'react';
import type { HistoryValue } from '../../shared/change-history.js';
import type { CrmRecord, EntityName } from '../../shared/model.js';
import { api } from '../api.js';
import { ErrorState, Skeleton } from '../ui/index.js';
import { captureLabel, copyText, parseThen, thenPath, type CaptureRef, type ThenRead } from './record-history.js';
import './record-then.css';

type Props = {
  entity: EntityName; id: string; values: CrmRecord['values'];
  label: (key: string) => string; show: (key: string, value: HistoryValue) => string; onClose: () => void;
};
type Read = { values: CrmRecord['values']; capture: string; attempt: number } &
  ({ data: ThenRead; error?: never } | { error: string; data?: never });

/** R3 «Ver cómo estaba»: elige una captura conservada y enseña campo a campo entonces → ahora. Solo lee; nunca restaura. */
export function RecordThen({ entity, id, values, label, show, onClose }: Props) {
  const titleId = useId(), pickId = useId();
  const [capture, setCapture] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [read, setRead] = useState<Read | null>(null);
  const [list, setList] = useState<CaptureRef[]>([]);
  const [copied, setCopied] = useState('');
  const current = read && read.values === values && read.capture === capture && read.attempt === attempt ? read : null;
  useEffect(() => {
    const controller = new AbortController(), { signal } = controller;
    api<unknown>(thenPath(entity, id, capture || undefined), { signal })
      .then(raw => {
        if (signal.aborted) return;
        const data = parseThen(raw);
        setList(data.captures);
        setRead({ values, capture, attempt, data });
      })
      .catch(failure => {
        if (!signal.aborted) setRead({ values, capture, attempt, error: failure instanceof Error ? failure.message : 'La consulta se interrumpió.' });
      });
    return () => controller.abort();
  }, [entity, id, values, capture, attempt]);
  const data = current?.data, result = data?.result, when = data?.capture ? captureLabel(data.capture.capturedAt) : '';
  const copy = (key: string, value: HistoryValue) => {
    navigator.clipboard?.writeText(copyText(value)).then(() => setCopied(key), () => setCopied(''));
  };
  const pick = (next: string) => { setCopied(''); setCapture(next === list[0]?.captureId ? '' : next); };
  return <section className="gx-then" aria-labelledby={titleId} aria-busy={!current}>
    <header className="gx-then-head">
      <h4 id={titleId}>Cómo estaba</h4>
      {list.length > 1 ? <span className="gx-then-pick">
        <label htmlFor={pickId}>Captura</label>
        <select id={pickId} value={capture || list[0]!.captureId} onChange={event => pick(event.target.value)}>
          {list.map((item, index) => <option key={item.captureId} value={item.captureId}>{captureLabel(item.capturedAt)}{index === 0 ? ' · la última' : ''}</option>)}
        </select>
      </span> : null}
      <button type="button" className="text-button" onClick={onClose}>Cerrar</button>
    </header>
    {current?.error ? <ErrorState title="No se pudo comparar" onAction={() => { setCapture(''); setAttempt(value => value + 1); }}>{current.error}</ErrorState>
      : !data ? <Skeleton rows={2} label="Buscando la captura…" />
      : !data.capture || !result ? <p className="gx-related-note">Aún no hay capturas guardadas. Con la primera copia verás aquí cómo estaba esta ficha.</p>
      : !result.present ? <p className="gx-related-note">El {when} esta ficha aún no estaba en la copia: se añadió después.{list.length > 1 ? ' Elige una captura más reciente.' : ''}</p>
      : !result.fields.length ? <p className="gx-then-same"><Check size={14} aria-hidden="true" />Igual que el {when}: ningún campo ha cambiado.</p>
      : <>
        <p className="gx-then-sum"><strong>{result.total} {result.total === 1 ? 'campo distinto' : 'campos distintos'}</strong> desde el {when}{result.unchanged ? ' · ' + result.unchanged + ' iguales' : ''}</p>
        <dl className="gx-then-list">{result.fields.map(field => {
          const name = label(field.key), text = copyText(field.then);
          return <div key={field.key} className="gx-then-row">
            <dt>{name}</dt>
            <dd><span className="gx-then-was">{show(field.key, field.then)}</span> <b aria-label="ahora">→</b> <span className="gx-then-now">{show(field.key, field.now)}</span></dd>
            {text ? <dd className="gx-then-copy">
              <button type="button" className="icon-button" title="Copiar el valor de entonces" aria-label={'Copiar el valor de entonces de ' + name} onClick={() => copy(field.key, field.then)}>
                {copied === field.key ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
              </button>
            </dd> : null}
          </div>;
        })}</dl>
        {result.truncated || result.fields.some(field => field.clipped) ? <p className="gx-related-note">
          {result.truncated ? 'Se muestran ' + result.fields.length + ' de ' + result.total + ' campos. ' : ''}
          {result.fields.some(field => field.clipped) ? 'Los textos largos se ven recortados.' : ''}
        </p> : null}
      </>}
    <p className="gx-then-note" aria-live="polite">{copied ? 'Copiado. Pégalo en la ficha y guarda para recuperarlo.' : 'Solo lectura: no restaura nada' + (data?.capture?.isTestData ? ' · captura de datos de prueba' : '') + '.'}</p>
  </section>;
}
