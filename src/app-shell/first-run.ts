import type { ContinuityStatus } from '../../shared/operations.js';

/** Primer uso en 10 minutos (super plan M4): proteger → primera copia → primera prueba → pasaporte. */
export type FirstRunStepId = 'protect' | 'copy' | 'drill' | 'passport';
export interface FirstRunStep { id: FirstRunStepId; title: string; detail: string; done: boolean; minutes: number; ready: boolean; waiting: string }
export interface FirstRunPlan { steps: FirstRunStep[]; done: number; total: number; current: FirstRunStepId | null; percent: number; minutesLeft: number; complete: boolean; progress: string }
export interface FirstRunInput { protectedAccess: boolean | null; hasCopy: boolean; drillPassed: boolean; passportSeen: boolean }

/** Hay al menos un simulacro superado (de cualquier captura): basta para dar por hecho el paso del primer uso. */
export const anyDrillPassed = (status: Pick<ContinuityStatus, 'reports'> | null) => !!status?.reports.some(report => report.passed);

export function firstRunPlan({ protectedAccess, hasCopy, drillPassed, passportSeen }: FirstRunInput): FirstRunPlan {
  const steps: FirstRunStep[] = [
    { id: 'protect', title: 'Protege el acceso', minutes: 1, done: protectedAccess === true, ready: true, waiting: '',
      detail: 'Una contraseña local para que nadie más abra tu copia en este ordenador.' },
    { id: 'copy', title: 'Prepara tu primera copia', minutes: 4, done: hasCopy, ready: true, waiting: '',
      detail: hasCopy ? 'Ya tienes una copia conservada en este ordenador.' : 'Empieza con los datos de ensayo incluidos, sin cuentas reales, o conecta una cuenta de prueba de HubSpot.' },
    { id: 'drill', title: 'Pruébala', minutes: 3, done: drillPassed, ready: hasCopy, waiting: 'Disponible cuando haya una copia',
      detail: 'Un simulacro abre la copia en un entorno aparte y comprueba que podrías trabajar sin el CRM.' },
    { id: 'passport', title: 'Mira tu pasaporte', minutes: 2, done: passportSeen && drillPassed, ready: drillPassed, waiting: 'Disponible tras la primera prueba superada',
      detail: 'Resume en una hoja lo que está comprobado de tu Plan B, lista para enseñar a quien la pida.' },
  ];
  const done = steps.filter(step => step.done).length, total = steps.length;
  const current = steps.find(step => !step.done)?.id ?? null;
  const minutesLeft = steps.filter(step => !step.done).reduce((sum, step) => sum + step.minutes, 0);
  const progress = done === total ? 'Primeros pasos completados'
    : done + ' de ' + total + ' · ' + (minutesLeft === 1 ? 'queda 1 minuto' : 'quedan unos ' + minutesLeft + ' minutos');
  return { steps, done, total, current, percent: Math.round(done / total * 100), minutesLeft, complete: done === total, progress };
}
