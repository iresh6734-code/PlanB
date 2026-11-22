import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runReadiness, type GateStatus, type Readiness } from '../shared/verifica/readiness.js';
// Verifica · fase 5: un solo comando con las cinco pruebas del plan. Nadie de fuera ve el producto hasta que pasen todas.
// Sin red y sin escribir nada. --single-product lo da quien decide que en el menú ya queda un solo producto (fase 0).

const USAGE = 'Uso: npx tsx scripts/verifica-pruebas.ts [--single-product] [--json]';

export interface ReadinessArgs { singleProduct: boolean; json: boolean }

export class ReadinessUsageError extends Error { constructor(message: string) { super(message); this.name = 'ReadinessUsageError'; } }

export function parseArgs(argv: string[]): ReadinessArgs {
  const args: ReadinessArgs = { singleProduct: false, json: false };
  for (const a of argv) {
    if (a === '--single-product') args.singleProduct = true;
    else if (a === '--json') args.json = true;
    else throw new ReadinessUsageError('Argumento no reconocido. ' + USAGE);
  }
  return args;
}

const MARK: Record<GateStatus, string> = { passed: 'PASA     ', failed: 'NO PASA  ', pending: 'PENDIENTE' };

export function formatReadiness(readiness: Readiness): string {
  const lines = ['', 'Verifica · las cinco pruebas · empresa ficticia, sin conexión', ''];
  for (const gate of readiness.gates) {
    lines.push('  ' + MARK[gate.status] + ' · Fase ' + gate.phase + ' · ' + gate.name + ': ' + gate.criterion + '.');
    for (const detail of gate.details) lines.push('              ' + detail);
  }
  lines.push('', readiness.ready
    ? '  Pasan las cinco. Se puede enseñar fuera, con lo que sigue dicho siempre:'
    : '  No se enseña fuera todavía. Lo que no cubren estas pruebas:');
  for (const line of readiness.notCovered) lines.push('  · ' + line);
  return lines.join('\n') + '\n';
}

export interface ReadinessDeps { out: (text: string) => void; err: (text: string) => void; run?: typeof runReadiness }

/** 0 = pasan las cinco; 1 = alguna no pasa o está pendiente; 2 = uso incorrecto. */
export async function runCli(argv: string[], deps: ReadinessDeps): Promise<number> {
  let args: ReadinessArgs;
  try { args = parseArgs(argv); }
  catch (error) { deps.err((error instanceof Error ? error.message : USAGE) + '\n'); return 2; }
  const readiness = await (deps.run ?? runReadiness)({ singleProduct: args.singleProduct });
  deps.out(args.json ? JSON.stringify(readiness, null, 2) + '\n' : formatReadiness(readiness));
  return readiness.ready ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runCli(process.argv.slice(2), { out: t => { process.stdout.write(t); }, err: t => { process.stderr.write(t); } }).then(code => { process.exitCode = code; }, () => { process.stderr.write('Error inesperado.\n'); process.exitCode = 1; });
}
