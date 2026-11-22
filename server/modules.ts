// Registro de los módulos que montan la App completa (server/main.ts) y la portátil (server/runtime.ts) por igual
// (mejora B4 del informe; CLAUDE-SERVER-MODULES, 17/11/2026). Añadir un apartado compartido es añadir una fila aquí,
// sin tocar los dos puntos de entrada.
//
// Solo módulos COMPARTIDOS: este archivo lo importa runtime.ts y todo lo que importe acaba en el paquete portátil, que a
// propósito no lleva generador, proveedores de IA, conectores CRM, inspección de copia, relevo ni copia de equipo. Esos
// siguen montándose solo en main.ts. Tampoco está registerTaskIntents: su prueba de puntos de entrada (unidad 318)
// instrumenta esa llamada literal en main.ts y runtime.ts.
import type { FastifyInstance } from 'fastify';
import type { Store } from './store.js';
import { registerContinuityEvidenceApi } from './continuity-evidence-api.js';
import { registerWorkSummaryApi } from './work-summary-api.js';

export type SharedModule = { id: string; why: string; mount: (app: FastifyInstance, store: Store) => void };

export const SHARED_MODULES: readonly SharedModule[] = [
  { id: 'continuity-evidence', why: 'Evidencia de continuidad local', mount: registerContinuityEvidenceApi },
  // El resumen de trabajo sigue sin acreditar hasta que la copia activa tenga cobertura A4 verificada.
  { id: 'work-summary', why: 'Resumen de trabajo (sin acreditar)', mount: (app, store) => registerWorkSummaryApi(app, store, { covers: () => false }) },
];

/** Monta todos los módulos compartidos, en orden. */
export function mountSharedModules(app: FastifyInstance, store: Store) {
  for (const module of SHARED_MODULES) module.mount(app, store);
}
