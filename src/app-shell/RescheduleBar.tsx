import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { ArrowRight, CalendarClock, Undo2, X } from 'lucide-react';
import type { AppState, CrmRecord } from '../../shared/model.js';
import { recordName } from '../components.js';
import { bulkSummary, undoItems, type BulkItem, type BulkResult } from './bulk-edit.js';
import { euros } from './deal-insights.js';
import { PACES, planReschedule } from './reschedule.js';

type Spec = NonNullable<AppState['spec']>;
type Props = {
  spec: Spec;
  closeKey: string; amountKey: string; today: string;
  /** Oportunidades de la vista «Cierre pasado» (abiertas y con el cierre ya pasado). */
  late: CrmRecord[];
  /** Solo se reparten las cargadas: se dice cuando el proceso tiene más. */
  partial: boolean;
  fresh: (id: string) => CrmRecord | undefined;
  reloading: boolean;
  saveMany: (items: BulkItem[], onProgress?: (handled: number, total: number) => void, signal?: AbortSignal) => Promise<BulkResult>;
};
type Note = { tone: 'ok' | 'error'; text: string; result?: BulkResult };
const SHOWN = 6;
const weekday = new Intl.DateTimeFormat('es-ES', { weekday: 'short', day: '2-digit', month: '2-digit', timeZone: 'UTC' });
const dayLabel = (day: string) => weekday.format(Date.parse(day + 'T12:00:00Z')).replace(',', '');
const shortDay = (value: string | null) => value && /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(8, 10) + '/' + value.slice(5, 7) : '—';

/** «Cierre pasado» deja de ser solo un aviso (Ronda D): reparte esas oportunidades en los próximos días laborables,
 *  con vista previa, progreso, detener y deshacer el lote. Todo queda en la copia local y anotado en Cambios. */
export function RescheduleBar({ spec, closeKey, amountKey, today, late, partial, fresh, reloading, saveMany }: Props) {
  const [pace, setPace] = useState<number>(2);
  const [open, setOpen] = useState(false);
  const [progress, setProgress] = useState<{ handled: number; total: number; undo: boolean } | null>(null);
  const [note, setNote] = useState<Note | null>(null);
  const control = useRef<AbortController | null>(null), listId = useId();
  useEffect(() => () => control.current?.abort(), []);
  const plan = useMemo(() => planReschedule(late, closeKey, today, { perDay: pace, amountKey }), [late, closeKey, today, pace, amountKey]);
  if (!plan.items.length && !progress && !note) return null;
  const name = (record: CrmRecord) => recordName(record, spec);
  const span = plan.first && plan.last ? (plan.first === plan.last ? 'el ' + dayLabel(plan.first) : dayLabel(plan.first) + ' → ' + dayLabel(plan.last)) : '';
  const run = async (items: BulkItem[], undo: boolean) => {
    const controller = new AbortController(); control.current = controller;
    setNote(null); setProgress({ handled: 0, total: items.length, undo });
    const result = await saveMany(items, (handled, total) => setProgress({ handled, total, undo }), controller.signal);
    control.current = null; setProgress(null);
    return result;
  };
  const apply = async () => {
    if (progress || !plan.items.length) return;
    const where = span;
    const result = await run(plan.items, false);
    setOpen(false);
    setNote({ tone: result.failed.length ? 'error' : 'ok', text: 'Cierres reprogramados (' + where + '): ' + bulkSummary(result, name) + ' Queda anotado en Cambios.', result: result.done.length ? result : undefined });
  };
  const undo = async (batch: BulkResult) => {
    if (progress) return;
    const back = undoItems(batch, fresh);
    const skipped = back.skipped ? ' ' + back.skipped + (back.skipped === 1 ? ' se dejó como estaba porque cambió después.' : ' se dejaron como estaban porque cambiaron después.') : '';
    if (!back.items.length) { setNote({ tone: 'error', text: 'No hay nada que deshacer.' + skipped }); return; }
    const result = await run(back.items, true);
    setNote({ tone: result.failed.length ? 'error' : 'ok', text: bulkSummary(result, name, true) + skipped + (result.done.length === 1 ? ' Vuelve' : ' Vuelven') + ' a «Cierre pasado».' });
  };
  const n = plan.items.length, share = progress ? Math.round(progress.handled / Math.max(1, progress.total) * 100) : 0;
  // Justo después de aplicar, el tablero aún trae las fechas viejas: el formulario espera a que se ponga al día.
  const settling = reloading && !!note?.result;
  return <div className="gx-bulk gx-resched" role="region" aria-label="Reprogramar cierres pasados" data-state={progress ? 'running' : n ? 'ready' : 'done'}>
    {progress ? <div className="gx-bulk-run" role="status">
      <CalendarClock size={16} aria-hidden="true" />
      <span>{(progress.undo ? 'Deshaciendo ' : 'Reprogramando ') + Math.min(progress.handled + 1, progress.total) + ' de ' + progress.total + '…'}</span>
      <span className="gx-bulk-meter" aria-hidden="true"><i style={{ width: share + '%' }} /></span>
      <button type="button" className="button secondary" onClick={() => control.current?.abort()}>Detener</button>
    </div>
    : n && !settling ? <form className="gx-bulk-form" onSubmit={event => { event.preventDefault(); if (!reloading) void apply(); }}>
      <strong className="gx-bulk-count"><CalendarClock size={16} aria-hidden="true" />{n} {n === 1 ? 'cierre pasado' : 'cierres pasados'}</strong>
      <label className="gx-bulk-field"><span>Repartir</span><select value={pace} onChange={event => setPace(Number(event.target.value))}>{PACES.map(value => <option key={value} value={value}>{value} al día</option>)}</select></label>
      <span className="gx-resched-span" title="Días laborables a partir de mañana; primero las de más importe">{span}</span>
      <button type="button" className="text-button" aria-expanded={open} aria-controls={open ? listId : undefined} onClick={() => setOpen(value => !value)}>{open ? 'Ocultar reparto' : 'Ver reparto'}</button>
      <button type="submit" className="button primary" disabled={reloading} title={reloading ? 'Esperando a que el tablero termine de cargar' : 'Cambia la fecha de cierre de estas oportunidades en tu copia local'}>{'Reprogramar ' + n}</button>
    </form> : null}
    {open && n > 0 && !progress && !settling ? <ol className="gx-resched-list" id={listId}>
      {plan.items.slice(0, SHOWN).map(item => <li key={item.record.id}><span>{name(item.record)}</span><small>{euros(item.record.values[amountKey])}</small><s title="Fecha de cierre que ya pasó">{shortDay(item.before)}</s><ArrowRight size={12} aria-hidden="true" /><b>{dayLabel(item.after!)}</b></li>)}
      {n > SHOWN || plan.skipped || partial ? <li className="gx-resched-more">{[n > SHOWN ? 'y ' + (n - SHOWN) + ' más' : '', plan.skipped ? plan.skipped + ' quedan para otra tanda' : '', partial ? 'solo las cargadas' : ''].filter(Boolean).join(' · ')}</li> : null}
    </ol> : null}
    {note && !progress ? <p className="gx-bulk-note" data-tone={note.tone} role={note.tone === 'error' ? 'alert' : 'status'}>{note.text}
      {note.result ? <button type="button" className="gx-move-undo" disabled={reloading} title={reloading ? 'Esperando a que el tablero se ponga al día' : 'Vuelve a dejar la fecha de cierre anterior'} onClick={() => void undo(note.result!)}><Undo2 size={13} aria-hidden="true" />Deshacer el lote</button> : null}
      <button type="button" className="icon-button" aria-label="Cerrar aviso" onClick={() => setNote(null)}><X size={14} /></button></p> : null}
  </div>;
}
