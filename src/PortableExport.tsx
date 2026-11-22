import { useCallback, useEffect, useRef, useState } from 'react';
import { Download, FileJson } from 'lucide-react';
import { api, ApiError, download } from './api.js';
import { Spinner } from './components.js';
import { RUNTIME_ZIP } from '../shared/version.js';
import type { RecoveryCopy } from '../shared/operations.js';
import './portable-export.css';
interface ExportSummary { revision:string; captureId:string; name:string; capturedAt:string; records:number; changes:number; differsFromLatest:boolean }
export function PortableExport(){
  const [password,setPassword]=useState(''),[confirm,setConfirm]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const [summary,setSummary]=useState<ExportSummary|null>(null),[custody,setCustody]=useState<RecoveryCopy|null>(null),[custodyError,setCustodyError]=useState(false),[loading,setLoading]=useState(true);
  const [reviewed,setReviewed]=useState<string|null>(null),[done,setDone]=useState<{revision:string;kind:'package'|'encrypted'}|null>(null);
  const alive=useRef(true),sequence=useRef(0),controller=useRef<AbortController|null>(null),running=useRef(false);
  const load=useCallback(async()=>{
    const request=++sequence.current;controller.current?.abort();const abort=new AbortController();controller.current=abort;
    setLoading(true);setReviewed(null);setCustody(null);setCustodyError(false);setSummary(null);setDone(null);
    try{
      const [content,saved]=await Promise.allSettled([api<ExportSummary>('/v4/export-summary',{signal:abort.signal}),api<{recoveryCopy?:RecoveryCopy|null}>('/v2/continuity',{signal:abort.signal})]);
      if(!alive.current||abort.signal.aborted||request!==sequence.current)return;
      if(content.status==='rejected')throw content.reason;
      setSummary(content.value);if(saved.status==='fulfilled')setCustody(saved.value.recoveryCopy??null);else setCustodyError(true);
    }catch(f){if(alive.current&&!abort.signal.aborted&&request===sequence.current)setError(f instanceof ApiError&&f.status===404?'Esta versión instalada no permite revisar el contenido de la exportación. Actualiza Plan B.':(f as Error).message);}
    finally{if(alive.current&&!abort.signal.aborted&&request===sequence.current)setLoading(false);}
  },[]);
  useEffect(()=>{alive.current=true;void load();return()=>{alive.current=false;controller.current?.abort();sequence.current++;};},[load]);
  const run=async(kind:'package'|'encrypted')=>{
    if(running.current||loading)return;
    if(!summary||reviewed!==summary.revision){setError('Revisa el contenido de esta revisión antes de preparar la descarga.');return;}
    if(password.length<12||password.length>200||password!==confirm){setError('Usa entre 12 y 200 caracteres y repite la misma contraseña.');return;}
    const revision=summary.revision;running.current=true;setBusy(true);setError('');setDone(null);
    try{await download('/v2/export/'+kind,kind==='package'?RUNTIME_ZIP:'plan-b-copia-cifrada.json',{password,revision});if(alive.current){setDone({revision,kind});setPassword('');setConfirm('');setReviewed(null);const request=sequence.current;void api<{recoveryCopy?:RecoveryCopy|null}>('/v2/continuity').then(value=>{if(alive.current&&request===sequence.current){setCustody(value.recoveryCopy??null);setCustodyError(false);}}).catch(()=>{if(alive.current&&request===sequence.current)setCustodyError(true);});}}
    catch(f){if(alive.current){if(f instanceof ApiError&&f.status===401){window.dispatchEvent(new Event('planb:locked'));return;}setError((f as Error).message);await load();}}
    finally{running.current=false;if(alive.current)setBusy(false);}
  };
  const ready=!!summary&&reviewed===summary.revision&&!busy&&!loading&&password.length>=12&&password.length<=200&&password===confirm;
  const custodyCurrent=!!summary&&custody?.current===true&&custody.revision===summary.revision;
  // Misión maestra B4.7: el motivo del bloqueo va junto al botón, en vez de un botón deshabilitado sin explicación.
  const blockReason=busy||loading?null:!summary?'Primero hay que poder comprobar el contenido (paso 1).':reviewed!==summary.revision?'Marca «He revisado…» en el paso 1.':password.length<12?'La contraseña necesita al menos 12 caracteres.':password.length>200?'La contraseña admite como máximo 200 caracteres.':password!==confirm?'Las dos contraseñas no coinciden.':null;
  return <section className="export-page export-steps"><header className="page-header"><div><h1>Exportar</h1><p className="page-subtitle">Una aplicación independiente y una copia cifrada recuperable en otro equipo.</p></div></header>
    <div className="export-review-tools"><button type="button" className="button secondary" disabled={loading||busy} onClick={()=>{setError('');void load();}}>Actualizar contenido</button><p className="helper">La descarga corresponde al espacio activo, incluidos sus cambios locales.</p></div>
    {loading?<Spinner text="Comprobando el contenido de la exportación…"/>:summary?<div className="export-revision"><h2><span className="export-step-n" aria-hidden="true">1</span>Revisa qué contiene esta descarga</h2><p><strong>{summary.name}</strong> · espacio de trabajo activo</p><p>Captura del {new Date(summary.capturedAt).toLocaleString('es-ES')} · {summary.records} registros · {summary.changes} cambios locales incluidos</p><small>Captura: {summary.captureId}<br/>Revisión: {summary.revision.slice(0,12)}</small>{summary.differsFromLatest?<p className="warning-text">Hay otra captura más reciente en el historial. Esta descarga conserva el espacio activo y sus cambios; no sustituye esa otra captura.</p>:null}
      <label className="checkbox-label export-review-check"><input type="checkbox" disabled={busy} checked={reviewed===summary.revision} onChange={event=>setReviewed(event.target.checked?summary.revision:null)}/>He revisado la captura y los cambios incluidos en esta descarga.</label>
    </div>:<p className="helper">No se preparará una descarga hasta poder comprobar su contenido. Usa «Actualizar contenido» para volver a intentarlo.</p>}
    <section className="export-custody" aria-labelledby="export-custody-title"><h2 id="export-custody-title"><span className="export-step-n" aria-hidden="true">3</span>Qué consta de tu copia de recuperación</h2>
      {loading?<p className="muted">Consultando el estado…</p>:custodyError?<p className="warning-text">No se pudo consultar la custodia. No se ha supuesto que exista una copia guardada por separado.</p>:custodyCurrent&&custody?.confirmedAt?<p>Confirmaste que guardaste esta revisión por separado el {new Date(custody.confirmedAt).toLocaleString('es-ES')}. Es una declaración tuya; no demuestra que el archivo siga disponible o se haya restaurado.</p>:custodyCurrent?<p>Consta una exportación de esta revisión. Falta confirmar que la guardaste fuera de este ordenador y conservaste la contraseña por separado.</p>:custody?<p>La exportación registrada corresponde a otra revisión o no tiene identidad comprobable. No cubre de forma acreditada el contenido mostrado.{custody.previousConfirmedAt||custody.confirmedAt?' Existe una confirmación histórica, que no se presenta como vigente.':''}</p>:<p>No consta una exportación de esta revisión. Preparar una descarga no demuestra su custodia fuera de este ordenador.</p>}
      <p className="helper">La comprobación del archivo y un ensayo de recuperación son pasos distintos. Descargar no marca cambios como devueltos al CRM.</p>
    </section>
    <div className="export-instructions"><h2><span className="export-step-n" aria-hidden="true">2</span>Prepara una contraseña de recuperación y descarga</h2><p>Se utilizará para abrir los datos en otro ordenador. Guárdala en un lugar seguro separado del archivo. No incluimos claves de HubSpot ni de IA.</p>
      <div className="settings-grid"><label className="field"><span>Contraseña de recuperación</span><input type="password" minLength={12} maxLength={200} disabled={busy} autoComplete="new-password" value={password} onChange={e=>setPassword(e.target.value)}/></label><label className="field"><span>Repite la contraseña</span><input type="password" maxLength={200} disabled={busy} autoComplete="new-password" value={confirm} onChange={e=>setConfirm(e.target.value)}/></label></div>
      {error?<p className="error-box" role="alert">{error}</p>:null}{done?<p className="success-label" role="status">{done.kind==='package'?'Paquete':'Copia cifrada'} preparado para descargar · revisión {done.revision.slice(0,12)}. Comprueba que el navegador guardó el archivo y conserva la contraseña por separado. No se ha verificado una restauración.</p>:null}
      <div className="button-row"><button className="button primary" disabled={!ready} aria-describedby={blockReason?'export-block-reason':undefined} onClick={()=>run('package')}>{busy?<Spinner text="Preparando…"/>:<><Download size={18}/>Descargar aplicación independiente</>}</button><button className="button secondary" disabled={!ready} aria-describedby={blockReason?'export-block-reason':undefined} onClick={()=>run('encrypted')}><FileJson size={18}/>Solo copia cifrada</button></div>
      {blockReason?<p className="export-block-reason" id="export-block-reason">{blockReason}</p>:null}
      <details className="export-restore-help"><summary>Cómo se restaura en otro equipo</summary><ol className="plain-list"><li>Extrae el ZIP completo y abre ABRIR PLAN B.cmd.</li><li>En la pantalla local elige Restaurar archivo.</li><li>Selecciona continuity.encrypted.json e introduce la contraseña de recuperación.</li><li>Antes de usar datos de una empresa, configura también una contraseña de acceso local.</li></ol>
      <p className="helper">La base local está cifrada para tu usuario de Windows. Para otro equipo utiliza siempre el paquete cifrado; mover solo la base SQLite no transfiere la clave de Windows.</p></details>
    </div>
  </section>;
}
