/** Ensayo guiado «Un día sin CRM»: cinco gestos que alguien haría con la copia si el CRM se cae, reconocidos por lo que la
 *  persona ya hace en la App (apartado abierto, búsqueda, ficha abierta). No pide guardar nada, no escribe y no se recuerda
 *  al cerrar la ventana. Comprueba que la persona sabe moverse por la copia; la copia en sí la prueba «Probar mi Plan B». */
export type DrillStepId = 'open' | 'find' | 'record' | 'today' | 'export';
export interface DrillStep { id: DrillStepId; title: string; hint: string; go: string }
export const DRILL_STEPS: readonly DrillStep[] = [
  { id: 'open', title: 'Abre tu lista de clientes', hint: 'Tu copia tiene los mismos clientes que el CRM el día de la captura.', go: 'Ir a Clientes' },
  { id: 'find', title: 'Encuentra a un cliente', hint: 'Escribe un nombre, un correo o una empresa en el buscador de la lista o en «Buscar en toda la copia».', go: 'Ir a Clientes' },
  { id: 'record', title: 'Abre su ficha y mira lo relacionado', hint: 'Sus datos, sus oportunidades y sus tareas, como en el CRM.', go: 'Ir a Clientes' },
  { id: 'today', title: 'Mira qué vence hoy', hint: 'Lo vencido y lo de las próximas 24 horas, ordenado para decidir.', go: 'Ir a Hoy' },
  { id: 'export', title: 'Localiza cómo sacar tus datos', hint: 'Exportar crea una copia cifrada o un CSV para llevártela; aquí basta con saber dónde está.', go: 'Ir a Exportar' },
];
export interface DrillState { startedAt: number; done: Partial<Record<DrillStepId, number>>; finishedAt: number | null }
/** Lo que la App sabe en cada momento y basta para reconocer los pasos (sin datos de registros). */
export interface DrillSignal { page: string; entity: string; query: string; searchOpen: boolean; recordOpen: string | null }

export const startDrill = (now: number): DrillState => ({ startedAt: now, done: {}, finishedAt: null });

/** Marca los pasos que la señal cumple. Los pasos son acumulativos: «encontrar» exige haber abierto la lista y «ficha» un
 *  cliente; así un orden distinto no da por hechos pasos que no se han hecho. Devuelve el MISMO objeto si nada cambia. */
export function advanceDrill(state: DrillState, signal: DrillSignal, now: number): DrillState {
  if (state.finishedAt !== null) return state;
  const done = { ...state.done };
  const inContacts = signal.page === 'workspace' && signal.entity === 'contacts';
  if (!done.open && inContacts) done.open = now;
  if (!done.find && done.open && ((inContacts && signal.query.trim().length >= 2) || signal.searchOpen)) done.find = now;
  if (!done.record && done.find && signal.recordOpen === 'contacts') done.record = now;
  if (!done.today && signal.page === 'today') done.today = now;
  if (!done.export && signal.page === 'export') done.export = now;
  const changed = DRILL_STEPS.some(step => done[step.id] !== state.done[step.id]);
  if (!changed) return state;
  const complete = DRILL_STEPS.every(step => done[step.id]);
  return { ...state, done, finishedAt: complete ? now : null };
}

export const nextStep = (state: DrillState) => DRILL_STEPS.find(step => !state.done[step.id]) ?? null;
const minutes = (ms: number) => { const seconds = Math.max(0, Math.round(ms / 1000)); return seconds < 60 ? seconds + ' s' : Math.floor(seconds / 60) + ' min ' + String(seconds % 60).padStart(2, '0') + ' s'; };
/** Resumen honesto: qué se hizo, cuánto tardó y qué no demuestra. */
export function drillSummary(state: DrillState, now: number) {
  const doneCount = DRILL_STEPS.filter(step => state.done[step.id]).length;
  const end = state.finishedAt ?? now;
  return {
    doneCount, total: DRILL_STEPS.length, elapsed: minutes(end - state.startedAt), complete: state.finishedAt !== null,
    lines: DRILL_STEPS.map(step => (state.done[step.id] ? '✓ ' : '· ') + step.title + (state.done[step.id] ? ' (' + minutes(state.done[step.id]! - state.startedAt) + ')' : ' — sin hacer')),
    limit: 'Comprueba que sabes moverte por la copia. Que la copia funcione lo comprueba «Probar mi Plan B».',
  };
}
