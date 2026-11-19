import { useState } from 'react';
import { Check, Copy, PenLine, Plus, Trash2 } from 'lucide-react';
import { fillTemplate, MAX_BODY, MAX_NAME, parseTemplates, serializeTemplates, TEMPLATE_SLOTS, TEMPLATES_KEY, upsertTemplate, type FollowUpTemplate, type TemplateContext } from './templates.js';

function readStored() {
  try { return parseTemplates(window.localStorage.getItem(TEMPLATES_KEY)); } catch { return parseTemplates(null); }
}
function store(list: FollowUpTemplate[]) {
  try { window.localStorage.setItem(TEMPLATES_KEY, serializeTemplates(list)); return true; } catch { return false; }
}

/** Plantillas de seguimiento en la ficha: se rellenan con los datos del cliente y se copian. No se envía nada. */
export function FollowUpTemplates({ context }: { context: TemplateContext }) {
  const [list, setList] = useState<FollowUpTemplate[]>(readStored);
  const [current, setCurrent] = useState(() => list[0]?.id ?? '');
  const [draft, setDraft] = useState<{ id?: string; name: string; body: string } | null>(null);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const chosen = list.find(item => item.id === current) ?? list[0];
  const filled = chosen ? fillTemplate(chosen.body, context) : null;
  const commit = (next: FollowUpTemplate[]) => { setList(next); if (!store(next)) setError('No se ha podido guardar en este navegador; la plantilla dura hasta que cierres la ventana.'); };
  const copy = async () => {
    if (!filled) return;
    try { await navigator.clipboard.writeText(filled.text); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { setError('Este navegador no deja copiar; selecciona el texto y cópialo a mano.'); }
  };
  const save = () => {
    if (!draft) return;
    const result = upsertTemplate(list, draft, () => 'p' + Date.now().toString(36));
    if (result.error) { setError(result.error); return; }
    setError(''); commit(result.list); setCurrent(result.id ?? current); setDraft(null);
  };
  const remove = () => {
    if (!chosen) return;
    const next = list.filter(item => item.id !== chosen.id);
    commit(next); setCurrent(next[0]?.id ?? ''); setDraft(null);
  };
  return <details className="rs-templates">
    <summary>Plantillas de seguimiento</summary>
    {draft ? <div className="rs-tpl-edit">
      <label>Nombre<input value={draft.name} maxLength={MAX_NAME} onChange={event => setDraft({ ...draft, name: event.target.value })} /></label>
      <label>Texto<textarea rows={6} value={draft.body} maxLength={MAX_BODY} onChange={event => setDraft({ ...draft, body: event.target.value })} /></label>
      <p className="rs-tpl-hint">Huecos: {TEMPLATE_SLOTS.map(slot => '{' + slot.key + '} ' + slot.label).join(' · ')}.</p>
      <div className="rs-actions">
        <button type="button" className="button primary" onClick={save}><Check size={15} aria-hidden="true" />Guardar plantilla</button>
        <button type="button" className="button secondary" onClick={() => { setDraft(null); setError(''); }}>Cancelar</button>
      </div>
    </div> : <>
      {list.length ? <label className="rs-tpl-pick">Plantilla<select value={chosen?.id ?? ''} onChange={event => { setCurrent(event.target.value); setError(''); }}>
        {list.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label> : <p className="rs-tpl-hint">No tienes plantillas. Crea una con huecos como {'{nombre}'} o {'{empresa}'}.</p>}
      {filled ? <pre className="rs-tpl-preview" aria-label="Texto listo para copiar">{filled.text}</pre> : null}
      {filled?.missing.length ? <p className="rs-tpl-hint">Sin dato en esta ficha: {filled.missing.map(key => '{' + key + '}').join(', ')}. Se copian tal cual para que los completes.</p> : null}
      <div className="rs-actions">
        {filled ? <button type="button" className="button secondary" onClick={() => void copy()}>{copied ? <Check size={15} aria-hidden="true" /> : <Copy size={15} aria-hidden="true" />}{copied ? 'Copiado' : 'Copiar texto'}</button> : null}
        {chosen ? <button type="button" className="button secondary" onClick={() => { setDraft({ ...chosen }); setError(''); }}><PenLine size={15} aria-hidden="true" />Editar</button> : null}
        <button type="button" className="button secondary" onClick={() => { setDraft({ name: '', body: '' }); setError(''); }}><Plus size={15} aria-hidden="true" />Nueva</button>
        {chosen ? <button type="button" className="button secondary" onClick={remove}><Trash2 size={15} aria-hidden="true" />Borrar</button> : null}
      </div>
    </>}
    {error ? <p className="rs-tpl-error" role="alert">{error}</p> : null}
    <span className="sr-only" role="status">{copied ? 'Texto copiado' : ''}</span>
    <p className="rs-tpl-hint">Se guardan solo en este navegador. Plan B no envía nada: pega el texto donde lo necesites.</p>
  </details>;
}
