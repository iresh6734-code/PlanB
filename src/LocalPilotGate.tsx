import { useEffect, useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { Spinner } from './components.js';

export function LocalPilotGate({unlocked}:{unlocked:()=>Promise<void>}){
  const [configured,setConfigured]=useState<boolean|null>(null),[password,setPassword]=useState(''),[confirm,setConfirm]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
  useEffect(()=>{let cancelled=false;void fetch('/api/team/local-pilot/status').then(async response=>{if(!response.ok)throw new Error('No se pudo comprobar la protección local.');return response.json();}).then(data=>{if(!cancelled)setConfigured(data.configured);}).catch(f=>{if(!cancelled)setError(f.message);});return()=>{cancelled=true;};},[]);
  if(configured===null)return <>{error?<p className="error-box" role="alert">{error}</p>:<Spinner text="Comprobando protección…"/>}</>;
  return <form className="settings-form" onSubmit={async e=>{
    e.preventDefault();setBusy(true);setError('');
    try{
      const response=await fetch('/api/team/local-pilot/'+(configured?'login':'setup'),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password})});
      const data=await response.json();if(!response.ok)throw new Error(data.error||'No se pudo desbloquear el piloto.');
      setPassword('');setConfirm('');setConfigured(true);await unlocked();
    }catch(f){setError((f as Error).message);}finally{setBusy(false);}
  }}>
    <p className="helper"><ShieldCheck size={16}/> Piloto real de un operador en este ordenador. Las conexiones y sus permisos se autorizan por separado.</p>
    <label className="field"><span>{configured?'Contraseña del piloto':'Elige una contraseña para este piloto'}</span><input type="password" autoComplete={configured?'current-password':'new-password'} minLength={configured?1:12} maxLength={200} required value={password} onChange={e=>setPassword(e.target.value)}/></label>
    {!configured?<><label className="field"><span>Repite la contraseña</span><input type="password" autoComplete="new-password" required value={confirm} onChange={e=>setConfirm(e.target.value)}/></label><p className="helper">Mínimo 12 caracteres. Guárdala en tu gestor de contraseñas; Plan B no puede recuperarla.</p></>:null}
    {error?<p className="error-box" role="alert">{error}</p>:null}
    <button className="button primary" disabled={busy||!password||!configured&&(password.length<12||password!==confirm)}>{busy?'Comprobando…':configured?'Desbloquear piloto':'Proteger y entrar'}</button>
  </form>;
}
