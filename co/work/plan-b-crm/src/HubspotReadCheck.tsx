import { useCallback, useEffect, useRef, useState } from 'react';
import { parseReadCheckApiState, READ_CHECK_AUTHORIZED_READS, READ_CHECK_ROUTE, type ReadCheckApiState } from '../shared/hubspot-read-check-api.js';
import { READ_CHECK_TTL_MS } from '../shared/hubspot-read-check.js';
import { formatMadrid } from '../shared/local-integrations.js';
import './hubspot-read-check.css';

const entityNames = { contacts: 'Contactos', companies: 'Empresas', deals: 'Oportunidades', tasks: 'Tareas' };
const outcomes = { readable: 'Lectura correcta', forbidden: 'Sin permiso', rejected: 'Acceso rechazado', unavailable: 'Sin respuesta útil', malformed: 'Respuesta no válida', not_attempted: 'Sin consultar' };
interface Props {
  portalId: string | null;
  mode: 'test' | 'production_readonly' | 'unknown';
  reloadKey: number;
}

export function HubspotReadCheck({ portalId, mode, reloadKey }: Props) {
  const [data, setData] = useState<ReadCheckApiState | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [method, setMethod] = useState<'GET' | 'POST' | 'DELETE'>('GET');
  const [confirmation, setConfirmation] = useState<{ portalId: string; mode: string } | null>(null);
  const alive = useRef(false), sequence = useRef(0), pending = useRef<AbortController | null>(null), sending = useRef(false);
  const opener = useRef<HTMLButtonElement | null>(null);

  const request = useCallback(async (method: 'GET' | 'POST' | 'DELETE', authorizedPortal?: string) => {
    if (method === 'POST' && sending.current) return;
    pending.current?.abort();
    const controller = new AbortController(), current = ++sequence.current;
    pending.current = controller;
    sending.current = true;
    setBusy(true); setMethod(method); setError(''); setConfirmation(null); setData(null);
    const timeout = setTimeout(() => controller.abort(), method === 'POST' ? 85_000 : 15_000);
    try {
      const response = await fetch(READ_CHECK_ROUTE, {
        method, signal: controller.signal,
        ...(method === 'POST' ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ portalId: authorizedPortal, authorizedReads: READ_CHECK_AUTHORIZED_READS }) } : {}),
      });
      if (!alive.current || current !== sequence.current) return;
      if (response.status === 401) {
        window.dispatchEvent(new Event('planb:locked'));
        setError('Desbloquea tu copia local para continuar.');
        return;
      }
      if (response.status === 404) {
        setError('Esta versión del servidor todavía no ofrece la comprobación de lectura.');
        return;
      }
      const raw: unknown = await response.json();
      if (!alive.current || current !== sequence.current) return;
      const next = parseReadCheckApiState(raw);
      if (!next) {
        setError('La respuesta no permite acreditar una comprobación de lectura.');
        return;
      }
      setData(next);
      if (!response.ok) setError(next.message ?? 'No se pudo completar esta acción. Actualiza el resultado antes de volver a comprobar.');
    } catch {
      if (!alive.current || current !== sequence.current) return;
      setError(method === 'POST' ? 'Se perdió la respuesta de la comprobación. Actualiza el resultado para saber qué quedó registrado.' : 'No se pudo consultar el resultado. Puedes volver a actualizarlo.');
    } finally {
      clearTimeout(timeout);
      if (alive.current && current === sequence.current) { sending.current = false; setBusy(false); }
    }
  }, []);

  useEffect(() => {
    alive.current = true;
    void request('GET');
    return () => { alive.current = false; sequence.current++; pending.current?.abort(); sending.current = false; };
  }, [request, reloadKey, portalId, mode]);

  // Expiry updates the observation locally. It never starts a provider request or a polling loop.
  useEffect(() => {
    if (!data?.view.fresh || !data.evidence) return;
    const expiresAt = Date.parse(data.evidence.freshUntil);
    const epoch = sequence.current;
    const expired: ReadCheckApiState = {
      ...data,
      view: { ...data.view, state: 'saved_unchecked', fresh: false, label: 'Comprobación caducada', detail: 'La observación conserva su fecha. Vuelve a comprobar por decisión explícita para conocer el acceso actual.' },
    };
    const expire = () => { if (alive.current && sequence.current === epoch) setData(current => current === data ? expired : current); };
    const visible = () => { if (Date.now() > expiresAt) expire(); };
    const timer = setTimeout(expire, Math.max(0, Math.min(READ_CHECK_TTL_MS, expiresAt - Date.now() + 1)));
    document.addEventListener('visibilitychange', visible);
    return () => { clearTimeout(timer); document.removeEventListener('visibilitychange', visible); };
  }, [data]);

  const matching = !!data?.portal && data.portal.id === portalId && data.portal.mode === (mode === 'production_readonly' ? 'production' : mode === 'test' ? 'rehearsal' : 'unknown');
  const running = !!data?.running;
  const canCheck = matching && data?.consent.allowed === true && !busy && !running;
  const issue = error || data?.message;
  const confirm = () => {
    if (!canCheck || !confirmation || confirmation.portalId !== portalId || confirmation.mode !== data?.portal?.mode) return;
    void request('POST', confirmation.portalId);
  };
  const closeConfirmation = () => { setConfirmation(null); opener.current?.focus(); };

  return <div className="hrc" aria-labelledby="hrc-title" aria-busy={busy}>
    <div className="hrc-heading"><h4 id="hrc-title">Comprobación de lectura</h4>
      <button type="button" className="text-button" disabled={busy} onClick={() => void request('GET')}>Actualizar resultado</button>
    </div>
    <p className="hrc-status" role="status">{busy ? 'Consultando la comprobación…' : data?.view.label ?? 'Lectura sin acreditar'}</p>
    {data ? <p>{data.view.detail}</p> : null}
    {issue ? <p className="hrc-issue" role="alert">{issue}</p> : null}
    {data?.invalidated ? <p>La observación del {formatMadrid(data.invalidated.checkedAt)} pertenece a una configuración anterior.</p> : null}
    {data?.evidence ? <div className="hrc-observation">
      <p>Observación del {formatMadrid(data.evidence.checkedAt)} · {data.evidence.requests} solicitudes de lectura.</p>
      {data.evidence.objects.length ? <dl>{data.evidence.objects.map(item => <div key={item.entity}><dt>{entityNames[item.entity]}</dt><dd>{outcomes[item.outcome]}</dd></div>)}</dl> : null}
    </div> : null}
    {data?.configured && !matching ? <p className="hrc-issue">La conexión cambió. Pulsa «Actualizar estado» antes de autorizar otra comprobación.</p> : null}
    {data?.consent.reason ? <p>{data.consent.reason}</p> : null}
    {!data?.configured && data ? <p>Guarda la conexión desde Continuidad para poder comprobar su lectura.</p> : null}
    <div className="hrc-actions">
      <button ref={opener} type="button" className="button secondary" disabled={!canCheck} onClick={() => setConfirmation({ portalId: data!.portal!.id, mode: data!.portal!.mode })}>Comprobar lectura</button>
      {(running || busy && method === 'POST') ? <button type="button" className="text-button" onClick={() => void request('DELETE')}>Cancelar comprobación</button> : null}
    </div>
    {running ? <p>Hay una comprobación en curso. Actualiza el resultado para ver cuándo termina.</p> : null}
    {confirmation && matching && confirmation.portalId === portalId ? <fieldset className="hrc-consent" onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); closeConfirmation(); } }}>
      <legend>Autorizar comprobación de lectura</legend>
      <p>Portal {confirmation.portalId} · {confirmation.mode === 'rehearsal' ? 'cuenta de ensayo' : 'cuenta de producción'}. Se enviarán cinco solicitudes a HubSpot, una para identificar la cuenta y cuatro para leer un registro de contactos, empresas, oportunidades y tareas.</p>
      <p>La comprobación guarda su resultado en Plan B. No modifica registros de HubSpot.</p>
      <div className="hrc-actions"><button type="button" className="button primary" disabled={!canCheck} onClick={confirm}>Autorizar cinco lecturas</button>
        <button type="button" className="text-button" onClick={closeConfirmation}>Volver</button></div>
    </fieldset> : null}
  </div>;
}

