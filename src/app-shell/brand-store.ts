import { parseBrand, type ReportBrand } from '../../shared/report-brand.js';

/** N2 · La marca de los documentos vive solo en este navegador; nunca viaja con la copia ni sale del equipo. */
export const BRAND_KEY = 'planb.report-brand.v1';

export function readBrand(): ReportBrand | null {
  try { const raw = localStorage.getItem(BRAND_KEY); return raw ? parseBrand(JSON.parse(raw)) : null; } catch { return null; }
}

/** Guarda la marca ya limpia (o la borra si queda vacía) y devuelve lo que se guardó. */
export function saveBrand(brand: ReportBrand | null): ReportBrand | null {
  const clean = parseBrand(brand);
  try {
    if (clean) localStorage.setItem(BRAND_KEY, JSON.stringify(clean)); else localStorage.removeItem(BRAND_KEY);
  } catch {
    throw new Error('Este navegador no deja guardar la marca. Prueba con un logotipo más ligero.');
  }
  return clean;
}
