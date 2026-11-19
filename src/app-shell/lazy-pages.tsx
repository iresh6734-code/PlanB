import { Suspense, lazy, type ComponentProps, type ComponentType } from 'react';
import { PageErrorBoundary, Skeleton } from '../ui/index.js';

/** Apartados que no hacen falta para abrir la app: se descargan la primera vez que se visitan.
 *  Cada uno lleva su propio Suspense con la carga en forma de filas, así App no cambia de forma de uso. */
function deferred<T extends ComponentType<any>>(load: () => Promise<T>, label: string, name = label.replace(/^Abriendo\s+/, '').replace(/…$/, '')) {
  const Lazy = lazy(() => load().then(component => ({ default: component })));
  // Si el archivo del apartado no llega (servidor cerrado, despliegue nuevo), el error se queda en su sitio y no tumba la App.
  const Page = (props: ComponentProps<T>) => <PageErrorBoundary label={name}><Suspense fallback={<Skeleton rows={6} label={label} />}><Lazy {...props} /></Suspense></PageErrorBoundary>;
  return Page as unknown as T;
}
/** Piezas que solo aparecen en momentos concretos (la banda de contingencia): mismo límite de error, pero sin esqueleto mientras llegan. */
function quiet<T extends ComponentType<any>>(load: () => Promise<T>, name: string) {
  const Lazy = lazy(() => load().then(component => ({ default: component })));
  const Piece = (props: ComponentProps<T>) => <PageErrorBoundary label={name}><Suspense fallback={null}><Lazy {...props} /></Suspense></PageErrorBoundary>;
  return Piece as unknown as T;
}

export const ContinuityHome = deferred(() => import('../ContinuityHome.js').then(m => m.ContinuityHome), 'Abriendo Continuidad…');
export const Preparation = deferred(() => import('../Preparation.js').then(m => m.Preparation), 'Abriendo la preparación…');
export const ChangesView = deferred(() => import('../ChangesView.js').then(m => m.ChangesView), 'Abriendo Cambios…');
export const PortableExport = deferred(() => import('../PortableExport.js').then(m => m.PortableExport), 'Abriendo Exportar…');
export const LocalIntegrations = deferred(() => import('../LocalIntegrations.js').then(m => m.LocalIntegrations), 'Abriendo Integraciones…');
export const TeamSync = deferred(() => import('../TeamSync.js').then(m => m.TeamSync), 'Abriendo la copia de equipo…');
export const LicensePanel = deferred(() => import('../LicensePanel.js').then(m => m.LicensePanel), 'Abriendo tu plan…');
export const RadarHost = deferred(() => import('../RadarHost.js').then(m => m.RadarHost), 'Abriendo el Radar…');
export const OperationalRehearsal = deferred(() => import('../OperationalRehearsal.js').then(m => m.OperationalRehearsal), 'Abriendo el ensayo…');
export const DateCheck = deferred(() => import('../DateCheck.js').then(m => m.DateCheck), 'Abriendo Comprobar una fecha…');
export const OutageLab = deferred(() => import('../OutageLab.js').then(m => m.OutageLab), 'Abriendo el laboratorio de caídas…');
export const DecisionReview = deferred(() => import('../DecisionReview.js').then(m => m.DecisionReview), 'Abriendo las decisiones…');
export const Settings = deferred(() => import('../Settings.js').then(m => m.Settings), 'Abriendo los ajustes…');
export const WeeklyReview = deferred(() => import('./WeeklyReview.js').then(m => m.WeeklyReview), 'Abriendo la revisión semanal…');
// Diálogos que solo se abren a petición: fuera del JS inicial.
export const CsvImport = deferred(() => import('../CsvImport.js').then(m => m.CsvImport), 'Abriendo la importación…');
export const FocusRun = deferred(() => import('./FocusRun.js').then(m => m.FocusRun), 'Abriendo la cola de foco…');
export const ContinuityEvidence = deferred(() => import('../ContinuityEvidence.js').then(m => m.ContinuityEvidence), 'Abriendo los escenarios…');
export const ContingencyBand = quiet(() => import('./ContingencyBand.js').then(m => m.ContingencyBand), 'Modo contingencia');
export const GuidedDrill = quiet(() => import('./GuidedDrill.js').then(m => m.GuidedDrill), 'Práctica guiada');
export const ShortcutsHelp = quiet(() => import('./ShortcutsHelp.js').then(m => m.ShortcutsHelp), 'Atajos de teclado');
export const RecordTimeline = quiet(() => import('./RecordTimeline.js').then(m => m.RecordTimeline), 'Historial de la ficha');
