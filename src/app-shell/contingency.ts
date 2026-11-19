import type { TaskBucket } from '../task-display.js';

/** R1 · «Modo contingencia»: lo activa la persona cuando HubSpot no responde (Plan B nunca lo detecta consultando HubSpot).
 *  En este navegador solo se guarda la hora de inicio y los pasos marcados de la lista; nada de clientes ni de registros. */
export const CONTINGENCY_KEY = 'planb:contingency';
export const LAST_INCIDENT_KEY = 'planb:contingency:last';
export type ContingencyStepId = 'copy' | 'team' | 'queue';
const STEP_IDS: readonly ContingencyStepId[] = ['copy', 'team', 'queue'];
export interface Contingency { startedAt: string; steps: ContingencyStepId[] }
export interface IncidentWindow { startedAt: string; endedAt: string }
/** Tareas que Hoy muestra mientras dura la contingencia: lo que no puede esperar. */
export const CONTINGENCY_BUCKETS: readonly TaskBucket[] = ['overdue', 'due-in-window'];
export const inContingencyScope = (bucket: TaskBucket) => CONTINGENCY_BUCKETS.includes(bucket);

type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
const browserStore = (): Store | null => { try { return typeof localStorage === 'undefined' ? null : localStorage; } catch { return null; } };
const validTime = (value: unknown): value is string => typeof value === 'string' && value.length <= 40 && !Number.isNaN(Date.parse(value));

function parse(raw: string | null): Contingency | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as { startedAt?: unknown; steps?: unknown };
    if (!value || !validTime(value.startedAt)) return null;
    const steps = Array.isArray(value.steps) ? STEP_IDS.filter(id => (value.steps as unknown[]).includes(id)) : [];
    return { startedAt: new Date(value.startedAt).toISOString(), steps };
  } catch { return null; }
}
function parseWindow(raw: string | null): IncidentWindow | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as { startedAt?: unknown; endedAt?: unknown };
    if (!value || !validTime(value.startedAt) || !validTime(value.endedAt) || Date.parse(value.endedAt) < Date.parse(value.startedAt)) return null;
    return { startedAt: new Date(value.startedAt).toISOString(), endedAt: new Date(value.endedAt).toISOString() };
  } catch { return null; }
}

const listeners = new Set<() => void>();
const notify = () => { for (const listener of [...listeners]) listener(); };
function write(store: Store | null, key: string, value: unknown) {
  if (!store) return;
  try { if (value === null) store.removeItem(key); else store.setItem(key, JSON.stringify(value)); } catch { /* almacenamiento lleno o bloqueado: el modo sigue en memoria hasta recargar */ }
}

export function readContingency(store: Store | null = browserStore()): Contingency | null {
  try { return parse(store?.getItem(CONTINGENCY_KEY) ?? null); } catch { return null; }
}
export function readLastIncident(store: Store | null = browserStore()): IncidentWindow | null {
  try { return parseWindow(store?.getItem(LAST_INCIDENT_KEY) ?? null); } catch { return null; }
}
/** Empieza la contingencia; si ya estaba activa, conserva la hora original. */
export function startContingency(now: Date, store: Store | null = browserStore()): Contingency {
  const current = readContingency(store);
  if (current) return current;
  const next: Contingency = { startedAt: now.toISOString(), steps: [] };
  write(store, CONTINGENCY_KEY, next); notify();
  return next;
}
export function markStep(id: ContingencyStepId, store: Store | null = browserStore()): Contingency | null {
  const current = readContingency(store);
  if (!current || current.steps.includes(id)) return current;
  const next = { ...current, steps: STEP_IDS.filter(step => step === id || current.steps.includes(step)) };
  write(store, CONTINGENCY_KEY, next); notify();
  return next;
}
/** Termina la contingencia y guarda solo el intervalo, para poder generar después el expediente del incidente. */
export function endContingency(now: Date, store: Store | null = browserStore()): IncidentWindow | null {
  const current = readContingency(store);
  if (!current) return null;
  const ended = Math.max(now.getTime(), Date.parse(current.startedAt));
  const window: IncidentWindow = { startedAt: current.startedAt, endedAt: new Date(ended).toISOString() };
  write(store, CONTINGENCY_KEY, null); write(store, LAST_INCIDENT_KEY, window); notify();
  return window;
}
export function forgetLastIncident(store: Store | null = browserStore()) { write(store, LAST_INCIDENT_KEY, null); notify(); }

// Instantánea estable para useSyncExternalStore: el mismo objeto mientras el texto guardado no cambie.
let cachedRaw: string | null | undefined, cachedValue: Contingency | null = null;
export function contingencySnapshot(): Contingency | null {
  let raw: string | null = null;
  try { raw = browserStore()?.getItem(CONTINGENCY_KEY) ?? null; } catch { raw = null; }
  if (raw !== cachedRaw) { cachedRaw = raw; cachedValue = parse(raw); }
  return cachedValue;
}
let cachedLastRaw: string | null | undefined, cachedLast: IncidentWindow | null = null;
export function lastIncidentSnapshot(): IncidentWindow | null {
  let raw: string | null = null;
  try { raw = browserStore()?.getItem(LAST_INCIDENT_KEY) ?? null; } catch { raw = null; }
  if (raw !== cachedLastRaw) { cachedLastRaw = raw; cachedLast = parseWindow(raw); }
  return cachedLast;
}
/** También escucha otras pestañas: activar la contingencia en una la muestra en todas. */
export function subscribeContingency(listener: () => void): () => void {
  listeners.add(listener);
  const storage = (event: StorageEvent) => { if (event.key === null || event.key === CONTINGENCY_KEY || event.key === LAST_INCIDENT_KEY) listener(); };
  if (typeof window !== 'undefined') window.addEventListener('storage', storage);
  return () => { listeners.delete(listener); if (typeof window !== 'undefined') window.removeEventListener('storage', storage); };
}
export const validIncidentTime = validTime;
