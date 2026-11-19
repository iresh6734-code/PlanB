import { commitmentRoles, type CommitmentEvidence, type CommitmentSummary } from '../shared/commitments.js';
import { multisystemProviderLabels } from '../shared/commitment-multisystem-demo.js';
import type { SimulationAlternative } from '../shared/commitment-simulation.js';

// T4 · Textos y lógica pura del Radar de compromisos: CommitmentRadar.tsx solo pinta.
export type Status = CommitmentSummary['status'];
export type Role = (typeof commitmentRoles)[number];
export interface Draft { mode: 'assign' | 'close'; owner: string; nextStep: string; due: string; basis: 'observed' | 'manual'; note: string; from: { id: SimulationAlternative['id']; title: string; revision: string; evaluatedAt: string; missing: string[]; projectedDueAt: string | null } | null; generated: { nextStep: string; due: string } | null; confirmed: boolean }
export const GROUPS: { status: Status; title: string; hint: string }[] = [
  { status: 'at-risk', title: 'En riesgo', hint: 'Una fuente observó un bloqueo o ya pasó la fecha sin entrega observada.' },
  { status: 'unconfirmed', title: 'Sin confirmar', hint: 'Faltan datos para afirmar nada: una fuente parcial, antigua, caída o sin vincular no equivale a sano.' },
  { status: 'no-risk-detected', title: 'Sin riesgo detectado con los datos disponibles', hint: 'No se observó ningún bloqueo en las fuentes vinculadas. No es una garantía de cumplimiento.' },
  { status: 'resolved', title: 'Resuelto', hint: 'Cerrado por una persona, con evidencia observada o de forma manual.' },
];
export const STATUS_LABEL: Record<Status, string> = { 'at-risk': 'En riesgo', unconfirmed: 'Sin confirmar', 'no-risk-detected': 'Sin riesgo detectado', resolved: 'Resuelto' };
export const ROLE_LABEL: Record<Role, string> = { sale: 'Venta', delivery: 'Entrega', support: 'Soporte' };
const CAUSE: Record<CommitmentSummary['cause'], string> = {
  'source-blocked': 'Una fuente observó un bloqueo',
  'deadline-passed': 'Pasó la fecha comprometida sin una entrega observada',
  'coverage-incomplete': 'Faltan datos: alguna fuente es parcial, antigua, no responde o no está vinculada',
  'no-blocker-observed': 'No se observó ningún bloqueo en las fuentes vinculadas',
  'closed-observed': 'Cerrado con evidencia observada y confirmado por una persona',
  'closed-manual': 'Cerrado manualmente por una persona',
};
export const EVIDENCE_LABEL: Record<CommitmentEvidence['state'], string> = { observed: 'Observada', partial: 'Parcial', stale: 'Antigua', unavailable: 'No disponible', missing: 'Sin vincular', ambiguous: 'Ambigua: sin confirmar' };
export const CONDITION_LABEL = { clear: 'Sin bloqueo', blocked: 'Bloqueada', completed: 'Completada' } as const;
export const COVERAGE_LABEL = { complete: 'cobertura completa', partial: 'cobertura parcial', unavailable: 'fuente no disponible' } as const;
export const BASIS_LABEL = { explicit: 'referencia explícita', confirmed: 'confirmado por una persona' } as const;
export const EFFECT: Record<SimulationAlternative['deadlineEffect'], string> = { late: 'Sigue siendo posterior a la fecha comprometida original: el nuevo plazo hay que acordarlo con el cliente', 'within-window': 'Cae dentro de la ventana comprometida', unknown: 'Efecto sobre el plazo: desconocido' };
export const when = (iso: string) => new Date(iso).toLocaleString('es-ES', { dateStyle: 'medium', timeStyle: 'short' });
export const emptyDraft = (): Draft => ({ mode: 'assign', owner: '', nextStep: '', due: '', basis: 'manual', note: '', from: null, generated: null, confirmed: false });
/** Hay algo escrito que se perdería al cerrar o cambiar de compromiso. */
export const dirty = (draft: Draft) => !!(draft.owner.trim() || draft.nextStep.trim() || draft.due || draft.note.trim());
export const causeText = (item: Pick<CommitmentSummary, 'cause' | 'affectedRole'>) => CAUSE[item.cause] + (item.affectedRole ? ' (' + ROLE_LABEL[item.affectedRole].toLocaleLowerCase('es') + ')' : '');
/** Rótulo de procedencia: SIEMPRE dato de ensayo y nunca «conectado» (la fuente es `multisystemProviderLabels`; un proveedor desconocido no se rotula como real). */
export const providerLabel = (provider: string): string | null => { const known = (multisystemProviderLabels as Record<string, { label: string; connected: boolean }>)[provider]; return known ? known.label + ' · no conectado' : null; };
const pad = (n: number) => String(n).padStart(2, '0');
/** Fecha ISO en el formato de `<input type="datetime-local">`, en hora local. */
export const toLocalInput = (iso: string) => { const d = new Date(iso); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes()); };
