import { useEffect, useState } from 'react';

/** Tema de la interfaz: claro (por defecto) u oscuro. Se recuerda en este navegador; nunca afecta a los datos.
 *  Varios interruptores (barra superior, barra lateral, paleta) comparten el mismo estado. */
export type Theme = 'light' | 'dark';
const KEY = 'planb:theme';
const listeners = new Set<(theme: Theme) => void>();
export function storedTheme(): Theme { try { return localStorage.getItem(KEY) === 'dark' ? 'dark' : 'light'; } catch { return 'light'; } }
export function applyTheme(theme: Theme) {
  if (typeof document === 'undefined') return;
  if (theme === 'dark') document.documentElement.dataset.theme = 'dark'; else delete document.documentElement.dataset.theme;
  document.documentElement.style.colorScheme = theme;
}
export function setTheme(theme: Theme) {
  applyTheme(theme);
  try { localStorage.setItem(KEY, theme); } catch { /* sin almacenamiento: dura esta visita */ }
  for (const listener of listeners) listener(theme);
}
export const toggleTheme = () => setTheme(storedThemeNow() === 'dark' ? 'light' : 'dark');
const storedThemeNow = (): Theme => typeof document !== 'undefined' && document.documentElement?.dataset?.theme === 'dark' ? 'dark' : 'light';
export function useTheme(): [Theme, () => void] {
  const [theme, setLocal] = useState<Theme>(() => typeof document !== 'undefined' ? storedThemeNow() : storedTheme());
  useEffect(() => { listeners.add(setLocal); return () => { listeners.delete(setLocal); }; }, []);
  return [theme, toggleTheme];
}

/** K4 · Densidad: «compacta» (filas de 32 px, por defecto) o «cómoda» (40 px). Solo cambia tokens con html[data-density];
 *  en móvil se mantienen los objetivos táctiles de 44 px. Se recuerda en este navegador, como el tema. */
export type Density = 'compact' | 'comfortable';
export const DENSITY_KEY = 'planb:density';
export const DENSITY_LABEL: Record<Density, string> = { compact: 'Compacta', comfortable: 'Cómoda' };
export function storedDensity(): Density { try { return localStorage.getItem(DENSITY_KEY) === 'comfortable' ? 'comfortable' : 'compact'; } catch { return 'compact'; } }
export function applyDensity(density: Density) {
  if (typeof document === 'undefined') return;
  if (density === 'comfortable') document.documentElement.dataset.density = 'comfortable'; else delete document.documentElement.dataset.density;
}
export const currentDensity = (): Density => typeof document !== 'undefined' && document.documentElement?.dataset?.density === 'comfortable' ? 'comfortable' : 'compact';
export function setDensity(density: Density) {
  applyDensity(density);
  try { if (density === 'comfortable') localStorage.setItem(DENSITY_KEY, density); else localStorage.removeItem(DENSITY_KEY); } catch { /* sin almacenamiento: dura esta visita */ }
}
export const toggleDensity = () => setDensity(currentDensity() === 'comfortable' ? 'compact' : 'comfortable');
