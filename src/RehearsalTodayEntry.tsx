import { useEffect, useRef, useState } from 'react';
import type { RehearsalOverview } from '../shared/operational-rehearsal-api.js';
import { REHEARSAL_RADAR_COMMITMENT } from '../shared/operational-rehearsal-demo.js';
import { loadRehearsalOverview } from './operational-rehearsal-client.js';
import './operational-rehearsal.css';

// ENTRADA DESDE HOY a «Ensayar mi semana» (unidad CLAUDE-FABLE-OPERATIONAL-TODAY-ENTRY). Una sola línea de aviso encima de Hoy: si el compromiso con semana de ensayo
// no llega con el plan actual, lo dice y ofrece ensayar; si el Radar aún no tiene su escenario, ofrece abrirlo. Solo LEE (un GET que no escribe); no ensaya nada por su cuenta.
// Si no hay copia de ensayo, la sesión está bloqueada o la lectura falla, no muestra nada: Hoy sigue funcionando igual sin esta entrada.

const SHORT: Record<string, string> = {
  'on-time': 'llega a tiempo con el plan de hoy', late: 'no llega a tiempo con el plan de hoy', 'not-completed': 'no se termina con el plan de hoy', indeterminate: 'no se puede saber si llega: faltan datos',
};

export function RehearsalTodayEntry({ contextRevision, onOpen, onOpenRadar }: { contextRevision: string | null; onOpen: (commitmentId: string) => void; onOpenRadar: () => void }) {
  const [overview, setOverview] = useState<RehearsalOverview | null>(null), sequence = useRef(0);
  useEffect(() => {
    const turn = ++sequence.current, controller = new AbortController();
    setOverview(null);
    if (contextRevision) loadRehearsalOverview(contextRevision, REHEARSAL_RADAR_COMMITMENT, controller.signal).then(next => { if (turn === sequence.current) setOverview(next); }).catch(() => undefined);
    const locked = () => { sequence.current += 1; setOverview(null); };
    window.addEventListener('planb:locked', locked);
    return () => { controller.abort(); window.removeEventListener('planb:locked', locked); };
  }, [contextRevision]);
  if (!overview || overview.status === 'commitment-not-linked') return null;
  if (overview.status === 'radar-not-ready') {
    return (
      <aside className="or-today" aria-label="Ensayar mi semana">
        <p><span className="or-chip">Ensayo · ficción</span> Activa el Radar de compromisos para ver qué promesas de esta semana no caben y ensayar respuestas.</p>
        <button type="button" className="button secondary" onClick={onOpenRadar}>Abrir el Radar</button>
      </aside>
    );
  }
  if (!overview.focus || !overview.diagnosis || overview.focus.closed) return null;
  const due = new Date(overview.focus.dueAt).toLocaleString('es-ES', { weekday: 'long', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: overview.week?.timeZone ?? 'Europe/Madrid' });
  return (
    <aside className="or-today" aria-label="Ensayar mi semana" data-projection={overview.diagnosis.projection}>
      <p><span className="or-chip">Ensayo · ficción</span> <strong>{overview.focus.title}</strong>, comprometido para el {due}: {SHORT[overview.diagnosis.projection]}.</p>
      <button type="button" className="button secondary" onClick={() => onOpen(overview.focus!.commitmentId)}>Ensayar mi semana</button>
    </aside>
  );
}
