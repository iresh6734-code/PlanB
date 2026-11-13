import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { RescueApiError, RescueClient, contextKey, envelopeFor, isBlocked, newIntentKey, type BlockedView, type RoomView } from './rescue-room-client.js';
import './rescue-room.css';
// Modo Rescate: una sala, una acción principal según el estado. Todo es ensayo con datos ficticios; ningún envío sale de este equipo.
type Fields = RoomView['selected'] extends infer S ? S extends { fields: infer F } ? F : never : never;
const BUCKET: Record<string, string> = { overdue: 'Vencida', 'due-in-window': 'En el horizonte', 'needs-review': 'Revisar', later: 'Más tarde' };
const REASON: Record<string, string> = { 'unknown-status': 'Estado desconocido', 'blocked-by-operator': 'Bloqueada (operador)', 'no-estimate': 'Sin estimación', 'exceeds-remaining': 'No cabe' };
const EVIDENCE_OP: Record<string, string> = { pending: 'Pendiente', sending: 'Enviando', applied: 'Verificada', failed: 'Fallida', uncertain: 'Incierta', skipped: 'Omitida' };
const fmt = (iso: string) => { try { return new Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Madrid', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(new Date(iso)); } catch { return iso; } };
const show = (value: unknown) => value === null || value === undefined || value === '' ? '—' : String(value);

export default function RescueRoom({ client: injected }: { client?: RescueClient }) {
  const client = useMemo(() => injected ?? new RescueClient(), [injected]);
  const [view, setView] = useState<RoomView | null>(null), [blocked, setBlocked] = useState<BlockedView | null>(null);
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState(''), [conflict, setConflict] = useState(false);
  const [edit, setEdit] = useState<Record<string, Record<string, string>>>({}), [preview, setPreview] = useState<{ taskId: string; ok: boolean; issues: Record<string, string>; diff: { key: string; before: unknown; after: unknown }[] } | null>(null);
  const [estimateDraft, setEstimateDraft] = useState<Record<string, string>>({}), [noteDraft, setNoteDraft] = useState<Record<string, string>>({}), [blockDraft, setBlockDraft] = useState<Record<string, string>>({});
  const [create, setCreate] = useState({ subject: '', due_date: '', status: 'pending' }), [customBudget, setCustomBudget] = useState(''), [closeNote, setCloseNote] = useState('');
  const [resolveId, setResolveId] = useState(''), [candidates, setCandidates] = useState<{ id: string; summary: string }[]>([]), [reloadFailed, setReloadFailed] = useState(false);
  const intents = useRef(new Map<string, string>()), contextRef = useRef<string | null>(null), alertRef = useRef<HTMLDivElement>(null), detailRef = useRef<HTMLHeadingElement>(null), stateRef = useRef<HTMLHeadingElement>(null);
  const resolveRef = useRef<HTMLInputElement>(null);

  const accept = useCallback((next: RoomView | BlockedView) => {
    if (isBlocked(next)) { setBlocked(next); return; }
    setBlocked(null);
    const key = contextKey(next.context);
    if (contextRef.current && contextRef.current !== key) { setEdit({}); setPreview(null); setEstimateDraft({}); setNoteDraft({}); setBlockDraft({}); intents.current.clear(); setNotice('La sala cambió de captura o de espacio: se descartaron los borradores del contexto anterior.'); }
    contextRef.current = key; setView(next);
  }, []);
  const load = useCallback(async () => {
    try { const next = await client.state(); if (next) accept(next); setError(''); setReloadFailed(false); setConflict(false); }
    catch (e) { setError(e instanceof Error ? e.message : 'No se pudo cargar la sala.'); }
    finally { setLoading(false); }
  }, [client, accept]);
  useEffect(() => { void load(); return () => client.cancelReads(); }, [load, client]);
  useEffect(() => { if (error || conflict) alertRef.current?.focus(); }, [error, conflict]);

  /** Una intención = una clave; mismo contenido → misma clave (doble clic, timeout); contenido distinto → clave nueva. */
  const keyFor = (route: string, payload: unknown) => { const id = route + ':' + JSON.stringify(payload); let k = intents.current.get(id); if (!k) { k = newIntentKey(route); intents.current.set(id, k); } return k; };
  const act = async (route: string, payload: Record<string, unknown>, done?: (ack: { result: Record<string, unknown>; outcome: string }) => void, success = 'Guardado.') => {
    if (!view) return false;
    setError(''); setConflict(false); setBusy(true);
    try {
      const ack = await client.mutate(route, { ...envelopeFor(view, keyFor(route, payload)), ...payload });
      intents.current.delete(route + ':' + JSON.stringify(payload));
      setNotice(ack.outcome === 'uncertain' ? 'Resultado incierto: guardado en el diario. Comprueba el ID remoto antes de repetir.' : success + (ack.replayed ? ' (ya estaba aplicado; no se repitió)' : ''));
      done?.(ack);
      try { const next = await client.state(); if (next) accept(next); setReloadFailed(false); } catch { setReloadFailed(true); }
      return true;
    } catch (e) {
      if (e instanceof RescueApiError && e.isConflict) { setConflict(true); setError(e.message); }
      else setError(e instanceof Error ? e.message : 'No se pudo completar la operación.');
      return false;
    } finally { setBusy(false); }
  };
  const open = async (taskId: string) => { await act('select', { taskId }, () => queueMicrotask(() => detailRef.current?.focus()), 'Tarea abierta.'); };

  if (loading) return <main className="rr rr-loading" aria-busy="true"><p>Abriendo la sala de rescate…</p></main>;
  if (blocked) return <main className="rr"><header className="rr-head"><h1>Sala de rescate</h1><p className="rr-banner">Ensayo · datos ficticios · no conecta con HubSpot</p></header>
    <div role="alert" className="rr-alert" ref={alertRef} tabIndex={-1}><strong>El incidente guardado no se puede leer.</strong> {blocked.integrity.status === 'corrupt' ? blocked.integrity.reason : ''} Se conservan los bytes originales y los flujos afectados están bloqueados; no se sustituye por un incidente vacío.</div></main>;
  if (!view) return <main className="rr"><div role="alert" className="rr-alert" ref={alertRef} tabIndex={-1}>{error || 'No se pudo cargar la sala.'}</div><button type="button" className="rr-btn" onClick={() => { setLoading(true); void load(); }}>Reintentar</button></main>;

  const v = view, plan = v.plan, op = v.returnPlan, taskFields = (v.selected?.fields ?? []) as Fields;
  const selId = v.selected?.record.id ?? null, draft = (selId && edit[selId]) || {};
  const value = (key: string) => draft[key] ?? show(v.selected?.record.values[key]).replace('—', '');
  const undecided = op ? op.operations.flatMap(o => o.fields.filter(f => f.decision === null).map(f => ({ o, f }))) : [];
  const uncertain = op?.operations.filter(o => o.status === 'uncertain') ?? [];
  const closed = v.closed, canEdit = ['preparation', 'local-work', 'return-review'].includes(v.stage);
  const setDraft = (key: string, text: string) => { if (!selId) return; setEdit(e => ({ ...e, [selId]: { ...(e[selId] ?? {}), [key]: text } })); setPreview(null); };
  const changed = (): Record<string, string> => Object.fromEntries(Object.entries(draft).filter(([k, t]) => t !== show(v.selected?.record.values[k]).replace('—', '')));
  const review = async () => {
    if (!selId) return; const values = changed(); if (!Object.keys(values).length) { setNotice('No hay cambios que revisar.'); return; }
    setBusy(true); setError('');
    try { const r = await client.preview(selId, values); setPreview({ taskId: selId, ok: r.ok, issues: r.issues, diff: r.diff }); }
    catch (e) { setError(e instanceof Error ? e.message : 'No se pudo revisar el cambio.'); } finally { setBusy(false); }
  };
  const saveEdit = async () => { if (!selId) return; const values = changed(); const ok = await act('edit', { taskId: selId, values }, () => { setEdit(e => { const c = { ...e }; delete c[selId]; return c; }); setPreview(null); }, 'Cambio local guardado y confirmado.'); if (!ok) return; };
  const mainAction = (() => {
    if (closed) return { label: 'Descargar el informe', href: '/api/rescue/report.html' };
    if (v.stage === 'preparation') return { label: 'Elegir un plan de 60 minutos', run: () => act('plan', { budgetMinutes: 60 }, undefined, 'Plan de 60 min elegido.') };
    if (v.stage === 'local-work' && !v.crm.online) return { label: 'Simular la vuelta del CRM', run: () => act('crm-return', {}, undefined, 'El CRM simulado ha vuelto.') };
    if (v.stage === 'local-work') return { label: 'Preparar el retorno', run: () => act('prepare', {}, undefined, 'Retorno preparado.') };
    if (v.stage === 'return-verified') return { label: 'Cerrar el ensayo', run: () => act('close', { note: closeNote }, undefined, 'Ensayo cerrado.') };
    if (undecided.length) return { label: 'Decidir ' + undecided.length + ' campo(s) en conflicto', focus: true };
    if (uncertain.length) return { label: 'Conciliar el resultado incierto', run: () => { resolveRef.current?.focus(); } };
    if (op && op.status === 'approved') return { label: 'Aplicar el envío simulado', run: () => act('apply', { planId: op.id }, undefined, 'Envío simulado intentado.') };
    if (op) return { label: 'Aprobar lo revisado', run: () => act('approve', { planId: op.id }, undefined, 'Plan aprobado.') };
    return { label: 'Preparar el retorno', run: () => act('prepare', {}) };
  })();
  const stageIndex = ['preparation', 'local-work', 'return-review', 'return-partial', 'return-verified', 'closed'].indexOf(v.stage);
  const loadCandidates = async (planId: string, operationId: string) => { try { setCandidates(await client.candidates(planId, operationId)); } catch (e) { setError(e instanceof Error ? e.message : 'No se pudieron buscar candidatos.'); } };

  return <main className="rr" aria-label="Sala de rescate">
    <header className="rr-head">
      <div><h1>Sala de rescate</h1><p className="rr-sub">{v.capture.name} · portal ficticio {v.capture.accountId}</p></div>
      <p className="rr-banner" role="note">{v.banner}</p>
      <dl className="rr-prov"><div><dt>Captura</dt><dd>{fmt(v.capture.capturedAt)} · rev. {v.capture.revision.slice(0, 8)}</dd></div><div><dt>Registros</dt><dd>{v.capture.records} ({Object.entries(v.capture.counts).map(([k, n]) => k + ' ' + n).join(' · ')})</dd></div><div><dt>Incidente</dt><dd>CRM caído {v.incident.hours} h desde {fmt(v.incident.startedAt)}</dd></div><div><dt>Versión de la sala</dt><dd>{v.version}</dd></div></dl>
    </header>
    <div className="rr-live" aria-live="polite" role="status">{notice}{reloadFailed ? ' Guardado correcto, pero no se pudo recargar la sala: actualiza para verla.' : ''}</div>
    {error ? <div role="alert" className="rr-alert" ref={alertRef} tabIndex={-1}>{error}{conflict ? <> <button type="button" className="rr-btn" onClick={() => { setLoading(true); void load(); }}>Actualizar la sala</button> <span>Tu borrador no se ha descartado.</span></> : null}</div> : null}
    {v.recoveryIntegrity.state === 'invalid' ? <div role="alert" className="rr-alert"><strong>El plan de devolución guardado no se puede validar.</strong> Se conserva sin cambios y el retorno queda bloqueado; no se sustituye por un plan vacío. {v.recoveryIntegrity.message}</div> : null}
    <section className="rr-state" aria-labelledby="rr-state-h">
      <h2 id="rr-state-h" ref={stateRef} tabIndex={-1}>Estado: {v.stageLabel}</h2>
      <ol className="rr-rail" aria-label="Progreso del ensayo">{['Plan', 'Trabajo local', 'Retorno en revisión', 'Parcial o incierto', 'Verificado', 'Cerrado'].map((s, i) => <li key={s} aria-current={i === stageIndex ? 'step' : undefined} className={i < stageIndex ? 'done' : i === stageIndex ? 'now' : ''}>{s}</li>)}</ol>
      {'href' in mainAction && mainAction.href ? <a className="rr-btn primary" href={mainAction.href} download>{mainAction.label}</a>
        : <button type="button" className="rr-btn primary" disabled={busy} onClick={() => { const m = mainAction as { run?: () => unknown }; if (m.run) void m.run(); else document.getElementById('rr-return')?.scrollIntoView(); }}>{busy ? 'Trabajando…' : mainAction.label}</button>}
      {v.stage === 'return-verified' ? <label className="rr-field">Nota de cierre (opcional)<input value={closeNote} maxLength={500} onChange={e => setCloseNote(e.target.value)} /></label> : null}
      <p className="rr-hint">«Ensayo cerrado» no significa «negocio recuperado»: la sala no mide RTO ni dinero salvado.</p>
    </section>

    <section aria-labelledby="rr-plan-h" className="rr-plan"><h2 id="rr-plan-h">Un plan para el tiempo que tengo</h2>
      <div className="rr-row" role="group" aria-label="Tiempo disponible">{v.presets.map(m => <button key={m} type="button" className="rr-chip" aria-pressed={v.budgetMinutes === m} disabled={busy || !['preparation', 'local-work'].includes(v.stage)} onClick={() => void act('plan', { budgetMinutes: m }, undefined, 'Plan de ' + m + ' min elegido.')}>{m} min</button>)}
        <label className="rr-field inline">Otro (min)<input inputMode="numeric" value={customBudget} onChange={e => setCustomBudget(e.target.value)} aria-describedby="rr-budget-help" /></label>
        <button type="button" className="rr-btn" disabled={busy || !['preparation', 'local-work'].includes(v.stage) || !/^\d+$/.test(customBudget) || Number(customBudget) < 1 || Number(customBudget) > v.estimateRange.max} onClick={() => void act('plan', { budgetMinutes: Number(customBudget) }, undefined, 'Plan de ' + customBudget + ' min elegido.')}>Usar</button>
        <button type="button" className="rr-btn" disabled={busy || closed} onClick={() => void act('estimates-script', {}, undefined, 'Estimaciones del guion cargadas.')}>Cargar estimaciones del guion</button></div>
      <p id="rr-budget-help" className="rr-hint">Entero entre 1 y {v.estimateRange.max}. Una estimación ausente es desconocida, nunca 0.</p>
      {plan ? <div className="rr-plan-sum" aria-live="polite"><p><strong>{plan.included.length}</strong> tareas caben en {plan.budgetMinutes} min ({plan.usedMinutes} min estimados, quedan {plan.remainingMinutes}). Que quepan no es que se hayan hecho: completadas en la copia local ahora, {v.localChanges.filter(c => c.completed).length}.</p>
        {v.budgetMinutes === 60 && v.comparison.length ? <p>Frente a 30 min, el plan de 60 añade: {v.comparison.join(', ')}.</p> : null}
        <ul className="rr-plan-list">{plan.included.map(e => <li key={e.id}>{e.startMinute}–{e.endMinute} min · {e.label}</li>)}</ul>
        <details><summary>{plan.excluded.length} tareas fuera del plan y por qué</summary><ul>{plan.excluded.map(e => <li key={e.id}>{e.label} — {REASON[e.reason]}. {e.detail}</li>)}</ul></details>
        <p className="rr-hint">{plan.method}</p>{plan.notConsidered ? <p className="rr-hint">{plan.notConsidered} tareas más no se consideran: la cola devuelve como máximo 200.</p> : null}</div> : <p className="rr-hint">Elige un tiempo disponible para ver qué tareas caben.</p>}
    </section>

    <div className="rr-cols">
      <section aria-labelledby="rr-queue-h" className="rr-queue"><h2 id="rr-queue-h">Tareas por atender</h2>
        <p className="rr-hint" id="rr-queue-sum">{v.queue.summary.totalTasks} tareas en la copia: {v.queue.summary.completedTasks} completadas, {v.queue.summary.knownOpenTasks} abiertas, {v.queue.summary.unknownStatusTasks} de estado desconocido. Visibles {v.queue.summary.returned} de {v.queue.summary.totalQueued}{v.queue.summary.truncated ? ' (el resto no se muestra: máximo 200)' : ''}.</p>
        <div className="rr-scroll" role="region" aria-label="Lista de tareas" tabIndex={0}><table aria-describedby="rr-queue-sum"><thead><tr><th scope="col">Tarea</th><th scope="col">Vence</th><th scope="col">Prioridad</th><th scope="col">Estim.</th><th scope="col">Plan</th></tr></thead><tbody>
          {v.queue.items.map(i => <tr key={i.id} aria-selected={selId === i.id} className={selId === i.id ? 'sel' : ''}>
            <th scope="row"><button type="button" className="rr-link" disabled={busy} onClick={() => void open(i.id)} aria-label={'Abrir la tarea ' + i.label + ' (' + i.id + ')'}>{i.label}</button><small>{i.id}</small></th>
            <td>{show(i.due.value)}</td><td><span className={'rr-tag ' + i.bucket}>{BUCKET[i.bucket]}</span><small>{i.reasons.map(r => r.detail).join(' ')}</small></td>
            <td>{i.estimate ? i.estimate + ' min' : 'Sin estimar'}</td>
            <td>{i.plan ? (i.plan.included ? <span className="rr-tag ok">Cabe ({i.plan.startMinute}–{i.plan.endMinute})</span> : <span className="rr-tag">{REASON[i.plan.reason]}</span>) : '—'}{i.blocked ? <small>Bloqueo declarado: {i.blocked}</small> : null}</td></tr>)}
        </tbody></table></div>
      </section>

      <aside className="rr-detail" aria-labelledby="rr-detail-h"><h2 id="rr-detail-h" ref={detailRef} tabIndex={-1}>{v.selected ? 'Tarea ' + v.selected.record.id : 'Detalle de la tarea'}</h2>
        {v.selected ? <>
          <form onSubmit={e => { e.preventDefault(); void review(); }} noValidate>
            <fieldset disabled={busy || !canEdit}><legend>Campos del CRM (se guardan en la copia local)</legend>
              {taskFields.filter(f => f.editable).map(f => <div key={f.key}><label className="rr-field">{f.label}
                {f.type === 'enum' ? <select value={value(f.key)} onChange={e => setDraft(f.key, e.target.value)} aria-invalid={!!preview?.issues[f.key]} aria-describedby={preview?.issues[f.key] ? 'err-' + f.key : undefined}>{f.options.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}</select>
                  : <input value={value(f.key)} onChange={e => setDraft(f.key, e.target.value)} placeholder={f.type === 'date' ? 'AAAA-MM-DD' : undefined} aria-invalid={!!preview?.issues[f.key]} aria-describedby={preview?.issues[f.key] ? 'err-' + f.key : undefined} />}
                </label>{preview?.issues[f.key] ? <span className="rr-err" id={'err-' + f.key}>{preview.issues[f.key]}</span> : null}</div>)}
              <button type="submit" className="rr-btn">Revisar el cambio</button>
            </fieldset></form>
          {preview && preview.taskId === selId ? <div className="rr-preview" aria-live="polite"><h3>Qué se guardaría</h3>{preview.diff.length ? <ul>{preview.diff.map(d => <li key={d.key}>{d.key}: {show(d.before)} → {show(d.after)}</li>)}</ul> : <p>No cambia ningún valor.</p>}
            <button type="button" className="rr-btn primary" disabled={busy || !preview.ok || !preview.diff.length} onClick={() => void saveEdit()}>Confirmar y guardar en la copia local</button>{!preview.ok ? <p className="rr-err">Corrige los campos marcados; tu texto se conserva.</p> : null}</div> : null}
          <div className="rr-ops"><h3>Notas y estimación (no son campos del CRM)</h3>
            <label className="rr-field">Estimación (min, {v.estimateRange.min}–{v.estimateRange.max})<input inputMode="numeric" value={estimateDraft[selId!] ?? (v.queue.items.find(i => i.id === selId)?.estimate ?? '')} onChange={e => setEstimateDraft(d => ({ ...d, [selId!]: e.target.value }))} /></label>
            <button type="button" className="rr-btn" disabled={busy || closed} onClick={() => { const t = (estimateDraft[selId!] ?? '').trim(); if (t !== '' && (!/^\d+$/.test(t) || Number(t) < v.estimateRange.min || Number(t) > v.estimateRange.max)) { setError('La estimación admite un entero entre ' + v.estimateRange.min + ' y ' + v.estimateRange.max + ' minutos.'); return; } void act('estimate', { taskId: selId, minutes: t === '' ? null : Number(t) }, () => setEstimateDraft(d => { const c = { ...d }; delete c[selId!]; return c; }), 'Estimación guardada.'); }}>Guardar estimación</button>
            <label className="rr-field">Nota operativa<textarea rows={3} maxLength={2000} value={noteDraft[selId!] ?? v.queue.items.find(i => i.id === selId)?.note ?? ''} onChange={e => setNoteDraft(d => ({ ...d, [selId!]: e.target.value }))} /></label>
            <button type="button" className="rr-btn" disabled={busy || closed} onClick={() => void act('note', { taskId: selId, text: noteDraft[selId!] ?? v.queue.items.find(i => i.id === selId)?.note ?? '' }, undefined, 'Nota guardada.')}>Guardar nota</button>
            <label className="rr-field">Bloqueo declarado por el operador<input maxLength={300} value={blockDraft[selId!] ?? v.queue.items.find(i => i.id === selId)?.blocked ?? ''} onChange={e => setBlockDraft(d => ({ ...d, [selId!]: e.target.value }))} /></label>
            <button type="button" className="rr-btn" disabled={busy || closed} onClick={() => void act('blocker', { taskId: selId, reason: blockDraft[selId!] ?? v.queue.items.find(i => i.id === selId)?.blocked ?? '' }, undefined, 'Bloqueo actualizado.')}>Guardar bloqueo</button></div>
        </> : <p className="rr-hint">Abre una tarea de la lista para editarla en la copia local.</p>}
        <form className="rr-new" onSubmit={e => { e.preventDefault(); void act('create', { values: { subject: create.subject, due_date: create.due_date, status: create.status } }, () => setCreate({ subject: '', due_date: '', status: 'pending' }), 'Tarea creada en la copia local.'); }}>
          <h3>Nueva tarea durante la caída</h3><p className="rr-hint">Sin relaciones: el simulador no las observa.</p>
          <label className="rr-field">Asunto<input value={create.subject} onChange={e => setCreate({ ...create, subject: e.target.value })} /></label>
          <label className="rr-field">Fecha límite<input value={create.due_date} placeholder="AAAA-MM-DD" onChange={e => setCreate({ ...create, due_date: e.target.value })} /></label>
          <button type="submit" className="rr-btn" disabled={busy || !canEdit || !create.subject.trim() || !create.due_date.trim()}>Crear tarea local</button></form>
      </aside>
    </div>

    <section id="rr-return" aria-labelledby="rr-return-h" className="rr-return"><h2 id="rr-return-h">Cuando el CRM vuelve</h2>
      <div className="rr-row" role="group" aria-label="Controles de la demo"><span className="rr-tag">Controles de la demo</span>
        <button type="button" className="rr-btn" disabled={busy || v.stage !== 'local-work' || v.crm.online} onClick={() => void act('crm-return', {}, undefined, 'El CRM simulado ha vuelto.')}>Simular vuelta del CRM</button>
        <label className="rr-check"><input type="checkbox" checked={v.crm.lostAckArmed} disabled={busy || closed} onChange={e => void act('arm-lost-ack', { armed: e.target.checked }, undefined, e.target.checked ? 'Armado el acuse perdido.' : 'Desarmado.')} /> Perder el acuse del próximo create</label>
        <button type="button" className="rr-btn" disabled={busy || !v.crm.online || !['local-work', 'return-review', 'return-partial'].includes(v.stage)} onClick={() => void act('prepare', {}, undefined, 'Retorno preparado.')}>{op ? 'Preparar de nuevo' : 'Preparar el retorno'}</button></div>
      <p className="rr-hint">CRM simulado: {v.crm.online ? 'disponible' : 'caído'} · registros {v.crm.stats.records} · llamadas create {v.crm.stats.calls.create}, update {v.crm.stats.calls.update}, read {v.crm.stats.calls.read} · creaciones duplicadas {v.crm.stats.duplicateCreates}. Todo envío es simulado.</p>
      {op ? <>
        <p>Plan {op.id.slice(0, 8)} · {op.status === 'review' ? 'en revisión' : op.status === 'approved' ? 'aprobado' : op.status === 'complete' ? 'completo' : op.status === 'partial' ? 'parcial' : op.status}</p>
        <div className="rr-scroll" role="region" aria-label="Operaciones del retorno" tabIndex={0}><table><thead><tr><th scope="col">Operación</th><th scope="col">Campo</th><th scope="col">Capturado</th><th scope="col">Local</th><th scope="col">CRM ahora</th><th scope="col">Decisión</th></tr></thead><tbody>
          {op.operations.flatMap(o => o.fields.length ? o.fields.map((f, n) => <tr key={o.id + f.field} className={f.conflict ? 'conflict' : ''}>
            {n === 0 ? <th scope="rowgroup" rowSpan={o.fields.length}>{o.label}<small>{o.kind === 'create' ? 'crear' : 'actualizar'} · {EVIDENCE_OP[o.status]}{o.remoteId ? ' · ' + o.remoteId : ''}</small></th> : null}
            <td>{f.label}{f.conflict ? <strong> · conflicto</strong> : null}</td><td>{show(f.base)}</td><td>{show(f.local)}</td><td>{show(f.remote)}</td>
            <td>{f.conflict || f.decision === null ? <fieldset className="rr-decision"><legend className="rr-sr">Decisión para {o.label}, {f.label}</legend>
              {(['local', 'remote'] as const).map(d => <label key={d}><input type="radio" name={o.id + f.field} checked={f.decision === d} disabled={busy} onChange={() => void act('decide', { planId: op.id, decisions: [{ operationId: o.id, field: f.field, decision: d }] }, undefined, 'Decisión registrada.')} /> {d === 'local' ? 'Conservar lo local' : 'Conservar el CRM'}</label>)}</fieldset> : f.decision === 'local' ? 'Local' : 'CRM'}</td></tr>) : [<tr key={o.id}><th scope="row">{o.label}<small>{EVIDENCE_OP[o.status]}</small></th><td colSpan={5}>Solo relaciones</td></tr>])}
        </tbody></table></div>
        <div className="rr-row"><button type="button" className="rr-btn" disabled={busy || !!undecided.length || !['review', 'partial'].includes(op.status)} onClick={() => void act('approve', { planId: op.id }, undefined, 'Plan aprobado.')}>Aprobar lo revisado</button>
          <button type="button" className="rr-btn primary" disabled={busy || op.status !== 'approved'} onClick={() => void act('apply', { planId: op.id }, undefined, 'Envío simulado intentado.')}>Aplicar (simulado)</button>
          <button type="button" className="rr-btn" disabled={busy || !['review', 'partial'].includes(op.status) || !!uncertain.length} onClick={() => void act('refresh', {}, undefined, 'Revisión actualizada.')}>Actualizar contra el CRM</button></div>
        {undecided.length ? <p className="rr-hint">Falta decidir {undecided.length} campo(s): sin decisión no se puede aprobar.</p> : null}
        {uncertain.map(o => <div key={o.id} className="rr-uncertain" role="group" aria-label={'Resultado incierto de ' + o.label}><h3>Resultado incierto: {o.label}</h3><p>{o.error}</p>
          <button type="button" className="rr-btn" onClick={() => void loadCandidates(op.id, o.id)}>Buscar candidatos en el CRM simulado</button>
          <ul>{candidates.map(c => <li key={c.id}>{c.summary} · <code>{c.id}</code> <button type="button" className="rr-btn" onClick={() => setResolveId(c.id)}>Usar este ID</button></li>)}</ul>
          <label className="rr-field">ID remoto a comprobar<input ref={resolveRef} value={resolveId} onChange={e => setResolveId(e.target.value)} /></label>
          <button type="button" className="rr-btn primary" disabled={busy || !resolveId.trim()} onClick={() => void act('resolve', { planId: op.id, operationId: o.id, remoteId: resolveId.trim() }, () => { setCandidates([]); setResolveId(''); }, 'Conciliado sin repetir el envío.')}>Conciliar con este ID</button></div>)}
      </> : <p className="rr-hint">Aún no hay retorno preparado.</p>}
    </section>

    <section aria-labelledby="rr-journal-h" className="rr-journal"><h2 id="rr-journal-h">Diario de hechos</h2><p className="rr-hint">{v.journal.total} hechos; el operador local no acredita auditoría multiusuario y el diario no es resistente a manipulación.</p>
      <ol>{v.journal.events.map(e => <li key={e.id}><time>{fmt(e.at)}</time> <span className="rr-tag">{e.actor === 'operator' ? 'Operador' : e.actor === 'simulator' ? 'Simulador' : 'Sistema'}</span> {e.summary}</li>)}</ol></section>
    <section aria-labelledby="rr-report-h" className="rr-report"><h2 id="rr-report-h">Informe del ensayo</h2><p><a className="rr-btn" href="/api/rescue/report.html" download>Descargar informe HTML</a> <a className="rr-btn" href="/api/rescue/report.json" download>Descargar JSON</a></p>
      {!closed && v.stage !== 'return-verified' ? <button type="button" className="rr-btn" disabled={busy} onClick={() => void act('close', { note: closeNote }, undefined, 'Ensayo cerrado.')}>Cerrar el ensayo sin terminar el retorno</button> : null}</section>
  </main>;
}
