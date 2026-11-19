import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, ChevronUp, X } from 'lucide-react';
import { DRILL_STEPS, drillSummary, nextStep, type DrillState, type DrillStepId } from './guided-drill.js';

/** Panel del ensayo guiado: acompaña a la persona mientras usa la App y marca solo los pasos que ya ha hecho.
 *  No navega por su cuenta salvo que se pulse «Ir»; no guarda nada. */
export function GuidedDrill({ state, onGo, onClose, onRestart }: { state: DrillState; onGo: (step: DrillStepId) => void; onClose: () => void; onRestart: () => void }) {
  const [now, setNow] = useState(() => Date.now()), [collapsed, setCollapsed] = useState(false), [said, setSaid] = useState('');
  useEffect(() => { if (state.finishedAt !== null) return; const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, [state.finishedAt]);
  // Anuncia cada paso que se completa (una vez) para lectores de pantalla.
  const seen = useRef(new Set(Object.keys(state.done)));
  useEffect(() => { const fresh = DRILL_STEPS.filter(step => state.done[step.id] && !seen.current.has(step.id)); if (!fresh.length) return; fresh.forEach(step => seen.current.add(step.id)); setSaid('Hecho: ' + fresh.map(step => step.title.toLowerCase()).join(', ') + (state.finishedAt ? '. Práctica terminada.' : '.')); }, [state]);
  const summary = drillSummary(state, now), next = nextStep(state);
  return <aside className="gx-drill" aria-label="Práctica guiada: un día sin CRM" data-collapsed={collapsed ? 'true' : undefined}>
    <header className="gx-drill-head">
      <div><strong>Un día sin CRM</strong><span>{summary.complete ? 'Terminado en ' + summary.elapsed : summary.doneCount + ' de ' + summary.total + ' · ' + summary.elapsed}</span></div>
      <button type="button" className="icon-button" aria-expanded={!collapsed} aria-label={collapsed ? 'Mostrar la práctica' : 'Plegar la práctica'} onClick={() => setCollapsed(value => !value)}>{collapsed ? <ChevronUp size={16} /> : <ChevronDown size={16} />}</button>
      <button type="button" className="icon-button" aria-label="Cerrar la práctica" onClick={onClose}><X size={16} /></button>
    </header>
    <div className="gx-drill-bar" aria-hidden="true"><span style={{ width: (summary.doneCount / summary.total) * 100 + '%' }} /></div>
    <p className="sr-only" role="status" aria-live="polite">{said}</p>
    {collapsed ? null : summary.complete ? <div className="gx-drill-done">
      <p><Check size={16} aria-hidden="true" /> Has hecho los cinco gestos con tu copia en {summary.elapsed}.</p>
      <p className="helper">{summary.limit}</p>
      <div className="gx-drill-actions"><button type="button" className="button secondary" onClick={onRestart}>Repetir</button><button type="button" className="button primary" onClick={onClose}>Cerrar</button></div>
    </div> : <ol className="gx-drill-steps">
      {DRILL_STEPS.map(step => { const done = !!state.done[step.id], current = next?.id === step.id; return <li key={step.id} data-state={done ? 'done' : current ? 'current' : 'next'} aria-current={current ? 'step' : undefined}>
        <span className="gx-drill-mark" aria-hidden="true">{done ? <Check size={13} strokeWidth={3} /> : null}</span>
        <div><span className="gx-drill-title">{step.title}{done ? <span className="sr-only"> (hecho)</span> : null}</span>
          {current ? <><p>{step.hint}</p><button type="button" className="text-button" onClick={() => onGo(step.id)}>{step.go}</button></> : null}</div>
      </li>; })}
    </ol>}
  </aside>;
}
