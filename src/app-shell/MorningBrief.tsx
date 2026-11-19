import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, Copy, Sunrise } from 'lucide-react';
import type { AppSpec, Change } from '../../shared/model.js';
import { SavedChangesSchema } from '../../shared/recovery-integrity.js';
import { api } from '../api.js';
import { madridDay } from '../task-display.js';
import { briefSeen, briefText, markBriefSeen, morningBrief, shouldShowBrief, type BriefTask } from './morning-brief.js';

const storage = () => { try { return window.localStorage; } catch { return null; } };
type Props = {
  tasks: readonly BriefTask[] | null; tasksNote?: string; capturedAt: string | null | undefined; stale: boolean;
  steps: readonly { title: string; detail: string }[]; spec?: AppSpec | null; title?: string; revision?: string;
  onOpenToday?: () => void; onOpenChanges?: () => void;
};

/** R6 · Parte de la mañana (Inicio). Abierto la primera vez del día; después queda plegado y se puede volver a abrir. */
export function MorningBrief({ tasks, tasksNote = 'No se pudieron leer las tareas.', capturedAt, stale, steps, spec, title = 'Plan B', revision = '', onOpenToday, onOpenChanges }: Props) {
  const today = madridDay(new Date());
  const [open, setOpen] = useState(() => shouldShowBrief(briefSeen(storage()), today));
  const [journal, setJournal] = useState<{ key: string; changes: Change[] | null } | null>(null);
  const [copied, setCopied] = useState(false);
  useEffect(() => { markBriefSeen(storage(), today); }, [today]);
  const key = revision + ':' + today;
  useEffect(() => {
    if (!open || journal?.key === key) return;
    const controller = new AbortController();
    api<{ changes?: unknown }>('/v2/changes', { signal: controller.signal })
      .then(value => { if (controller.signal.aborted) return; const saved = SavedChangesSchema.safeParse(value?.changes); setJournal({ key, changes: saved.success ? saved.data : null }); })
      .catch(() => { if (!controller.signal.aborted) setJournal({ key, changes: null }); });
    return () => controller.abort();
  }, [open, key]);
  const labels = useMemo(() => new Map((spec?.entities ?? []).map(entity => [entity.id as string, entity.label])), [spec]);
  const brief = morningBrief({ now: new Date(), tasks, changes: journal?.changes ?? null, entityLabel: entity => labels.get(entity) ?? entity, capturedAt, stale, steps });
  const copy = () => { void navigator.clipboard?.writeText(briefText(brief, title)).then(() => setCopied(true)).catch(() => setCopied(false)); };
  const reading = open && journal?.key !== key;

  return <details className="mb" data-tone={brief.tone} open={open} onToggle={event => setOpen((event.currentTarget as HTMLDetailsElement).open)}>
    <summary>
      <span className="mb-sun" aria-hidden="true"><Sunrise size={18} /></span>
      <span className="mb-sum"><span className="mb-kicker">Parte de la mañana · {brief.dateLabel}</span><strong>{brief.headline}</strong></span>
      <ChevronDown className="mb-chev" size={18} aria-hidden="true" />
    </summary>
    <div className="mb-body">
      <section className="mb-col" data-tone={brief.overdue?.count ? 'danger' : 'ok'} aria-labelledby="mb-late">
        <h3 id="mb-late">Vencido</h3>
        {!brief.overdue ? <p className="mb-muted" role="status">{tasksNote}</p>
          : !brief.overdue.count ? <p className="mb-big">Nada vencido</p>
          : <><p className="mb-big">{brief.overdue.count}<small>{brief.overdue.count === 1 ? ' tarea' : ' tareas'}</small></p>
            <ul>{brief.overdue.items.map((item, index) => <li key={index}><span>{item.label}</span><em>{item.late ? item.late + ' d' : 'hoy'}</em></li>)}</ul></>}
        {brief.soon ? <p className="mb-muted">{brief.soon} para las próximas 24 h.</p> : null}
        {onOpenToday ? <button type="button" className="oc-link" onClick={onOpenToday}>Abrir Hoy</button> : null}
      </section>
      <section className="mb-col" aria-labelledby="mb-changes">
        <h3 id="mb-changes">Desde ayer</h3>
        {reading ? <p className="mb-muted ui-loading ui-loading-sm" role="status">Leyendo el diario…</p>
          : !brief.changes ? <p className="mb-muted">El diario de cambios no se pudo leer.</p>
          : !brief.changes.count ? <p className="mb-big">Sin cambios</p>
          : <><p className="mb-big">{brief.changes.count}<small>{brief.changes.count === 1 ? ' cambio' : ' cambios'}</small></p>
            <p className="mb-muted">{brief.changes.created} {brief.changes.created === 1 ? 'alta' : 'altas'} · {brief.changes.updated} {brief.changes.updated === 1 ? 'edición' : 'ediciones'} · {brief.changes.records} {brief.changes.records === 1 ? 'registro' : 'registros'}</p>
            <ul className="mb-tags">{brief.changes.byEntity.map(item => <li key={item.entity}>{item.label} <b>{item.count}</b></li>)}</ul></>}
        {brief.changes?.count && onOpenChanges ? <button type="button" className="oc-link" onClick={onOpenChanges}>Revisar cambios</button> : null}
      </section>
      <section className="mb-col" data-tone={brief.copy.tone} aria-labelledby="mb-copy">
        <h3 id="mb-copy">Tu copia</h3>
        <p className="mb-big mb-copy">{brief.copy.label}</p>
        <p className="mb-muted">{brief.copy.detail}</p>
      </section>
      <section className="mb-col mb-steps" aria-labelledby="mb-steps">
        <h3 id="mb-steps">Primeros pasos</h3>
        {brief.steps.length ? <ol>{brief.steps.map((step, index) => <li key={index}><strong>{step.title}</strong><span>{step.detail}</span></li>)}</ol> : <p className="mb-big">Nada urgente</p>}
      </section>
    </div>
    <footer className="mb-foot">
      <p>Se abre solo la primera vez de cada día. En este navegador solo se guarda la fecha.</p>
      <button type="button" className="button secondary" onClick={copy}><Copy size={15} />{copied ? 'Copiado' : 'Copiar como texto'}</button>
    </footer>
  </details>;
}
