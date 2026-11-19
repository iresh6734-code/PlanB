import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkHubspotRead } from '../server/hubspot-read-check.js';
import { guardedReadFetch, LIVE_MAX_REQUESTS } from '../server/hubspot-read-check-transport.js';
import { READ_CHECK_TTL_MS, type ObjectReadResult, type ReadCheckResult } from '../shared/hubspot-read-check.js';
// Comprobación REAL y acotada de LECTURA de HubSpot contra un portal de ENSAYO (DEVELOPER_TEST/SANDBOX). No escribe, no reintenta, no pagina y no sigue redirecciones.
// Máximo 5 GET: identidad + 1 elemento de cada objeto (el cuerpo se descarta). Si la identidad no coincide con el portal esperado o la cuenta no es de ensayo, se detiene ANTES de leer objetos.
// La credencial solo se recibe por entrada estándar y no se imprime. Las pruebas usan respuestas sintéticas; ejecutar contra HubSpot exige --authorized-reads 5 (autorización expresa del usuario).
export interface CliArgs { portal: string; timeoutMs: number; json: boolean }
export class CliUsageError extends Error { constructor(message: string) { super(message); this.name = 'CliUsageError'; } }
const USAGE = 'Uso: <credencial por entrada estándar> | npx tsx scripts/hubspot-read-check.ts --portal <ID numérico del portal de ensayo> --authorized-reads 5 [--timeout-ms 1000-15000] [--json]';
export function parseArgs(argv: string[]): CliArgs {
  let portal = '', authorized = false, timeoutMs = 8000, json = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i], next = () => { const v = argv[++i]; if (v === undefined || v.startsWith('--')) throw new CliUsageError('Falta el valor de ' + a + '.'); return v; };
    if (a === '--portal') portal = next();
    else if (a === '--authorized-reads') { if (next() !== '5') throw new CliUsageError('--authorized-reads solo admite 5 (las cinco lecturas descritas).'); authorized = true; }
    else if (a === '--timeout-ms') { const v = next(); if (!/^\d{4,5}$/.test(v) || Number(v) < 1000 || Number(v) > 15000) throw new CliUsageError('--timeout-ms debe estar entre 1000 y 15000.'); timeoutMs = Number(v); }
    else if (a === '--json') json = true;
    else throw new CliUsageError('Argumento no reconocido (posición ' + (i + 1) + '). La credencial no se pasa como argumento: va por la entrada estándar. ' + USAGE); // no se repite el argumento: podría ser un secreto
  }
  if (!/^\d{1,20}$/.test(portal)) throw new CliUsageError('Indica --portal con el ID numérico del portal de ensayo. ' + USAGE);
  if (!authorized) throw new CliUsageError('No se ejecuta ninguna lectura sin --authorized-reads 5: confirma que autorizas las 5 peticiones GET de lectura (1 identidad + 4 objetos, un elemento cada uno) sobre ese portal de ensayo.');
  return { portal, timeoutMs, json };
}
export interface Readable { isTTY?: boolean; [Symbol.asyncIterator](): AsyncIterator<Buffer | string> }
/** Lee la credencial de la entrada estándar (máx. 4 KiB). Nunca se incluye su contenido en un error. */
export async function readSecret(stdin: Readable): Promise<string> {
  if (stdin.isTTY) throw new CliUsageError('La credencial se recibe por una tubería, no escribiéndola aquí (se vería en pantalla). Ver el runbook de coordination/plans/HUBSPOT-LECTURA-REAL-172.md.');
  const chunks: Buffer[] = []; let total = 0;
  for await (const c of stdin) { const b = Buffer.isBuffer(c) ? c : Buffer.from(c); total += b.length; if (total > 4096) throw new CliUsageError('La entrada estándar es demasiado larga para ser una credencial.'); chunks.push(b); }
  const text = Buffer.concat(chunks).toString('utf8').replace(/[\r\n]+$/, '');
  if (text.length < 10 || /[\s\u0000-\u001f]/.test(text)) throw new CliUsageError('La entrada estándar no contiene una credencial con forma válida (una sola línea, sin espacios).');
  return text;
}

const OBJECT_NAME: Record<string, string> = { contacts: 'clientes', companies: 'empresas', deals: 'oportunidades', tasks: 'tareas' };
function objectLine(o: ObjectReadResult): string {
  const name = OBJECT_NAME[o.entity] ?? o.entity;
  switch (o.outcome) {
    case 'readable': return name + ': acceso confirmado';
    case 'forbidden': return name + ': permisos insuficientes';
    case 'rejected': return name + ': credencial rechazada durante la comprobación';
    case 'malformed': return name + ': error (respuesta no válida)';
    case 'unavailable': return o.httpStatus === null ? name + ': desconocido (sin respuesta útil)' : name + ': error del servicio (código ' + o.httpStatus + ')';
    default: return name + ': desconocido (no se comprobó)';
  }
}
function headline(r: ReadCheckResult): string {
  switch (r.state) {
    case 'read_verified': return 'ACCESO DE LECTURA CONFIRMADO (cuenta de ensayo)';
    case 'partial': return 'ACCESO PARCIAL: solo una parte de los objetos es legible';
    case 'insufficient_permissions': return 'PERMISOS INSUFICIENTES';
    case 'rejected': return 'CREDENCIAL RECHAZADA';
    case 'identity_mismatch': return 'DETENIDO: la credencial pertenece a otro portal; no se leyó ningún objeto';
    case 'account_type_mismatch': return 'DETENIDO: la cuenta no es de ensayo; no se leyó ningún objeto';
    default: return r.evidence === 'provider_response' ? 'ERROR: HubSpot respondió pero no se pudo comprobar el acceso' : 'RESULTADO DESCONOCIDO: no hubo respuesta útil de HubSpot';
  }
}
export interface CliDeps { stdin: Readable; out: (text: string) => void; err: (text: string) => void; fetch: typeof fetch; now?: () => number }
/** Devuelve el código de salida: 0 = acceso de lectura confirmado; 1 = cualquier otro resultado; 2 = uso incorrecto (no se hizo ninguna petición). */
export async function runCli(argv: string[], deps: CliDeps): Promise<number> {
  let args: CliArgs, token: string;
  try { args = parseArgs(argv); token = await readSecret(deps.stdin); }
  catch (e) { deps.err((e instanceof CliUsageError ? e.message : 'Entrada no válida.') + '\n'); return 2; }
  const guard = guardedReadFetch(deps.fetch), overall = AbortSignal.timeout(args.timeoutMs * LIVE_MAX_REQUESTS + 5000);
  const result = await checkHubspotRead({ token, accountId: args.portal, mode: 'test' }, { fetcher: guard.fetch, now: deps.now, timeoutMs: args.timeoutMs, signal: overall });
  const stats = guard.stats();
  // «Confirmado» exige además coincidencia exacta con el portal pedido, entorno de ensayo, ninguna petición bloqueada y ninguna respuesta que superara el tope (salvaguarda redundante: el transporte ya no entrega respuestas truncadas al módulo).
  const confirmed = result.state === 'read_verified' && result.environment === 'rehearsal' && result.accountId === args.portal && stats.blocked.length === 0 && stats.truncated === 0 && result.objects.length === 4 && result.objects.every(o => o.outcome === 'readable');
  const view = { portalEsperado: args.portal, resultado: confirmed ? 'confirmado' : result.state === 'read_verified' ? 'no_confirmado' : result.state, entorno: result.environment, tipoDeCuenta: result.accountType, comprobadoEn: result.checkedAt, validoHasta: result.freshUntil, objetos: result.objects.map(o => ({ objeto: o.entity, resultado: o.outcome, codigoHttp: o.httpStatus })), reintentarEnSegundos: result.retryAfterSeconds, peticiones: stats.requests, peticionesBloqueadas: stats.blocked.length, respuestasTruncadas: stats.truncated };
  if (args.json) deps.out(JSON.stringify(view, null, 2) + '\n');
  else {
    const lines = ['Comprobación de lectura de HubSpot · portal de ensayo ' + args.portal + ' · NO escribe nada', '', 'Resultado: ' + (confirmed || result.state !== 'read_verified' ? headline(result) : 'NO CONFIRMADO: la respuesta no cumple todas las comprobaciones de seguridad'), ''];
    if (result.accountType) lines.push('Cuenta: portal ' + result.accountId + ' · tipo ' + result.accountType + ' (' + (result.environment === 'rehearsal' ? 'ensayo' : result.environment === 'real' ? 'REAL' : 'desconocido') + ')');
    for (const o of result.objects) lines.push('  ' + objectLine(o));
    if (result.retryAfterSeconds) lines.push('HubSpot pidió esperar ' + result.retryAfterSeconds + ' s antes de reintentar (no se reintenta automáticamente).');
    lines.push('', 'Peticiones realizadas: ' + stats.requests + ' de ' + LIVE_MAX_REQUESTS + (stats.blocked.length ? ' · BLOQUEADAS por el transporte: ' + stats.blocked.length + ' (' + stats.blocked.join(', ') + ')' : '') + (stats.truncated ? ' · respuestas truncadas por tope de tamaño: ' + stats.truncated : ''),
      'Comprobado: ' + result.checkedAt + ' · se considera reciente hasta ' + result.freshUntil + ' (' + READ_CHECK_TTL_MS / 60000 + ' min).',
      'Alcance: una comprobación puntual de LECTURA. No demuestra sincronización continua, ni permisos de escritura, ni que otros objetos o campos sean legibles.');
    deps.out(lines.join('\n') + '\n');
  }
  return confirmed ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runCli(process.argv.slice(2), { stdin: process.stdin, out: t => { process.stdout.write(t); }, err: t => { process.stderr.write(t); }, fetch }).then(code => { process.exitCode = code; }, () => { process.stderr.write('La comprobación terminó con un error inesperado; no se imprime el detalle por si contuviera datos de la petición.\n'); process.exitCode = 1; });
}
