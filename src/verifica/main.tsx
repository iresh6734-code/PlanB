import React from 'react';
import { createRoot } from 'react-dom/client';
import VerificaReportPage from './VerificaReport.js';
// Sistema de diseño común primero (tokens, base y componentes) y después lo propio de Verifica.
import '../design/tokens.css';
import '../design/base.css';
import '../design/components.css';
import './verifica.css';

// Mismo tema que la App (clave planb:theme), sin importar su módulo: así la App no gana un trozo compartido al arrancar.
try { if (localStorage.getItem('planb:theme') === 'dark') document.documentElement.dataset.theme = 'dark'; } catch { /* sin almacenamiento: tema claro */ }
createRoot(document.getElementById('root')!).render(<React.StrictMode><VerificaReportPage /></React.StrictMode>);
