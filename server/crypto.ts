import { randomBytes, createCipheriv, createDecipheriv, scryptSync } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';

const testMode = () => process.env.NODE_ENV === 'test';

// Windows user scope: the protected key cannot be unwrapped by another Windows user.
// Tests and demos never reach DPAPI: each call spawns powershell.exe with ProtectedData, which
// corporate endpoint protection reports as «Suspicious DPAPI Activity».
function dpapi(value: string, decrypt: boolean): string {
  if (testMode()) throw new Error('En modo de pruebas no se usa la protección de Windows (DPAPI).');
  const method = decrypt ? 'Unprotect' : 'Protect';
  const script = "Add-Type -AssemblyName System.Security; $v=[Console]::In.ReadToEnd(); $b=[Convert]::FromBase64String($v); $r=[Security.Cryptography.ProtectedData]::" + method + "($b,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser); [Console]::Out.Write([Convert]::ToBase64String($r))";
  const result = spawnSync('powershell.exe', ['-NoProfile','-NonInteractive','-Command',script], { input: value, encoding: 'utf8', windowsHide: true });
  if (result.status !== 0 || !result.stdout.trim()) throw new Error('No se pudo abrir la protección local de Windows. Conserva la carpeta y usa una exportación con contraseña para trasladar los datos.');
  return result.stdout.trim();
}
const keyCache=new Map<string,Buffer>();
export function localKey(folder: string): Buffer {
  mkdirSync(folder, { recursive: true });
  const filename = join(folder, '.planb-key');
  if(existsSync(filename)&&keyCache.has(filename))return keyCache.get(filename)!;
  if (existsSync(filename)) {
    const value = JSON.parse(readFileSync(filename, 'utf8'));
    if (value.kind === 'dpapi' && testMode()) throw new Error('Esta carpeta está protegida por Windows y el modo de pruebas no abre esa protección. Usa una carpeta de datos nueva.');
    if (value.kind === 'dpapi' && process.platform === 'win32') {const key=Buffer.from(dpapi(value.data,true),'base64');keyCache.set(filename,key);return key;}
    if (value.kind === 'test' && process.env.NODE_ENV === 'test') {const key=Buffer.from(value.data,'base64');keyCache.set(filename,key);return key;}
    throw new Error('La clave local requiere Windows o el entorno de pruebas original.');
  }
  const key = randomBytes(32);
  if (process.platform !== 'win32' && !testMode()) throw new Error('La protección local comercial requiere Windows.');
  writeFileSync(filename, JSON.stringify(testMode() ? { kind: 'test', data: key.toString('base64') } : { kind: 'dpapi', data: dpapi(key.toString('base64'), false) }), { mode: 0o600, flag: 'wx' });
  keyCache.set(filename,key);
  return key;
}
export function seal(text: string, key: Buffer): string {
  const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', key, iv);
  const body = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  return 'enc1:' + Buffer.concat([iv, cipher.getAuthTag(), body]).toString('base64');
}
export function open(text: string, key: Buffer): string {
  if (!text.startsWith('enc1:')) return text; // Legacy plaintext is migrated by the caller.
  const data = Buffer.from(text.slice(5), 'base64');
  const decipher = createDecipheriv('aes-256-gcm', key, data.subarray(0,12));
  decipher.setAuthTag(data.subarray(12,28));
  return Buffer.concat([decipher.update(data.subarray(28)), decipher.final()]).toString('utf8');
}
export function encodePortable(value: unknown, password: string): string {
  if (password.length < 12 || password.length > 200) throw new Error('Usa una contraseña de recuperación de entre 12 y 200 caracteres.');
  const salt = randomBytes(16), key = scryptSync(password, salt, 32);
  return JSON.stringify({ format: 'planb-encrypted-v2', kdf: 'scrypt', salt: salt.toString('base64'), data: seal(JSON.stringify(value), key) });
}
export function decodePortable(raw: string, password: string): unknown {
  const value = JSON.parse(raw);
  if (value.format !== 'planb-encrypted-v2' || value.kdf !== 'scrypt' || typeof value.salt !== 'string' || typeof value.data !== 'string') throw new Error('El archivo cifrado no es compatible.');
  if (Buffer.from(value.salt,'base64').length !== 16 || !value.data.startsWith('enc1:') || value.data.length > 200_000_000) throw new Error('Archivo cifrado no válido.');
  try { return JSON.parse(open(value.data, scryptSync(password, Buffer.from(value.salt,'base64'),32))); }
  catch { throw new Error('La contraseña es incorrecta o el archivo está dañado.'); }
}
