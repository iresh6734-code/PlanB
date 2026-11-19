import { useSyncExternalStore } from 'react';
import { contingencySnapshot, lastIncidentSnapshot, subscribeContingency, type Contingency, type IncidentWindow } from './contingency.js';

/** Estado del modo contingencia compartido por la barra superior, Hoy, Cambios y Continuidad (y por otras pestañas). */
export const useContingency = (): Contingency | null => useSyncExternalStore(subscribeContingency, contingencySnapshot, () => null);
export const useLastIncident = (): IncidentWindow | null => useSyncExternalStore(subscribeContingency, lastIncidentSnapshot, () => null);
