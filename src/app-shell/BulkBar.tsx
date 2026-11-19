import { useEffect, useRef, useState } from 'react';
import { Layers, Undo2, X } from 'lucide-react';
import type { AppState, CrmRecord } from '../../shared/model.js';
import { recordName } from '../components.js';
import { bulkFields, bulkSummary, MAX_BULK, planBulk, undoItems, type BulkItem, type BulkResult } from './bulk-edit.js';

type Spec = NonNullable<AppState['spec']>;
type Props = {
  spec: Spec; entity: Spec['entities'][number];
  /** Registros marcados que siguen a la vista (búsqueda y filtros aplicados). */
  picked: CrmRecord[];
  /** El registro más reciente que tiene la lista, para deshacer sin pisar cambios posteriores. */
  fresh: (id: string) => CrmRecord | undefined;
  /** La lista se está recargando: deshacer espera a tener los registros al día. */
  reloading: boolean;
  saveMany: (items: BulkItem[], onProgress?: (handled: number, total: number) => void, signal?: AbortSignal) => Promise<BulkResult>;
  /** Deja marcados solo estos (los que no cambiaron, para reintentar). */
  keep: (ids: string[]) => void;
};
type Note = { tone: 'ok' | 'error'; text: string; result?: BulkResult };
const NOT_CHOSEN = '__elige';
const dayLabel = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) ? value.slice(8, 10) + '/' + value.slice(5, 7) + '/' + value.slice(0, 4) : value;

/** Barra flotante del cambio en bloque (V3): un campo, un valor, todos los marcados; progreso, detener y deshacer el lote. */
export function BulkBar({ spec, entity, picked, fresh, reloading, saveMany, keep }: Props) {
  const fields = bulkFields(entity);
  const [key, setKey] = useState(fields[0]?.key ?? '');
  const field = fields.find(item => item.key === key) ?? fields[0];
  const [value, setValue] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ handled: number; total: number; undo: boolean } | null>(null);
  const [note, setNote] = useState<Note | null>(null);
  const control = useRef<AbortController | null>(null);
  useEffect(() => () => control.current?.abort(), []);
  if (!field || (!picked.length && !progress && !note)) return null;
  const name = (record: CrmRecord) => recordName(record, spec);
  const valueLabel = (target: string | null) => !target ? 'vacío' : field.type === 'enum' ? field.options.find(option => option.id === target)?.label ?? target : dayLabel(target);
  const ready = value !== null && (!field.required || !!value) && picked.length > 0 && picked.length <= MAX_BULK;
  const run = async (items: BulkItem[], undo: boolean) => {
    const controller = new AbortController(); control.current = controller;
    setNote(null); setProgress({ handled: 0, total: items.length, undo });
    const result = await saveMany(items, (handled, total) => setProgress({ handled, total, undo }), controller.signal);
    control.current = null; setProgress(null);
    return result;
  };
  const apply = async () => {
    if (!ready || progress) return;
    const target = value || null, plan = planBulk(picked, field.key, target);
    const already = plan.unchanged ? ' ' + plan.unchanged + (plan.unchanged === 1 ? ' ya lo tenía.' : ' ya lo tenían.') : '';
    if (!plan.items.length) { setNote({ tone: 'ok', text: (picked.length === 1 ? 'El registro marcado ya tenía ' : 'Los ' + picked.length + ' registros marcados ya tenían ') + field.label.toLowerCase() + ' «' + valueLabel(target) + '». No hay nada que cambiar.' }); return; }
    const result = await run(plan.items, false);
    const left = plan.items.filter(item => !result.done.includes(item)).map(item => item.record.id);
    keep(left);
    setNote({ tone: result.failed.length ? 'error' : 'ok', text: field.label + ' → «' + valueLabel(target) + '»: ' + bulkSummary(result, name) + already + (left.length ? ' Siguen marcados los que no cambiaron.' : ''), result: result.done.length ? result : undefined });
  };
  const undo = async (batch: BulkResult) => {
    if (progress) return;
    const plan = undoItems(batch, fresh);
    const skipped = plan.skipped ? ' ' + plan.skipped + (plan.skipped === 1 ? ' se dejó como estaba porque cambió después.' : ' se dejaron como estaban porque cambiaron después.') : '';
    if (!plan.items.length) { setNote({ tone: 'error', text: 'No hay nada que deshacer.' + skipped }); return; }
    const result = await run(plan.items, true);
    setNote({ tone: result.failed.length ? 'error' : 'ok', text: bulkSummary(result, name, true) + skipped + ' Queda anotado en Cambios.' });
  };
  const share = progress ? Math.round(progress.handled / Math.max(1, progress.total) * 100) : 0;
  return <div className="gx-bulk" role="region" aria-label="Cambio en bloque" data-state={progress ? 'running' : picked.length ? 'ready' : 'done'}>
    {progress ? <div className="gx-bulk-run" role="status">
      <Layers size={16} aria-hidden="true" />
      <span>{(progress.undo ? 'Deshaciendo ' : 'Guardando ') + Math.min(progress.handled + 1, progress.total) + ' de ' + progress.total + '…'}</span>
      <span className="gx-bulk-meter" aria-hidden="true"><i style={{ width: share + '%' }} /></span>
      <button type="button" className="button secondary" onClick={() => control.current?.abort()}>Detener</button>
    </div>
    : picked.length ? <form className="gx-bulk-form" onSubmit={event => { event.preventDefault(); void apply(); }}>
      <strong className="gx-bulk-count"><Layers size={16} aria-hidden="true" />{picked.length} {picked.length === 1 ? 'marcado' : 'marcados'}</strong>
      <label className="gx-bulk-field"><span>Cambiar</span><select value={field.key} onChange={event => { setKey(event.target.value); setValue(null); }}>{fields.map(item => <option key={item.key} value={item.key}>{item.label}</option>)}</select></label>
      <label className="gx-bulk-field"><span>a</span>{field.type === 'enum'
        ? <select value={value ?? NOT_CHOSEN} onChange={event => setValue(event.target.value)}><option value={NOT_CHOSEN} disabled>Elige un valor…</option>{field.required ? null : <option value="">— Vacío</option>}{field.options.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}</select>
        : <input type="date" value={value ?? ''} onChange={event => setValue(event.target.value || null)} />}</label>
      <button type="submit" className="button primary" disabled={!ready}>{'Aplicar a ' + picked.length}</button>
      <button type="button" className="text-button" onClick={() => keep([])}>Quitar selección</button>
      {picked.length > MAX_BULK ? <small className="gx-bulk-hint">Como mucho {MAX_BULK} a la vez.</small> : null}
    </form> : null}
    {note && !progress ? <p className="gx-bulk-note" data-tone={note.tone} role={note.tone === 'error' ? 'alert' : 'status'}>{note.text}
      {note.result ? <button type="button" className="gx-move-undo" disabled={reloading} title={reloading ? 'Esperando a que la lista se ponga al día' : 'Vuelve a dejar el valor anterior en los registros que cambiaron'} onClick={() => void undo(note.result!)}><Undo2 size={13} aria-hidden="true" />Deshacer el lote</button> : null}
      <button type="button" className="icon-button" aria-label="Cerrar aviso" onClick={() => setNote(null)}><X size={14} /></button></p> : null}
  </div>;
}
