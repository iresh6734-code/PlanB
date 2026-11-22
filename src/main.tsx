import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.js';
import './styles.css';
import './sales.css';
import './integrations.css';
import './design-system.css';
import './print.css';
import './planb-ui.css';
import './faro.css';
import './consola.css';
import { applyDensity, applyTheme, storedDensity, storedTheme } from './app-shell/theme.js';
// El tema se aplica antes de pintar, para no ver un destello del tema contrario.
applyTheme(storedTheme());
applyDensity(storedDensity());
// K5 · Cabecera de impresión: nombre de la copia y fecha (Madrid), leída en el momento de imprimir.
window.addEventListener('beforeprint', () => {
  const copy = document.querySelector('.sidebar-bottom > span')?.textContent?.trim() || 'Plan B';
  document.body.setAttribute('data-print-stamp', copy + ' · ' + new Date().toLocaleString('es-ES', { timeZone: 'Europe/Madrid', dateStyle: 'long', timeStyle: 'short' }));
});
createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);
