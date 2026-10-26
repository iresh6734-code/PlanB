import { useState } from 'react';
import { ArrowRight, Check, CheckCircle2, ChevronRight, Database, Info, Link2, ShieldCheck, Sparkles } from 'lucide-react';
import type { AppState } from '../shared/model.js';
import { api, post, ApiError } from './api.js';
import { Modal, Spinner } from './components.js';

interface Props {
  state: AppState; step: number; setStep: (step: number) => void; refresh: () => Promise<AppState>;
  openWorkspace: () => void; configure: () => void; onConnect:()=>void; onError: (error: string) => void;
}
export function Preparation({ state, step, setStep, refresh, openWorkspace, configure, onConnect, onError }: Props) {
  const [profile, setProfile] = useState<'agency' | 'distribution'>('agency');
  const [busy, setBusy] = useState(false);
  const [prompt, setPrompt] = useState(state.generation?.prompt ?? '');
  const [reviewed, setReviewed] = useState(false);

  const [replace, setReplace] = useState(false);
  const run = async (fn: () => Promise<unknown>, next?: number) => {
    setBusy(true); onError('');
    try { await fn(); await refresh(); if (next !== undefined) { setStep(next); setReviewed(false); } }
    catch (failure) { onError(failure instanceof Error ? failure.message : 'No se pudo completar la operación.'); await refresh(); }
    finally { setBusy(false); }
  };
  return <section className="preparation">
    <header className="prepare-heading"><div><h1>Tu CRM, con un plan B.</h1><p className="page-subtitle">Prepara una aplicación independiente con tus datos y procesos.</p></div><span className="badge"><span className="dot" />Local · Datos de ensayo</span></header>
    <div className="stepper" aria-label="Pasos de preparación">{['Origen', 'Procesos', 'Generar', 'Exportar'].map((label, index) => <div key={label} className={index === step ? 'current' : index < step ? 'done' : ''}><span>{index < step ? <Check size={14} /> : index + 1}</span>{label}{index < 3 ? <i /> : null}</div>)}</div>
    {step === 0 ? <>
      <div className="prepare-columns"><div><h2>Empieza con un CRM de ensayo</h2><p className="muted">Elige un negocio ficticio. Verás cómo se adapta la aplicación.</p>
        <div className="profile-options">
          {([{ id: 'agency', name: 'Agencia Norte', text: 'Clientes, servicios y oportunidades comerciales', icon: 'AN' }, { id: 'distribution', name: 'Distribuidora Atlas', text: 'Clientes, pedidos y fechas de entrega', icon: 'DA' }] as const).map(option =>
            <button key={option.id} className={'profile-option ' + (profile === option.id ? 'chosen' : '')} onClick={() => setProfile(option.id)} aria-pressed={profile === option.id}>
              <span className="profile-initials">{option.icon}</span><span><strong>{option.name}</strong><small>{option.text}</small></span><span className="radio-mark">{profile === option.id ? <Check size={12} /> : null}</span></button>)}
        </div><div className="count-grid">{[['24', 'Clientes'], ['8', 'Empresas'], ['12', 'Oportunidades'], ['18', 'Tareas']].map(([count, label]) => <div key={label}><strong>{count}</strong><span>{label}</span></div>)}</div>
        <div className="connect-source"><h3>¿Ya tienes HubSpot?</h3><p className="muted">Conecta y revisa el alcance desde la preparación guiada, con una única credencial cifrada por portal.</p><button className="button secondary" disabled={busy} onClick={onConnect}><Link2 size={17} />Conectar HubSpot</button>
          {state.disconnected ? <p className="helper">Habilita los servicios desde la aplicación para importar un origen externo.</p> : null}</div>
        {state.changes > 0 ? <div className="info-box"><Info size={18} /><div><p>Tienes {state.changes} cambios locales. Descarga una copia antes de sustituir este origen.</p><label className="checkbox-label"><input type="checkbox" checked={replace} onChange={e => setReplace(e.target.checked)} />He exportado mis cambios y quiero sustituir el origen.</label></div></div> : null}
      </div><aside className="preserve-panel"><ShieldCheck size={25} /><h2>Lo que conservaremos</h2>
        <ul>{['Clientes y empresas', 'Oportunidades y sus etapas', 'Tareas y relaciones', 'Campos personalizados', 'Reglas compatibles y su origen'].map(label => <li key={label}><Check size={17} />{label}</li>)}</ul>
        <div><h3>Una copia que funciona</h3><p>Después de prepararla, podrás desconectar el origen y seguir trabajando en este ordenador.</p></div></aside></div>
      <footer className="prepare-footer"><span className="muted"><Database size={15} />Esta selección utiliza datos ficticios.</span><button className="button primary" disabled={busy || state.changes > 0 && !replace}
        onClick={() => run(() => post('/import/fixture', { profile, replace }), 1)}>{busy ? <Spinner /> : <>Continuar con {profile === 'agency' ? 'Agencia Norte' : 'Distribuidora Atlas'}<ArrowRight size={17} /></>}</button></footer>
    </> : step === 1 && state.snapshot ? <>
      <div className="section-heading"><div><h2>Datos recuperados. Procesos claros.</h2><p className="muted">{state.snapshot.name} · {state.snapshot.source.kind === 'fixture' ? 'Conjunto ficticio incluido' : 'Cuenta de prueba verificada de HubSpot'}</p></div>
        <span className="success-label"><CheckCircle2 size={17} />Captura conciliada</span></div>
      <div className="import-report">{state.snapshot.entities.map(entity => <div key={entity.id}><strong>{state.reconciliation?.counts[entity.id]?.actual ?? 0}</strong><span>{entity.label}</span><small>{entity.fields.length} campos</small></div>)}<div><strong>{state.reconciliation?.actualLinks}</strong><span>Relaciones</span><small>Con destino verificado</small></div></div>
      <div className="process-grid"><div><h3>Etapas de oportunidades</h3><div className="stage-chips">{state.snapshot.stages.map(stage => <span key={stage.id}><i style={{ background: stage.color }} />{stage.label}</span>)}</div>
        <h3>Reglas recuperadas</h3><RuleList rules={state.snapshot.rules} />
      </div><div><label className="field"><span>¿Qué más debe respetar la aplicación?</span><textarea rows={6} value={prompt} maxLength={8000} onChange={event => setPrompt(event.target.value)} placeholder="Ejemplo: el importe de una oportunidad debe ser de al menos 100 euros." /></label>
        <p className="helper">La IA puede proponer reglas de campos obligatorios, correos, importes y transiciones. Cada regla nueva conservará una cita de tu instrucción. Revísala antes de activar.</p>
        <div className="info-box"><Info size={18} /><div><strong>Configura la IA cuando quieras</strong><p>Sin proveedor puedes probar una especificación de ensayo. Esta opción conserva las reglas importadas y no interpreta instrucciones nuevas.</p><button className="text-button" onClick={configure}>Configurar proveedor<ChevronRight size={14} /></button></div></div></div></div>
      <footer className="prepare-footer"><button className="text-button" onClick={() => setStep(0)}>Volver al origen</button><div className="button-row">
        <button className="button secondary" disabled={busy} onClick={() => run(() => post('/generate', { mode: 'demo' }), 2)}>{busy ? <Spinner /> : state.snapshot?.source.isTestData===false?'Preparar con la configuración importada':'Crear especificación de ensayo'}</button>
        <button className="button primary" disabled={busy || !state.aiConfigured || state.disconnected || state.snapshot?.source.isTestData===false} onClick={() => run(() => post('/generate', { mode: 'ai', prompt }), 2)}><Sparkles size={17} />Generar con mi IA</button></div></footer>
      {!state.aiConfigured ? <p className="helper align-right">Añade tu proveedor para habilitar la generación real.</p> : null}
    </> : <>
      <div className="section-heading"><div><h2>{state.spec ? 'Revisa tu aplicación.' : 'Prepara primero una especificación.'}</h2><p className="muted">{state.generation?.provider === 'ai' ? 'Generada con ' + state.generation.model : 'Especificación de ensayo · sin llamada a una IA'}</p></div><ShieldCheck className="blue" size={28} /></div>
      {state.lastError ? <div className="error-box" role="alert">{state.lastError}</div> : null}
      {state.spec ? <><div className="review-grid">{state.spec.entities.map(entity => <article key={entity.id}><h3>{entity.label}</h3><p>{entity.fields.length} campos · {entity.columns.length} columnas</p><small>{entity.fields.map(f => f.label).join(' · ')}</small></article>)}</div>
        <div className="process-grid"><div><h3>Reglas que se aplicarán</h3><RuleList rules={state.spec.rules} /></div><div><h3>Pendiente de cobertura</h3><ul className="plain-list">{state.spec.coverage.unsupported.map(item => <li key={item}>{item}</li>)}</ul></div></div>
        <label className="review-approval checkbox-label"><input type="checkbox" checked={reviewed} onChange={event => setReviewed(event.target.checked)} />He revisado los campos, las reglas y las funciones pendientes.</label>
        <footer className="prepare-footer"><button className="text-button" onClick={() => setStep(1)}>Volver a procesos</button>
          <button className="button primary" disabled={!reviewed || busy || !!state.lastError} onClick={() => run(async () => { await post('/activate', { reviewed: true }); await refresh(); openWorkspace(); })}>
            {busy ? <Spinner /> : <>Activar y abrir aplicación<ArrowRight size={17} /></>}</button></footer></> : <button className="button primary" onClick={() => setStep(1)}>Ir a procesos</button>}
    </>}
  </section>;
}
function RuleList({ rules }: { rules: NonNullable<AppState['spec']>['rules'] }) {
  return <div className="rule-list">{rules.length ? rules.map(rule => <article key={rule.id}><p>{rule.description}</p><span className={'provenance ' + rule.origin}>{rule.origin === 'configuration' ? 'Configuración importada' : 'Instrucción del usuario'}</span><small>{rule.evidence}</small></article>) : <p className="muted">No se han recuperado reglas adicionales.</p>}</div>;
}
