// Plan B Verifica · direcciones propias (plan de diseño «una sola app», corte 2, 24/11/2026). Cada paso y cada encargo tienen
// su dirección, así que «Atrás», recargar y enlazar un encargo funcionan. Puro: no toca window; lo usa VerificaReport.tsx.
//   /verifica                                    → Operación (los encargos)
//   /verifica/encargos/:id[/fuentes]             → Fuentes del encargo
//   /verifica/encargos/:id/capturas|informe|vigilancia|despues
//   /verifica/capturas|informe|vigilancia|despues → el paso sin encargo elegido
import type { DocKind } from '../Masthead.js';

export const VERIFICA_BASE = '/verifica';
export interface VerificaPlace { doc: DocKind; engagementId: string | null }

const SLUG: Record<Exclude<DocKind, 'operation'>, string> = {
  sources: 'fuentes', captures: 'capturas', report: 'informe', watch: 'vigilancia', migration: 'despues',
};
const BY_SLUG = new Map(Object.entries(SLUG).map(([doc, slug]) => [slug, doc as DocKind]));
const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Nombre de cada paso para el título de la pestaña. */
export const STEP_TITLE: Record<DocKind, string> = {
  operation: 'Encargos', sources: 'Fuentes', captures: 'Capturas', report: 'Hallazgos e informe', watch: 'Vigilancia', migration: 'Después del cierre',
};

export const isVerificaPath = (pathname: string) => pathname === VERIFICA_BASE || pathname.startsWith(VERIFICA_BASE + '/');

/** El sitio que dice una dirección, o null si no es una dirección de Verifica válida. */
export function placeOf(pathname: string): VerificaPlace | null {
  if (!isVerificaPath(pathname)) return null;
  let parts: string[];
  try { parts = pathname.slice(VERIFICA_BASE.length).split('/').filter(Boolean).map(decodeURIComponent); }
  catch { return null; }
  let engagementId: string | null = null;
  if (parts[0] === 'encargos') {
    if (!parts[1] || !ID.test(parts[1])) return null;
    engagementId = parts[1].toLowerCase();
    parts = parts.slice(2);
  }
  if (parts.length === 0) return { doc: engagementId ? 'sources' : 'operation', engagementId };
  if (parts.length > 1) return null;
  const doc = BY_SLUG.get(parts[0]);
  return doc ? { doc, engagementId } : null;
}

/** La dirección de un sitio. */
export function pathOf(place: VerificaPlace): string {
  if (place.doc === 'operation') return VERIFICA_BASE;
  const slug = SLUG[place.doc];
  return place.engagementId ? `${VERIFICA_BASE}/encargos/${encodeURIComponent(place.engagementId)}/${slug}` : `${VERIFICA_BASE}/${slug}`;
}
