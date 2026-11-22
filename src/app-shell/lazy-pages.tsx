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
export const LicensePanel = deferred(() => import('../LicensePanel.js').then(m => m.LicensePanel), 'Abriendo tu plan…');
export const Settings = deferred(() => import('../Settings.js').then(m => m.Settings), 'Abriendo los ajustes…');
export const WeeklyReview = deferred(() => import('./WeeklyReview.js').then(m => m.WeeklyReview), 'Abriendo la revisión semanal…');
export const Agenda = deferred(() => import('./Agenda.js').then(m => m.Agenda), 'Abriendo la agenda…');
// Diálogos que solo se abren a petición: fuera del JS inicial.
export const CsvImport = deferred(() => import('../CsvImport.js').then(m => m.CsvImport), 'Abriendo la importación…');
export const FocusRun = deferred(() => import('./FocusRun.js').then(m => m.FocusRun), 'Abriendo la cola de foco…');
export const ContinuityEvidence = deferred(() => import('../ContinuityEvidence.js').then(m => m.ContinuityEvidence), 'Abriendo los escenarios…');
export const ContingencyBand = quiet(() => import('./ContingencyBand.js').then(m => m.ContingencyBand), 'Modo contingencia');
export const GuidedDrill = quiet(() => import('./GuidedDrill.js').then(m => m.GuidedDrill), 'Práctica guiada');
export const ShortcutsHelp = quiet(() => import('./ShortcutsHelp.js').then(m => m.ShortcutsHelp), 'Atajos de teclado');
export const RecordTimeline = quiet(() => import('./RecordTimeline.js').then(m => m.RecordTimeline), 'Historial de la ficha');
export const PipelineCard = quiet(() => import('./PipelineCard.js').then(m => m.PipelineCard), 'Oportunidades');
export const CoolingCard = quiet(() => import('./CoolingCard.js').then(m => m.CoolingCard), 'Clientes que se enfrían');
export const PipelineStats = quiet(() => import('./PipelineStats.js').then(m => m.PipelineStats), 'Analítica del proceso');
export const SequencePicker = quiet(() => import('./SequencePicker.js').then(m => m.SequencePicker), 'Secuencia de seguimiento');
export const QuickActivity = quiet(() => import('./QuickActivity.js').then(m => m.QuickActivity), 'Registrar actividad');
export const WhatsNew = quiet(() => import('./WhatsNew.js').then(m => m.WhatsNew), 'Novedades');
export const MergeDialog = quiet(() => import('./MergeDialog.js').then(m => m.MergeDialog), 'Fusionar duplicados');
export const RescheduleBar = quiet(() => import('./RescheduleBar.js').then(m => m.RescheduleBar), 'Reprogramar cierres');
export const CommandPalette = quiet(() => import('./CommandPalette.js').then(m => m.CommandPalette), 'Paleta de órdenes');
