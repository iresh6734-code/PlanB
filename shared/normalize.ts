/** Normalizar datos al importar y al editar (super plan D1): teléfonos con prefijo, correos en minúscula, webs sin
 *  «http», espacios de más. Siempre es una PROPUESTA: quien importa o edita la ve y decide. Si un valor es ambiguo
 *  (extensiones, letras, longitudes raras) se deja como está en lugar de adivinar. */
export type NormalizeKind = 'email' | 'phone' | 'web' | 'text';
type FieldLike = { key: string; label: string; type: string; readOnly?: boolean };

export function normalizeKind(field: FieldLike): NormalizeKind | null {
  if (field.readOnly) return null;
  if (field.type === 'email') return 'email';
  if (field.type !== 'text') return null;
  const name = field.key + ' ' + field.label;
  if (/phone|tel[eé]fono|m[oó]vil|mobile|fax/i.test(name)) return 'phone';
  if (/domain|dominio|website|sitio|\bweb\b|\burl\b/i.test(name)) return 'web';
  if (/^e?mail$|correo/i.test(field.key) || /correo/i.test(field.label)) return 'email';
  return 'text';
}

export const normalizeText = (raw: string) => raw.replace(/[\u200B-\u200D\uFEFF]/g, '').replace(/[\s\u00A0]+/g, ' ').trim();

export const normalizeEmail = (raw: string) => normalizeText(raw).replace(/^mailto:/i, '').replace(/^<(.*)>$/, '$1').replace(/\s+/g, '').toLowerCase();

/** «600123123», «0034 600-123-123» o «+34600123123» → «+34 600 123 123». Otros países: «+» y los dígitos. */
export function normalizePhone(raw: string): string {
  const text = normalizeText(raw);
  if (!text || /[a-z]/i.test(text)) return text;
  let digits = text.replace(/[\s().\-/]/g, '');
  if (!/^\+?\d+$/.test(digits)) return text;
  if (digits.startsWith('00')) digits = '+' + digits.slice(2);
  if (!digits.startsWith('+') && digits.length === 9 && /^[6789]/.test(digits)) digits = '+34' + digits;
  if (/^\+34[6789]\d{8}$/.test(digits)) { const d = digits.slice(3); return '+34 ' + d.slice(0, 3) + ' ' + d.slice(3, 6) + ' ' + d.slice(6); }
  if (/^\+\d{8,15}$/.test(digits)) return digits;
  return text;
}

/** «HTTPS://www.Acme.es/» → «www.acme.es». Se conserva la ruta tal cual; solo el dominio pasa a minúsculas. */
export function normalizeWebsite(raw: string): string {
  const text = normalizeText(raw).replace(/\s+/g, '');
  const match = /^(?:[a-z][a-z0-9+.-]*:\/\/)?([^/?#]+)(.*)$/i.exec(text);
  if (!match) return text;
  const rest = match[2] === '/' ? '' : match[2];
  return match[1].toLowerCase().replace(/\.$/, '') + rest;
}

export function normalizeValue(kind: NormalizeKind, raw: string): string {
  switch (kind) {
    case 'email': return normalizeEmail(raw);
    case 'phone': return normalizePhone(raw);
    case 'web': return normalizeWebsite(raw);
    case 'text': return normalizeText(raw);
  }
}

export type Adjustment = { key: string; label: string; before: string; after: string };

/** Qué campos de texto de una ficha cambiarían al normalizarlos. Solo cadenas no vacías. */
export function proposeNormalization(fields: FieldLike[], values: Record<string, unknown>): Adjustment[] {
  const out: Adjustment[] = [];
  for (const field of fields) {
    const kind = normalizeKind(field), value = values[field.key];
    if (!kind || typeof value !== 'string' || !value.trim()) continue;
    const after = normalizeValue(kind, value);
    if (after && after !== value) out.push({ key: field.key, label: field.label, before: value, after });
  }
  return out;
}
