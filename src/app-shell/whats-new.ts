import type { PageId } from './session.js';

/**
 * Novedades dentro de la app (N5, super plan 2): una lista fija que viaja con cada versión. En el navegador solo se
 * guarda la última versión vista; el punto de la barra aparece cuando hay una versión más nueva que esa.
 */
export interface WhatsNewItem { title: string; text: string; page?: PageId }
export interface WhatsNewEntry { version: string; date: string; items: readonly WhatsNewItem[] }

export const WHATS_NEW_KEY = 'planb.whats-new.seen';

export const WHATS_NEW: readonly WhatsNewEntry[] = [
  {
    version: '0.6.0', date: '2026-11-19', items: [
      { title: 'Agenda', text: 'La semana o el mes con tareas y cierres previstos. Un cierre se mueve arrastrándolo.', page: 'agenda' },
      { title: 'Secuencias de seguimiento', text: 'En la ficha: «llamar hoy, correo a 3 días…» crea de una vez las tareas enlazadas.' },
      { title: 'Modo contingencia', text: '«HubSpot no responde» pone el reloj en marcha, centra Hoy en lo urgente y guarda el expediente.', page: 'continuity' },
      { title: '¿Cuánto costaría parar?', text: 'En «Si HubSpot cae ahora», con tus cifras y los cierres previstos de la copia.', page: 'continuity' },
      { title: 'Sello de continuidad', text: 'Sin sello, En preparación, Comprobado o Constante, con lo que falta para el siguiente nivel.', page: 'continuity' },
      { title: 'Pregunta a tu copia', text: 'En Ctrl J: «oportunidades que cierran este mes > 5000», sin IA y sin inventar lo que no entiende.' },
      { title: 'Objetivo del mes y analítica', text: 'En Inicio, el ritmo que hace falta para llegar al objetivo; en Oportunidades, tasa de cierre y ciclo medio.', page: 'home' },
      { title: 'Revisión de la semana', text: 'Lo ganado, lo que se movió y lo que se quedó parado, para copiar o imprimir.', page: 'week' },
    ],
  },
];

/** Compara versiones «1.2.3» por números; lo que no es número cuenta como 0. */
export function compareVersions(a: string, b: string): number {
  const parts = (value: string) => value.split('.').map(part => { const number = Number.parseInt(part, 10); return Number.isFinite(number) ? number : 0; });
  const left = parts(a), right = parts(b);
  for (let index = 0; index < Math.max(left.length, right.length); index++) {
    const diff = (left[index] ?? 0) - (right[index] ?? 0);
    if (diff) return Math.sign(diff);
  }
  return 0;
}

const isVersion = (value: unknown): value is string => typeof value === 'string' && /^\d+(\.\d+){0,3}$/.test(value);

/**
 * Entradas sin ver hasta la versión instalada, de la más nueva a la más vieja. Sin versión vista (primera vez o valor
 * ilegible) solo cuenta la más reciente, para no recibir a nadie con el historial entero.
 */
export function unseen(entries: readonly WhatsNewEntry[], seen: unknown, current: string): WhatsNewEntry[] {
  const shipped = entries.filter(entry => compareVersions(entry.version, current) <= 0).sort((a, b) => compareVersions(b.version, a.version));
  if (!isVersion(seen)) return shipped.slice(0, 1);
  return shipped.filter(entry => compareVersions(entry.version, seen) > 0);
}
