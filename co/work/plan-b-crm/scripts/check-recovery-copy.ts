import fs from 'node:fs';
import { resolve } from 'node:path';
import { inspectRecoveryCopy, MAX_RECOVERY_BYTES, type RecoveryTarget } from '../server/recovery-preflight.js';

const help = `Plan B · Verificar una copia sin restaurar la instalación
Uso: node --import tsx scripts/check-recovery-copy.ts --file RUTA [--password-stdin] [--account PORTAL --data test|production]
Sin --file solo muestra esta ayuda. Admite JSON portátil, no ZIP.
La contraseña solo se lee de stdin con --password-stdin; nunca se admite como argumento.
Salida JSON: código 0 válida, 1 inválida/incompatible, 2 uso o lectura incorrectos.
No consulta proveedores, perfiles, bases locales o claves de Windows. No restaura la instalación.
`;
const args = process.argv.slice(2);
function main() {
  if (!args.length || args.length === 1 && args[0] === '--help') { process.stdout.write(help); return; }
  let file: string | undefined, account: string | undefined, data: string | undefined, passwordStdin = false;
  const seen = new Set<string>();
  for (let i = 0; i < args.length; i++) {
    const flag = args[i];
    if (seen.has(flag) || !['--file', '--account', '--data', '--password-stdin'].includes(flag)) throw Error('Argumento desconocido o repetido.');
    seen.add(flag);
    if (flag === '--password-stdin') { passwordStdin = true; continue; }
    const value = args[++i]; if (!value || value.startsWith('--')) throw Error('Falta un valor de argumento.');
    if (flag === '--file') file = value; else if (flag === '--account') account = value; else data = value;
  }
  if (!file || !!account !== !!data || data && !['test', 'production'].includes(data)) throw Error('Indica --file y, opcionalmente, --account junto a --data test|production.');
  const descriptor = fs.openSync(resolve(file), 'r');
  let raw: string;
  try {
    const before = fs.fstatSync(descriptor);
    if (!before.isFile() || before.size > MAX_RECOVERY_BYTES) throw Error('Se requiere un archivo regular de hasta 32 MiB.');
    const bytes = Buffer.alloc(before.size); let total = 0;
    while (total < bytes.length) { const read = fs.readSync(descriptor, bytes, total, bytes.length - total, null); if (!read) break; total += read; }
    const after = fs.fstatSync(descriptor);
    if (total !== before.size || after.size !== before.size || after.mtimeMs !== before.mtimeMs) throw Error('El archivo cambió durante la lectura.');
    raw = bytes.toString('utf8');
    if (!Buffer.from(raw, 'utf8').equals(bytes)) throw Error('El archivo no es texto UTF-8 válido.');
  } finally { fs.closeSync(descriptor); }
  let password = '';
  if (passwordStdin) {
    if (process.stdin.isTTY) throw Error('Proporciona la contraseña por stdin, sin incluirla en argumentos.');
    const bytes = Buffer.alloc(802); let total = 0;
    while (total < bytes.length) { const read = fs.readSync(0, bytes, total, bytes.length - total, null); if (!read) break; total += read; }
    if (total === bytes.length) throw Error('La entrada de contraseña supera el límite.');
    password = bytes.subarray(0, total).toString('utf8').replace(/\r?\n$/, '');
    if (password.length > 200) throw Error('La entrada de contraseña supera el límite.');
  }
  const target: RecoveryTarget | undefined = account ? { accountId: account, isTestData: data === 'test' } : undefined;
  const report = inspectRecoveryCopy(raw, { password, target });
  process.stdout.write(JSON.stringify(report, null, 2) + '\n');
  process.exitCode = report.status === 'valid' ? 0 : 1;
}
try { main(); } catch {
  // Avoid reflecting supplied paths, arguments, passwords or low-level errors.
  process.stderr.write('No se pudo verificar el archivo. Revisa los argumentos, los límites y el acceso; usa --help.\n'); process.exitCode = 2;
}
