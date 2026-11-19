import { useState } from 'react';
import type { ReactNode } from 'react';
import { BadgeCheck, Check, LockKeyhole, Play, Sparkles, X } from 'lucide-react';
import type { FirstRunPlan, FirstRunStepId } from './first-run.js';

/** Preferencias de este navegador (sin datos de registros): pasaporte ya visto y franja de primeros pasos ocultada. */
const SEEN_KEY = 'planb:first-run:passport-seen', HIDDEN_KEY = 'planb:first-run:hidden';
const read = (key: string) => { try { return localStorage.getItem(key) === '1'; } catch { return false; } };
const write = (key: string) => { try { localStorage.setItem(key, '1'); } catch { /* sin almacenamiento: solo dura esta visita */ } };
export const passportSeen = () => read(SEEN_KEY);
export const firstRunHidden = () => read(HIDDEN_KEY);

const ICON: Record<FirstRunStepId, ReactNode> = { protect: <LockKeyhole size={18} />, copy: <Sparkles size={18} />, drill: <Play size={18} />, passport: <BadgeCheck size={18} /> };
const ACTION: Record<FirstRunStepId, string> = { protect: 'Elegir contraseña', copy: 'Preparar copia', drill: 'Probar la copia', passport: 'Ver mi pasaporte' };
export type FirstRunActions = { onProtect?: () => void; onPrepare?: () => void; onTest?: () => void; onPassport?: () => void; onOpenContinuity: () => void };

function stepAction(actions: FirstRunActions) {
  return (id: FirstRunStepId): (() => void) | null => {
    if (id === 'protect') return actions.onProtect ?? null;
    if (id === 'copy') return actions.onPrepare ?? actions.onOpenContinuity;
    if (id === 'drill') return actions.onTest ?? actions.onOpenContinuity;
    const open = actions.onPassport ?? actions.onOpenContinuity;
    return () => { write(SEEN_KEY); open(); };
  };
}

function Meter({ plan }: { plan: FirstRunPlan }) {
  return <div className="gx-first-meter">
    <span className="gx-first-bar" role="progressbar" aria-label="Primeros pasos" aria-valuemin={0} aria-valuemax={plan.total} aria-valuenow={plan.done} aria-valuetext={plan.progress}><i style={{ width: plan.percent + '%' }} /></span>
    <span className="gx-first-progress">{plan.progress}</span>
  </div>;
}

/** Primer uso (Inicio sin copia): cuatro pasos que siguen su propio estado, en lugar de un tablero vacío.
 *  Solo lleva a lo que ya existe: proteger el acceso, la preparación, el simulacro y el pasaporte. No guarda datos. */
export function FirstRun({ plan, ...actions }: { plan: FirstRunPlan } & FirstRunActions) {
  const run = stepAction(actions);
  return <section className="gx-first" aria-labelledby="gx-first-title">
    <div className="gx-first-intro">
      <h2 id="gx-first-title">Tu CRM, con un plan B en diez minutos</h2>
      <p>Si el CRM falla, sigues trabajando con una copia que ya has probado. Todo se guarda en este ordenador y nada sale de aquí sin que lo pidas.</p>
      <Meter plan={plan} />
    </div>
    <ol className="gx-first-steps">
      {plan.steps.map((step, index) => {
        const action = step.ready ? run(step.id) : null, current = step.id === plan.current;
        return <li key={step.id} data-state={step.done ? 'done' : current ? 'current' : 'next'} aria-current={current ? 'step' : undefined}>
          <span className="gx-first-mark" aria-hidden="true">{step.done ? <Check size={16} strokeWidth={3} /> : index + 1}</span>
          <div className="gx-first-body">
            <h3><span className="gx-first-icon" aria-hidden="true">{ICON[step.id]}</span>{step.title}<small className="gx-first-time">{step.minutes} min</small>{step.done ? <span className="sr-only"> (hecho)</span> : null}</h3>
            <p>{step.detail}</p>
            {step.done ? <p className="gx-first-done">Hecho</p>
              : action ? <button type="button" className={'button ' + (current ? 'primary' : 'secondary')} onClick={action}>{ACTION[step.id]}</button>
              : <p className="gx-first-waiting">{step.waiting}</p>}
          </div>
        </li>;
      })}
    </ol>
    <p className="gx-first-more">¿Prefieres ver el estado completo? <button type="button" className="text-button" onClick={actions.onOpenContinuity}>Ir a Continuidad</button></p>
  </section>;
}

/** Con copia pero sin terminar los primeros pasos: una franja con el progreso y el siguiente paso, que se puede ocultar. */
export function FirstRunStrip({ plan, ...actions }: { plan: FirstRunPlan } & FirstRunActions) {
  const [hidden, setHidden] = useState(firstRunHidden);
  const step = plan.steps.find(item => item.id === plan.current);
  if (hidden || plan.complete || !step) return null;
  const action = step.ready ? stepAction(actions)(step.id) : null;
  return <section className="gx-first-strip" aria-labelledby="gx-first-strip-title">
    <div className="gx-first-strip-text">
      <h2 id="gx-first-strip-title"><span aria-hidden="true">{ICON[step.id]}</span>Siguiente paso: {step.title.charAt(0).toLowerCase() + step.title.slice(1)}</h2>
      <p>{step.detail}</p>
    </div>
    <Meter plan={plan} />
    {action ? <button type="button" className="button secondary" onClick={action}>{ACTION[step.id]}</button> : <p className="gx-first-waiting">{step.waiting}</p>}
    <button type="button" className="icon-button gx-first-hide" aria-label="Ocultar los primeros pasos" title="Ocultar" onClick={() => { write(HIDDEN_KEY); setHidden(true); }}><X size={16} /></button>
  </section>;
}
