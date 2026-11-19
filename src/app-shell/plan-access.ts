import { useEffect, useSyncExternalStore } from 'react';
import { featureAccess, trialState, type FeatureAccess, type FeatureId, type PlanId, type TrialState } from '../../shared/plans.js';

/** N1 · Plan visible en la interfaz. Lee la licencia guardada (se comprueba sin conexión, cargando el verificador solo cuando hace falta)
 *  y la fecha de inicio de la prueba. Solo decide insignias y textos: ninguna función se desactiva por esto. */
export const LICENSE_KEY = 'planb.license';
export const TRIAL_KEY = 'planb.trial';

let licensed: PlanId = 'personal', checking: Promise<void> | null = null, version = 0;
const listeners = new Set<() => void>();
const emit = () => { version++; listeners.forEach(listener => listener()); };
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
const getVersion = () => version;

export function readTrialStart(): string | null { try { return localStorage.getItem(TRIAL_KEY); } catch { return null; } }
export const currentTrial = (now = new Date()): TrialState => trialState(readTrialStart(), now);
/** Empieza la prueba una sola vez por navegador. Devuelve false si ya se usó o no hay almacenamiento. */
export function startTrial(now = new Date()): boolean {
  if (currentTrial(now).status !== 'available') return false;
  try { localStorage.setItem(TRIAL_KEY, now.toISOString()); } catch { return false; }
  emit();
  return true;
}

function ensureLicense() {
  if (checking) return;
  let text = '';
  try { text = localStorage.getItem(LICENSE_KEY) ?? ''; } catch { /* sin almacenamiento: Personal */ }
  if (!text.trim()) { checking = Promise.resolve(); if (licensed !== 'personal') { licensed = 'personal'; emit(); } return; }
  checking = import('../../shared/license.js').then(module => module.checkLicense(text, new Date())).then(state => {
    const next: PlanId = state.status === 'active' || state.status === 'grace' ? state.plan : 'personal';
    if (next !== licensed) { licensed = next; emit(); }
  }).catch(() => undefined);
}
/** Tras activar o quitar una licencia en «Plan y licencia». */
export function refreshPlan() { checking = null; ensureLicense(); emit(); }

export function useFeatureAccess(feature: FeatureId): FeatureAccess {
  useSyncExternalStore(subscribe, getVersion, getVersion);
  useEffect(ensureLicense, []);
  return featureAccess(feature, licensed, currentTrial());
}
