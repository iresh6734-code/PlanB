// Herramienta de venta para licencias de Plan B (super plan M1). Se ejecuta a mano, fuera de la app:
//   npx tsx scripts/license-tool.ts keygen <carpeta-privada>
//     Crea la pareja Ed25519. Guarda la clave privada en <carpeta-privada>/planb-license-private.jwk (NUNCA en el repositorio)
//     y muestra la pública para copiarla en LICENSE_PUBLIC_KEY (shared/license.ts).
//   npx tsx scripts/license-tool.ts issue <clave-privada.jwk> <pro|team> "<titular>" <puestos> [AAAA-MM-DD|sin-caducidad]
//     Imprime la licencia lista para enviar al cliente.
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { issueLicense, toBase64Url, type LicensePayload } from '../shared/license.js';

const [command, ...args] = process.argv.slice(2);
const fail = (message: string): never => { console.error(message); process.exit(1); };

if (command === 'keygen') {
  const folder = args[0] ?? fail('Indica una carpeta privada fuera del repositorio.');
  if (path.resolve(folder).startsWith(path.resolve('.'))) fail('La clave privada no puede guardarse dentro del repositorio.');
  const file = path.join(folder, 'planb-license-private.jwk');
  if (existsSync(file)) fail('Ya existe ' + file + '; no se sobrescribe.');
  const pair = await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']) as CryptoKeyPair;
  mkdirSync(folder, { recursive: true });
  writeFileSync(file, JSON.stringify(await crypto.subtle.exportKey('jwk', pair.privateKey)), { mode: 0o600, flag: 'wx' });
  console.log('Clave privada guardada en ' + file + '. Haz una copia de seguridad: sin ella no se pueden emitir licencias.');
  console.log('LICENSE_PUBLIC_KEY = \'' + toBase64Url(new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey))) + '\'');
} else if (command === 'issue') {
  const [keyFile, plan, holder, seats, until] = args;
  if (!keyFile || (plan !== 'pro' && plan !== 'team') || !holder || !seats) fail('Uso: issue <clave-privada.jwk> <pro|team> "<titular>" <puestos> [AAAA-MM-DD|sin-caducidad]');
  if (until && until !== 'sin-caducidad' && !/^\d{4}-\d{2}-\d{2}$/.test(until)) fail('La caducidad debe ser AAAA-MM-DD o «sin-caducidad».');
  const privateKey = await crypto.subtle.importKey('jwk', JSON.parse(readFileSync(keyFile, 'utf8')), { name: 'Ed25519' }, false, ['sign']);
  const payload: LicensePayload = { v: 1, id: randomUUID(), plan: plan as 'pro' | 'team', holder, seats: Number(seats),
    issuedAt: new Date().toISOString(), expiresAt: !until || until === 'sin-caducidad' ? null : until + 'T23:59:59Z' };
  console.log(await issueLicense(payload, privateKey));
} else {
  fail('Órdenes: keygen <carpeta-privada> | issue <clave-privada.jwk> <pro|team> "<titular>" <puestos> [AAAA-MM-DD|sin-caducidad]');
}
