// CLAUDE-TEAM-AUDIT-R · Página de ensayo para medir la ventana «Nuevo espacio» (src/TeamSpaceCreate.tsx).
// En la App solo aparece en el piloto local autenticado, que no se arranca para auditar. Aquí se monta el MISMO componente,
// sin cambios, dentro del marco del espacio de equipo, con las mismas hojas de estilo y el mismo tema que src/main.tsx.
// La llamada es falsa y rechaza cualquier envío: la auditoría abre, mide y cierra sin pulsar «Crear».
import React from 'react';
import { createRoot } from 'react-dom/client';
import '../../src/styles.css';
import '../../src/sales.css';
import '../../src/team.css';
import '../../src/integrations.css';
import '../../src/design-system.css';
import '../../src/planb-ui.css';
import '../../src/operaciones-claras.css';
import '../../src/faro.css';
import { applyTheme, storedTheme } from '../../src/app-shell/theme.js';
import { TeamSpaceCreate } from '../../src/TeamSpaceCreate.js';

applyTheme(storedTheme());
const call = async () => { throw new Error('Ensayo de auditoría: no se envía nada.'); };

createRoot(document.getElementById('root')!).render(<React.StrictMode>
  <div className="app-shell team-shell">
    <main className="main-content">
      <section className="team-page">
        <header className="page-header"><div><h1>Ensayo de auditoría · Nuevo espacio</h1></div></header>
        <TeamSpaceCreate call={call as never} onCreated={async () => {}} />
      </section>
    </main>
  </div>
</React.StrictMode>);
