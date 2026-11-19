// Devolución al CRM explicada (parte de la mejora C4; CLAUDE-RETURN-EXPLAIN, 17/11/2026).
// El plan de server/recovery.ts ya sabe, por campo, el valor capturado (base), el local y el actual del CRM (remote), si
// hay conflicto y qué se decidió. Este módulo lo traduce a lo que una persona necesita para decidir: agrupado por cliente,
// con los valores como los ve en la App (nunca IDs internos ni fechas ISO) y una frase por campo que dice qué pasará.
// Puro y sin efectos: no decide nada ni toca el plan.
import type { AppSpec, CrmRecord, EntityName, Field, FieldValue } from './model.js';
import type { RecoveryField, RecoveryOperation, RecoveryPlan } from './operations.js';

/**
 * Por hacer: send, conflict, overwrite, create. Sin envío: same, keep. Ya resuelto en el motor (R2, revisión 430):
 * done (enviado y verificado), skipped (omitido) y uncertain (pudo llegar o no: se comprueba antes de repetir).
 */
export type ReturnTone = 'send' | 'same' | 'conflict' | 'overwrite' | 'keep' | 'create' | 'done' | 'skipped' | 'uncertain';
export type ExplainedField = { field: string; label: string; tone: ReturnTone; text: string; base: string; local: string; remote: string };
export type ExplainedOperation = { id: string; label: string; entity: EntityName; entityLabel: string; kind: RecoveryOperation['kind']; status: RecoveryOperation['status']; fields: ExplainedField[]; relations: string[] };
export type ReturnGroup = { key: string; title: string; operations: ExplainedOperation[]; conflicts: number };
/** Campos por tono, salvo `creates`: registros nuevos que aún hay que crear (los ya creados, aunque falten relaciones, no cuentan). */
export type ReturnSummary = { operations: number; send: number; same: number; conflicts: number; overwrite: number; keep: number; creates: number; done: number; skipped: number; uncertain: number };
export type ReturnExplanation = { summary: ReturnSummary; groups: ReturnGroup[]; target: string };

const EMPTY = 'vacío';
const q = (text: string) => text === EMPTY ? EMPTY : '«' + text + '»';

/** Valor tal como lo ve la persona en la App. `name` resuelve una relación al nombre del registro. */
export function formatValue(field: Field | undefined, value: FieldValue | undefined, name: (entity: EntityName, id: string) => string | null): string {
  if (value === null || value === undefined || value === '') return EMPTY;
  if (!field) return String(value);
  const label = (id: string) => field.options.find(option => option.id === id)?.label ?? id;
  switch (field.type) {
    case 'enum': return label(String(value));
    case 'multiselect': return String(value).split(';').filter(Boolean).map(label).join(', ');
    case 'boolean': return value === true || value === 'true' ? 'sí' : 'no';
    case 'number': return typeof value === 'number' ? value.toLocaleString('es-ES') : String(value);
    case 'date': { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value)); return m ? m[3] + '/' + m[2] + '/' + m[1] : String(value); }
    case 'datetime': {
      const date = new Date(String(value));
      return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString('es-ES', { timeZone: 'Europe/Madrid', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    }
    case 'reference': return field.referenceEntity ? name(field.referenceEntity, String(value)) ?? 'un registro que ya no está en la copia' : String(value);
    default: return String(value);
  }
}

/** Qué pasará con un campo y por qué, en una frase. `target` es el nombre del CRM («HubSpot»). */
/** «lo de HubSpot», pero «lo del CRM de prueba». */
const loDe = (target: string) => target.startsWith('el ') ? 'lo del ' + target.slice(3) : 'lo de ' + target;

export function explainField(kind: RecoveryOperation['kind'], field: RecoveryField, values: { base: string; local: string; remote: string }, target: string, status: RecoveryOperation['status'] = 'pending', created = false): { tone: ReturnTone; text: string } {
  const { base, local, remote } = values;
  // Lo que el motor ya resolvió no se vuelve a prometer en futuro.
  if (status === 'applied') return { tone: 'done', text: field.decision === 'remote' || kind === 'update' && field.local === field.remote ? 'Sin cambios en ' + target + ': se quedó ' + q(remote) + '.' : 'Ya está en ' + target + ': ' + q(local) + ', enviado y verificado.' };
  if (status === 'skipped') return { tone: 'skipped', text: 'Omitido: no se envía a ' + target + '.' };
  if (status === 'uncertain' || status === 'sending') return { tone: 'uncertain', text: 'No se sabe si ' + q(local) + ' llegó a ' + target + '. Compruébalo antes de repetir.' };
  if (kind === 'create') return created
    ? { tone: 'done', text: 'Ya se creó en ' + target + ' con ' + q(local) + '; solo faltan sus relaciones.' }
    : { tone: 'create', text: 'Se creará en ' + target + ' con ' + q(local) + '.' };
  if (field.conflict && field.decision === null) return { tone: 'conflict', text: 'Conflicto: al capturar era ' + q(base) + '; tú lo cambiaste a ' + q(local) + ' y en ' + target + ' alguien lo cambió a ' + q(remote) + '. Elige cuál se queda.' };
  if (field.conflict && field.decision === 'local') return { tone: 'overwrite', text: 'Se sustituirá lo que alguien puso en ' + target + ' (' + q(remote) + ') por tu valor, ' + q(local) + '.' };
  if (field.decision === 'remote') return field.local === field.remote || local === remote
    ? { tone: 'same', text: target + ' ya tiene ' + q(local) + '. No se envía nada.' }
    : { tone: 'keep', text: 'Se queda ' + loDe(target) + ' (' + q(remote) + '). Tu cambio a ' + q(local) + ' solo seguirá en tu copia local.' };
  return { tone: 'send', text: 'En ' + target + ' pasará de ' + q(remote) + ' a ' + q(local) + '.' };
}

/**
 * Explica un plan de devolución. `records` es la copia local (para nombres de relaciones y para agrupar por cliente).
 * Grupo de cada operación: la empresa del registro si la tiene; si no, la persona (o la empresa de esa persona); si no,
 * el propio registro. Los grupos con conflictos sin decidir van primero; dentro, en el orden del plan.
 */
export function explainReturnPlan(plan: RecoveryPlan, spec: AppSpec, records: CrmRecord[]): ReturnExplanation {
  const target = plan.source === 'hubspot' ? 'HubSpot' : 'el CRM de prueba';
  const byKey = new Map(records.map(record => [record.entity + ':' + record.id, record]));
  const entityOf = (id: EntityName) => spec.entities.find(entity => entity.id === id);
  const nameOf = (entity: EntityName, id: string): string | null => {
    const record = byKey.get(entity + ':' + id), definition = entityOf(entity);
    if (!record || !definition) return null;
    const main = String(record.values[definition.displayField] ?? '').trim();
    const last = entity === 'contacts' && record.values.lastname ? ' ' + String(record.values.lastname) : '';
    return (main + last).trim() || null;
  };
  const referenceTo = (record: CrmRecord | undefined, entity: EntityName) => {
    const definition = record && entityOf(record.entity);
    const field = definition?.fields.find(f => f.type === 'reference' && f.referenceEntity === entity && record!.values[f.key]);
    return field ? String(record!.values[field.key]) : null;
  };
  const groupOf = (op: RecoveryOperation): { key: string; title: string } => {
    const record = byKey.get(op.entity + ':' + op.localId);
    if (op.entity === 'companies') return { key: 'companies:' + op.localId, title: nameOf('companies', op.localId) ?? op.label };
    const company = referenceTo(record, 'companies');
    if (company && nameOf('companies', company)) return { key: 'companies:' + company, title: nameOf('companies', company)! };
    const contactId = op.entity === 'contacts' ? op.localId : referenceTo(record, 'contacts');
    if (contactId) {
      const contactCompany = referenceTo(byKey.get('contacts:' + contactId), 'companies');
      if (contactCompany && nameOf('companies', contactCompany)) return { key: 'companies:' + contactCompany, title: nameOf('companies', contactCompany)! };
      if (nameOf('contacts', contactId)) return { key: 'contacts:' + contactId, title: nameOf('contacts', contactId)! };
    }
    return { key: op.entity + ':' + op.localId, title: op.label };
  };

  const summary: ReturnSummary = { operations: plan.operations.length, send: 0, same: 0, conflicts: 0, overwrite: 0, keep: 0, creates: 0, done: 0, skipped: 0, uncertain: 0 };
  const groups = new Map<string, ReturnGroup>();
  for (const op of plan.operations) {
    const definition = entityOf(op.entity);
    // Un alta con ID remoto ya está creada: solo pueden faltar sus relaciones.
    const created = op.kind === 'create' && !!op.remoteId;
    const fields = op.fields
      // En un alta, un campo vacío no dice nada («se creará con vacío»): no se explica.
      .filter(field => !(op.kind === 'create' && (field.local === null || field.local === undefined || field.local === '')))
      .map(field => {
        const spec = definition?.fields.find(f => f.key === field.field);
        const values = { base: formatValue(spec, field.base, nameOf), local: formatValue(spec, field.local, nameOf), remote: formatValue(spec, field.remote, nameOf) };
        const { tone, text } = explainField(op.kind, field, values, target, op.status, created);
        if (tone === 'conflict') summary.conflicts++; else if (tone !== 'create') summary[tone]++;
        return { field: field.field, label: field.label, tone, text, ...values };
      });
    // R3 (revisión 454): solo lo pendiente o fallido promete altas y relaciones. Incierto, en envío u omitido piden comprobar.
    const open = op.status === 'pending' || op.status === 'failed';
    if (op.kind === 'create' && !created && open) summary.creates++;
    const relations = !open ? [] : op.references.filter(ref => ref.id).map(ref => {
      const field = definition?.fields.find(f => f.key === ref.field);
      return 'Se enlazará con ' + (nameOf(ref.entity, ref.id!) ?? 'un registro que ya no está en la copia') + (field ? ' (' + field.label.toLowerCase() + ')' : '') + '.';
    });
    const { key, title } = groupOf(op);
    const group = groups.get(key) ?? { key, title, operations: [], conflicts: 0 };
    group.operations.push({ id: op.id, label: op.label, entity: op.entity, entityLabel: definition?.singular ?? op.entity, kind: op.kind, status: op.status, fields, relations });
    group.conflicts += fields.filter(f => f.tone === 'conflict').length;
    groups.set(key, group);
  }
  const ordered = [...groups.values()].sort((a, b) => Number(b.conflicts > 0) - Number(a.conflicts > 0));
  return { summary, groups: ordered, target };
}
