import { validIncidentTime, type ContingencyStepId } from './contingency.js';

/** R1 · Textos y reloj del modo contingencia. Separado del núcleo (contingency.ts) porque solo lo usan piezas que se cargan al mostrarse. */
export interface ContingencyStep { id: ContingencyStepId; label: string; detail: string }
export const FIRST_STEPS: readonly ContingencyStep[] = [
  { id: 'copy', label: 'Mirar la antigüedad de la copia', detail: 'Saber desde qué hora trabajas con datos guardados.' },
  { id: 'team', label: 'Avisar al equipo', detail: 'Copia un mensaje listo para pegar en el chat del equipo.' },
  { id: 'queue', label: 'Abrir la cola de Hoy', detail: 'Solo lo vencido y lo que vence en 24 horas.' },
];
const clock = new Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit' });
export const clockTime = (value: string | number | Date) => clock.format(new Date(value));
/** Tiempo transcurrido como «hh:mm» (las horas pueden pasar de 99 si nadie la cierra). */
export function elapsedLabel(startedAt: string, now: Date): string {
  const minutes = Math.max(0, Math.floor((now.getTime() - Date.parse(startedAt)) / 60_000));
  return String(Math.floor(minutes / 60)).padStart(2, '0') + ':' + String(minutes % 60).padStart(2, '0');
}
export function durationText(startedAt: string, endedAt: string): string {
  const minutes = Math.max(0, Math.round((Date.parse(endedAt) - Date.parse(startedAt)) / 60_000));
  if (minutes < 1) return 'menos de 1 min';
  const hours = Math.floor(minutes / 60), rest = minutes % 60;
  return hours ? hours + ' h' + (rest ? ' ' + rest + ' min' : '') : rest + ' min';
}
/** Mensaje para el equipo: horas y nada más. La copia se describe por su hora, sin datos de clientes. */
export function teamMessage(startedAt: string, copyAt?: string | null): string {
  const copy = validIncidentTime(copyAt) ? ' La copia que usamos es de las ' + clockTime(copyAt) + '.' : '';
  return 'HubSpot no responde desde las ' + clockTime(startedAt) + '. Seguimos trabajando con Plan B: primero lo vencido y lo que vence hoy.' + copy + ' Aviso cuando vuelva.';
}
