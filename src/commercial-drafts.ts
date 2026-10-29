import type { CommercialProposal } from '../shared/commercial.js';

export interface Reconciled { proposals: CommercialProposal[]; dirty: string[]; dropped: string[]; }
/** Combina la lectura del servidor con las ediciones sin guardar. Una edición solo se conserva si el servidor no cambió esa propuesta. */
export function reconcileDrafts(current: CommercialProposal[], fresh: CommercialProposal[], dirty: string[]): Reconciled {
  const kept: string[] = [], dropped: string[] = [];
  const proposals = fresh.map(proposal => {
    if (!dirty.includes(proposal.id)) return proposal;
    const local = current.find(item => item.id === proposal.id);
    if (local && local.content_hash === proposal.content_hash) { kept.push(proposal.id); return { ...proposal, content: local.content, status: 'draft' as const }; }
    dropped.push(proposal.id);
    return proposal;
  });
  for (const id of dirty) if (!fresh.some(proposal => proposal.id === id) && !dropped.includes(id)) dropped.push(id);
  return { proposals, dirty: kept, dropped };
}

export interface DecisionState { busy: boolean; canWrite: boolean; dirty: boolean; reviewed: boolean; blockedRecipient: boolean; connected: boolean; status: 'draft' | 'approved'; }
/** Motivos por los que no se puede aprobar o ejecutar. Lista vacía = permitido. No relaja ninguna condición existente. */
export function decisionBlockers(state: DecisionState): string[] {
  const reasons: string[] = [];
  if (state.busy) reasons.push('Hay una operación en curso. Espera a que termine.');
  if (!state.canWrite) reasons.push('Tu acceso es de solo lectura.');
  if (state.status === 'approved' && !state.connected) reasons.push('Google no está conectado. Reconecta la cuenta para ejecutar las acciones.');
  if (state.dirty) reasons.push('Guarda los cambios del borrador antes de continuar.');
  if (state.blockedRecipient) reasons.push('El piloto solo permite correos e invitaciones a tu propia cuenta Google conectada.');
  if (!state.reviewed) reasons.push(state.status === 'approved' ? 'Confirma que quieres ejecutar ahora las acciones externas.' : 'Marca que has revisado el destinatario, el mensaje, las acciones y el horario.');
  return reasons;
}
export function prepareBlockers(state: { busy: boolean; canWrite: boolean; contact: string }): string[] {
  const reasons: string[] = [];
  if (state.busy) reasons.push('Hay una operación en curso. Espera a que termine.');
  if (!state.canWrite) reasons.push('Tu acceso es de solo lectura. Una persona con permiso de edición puede preparar el seguimiento.');
  if (!state.contact) reasons.push('Selecciona un cliente.');
  return reasons;
}
export function openDraftFor(proposals: CommercialProposal[], contactId: string) {
  return contactId ? proposals.find(proposal => proposal.contact_id === contactId && ['draft', 'approved'].includes(proposal.status)) : undefined;
}

export interface ContactLike { id: string; values: Record<string, unknown>; }
const fold = (value: string) => value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
export function contactLabel(contact: ContactLike) {
  const name = [contact.values.firstname, contact.values.lastname].map(value => String(value ?? '').trim()).filter(Boolean).join(' ');
  const email = String(contact.values.email ?? '').trim();
  return (name || 'Contacto sin nombre') + (email ? ' · ' + email : ' · sin correo');
}
/** Filtra por nombre, correo o teléfono sin acentos y limita lo que se pinta. `total` es el número de coincidencias. */
export function filterContacts<T extends ContactLike>(contacts: T[], query: string, limit = 100): { items: T[]; total: number } {
  const needle = fold(query.trim());
  const matches = needle ? contacts.filter(contact => fold([contact.values.firstname, contact.values.lastname, contact.values.email, contact.values.phone].map(value => String(value ?? '')).join(' ')).includes(needle)) : contacts;
  return { items: matches.slice(0, limit), total: matches.length };
}
