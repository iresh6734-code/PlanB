import Fastify, { type FastifyInstance } from 'fastify';
import staticPlugin from '@fastify/static';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:net';
import type { RescueRoom } from './rescue-room.js';
import { comparisonReport, exportCapsule, importCapsule, inspectCapsule, openDestination, sideOf, type ExportResult, type ImportResult, type Kit, type Opened } from './rescue-capsule.js';
import { STAGE_POLICY, BANNER, NOT_PROVEN, CapsuleError, type CompareSide } from '../shared/rescue-capsule.js';
import { RescueError } from '../shared/rescue-room.js';
// API propia del Kit de Relevo (servidor en loopback; nunca se monta en los del producto). Mismo contrato que usa el CLI de ensayo: sin una vía más permisiva.
// La contraseña solo llega en el CUERPO de una petición local; no se registra, no se devuelve y no aparece en errores, URL, manifiesto ni almacenamiento del navegador.
const NAME = z.string().regex(/^[A-Za-z0-9._-]{8,100}\.capsule$/), PASS = z.string().min(1).max(400), HEX = z.string().regex(/^[0-9a-f]{64}$/);
const schemas = {
  export: z.object({ password: PASS }).strict(), inspect: z.object({ name: NAME, password: PASS }).strict(), seed: z.object({}).strict(),
  import: z.object({ name: NAME, password: PASS, expectedSha256: HEX, expectedRevision: HEX }).strict(), open: z.object({ folder: z.string().regex(/^rescue106-[0-9a-f-]{36}$/) }).strict(),
};
/** Control de la demo: lleva el ORIGEN al estado de interés (trabajo local → CRM vuelve → conflicto decidido → acuse perdido → aprobar y aplicar ⇒ create incierto) con la API normal de la sala. */
export async function scriptOrigin(room: RescueRoom) {
  const env = () => { const v = room.view(); if (v.blocked) throw new RescueError(409, 'RESCUE_CORRUPT', 'La sala de origen está bloqueada.'); return { idempotencyKey: 'k-' + randomUUID(), expectedVersion: v.version, context: v.context }; };
  const v0 = room.view(); if (v0.blocked || v0.stage !== 'preparation') throw new CapsuleError(409, 'ORIGIN_NOT_FRESH', 'El origen ya tiene trabajo: el guion solo parte de una sala recién abierta.');
  const day = (n: number) => new Date(Date.parse(v0.incident.now.slice(0, 10) + 'T00:00:00Z') + n * 86_400_000).toISOString().slice(0, 10);
  await room.choosePlan({ ...env(), budgetMinutes: 60 }); await room.loadScriptEstimates(env());
  await room.editTask({ ...env(), taskId: 'task-4', values: { status: 'completed' } }); await room.editTask({ ...env(), taskId: 'task-5', values: { due_date: day(4) } });
  await room.createTask({ ...env(), values: { subject: 'Confirmar entrega con el cliente', due_date: day(2), status: 'pending' } });
  await room.crmReturn(env()); const planId = ((await room.prepareReturn(env())).result as { planId: string }).planId;
  const plan = (room.view() as { returnPlan: { operations: { id: string; fields: { conflict: boolean }[] }[] } }).returnPlan, op = plan.operations.find(o => o.fields.some(f => f.conflict))!;
  await room.decide({ ...env(), planId, decisions: [{ operationId: op.id, field: 'due_date', decision: 'local' }] }); await room.armLostAck({ ...env(), armed: true }); await room.approve({ ...env(), planId }); await room.apply({ ...env(), planId });
}
export interface CapsuleServerOptions { staticDir?: string; destDist?: string; now?: string }
const freePort = () => new Promise<number>((ok, fail) => { const s = createServer(); s.once('error', fail); s.listen(0, '127.0.0.1', () => { const p = (s.address() as { port: number }).port; s.close(() => ok(p)); }); });
export async function createCapsuleServer(origin: RescueRoom, kit: Kit, options: CapsuleServerOptions = {}): Promise<{ app: FastifyInstance; stop: () => Promise<void> }> {
  const app = Fastify({ logger: false, bodyLimit: 100_000, requestTimeout: 120_000 });
  const exports = new Map<string, ExportResult>(), imports = new Map<string, ImportResult>(), opened = new Map<string, Opened>(); let busy = false;
  app.addHook('onRequest', async (request, reply) => {
    const host = request.headers.host ?? '';
    if (!/^(127\.0\.0\.1|localhost|\[::1\])(?::\d+)?$/i.test(host)) return reply.code(403).send({ error: 'El kit solo acepta acceso local.', code: 'HOST_NOT_ALLOWED' });
    const originHeader = request.headers.origin; if (originHeader) { let ok = false; try { const u = new URL(originHeader); ok = u.protocol === 'http:' && u.host === host; } catch { /* inválido */ } if (!ok) return reply.code(403).send({ error: 'Origen no permitido.', code: 'ORIGIN_NOT_ALLOWED' }); }
    reply.header('X-Content-Type-Options', 'nosniff'); reply.header('Referrer-Policy', 'no-referrer'); reply.header('Cache-Control', 'no-store');
    reply.header('Content-Security-Policy', "default-src 'self'; connect-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
  });
  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof CapsuleError) return reply.code(error.status).send({ error: error.message, code: error.code, details: error.details ?? null });
    if (error instanceof RescueError) return reply.code(error.status).send({ error: error.message, code: error.code, details: error.details ?? null });
    if (error instanceof z.ZodError) return reply.code(422).send({ error: 'Revisa los datos enviados.', code: 'INVALID_INPUT', details: null });
    const status = error && typeof error === 'object' && 'statusCode' in error ? Number(error.statusCode) : 500;
    return reply.code(status >= 400 && status < 500 ? status : 500).send({ error: status === 413 ? 'La petición es demasiado grande.' : 'No se pudo completar la operación. El origen no se ha modificado.', code: status === 413 ? 'TOO_LARGE' : 'INTERNAL' });
  });
  const claimInfo = (name: string) => { try { return JSON.parse(readFileSync(kit.capsules + '/' + name + '.import-claim', 'utf8')) as { status: string; destination?: string }; } catch { return null; } };
  const originView = () => { const v = origin.view(); if (v.blocked) throw new RescueError(409, 'RESCUE_CORRUPT', 'La sala de origen está bloqueada por integridad.'); return v; };
  app.get('/api/capsule/state', async () => {
    const v = originView(), plan = v.returnPlan, side = sideOf(origin);
    return { banner: BANNER, origin: { ...side, stageKey: v.stage, policy: STAGE_POLICY[v.stage].onImport, approvedPlan: plan?.status === 'approved', uncertainOps: plan?.operations.filter(o => o.status === 'uncertain').map(o => ({ id: o.id, label: o.label })) ?? [], planScope: v.plan ? v.plan.considered + ' tareas consideradas de ' + v.queue.summary.totalQueued + (v.plan.notConsidered ? ' (la cola devuelve como máximo 200)' : '') : 'Sin plan elegido' },
      capsules: readdirSync(kit.capsules).filter(n => n.endsWith('.capsule')).sort().map(name => ({ name, imported: claimInfo(name)?.status === 'imported', destination: claimInfo(name)?.destination ? 'rescue106-' + claimInfo(name)!.destination : null, export: exports.get(name) ? { bytes: exports.get(name)!.bytes, sha256: exports.get(name)!.sha256, revision: exports.get(name)!.revision } : null })),
      opened: [...opened.entries()].map(([folder, o]) => ({ folder, url: o.url })), limits: ['Un solo escritor local por carpeta.', 'El plan considera como máximo las 200 tareas visibles.', 'Diario: 5000 hechos.'], notProven: NOT_PROVEN };
  });
  app.post('/api/capsule/seed-origin', async request => { schemas.seed.parse(request.body); if (busy) throw new CapsuleError(409, 'BUSY', 'Hay otra operación en curso.'); busy = true; try { await scriptOrigin(origin); return { ok: true }; } finally { busy = false; } });
  const guarded = async <T>(fn: () => Promise<T>) => { if (busy) throw new CapsuleError(409, 'BUSY', 'Hay otra operación en curso.'); busy = true; try { return await fn(); } finally { busy = false; } };
  app.post('/api/capsule/export', async request => { const b = schemas.export.parse(request.body); const r = await guarded(() => exportCapsule(origin, b.password, kit)); exports.set(r.name, r); return { ok: true, ...r }; });
  app.post('/api/capsule/inspect', async request => { const b = schemas.inspect.parse(request.body); return { ok: true, ...(await guarded(() => inspectCapsule(kit, b.name, b.password))) }; });
  app.post('/api/capsule/import', async request => { const b = schemas.import.parse(request.body); const r = await guarded(() => importCapsule(kit, b)); imports.set(b.name, r); return { ok: true, ...r }; });
  app.post('/api/capsule/open', async request => {
    const b = schemas.open.parse(request.body); if (opened.has(b.folder)) return { ok: true, url: opened.get(b.folder)!.url, reused: true };
    const port = await freePort(), o = await openDestination(b.folder, { port, dist: options.destDist, now: options.now }); opened.set(b.folder, o); return { ok: true, url: o.url, reused: false };
  });
  const sideFromState = async (url: string): Promise<CompareSide> => {
    const s = await (await fetch(url.replace(/\/$/, '') + '/api/rescue/state')).json() as { context: { workspaceId: string; captureRevision: string }; stageLabel: string; version: number; capture: { records: number }; localChanges: unknown[]; journal: { total: number }; crm: { stats: { records: number; creates: unknown[]; calls: { create: number } } }; returnPlan: { status: string; operations: { status: string }[] } | null };
    return { roomId: s.context.workspaceId, stage: s.stageLabel, version: s.version, revision: s.context.captureRevision, records: s.capture.records, changes: s.localChanges.length, journalEvents: s.journal.total, simRecords: s.crm.stats.records, simCreates: s.crm.stats.creates.length, simCreateCalls: s.crm.stats.calls.create, uncertain: s.returnPlan?.operations.filter(o => o.status === 'uncertain').length ?? 0, approvedPlan: s.returnPlan?.status === 'approved' };
  };
  const report = async (name: string) => {
    const exp = exports.get(name), imp = imports.get(name); if (!exp) throw new CapsuleError(404, 'NO_REPORT', 'Exporta una cápsula en esta sesión para generar su informe.');
    const dest = imp && opened.get(imp.destination.folder) ? await sideFromState(opened.get(imp.destination.folder)!.url) : null;
    return comparisonReport({ capsule: { sha256: exp.sha256, bytes: exp.bytes, revision: exp.revision, createdAt: exp.summary.createdAt }, origin: sideOf(origin), destination: dest, retired: imp?.retired ?? [], timings: [{ label: 'exportar', ms: exp.ms }, ...(imp ? [{ label: 'importar', ms: imp.ms }] : [])], scope: exp.summary.simCreates >= 0 ? 'El plan considera como máximo las 200 tareas visibles de la cola; los recuentos cubren todo el inventario.' : '' });
  };
  const q = z.object({ name: NAME }).strict();
  app.get('/api/capsule/report.json', async (request, reply) => reply.header('Content-Type', 'application/json; charset=utf-8').header('Content-Disposition', 'attachment; filename="informe-relevo.json"').send(JSON.stringify((await report(q.parse(request.query).name)).json, null, 2)));
  app.get('/api/capsule/report.html', async (request, reply) => reply.header('Content-Type', 'text/html; charset=utf-8').header('Content-Disposition', 'attachment; filename="informe-relevo.html"').send((await report(q.parse(request.query).name)).html));
  app.get('/api/capsule/health', async () => ({ ok: true, roomId: originView().context.workspaceId, id: randomUUID().slice(0, 8) }));
  if (options.staticDir && existsSync(options.staticDir)) await app.register(staticPlugin, { root: options.staticDir, prefix: '/' });
  const stop = async () => { for (const o of opened.values()) { try { await o.stop(); } catch { /* ya terminó */ } } await app.close(); };
  return { app, stop };
}
