import React from 'react';
import { createRoot } from 'react-dom/client';
import VerificaReportPage from './VerificaReport.js';
import './verifica.css';

// Mismo tema que la App (clave planb:theme), sin importar su módulo: así la App no gana un trozo compartido al arrancar.
try { if (localStorage.getItem('planb:theme') === 'dark') document.documentElement.dataset.theme = 'dark'; } catch { /* sin almacenamiento: tema claro */ }
createRoot(document.getElementById('root')!).render(<React.StrictMode><VerificaReportPage /></React.StrictMode>);
