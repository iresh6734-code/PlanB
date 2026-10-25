import { useState } from 'react';
import { LockKeyhole } from 'lucide-react';
import { post } from './api.js';
import { Brand, Spinner } from './components.js';
export function Protection({setup,done,cancel}:{setup:boolean;done:()=>void;cancel?:()=>void}) {
  const [password,setPassword]=useState(''),[confirm,setConfirm]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
  return <main className="unlock-page"><Brand/><section><LockKeyhole size={28}/><h1>{setup?'Protege tu copia':'Tu copia está protegida'}</h1>
    <p>{setup?'Elige una contraseña local. Los datos y credenciales se cifran también para tu usuario de Windows.':'Desbloquea la aplicación para acceder a tus datos. La sesión se cierra tras 30 minutos sin actividad.'}</p>
    <form onSubmit={async e=>{e.preventDefault();if(setup&&password!==confirm){setError('Las contraseñas no coinciden.');return;}setBusy(true);setError('');try{await post('/v2/auth/'+(setup?'setup':'login'),{password});done();}catch(f){setError((f as Error).message);}finally{setBusy(false);}}}>
      <label className="field"><span>Contraseña local</span><input type="password" value={password} autoFocus minLength={setup?12:1} maxLength={200} required autoComplete={setup?'new-password':'current-password'} onChange={e=>setPassword(e.target.value)}/></label>
      {setup?<label className="field"><span>Repite la contraseña</span><input type="password" value={confirm} minLength={12} required autoComplete="new-password" onChange={e=>setConfirm(e.target.value)}/></label>:null}
      {error?<p className="error-box" role="alert">{error}</p>:null}
      <button className="button primary" disabled={busy}>{busy?<Spinner/>:setup?'Guardar protección':'Desbloquear'}</button>
      {cancel?<button type="button" className="text-button" onClick={cancel}>Volver a la aplicación</button>:null}
    </form><small>Para mover los datos a otro equipo usa una exportación cifrada y su contraseña de recuperación. La contraseña local no sustituye esa copia.</small></section></main>;
}
