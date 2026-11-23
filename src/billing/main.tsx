import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BillingCheck } from './BillingCheck.js';

const root = document.getElementById('root');
if (root) createRoot(root).render(<StrictMode><BillingCheck /></StrictMode>);
