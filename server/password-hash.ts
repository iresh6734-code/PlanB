// Hash de la contraseña local con versión y parámetros explícitos (mejora F2 del informe; CLAUDE-PASSWORD-HASH-V2).
// Perfiles admitidos, cerrados: el formato anterior ({salt, hash} con los parámetros por defecto de scrypt) y la v2 con
// exactamente sus parámetros. Cualquier otra combinación (versión desconocida, parámetros alterados, campos dañados) se
// rechaza ANTES de derivar, así que no puede pasar por compatible ni provocar un error del algoritmo (CODEX-PASSWORD-REVIEW-393).
// El formato anterior se sustituye por la v2 en el primer desbloqueo correcto. Comparación en tiempo constante.
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

/** Perfil actual: N = 2^15 (el doble de trabajo que el valor por defecto de Node), r = 8, p = 1, clave de 32 bytes. */
export const CURRENT = { v: 2 as const, N: 32768, r: 8, p: 1 };
/** Parámetros con los que se guardaron las contraseñas antes de la versión 2 (los de Node por defecto). */
export const LEGACY = { N: 16384, r: 8, p: 1 };

export type StoredPassword = { salt: string; hash: string; v?: number; N?: number; r?: number; p?: number };

const derive = (password: string, salt: Buffer, params: { N: number; r: number; p: number }) =>
  // maxmem holgado: scrypt necesita ~128·N·r bytes y el tope por defecto (32 MiB) se queda corto con N = 2^15.
  scryptSync(password, salt, 32, { N: params.N, r: params.r, p: params.p, maxmem: 256 * params.N * params.r });

export function hashPassword(password: string): StoredPassword {
  const salt = randomBytes(16);
  return { v: CURRENT.v, N: CURRENT.N, r: CURRENT.r, p: CURRENT.p, salt: salt.toString('base64'), hash: derive(password, salt, CURRENT).toString('base64') };
}

const base64Of = (text: unknown, bytes: number) => {
  if (typeof text !== 'string' || !/^[A-Za-z0-9+/]+={0,2}$/.test(text)) return null;
  const value = Buffer.from(text, 'base64');
  return value.length === bytes ? value : null;
};

/** Perfil del registro guardado, o null si no es exactamente uno de los admitidos. */
export function storedProfile(stored: unknown): { kind: 'legacy' | 'v2'; params: { N: number; r: number; p: number }; salt: Buffer; hash: Buffer } | null {
  if (!stored || typeof stored !== 'object') return null;
  const record = stored as Record<string, unknown>, keys = Object.keys(record).sort().join(',');
  const salt = base64Of(record.salt, 16), hash = base64Of(record.hash, 32);
  if (!salt || !hash) return null;
  if (keys === 'hash,salt') return { kind: 'legacy', params: LEGACY, salt, hash };
  if (keys === 'N,hash,p,r,salt,v' && record.v === CURRENT.v && record.N === CURRENT.N && record.r === CURRENT.r && record.p === CURRENT.p) return { kind: 'v2', params: CURRENT, salt, hash };
  return null;
}

/** Verifica la contraseña. `upgrade` indica que conviene volver a guardarla con el perfil actual. Nunca lanza. */
export function verifyPassword(password: string, stored: unknown): { ok: boolean; upgrade: boolean } {
  const profile = storedProfile(stored);
  if (!profile || typeof password !== 'string') return { ok: false, upgrade: false };
  let ok = false;
  try { ok = timingSafeEqual(derive(password, profile.salt, profile.params), profile.hash); }
  catch { return { ok: false, upgrade: false }; }
  return { ok, upgrade: ok && profile.kind !== 'v2' };
}
