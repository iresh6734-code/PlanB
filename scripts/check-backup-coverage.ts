import fs from 'node:fs';
import { resolve } from 'node:path';
import { compareBackupCoverage } from '../server/backup-coverage.js';
import { MAX_RECOVERY_BYTES } from '../server/recovery-preflight.js';

const help = `Plan B · Comprobar cobertura de una copia frente a otra exportación
Uso: node --import tsx scripts/check-backup-coverage.ts --reference RUTA --backup RUTA [--passwords-stdin]
Sin argumentos solo muestra ayuda. Dos archivos JSON portátiles explícitos; no inspecciona bases, perfiles o instalaciones.
Con --passwords-stdin, stdin es JSON: {"reference":"contraseña","backup":"contraseña"} (claves opcionales).
Nunca admite contraseñas como argumentos. No pide ni guarda contraseñas.
Código 0: coincide con la referencia; 1: difiere, incompatible o inválida; 2: uso/lectura incorrectos.
Una coincidencia no acredita frescura del estado vivo, custodia separada o recuperación real.
`;

function boundedRead(fd: number, max: number): string {
  const chunks: Buffer[] = []; let total = 0;
  while (true) {
    const buffer = Buffer.alloc(Math.min(64 * 1024, max + 1 - total));
    const read = fs.readSync(fd, buffer, 0, buffer.length, null);
    if (!read) break;
    total += read; if (total > max) throw Error('Límite de lectura superado.');
    chunks.push(buffer.subarray(0, read));
  }
  return Buffer.concat(chunks).toString('utf8');
}
function fileRead(filename: string) {
  const target = resolve(filename);
  if (fs.lstatSync(target).isSymbolicLink()) throw Error('Archivo enlazado no admitido.');
  const fd = fs.openSync(target, 'r');
  try {
    const stat = fs.fstatSync(fd);
    if (!stat.isFile() || stat.size > MAX_RECOVERY_BYTES) throw Error('Archivo no regular o demasiado grande.');
    return { raw: boundedRead(fd, MAX_RECOVERY_BYTES), identity: stat.dev + ':' + stat.ino, realpath: fs.realpathSync(target) };
  } finally { fs.closeSync(fd); }
}
function main() {
  const args = process.argv.slice(2);
  if (!args.length || args.length === 1 && args[0] === '--help') { process.stdout.write(help); return; }
  let reference: string | undefined, backup: string | undefined, passwordsStdin = false;
  const seen = new Set<string>();
  for (let index = 0; index < args.length; index++) {
    const flag = args[index];
    if (seen.has(flag) || !['--reference', '--backup', '--passwords-stdin'].includes(flag)) throw Error('Argumento no admitido.');
    seen.add(flag);
    if (flag === '--passwords-stdin') { passwordsStdin = true; continue; }
    const value = args[++index]; if (!value || value.startsWith('--')) throw Error('Falta una ruta.');
    if (flag === '--reference') reference = value; else backup = value;
  }
  if (!reference || !backup) throw Error('Faltan archivos explícitos.');
  let passwords: { reference?: string; backup?: string } = {};
  if (passwordsStdin) {
    const value: unknown = JSON.parse(boundedRead(0, 4096));
    if (!value || typeof value !== 'object' || Array.isArray(value)
      || Object.entries(value).some(([key, item]) => !['reference', 'backup'].includes(key) || typeof item !== 'string' || item.length > 200)) throw Error('Entrada de contraseñas no válida.');
    passwords = value;
  }
  const ref = fileRead(reference), copy = fileRead(backup);
  const result = compareBackupCoverage({ reference: ref.raw, backup: copy.raw, referencePassword: passwords.reference, backupPassword: passwords.backup });
  process.stdout.write(JSON.stringify({ ...result, sameInputFile: ref.realpath === copy.realpath || ref.identity === copy.identity }, null, 2) + '\n');
  process.exitCode = result.status === 'matches-reference' ? 0 : 1;
}
try { main(); } catch {
  process.stderr.write('No se pudo comprobar: revisa argumentos, archivos regulares de hasta 32 MiB y JSON de contraseñas por stdin. No se ha restaurado ninguna instalación.\n');
  process.exitCode = 2;
}
