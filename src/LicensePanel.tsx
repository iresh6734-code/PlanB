import { useEffect, useId, useState } from 'react';
import { BadgeCheck, Check, Hourglass, Minus } from 'lucide-react';
import { checkLicense, FEATURES, LICENSE_PREFIX, PLAN_LABEL, type LicenseState, type PlanId } from '../shared/license.js';
import { effectivePlan, TRIAL_DAYS } from '../shared/plans.js';
import { currentTrial, LICENSE_KEY, refreshPlan, startTrial } from './app-shell/plan-access.js';
import './license-panel.css';

// Plan y licencia (super plan M1): muestra el plan, compara lo que incluye cada uno y activa una licencia pegada.
// La licencia se comprueba en este equipo con la clave pública incluida y se guarda solo en este navegador; no se envía.
const STORAGE_KEY = LICENSE_KEY;
const PLANS: PlanId[] = ['personal', 'pro', 'team'];
const read = () => { try { return localStorage.getItem(STORAGE_KEY) ?? ''; } catch { return ''; } };
const write = (value: string | null) => { try { if (value) localStorage.setItem(STORAGE_KEY, value); else localStorage.removeItem(STORAGE_KEY); } catch { /* sin almacenamiento: la licencia dura la sesión */ } refreshPlan(); };
const TONE: Record<LicenseState['status'], 'ok' | 'warn' | 'danger' | 'neutral'> = { none: 'neutral', malformed: 'danger', unverifiable: 'warn', invalid: 'danger', expired: 'warn', grace: 'warn', active: 'ok' };
const day = new Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Madrid', day: 'numeric', month: 'long' });

export function LicensePanel() {
  const [stored, setStored] = useState(read), [state, setState] = useState<LicenseState | null>(null);
  const [draft, setDraft] = useState(''), [attempt, setAttempt] = useState<LicenseState | null>(null), [busy, setBusy] = useState(false);
  const [trial, setTrial] = useState(() => currentTrial());
  const titleId = useId(), fieldId = useId(), helpId = useId();
  useEffect(() => { let live = true; void checkLicense(stored, new Date()).then(next => { if (live) setState(next); }); return () => { live = false; }; }, [stored]);
  const activate = async () => {
    setBusy(true);
    const next = await checkLicense(draft, new Date());
    setBusy(false); setAttempt(next);
    if (next.status === 'active' || next.status === 'grace') { write(draft.trim()); setStored(draft.trim()); setDraft(''); }
  };
  const remove = () => { write(null); setStored(''); setAttempt(null); };
  const plan = effectivePlan(state?.plan ?? 'personal', trial);
  const licensedPersonal = (state?.plan ?? 'personal') === 'personal';
  const beginTrial = () => { startTrial(); setTrial(currentTrial()); };
  return <section className="license-page" aria-labelledby={titleId}>
    <header className="page-header"><div><h1 id={titleId}>Plan y licencia</h1><p className="page-subtitle">Lo que incluye cada plan. Sin licencia sigues en Personal y tus datos nunca se bloquean.</p></div></header>
    <article className="lp-current" data-tone={state ? TONE[state.status] : 'neutral'} aria-live="polite">
      <BadgeCheck size={22} aria-hidden="true"/>
      <div><p className="lp-current-title">{state?.title ?? 'Comprobando…'}</p><p className="lp-current-detail">{state?.detail ?? ''}</p>
        {state?.payload && (state.status === 'active' || state.status === 'grace') ? <p className="lp-current-meta">{state.payload.seats === 1 ? '1 puesto' : state.payload.seats + ' puestos'} · licencia {state.payload.id.slice(0, 8)}</p> : null}</div>
      {stored ? <button type="button" className="button secondary" onClick={remove}>Quitar licencia</button> : null}
    </article>
    {licensedPersonal && state ? <article className="lp-trial" data-status={trial.status} aria-live="polite">
      <Hourglass size={20} aria-hidden="true"/>
      <div>{trial.status === 'available' ? <><p className="lp-current-title">Prueba Pro {TRIAL_DAYS} días en este equipo</p><p className="lp-current-detail">Sin registro y sin conexión: solo se guarda en este navegador la fecha en que empieza. Al terminar vuelves a Personal sin perder nada.</p></>
        : trial.status === 'active' ? <><p className="lp-current-title">Prueba de Pro: {trial.daysLeft === 1 ? 'queda 1 día' : 'quedan ' + trial.daysLeft + ' días'}</p><p className="lp-current-detail">Termina el {day.format(new Date(trial.endsAt!))}. Las funciones Pro se marcan como incluidas mientras dure.</p></>
        : <><p className="lp-current-title">La prueba de Pro terminó el {day.format(new Date(trial.endsAt!))}</p><p className="lp-current-detail">Sigues en Personal. Tus datos, la exportación y la recuperación nunca se bloquean.</p></>}</div>
      {trial.status === 'available' ? <button type="button" className="button primary" onClick={beginTrial}>Empezar la prueba</button> : null}
    </article> : null}
    <div className="lp-grid">
      <table className="lp-plans">
        <caption>Qué incluye cada plan</caption>
        <thead><tr><th scope="col">Función</th>{PLANS.map(id => <th key={id} scope="col" data-current={id === plan ? 'true' : undefined}>{PLAN_LABEL[id]}{id === plan ? <small>{trial.status === 'active' && licensedPersonal ? 'En prueba' : 'Tu plan'}</small> : null}</th>)}</tr></thead>
        <tbody>{FEATURES.map(feature => <tr key={feature.id}><th scope="row">{feature.label}</th>{PLANS.map(id => <td key={id} data-current={id === plan ? 'true' : undefined}>
          {feature.plans.includes(id) ? <><Check size={16} aria-hidden="true"/><span className="sr-only">Incluido</span></> : <><Minus size={16} aria-hidden="true" className="lp-no"/><span className="sr-only">No incluido</span></>}</td>)}</tr>)}</tbody>
      </table>
      <form className="lp-activate" onSubmit={event => { event.preventDefault(); if (draft.trim() && !busy) void activate(); }}>
        <h2>Activar una licencia</h2>
        <label htmlFor={fieldId}>Pega aquí el texto que recibiste</label>
        <textarea id={fieldId} aria-describedby={helpId} rows={5} spellCheck={false} autoComplete="off" value={draft} placeholder={LICENSE_PREFIX + '.…'} onChange={event => { setDraft(event.target.value); setAttempt(null); }}/>
        <p id={helpId} className="lp-help">Se comprueba en este equipo, sin conexión, y se guarda solo en este navegador. No se envía a ningún sitio.</p>
        {attempt && attempt.status !== 'active' && attempt.status !== 'grace' ? <p className="lp-error" role="alert"><strong>{attempt.title}.</strong> {attempt.detail}</p> : null}
        {attempt && (attempt.status === 'active' || attempt.status === 'grace') ? <p className="lp-ok" role="status">Licencia activada.</p> : null}
        <button type="submit" className="button primary" disabled={!draft.trim() || busy}>{busy ? 'Comprobando…' : 'Activar'}</button>
      </form>
    </div>
  </section>;
}
