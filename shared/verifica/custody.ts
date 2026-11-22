// Plan B Verifica · copia custodiada (fase 2, «sala limpia»).
// Todo lo necesario para rehacer el informe (capturas, facturas, declaraciones y la sal de los seudónimos) se cifra con
// AES-256-GCM y una llave aleatoria. La copia va atada a la huella del informe como dato autenticado: no se puede
// presentar con otro informe. Quien tenga la copia y la llave (un abogado o notario) puede rehacer el informe y
// comprobar que sale idéntico; quien solo tenga el informe no ve ningún dato.
// Usa Web Crypto y CompressionStream: igual en Node y en el navegador. Sin almacén de claves del sistema.
import { fingerprintOf, buildVerificaReport, stableJson, type ReportInput, type VerificaReport } from './report.js';

export const CUSTODY_FORMAT = 'planb-verifica-custody-v1';
const KEY_PREFIX = 'vfk1-';
/** Tope de la copia descifrada y descomprimida, para no agotar la memoria con un archivo manipulado. */
export const MAX_CUSTODY_BYTES = 512 * 1024 * 1024;

export interface CustodyEnvelope {
  format: typeof CUSTODY_FORMAT;
  /** Huella del informe al que pertenece. Va autenticada dentro del cifrado. */
  reportFingerprint: string;
  asOf: string;
  cipher: 'AES-256-GCM';
  compression: 'gzip';
  iv: string;
  data: string;
}

export class CustodyError extends Error {
  constructor(readonly code: 'BAD_KEY' | 'MALFORMED' | 'WRONG_KEY_OR_TAMPERED' | 'TOO_LARGE', message: string) { super(message); this.name = 'CustodyError'; }
}

const subtle = () => globalThis.crypto.subtle;

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}
function fromBase64(text: string): Uint8Array {
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(text) || text.length % 4) throw new CustodyError('MALFORMED', 'La copia custodiada no es válida.');
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
const toBase64Url = (bytes: Uint8Array) => toBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

async function transform(bytes: Uint8Array, stream: CompressionStream | DecompressionStream, limit = Infinity): Promise<Uint8Array> {
  const reader = new Blob([bytes as BlobPart]).stream().pipeThrough(stream).getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > limit) { await reader.cancel(); throw new CustodyError('TOO_LARGE', 'La copia custodiada es demasiado grande.'); }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { out.set(chunk, offset); offset += chunk.length; }
  return out;
}

/** Llave nueva de 256 bits, en texto: `vfk1-` y 43 caracteres. */
export function newCustodyKey(): string {
  return KEY_PREFIX + toBase64Url(globalThis.crypto.getRandomValues(new Uint8Array(32)));
}

async function importKey(key: string): Promise<CryptoKey> {
  const body = key.trim();
  if (!body.startsWith(KEY_PREFIX) || !/^[A-Za-z0-9_-]{43}$/.test(body.slice(KEY_PREFIX.length))) throw new CustodyError('BAD_KEY', 'La llave no tiene la forma esperada (vfk1- y 43 caracteres).');
  const raw = fromBase64(body.slice(KEY_PREFIX.length).replace(/-/g, '+').replace(/_/g, '/') + '=');
  return subtle().importKey('raw', raw as BufferSource, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

const additionalData = (reportFingerprint: string, asOf: string) => new TextEncoder().encode(CUSTODY_FORMAT + '|' + reportFingerprint + '|' + asOf);

/** Cifra la entrada del informe. El informe debe ser el que sale de esa entrada. */
export async function sealCustody(input: ReportInput, report: VerificaReport, key: string): Promise<CustodyEnvelope> {
  if (buildVerificaReport(input).fingerprint !== report.fingerprint) throw new Error('La copia custodiada no corresponde a este informe.');
  const plain = await transform(new TextEncoder().encode(stableJson(input)), new CompressionStream('gzip'));
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const sealed = await subtle().encrypt({ name: 'AES-GCM', iv, additionalData: additionalData(report.fingerprint, report.asOf), tagLength: 128 }, await importKey(key), plain as BufferSource);
  return { format: CUSTODY_FORMAT, reportFingerprint: report.fingerprint, asOf: report.asOf, cipher: 'AES-256-GCM', compression: 'gzip', iv: toBase64(iv), data: toBase64(new Uint8Array(sealed)) };
}

/** Huella del archivo de la copia: la que se cita en el contrato junto a la del informe. */
export const custodyFingerprint = (envelope: CustodyEnvelope): string => fingerprintOf(envelope);

export function parseCustody(value: unknown): CustodyEnvelope {
  const e = value as Partial<CustodyEnvelope> | null;
  if (typeof e !== 'object' || e === null || e.format !== CUSTODY_FORMAT || e.cipher !== 'AES-256-GCM' || e.compression !== 'gzip'
    || typeof e.reportFingerprint !== 'string' || !/^[0-9a-f]{64}$/.test(e.reportFingerprint) || typeof e.asOf !== 'string'
    || typeof e.iv !== 'string' || typeof e.data !== 'string') throw new CustodyError('MALFORMED', 'El archivo no es una copia custodiada de Verifica.');
  return e as CustodyEnvelope;
}

export interface OpenedCustody {
  input: ReportInput;
  /** El informe rehecho a partir de la copia. */
  rebuilt: VerificaReport;
  /** true si el informe rehecho tiene exactamente la huella a la que está atada la copia. */
  reproduces: boolean;
}

/** Descifra la copia y rehace el informe. Una llave equivocada o un byte cambiado se notan aquí. */
export async function openCustody(value: unknown, key: string): Promise<OpenedCustody> {
  const envelope = parseCustody(value);
  const iv = fromBase64(envelope.iv), data = fromBase64(envelope.data);
  if (iv.length !== 12) throw new CustodyError('MALFORMED', 'La copia custodiada no es válida.');
  let plain: ArrayBuffer;
  try {
    plain = await subtle().decrypt({ name: 'AES-GCM', iv: iv as BufferSource, additionalData: additionalData(envelope.reportFingerprint, envelope.asOf), tagLength: 128 }, await importKey(key), data as BufferSource);
  } catch (error) {
    if (error instanceof CustodyError) throw error;
    throw new CustodyError('WRONG_KEY_OR_TAMPERED', 'No se puede abrir: la llave no es la de esta copia, o la copia se ha modificado.');
  }
  let input: ReportInput;
  try { input = JSON.parse(new TextDecoder().decode(await transform(new Uint8Array(plain), new DecompressionStream('gzip'), MAX_CUSTODY_BYTES))) as ReportInput; }
  catch (error) { if (error instanceof CustodyError) throw error; throw new CustodyError('MALFORMED', 'La copia se abrió pero su contenido no es válido.'); }
  const rebuilt = buildVerificaReport(input);
  return { input, rebuilt, reproduces: rebuilt.fingerprint === envelope.reportFingerprint };
}
