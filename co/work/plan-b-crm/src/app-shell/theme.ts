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
