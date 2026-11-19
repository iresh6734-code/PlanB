import type { RecoveryPlan } from '../../shared/operations.js';

/** Asistente de devolución (super plan C1): revisar → conflictos → diferencia final → enviar o a mano → justificante.
 *  Solo describe en qué punto está el plan guardado; los botones y las rutas de envío no cambian. */
export type ReturnStepId = 'review' | 'conflicts' | 'final' | 'send' | 'receipt';
export type ReturnStepState = 'done' | 'current' | 'todo' | 'attention' | 'blocked';
export interface ReturnStep { id: ReturnStepId; n: number; title: string; state: ReturnStepState; hint: string }
export interface ReturnStepsInput { changes: number; plan: Pick<RecoveryPlan, 'status' | 'source' | 'operations'> | null; blocked: boolean; reviewed: boolean }
export interface ReturnSteps { steps: ReturnStep[]; current: ReturnStepId | null; headline: string; undecided: number; troubled: number }

const plural = (n: number, one: string, many: string) => n + ' ' + (n === 1 ? one : many);
const TITLES: Record<ReturnStepId, string> = { review: 'Revisar', conflicts: 'Conflictos', final: 'Diferencia final', send: 'Enviar o hacerlo a mano', receipt: 'Justificante' };
const ORDER: ReturnStepId[] = ['review', 'conflicts', 'final', 'send', 'receipt'];

export function returnSteps({ changes, plan, blocked, reviewed }: ReturnStepsInput): ReturnSteps {
  const fields = plan ? plan.operations.flatMap(op => op.fields) : [];
  // Misma regla que bloquea «Aprobar plan revisado»: cualquier campo sin decisión.
  const undecided = fields.filter(field => field.decision === null).length;
  const troubled = plan ? plan.operations.filter(op => op.status === 'failed' || op.status === 'uncertain').length : 0;
  const status = plan?.status ?? null;
  const approved = status === 'approved' || status === 'applying' || status === 'complete' || status === 'partial';
  const sent = status === 'complete' || status === 'partial';
  const target = plan?.source === 'hubspot' ? 'HubSpot de prueba' : 'el destino simulado';

  const done: Record<ReturnStepId, boolean> = { review: !!plan, conflicts: !!plan && undecided === 0, final: approved, send: status === 'complete', receipt: false };
  const hint: Record<ReturnStepId, string> = {
    review: plan ? plural(plan.operations.length, 'operación preparada', 'operaciones preparadas') : changes ? plural(changes, 'cambio guardado', 'cambios guardados') + ': prepara la revisión' : 'Aún no hay cambios que devolver',
    conflicts: !plan ? 'Se resuelven campo a campo' : undecided ? plural(undecided, 'campo por decidir', 'campos por decidir') : 'Sin decisiones pendientes',
    final: approved ? 'Plan aprobado' : plan && !undecided ? (reviewed ? 'Listo para aprobar' : 'Confirma la revisión y aprueba') : 'Lo que quedará tras enviar',
    send: status === 'complete' ? 'Enviado y verificado en ' + target : status === 'partial' ? plural(troubled, 'operación necesita', 'operaciones necesitan') + ' atención' : status === 'applying' ? 'Enviando y verificando…' : approved ? 'Ejecuta el envío a ' + target : 'O exporta y hazlo a mano con la agencia',
    receipt: status === 'complete' ? 'Descarga el registro de lo devuelto' : 'Al terminar, descarga lo devuelto',
  };

  const current = blocked ? null : status === 'complete' ? 'receipt' : ORDER.find(id => !done[id]) ?? null;
  const steps = ORDER.map((id, index): ReturnStep => {
    const state: ReturnStepState = blocked ? 'blocked'
      : done[id] ? 'done'
      : id === current ? (id === 'send' && (status === 'partial' || troubled > 0) ? 'attention' : 'current')
      : 'todo';
    return { id, n: index + 1, title: TITLES[id], state, hint: hint[id] };
  });

  const headline = blocked ? 'Devolución en pausa hasta confirmar el estado guardado'
    : !plan && !changes ? 'Nada que devolver por ahora'
    : status === 'complete' ? (plan?.source === 'simulation' ? 'Prueba completada: los cambios siguen pendientes de la devolución real' : 'Devolución completada y verificada')
    : status === 'partial' ? 'Devolución parcial: revisa lo que falló antes de repetir'
    : 'Paso ' + (ORDER.indexOf(current ?? 'review') + 1) + ' de ' + ORDER.length + ' · ' + TITLES[current ?? 'review'];
  return { steps, current, headline, undecided, troubled };
}

/** Cada paso hecho cuenta entero; el actual, medio. Para la barra del asistente. */
export const returnProgress = (steps: ReturnStep[]) =>
  Math.round(steps.reduce((sum, step) => sum + (step.state === 'done' ? 1 : step.state === 'current' || step.state === 'attention' ? 0.5 : 0), 0) / steps.length * 100);
