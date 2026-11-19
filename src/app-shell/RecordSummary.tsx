import { useState } from 'react';
import { CalendarClock, Check, Copy, ExternalLink, ListPlus, Mail, Phone, Plus, RotateCcw } from 'lucide-react';
import type { AppState, CrmRecord, EntityName, FieldValue } from '../../shared/model.js';
import { displayValue } from '../components.js';
import { madridDay } from '../task-display.js';
import { dueStatus, initials } from './deal-insights.js';
import { FollowUpTemplates } from './FollowUpTemplates.js';
export { taskPreset } from './task-preset.js';

type Spec = NonNullable<AppState['spec']>;
/** Botón «Nueva tarea» de las fichas: deshabilitado (y explicado) si la ficha tiene cambios sin guardar. */
export function NewTaskButton({ onNewTask, blocked, label = 'Nueva tarea' }: { onNewTask?: () => void; blocked?: boolean; label?: string }) {
  if (!onNewTask && !blocked) return null;
  return <button type="button" className="button secondary" disabled={!onNewTask} onClick={onNewTask} title={blocked ? 'Guarda o cancela los cambios de esta ficha antes' : 'Abre una ficha nueva ya enlazada'}>{label === 'Nueva tarea' ? <ListPlus size={15} aria-hidden="true" /> : <Plus size={15} aria-hidden="true" />}{label}</button>;
}
/** Cabecera de la ficha de un cliente, una empresa o una tarea: lo que se usa a diario, a un clic.
 *  Escribir y llamar abren la aplicación de correo o de teléfono del equipo (enlaces mailto: / tel:); no se envía nada.
 *  En una tarea, «Marcar como hecha» cambia el estado del formulario; solo se guarda con «Guardar cambios».
 *  No repite el nombre (ya está en la cabecera) ni usa nombres accesibles con las etiquetas de los campos. */
export function RecordSummary({ entityName, spec, values, set, records, disabled, onNewTask, newTaskBlocked, onNewDeal, newDealBlocked }: {
  entityName: EntityName; spec: Spec; values: Record<string, FieldValue>; set: (key: string, value: FieldValue) => void; records: CrmRecord[]; disabled?: boolean;
  onNewTask?: () => void; newTaskBlocked?: boolean; onNewDeal?: () => void; newDealBlocked?: boolean;
}) {
  const entity = spec.entities.find(item => item.id === entityName);
  const [copied, setCopied] = useState(false);
  if (!entity) return null;
  const text = (key: string | undefined) => key && values[key] != null && values[key] !== '' ? String(values[key]) : '';
  const fieldBy = (test: RegExp, type?: string) => entity.fields.find(field => (type ? field.type === type : false) || test.test(field.key));
  if (entityName === 'tasks') {
    const statusField = entity.fields.find(field => field.key === (spec.roles?.taskStatus ?? 'status'));
    const doneOption = statusField?.options.find(option => /complet|hech|cerrad|termin|finaliz|done|closed/i.test(option.label + ' ' + option.id));
    const openOption = statusField?.options.find(option => option !== doneOption);
    const done = !!doneOption && values[statusField!.key] === doneOption.id;
    const dueKey = spec.roles?.dueDate ?? 'due_date';
    const status = dueStatus(values[dueKey], madridDay(new Date()), done);
    const refs = entity.fields.filter(field => field.type === 'reference').map(field => ({ field, shown: displayValue(values[field.key] ?? undefined, field, records, spec) })).filter(item => item.shown !== '—');
    return <section className="record-summary" data-entity="tasks" data-done={done ? 'true' : undefined} aria-label="Resumen de la tarea">
      <div className="rs-row">
        <p className="rs-chip" data-tone={status.tone}>{done ? <Check size={15} aria-hidden="true" /> : <CalendarClock size={15} aria-hidden="true" />}{status.label}</p>
        {statusField && doneOption ? <button type="button" className={'button ' + (done ? 'secondary' : 'primary')} disabled={disabled}
          onClick={() => set(statusField.key, done ? openOption?.id ?? null : doneOption.id)} title="Se guarda con «Guardar cambios»">
          {done ? <><RotateCcw size={15} aria-hidden="true" />Volver a abrir</> : <><Check size={15} aria-hidden="true" />Marcar como hecha</>}</button> : null}
      </div>
      {refs.length ? <p className="rs-meta">{refs.map(item => item.field.label + ': ' + item.shown).join(' · ')}</p> : null}
    </section>;
  }
  const emailField = fieldBy(/^e?mail$|correo/i, 'email'), phoneField = fieldBy(/phone|tel[eé]fono|movil|mobile/i), webField = entityName === 'companies' ? fieldBy(/domain|website|web|sitio/i) : undefined;
  const email = text(emailField?.key), phone = text(phoneField?.key), web = text(webField?.key);
  const name = entityName === 'contacts' ? [text(entity.displayField), text('lastname')].filter(Boolean).join(' ') : text(entity.displayField);
  const href = web ? (/^https?:\/\//i.test(web) ? web : 'https://' + web) : '';
  const companyRef = entityName === 'contacts' ? entity.fields.find(field => field.type === 'reference' && field.referenceEntity === 'companies') : undefined;
  const companyShown = companyRef ? displayValue(values[companyRef.key] ?? undefined, companyRef, records, spec) : '';
  const company = entityName === 'companies' ? text(entity.displayField)
    : companyShown && companyShown !== '—' && companyShown !== 'Relación no disponible' ? companyShown : text(entity.fields.find(field => field.type === 'text' && /company|empresa/i.test(field.key))?.key);
  const [y, m, d] = madridDay(new Date()).split('-');
  const templateContext = { nombre: entityName === 'contacts' ? text(entity.displayField) : '', empresa: company, correo: email, telefono: phone, hoy: d + '/' + m + '/' + y };
  const copy = async () => { try { await navigator.clipboard.writeText(email); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { /* sin portapapeles: no pasa nada */ } };
  return <section className="record-summary" data-entity={entityName} aria-label={entityName === 'contacts' ? 'Resumen del cliente' : 'Resumen de la empresa'}>
    <div className="rs-row">
      <span className="rs-avatar" aria-hidden="true">{initials(name)}</span>
      <div className="rs-lines">
        {email ? <span className="rs-line"><Mail size={14} aria-hidden="true" />{email}</span> : null}
        {phone ? <span className="rs-line"><Phone size={14} aria-hidden="true" />{phone}</span> : null}
        {web ? <span className="rs-line"><ExternalLink size={14} aria-hidden="true" />{web.replace(/^https?:\/\//i, '')}</span> : null}
        {!email && !phone && !web ? <span className="rs-line rs-missing">Sin datos de contacto todavía</span> : null}
      </div>
    </div>
    {email || phone || web || onNewTask || newTaskBlocked || onNewDeal || newDealBlocked ? <div className="rs-actions">
      {email ? <a className="button secondary" href={'mailto:' + email}><Mail size={15} aria-hidden="true" />Escribir</a> : null}
      {email ? <button type="button" className="button secondary" onClick={() => void copy()}>{copied ? <Check size={15} aria-hidden="true" /> : <Copy size={15} aria-hidden="true" />}{copied ? 'Copiado' : 'Copiar dirección'}</button> : null}
      {phone ? <a className="button secondary" href={'tel:' + phone.replace(/[^\d+]/g, '')}><Phone size={15} aria-hidden="true" />Llamar</a> : null}
      {href ? <a className="button secondary" href={href} target="_blank" rel="noopener noreferrer"><ExternalLink size={15} aria-hidden="true" />Abrir web</a> : null}
      <NewTaskButton onNewTask={onNewTask} blocked={newTaskBlocked} />
      <NewTaskButton onNewTask={onNewDeal} blocked={newDealBlocked} label="Nueva oportunidad" />
    </div> : null}
    <FollowUpTemplates context={templateContext} />
    <span className="sr-only" role="status">{copied ? 'Dirección copiada' : ''}</span>
  </section>;
}
