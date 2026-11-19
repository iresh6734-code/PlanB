/**
 * N2 · Marca propia en los documentos que salen de Plan B (parte, informe del mes, expediente y pasaporte). El nombre y
 * el logotipo los pone la persona en este navegador; aquí solo se limpian, se validan y se convierten en HTML escapado.
 * El logotipo solo se acepta como data URL PNG, JPEG o WebP (nunca SVG, que puede llevar código) y de 200 KB como mucho.
 */
export interface ReportBrand { name: string; logo: string }

export const BRAND_NAME_MAX = 60;
export const BRAND_LOGO_MAX_BYTES = 200 * 1024;
export const BRAND_LOGO_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;

// Primeros caracteres en base64 de cada formato: evita que un fichero con otra cosa dentro pase por imagen.
const MAGIC: Record<(typeof BRAND_LOGO_TYPES)[number], string> = { 'image/png': 'iVBORw0KGgo', 'image/jpeg': '/9j/', 'image/webp': 'UklGR' };
const DATA_URL = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+={0,2})$/;

/** Sin saltos ni caracteres de control, espacios seguidos reducidos y como mucho 60 caracteres. */
export function cleanBrandName(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  const flat = raw.replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2066-\u2069]/g, ' ').replace(/\s+/g, ' ').trim();
  return Array.from(flat).slice(0, BRAND_NAME_MAX).join('').trim();
}

/** Bytes reales de un base64 sin decodificarlo. */
const decodedBytes = (base64: string) => Math.floor(base64.length * 3 / 4) - (base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0);

/** Motivo por el que un logotipo no vale, o `null` si se puede usar. */
export function logoProblem(dataUrl: unknown): string | null {
  if (typeof dataUrl !== 'string' || !dataUrl) return 'No se ha elegido ninguna imagen.';
  const match = DATA_URL.exec(dataUrl);
  if (!match) return 'El logotipo tiene que ser una imagen PNG, JPEG o WebP.';
  const [, type, payload] = match as unknown as [string, (typeof BRAND_LOGO_TYPES)[number], string];
  if (decodedBytes(payload) > BRAND_LOGO_MAX_BYTES) return 'El logotipo ocupa más de 200 KB. Usa una versión más ligera.';
  if (!payload.startsWith(MAGIC[type])) return 'El fichero no es la imagen que dice ser.';
  return null;
}

/** Lee lo guardado: cualquier valor raro se descarta en vez de llegar a un documento. */
export function parseBrand(value: unknown): ReportBrand | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  const name = cleanBrandName(record.name), logo = logoProblem(record.logo) ? '' : String(record.logo);
  return name || logo ? { name, logo } : null;
}

const escape = (value: string) => value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!);

/** Reglas para la cabecera de marca; heredan el color de cada documento para no romper su paleta. */
export const BRAND_CSS = '.pb-brand{display:flex;align-items:center;gap:12px;margin:0 0 18px;font-size:13px;font-weight:600;letter-spacing:.04em;text-transform:uppercase}'
  + '.pb-brand img{display:block;max-width:160px;max-height:44px;width:auto;height:auto;object-fit:contain}';

/** Cabecera con logotipo y nombre; cadena vacía sin marca, para que el documento salga como siempre. */
export function brandHtml(brand: ReportBrand | null | undefined): string {
  const clean = parseBrand(brand);
  if (!clean) return '';
  const label = clean.name ? escape(clean.name) : '';
  return '<div class="pb-brand">' + (clean.logo ? '<img src="' + clean.logo + '" alt="' + (label ? 'Logotipo de ' + label : 'Logotipo') + '">' : '') + (label ? '<span>' + label + '</span>' : '') + '</div>';
}

/** Lo que necesita la política de contenidos de un documento con CSP para mostrar el logotipo embebido. */
export const brandCsp = (brand: ReportBrand | null | undefined) => parseBrand(brand)?.logo ? "; img-src data:" : '';
