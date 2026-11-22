// PÁGINA DE ARNÉS de «Revisar una decisión» (unidad CLAUDE-OPUS-DATE-CHECK-REVIEW). No es la App: anfitrión mínimo que lee el pin y muestra la pantalla.
import '../../shared/model.js';
import React from 'react';
import { createRoot } from 'react-dom/client';
import '../../src/styles.css';
import '../../src/design-system.css';
import '../../src/planb-ui.css';
import { DecisionReview } from '../../src/DecisionReview.js';

function Host() {
  const [pin, setPin] = React.useState<string | null | undefined>(undefined);
  async function refresh() { const state = await (await fetch('/api/v2/state')).json(); setPin(state.workspaceSearchContext?.contextRevision ?? null); }
  React.useEffect(() => { void refresh(); }, []);
  if (pin === undefined) return <p>Cargando…</p>;
  return <main id="main-content" style={{ padding: 16 }}><DecisionReview contextRevision={pin} onContextStale={() => void refresh()} /></main>;
}
createRoot(document.getElementById('root')!).render(<Host />);
