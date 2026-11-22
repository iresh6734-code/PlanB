// PÁGINA DE ARNÉS de «Comprobar una fecha» (unidad CLAUDE-OPUS-DATE-CHECK-FLOW). No es la App: es el anfitrión mínimo para probar en un navegador real el componente
// que se montará. Hace lo que hará el anfitrión de verdad: leer el pin de la copia en /api/v2/state y mostrar la pantalla. El montaje real está en el guion de entrega.
import '../../shared/model.js';
import React from 'react';
import { createRoot } from 'react-dom/client';
import '../../src/styles.css';
import '../../src/design-system.css';
import '../../src/planb-ui.css';
import { DateCheck } from '../../src/DateCheck.js';

function Host() {
  const [pin, setPin] = React.useState<string | null | undefined>(undefined);
  async function refresh() { const state = await (await fetch('/api/v2/state')).json(); setPin(state.workspaceSearchContext?.contextRevision ?? null); }
  React.useEffect(() => { void refresh(); }, []);
  if (pin === undefined) return <p>Cargando…</p>;
  return <main id="main-content" style={{ padding: 16 }}><DateCheck contextRevision={pin} onContextStale={() => void refresh()} /></main>;
}
createRoot(document.getElementById('root')!).render(<Host />);
