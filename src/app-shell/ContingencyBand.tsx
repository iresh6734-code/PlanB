import { useEffect, useState } from 'react';
import { ArrowRight, Check, Copy, FileDown, Siren, X } from 'lucide-react';
import { markStep, type Contingency, type ContingencyStepId, type IncidentWindow } from './contingency.js';
import { clockTime, durationText, elapsedLabel, FIRST_STEPS, teamMessage } from './contingency-text.js';
import { describeCapture } from './workspace-copy.js';

/** R1 · Banda del modo contingencia: reloj desde el inicio, los «primeros 15 minutos» y el cierre con su expediente (R2). */
export function ContingencyBand({ active, closed, copyAt, onOpenContinuity, onOpenToday, onEnd, onDismiss, onDownload }: {
  active: Contingency | null; closed: IncidentWindow | null; copyAt?: string | null;
  onOpenContinuity: () => void; onOpenToday?: () => void; onEnd: () => void; onDismiss: () => void;
  onDownload: (window: IncidentWindow, format: 'html' | 'json') => Promise<string>;
}) {
  const [now, setNow] = useState(() => new Date()), [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState<{ text: string; manual: boolean } | null>(null), [note, setNote] = useState(''), [busy, setBusy] = useState(false);
  useEffect(() => { if (!active) return; setNow(new Date()); const timer = setInterval(() => setNow(new Date()), 30_000); return () => clearInterval(timer); }, [active?.startedAt]);
  useEffect(() => { setConfirming(false); setMessage(null); }, [active?.startedAt]);
  if (active) {
    const copy = describeCapture(copyAt ?? undefined), done = active.steps.length;
    const step = (id: ContingencyStepId) => {
      markStep(id);
      if (id === 'copy') onOpenContinuity();
      else if (id === 'queue') onOpenToday?.();
      else {
        const text = teamMessage(active.startedAt, copyAt);
        void (navigator.clipboard?.writeText(text) ?? Promise.reject(new Error('sin portapapeles'))).then(() => setMessage({ text, manual: false }), () => setMessage({ text, manual: true }));
      }
    };
    const stepNote = (id: ContingencyStepId) => id === 'copy' ? (copy.age ? 'Copia activa ' + copy.age + (copy.stale ? ' · antigua' : '') : 'Sin fecha de copia') : FIRST_STEPS.find(item => item.id === id)!.detail;
    return <section className="cg-band" aria-labelledby="cg-title">
      <div className="cg-head">
        <span className="cg-icon" aria-hidden="true"><Siren size={18} /></span>
        <div className="cg-title"><h2 id="cg-title">Modo contingencia</h2><p>HubSpot no responde desde las {clockTime(active.startedAt)}. Trabajas con la copia de este equipo.</p></div>
        <span className="cg-clock" role="timer" aria-label={'Tiempo en contingencia: ' + elapsedLabel(active.startedAt, now)}>{elapsedLabel(active.startedAt, now)}</span>
      </div>
      <div className="cg-steps-wrap">
        <p className="cg-steps-title"><strong>Primeros 15 minutos</strong><span>{done} de {FIRST_STEPS.length}</span></p>
        <ol className="cg-steps">{FIRST_STEPS.filter(item => item.id !== 'queue' || onOpenToday).map((item, index) => {
          const isDone = active.steps.includes(item.id);
          return <li key={item.id} data-done={isDone ? 'true' : undefined}><button type="button" onClick={() => step(item.id)} aria-describedby={'cg-step-' + item.id}>
            <span className="cg-step-mark" aria-hidden="true">{isDone ? <Check size={13} /> : index + 1}</span>
            <span className="cg-step-text"><strong>{item.label}</strong><small id={'cg-step-' + item.id}>{stepNote(item.id)}</small></span>
            {item.id === 'team' ? <Copy size={14} aria-hidden="true" /> : <ArrowRight size={14} aria-hidden="true" />}
          </button></li>;
        })}</ol>
        {message ? <div className="cg-message" role="status">{message.manual ? <><span>No se pudo copiar solo. Selecciona el texto y cópialo:</span><textarea readOnly rows={2} value={message.text} onFocus={event => event.currentTarget.select()} /></> : <span><Check size={13} aria-hidden="true" /> Mensaje copiado. Pégalo en el chat del equipo.</span>}</div> : null}
      </div>
      <div className="cg-end">{confirming ? <>
        <span>¿HubSpot ya responde?</span>
        <button type="button" className="button primary" onClick={() => { setConfirming(false); onEnd(); }}>Sí, terminar</button>
        <button type="button" className="text-button" onClick={() => setConfirming(false)}>Seguir en contingencia</button>
      </> : <button type="button" className="button secondary cg-end-button" onClick={() => setConfirming(true)}>Terminar contingencia</button>}</div>
    </section>;
  }
  if (!closed) return null;
  const save = (format: 'html' | 'json') => { setBusy(true); setNote(''); void onDownload(closed, format).then(headline => setNote(headline), failure => setNote(failure instanceof Error ? failure.message : 'No se pudo generar el expediente.')).finally(() => setBusy(false)); };
  return <section className="cg-band" data-state="closed" aria-labelledby="cg-title">
    <div className="cg-head">
      <span className="cg-icon" aria-hidden="true"><Check size={18} /></span>
      <div className="cg-title"><h2 id="cg-title">Contingencia cerrada</h2><p>Duró {durationText(closed.startedAt, closed.endedAt)} ({clockTime(closed.startedAt)}–{clockTime(closed.endedAt)}). Guarda el expediente: qué se hizo, a qué hora y qué falta devolver.</p></div>
      <button type="button" className="icon-button cg-dismiss" aria-label="Cerrar el aviso de contingencia" onClick={onDismiss}><X size={16} /></button>
    </div>
    <div className="cg-end">
      <button type="button" className="button primary" disabled={busy} onClick={() => save('html')}><FileDown size={15} aria-hidden="true" />Expediente para imprimir</button>
      <button type="button" className="button secondary" disabled={busy} onClick={() => save('json')}>JSON con huella</button>
      {note ? <p className="cg-note" role="status">{note}</p> : null}
    </div>
  </section>;
}
