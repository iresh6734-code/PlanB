import {useEffect,useId,useRef,useState} from 'react';
import {ChevronDown,ChevronUp,FileCheck2,RefreshCw} from 'lucide-react';
import {DEFAULT_CONTINUITY_EVIDENCE_QUERY,type ContinuityEvidenceQuery} from '../shared/continuity-evidence-api.js';
import {loadContinuityEvidence,EvidenceReadError,type EvidenceViewData} from './continuity-evidence-client.js';

const dates=new Intl.DateTimeFormat('es-ES',{timeZone:'Europe/Madrid',dateStyle:'medium',timeStyle:'short'});
const date=(at:string|number)=>dates.format(new Date(at))+' · Madrid';
const labels={ready:'Preparado según esta evidencia','at-risk':'Fuera de objetivo',unproven:'Preparación sin comprobar',blocked:'Requiere atención'};
export interface ContinuityEvidenceProps{active?:boolean;load?:typeof loadContinuityEvidence;onUnlock?:()=>void}
/** Read-only extension of Plan B. No evidence editing, automatic queries, retries, polling or persistence. */
export function ContinuityEvidence({active=true,load=loadContinuityEvidence,onUnlock}:ContinuityEvidenceProps){
  const id=useId(),[open,setOpen]=useState(true),[selection,setSelection]=useState<ContinuityEvidenceQuery>({...DEFAULT_CONTINUITY_EVIDENCE_QUERY});
  const [data,setData]=useState<EvidenceViewData|null>(null),[error,setError]=useState<EvidenceReadError|null>(null),[busy,setBusy]=useState(false);
  const generation=useRef(0),pending=useRef<AbortController|null>(null),pin=useRef<string|undefined>(undefined);
  function cancel(){generation.current++;pending.current?.abort();pending.current=null;setBusy(false);setData(null);setError(null);}
  useEffect(()=>{if(!active){generation.current++;pending.current?.abort();pending.current=null;pin.current=undefined;setData(null);setError(null);setBusy(false);}return()=>{generation.current++;pending.current?.abort();pending.current=null;};},[active]);
  function choose(next:ContinuityEvidenceQuery){cancel();setSelection(next);}
  async function read(fresh=false){
    if(pending.current||!active||!open)return;if(fresh)pin.current=undefined;
    const ticket=++generation.current,controller=new AbortController();pending.current=controller;setBusy(true);setData(null);setError(null);
    try{const result=await load(selection,{revision:pin.current,signal:controller.signal});if(ticket!==generation.current||controller.signal.aborted)return;pin.current=result.context.revision;setData(result);}
    catch(e){if(ticket!==generation.current||controller.signal.aborted)return;setError(e instanceof EvidenceReadError?e:new EvidenceReadError('network','No se pudo completar la consulta. Vuelve a intentarlo.'));}
    finally{if(ticket===generation.current){pending.current=null;setBusy(false);}}
  }
  if(!active)return null;
  const toggle=()=>{cancel();pin.current=undefined;setOpen(!open);};
  const e=data?.evaluation,w=data?.facts.workload;
  return <section className="cev" aria-labelledby={id+'-title'}>
    <header className="cev-header"><div><h2 id={id+'-title'}>Evidencia de tu copia</h2><p>Consulta lo que está guardado y lo que aún falta demostrar. Esta vista no cambia registros ni ejecuta una recuperación.</p></div>
      <button type="button" className="cev-toggle" onClick={toggle} aria-expanded={open} aria-controls={id+'-content'}>{open?<ChevronUp size={16} aria-hidden="true"/>:<ChevronDown size={16} aria-hidden="true"/>}{open?'Ocultar evidencia':'Mostrar evidencia'}</button>
    </header>
    {open?<div id={id+'-content'}>
      <div className="cev-query" aria-label="Consulta de evidencia">
        <div className="cev-field"><label htmlFor={id+'-scenario'}>Escenario</label><select id={id+'-scenario'} value={selection.scenario} onChange={event=>choose({...selection,scenario:event.target.value as ContinuityEvidenceQuery['scenario']})}><option value="crm-outage">Caída del CRM</option><option value="device-loss">Pérdida del equipo</option></select></div>
        <div className="cev-field"><label htmlFor={id+'-window'}>Duración de la caída</label><select id={id+'-window'} value={selection.outageMinutes} onChange={event=>choose({...selection,outageMinutes:Number(event.target.value)})}>{[8,24,72,168].map(h=><option key={h} value={h*60}>{h} horas</option>)}</select></div>
        <button type="button" className="cev-primary" aria-disabled={busy} onClick={()=>void read(error?.code==='stale')}><RefreshCw size={16} aria-hidden="true"/>{busy?'Consultando…':error?.code==='stale'?'Actualizar referencia y consultar':data?'Consultar de nuevo':'Consultar evidencia'}</button>
      </div>
      <p className="cev-help">Objetivos de esta consulta: captura de hasta 1 hora; recuperación de hasta 15 minutos; evidencia de hasta 24 horas. Son objetivos, no tiempos demostrados.</p>
      <div className="cev-live" aria-live="polite" aria-atomic="true">{busy?'Leyendo y comprobando la referencia local…':data?'Lectura completada. '+labels[data.evaluation.status]:''}</div>
      {error?<div className="cev-error" role="alert"><strong>No hay una evaluación utilizable.</strong><p>{error.message}</p>{error.code==='locked'&&onUnlock?<button type="button" className="cev-secondary" onClick={onUnlock}>Desbloquear copia</button>:null}</div>:null}
      {!busy&&!data&&!error?<div className="cev-empty"><FileCheck2 size={28} aria-hidden="true"/><div><h3>Empieza por revisar la referencia local</h3><p>Verás la captura examinada, las tareas que se pueden situar en el tiempo y los límites de los informes guardados. Solo se consulta al pulsar el botón.</p></div></div>:null}
      {data&&e&&w?<div className="cev-result" data-testid="evidence-result">
        <div className="cev-verdict"><div><h3>{labels[e.status]}</h3><p data-testid="evidence-scenario">{e.scenario==='crm-outage'?'Caída del CRM':'Pérdida del equipo'} · {data.parameters.outageMinutes/60} horas examinadas</p><p>La lectura se ha completado. Comprobar una copia no demuestra por sí solo que puedas recuperarte en otro equipo.</p></div><span className="cev-origin">{data.facts.snapshot.isTestData?'Datos de prueba':'Datos locales'}</span></div>
        <dl className="cev-reference"><div><dt>Captura examinada</dt><dd>{date(data.facts.snapshot.capturedAt)}</dd></div><div><dt>Comprobación local</dt><dd>{date(data.facts.snapshot.locallyCheckedAt)}</dd></div></dl>
        <div className="cev-columns"><div>
          <h3>Tareas de esta revisión</h3><dl className="cev-totals"><div><dt>Inventario local</dt><dd>{w.total}</dd></div><div><dt>Abiertas confirmadas</dt><dd>{w.knownOpen}</dd></div><div><dt>Completadas</dt><dd>{w.completed}</dd></div></dl>
          {e.exposure?<><h4>Vencimientos durante {selection.outageMinutes/60} horas</h4><dl className="cev-exposure"><div><dt>Vencidas antes de la caída</dt><dd>{e.exposure.overdueTasks}</dd></div><div><dt>Vencen durante la caída</dt><dd>{e.exposure.tasksDueDuringOutage}</dd></div><div><dt>Sin fecha</dt><dd>{e.exposure.tasksWithoutDate}</dd></div></dl><p className="cev-help">Ventana: {date(e.evaluatedAt)} a {date(e.evaluatedAt+selection.outageMinutes*60_000)}, incluidos ambos extremos. Solo cubre las tareas locales aportadas.</p></>:<div className="cev-unknown"><h4>Sin exposición calculable</h4><p>No se pueden situar todas las tareas con la precisión necesaria. Esto no equivale a cero tareas expuestas.</p><ul>{w.dateOnly>0?<li>{w.dateOnly} tareas tienen un día de vencimiento, sin hora. No se les asigna medianoche.</li>:null}{w.unknownStatus>0?<li>{w.unknownStatus} tareas tienen un estado que no permite confirmar si están abiertas.</li>:null}{w.invalidDates>0?<li>{w.invalidDates} tareas tienen una fecha que necesita revisión.</li>:null}</ul></div>}
        </div><div className="cev-evidence"><h3>Qué está demostrado</h3><dl>
          <div><dt>Estructura de la copia</dt><dd>Comprobada localmente: esquema, conciliación e historial. No verifica el estado actual del portal.</dd></div>
          <div><dt>Tiempo de recuperación</dt><dd>No medido. {data.facts.technicalReports.declaredPassed} informes técnicos declaran un resultado correcto; su duración no mide recuperar un flujo de trabajo.</dd></div>
          <div><dt>Exportación de esta revisión</dt><dd>{!data.facts.export.present?'No consta un registro de exportación.':data.facts.export.matchesActiveRevision?'Hay un registro de exportación de esta revisión.':'El registro de exportación no acredita esta revisión.'} Los bytes del archivo no se han examinado aquí.</dd></div>
          <div><dt>Custodia fuera del ordenador</dt><dd>{data.facts.export.custodyDeclared?'Declarada para esta revisión; esta consulta no la comprueba.':'No demostrada para esta revisión.'}</dd></div>
          <div><dt>Restauración en otro equipo</dt><dd>No demostrada. Un simulacro local no sustituye esa prueba.</dd></div>
        </dl></div></div>
        <div className="cev-next"><h3>Qué falta comprobar</h3><ul>{e.nextActions.map(action=><li key={action}>{action}</li>)}</ul></div>
        <details className="cev-details"><summary>Procedencia y límites de esta lectura</summary><p>Referencia de revisión: <code>{data.context.revision}</code></p><p>Captura: <code>{data.context.captureId}</code></p><ul>{data.limitations.map(line=><li key={line}>{line}</li>)}</ul></details>
      </div>:null}
    </div>:null}
  </section>;
}
