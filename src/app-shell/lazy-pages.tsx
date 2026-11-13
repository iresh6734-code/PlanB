import { Suspense, lazy, type ComponentProps, type ComponentType } from 'react';
import { Skeleton } from '../ui/index.js';

/** Apartados que no hacen falta para abrir la app: se descargan la primera vez que se visitan.
 *  Cada uno lleva su propio Suspense con la carga en forma de filas, así App no cambia de forma de uso. */
function deferred<T extends ComponentType<any>>(load: () => Promise<T>, label: string) {
  const Lazy = lazy(() => load().then(component => ({ default: component })));
  const Page = (props: ComponentProps<T>) => <Suspense fallback={<Skeleton rows={6} label={label} />}><Lazy {...props} /></Suspense>;
  return Page as unknown as T;
}

export const ContinuityHome = deferred(() => import('../ContinuityHome.js').then(m => m.ContinuityHome), 'Abriendo Continuidad…');
export const Preparation = deferred(() => import('../Preparation.js').then(m => m.Preparation), 'Abriendo la preparación…');
export const ChangesView = deferred(() => import('../ChangesView.js').then(m => m.ChangesView), 'Abriendo Cambios…');
export const PortableExport = deferred(() => import('../PortableExport.js').then(m => m.PortableExport), 'Abriendo Exportar…');
export const LocalIntegrations = deferred(() => import('../LocalIntegrations.js').then(m => m.LocalIntegrations), 'Abriendo Integraciones…');
export const TeamSync = deferred(() => import('../TeamSync.js').then(m => m.TeamSync), 'Abriendo la copia de equipo…');
export const RadarHost = deferred(() => import('../RadarHost.js').then(m => m.RadarHost), 'Abriendo el Radar…');
export const OperationalRehearsal = deferred(() => import('../OperationalRehearsal.js').then(m => m.OperationalRehearsal), 'Abriendo el ensayo…');
export const DateCheck = deferred(() => import('../DateCheck.js').then(m => m.DateCheck), 'Abriendo Comprobar una fecha…');
export const DecisionReview = deferred(() => import('../DecisionReview.js').then(m => m.DecisionReview), 'Abriendo las decisiones…');
export const Settings = deferred(() => import('../Settings.js').then(m => m.Settings), 'Abriendo los ajustes…');
