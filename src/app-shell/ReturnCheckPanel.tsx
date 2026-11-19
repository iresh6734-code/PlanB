import { useEffect, useRef, useState } from 'react';
import { RefreshCw, SearchCheck } from 'lucide-react';
import type { ReturnCheck } from '../../shared/return-check.js';
import { post } from '../api.js';
import { Spinner } from '../components.js';
import { RETURN_CHECK_PATH, checkHeadline, checkValue, parseReturnCheck } from './return-check-client.js';
import './return-check.css';

const STATE_TEXT = { changed: 'Cambió después', missing: 'Ya no aparece' } as const;

/** T6: después de una devolución, relee lo enviado y dice si sigue igual. Solo lee; no envía ni guarda nada. */
export function ReturnCheckPanel({ planId, source, destinations, disabled }: { planId: string; source: 'hubspot' | 'simulation'; destinations: { simulation: boolean; token?: string }; disabled: boolean }) {
  const [check, setCheck] = useState<ReturnCheck | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const alive = useRef(true), running = useRef(false);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => { setCheck(null); setError(''); }, [planId]);
  const where = source === 'simulation' ? 'el destino simulado' : 'HubSpot';
  const mismatch = destinations.simulation !== (source === 'simulation');
  const run = async () => {
    if (running.current) return;
    running.current = true; setBusy(true); setError('');
    try {
      const result = parseReturnCheck(await post<unknown>(RETURN_CHECK_PATH, { ...destinations, planId }));
      if (alive.current) setCheck(result);
    } catch (failure) { if (alive.current) setError(failure instanceof Error ? failure.message : 'No se pudo comprobar la devolución.'); }
    finally { running.current = false; if (alive.current) setBusy(false); }
  };
  const issues = check?.items.filter(item => item.state !== 'same') ?? [];
  return <section className="return-check" aria-labelledby="return-check-title">
    <header className="return-check-head">
      <div><h3 id="return-check-title">¿Sigue en {where} lo que enviaste?</h3>
        <p className="muted">Relee cada registro enviado y lo compara con lo que se envió. Solo lee: no cambia nada ni aquí ni en {where}.</p></div>
      <button type="button" className="button secondary" disabled={disabled || busy || mismatch} title={mismatch ? 'Elige arriba el mismo destino que usó la devolución' : undefined} onClick={() => void run()}>
        {busy ? <Spinner /> : check ? <RefreshCw size={15} aria-hidden="true" /> : <SearchCheck size={15} aria-hidden="true" />}{check ? 'Comprobar de nuevo' : 'Comprobar ahora'}</button>
    </header>
    {error ? <p role="alert" className="error-box">{error}</p> : null}
    {check ? <div className="return-check-result" role="status">
      <p className="return-check-line" data-tone={issues.length ? 'warn' : 'ok'}><strong>{checkHeadline(check)}</strong>
        <time dateTime={check.checkedAt}>{new Date(check.checkedAt).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}</time></p>
      {issues.length ? <ul className="return-check-list">{issues.map(item => <li key={item.operationId} data-state={item.state}>
        <span className="return-check-name"><strong>{item.label}</strong><small>{STATE_TEXT[item.state === 'missing' ? 'missing' : 'changed']}</small></span>
        {item.state === 'missing' ? <p>No se encontró en {where} con el ID {item.remoteId}. Puede que allí se borrara o se fusionara.</p>
          : <ul>{item.fields.map(field => <li key={field.field}><strong>{field.label}:</strong> enviaste {checkValue(field.sent)}; ahora pone {checkValue(field.now)}</li>)}</ul>}
      </li>)}</ul> : null}
      {issues.length ? <p className="helper">Alguien lo cambió en {where} después de la devolución. Tu copia no se toca: revísalo con quien lo cambió antes de volver a enviar nada.</p> : null}
    </div> : null}
  </section>;
}
