import { useState } from 'react';
import { CommitmentRadarEntry } from './CommitmentRadarEntry.js';
import { OperationalRehearsal } from './OperationalRehearsal.js';

// Anfitrión de la vista «Radar» en la App (unidad CLAUDE-FABLE-OPERATIONAL-HOST-MOUNT). Muestra el Radar de compromisos y, cuando la persona pulsa
// «Ensayar mi semana» en la ficha de un compromiso, la pantalla de ensayo de ese compromiso. No guarda estado propio fuera de qué se está viendo.
export function RadarHost({ contextRevision, refresh }: { contextRevision: string | null; refresh: () => void }) {
  const [rehearse, setRehearse] = useState<string | null>(null), [radarKey, setRadarKey] = useState(0);
  return rehearse
    ? <OperationalRehearsal contextRevision={contextRevision} commitmentId={rehearse} onContextStale={refresh} onDecision={() => setRadarKey(value => value + 1)} onClose={() => setRehearse(null)} />
    : <CommitmentRadarEntry key={radarKey} contextRevision={contextRevision} onContextStale={refresh} onRehearse={setRehearse} />;
}
