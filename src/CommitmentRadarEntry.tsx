import { useEffect, useRef, useState } from 'react';
import { multisystemDisclosures } from '../shared/commitment-multisystem-demo.js';
import { activateRadar, CommitmentError, loadRadarCapability, type RadarCapability } from './commitment-radar-client.js';
import { CommitmentRadar, type CommitmentRadarProps } from './CommitmentRadar.js';

// ENTRADA DEL RADAR (unidad CLAUDE-RADAR-ENTRY-MOUNT-READY). Es lo que el coordinador monta en la App: lee la CAPACIDAD que publica `mountCommitmentRadar` con el pin de la copia y solo cuando está
// disponible muestra el Radar. Leer no escribe; el escenario de ensayo se crea con una acción EXPLÍCITA de la persona (semilla persistente, una vez) y no contacta con ningún proveedor.
//   inactive-copy → no hay copia activa · not-fiction → la copia no es de datos de ensayo · not-initialized → ofrece activar · unavailable → no se pudo comprobar · available → Radar.
// Un cambio de pin, el bloqueo o un 409 de contexto retiran todo lo anterior; una respuesta tardía de otro pin se descarta.
export type CommitmentRadarEntryProps = CommitmentRadarProps;
type View = { kind: 'idle' } | { kind: 'loading' } | { kind: 'error'; message: string } | { kind: 'cap'; cap: RadarCapability; created?: boolean };
const STATUS_TEXT: Record<'inactive-copy' | 'not-fiction', string> = {
  'inactive-copy': 'No hay una copia activa: importa y activa una copia de datos de ensayo para usar el Radar.',
  'not-fiction': 'El Radar de ensayo solo trabaja con una copia de datos ficticios y esta copia no lo es. No se lee ni se muestra nada.',
};

export function CommitmentRadarEntry(props: CommitmentRadarEntryProps) {
  const { contextRevision, onContextStale } = props;
  const [view, setView] = useState<View>({ kind: 'idle' }), [activating, setActivating] = useState(false), [activateError, setActivateError] = useState('');
  const pin = useRef<string | null>(contextRevision), alive = useRef(true), seq = useRef(0), act = useRef(0), abort = useRef<AbortController | null>(null), actAbort = useRef<AbortController | null>(null), heading = useRef<HTMLHeadingElement | null>(null);

  // Una nueva lectura, un reinicio, el bloqueo o el desmontaje cancelan la activación en curso: su respuesta tardía (éxito o error) se descarta con el contador `act`.
  function dropActivation() { act.current++; actAbort.current?.abort(); actAbort.current = null; setActivating(false); }
  function reset(next: View) { seq.current++; abort.current?.abort(); dropActivation(); setView(next); setActivateError(''); }
  async function load() {
    const mine = pin.current; if (!mine) { reset({ kind: 'idle' }); return; }
    abort.current?.abort(); dropActivation(); const controller = new AbortController(); abort.current = controller; const current = ++seq.current; setView({ kind: 'loading' }); setActivateError('');
    const timer = setTimeout(() => controller.abort(), 15_000);
    // El plazo no depende de que el transporte atienda la cancelación: la carrera termina cuando la señal se aborta (plazo, nueva lectura o desmontaje).
    const stop = new Promise<never>((_, reject) => controller.signal.addEventListener('abort', () => reject(new DOMException('Consulta cancelada', 'AbortError')), { once: true }));
    try { const cap = await Promise.race([loadRadarCapability(mine, controller.signal), stop]); if (!alive.current || current !== seq.current || pin.current !== mine) return; setView({ kind: 'cap', cap }); }
    catch (failure) {
      if (!alive.current || current !== seq.current || pin.current !== mine) return;
      if (failure instanceof CommitmentError && (failure.status === 401 || failure.code === 'COMMITMENT_CONTEXT_CHANGED')) { reset({ kind: 'error', message: failure.message }); if (failure.status !== 401) onContextStale?.(); return; }
      setView({ kind: 'error', message: controller.signal.aborted ? 'La consulta del Radar tardó demasiado. Vuelve a intentarlo.' : failure instanceof Error ? failure.message : 'No se pudo leer el estado del Radar.' });
    } finally { clearTimeout(timer); }
  }
  useEffect(() => { alive.current = true; return () => { alive.current = false; seq.current++; abort.current?.abort(); act.current++; actAbort.current?.abort(); }; }, []);
  useEffect(() => { pin.current = contextRevision; reset({ kind: 'idle' }); if (contextRevision) void load(); }, [contextRevision]);
  useEffect(() => { const lock = () => reset({ kind: 'error', message: 'La sesión está bloqueada. Desbloquea Plan B para continuar.' }); window.addEventListener('planb:locked', lock); return () => window.removeEventListener('planb:locked', lock); }, []);

  async function activate() {
    const mine = pin.current; if (!mine || activating) return; const run = ++act.current, controller = new AbortController(); actAbort.current = controller; setActivating(true); setActivateError('');
    const stale = () => !alive.current || run !== act.current || pin.current !== mine;
    try {
      const { created, capability } = await activateRadar(mine, controller.signal);
      if (stale()) return;
      setView({ kind: 'cap', cap: capability, created });
    } catch (failure) {
      if (stale()) return;
      if (failure instanceof CommitmentError && (failure.status === 401 || failure.code === 'COMMITMENT_CONTEXT_CHANGED')) { reset({ kind: 'error', message: failure.message }); if (failure.status !== 401) onContextStale?.(); return; }
      setActivateError(failure instanceof CommitmentError && failure.unknown ? 'No se sabe si el escenario llegó a crearse. No se ha reenviado nada: pulsa «Actualizar estado» para comprobarlo leyendo.' : failure instanceof Error ? failure.message : 'No se pudo activar el escenario.');
    } finally { if (actAbort.current === controller) actAbort.current = null; if (!stale()) setActivating(false); }
  }

  // Es la página entera del Radar mientras no hay escenario activo: su título es el h1 (D7).
  const title = <h1 id="cre-title" ref={heading} tabIndex={-1}>Radar de compromisos</h1>;
  if (!contextRevision || view.kind === 'idle') return <section className="cr cre" aria-labelledby="cre-title">{title}<p className="cr-empty ui-empty" role="status">No hay una copia de ensayo activa: el Radar no muestra compromisos.</p></section>;
  if (view.kind === 'loading') return <section className="cr cre" aria-labelledby="cre-title">{title}<p role="status" className="ui-loading">Comprobando el Radar de esta copia…</p></section>;
  if (view.kind === 'error') return <section className="cr cre" aria-labelledby="cre-title">{title}<div className="error-box" role="alert"><p>{view.message}</p><button type="button" className="text-button" onClick={() => void load()}>Reintentar la lectura</button></div></section>;
  const { cap } = view;
  if (cap.status === 'inactive-copy' || cap.status === 'not-fiction') return <section className="cr cre" aria-labelledby="cre-title">{title}<p className="cr-empty" role="status" data-capability={cap.status}>{STATUS_TEXT[cap.status]}</p></section>;
  if (cap.status === 'unavailable') return <section className="cr cre" aria-labelledby="cre-title">{title}<div className="error-box" role="alert" data-capability="unavailable"><p>No se pudo comprobar el escenario local del Radar. No se asume que esté vacío.</p><button type="button" className="text-button" onClick={() => void load()}>Actualizar estado</button></div></section>;
  if (cap.status === 'not-initialized') return <section className="cr cre" aria-labelledby="cre-title" data-capability="not-initialized">{title}
    <p className="cr-sub">Todavía no hay un escenario de ensayo en esta copia. Activarlo crea compromisos y observaciones <strong>ficticios</strong> en este equipo; no contacta con HubSpot, Pipedrive, Zendesk ni ningún sistema de pedidos.</p>
    <ul className="cr-disclosures" aria-label="Qué debes saber">{multisystemDisclosures.map(text => <li key={text}>{text}</li>)}</ul>
    {activateError ? <p className="cr-error" role="alert">{activateError}</p> : null}
    <div className="cr-actions"><button type="button" className="button primary" disabled={!cap.canActivate || activating} onClick={() => void activate()}>{activating ? 'Activando…' : 'Activar el escenario de ensayo'}</button><button type="button" className="button secondary" disabled={activating} onClick={() => void load()}>Actualizar estado</button></div>
    <p className="cr-note">Es una acción tuya y se hace una sola vez: el escenario se conserva y leer el Radar no escribe nada.</p>
  </section>;
  return <>
    <p className="cr-provenance" role="status" data-capability="available">{view.created ? 'Escenario de ensayo creado ahora. ' : ''}Escenario de ensayo{cap.seedAt ? ' creado el ' + new Date(cap.seedAt).toLocaleString('es-ES', { dateStyle: 'medium', timeStyle: 'short' }) : ''} · {cap.provenance === 'durable' ? 'guardado en disco: se conserva al reiniciar' : 'solo en memoria: se pierde al reiniciar'} · datos ficticios, ningún proveedor conectado.</p>
    <CommitmentRadar {...props} />
  </>;
}
