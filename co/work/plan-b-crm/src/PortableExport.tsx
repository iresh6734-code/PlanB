import { useState } from 'react';
import { Download, FileJson, LockKeyhole } from 'lucide-react';
import { download } from './api.js';
import { Spinner } from './components.js';
export function PortableExport(){
  const [password,setPassword]=useState(''),[confirm,setConfirm]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[done,setDone]=useState(false);
  const run=async(kind:'package'|'encrypted')=>{
    if(password.length<12||password!==confirm){setError('Usa al menos 12 caracteres y repite la misma contraseña.');return;}
    setBusy(true);setError('');setDone(false);
    try{await download('/v2/export/'+kind,kind==='package'?'Plan-B-independiente-v2.1.zip':'plan-b-copia-cifrada.json',{password});setDone(true);}catch(f){setError((f as Error).message);}finally{setBusy(false);}
  };
  return <section className="export-page"><header className="page-header"><div><h1>Tu copia, contigo.</h1><p className="page-subtitle">Una aplicación independiente y una copia cifrada recuperable en otro equipo.</p></div><LockKeyhole size={29}/></header>
    <div className="export-instructions"><h2>Prepara una contraseña de recuperación</h2><p>Se utilizará para abrir los datos en otro ordenador. Guárdala en un lugar seguro separado del archivo. No incluimos claves de HubSpot ni de IA.</p>
      <div className="settings-grid"><label className="field"><span>Contraseña de recuperación</span><input type="password" minLength={12} maxLength={200} autoComplete="new-password" value={password} onChange={e=>setPassword(e.target.value)}/></label><label className="field"><span>Repite la contraseña</span><input type="password" autoComplete="new-password" value={confirm} onChange={e=>setConfirm(e.target.value)}/></label></div>
      {error?<p className="error-box" role="alert">{error}</p>:null}{done?<p className="success-label" role="status">Descarga completada. Conserva el archivo y tu contraseña.</p>:null}
      <div className="button-row"><button className="button primary" disabled={busy} onClick={()=>run('package')}>{busy?<Spinner text="Preparando…"/>:<><Download size={18}/>Descargar aplicación independiente</>}</button><button className="button secondary" disabled={busy} onClick={()=>run('encrypted')}><FileJson size={18}/>Solo copia cifrada</button></div>
      <ol className="plain-list"><li>Extrae el ZIP completo y abre ABRIR PLAN B.cmd.</li><li>En la pantalla local elige Restaurar archivo.</li><li>Selecciona continuity.encrypted.json e introduce la contraseña de recuperación.</li><li>Antes de usar datos de una empresa, configura también una contraseña de acceso local.</li></ol>
      <p className="helper">La base local está cifrada para tu usuario de Windows. Para otro equipo utiliza siempre el paquete cifrado; mover solo la base SQLite no transfiere la clave de Windows.</p>
    </div>
  </section>;
}
