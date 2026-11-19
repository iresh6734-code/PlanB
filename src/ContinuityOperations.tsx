import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { ResponseQueue, ResponseQueueItem, ResponseBucket } from '../shared/response-queue.js';
import type { CaptureComparison, ValuePreview } from '../shared/capture-comparison.js';
import { api } from './api.js';
import { Spinner } from './components.js';
import { TabList, tabPanelProps } from './TabList.js';
import { StatusTag } from './WorkspaceUI.js';
import './continuity-operations.css';

// Solo consulta: este bloque nunca escribe. Radar sobre la copia activa; comparador sobre capturas guardadas.
type RadarResponse = ResponseQueue & { source: { view: string; captureId: string; snapshotId: string; accountId: string; capturedAt: string; isTestData: boolean; revision: string; contextRevision?: string | null } };
type Described = { captureId: string; name: string; accountId: string; capturedAt: string; isTestData: boolean; contentHash: string };
type CompareResponse = CaptureComparison & { from: Described; to: Described };
type Failure = { status: number; message: string; stale?: boolean; contextChanged?: boolean };
type QueryState<T> = { key: string | null; phase: 'idle' | 'loading' | 'ok' | 'error'; data?: T; error?: Failure };
export type CaptureOption = { id: string; at: string; bytes: number };

const PAGE = 25;
const ENTITY: Record<string, string> = { contacts: 'Clientes', companies: 'Empresas', deals: 'Oportunidades', tasks: 'Tareas' };
const entityLabel = (id: string) => ENTITY[id] ?? id;
const BUCKETS: { id: ResponseBucket; title: string; hint: string }[] = [
  { id: 'overdue', title: 'Vencidas', hint: 'El vencimiento ya ha pasado.' },
  { id: 'due-in-window', title: 'Dentro del horizonte', hint: 'Vencen antes del final del horizonte elegido.' },
  { id: 'needs-review', title: 'Por revisar', hint: 'Estado o fecha no permiten decidir la prioridad.' },
  { id: 'later', title: 'Posteriores', hint: 'Vencen después del horizonte.' },
];
const KIND: Record<string, string> = { added: 'Añadido en la segunda captura', absent: 'Ausente en la segunda captura', changed: 'Modificado' };
const when = (iso: string | null | undefined) => { if (!iso) return '—'; const at = new Date(iso); return Number.isNaN(at.getTime()) ? iso : at.toLocaleString('es-ES'); };
const count = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? value.toLocaleString('es-ES') : '—';

function failure(error: unknown, scope: 'radar' | 'compare'): Failure {
  const status = typeof (error as { status?: unknown })?.status === 'number' ? (error as { status: number }).status : 0;
  const text = error instanceof Error ? error.message : '';
  if (status === 404 && scope === 'compare' && /No se encontró la captura/.test(text)) return { status, message: 'Una de las capturas elegidas ya no existe en el historial. No se ha sustituido por otra: elige de nuevo.' };
  if (status === 404) return { status, message: 'Esta versión instalada de Plan B no incluye esta consulta. Actualiza Plan B para usarla; no se muestra un resultado de sustitución.' };
  if (status === 401) return { status, message: 'Desbloquea tu copia local para continuar.' };
  const code = (error as { details?: { code?: unknown } })?.details?.code;
  if (status === 409 && scope === 'radar' && code === 'RESPONSE_QUEUE_CONTEXT_CHANGED') return { status, message: text || 'La copia activa cambió. Actualiza el contexto.', contextChanged: true };
  if (status === 409) return { status, message: text || (scope === 'compare' ? 'Las capturas no son comparables.' : 'No hay una copia activa.') };
  if (status === 422) return { status, message: text || 'La consulta no es válida.' };
  return { status, message: text || 'No se pudo completar la consulta.' };
}

/** Una petición viva por consulta: cambiar la clave, cerrar o desmontar aborta y descarta cualquier respuesta tardía. */
function useQuery<T>(key: string | null, fetcher: (signal: AbortSignal) => Promise<T>, check: (data: T) => string | null, scope: 'radar' | 'compare') {
  const [state, setState] = useState<QueryState<T>>({ key: null, phase: 'idle' });
  const [nonce, setNonce] = useState(0);
  const latest = useRef({ fetcher, check });
  latest.current = { fetcher, check };
  useEffect(() => {
    if (key === null) { setState({ key: null, phase: 'idle' }); return; }
    const controller = new AbortController();
    let live = true;
    setState({ key, phase: 'loading' });
    latest.current.fetcher(controller.signal).then(data => {
      if (!live) return;
      const problem = latest.current.check(data);
      setState(problem ? { key, phase: 'error', error: { status: 0, message: problem, stale: true } } : { key, phase: 'ok', data });
    }, error => { if (live && !controller.signal.aborted) setState({ key, phase: 'error', error: failure(error, scope) }); });
    return () => { live = false; controller.abort(); };
  }, [key, nonce]);
  const current: QueryState<T> = state.key === key ? state : { key, phase: key === null ? 'idle' : 'loading' };
  return { state: current, retry: () => setNonce(n => n + 1) };
}

function QueryError({ error, onRetry, children }: { error: Failure; onRetry?: () => void; children?: ReactNode }) {
  return <div className="error-box co-error" role="alert"><p>{error.message}</p><div className="button-row">{error.status !== 401 && onRetry ? <button type="button" className="button secondary" onClick={onRetry}>Reintentar consulta</button> : null}{children}</div></div>;
}

function Value({ preview }: { preview: ValuePreview }) {
  const value = preview.value;
  if (!preview.present) return <span className="co-value"><em>Propiedad ausente</em></span>;
  if (value === null) return <span className="co-value"><code>null</code><small>valor nulo</small></span>;
  if (value === '') return <span className="co-value"><em>Texto vacío</em></span>;
  if (typeof value === 'boolean') return <span className="co-value"><code>{String(value)}</code><small>booleano</small></span>;
  if (typeof value === 'number') return <span className="co-value"><code>{String(value)}</code><small>número</small></span>;
  return <span className="co-value"><span className="co-text">{value}</span>{preview.truncated ? <small>Vista previa recortada a 500 caracteres; la diferencia se calculó con el valor completo.</small> : null}</span>;
}

function dueText(item: ResponseQueueItem) {
  const due = item.due;
  if (due.kind === 'missing') return 'Sin fecha de vencimiento';
  if (due.kind === 'invalid') return 'Fecha no válida' + (due.value ? ': «' + due.value + '»' : '');
  if (due.kind === 'date') return 'Día ' + due.localDate + ' (sin hora)';
  return when(due.value);
}

const HORIZONS = [8, 24, 72, 168];
const LIMITS = [25, 50, 100];

/**
 * Sin `workspaceContextRevision` el radar consulta como siempre. Con la prop (string o null) queda anclado a la identidad del
 * espacio: null no consulta, y una copia sustituida con el mismo ID y fecha se rechaza en el servidor (409) y aquí (468).
 */
export function RadarPanel({ activeCaptureId, refreshContext, workspaceContextRevision }: { activeCaptureId: string | null; refreshContext: () => Promise<unknown>; workspaceContextRevision?: string | null }) {
  const [horizon, setHorizon] = useState(24), [limit, setLimit] = useState(50), [refreshing, setRefreshing] = useState(false);
  const anchored = workspaceContextRevision !== undefined, unverified = anchored && !workspaceContextRevision;
  const key = activeCaptureId && !unverified ? activeCaptureId + '|' + (workspaceContextRevision ?? '') + '|' + horizon + '|' + limit : null;
  const expected = useRef({ captureId: activeCaptureId, revision: workspaceContextRevision }); expected.current = { captureId: activeCaptureId, revision: workspaceContextRevision };
  const path = '/v2/continuity/response-queue?horizonHours=' + horizon + '&limit=' + limit + (workspaceContextRevision ? '&contextRevision=' + encodeURIComponent(workspaceContextRevision) : '');
  const { state, retry } = useQuery<RadarResponse>(key, signal => api<RadarResponse>(path, { signal }), data => {
    if (data.source?.captureId !== expected.current.captureId) return 'La respuesta pertenece a otra captura activa y se ha descartado. Actualiza el contexto para volver a consultar.';
    if (anchored && data.source.contextRevision !== expected.current.revision) return 'La respuesta pertenece a otra copia activa y se ha descartado. Actualiza el contexto para volver a consultar.';
    return null;
  }, 'radar');
  // Un contexto caducado no se reintenta: la nueva revisión llega del padre y cambia la clave de la consulta.
  const contextConflict = state.phase === 'error' && (!!state.error!.contextChanged || anchored && !!state.error!.stale);
  const update = async () => { setRefreshing(true); try { await refreshContext(); } catch { /* el padre muestra su propio error */ } finally { setRefreshing(false); if (!anchored) retry(); } };
  const data = state.phase === 'ok' ? state.data! : null;
  const refreshButton = <button type="button" className="button secondary" disabled={refreshing} onClick={() => void update()}>Actualizar contexto</button>;
  return <div className="co-panel">
    <div className="co-controls">
      <label className="field"><span>Horizonte</span><select aria-label="Horizonte" value={horizon} onChange={event => setHorizon(Number(event.target.value))}>{HORIZONS.map(hours => <option key={hours} value={hours}>{hours === 168 ? '7 días (168 h)' : hours + ' horas'}</option>)}</select></label>
      <label className="field"><span>Tareas visibles</span><select aria-label="Tareas visibles" value={limit} onChange={event => setLimit(Number(event.target.value))}>{LIMITS.map(n => <option key={n} value={n}>{n}</option>)}</select></label>
      <button type="button" className="button secondary" disabled={!activeCaptureId || unverified || contextConflict || state.phase === 'loading'} onClick={retry}>Actualizar radar</button>
    </div>
    {!activeCaptureId ? <p className="helper">No hay una copia activa. Usa «Continuar trabajando» o «Preparar aplicación» en esta página; el radar no inventa un resultado.</p> : null}
    {activeCaptureId && unverified ? <div className="error-box co-error" role="alert"><p>No se pudo verificar la identidad de la copia activa. Actualiza el contexto antes de consultar el radar.</p><div className="button-row">{refreshButton}</div></div> : null}
    {activeCaptureId && state.phase === 'loading' ? <Spinner text="Calculando el radar…" /> : null}
    {state.phase === 'error' ? <QueryError error={state.error!} onRetry={contextConflict ? undefined : retry}>{state.error!.stale || state.error!.contextChanged ? refreshButton : null}</QueryError> : null}
    {data ? <RadarResult data={data} horizon={horizon} /> : null}
  </div>;
}

function RadarResult({ data, horizon }: { data: RadarResponse; horizon: number }) {
  const s = data.summary;
  return <div className="co-result">
    <p className="co-provenance"><strong>Copia activa</strong> · {data.source.isTestData ? 'datos de ensayo' : 'datos reales'} · cuenta {data.source.accountId} · captura del {when(data.source.capturedAt)}<br />
      Calculado por el servidor el {when(data.evaluatedAt)} · horizonte de {horizon} h hasta el {when(data.horizonEndsAt)} · revisión <code>{data.source.revision.slice(0, 12)}</code></p>
    <dl className="co-counts" aria-label="Recuentos completos de tareas">
      <div><dt>Tareas locales</dt><dd>{count(s.totalTasks)}</dd></div><div><dt>Completadas</dt><dd>{count(s.completedTasks)}</dd></div>
      <div><dt>Abiertas</dt><dd>{count(s.knownOpenTasks)}</dd></div><div><dt>Estado desconocido</dt><dd>{count(s.unknownStatusTasks)}</dd></div>
    </dl>
    <p className="helper">Mostrando {count(s.returned)} de {count(s.totalQueued)} tareas pendientes de atender{s.truncated ? '. Hay más fuera del límite visible; los recuentos de cada grupo son completos.' : '.'}</p>
    {BUCKETS.map(bucket => {
      const items = data.items.filter(item => item.bucket === bucket.id), total = s.buckets[bucket.id];
      return <section key={bucket.id} className="co-group" aria-label={bucket.title}><h4>{bucket.title} <span className="co-badge">{count(total)}</span></h4><p className="helper">{bucket.hint}</p>
        {items.length ? <ul className="co-list">{items.map(item => <li key={item.id}><div className="co-item-head"><strong>{item.label}</strong>{item.status === 'unknown' ? <StatusTag tone="warning">Estado desconocido</StatusTag> : null}<small>ID {item.id}</small></div>
          <p>{dueText(item)}</p>
          {item.due.kind === 'date' && bucket.id === 'due-in-window' ? <p className="helper">Sin hora exacta: puede quedar antes o después del límite del horizonte.</p> : null}
          {item.reasons.map(reason => <p key={reason.code + reason.detail} className="co-reason">{reason.detail}</p>)}
          {item.references.length ? <p className="co-refs">Asociaciones: {item.references.map(ref => <span key={ref.field + ref.id} className={ref.available ? '' : 'warning-text'}>{ref.available ? (ref.label ?? ref.id) : 'ID ' + ref.id + ' (no disponible)'} · {entityLabel(ref.entity)}</span>)}</p> : <p className="co-refs">Sin asociaciones registradas.</p>}
          <p className="co-next"><strong>Siguiente paso:</strong> {item.nextAction}</p></li>)}</ul>
          : <p className="muted">{total ? count(total) + ' fuera del límite visible.' : 'Ninguna tarea en este grupo.'}</p>}</section>;
    })}
    <details className="co-limits"><summary>Límites de este radar</summary><ul>{data.limitations.map(text => <li key={text}>{text}</li>)}</ul></details>
  </div>;
}

type Request = { from: string; to: string; offset: number; content?: { from: string; to: string } };

export function ComparePanel({ captures }: { captures: CaptureOption[] }) {
  const [from, setFrom] = useState(''), [to, setTo] = useState(''), [req, setReq] = useState<Request | null>(null);
  const moved = useRef(false), heading = useRef<HTMLHeadingElement | null>(null);
  const compareButton = useRef<HTMLButtonElement | null>(null);
  const known = new Map(captures.map(item => [item.id, item]));
  const missing = [from, to].filter(id => id && !known.has(id));
  // La consulta solo vale mientras ambas capturas del par pedido sigan en el historial; si falta una, se aborta y se retira todo (la selección y el aviso se conservan).
  const active = req && known.has(req.from) && known.has(req.to) ? req : null;
  useEffect(() => { if (req && !active) setReq(null); }, [req, active]);
  const key = active ? JSON.stringify(active) : null;
  const expected = useRef(active); expected.current = active;
  const { state, retry } = useQuery<CompareResponse>(key, signal => {
    const r = active!;
    return api<CompareResponse>('/v2/captures/compare?from=' + encodeURIComponent(r.from) + '&to=' + encodeURIComponent(r.to) + '&offset=' + r.offset + '&limit=' + PAGE, { signal });
  }, data => {
    const r = expected.current;
    if (!r || data.from?.captureId !== r.from || data.to?.captureId !== r.to || data.records?.offset !== r.offset) {
      return 'La respuesta no corresponde a las capturas elegidas. Pulsa «Comparar capturas» para empezar de nuevo.';
    }
    const fromHash = data.from.contentHash, toHash = data.to.contentHash;
    if (typeof fromHash !== 'string' || !fromHash || typeof toHash !== 'string' || !toHash) {
      return 'No se pudo verificar el contenido de las capturas. Pulsa «Comparar capturas» para volver a consultar.';
    }
    return r.content && (r.content.from !== fromHash || r.content.to !== toHash)
      ? 'El contenido de las capturas cambió desde la primera página. Pulsa «Comparar capturas» para empezar de nuevo.'
      : null;
  }, 'compare');
  const stale = state.error?.stale;
  useEffect(() => {
    if (!moved.current) return;
    if (state.phase === 'ok') { moved.current = false; heading.current?.focus(); }
    if (state.phase === 'error' && stale) { moved.current = false; compareButton.current?.focus(); }
  }, [state.phase, stale]);
  const choose = (side: 'from' | 'to', id: string) => { (side === 'from' ? setFrom : setTo)(id); setReq(null); };
  const ready = !!from && !!to && from !== to && !missing.length;
  const data = state.phase === 'ok' ? state.data! : null;
  const compare = () => {
    moved.current = false;
    if (req && req.from === from && req.to === to && req.offset === 0 && !req.content) retry();
    else setReq({ from, to, offset: 0 });
  };
  const options = (selected: string) => <><option value="">Elige una captura</option>{!selected || known.has(selected) ? null : <option value={selected}>No disponible: {selected}</option>}{captures.map(item => <option key={item.id} value={item.id}>{when(item.at)} · {(item.bytes / 1024).toFixed(0)} KB</option>)}</>;
  return <div className="co-panel">
    {captures.length < 2 ? <p className="helper">Hacen falta al menos dos capturas guardadas para comparar. Ahora hay {captures.length}. Cuando exista otra, podrás ver qué cambió entre ambas.</p> : null}
    <div className="co-controls">
      <label className="field"><span>Primera captura</span><select aria-label="Primera captura" value={from} disabled={captures.length < 2} onChange={event => choose('from', event.target.value)}>{options(from)}</select></label>
      <label className="field"><span>Segunda captura</span><select aria-label="Segunda captura" value={to} disabled={captures.length < 2} onChange={event => choose('to', event.target.value)}>{options(to)}</select></label>
      <button ref={compareButton} type="button" className="button secondary" disabled={!ready || state.phase === 'loading'} onClick={compare}>Comparar capturas</button>
    </div>
    {missing.length ? <p className="warning-text" role="alert">Una captura elegida ya no está en el historial. No se ha cambiado por otra: elígela de nuevo.</p> : null}
    {from && to && from === to ? <p className="helper">Elige dos capturas distintas. El orden elegido se respeta: comparar al revés es una comparación válida.</p> : null}
    {active && state.phase === 'loading' ? <Spinner text="Comparando capturas…" /> : null}
    {active && state.phase === 'error' ? <QueryError error={state.error!} onRetry={stale ? undefined : retry} /> : null}
    {active && data ? <CompareResult data={data} headingRef={heading} page={offset => {
      moved.current = true;
      const content = active.content ?? { from: data.from.contentHash, to: data.to.contentHash };
      setReq({ ...active, offset, content });
    }} /> : null}
  </div>;
}

function CompareResult({ data, headingRef, page }: { data: CompareResponse; headingRef: { current: HTMLHeadingElement | null }; page: (offset: number) => void }) {
  const r = data.records, entities = Object.keys(r.counts), end = r.offset + r.items.length;
  const side = (title: string, c: Described) => <div><strong>{title}</strong><span>{when(c.capturedAt)}</span><small>{c.name} · cuenta {c.accountId} · {c.isTestData ? 'datos de ensayo' : 'datos reales'}</small></div>;
  return <div className="co-result">
    <h4 ref={node => { headingRef.current = node; }} tabIndex={-1}>Resultado de la comparación</h4>
    <div className="co-sides">{side('Primera captura', data.from)}{side('Segunda captura', data.to)}</div>
    {!data.chronological ? <p className="helper">La primera captura es posterior a la segunda: es una comparación inversa, tal como la elegiste.</p> : null}
    <div className="co-scroll" tabIndex={0} role="region" aria-label="Recuentos por entidad"><table className="co-table"><thead><tr><th scope="col">Entidad</th><th scope="col">Añadidos</th><th scope="col">Ausentes</th><th scope="col">Modificados</th><th scope="col">Sin cambios</th></tr></thead>
      <tbody>{entities.map(id => <tr key={id}><th scope="row">{entityLabel(id)}</th><td>{count(r.counts[id as keyof typeof r.counts].added)}</td><td>{count(r.counts[id as keyof typeof r.counts].absent)}</td><td>{count(r.counts[id as keyof typeof r.counts].changed)}</td><td>{count(r.counts[id as keyof typeof r.counts].unchanged)}</td></tr>)}</tbody></table></div>
    <p className="helper">«Ausente» significa que no figura en la segunda captura; no prueba que se borrara en HubSpot.</p>
    <section className="co-group" aria-label="Registros"><h4>Registros distintos <span className="co-badge">{count(r.totalDifferences)}</span></h4>
      {r.items.length ? <>
        <ul className="co-list">{r.items.map(item => <li key={item.entity + ':' + item.id}><div className="co-item-head"><strong>{item.afterLabel ?? item.beforeLabel ?? item.id}</strong><StatusTag tone={item.kind === 'changed' ? 'info' : 'warning'}>{KIND[item.kind]}</StatusTag><small>{entityLabel(item.entity)} · ID {item.id}</small></div>
          {item.fields.length ? <div className="co-scroll" tabIndex={0} role="region" aria-label={'Campos de ' + (item.afterLabel ?? item.beforeLabel ?? item.id)}><table className="co-table"><thead><tr><th scope="col">Campo</th><th scope="col">Antes</th><th scope="col">Después</th></tr></thead><tbody>{item.fields.map(f => <tr key={f.key}><th scope="row">{f.key}</th><td><Value preview={f.before} /></td><td><Value preview={f.after} /></td></tr>)}</tbody></table></div> : null}
          {item.fieldsTruncated ? <p className="helper">Se muestran {item.fields.length} de {count(item.totalFieldChanges)} campos distintos.</p> : null}</li>)}</ul>
        <nav className="co-pager" aria-label="Páginas de registros"><button type="button" className="text-button" disabled={r.offset <= 0} onClick={() => page(Math.max(0, r.offset - r.limit))}>Anterior</button><span>Registros {count(r.offset + 1)}–{count(end)} de {count(r.totalDifferences)}</span><button type="button" className="text-button" disabled={!r.truncated} onClick={() => page(r.offset + r.limit)}>Siguiente</button></nav></>
        : <p className="muted">{r.totalDifferences ? 'Esta página no contiene registros.' : 'No hay registros distintos entre estas capturas.'}</p>}</section>
    <section className="co-group" aria-label="Esquema y configuración"><h4>Esquema y configuración <span className="co-badge">{count(data.schema.totalFieldChanges)}</span></h4>
      {data.schema.fields.length ? <ul className="co-list">{data.schema.fields.map(f => <li key={f.entity + f.key}><strong>{entityLabel(f.entity)} · {f.key}</strong> <span>{KIND[f.kind]}{f.aspects.length ? ' (' + f.aspects.join(', ') + ')' : ''}</span></li>)}</ul> : <p className="muted">Sin cambios de campos.</p>}
      {data.schema.truncated ? <p className="helper">Muestra de {data.schema.fields.length} de {count(data.schema.totalFieldChanges)} cambios de campos.</p> : null}
      {data.schema.configurationSections.length ? <p className="helper">Configuración distinta en: {data.schema.configurationSections.join(', ')}.</p> : null}</section>
    <section className="co-group" aria-label="Relaciones"><h4>Relaciones <span className="co-badge">{count(data.relations.added + data.relations.absent)}</span></h4>
      <p className="helper">{count(data.relations.added)} añadidas · {count(data.relations.absent)} ausentes · {count(data.relations.unchanged)} sin cambios</p>
      {data.relations.items.length ? <ul className="co-list">{data.relations.items.map((it, index) => <li key={index}>{it.kind === 'added' ? 'Añadida' : 'Ausente'} ×{count(it.count)}: {entityLabel(it.link.fromEntity)} {it.link.fromId} → {entityLabel(it.link.toEntity)} {it.link.toId} · {it.link.label}</li>)}</ul> : <p className="muted">Sin cambios de relaciones.</p>}
      {data.relations.truncated ? <p className="helper">Muestra de {data.relations.items.length} de {count(data.relations.changedGroups)} grupos de relaciones.</p> : null}</section>
    <details className="co-limits"><summary>Límites de esta comparación</summary><ul>{data.limitations.map(text => <li key={text}>{text}</li>)}</ul><p className="helper">Las cadenas mostradas son vistas previas históricas, no una propuesta de devolución a HubSpot.</p></details>
  </div>;
}

export function ContinuityOperations({ captures, activeCaptureId, refreshContext }: { captures: CaptureOption[]; activeCaptureId: string | null; refreshContext: () => Promise<unknown> }) {
  const [open, setOpen] = useState(true), [tab, setTab] = useState<'radar' | 'compare'>('radar'), [locked, setLocked] = useState(false);
  useEffect(() => { const lock = () => setLocked(true); window.addEventListener('planb:locked', lock); return () => window.removeEventListener('planb:locked', lock); }, []);
  const tabs = [{ id: 'radar' as const, label: 'Qué atender' }, { id: 'compare' as const, label: 'Qué cambió' }];
  return <section className="continuity-operations" aria-labelledby="continuity-operations-title">
    <div className="co-head"><div><h2 id="continuity-operations-title">Operaciones de la copia</h2><p className="helper">Consultas de solo lectura. No modifican tareas, capturas ni HubSpot.</p></div>
      <button type="button" className="text-button" aria-expanded={open} aria-controls="continuity-operations-body" onClick={() => setOpen(value => !value)}>{open ? 'Ocultar operaciones' : 'Mostrar operaciones'}</button></div>
    {open && !locked ? <div id="continuity-operations-body">
      <TabList label="Operaciones de la copia" prefix="co" tabs={tabs} value={tab} onChange={setTab} />
      <div {...tabPanelProps('co', 'radar')} hidden={tab !== 'radar'}><RadarPanel activeCaptureId={activeCaptureId} refreshContext={refreshContext} /></div>
      <div {...tabPanelProps('co', 'compare')} hidden={tab !== 'compare'}><ComparePanel captures={captures} /></div>
    </div> : null}
    {locked ? <p className="warning-text" role="alert">Desbloquea tu copia local para continuar.</p> : null}
  </section>;
}
