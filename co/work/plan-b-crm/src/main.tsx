import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.js';
import './styles.css';
import './refinements.css';
import './sales.css';
import './team.css';
import './integrations.css';
import './design-system.css';
import './planb-ui.css';
import './operaciones-claras.css';
import './faro.css';
import { applyTheme, storedTheme } from './app-shell/theme.js';
// El tema se aplica antes de pintar, para no ver un destello del tema contrario.
applyTheme(storedTheme());
const TeamApp=React.lazy(()=>import('./TeamApp.js'));
createRoot(document.getElementById('root')!).render(<React.StrictMode>{location.pathname.startsWith('/team')?<React.Suspense fallback={<main className="loading-page">Abriendo el equipo…</main>}><TeamApp/></React.Suspense>:<App />}</React.StrictMode>);
