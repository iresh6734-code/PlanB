import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Check, CheckCircle2, ChevronRight, Database, Info, Link2, ShieldCheck, Sparkles } from 'lucide-react';
import type { AppState } from '../shared/model.js';
import { api, post, ApiError } from './api.js';
import { Modal, Spinner } from './components.js';
import { preparationTarget, type ActivationReview } from '../shared/activation-review.js';
import './preparation-review.css';

interface Props {
  state: AppState; step: number; setStep: (step: number) => void; refresh: () => Promise<AppState>;
  openWorkspace: () => void; configure: () => void; onConnect:()=>void; onError: (error: string) => void;
}
export function Preparation({ state:sourceState, step, setStep, refresh, openWorkspace, configure, onConnect, onError }: Props) {
  const target=preparationTarget(sourceState);
  const [profile, setProfile] = useState<'agency' | 'distribution'>('agency');
  const [busy, setBusy] = useState(false);
  const [prompt, setPrompt] = useState(target.generation?.prompt ?? '');
  const [reviewed, setReviewed] = useState<string|null>(null);
  const [reviewResponse,setReviewResponse]=useState<{key:string;data:ActivationReview}|null>(null),[reviewError,setReviewError]=useState<{key:string;message:string}|null>(null),[nonce,setNonce]=useState(0);
  const alive=useRef(true),flight=useRef(false),controller=useRef<AbortController|null>(null);
  const sourceKey=JSON.stringify([sourceState.candidate,sourceState.snapshot?.id,sourceState.snapshot?.capturedAt,sourceState.spec,sourceState.generation,sourceState.reconciliation,sourceState.changes,sourceState.ready,sourceState.lastError]);
  const reviewKey=JSON.stringify([sourceKey,step,nonce]),latest=useRef({key:reviewKey,revision:null as string|null,checked:null as string|null});
  const review=reviewResponse?.key===reviewKey?reviewResponse.data:null;
  const approvalKey=review?JSON.stringify([reviewKey,review.revision]):null;
  latest.current={key:reviewKey,revision:review?.revision??null,checked:reviewed};
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;controller.current?.abort();};},[]);
  useEffect(()=>{
    setReviewed(null);setReviewResponse(null);setReviewError(null);
    controller.current?.abort();if(step<2)return;
    const abort=new AbortController();controller.current=abort;let current=true;
    void api<ActivationReview>('/v4/activation-review',{signal:abort.signal}).then(data=>{
      if(!current||abort.signal.aborted||!alive.current||latest.current.key!==reviewKey)return;
      if(!/^[a-f0-9]{64}$/.test(data.revision)||!['candidate','initial','active'].includes(data.kind)||typeof data.canActivate!=='boolean'||!data.target||!Array.isArray(data.reasons))throw Error('La respuesta de revisión no es compatible. No se habilita la activación.');
      setReviewResponse({key:reviewKey,data});setReviewError(null);
    }).catch(error=>{if(current&&!abort.signal.aborted&&alive.current&&latest.current.key===reviewKey)setReviewError({key:reviewKey,message:error instanceof ApiError&&error.status===404?'Esta versión del servidor no permite activar una revisión exacta. Actualiza Plan B antes de continuar.':error instanceof Error?error.message:'No se pudo revisar la preparación.'});});
    return()=>{current=false;abort.abort();};
  },[reviewKey,step]);
  const state=review&&step>=2?{...target,snapshot:review.target.snapshot,spec:review.target.spec,generation:review.target.generation,reconciliation:review.target.reconciliation,lastError:review.target.error}:target;

  const [replace, setReplace] = useState(false);
  const production=state.snapshot?.source.isTestData===false;
  const run = async (fn: () => Promise<unknown>, next?: number,after?:()=>void) => {
    if(flight.current||!alive.current)return;flight.current=true;
    setBusy(true); onError('');
    try { await fn(); if(!alive.current)return;await refresh();if(!alive.current)return;if(next!==undefined){setStep(next);setReviewed(null);}after?.(); }
    catch (failure) { if(!alive.current)return;onError(failure instanceof Error ? failure.message : 'No se pudo completar la operación.');try{await refresh();}catch{if(alive.current)onError('No se pudo completar o actualizar la preparación. Vuelve a consultar su estado antes de continuar.');} }
    finally { if(alive.current){flight.current=false;setBusy(false);} }
  };
  const activate=()=>{
    if(!review||!review.canActivate||reviewed!==approvalKey||latest.current.key!==reviewKey||latest.current.revision!==review.revision||latest.current.checked!==approvalKey)return;
    const revision=review.revision;
    void run(async()=>{try{const result=await post<{ready:boolean;reviewedRevision:string}>('/v4/activate-reviewed',{reviewed:true,revision});if(!result.ready||result.reviewedRevision!==revision)throw Error('El servidor no confirmó la revisión activada. Consulta el estado antes de repetir.');}catch(error){if(alive.current){setReviewed(null);setNonce(n=>n+1);}throw error;}},undefined,openWorkspace);
  };
  return <section className="preparation">
    <header className="prepare-heading"><div><h1>Tu CRM, con un plan B.</h1><p className="page-subtitle">Prepara una aplicación independiente con tus datos y procesos.</p></div><span className="badge"><span className="dot" />{production?'Producción · lectura':'Local · Datos de prueba'}</span></header>
    <div className="stepper" aria-label="Pasos de preparación">{['Origen', 'Procesos', 'Generar', 'Exportar'].map((label, index) => <div key={label} className={index === step ? 'current' : index < step ? 'done' : ''}><span>{index < step ? <Check size={14} /> : index + 1}</span>{label}{index < 3 ? <i /> : null}</div>)}</div>
    {step === 0 ? <>
      <div className="prepare-columns"><div><h2>Empieza con un CRM de ensayo</h2><p className="muted">Elige un negocio ficticio. Verás cómo se adapta la aplicación.</p>
        <div className="profile-options">
          {([{ id: 'agency', name: 'Agencia Norte', text: 'Clientes, servicios y oportunidades comerciales', icon: 'AN' }, { id: 'distribution', name: 'Distribuidora Atlas', text: 'Clientes, pedidos y fechas de entrega', icon: 'DA' }] as const).map(option =>
            <button key={option.id} className={'profile-option ' + (profile === option.id ? 'chosen' : '')} disabled={busy} onClick={() => {if(!flight.current)setProfile(option.id);}} aria-pressed={profile === option.id}>
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
      <div className="section-heading"><div><h2>Datos recuperados. Procesos claros.</h2><p className="muted">{state.snapshot.name} · {state.snapshot.source.kind === 'fixture' ? 'Conjunto ficticio incluido' : production?'HubSpot · producción en lectura':'Cuenta de prueba verificada de HubSpot'}</p></div>
        <span className="success-label"><CheckCircle2 size={17} />Captura conciliada</span></div>
      <div className="import-report">{state.snapshot.entities.map(entity => <div key={entity.id}><strong>{state.reconciliation?.counts[entity.id]?.actual ?? 0}</strong><span>{entity.label}</span><small>{entity.fields.length} campos</small></div>)}<div><strong>{state.reconciliation?.actualLinks}</strong><span>Relaciones</span><small>Con destino verificado</small></div></div>
      <div className="process-grid"><div><h3>Etapas de oportunidades</h3><div className="stage-chips">{state.snapshot.stages.map(stage => <span key={stage.id}><i style={{ background: stage.color }} />{stage.label}</span>)}</div>
        <h3>Reglas recuperadas</h3><RuleList rules={state.snapshot.rules} />
      </div><div>{production?<div className="info-box"><Info size={18}/><div><strong>Configuración importada</strong><p>Se conservarán los campos y reglas de esta captura. La IA está desactivada para datos reales; revisa el alcance y las funciones pendientes antes de activar.</p></div></div>:<><label className="field"><span>¿Qué más debe respetar la aplicación?</span><textarea rows={6} value={prompt} maxLength={8000} onChange={event => setPrompt(event.target.value)} placeholder="Ejemplo: el importe de una oportunidad debe ser de al menos 100 euros." /></label>
        <p className="helper">La IA puede proponer reglas de campos obligatorios, correos, importes y transiciones. Cada regla nueva conservará una cita de tu instrucción. Revísala antes de activar.</p>
        <div className="info-box"><Info size={18} /><div><strong>Configura la IA cuando quieras</strong><p>Sin proveedor puedes probar una especificación de ensayo. Esta opción conserva las reglas importadas y no interpreta instrucciones nuevas.</p><button className="text-button" onClick={configure}>Configurar proveedor<ChevronRight size={14} /></button></div></div></>}</div></div>
      <footer className="prepare-footer"><button className="text-button" onClick={() => setStep(0)}>Volver al origen</button><div className="button-row">
        <button className="button secondary" disabled={busy} onClick={() => run(() => post('/generate', { mode: 'demo' }), 2)}>{busy ? <Spinner /> : state.snapshot?.source.isTestData===false?'Preparar con la configuración importada':'Crear especificación de ensayo'}</button>
        {!production?<button className="button primary" disabled={busy || !state.aiConfigured || state.disconnected} onClick={() => run(() => post('/generate', { mode: 'ai', prompt }), 2)}><Sparkles size={17} />Generar con mi IA</button>:null}</div></footer>
      {!production&&!state.aiConfigured ? <p className="helper align-right">Añade tu proveedor para habilitar la generación real.</p> : null}
    </> : <>
      <div className="preparation-review-tools"><button type="button" className="button secondary" disabled={busy} onClick={()=>{setReviewed(null);setNonce(n=>n+1);}}>Actualizar revisión</button><p className="helper">La activación debe corresponder exactamente al contenido que revisas aquí.</p></div>
      {!review?(reviewError?.key===reviewKey?<p className="error-box" role="alert">{reviewError.message}</p>:<Spinner text="Leyendo la versión que se activará…"/>):<>
      <p className="preparation-review-identity">{review.kind==='candidate'?'Versión candidata · todavía no sustituye la copia activa':review.kind==='initial'?'Primera activación':'Versión activa'} · {review.target.snapshot?.name??'Sin captura'}<br/>Revisión {review.revision.slice(0,12)} · {review.records} registros{review.replacesRecords?' · sustituirá los registros del espacio activo':' · conservará los registros del espacio activo'}</p>
      {review.replacesRecords&&review.localChanges>0?<p className="warning-text">Hay {review.localChanges} operaciones locales en el espacio activo. Esta candidata sustituirá sus registros e historial; conserva una exportación antes de continuar.</p>:null}
      {review.reasons.length?<div className="info-box"><ul>{review.reasons.map((reason,index)=><li key={index}>{reason}</li>)}</ul></div>:null}
      <div className="section-heading"><div><h2>{state.spec ? 'Revisa tu aplicación.' : 'Prepara primero una especificación.'}</h2><p className="muted">{state.generation?.provider === 'ai' ? 'Generada con ' + state.generation.model : production?'Configuración importada · sin llamada a una IA':'Especificación de ensayo · sin llamada a una IA'}</p></div><ShieldCheck className="blue" size={28} /></div>
      {state.lastError ? <div className="error-box" role="alert">{state.lastError}</div> : null}
      {state.spec ? <><div className="review-grid">{state.spec.entities.map(entity => <article key={entity.id}><h3>{entity.label}</h3><p>{entity.fields.length} campos · {entity.columns.length} columnas</p><small>{entity.fields.map(f => f.label).join(' · ')}</small></article>)}</div>
        <div className="process-grid"><div><h3>Reglas que se aplicarán</h3><RuleList rules={state.spec.rules} /></div><div><h3>Pendiente de cobertura</h3><ul className="plain-list">{state.spec.coverage.unsupported.map(item => <li key={item}>{item}</li>)}</ul></div></div>
        <label className="review-approval checkbox-label"><input type="checkbox" checked={reviewed===approvalKey} disabled={busy||!review.canActivate} onChange={event => {if(!flight.current&&latest.current.key===reviewKey)setReviewed(event.target.checked?approvalKey:null);}} />He revisado los campos, las reglas y las funciones pendientes.</label>
        <footer className="prepare-footer"><button className="text-button" onClick={() => setStep(1)}>Volver a procesos</button>
          <button className="button primary" disabled={reviewed!==approvalKey || !review.canActivate || busy || !!state.lastError} onClick={activate}>
            {busy ? <Spinner /> : <>Activar y abrir aplicación<ArrowRight size={17} /></>}</button></footer></> : <button className="button primary" onClick={() => setStep(1)}>Ir a procesos</button>}
      </>}
    </>}
  </section>;
}
function RuleList({ rules }: { rules: NonNullable<AppState['spec']>['rules'] }) {
  return <div className="rule-list">{rules.length ? rules.map(rule => <article key={rule.id}><p>{rule.description}</p><span className={'provenance ' + rule.origin}>{rule.origin === 'configuration' ? 'Configuración importada' : 'Instrucción del usuario'}</span><small>{rule.evidence}</small></article>) : <p className="muted">No se han recuperado reglas adicionales.</p>}</div>;
}
