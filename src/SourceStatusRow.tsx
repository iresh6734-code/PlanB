import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { ACTION_LABEL, describeSourceHeadline, sourceStatusView, type NextAction, type SourceStatusView } from '../shared/source-status.js';
import './source-status-row.css';

// FILA DE FUENTE (unidad Claude B · CLAUDE-SOURCE-STATUS-ROW). Dibuja una `SourceStatusView` ya derivada (por el servidor) con la derivación aceptada de SourceStatus; NO hace fetch, no lee red, no conoce el registro de
// fuentes y no decide qué acciones existen: las acciones las aporta el anfitrión como manejadores concretos. Responde cinco preguntas en este orden: qué herramienta es, qué cuenta representa, qué se intentó y qué se observó
// (el titular de `describeSourceHeadline`, la hora observada, la cobertura y la causa) y qué acción permite avanzar. Los recibos y los detalles van bajo un control explícito, CERRADO por defecto: `children` no se monta hasta abrirlo.
// Nunca afirma ni ofrece «conectar». Sin consumidor montado todavía: ver coordination/plans/SOURCE-STATUS-ROW-HANDOFF.md.
export type StatusActionHandlers = Partial<Record<Exclude<NextAction, 'none'>, () => void | Promise<void>>>;
export interface SourceStatusRowProps {
  /** Estado derivado por el servidor con `describeSourceStatus` (se vuelve a validar con el esquema). */
  view: SourceStatusView;
  /** Solo se ofrece un botón para `view.nextAction` si el anfitrión aporta su manejador; sin él se explica qué condición falta. */
  actions?: StatusActionHandlers;
  /** Detalle secundario (p. ej. el historial de lecturas), bajo «Detalles y recibos»; se monta solo al abrirlo. */
  children?: ReactNode;
}
const MADRID = new Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Madrid', dateStyle: 'short', timeStyle: 'short' });
const when = (iso: string) => { const t = Date.parse(iso); return Number.isFinite(t) ? MADRID.format(new Date(t)) + ' (Madrid)' : 'fecha no válida'; };
const plural = (n: number, one: string, many: string) => n + ' ' + (n === 1 ? one : many);
/** Qué falta cuando la acción siguiente todavía no existe en esta versión (el anfitrión no aportó su manejador). */
const MISSING: Record<Exclude<NextAction, 'none'>, string> = {
  'configure-account': 'Falta configurar la cuenta de la fuente y esta pantalla todavía no tiene esa acción.',
  'request-authorization': 'Falta la autorización explícita para leer esta cuenta y esta pantalla todavía no tiene esa acción.',
  'run-explicit-read': 'Falta una lectura explícita de la fuente y esta pantalla todavía no tiene esa acción.',
  'retry-later': 'Conviene reintentar más tarde; esta pantalla todavía no tiene esa acción.',
  'review-permissions': 'Hay que revisar los permisos concedidos en la fuente; esta pantalla todavía no tiene esa acción.',
  'review-account': 'Hay que revisar el acceso de la cuenta en la fuente; esta pantalla todavía no tiene esa acción.',
};
type Phase = 'idle' | 'running' | 'finished' | 'failed';
// IDENTIDAD DEL ESTADO (R2, revisión 312 F1): la representación normalizada COMPLETA de la vista validada (el esquema es estricto y conserva el orden de sus claves). Antes una lista parcial de campos omitía `authorizedAt`, el alcance
// de objetos, el acceso, la identidad de cuenta, las afirmaciones…: cualquier cambio semántico de la vista deja de ser el mismo estado y se descarta lo que pertenecía al anterior. No hay lista de campos que mantener.
const signatureOf = (view: SourceStatusView) => JSON.stringify(view);
const INVALID = '\u0000invalid';

export function SourceStatusRow({ view, actions, children }: SourceStatusRowProps) {
  const titleId = useId(), detailId = useId(), parsed = sourceStatusView.safeParse(view), signature = parsed.success ? signatureOf(parsed.data) : INVALID;
  // Detalles abiertos y fase de la acción pertenecen a UNA firma. Si la firma cambia (otra lectura, otra autorización, otra cuenta, otro acceso… o volver a una anterior) el estado propio se reinicia DURANTE el render, antes de pintar:
  // nunca se ve ni un fotograma con «En curso…» o detalles abiertos del estado anterior.
  const [ui, setUi] = useState<{ sig: string; open: boolean; phase: Phase }>({ sig: signature, open: false, phase: 'idle' });
  if (ui.sig !== signature) setUi({ sig: signature, open: false, phase: 'idle' });
  const { open, phase } = ui.sig === signature ? ui : { open: false, phase: 'idle' as Phase };
  const alive = useRef(true), generation = useRef(0);
  // Lo que devuelva una acción anterior no se aplica al estado nuevo: la generación cambia con la firma y al desmontar; además el resultado solo se escribe si la firma del momento de la llamada sigue vigente.
  useEffect(() => { alive.current = true; generation.current++; return () => { alive.current = false; generation.current++; }; }, [signature]);
  if (!parsed.success) return <section className="ssr ssr-invalid" data-state="invalid" data-testid="source-status-row"><h3 id={titleId}>Estado de la fuente</h3><p className="ssr-head" role="status">El estado de esta fuente no es válido y no se muestra.</p><p className="ssr-detail">No se sabe qué se intentó ni qué se observó: se desconoce (no es cero).</p></section>;
  const v = parsed.data, copy = describeSourceHeadline(v), r = v.reading, fixture = v.provider.endsWith('-fixture');
  const account = v.accountId === null ? 'Sin cuenta configurada' : v.accountIdentity === 'observed' ? 'Cuenta comprobada ' + v.accountId : 'Cuenta configurada ' + v.accountId + ' (identidad sin comprobar)';
  // Un intento sin datos explica su evidencia con la frase de SourceStatus (fuente única de textos): en la derivación aceptada es la SEGUNDA afirmación; una prueba fija ese orden para que un cambio del módulo no pase inadvertido.
  const attempt = v.level === 'attempt-without-data' ? (v.statements[1] ?? null) : null;
  const handler = v.nextAction === 'none' ? undefined : actions?.[v.nextAction];
  const run = () => {
    if (!handler || phase === 'running') return;                              // una sola vez mientras se espera (el botón además queda deshabilitado)
    const mine = ++generation.current, sig = signature; setUi(current => current.sig === sig ? { ...current, phase: 'running' } : current);
    const done = (next: 'finished' | 'failed') => { if (alive.current && generation.current === mine) setUi(current => current.sig === sig ? { ...current, phase: next } : current); };
    try { Promise.resolve(handler()).then(() => done('finished'), () => done('failed')); } catch { done('failed'); }
  };
  return <section className={'ssr ssr-' + copy.tone} aria-labelledby={titleId} data-state={v.level} data-evidence={v.evidence ?? 'none'} data-action={v.nextAction} data-testid="source-status-row">
    <header className="ssr-who">
      <h3 id={titleId}>{v.label}</h3>
      {fixture ? <span className="ssr-tag" data-testid="status-environment">Ensayo · datos ficticios</span> : null}
      <p className="ssr-account" data-testid="status-account">{account}</p>
    </header>
    <p className="ssr-head" role="status" data-testid="status-headline">{copy.headline}</p>
    {r ? <p className="ssr-observed" data-testid="status-observed">
      {r.coverage === 'unavailable' ? 'Último intento ' + when(r.at) + ' · sin lectura útil · recuento desconocido (no es cero) · causa: ' + r.cause
        : (r.coverage === 'partial' ? (fixture ? 'Lectura de ensayo parcial ' : 'Lectura parcial observada ') : (fixture ? 'Lectura de ensayo ' : 'Lectura observada ')) + when(r.at) + ' · ' + (r.coverage === 'partial' ? 'al menos ' : '') + plural(r.records ?? 0, 'registro', 'registros') + (r.coverage === 'partial' ? ' · cobertura parcial · causa: ' + r.cause : ' · cobertura completa') + (r.fresh ? '' : ' · antigua')}
      {r.coverage !== 'unavailable' && v.emptyListing ? ' · listado observado vacío' : ''}
    </p> : <p className="ssr-observed" data-testid="status-observed">Sin recibos locales: todavía no se ha intentado ninguna lectura.</p>}
    {attempt ? <p className="ssr-attempt" data-testid="status-attempt">Qué se intentó: {attempt}</p> : null}
    <div className="ssr-next" data-testid="status-next">
      {handler ? <button type="button" className="button primary" disabled={phase === 'running'} aria-busy={phase === 'running'} onClick={run} data-testid="status-action">{phase === 'running' ? 'En curso…' : ACTION_LABEL[v.nextAction]}</button>
        : v.nextAction === 'none' ? <p className="ssr-detail" data-testid="status-no-action">{ACTION_LABEL.none}.</p>
        : <p className="ssr-detail" data-testid="status-missing"><strong>Siguiente paso: {ACTION_LABEL[v.nextAction]}.</strong> {MISSING[v.nextAction]}</p>}
      {phase === 'failed' ? <p className="ssr-detail ssr-warn" role="status" data-testid="status-action-failed">La acción no se pudo completar. El estado de arriba no cambió; puedes volver a intentarlo.</p> : null}
      {phase === 'finished' ? <p className="ssr-detail" role="status" data-testid="status-action-finished">La acción terminó. Este estado solo cambia cuando se vuelve a consultar: hasta entonces no se da nada por hecho.</p> : null}
    </div>
    <button type="button" className="button secondary ssr-toggle" aria-expanded={open} aria-controls={detailId} onClick={() => setUi(current => current.sig === signature ? { ...current, open: !current.open } : current)} data-testid="status-toggle">{open ? 'Ocultar detalles y recibos' : 'Detalles y recibos'}</button>
    {open ? <div id={detailId} className="ssr-details" role="region" aria-label={'Detalles de ' + v.label} data-testid="status-details">
      <p className="ssr-detail" data-testid="status-detail">{copy.detail}</p>
      <ul className="ssr-statements" aria-label="Lo que se sabe de esta fuente">{v.statements.filter(text => !text.startsWith('No conectado:')).map(text => <li key={text}>{text}</li>)}</ul>
      {children}
    </div> : null}
    <small className="ssr-foot">No conectado: este estado no prueba una conexión ni se actualiza solo.</small>
  </section>;
}
