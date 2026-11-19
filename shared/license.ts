// Planes y licencia sin conexión (super plan M1). Lógica pura y compartida: sin red, sin DPAPI y sin servidor.
// Una licencia es texto «PLANB1.<carga>.<firma>» (base64url). La firma Ed25519 cubre «PLANB1.<carga>» y se comprueba con
// WebCrypto, disponible igual en el navegador y en Node. Sin licencia válida todo funciona en el plan Personal y nunca se
// bloquean los datos de la persona: el plan solo decide funciones de pago futuras.
import { z } from 'zod';
import { PLAN_LABEL, type PlanId } from './plans.js';
export { FEATURES, PLAN_LABEL, planAllows, type FeatureId, type PlanId } from './plans.js';

export const LICENSE_PREFIX = 'PLANB1';
/** Clave pública del emisor (32 bytes en base64url). Vacía hasta que se genere el par de claves de venta
 *  (`node scripts/license-tool.mjs keygen`); mientras tanto ninguna licencia puede verificarse y se usa Personal. */
export const LICENSE_PUBLIC_KEY = '';
/** Días que una licencia caducada sigue valiendo para renovar sin cortes. */
export const LICENSE_GRACE_DAYS = 14;

const iso = z.string().refine(value => !Number.isNaN(Date.parse(value)), 'fecha no válida');
export const LicensePayloadSchema = z.object({
  v: z.literal(1), id: z.string().min(4).max(64), plan: z.enum(['pro', 'team']),
  holder: z.string().trim().min(1).max(120), seats: z.number().int().min(1).max(500),
  issuedAt: iso, expiresAt: iso.nullable(),
}).strict();
export type LicensePayload = z.infer<typeof LicensePayloadSchema>;

export type LicenseStatus = 'none' | 'malformed' | 'unverifiable' | 'invalid' | 'expired' | 'grace' | 'active';
export interface LicenseState {
  status: LicenseStatus; plan: PlanId; payload: LicensePayload | null;
  /** Días hasta la caducidad (negativos si ya pasó); null si no caduca o no hay licencia. */ daysLeft: number | null;
  title: string; detail: string;
}

const DAY = 86_400_000;
const encoder = new TextEncoder();
export function toBase64Url(bytes: Uint8Array) {
  let binary = ''; for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export function fromBase64Url(text: string): Uint8Array<ArrayBuffer> | null {
  if (!/^[A-Za-z0-9_-]*$/.test(text)) return null;
  try { const binary = atob(text.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - text.length % 4) % 4)); return Uint8Array.from(binary, char => char.charCodeAt(0)); }
  catch { return null; }
}
const dayLabel = (value: string) => new Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Madrid', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(value));

/** Separa y valida la forma (sin comprobar la firma). Acepta espacios y saltos de línea alrededor o en medio, como al pegar desde un correo. */
export function parseLicense(text: string): { signed: Uint8Array<ArrayBuffer>; signature: Uint8Array<ArrayBuffer>; payload: LicensePayload } | null {
  const parts = text.replace(/\s+/g, '').split('.');
  if (parts.length !== 3 || parts[0] !== LICENSE_PREFIX) return null;
  const body = fromBase64Url(parts[1]), signature = fromBase64Url(parts[2]);
  if (!body || !signature || signature.length !== 64 || body.length > 4096) return null;
  try {
    const payload = LicensePayloadSchema.safeParse(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(body)));
    return payload.success ? { signed: encoder.encode(parts[0] + '.' + parts[1]), signature, payload: payload.data } : null;
  } catch { return null; }
}

async function importPublicKey(publicKey: string) {
  const raw = fromBase64Url(publicKey);
  if (!raw || raw.length !== 32) return null;
  try { return await globalThis.crypto.subtle.importKey('raw', raw, { name: 'Ed25519' }, false, ['verify']); } catch { return null; }
}

/** Estado de la licencia pegada. Nunca lanza: cualquier problema acaba en Personal con una explicación. */
export async function checkLicense(text: string | null | undefined, now: Date, publicKey: string = LICENSE_PUBLIC_KEY): Promise<LicenseState> {
  const personal = (status: LicenseStatus, title: string, detail: string, payload: LicensePayload | null = null): LicenseState => ({ status, plan: 'personal', payload, daysLeft: null, title, detail });
  if (!text?.trim()) return personal('none', 'Plan Personal', 'Sin licencia: todas las funciones básicas, sin límite de tiempo.');
  const parsed = parseLicense(text);
  if (!parsed) return personal('malformed', 'La licencia no tiene el formato esperado', 'Copia el texto completo, desde «' + LICENSE_PREFIX + '.» hasta el final.');
  const key = await importPublicKey(publicKey);
  if (!key) return personal('unverifiable', 'Esta versión aún no puede verificar licencias', 'Sigues en Personal. Las licencias se activarán con la versión de venta.', parsed.payload);
  let valid = false;
  try { valid = await globalThis.crypto.subtle.verify('Ed25519', key, parsed.signature, parsed.signed); } catch { valid = false; }
  if (!valid) return personal('invalid', 'La firma de la licencia no es válida', 'El texto se modificó o no lo emitió Plan B. Sigues en Personal.');
  const payload = parsed.payload, label = PLAN_LABEL[payload.plan];
  if (!payload.expiresAt) return { status: 'active', plan: payload.plan, payload, daysLeft: null, title: 'Plan ' + label + ' activo', detail: 'Licencia a nombre de ' + payload.holder + ', sin caducidad.' };
  const expires = Date.parse(payload.expiresAt), daysLeft = Math.ceil((expires - now.getTime()) / DAY);
  if (daysLeft > 0) return { status: 'active', plan: payload.plan, payload, daysLeft, title: 'Plan ' + label + ' activo', detail: 'A nombre de ' + payload.holder + ', hasta el ' + dayLabel(payload.expiresAt) + '.' };
  if (-daysLeft < LICENSE_GRACE_DAYS) return { status: 'grace', plan: payload.plan, payload, daysLeft, title: 'Plan ' + label + ' en periodo de gracia',
    detail: 'Caducó el ' + dayLabel(payload.expiresAt) + '. Renueva antes de ' + (LICENSE_GRACE_DAYS + daysLeft) + ' días para no volver a Personal.' };
  return personal('expired', 'La licencia caducó', 'Caducó el ' + dayLabel(payload.expiresAt) + '. Sigues en Personal y tus datos siguen intactos.', payload);
}

/** Firma una licencia con la clave privada del emisor (herramienta de venta y pruebas; nunca se usa dentro de la app). */
export async function issueLicense(payload: LicensePayload, privateKey: CryptoKey): Promise<string> {
  const body = LICENSE_PREFIX + '.' + toBase64Url(encoder.encode(JSON.stringify(LicensePayloadSchema.parse(payload))));
  const signature = new Uint8Array(await globalThis.crypto.subtle.sign('Ed25519', privateKey, encoder.encode(body)));
  return body + '.' + toBase64Url(signature);
}
