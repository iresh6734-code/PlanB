import { Check, LockKeyhole, Play, Sparkles } from 'lucide-react';
import type { ReactNode } from 'react';

/** Primer uso (Inicio sin copia): tres pasos que siguen su propio estado, en lugar de un tablero vacío.
 *  Solo lleva a lo que ya existe: proteger el acceso, la preparación de la copia y Continuidad. No guarda nada. */
type Step = { title: string; detail: string; done: boolean; icon: ReactNode; action?: { label: string; run: () => void }; waiting?: string };
export function FirstRun({ protectedAccess, onProtect, onPrepare, onOpenContinuity }: {
  /** null = todavía sin leer. */ protectedAccess: boolean | null; onProtect?: () => void; onPrepare?: () => void; onOpenContinuity: () => void;
}) {
  const steps: Step[] = [
    { title: 'Protege el acceso', detail: 'Una contraseña local para que nadie más abra tu copia en este ordenador.', done: protectedAccess === true, icon: <LockKeyhole size={18} />, action: onProtect ? { label: 'Elegir contraseña', run: onProtect } : undefined },
    { title: 'Prepara tu primera copia', detail: 'Empieza con los datos de ensayo incluidos, sin cuentas reales, o conecta una cuenta de prueba de HubSpot.', done: false, icon: <Sparkles size={18} />, action: { label: 'Preparar copia', run: onPrepare ?? onOpenContinuity } },
    { title: 'Pruébala', detail: 'Un simulacro abre la copia en un entorno aparte y comprueba que podrías trabajar sin el CRM.', done: false, icon: <Play size={18} />, waiting: 'Disponible cuando haya una copia' },
  ];
  const current = steps.findIndex(step => !step.done);
  return <section className="gx-first" aria-labelledby="gx-first-title">
    <div className="gx-first-intro">
      <h2 id="gx-first-title">Tu CRM, con un plan B en tres pasos</h2>
      <p>Si el CRM falla, sigues trabajando con una copia que ya has probado. Todo se guarda en este ordenador y nada sale de aquí sin que lo pidas.</p>
    </div>
    <ol className="gx-first-steps">
      {steps.map((step, index) => <li key={step.title} data-state={step.done ? 'done' : index === current ? 'current' : 'next'} aria-current={index === current ? 'step' : undefined}>
        <span className="gx-first-mark" aria-hidden="true">{step.done ? <Check size={16} strokeWidth={3} /> : index + 1}</span>
        <div className="gx-first-body">
          <h3><span className="gx-first-icon" aria-hidden="true">{step.icon}</span>{step.title}{step.done ? <span className="sr-only"> (hecho)</span> : null}</h3>
          <p>{step.detail}</p>
          {step.done ? <p className="gx-first-done">Hecho</p>
            : step.action ? <button type="button" className={'button ' + (index === current ? 'primary' : 'secondary')} onClick={step.action.run}>{step.action.label}</button>
            : step.waiting ? <p className="gx-first-waiting">{step.waiting}</p> : null}
        </div>
      </li>)}
    </ol>
    <p className="gx-first-more">¿Prefieres ver el estado completo? <button type="button" className="text-button" onClick={onOpenContinuity}>Ir a Continuidad</button></p>
  </section>;
}
