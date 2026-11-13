import {StrictMode,useState} from 'react';
import {createRoot} from 'react-dom/client';
import '../../src/planb-ui.css';
import '../../src/continuity-evidence.css';
import {ContinuityEvidence} from '../../src/ContinuityEvidence.js';
const root=document.getElementById('root');
function Demo(){const [visible,setVisible]=useState(true);return <div className="cev-demo"><header><h1>Continuidad, con evidencia</h1><p>Ensayo aislado con datos ficticios nuevos. Se leen registros locales; no se contacta con proveedores ni se ejecuta una recuperación.</p><button type="button" className="cev-demo-toggle" onClick={()=>setVisible(v=>!v)}>{visible?'Cerrar vista':'Abrir vista'}</button></header>{visible?<ContinuityEvidence/>:<p>Vista cerrada. No hay consultas activas de esta vista.</p>}</div>;}
if(root)createRoot(root).render(<StrictMode><Demo/></StrictMode>);
