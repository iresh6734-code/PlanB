import { useEffect, useRef, useState, type ReactNode } from 'react';
import { X, LoaderCircle } from 'lucide-react';
import { api, ApiError } from './api.js';
import { ReferenceSelect } from './ReferenceSelect.js';
import { validateRecord, type AppSpec, type CrmRecord, type EntityName, type Field, type FieldValue } from '../shared/model.js';

export function Brand() {
  return <div className="brand" aria-label="Plan B">Plan <span>B</span></div>;
}
export function Spinner({ text = 'Preparando…' }: { text?: string }) {
  return <span className="inline-loading"><LoaderCircle size={17} className="spin" />{text}</span>;
}
export function Modal({ title, children, close, wide = false, side = false, confirmClose }: { title: string; children: ReactNode; close: () => void; wide?: boolean; side?: boolean; confirmClose?: () => boolean }) {
  const dialog = useRef<HTMLElement>(null);
  useDialogFocus(dialog);
  // El cierre (botón, Escape o clic fuera) pasa por la misma guarda. Se lee desde una referencia para que el efecto no se
  // reinicie ni robe el foco cuando el padre se vuelve a pintar con una función `close` nueva.
  const closing = useRef({ close, confirmClose });
  closing.current = { close, confirmClose };
  const requestClose = () => { if (!closing.current.confirmClose || closing.current.confirmClose()) closing.current.close(); };
  useEffect(() => {
    // Un modal dentro de una pantalla oculta o inerte (sesión bloqueada) no responde a Escape.
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape' && !dialog.current?.closest('[inert],[hidden]')) requestClose(); };
    const previous = document.activeElement as HTMLElement | null;
    document.addEventListener('keydown', key);
    const timer = setTimeout(() => document.querySelector<HTMLElement>('[role="dialog"] button')?.focus(), 0);
    return () => { clearTimeout(timer); document.removeEventListener('keydown', key); previous?.focus(); };
  }, []);
  return <div className="modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) requestClose(); }}>
    <section ref={dialog} role="dialog" aria-modal="true" aria-label={title} className={'modal ' + (wide ? 'modal-wide' : '')+(side?' modal-side':'')}>
      <header className="modal-header"><h2>{title}</h2><button className="icon-button" aria-label="Cerrar" onClick={requestClose}><X size={22} /></button></header>
      {children}
    </section>
  </div>;
}
function useDialogFocus(ref: { current: HTMLElement | null }) {
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const panel = ref.current;
    const focusable = () => [...(panel?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]') ?? [])];
    const timer = setTimeout(() => focusable()[0]?.focus(), 0);
    const key = (event: KeyboardEvent) => {
      if (event.key !== 'Tab' || [...document.querySelectorAll('[role="dialog"]')].at(-1) !== panel || panel?.closest('[inert],[hidden]')) return;
      const items = focusable(), first = items[0], last = items.at(-1);
      if (event.shiftKey && (document.activeElement === first || !panel?.contains(document.activeElement))) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || !panel?.contains(document.activeElement))) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener('keydown', key);
    return () => { clearTimeout(timer); document.removeEventListener('keydown', key); previous?.focus(); };
  }, [ref]);
}
export function recordName(record: CrmRecord, spec: AppSpec) {
  const entity = spec.entities.find(e => e.id === record.entity)!;
  const name = record.values[entity.displayField];
  return String(name || record.id) + (record.entity === 'contacts' && record.values.lastname ? ' ' + record.values.lastname : '');
}
export function displayValue(value: FieldValue | undefined, field: Field, records: CrmRecord[], spec: AppSpec): string {
  if (value === null || value === undefined || value === '') return '—';
  if (field.type === 'reference') {
    const related = records.find(r => r.entity === field.referenceEntity && r.id === String(value));
    return related ? recordName(related, spec) : 'Relación no disponible';
  }
  if (field.type === 'enum') return field.options.find(o => o.id === String(value))?.label ?? String(value);
  if (field.type === 'boolean') return value ? 'Sí' : 'No';
  if (field.type === 'number') return new Intl.NumberFormat('es-ES', field.label.includes('€') ? { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 } : {}).format(Number(value));
  if (field.type === 'date'||field.type==='datetime') return new Intl.DateTimeFormat('es-ES', { ...(field.type==='date'?{timeZone:'UTC'}:{hour:'2-digit',minute:'2-digit'}), day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(String(value)));
  if(field.type==='multiselect')return String(value).split(';').map(v=>field.options.find(o=>o.id===v)?.label??v).join(', ');
  return String(value);
}
export function RecordDrawer({ entityName, selected, spec, records, close, saved }: {
  entityName: EntityName; selected: CrmRecord | 'new'; spec: AppSpec; records: CrmRecord[];
  close: () => void; saved: (record: CrmRecord) => Promise<void>;
}) {
  const entity = spec.entities.find(e => e.id === entityName)!;
  const dialog = useRef<HTMLElement>(null);
  useDialogFocus(dialog);
  const isNew = selected === 'new';
  const [values, setValues] = useState<Record<string, FieldValue>>(() => isNew
    ? Object.fromEntries(entity.fields.map(f => [f.key, f.type === 'boolean' ? false : f.type === 'number' && f.required ? 0
      : f.key === 'dealstage' || f.key === 'pipeline' || f.key === 'status' || f.key === 'hs_task_status' ? f.options[0]?.id ?? '' : '']))
    : { ...selected.values });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const relatedCompany = records.find(r => r.entity === 'companies' && r.id === String(values.company_id ?? values.planb_company_id));
  const title = isNew ? 'Nueva ' + entity.singular : recordName(selected, spec);
  const correctedTitle = isNew && ['cliente', 'pedido'].includes(entity.singular) ? 'Nuevo ' + entity.singular : title;
  const set = (key: string, value: FieldValue) => {
    setValues(previous => ({ ...previous, [key]: value,...(key==='pipeline'?{dealstage:spec.stages.find(s=>s.pipelineId===value)?.id??previous.dealstage}:{}) }));
    setErrors(previous => { const next = { ...previous }; delete next[key]; delete next._form; return next; });
  };
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const record: CrmRecord = { entity: entityName, id: isNew ? 'new' : selected.id, values };
    const issues = validateRecord(spec, record, isNew ? null : selected);
    if (Object.keys(issues).length) { setErrors(issues); return; }
    setSaving(true);
    try {
      const path = '/records/' + entityName + (isNew ? '' : '/' + encodeURIComponent(selected.id));
      const result = await api<{ record: CrmRecord }>(path, { method: isNew ? 'POST' : 'PATCH', body: JSON.stringify({ values }) });
      await saved(result.record);
    } catch (error) {
      if (error instanceof ApiError && error.details && typeof error.details === 'object' && !Array.isArray(error.details)) setErrors(error.details as Record<string, string>);
      else setErrors({ _form: error instanceof Error ? error.message : 'No se pudo guardar.' });
    } finally { setSaving(false); }
  };
  return <aside ref={dialog} className="record-drawer" role="dialog" aria-modal="true" aria-label={correctedTitle}>
    <header className="drawer-header"><div><h2>{correctedTitle}</h2><p>{entity.singular[0].toUpperCase() + entity.singular.slice(1)}{relatedCompany ? ' · ' + relatedCompany.values.name : ' · Copia local'}</p></div>
      <button className="icon-button" aria-label="Cerrar edición" onClick={close}><X size={23} /></button></header>
    <form onSubmit={submit} className="drawer-form" noValidate>
      <div className="drawer-fields">
        {entity.fields.map(field => <label className="field" key={field.key} htmlFor={'record-' + field.key}>
          <span>{field.label}{field.required ? <span className="required"> *</span> : null}{field.readOnly ? <small>Solo lectura</small> : null}</span>
          {field.type==='reference'?<ReferenceSelect id={'record-'+field.key} value={String(values[field.key]??'')} entity={field.referenceEntity!} spec={spec} disabled={field.readOnly||saving} onChange={value=>set(field.key,value)}/>
            : field.type === 'enum' || field.type==='multiselect'
            ? <select id={'record-' + field.key} multiple={field.type==='multiselect'} value={field.type==='multiselect'?String(values[field.key]??'').split(';').filter(Boolean):String(values[field.key] ?? '')} disabled={field.readOnly || saving} aria-invalid={!!errors[field.key]}
                onChange={event => set(field.key,field.type==='multiselect'?[...event.target.selectedOptions].map(o=>o.value).join(';')||null: event.target.value || null)}>
                {field.type!=='multiselect'?<option value="">Seleccionar…</option>:null}
                {(field.key==='dealstage'&&values.pipeline?field.options.filter(o=>spec.stages.some(s=>s.id===o.id&&(!s.pipelineId||s.pipelineId===values.pipeline))):field.options)
                  .map(option => <option key={option.id} value={option.id}>{option.label}</option>)}
              </select>
            : field.type === 'boolean'
              ? <select id={'record-' + field.key} value={values[field.key] ? 'true' : 'false'} disabled={field.readOnly || saving} onChange={event => set(field.key, event.target.value === 'true')}>
                  <option value="false">No</option><option value="true">Sí</option>
                </select>
              : <input id={'record-' + field.key} type={field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : field.type==='datetime'?'datetime-local':field.type === 'email' ? 'email' : 'text'}
                  step={field.type === 'number' ? 'any' : undefined} maxLength={10000} autoComplete="off"
                  value={field.type === 'date' ? String(values[field.key] ?? '').slice(0, 10) :field.type==='datetime'&&values[field.key]?new Date(new Date(String(values[field.key])).getTime()-new Date(String(values[field.key])).getTimezoneOffset()*60_000).toISOString().slice(0,16): String(values[field.key] ?? '')}
                  disabled={field.readOnly || saving} aria-invalid={!!errors[field.key]}
                  onChange={event => set(field.key, field.type === 'number' ? event.target.value === '' ? null : Number(event.target.value) :field.type==='datetime'?event.target.value?new Date(event.target.value).toISOString():null: event.target.value || null)} />}
          {errors[field.key] ? <em className="field-error" role="alert">{errors[field.key]}</em> : null}
        </label>)}
        {errors._form ? <p className="error-box" role="alert">{errors._form}</p> : null}
        {spec.rules.some(rule => rule.entity === entityName) ? <div className="rule-notes">
          <h3>Reglas aplicadas</h3>
          {spec.rules.filter(rule => rule.entity === entityName).map(rule => <div key={rule.id}><p>{rule.description}</p>
            <small>{rule.origin === 'configuration' ? 'Configuración importada' : 'Instrucción del usuario'}</small></div>)}
        </div> : null}
      </div>
      <footer className="drawer-footer"><button type="button" className="button secondary" onClick={close} disabled={saving}>Cancelar</button>
        <button type="submit" className="button primary" disabled={saving}>{saving ? <Spinner text="Guardando…" /> : isNew ? 'Crear ' + entity.singular : 'Guardar cambios'}</button></footer>
    </form>
  </aside>;
}
