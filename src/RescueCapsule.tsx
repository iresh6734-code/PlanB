import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CapsuleApiError, CapsuleClient, type ExportOk, type ImportOk, type InspectOk, type KitState } from './rescue-capsule-client.js';
import './rescue-capsule.css';
// Kit de Relevo: tres pasos (preparar cápsula · inspeccionar y revisar · abrir destino). Ensayo con datos ficticios en este equipo: no acredita otro ordenador, HubSpot real ni RTO.
const short = (hex: string) => hex.slice(0, 12) + '…';
const kb = (bytes: number) => (bytes / 1024).toFixed(1) + ' KiB';
export default function RescueCapsule({ client: injected }: { client?: CapsuleClient }) {
  const client = useMemo(() => injected ?? new CapsuleClient(), [injected]);
  const [kit, setKit] = useState<KitState | null>(null), [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState(''), [step, setStep] = useState(1);
  const [password, setPassword] = useState(''), [selected, setSelected] = useState(''), [inspection, setInspection] = useState<InspectOk | null>(null), [reviewed, setReviewed] = useState(false), [exported, setExported] = useState<ExportOk | null>(null), [imported, setImported] = useState<ImportOk | null>(null), [destUrl, setDestUrl] = useState('');
  const alertRef = useRef<HTMLDivElement>(null), headingRef = useRef<HTMLHeadingElement>(null);
  const load = useCallback(async (afterAction = false) => { try { const s = await client.state(); if (s) setKit(s); if (!afterAction) setError(''); return true; } catch (e) { if (!afterAction) setError(e instanceof Error ? e.message : 'No se pudo cargar el kit.'); return false; } finally { setLoading(false); } }, [client]);
  useEffect(() => { void load(); return () => client.cancelReads(); }, [load, client]);
  useEffect(() => { if (error) alertRef.current?.focus(); }, [error]);
  const goto = (n: number) => setStep(n);
  const firstStep = useRef(true);
  useEffect(() => { if (firstStep.current) { firstStep.current = false; return; } headingRef.current?.focus(); }, [step]); // el foco va al encabezado del paso, ya renderizado
  const run = async <T,>(fn: () => Promise<T>, done: (v: T) => void, message: string) => {
    setBusy(true); setError('');
    try { const v = await fn(); done(v); const reloaded = await load(true); setNotice(reloaded ? message : message + ' La operación se completó, pero no se pudo recargar el estado del kit: actualiza la página; no se repite.'); }
    catch (e) { setError(e instanceof CapsuleApiError || e instanceof Error ? e.message : 'No se pudo completar la operación.'); await load(true); /* otro proceso pudo ganar: se muestra el estado real del kit, no el de antes del intento */ } finally { setBusy(false); }
  };
  if (loading) return <main className="rc rc-loading" aria-busy="true"><p>Abriendo el kit de relevo…</p></main>;
  if (!kit) return <main className="rc"><div role="alert" className="rc-alert" ref={alertRef} tabIndex={-1}>{error || 'No se pudo cargar el kit.'}</div><button type="button" className="rc-btn" onClick={() => { setLoading(true); void load(); }}>Reintentar</button></main>;
  const o = kit.origin, capsules = kit.capsules, pwOk = password.length >= 12 && password.length <= 200;
  return <main className="rc" aria-label="Kit de relevo">
    <header className="rc-head"><h1>Kit de relevo</h1><p className="rc-banner" role="note">{kit.banner}</p>
      <p className="rc-sub">Traslada el ensayo de Rescate a una carpeta y un proceso nuevos de este equipo, con una cápsula cifrada. No acredita otro ordenador.</p></header>
    <ol className="rc-steps" aria-label="Pasos del relevo">{['Preparar la cápsula', 'Inspeccionar y revisar', 'Abrir el destino'].map((s, i) => <li key={s} aria-current={step === i + 1 ? 'step' : undefined} className={step === i + 1 ? 'now' : step > i + 1 ? 'done' : ''}><button type="button" className="rc-link" onClick={() => goto(i + 1)}>{i + 1}. {s}</button></li>)}</ol>
    <div className="rc-live" role="status" aria-live="polite">{notice}</div>
    {error ? <div role="alert" className="rc-alert" ref={alertRef} tabIndex={-1}>{error}</div> : null}

    {step === 1 ? <section aria-labelledby="rc-h1" className="rc-card"><h2 id="rc-h1" ref={headingRef} tabIndex={-1}>1. Preparar la cápsula</h2>
      <dl className="rc-facts"><div><dt>Origen</dt><dd>{o.stage} · versión {o.version}</dd></div><div><dt>Registros / cambios locales</dt><dd>{o.records} / {o.changes}</dd></div><div><dt>Hechos del diario</dt><dd>{o.journalEvents}</dd></div><div><dt>CRM simulado</dt><dd>{o.simRecords} registros · {o.simCreateCalls} llamadas create</dd></div><div><dt>Operaciones inciertas</dt><dd>{o.uncertain ? o.uncertainOps.map(u => u.label).join(', ') : 'Ninguna'}</dd></div><div><dt>Plan aprobado</dt><dd>{o.approvedPlan ? 'Sí (se retirará al abrir el destino)' : 'No'}</dd></div></dl>
      <p className="rc-hint">Política de este estado: {o.policy}</p><p className="rc-hint">{o.planScope}</p>
      {o.stageKey === 'preparation' ? <div className="rc-row"><button type="button" className="rc-btn" disabled={busy} onClick={() => void run(() => client.seed(), () => undefined, 'El origen está en el caso de interés: create con acuse perdido.')}>Llevar el origen al caso de interés (demo)</button><span className="rc-hint">Control de la demo: ejecuta el trabajo, el conflicto y el acuse perdido con la API normal de la sala.</span></div> : null}
      <form onSubmit={e => { e.preventDefault(); const pwd = password; setPassword(''); void run(() => client.exportCapsule(pwd), v => { setExported(v); setSelected(v.name); }, 'Cápsula cifrada publicada.'); }}>
        <label className="rc-field">Contraseña del ensayo (12 a 200 caracteres)<input type="password" autoComplete="off" value={password} onChange={e => setPassword(e.target.value)} aria-describedby="rc-pw-help" /></label>
        <p id="rc-pw-help" className="rc-hint">Solo se envía en el cuerpo de la petición local; no se guarda ni aparece en URLs, registros o almacenamiento del navegador. Si la pierdes no hay recuperación.</p>
        <button type="submit" className="rc-btn primary" disabled={busy || !pwOk}>{busy ? 'Trabajando…' : 'Exportar cápsula cifrada'}</button></form>
      {exported ? <div className="rc-result" role="group" aria-label="Cápsula publicada"><h3>Cápsula publicada</h3><p><code>{exported.name}</code> · {kb(exported.bytes)} · SHA-256 {short(exported.sha256)} · revisión {short(exported.revision)} · captura en {exported.attempts} intento(s)</p><button type="button" className="rc-btn" onClick={() => goto(2)}>Continuar: inspeccionar</button></div> : null}
    </section> : null}

    {step === 2 ? <section aria-labelledby="rc-h2" className="rc-card"><h2 id="rc-h2" ref={headingRef} tabIndex={-1}>2. Inspeccionar y revisar</h2>
      {capsules.length ? <fieldset className="rc-fieldset"><legend>Cápsulas de este kit</legend>{capsules.map(c => <label key={c.name} className="rc-radio"><input type="radio" name="capsule" checked={selected === c.name} disabled={busy} onChange={() => { setSelected(c.name); setInspection(null); setReviewed(false); }} /> <code>{c.name}</code>{c.imported ? ' · ya importada' : ''}</label>)}</fieldset> : <p className="rc-hint">Aún no hay cápsulas: prepara una en el paso 1.</p>}
      <form onSubmit={e => { e.preventDefault(); const pwd = password; setPassword(''); void run(() => client.inspect(selected, pwd), v => { setInspection(v); setReviewed(false); }, 'Inspección completada sin escribir nada.'); }}>
        <label className="rc-field">Contraseña del ensayo<input type="password" autoComplete="off" value={password} onChange={e => setPassword(e.target.value)} /></label>
        <button type="submit" className="rc-btn" disabled={busy || !selected || !pwOk}>Inspeccionar (sin escribir)</button></form>
      {inspection ? <div className="rc-result"><h3>Lo que contiene</h3>
        <dl className="rc-facts"><div><dt>Procedencia</dt><dd>sala {inspection.summary.origin.roomId.slice(0, 8)}… · {inspection.summary.stageLabel} · versión {inspection.summary.origin.version}</dd></div><div><dt>Contenido</dt><dd>{inspection.summary.records} registros · {inspection.summary.changes} cambios · {inspection.summary.journalEvents} hechos · {inspection.summary.idemRecords} registros de idempotencia</dd></div><div><dt>CRM simulado</dt><dd>{inspection.summary.simRecords} registros · {inspection.summary.simCreates} creates</dd></div><div><dt>Huella</dt><dd>SHA-256 {short(inspection.sha256)} · revisión {short(inspection.revision)} · {kb(inspection.bytes)}</dd></div></dl>
        <h3>Operaciones inciertas</h3>{inspection.summary.uncertainOps.length ? <ul>{inspection.summary.uncertainOps.map(u => <li key={u.id}>{u.label}: se conserva como incierta</li>)}</ul> : <p>Ninguna.</p>}
        <h3>Advertencias</h3>{inspection.summary.warnings.length ? <ul>{inspection.summary.warnings.map(w => <li key={w}>{w}</li>)}</ul> : <p>Ninguna.</p>}
        <p className="rc-hint">{inspection.summary.policy}</p>
        <label className="rc-check"><input type="checkbox" checked={reviewed} onChange={e => setReviewed(e.target.checked)} /> He revisado este contenido (SHA-256 {short(inspection.sha256)}) y quiero importarlo en una carpeta nueva.</label>
        <div className="rc-row"><button type="button" className="rc-btn primary" disabled={busy || !reviewed || !pwOk} onClick={() => { const pwd = password; setPassword(''); void run(() => client.importCapsule({ name: inspection.name, password: pwd, expectedSha256: inspection.sha256, expectedRevision: inspection.revision }), v => { setImported(v); goto(3); }, 'Destino creado en una carpeta nueva.'); }}>Aprobar la importación en carpeta nueva</button>
          <button type="button" className="rc-btn" disabled={busy} onClick={() => { setInspection(null); setReviewed(false); setPassword(''); setNotice('Cancelado: no se escribió ni se borró nada.'); goto(1); }}>Cancelar</button></div>
        {!pwOk ? <p className="rc-hint">Vuelve a escribir la contraseña para aprobar: la aprobación queda ligada a este contenido exacto.</p> : null}</div> : null}
    </section> : null}

    {step === 3 ? <section aria-labelledby="rc-h3" className="rc-card"><h2 id="rc-h3" ref={headingRef} tabIndex={-1}>3. Abrir el destino</h2>
      {imported ? <><p>Destino creado: <code>{imported.destination.folder}</code>. Aprobaciones retiradas y fallos desarmados:</p><ul>{imported.retired.map(r => <li key={r}>{r}</li>)}</ul>
        <div className="rc-row"><button type="button" className="rc-btn primary" disabled={busy} onClick={() => void run(() => client.openDestination(imported.destination.folder), v => setDestUrl(v.url), 'Destino abierto en un proceso nuevo.')}>Abrir el destino en un proceso nuevo</button></div>
        {destUrl ? <p>Destino en marcha: <a href={destUrl} target="_blank" rel="noreferrer">{destUrl}</a>. Allí concilias la operación incierta con el ID correcto: no se recrea.</p> : null}
        <p><a className="rc-btn" href={'/api/capsule/report.html?name=' + encodeURIComponent(inspection?.name ?? selected)} download>Descargar informe comparativo (HTML)</a> <a className="rc-btn" href={'/api/capsule/report.json?name=' + encodeURIComponent(inspection?.name ?? selected)} download>JSON</a></p></>
        : <p className="rc-hint">Todavía no se ha importado ninguna cápsula en esta sesión.</p>}
      <h3>Límites</h3><ul>{kit.limits.map(l => <li key={l}>{l}</li>)}</ul><h3>Lo que no se demuestra</h3><ul>{kit.notProven.map(l => <li key={l}>{l}</li>)}</ul>
    </section> : null}
  </main>;
}
