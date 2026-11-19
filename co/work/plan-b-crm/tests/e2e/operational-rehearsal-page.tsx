// PÁGINA DE ARNÉS de «Ensayar mi semana» (unidad CLAUDE-FABLE-OPERATIONAL-MOUNT). No es la App: es el anfitrión mínimo para probar en un navegador real los
// componentes que se montarán. Hace lo que hará el anfitrión de verdad: leer el pin de la copia en /api/v2/state, mostrar el Radar y abrir el ensayo de un compromiso.
// El botón «Ensayar mi semana» de aquí sustituye a la acción secundaria que irá DENTRO de la ficha del Radar (archivo de Claude A; ver el guion de montaje).
import '../../shared/model.js';
import React from 'react';
import { createRoot } from 'react-dom/client';
import '../../src/styles.css';
import '../../src/refinements.css';
import '../../src/design-system.css';
import '../../src/planb-ui.css';
import { CommitmentRadarEntry } from '../../src/CommitmentRadarEntry.js';
import { OperationalRehearsal } from '../../src/OperationalRehearsal.js';

const COMMITMENT = 'ms-installation-hubspot';
function Host() {
  const [pin, setPin] = React.useState<string | null | undefined>(undefined), [open, setOpen] = React.useState(false), [radarKey, setRadarKey] = React.useState(0);
  async function refresh() { const state = await (await fetch('/api/v2/state')).json(); setPin(state.workspaceSearchContext?.contextRevision ?? null); }
  React.useEffect(() => { void refresh(); }, []);
  if (pin === undefined) return <p>Cargando…</p>;
  return (
    <main id="main-content" style={{ padding: 16 }}>
      {open
        ? <OperationalRehearsal contextRevision={pin} commitmentId={COMMITMENT} onContextStale={() => void refresh()} onDecision={() => setRadarKey(value => value + 1)} onClose={() => setOpen(false)} />
        : <>
          <CommitmentRadarEntry key={radarKey} contextRevision={pin} onContextStale={() => void refresh()} />
          <p style={{ maxWidth: 1140, margin: '16px auto' }}>
            <button type="button" className="button secondary" onClick={() => setOpen(true)}>Ensayar mi semana</button>{' '}
            <span className="muted">Instalación de 12 equipos en Almacén Norte</span>
          </p>
        </>}
    </main>
  );
}
createRoot(document.getElementById('root')!).render(<Host />);
