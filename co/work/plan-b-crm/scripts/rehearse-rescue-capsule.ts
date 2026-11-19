import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { RescueRoom } from '../server/rescue-room.js';
import { comparisonReport, exportCapsule, importCapsule, inspectCapsule, openDestination, openKit, sideOf } from '../server/rescue-capsule.js';
import { scriptOrigin } from '../server/rescue-capsule-api.js';
import { createServer } from 'node:net';
// Ensayo de relevo por CLI (CLAUDE-RESCUE-KIT-116): recorre EXACTAMENTE el mismo contrato que la interfaz (exportar → inspeccionar → aprobar ligado al contenido → importar → abrir
// en un proceso nuevo → conciliar). La contraseña se lee de STDIN (nunca de argumentos ni entorno) y no se imprime. Datos ficticios; destino siempre en carpeta nueva.
//   echo <contraseña> | npx tsx scripts/rehearse-rescue-capsule.ts [--crash <paso>] [--now <ISO>]
// --crash <paso> termina el proceso con código 86 en ese paso (para ensayar interrupciones): export:captured | export:encrypted | export:before-publish | export:published |
// import:staging-created | import:bundle-restored | import:components-written | import:before-publish | import:published | import:first-start-ok
export interface RehearsalArgs { crash: string | null; now: number | null }
export function parseArgs(argv: string[]): RehearsalArgs {
  const out: RehearsalArgs = { crash: null, now: null };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i], next = argv[i + 1];
    if (/^--(password|pass|clave|secret)/i.test(flag)) throw new Error('La contraseña no se pasa por argumentos: se lee de la entrada estándar.');
    if (flag === '--crash' && next) { out.crash = next; i++; } else if (flag === '--now' && next) { const t = Date.parse(next); if (!Number.isFinite(t)) throw new Error('--now requiere una fecha ISO válida.'); out.now = t; i++; } else throw new Error('Argumento no admitido: ' + flag);
  }
  return out;
}
const freePort = () => new Promise<number>((ok, fail) => { const s = createServer(); s.once('error', fail); s.listen(0, '127.0.0.1', () => { const p = (s.address() as { port: number }).port; s.close(() => ok(p)); }); });
export async function rehearse(password: string, args: RehearsalArgs, log: (line: string) => void = line => console.log(line)) {
  const clock = args.now === null ? undefined : () => args.now!;
  const origin = RescueRoom.create(resolve('tests', '.tmp'), { clock }), kit = openKit(resolve('tests', '.tmp', 'rescue116-' + randomUUID())); if (clock) kit.clock = clock;
  kit.onStep = step => { log('STEP ' + step); if (args.crash === step) process.exit(86); };
  log('KIT ' + kit.dir); log('ORIGIN ' + origin.root);
  await scriptOrigin(origin); const originDigest = origin.logicalDigest();
  const exp = await exportCapsule(origin, password, kit); if (origin.logicalDigest() !== originDigest) throw new Error('El origen cambió al exportar.');
  const insp = await inspectCapsule(kit, exp.name, password);
  const imp = await importCapsule(kit, { name: exp.name, password, expectedSha256: insp.sha256, expectedRevision: insp.revision });
  const port = await freePort(), dest = await openDestination(imp.destination.folder, { port, now: args.now === null ? undefined : new Date(args.now).toISOString() });
  try {
    const get = async (path: string) => (await fetch(dest.url.replace(/\/$/, '') + path)).json() as Promise<any>; // eslint-disable-line @typescript-eslint/no-explicit-any
    const post = async (route: string, body: Record<string, unknown>) => { const s = await get('/api/rescue/state'); const r = await fetch(dest.url.replace(/\/$/, '') + '/api/rescue/' + route, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ idempotencyKey: 'k-' + randomUUID(), expectedVersion: s.version, context: s.context, ...body }) }); return { status: r.status, body: await r.json() as any }; }; // eslint-disable-line @typescript-eslint/no-explicit-any
    const s0 = await get('/api/rescue/state'), uncertain = s0.returnPlan.operations.find((o: { status: string }) => o.status === 'uncertain');
    if (!uncertain) throw new Error('El destino no conserva la operación incierta.');
    const wrong = await post('resolve', { planId: s0.returnPlan.id, operationId: uncertain.id, remoteId: 'crm-task-9999' });
    const cands = (await (await fetch(dest.url + 'api/rescue/candidates?planId=' + s0.returnPlan.id + '&operationId=' + uncertain.id)).json() as any).candidates; // eslint-disable-line @typescript-eslint/no-explicit-any
    const ok = await post('resolve', { planId: s0.returnPlan.id, operationId: uncertain.id, remoteId: cands[0].id }); const approve = await post('approve', { planId: s0.returnPlan.id }); const apply = await post('apply', { planId: s0.returnPlan.id });
    const end = await get('/api/rescue/state');
    const report = comparisonReport({ capsule: { sha256: exp.sha256, bytes: exp.bytes, revision: exp.revision, createdAt: exp.summary.createdAt }, origin: sideOf(origin), destination: { roomId: end.context.workspaceId, stage: end.stageLabel, version: end.version, revision: end.context.captureRevision, records: end.capture.records, changes: end.localChanges.length, journalEvents: end.journal.total, simRecords: end.crm.stats.records, simCreates: end.crm.stats.creates.length, simCreateCalls: end.crm.stats.calls.create, uncertain: 0, approvedPlan: false },
      retired: imp.retired, timings: [{ label: 'exportar', ms: exp.ms }, { label: 'importar', ms: imp.ms }], scope: 'El plan considera como máximo las 200 tareas visibles de la cola.' });
    const result = { ok: wrong.status === 409 && ok.status === 200 && approve.status === 200 && apply.body.result?.status === 'complete' && end.crm.stats.calls.create === 1 && end.crm.stats.duplicateCreates === 0,
      wrongIdRejected: wrong.status === 409, createCalls: end.crm.stats.calls.create, duplicates: end.crm.stats.duplicateCreates, records: end.crm.stats.records, finalStage: end.stage, capsule: { name: exp.name, bytes: exp.bytes, sha256: exp.sha256, revision: exp.revision }, destinationFolder: imp.destination.folder, ms: { export: exp.ms, import: imp.ms }, reportSections: report.json.sections.length };
    log('RESULT ' + JSON.stringify(result)); return result;
  } finally { await dest.stop(); origin.close(); }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = parseArgs(process.argv.slice(2)), password = readFileSync(0, 'utf8').replace(/\r?\n$/, '');
    if (!password) throw new Error('Escribe la contraseña del ensayo por la entrada estándar (por ejemplo: echo <contraseña> | npx tsx scripts/rehearse-rescue-capsule.ts).');
    const result = await rehearse(password, args); process.exitCode = result.ok ? 0 : 1;
  } catch (error) { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; }
}
