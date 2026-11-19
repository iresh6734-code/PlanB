import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { rehearse } from './rehearse-rescue-capsule.js';

// Proceso HIJO del ensayo de relevo (unidad 224). Lo arranca `server/relay-rehearsal-executor.ts` con el cwd aislado de UNA ejecución: recorre el Kit 116 (`rehearse()`) y emite una única línea
// `RELAY_RESULT {json}` con una LISTA BLANCA de números y banderas (sin rutas, sin nombres de cápsula, sin contraseña). La contraseña ficticia llega por la entrada estándar: nunca por argumentos, entorno ni
// salida. Argumento admitido: `--run run-<uuid>` (solo identifica el proceso para comprobar su cierre).
export const RESULT_PREFIX = 'RELAY_RESULT ';
export function publicResult(result: Awaited<ReturnType<typeof rehearse>>) {
  return {
    ok: result.ok === true, wrongIdRejected: result.wrongIdRejected === true, createCalls: Number(result.createCalls), duplicates: Number(result.duplicates), records: Number(result.records),
    finalStage: String(result.finalStage), capsule: { bytes: Number(result.capsule.bytes), sha256: String(result.capsule.sha256) }, ms: { export: Number(result.ms.export), import: Number(result.ms.import) },
  };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const rest = process.argv.slice(2);
    if (!(rest.length === 2 && rest[0] === '--run' && /^run-[0-9a-f-]{36}$/.test(rest[1]!))) throw new Error('Argumentos no admitidos.');
    const password = readFileSync(0, 'utf8').replace(/\r?\n$/, '');
    if (!password) throw new Error('Falta la contraseña del ensayo en la entrada estándar.');
    const result = await rehearse(password, { crash: null, now: null }, () => undefined);
    process.stdout.write(RESULT_PREFIX + JSON.stringify(publicResult(result)) + '\n');
    process.exitCode = result.ok ? 0 : 1;
  } catch { process.exitCode = 1; }
}
