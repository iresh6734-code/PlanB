import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { buildPassport, when, type Passport, type PassportAction, type PassportWorkSummary, type RelayRehearsalRecord, type SectionKey, type SourceInput } from '../shared/continuity-passport.js';
import { buildImpactMap, type ContextualSource, type ImpactInputs, type ImpactMap as ImpactMapModel } from '../shared/impact-map.js';
import type { ContinuityEvidenceApiResponse } from '../shared/continuity-evidence-api.js';
import { toPassportRecord } from '../shared/relay-rehearsal.js';
import { EvidenceReadError, loadContinuityEvidence } from './continuity-evidence-client.js';
import { cancelRelay, loadReadCheck, loadRelay, relayMessage, startRelay, type Loaded } from './continuity-hub-client.js';
import type { ReadCheckApiState } from '../shared/hubspot-read-check-api.js';
import type { RelayRehearsalApiState } from '../shared/relay-rehearsal.js';
import { ContinuityPassport } from './ContinuityPassport.js';
import { ImpactMap } from './ImpactMap.js';
import './continuity-hub.css';

// ContinuityHub (unidad 217, R2): consumidor listo para montar del pasaporte (214) y del mapa de impacto (215).
//  · Cada fuente (copia, lectura de HubSpot, último ensayo) se carga y se PUBLICA por separado en cuanto responde: una petición retenida no oculta las demás. Carga, ausencia, error y bloqueo son estados distintos.
//  · Toda respuesta se liga a una consulta (generación) y a la identidad del anfitrión (instalación, sesión, captura, conexión): si algo cambia, una respuesta anterior se descarta aunque el transporte ignore AbortSignal.
//  · La evidencia de copia se acredita solo si su captura coincide con la que el anfitrión declara (`context`); una identidad ausente no se rellena con la de la respuesta nueva.
//  · La vigencia se recalcula con el reloj local (temporizador, foco y vuelta a la pestaña) SIN pedir nada al proveedor.
//  · «Abrir Integraciones» NAVEGA al panel existente (218): el hub no registra ni ofrece otro consentimiento de lectura. La única acción propia es «Ensayar un relevo» (con confirmación, cancelación y seguimiento acotado).
//  · Tras un bloqueo o una respuesta perdida no se afirma lo que no consta: se consulta el estado guardado (GET) y no se ofrece otra ejecución hasta saberlo.
export interface ContinuityHubProps {
  fetcher?: typeof fetch;
  /** The standalone runtime has neither the read check nor the relay kit. */
  portable?: boolean;
  installId?: string | null;
  /** Identidad de la captura activa en la notación de la evidencia de copia (`context.captureId`). Si se informa, la evidencia leída solo se acredita con ESA captura; si no, se confía en la propia respuesta. */
  context?: string | null;
  /** Protected App revision from v2/state. Null means no authorized context is available. */
  workspaceContextRevision?: string | null;
  /** Identidad de la sesión desbloqueada y de la conexión de HubSpot (p. ej. un contador de desbloqueos y el sello de configuración): cualquier cambio descarta lo leído y vuelve a leer. */
  sessionKey?: string | number | null;
  connectionKey?: string | null;
  /** Abre las superficies que el anfitrión ya tiene (Hoy, Exportar, Preparación, Integraciones…). Una acción sin superficie se explica, no se simula. */
  navigate?: Partial<Record<PassportAction, () => void>>;
  /** Fuentes opcionales que el anfitrión ya conoce. CADA UNA trae el contexto al que pertenece: una fuente sin contexto no se liga a la copia activa. Ausentes: «sin comprobar». */
  extra?: { work?: ContextualSource<PassportWorkSummary>; inventory?: ImpactInputs['inventory']; queue?: ImpactInputs['queue']; comparison?: ImpactInputs['comparison'] };
  now?: () => number;
  /** Enlace local relativo a la evidencia para el resumen de turno exportado. */
  evidenceLink?: string | null;
  /** A pin published only after the protected evidence read succeeds; null retires the previous reading. */
  onCopyContext?: (context: string | null) => void;
}
type CopyResult = SourceInput<ContinuityEvidenceApiResponse> & { reason?: 'locked' | 'failed' };
interface Sources { copy: CopyResult | null; hubspot: Loaded<ReadCheckApiState> | null; relay: Loaded<RelayRehearsalApiState> | null }
type Key = keyof Sources;
const EMPTY: Sources = { copy: null, hubspot: null, relay: null };
const NOT_PROVIDED = { status: 'not-provided' as const, at: null, value: null };
const SOURCE_NAME: Record<Key, string> = { copy: 'Copia local', hubspot: 'Lectura de HubSpot', relay: 'Último ensayo de relevo' };
const MAX_TICK_MS = 30_000, POLL_MS = 2_000, POLL_MAX_MS = 180_000;
const portableActionUnavailable = (action: PassportAction | null) => action === 'open-integrations' || action === 'start-rehearsal';

export function ContinuityHub({ fetcher, portable = false, installId = null, context = null, workspaceContextRevision, sessionKey = null, connectionKey = null, navigate, extra, now = Date.now, evidenceLink = null, onCopyContext }: ContinuityHubProps) {
  const titleId = useId(), [sources, setSources] = useState<Sources>(EMPTY), [loading, setLoading] = useState(true), [confirm, setConfirm] = useState(false), [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  const [uncertain, setUncertain] = useState(false), [clock, setClock] = useState(() => now());
  const alive = useRef(true), generation = useRef(0), controller = useRef<AbortController | null>(null), panel = useRef<HTMLHeadingElement | null>(null), busyRef = useRef(false), relayTicket = useRef(0), pollStarted = useRef(0);
  const nowRef = useRef(now); nowRef.current = now;
  const copyContextRef = useRef(onCopyContext); copyContextRef.current = onCopyContext;
  const identity = JSON.stringify([installId, context, workspaceContextRevision, sessionKey, connectionKey]);

  /** Carga las tres fuentes por separado. `reset`: la identidad cambió (o se bloqueó) y lo anterior no se conserva. Resuelve cuando todas terminaron o esta consulta quedó obsoleta. */
  const load = useCallback((reset: boolean): Promise<boolean> => {
    const mine = ++generation.current, abort = new AbortController(); controller.current?.abort(); controller.current = abort; relayTicket.current++;
    const current = () => alive.current && generation.current === mine, iso = () => new Date(nowRef.current()).toISOString();
    copyContextRef.current?.(null);
    if (reset) setSources(EMPTY); setLoading(true);
    const publish = <K extends Key>(key: K, value: NonNullable<Sources[K]>) => {
      if (!current()) return;
      setSources(previous => ({ ...previous, [key]: value }));
      if (key === 'copy') {
        const copy = value as NonNullable<Sources['copy']>;
        const pin = copy.status === 'read' && copy.value?.available ? copy.value.context.captureId : null;
        copyContextRef.current?.(context !== null && pin !== context ? null : pin);
      }
    };
    const copyRead = workspaceContextRevision === null
      ? Promise.reject(new EvidenceReadError('stale', 'Actualiza la copia abierta antes de consultar su evidencia.'))
      : loadContinuityEvidence(undefined, { signal: abort.signal, fetcher, workspaceContextRevision });
    const copy = copyRead.then(
      value => publish('copy', { status: 'read', at: iso(), value }),
      (error: unknown) => { if (current()) publish('copy', { status: 'unavailable', at: iso(), value: null, reason: error instanceof EvidenceReadError && error.code === 'locked' ? 'locked' : 'failed' }); });
    const hubspot = portable ? undefined : loadReadCheck({ signal: abort.signal, fetcher, now: iso }).then(value => publish('hubspot', value), () => undefined);
    const relay = portable ? undefined : loadRelay({ signal: abort.signal, fetcher, now: iso }).then(value => publish('relay', value), () => undefined);
    return Promise.allSettled([copy, hubspot, relay]).then(() => { if (current()) setLoading(false); return current(); });
  }, [fetcher, workspaceContextRevision, context, portable]);
  useEffect(() => { alive.current = true; setConfirm(false); setUncertain(false); void load(true); return () => { alive.current = false; generation.current++; controller.current?.abort(); }; }, [load, identity]);
  useEffect(() => { if (confirm) panel.current?.focus(); }, [confirm]);

  // Reloj local: la vigencia se recalcula al vencer la lectura, cada 30 s, al recuperar el foco y al volver a la pestaña. Nunca pide nada al proveedor.
  const expiry = sources.hubspot?.status === 'read' && sources.hubspot.value.evidence ? Date.parse(sources.hubspot.value.evidence.freshUntil) : NaN;
  useEffect(() => {
    const bump = () => setClock(nowRef.current()), visible = () => { if (typeof document === 'undefined' || document.visibilityState !== 'hidden') bump(); };
    const wait = Number.isFinite(expiry) ? Math.min(MAX_TICK_MS, Math.max(50, expiry - nowRef.current() + 5)) : MAX_TICK_MS, timer = setTimeout(bump, wait);
    window.addEventListener('focus', bump); document.addEventListener('visibilitychange', visible);
    return () => { clearTimeout(timer); window.removeEventListener('focus', bump); document.removeEventListener('visibilitychange', visible); };
  }, [expiry, clock]);

  /** Relee SOLO el ensayo guardado (GET). Descarta la respuesta si cambió la identidad o si se pidió una lectura más reciente. */
  const reloadRelay = useCallback(async (): Promise<Loaded<RelayRehearsalApiState> | null> => {
    if (portable) return null;
    const mine = generation.current, ticket = ++relayTicket.current, abort = new AbortController(), iso = () => new Date(nowRef.current()).toISOString();
    const value = await loadRelay({ signal: abort.signal, fetcher, now: iso }).catch(() => null);
    if (!value || !alive.current || generation.current !== mine || relayTicket.current !== ticket) return null;
    setSources(previous => ({ ...previous, relay: value })); return value;
  }, [fetcher, portable]);
  const relayState = sources.relay?.status === 'read' ? sources.relay.value : null;
  const relayLive = !!relayState && (!!relayState.running || !!relayState.stopping);
  useEffect(() => {
    if (portable || !relayLive && !busy) { pollStarted.current = 0; return; }
    if (!pollStarted.current) pollStarted.current = Date.now();
    const timer = setInterval(() => { if (Date.now() - pollStarted.current < POLL_MAX_MS) void reloadRelay(); }, POLL_MS);
    return () => clearInterval(timer);
  }, [relayLive, busy, reloadRelay, portable]);

  const view = useMemo(() => {
    const pending = { copy: !sources.copy, hubspot: !portable && !sources.hubspot, relay: !portable && !sources.relay }, anyPending = pending.copy || pending.hubspot || pending.relay, settled = { copy: !pending.copy, hubspot: !pending.hubspot, relay: !pending.relay };
    const copyValue = sources.copy?.status === 'read' ? sources.copy.value : null, copyCtx = copyValue && copyValue.available ? copyValue.context.captureId : null;
    const expected = context ?? copyCtx, mismatch = !!copyCtx && context !== null && copyCtx !== context;
    const hsInput: SourceInput<ReadCheckApiState> = !sources.hubspot ? NOT_PROVIDED : sources.hubspot.status === 'read' ? { status: 'read', at: sources.hubspot.at, value: sources.hubspot.value } : { status: 'unavailable', at: sources.hubspot.at, value: null };
    const relayInput: SourceInput<RelayRehearsalRecord> = !sources.relay ? NOT_PROVIDED : sources.relay.status === 'unavailable' ? { status: 'unavailable', at: sources.relay.at, value: null } : { status: 'read', at: sources.relay.at, value: sources.relay.value.last ? toPassportRecord(sources.relay.value.last) : null };
    const copyInput: SourceInput<ContinuityEvidenceApiResponse> = !sources.copy ? NOT_PROVIDED : mismatch ? { status: 'unavailable', at: sources.copy.at, value: null } : { status: sources.copy.status, at: sources.copy.at, value: sources.copy.value };
    const w = extra?.work, sameWork = !!w && expected !== null && w.context === expected;
    const workInput: SourceInput<PassportWorkSummary> = w && sameWork ? { status: w.status, at: w.at, value: w.value } : NOT_PROVIDED;
    const absent = <V,>(): ContextualSource<V> => ({ status: 'not-provided', at: null, value: null, context: null });
    const impactInputs: ImpactInputs = {
      now: clock, expectedContext: expected, copy: sources.copy ? { status: sources.copy.status, at: sources.copy.at, value: sources.copy.value, context: copyCtx } : absent(),
      inventory: extra?.inventory ?? absent(), comparison: extra?.comparison ?? absent(), queue: extra?.queue ?? absent(), work: w ?? absent(), hubspot: hsInput, relay: { ...relayInput, context: null }, evidenceLink,
    };
    const full = buildPassport({ now: clock, installId, copy: copyInput, hubspot: portable ? NOT_PROVIDED : hsInput, work: workInput, relay: portable ? NOT_PROVIDED : relayInput });
    if (portable && full.nextStep && portableActionUnavailable(full.nextStep.action)) full.nextStep = null;
    if (portable) {
      impactInputs.hubspot = NOT_PROVIDED;
      impactInputs.relay = { ...NOT_PROVIDED, context: null };
    }
    const impact = buildImpactMap(impactInputs);
    if (portable) {
      const unavailableRows = impact.rows.filter(row => row.id === 'access:hubspot' || row.id === 'recovery:rehearsal');
      for (const row of unavailableRows) {
        row.action = null;
        row.missing = 'Esta función no está incluida en el paquete portable.';
      }
      impact.summary.handoffPlan = impact.summary.handoffPlan.filter(line => !unavailableRows.some(row => line.startsWith(row.title + ':')));
      if (impact.summary.firstDecision && unavailableRows.some(row => row.title === impact.summary.firstDecision?.title)) impact.summary.firstDecision = null;
    }
    if (!anyPending) return { passport: full as Passport, impact, mismatch, partial: false, pending, settled };
    // Publicación parcial: solo lo que ya se leyó. Lo pendiente no se presenta como «no solicitado» ni como cero.
    const hideSections = new Set<SectionKey>(['unproven']); if (pending.copy) { hideSections.add('copy'); hideSections.add('rehearsal'); } if (pending.hubspot) hideSections.add('read'); if (pending.relay) hideSections.add('rehearsal');
    const hideSources = new Set<string>(); if (pending.copy) hideSources.add('continuity-evidence'); if (pending.hubspot) hideSources.add('hubspot-read-check'); if (pending.relay) hideSources.add('relay-rehearsal');
    const hideRows = (id: string) => (pending.copy && (id === 'copy' || id === 'age:copy' || id === 'recovery:export' || id.startsWith('other-context:copy'))) || (pending.hubspot && id === 'access:hubspot') || ((pending.relay || pending.copy) && (id.startsWith('recovery:rehearsal') || id.startsWith('recovery:practice') || id === 'other-context:relay'));
    const names = (Object.keys(pending) as Key[]).filter(k => pending[k]).map(k => SOURCE_NAME[k].toLowerCase());
    const partialImpact: ImpactMapModel = { ...impact, rows: impact.rows.filter(row => !hideRows(row.id)), summary: { lead: 'Leyendo: ' + names.join(', ') + '. El resumen de turno se completa cuando respondan.', lines: [], firstDecision: null, handoffPlan: [], evidenceLink: impact.summary.evidenceLink } };
    return { passport: { ...full, sections: full.sections.filter(s => !hideSections.has(s.key)), nextStep: null, provenance: full.provenance.filter(p => !hideSources.has(p.source)) } as Passport, impact: partialImpact, mismatch, partial: true, pending, settled };
  }, [sources, extra, installId, context, clock, evidenceLink, portable]);

  const supported = (action: PassportAction) => action === 'start-rehearsal' || !!navigate?.[action];
  /** ¿Se puede ofrecer ahora un ensayo? Si no, dice por qué (con hechos del estado guardado). */
  function relayBlocked(): string | null {
    if (uncertain) return 'No se recibió la respuesta del ensayo anterior: lee primero el estado guardado antes de iniciar otro.';
    if (relayState?.stopping) return 'El ensayo anterior todavía se está deteniendo: espera a que termine antes de iniciar otro.';
    if (relayState?.running) return 'Ya hay un ensayo en curso (en esta u otra pestaña): no se inicia otro.';
    return null;
  }
  const act = (action: PassportAction) => {
    if (portable && portableActionUnavailable(action)) return;
    setMessage('');
    if (action === 'start-rehearsal') { const reason = relayBlocked(); if (reason) { setMessage(reason); return; } setConfirm(true); return; }
    const go = navigate?.[action]; if (go) { go(); return; }
    setMessage('Esta acción abre una pantalla que todavía no está conectada aquí: ábrela desde el menú.');
  };
  /** Relee las tres fuentes (solo GET). Con `retire`, lo leído antes se retira (p. ej. tras un bloqueo). */
  async function reread(retire = false) { setMessage(''); await load(retire); }
  const storedRelay = (state: RelayRehearsalApiState) => 'Estado guardado ahora: ' + (state.running ? 'hay un ensayo en curso; ' : state.stopping ? 'un ensayo se está deteniendo; ' : '') + (state.last ? 'último ensayo ' + when(state.last.rehearsedAt) + ' (' + (state.last.outcome === 'completed' ? 'completado' : state.last.outcome === 'failed' ? 'falló' : 'interrumpido') + ')' : 'ningún ensayo guardado') + '. No se atribuye a la acción que acabas de pedir.';

  async function runRelay() {
    if (portable || busyRef.current) return; busyRef.current = true; setBusy(true); setConfirm(false); setMessage('');
    const mine = generation.current, result = await startRelay({ fetcher }).catch(() => ({ kind: 'failed' as const }));
    busyRef.current = false; if (!alive.current) return; setBusy(false); setConfirm(false);
    if (generation.current !== mine) { setMessage('La sesión, la copia o la conexión cambiaron mientras se ensayaba. Se muestra el estado guardado actual; el resultado de aquel ensayo no se atribuye a la situación nueva.'); return; }
    if (result.kind === 'locked') {
      setUncertain(true); setMessage('Plan B se bloqueó durante el ensayo. El ejecutor pudo haber empezado antes del bloqueo: el servidor lo descarta y lo detiene, pero desde aquí no se puede confirmar. Se ha retirado lo leído; desbloquea Plan B y pulsa «Leer el estado guardado».');
      await load(true); return;
    }
    if (result.kind === 'failed') {
      setUncertain(true); setMessage('No se recibió una respuesta utilizable del ensayo: pudo ejecutarse, seguir en curso o no haber empezado. No se iniciará otro hasta leer el estado guardado.');
      const state = await reloadRelay();
      if (state?.status === 'read') { setUncertain(false); setMessage(previous => previous + ' ' + storedRelay(state.value)); }
      await load(false); return;
    }
    setUncertain(false);
    setMessage(relayMessage(result.state) ?? (result.state.last?.outcome === 'completed' ? 'Ensayo completado con datos ficticios en este equipo.' : 'Ensayo terminado.'));
    await load(false);
  }
  async function runCancel() {
    if (portable) return;
    const mine = generation.current, result = await cancelRelay({ fetcher }).catch(() => ({ kind: 'failed' as const }));
    if (!alive.current || generation.current !== mine) return;
    if (result.kind === 'locked') { setMessage('Plan B se bloqueó antes de poder confirmar la cancelación. Desbloquéalo y lee el estado guardado.'); await load(true); return; }
    if (result.kind === 'failed') { setMessage('No se recibió confirmación de la cancelación. Lee el estado guardado para ver si el ensayo sigue en curso.'); return; }
    setSources(previous => ({ ...previous, relay: { status: 'read', at: new Date(nowRef.current()).toISOString(), value: result.state } }));
    setMessage('Cancelación solicitada: el resultado de ese ensayo se descartará. El proceso puede tardar unos segundos en cerrarse del todo y mientras no se admite otro.');
  }

  const sourceState = (key: Key): { state: 'loading' | 'read' | 'locked' | 'unavailable'; text: string } => {
    if (portable && key !== 'copy') return { state: 'unavailable', text: 'No incluida en el paquete portable' };
    const slot = sources[key]; if (!slot) return { state: 'loading', text: 'Leyendo…' };
    if (slot.status === 'read') return { state: 'read', text: 'Leída ' + when(slot.at) };
    const locked = ('reason' in slot) && slot.reason === 'locked'; return locked ? { state: 'locked', text: 'Bloqueada: desbloquea Plan B' } : { state: 'unavailable', text: 'No se pudo leer' };
  };
  const hubBusy = loading || busy;

  return <section className="cph" aria-labelledby={titleId} aria-busy={hubBusy} data-partial={view.partial ? 'true' : 'false'}>
    <h2 id={titleId}>Continuidad: evidencia y ensayo</h2>
    <ul className="cph-sources" aria-label="Fuentes de lectura">{(Object.keys(sources) as Key[]).map(key => { const s = sourceState(key); return <li key={key} data-source={key} data-state={s.state}><strong>{SOURCE_NAME[key]}</strong> · <span>{s.text}</span></li>; })}</ul>
    {loading && Object.values(sources).every(slot => !slot) ? <p role="status">Leyendo la evidencia…</p> : null}
    {view.mismatch ? <p className="cph-message" role="status" data-testid="hub-context">La evidencia leída corresponde a otra captura que la copia activa de esta pantalla: no se muestra como actual. Vuelve a leerla cuando la copia activa esté confirmada.</p> : null}
    {message ? <p className="cph-message" role="status" data-testid="hub-message">{message}</p> : null}
    <div className="cph-actions"><button type="button" className="button secondary" disabled={loading} onClick={() => void reread(false)}>Leer el estado guardado</button></div>
    {!portable && (busy || relayState?.running) && !relayState?.stopping ? <div className="cph-live" role="status" data-testid="relay-live"><p>{relayState?.running ? 'Hay un ensayo en curso desde el ' + when(relayState.running.since) + '. Se hace con datos ficticios en este equipo.' : 'Ensayo solicitado: esperando a que el servidor lo confirme. Se hace con datos ficticios en este equipo.'}</p><div className="cph-actions"><button type="button" className="button secondary" onClick={() => void runCancel()}>Cancelar el ensayo</button></div></div> : null}
    {!portable && relayState?.stopping ? <p className="cph-live" role="status" data-testid="relay-stopping">Se pidió detener el ensayo ({{ cancelled: 'cancelación', revoked: 'sesión bloqueada', closing: 'cierre del servidor', timeout: 'tiempo agotado' }[relayState.stopping.reason]}) el {when(relayState.stopping.since)}. Su resultado se descartará; el proceso todavía se está cerrando y no se admite otro ensayo hasta que termine.</p> : null}
    {!portable && confirm ? <div className="cph-confirm" role="group" aria-labelledby={titleId + '-relay'} data-testid="confirm-relay">
      <h3 id={titleId + '-relay'} tabIndex={-1} ref={panel}>Ensayar un relevo</h3>
      <p>Se hará un ensayo <strong>con datos ficticios</strong> en este equipo: exportar, inspeccionar, aprobar el contenido inspeccionado, importar en un destino nuevo y abrirlo en un proceso nuevo. Tarda unos segundos.</p>
      <p><strong>No exporta tu copia activa</strong> ni prueba otro ordenador, HubSpot real ni tiempos de recuperación.</p>
      <div className="cph-actions"><button type="button" className="button primary" disabled={busy} aria-disabled={busy} onClick={() => void runRelay()}>{busy ? 'Ensayando…' : 'Confirmar y ensayar'}</button><button type="button" className="button secondary" disabled={busy} onClick={() => setConfirm(false)}>Cancelar</button></div></div> : null}
    {Object.values(sources).some(slot => slot) ? <>
      <ContinuityPassport passport={view.passport} onAction={view.passport.nextStep && supported(view.passport.nextStep.action) ? act : undefined} />
      <ImpactMap map={view.impact} onAction={act} />
    </> : null}
  </section>;
}
