import { registerUndo } from './undo.js';
import Fastify, { type FastifyInstance } from 'fastify';
import staticPlugin from '@fastify/static';
import { existsSync } from 'node:fs';
import { z } from 'zod';
import { EntityNameSchema, entityNames, validateRecord, validateSpec, type AppState } from '../shared/model.js';
import { AppError, Store } from './store.js';
import { runtimeZip } from './exporter.js';
import { registerSecurity } from './security.js';
import { registerV2, type ExternalServices } from './v2.js';
import { randomUUID } from 'node:crypto';
import { registerV4 } from './v4.js';
import { registerResponseQueue } from './response-queue.js';
import { registerWorkspaceSearch, workspaceSearchIdentity } from './workspace-search.js';
import type { WorkspaceSearchContext } from '../shared/workspace-search.js';
import { registerLocalOperations } from './local-operations.js';
import { registerTaskRevision } from './task-revision.js';

/** Celda CSV entrecomillada. Una celda que una hoja de cálculo ejecutaría como fórmula (= + - @ o tabulador/retorno iniciales) se
 *  prefija con una comilla simple; los números, incluso negativos, no se tocan. */
export function csvCell(value: unknown) {
  const text = String(value ?? '');
  const formula = /^[=+\-@\t\r]/.test(text) && !/^-?\d+(\.\d+)?$/.test(text);
  return '"' + (formula ? "'" : '') + text.replace(/"/g, '""') + '"';
}
export interface AppOptions {
  dbPath: string; root: string; staticDir: string; runtime?: boolean;
  aiConfigured?: () => boolean; aiPublic?: () => AppState['aiSettings'];
  hubspotConfigured?: () => boolean;
  /** Enable only for launchers that enforce one cooperative writer per data directory. */
  taskRevisions?: boolean;
  external?:ExternalServices;
}
export async function createBaseApp(options: AppOptions): Promise<{ app: FastifyInstance; store: Store; security: ReturnType<typeof registerSecurity> }> {
  const store = new Store(options.dbPath);
  if(!store.get('instanceId',null))store.set('instanceId',randomUUID());
  if (options.runtime) store.set('disconnected', true);
  const app = Fastify({ logger: false, bodyLimit: 20 * 1024 * 1024, requestTimeout: 180000 });
  const security = registerSecurity(app,store);
  app.addHook('onClose', async () => { store.close(); });
  app.addHook('onRequest', async (request, reply) => {
    const host = request.headers.host ?? '';
    if (!/^(127\.0\.0\.1|localhost|\[::1\])(?::\d+)?$/i.test(host)) return reply.code(403).send({ error: 'Esta aplicación solo acepta acceso local.' });
    const origin = request.headers.origin;
    if (origin) {
      let allowed = false;
      try {
        const value = new URL(origin);
        allowed = value.protocol === 'http:' &&
          (value.host === host || ['127.0.0.1:5187', 'localhost:5187'].includes(value.host) && !options.runtime);
      } catch { /* Reject invalid Origin. */ }
      if (!allowed) return reply.code(403).send({ error: 'Origen no permitido.' });
    }
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('Referrer-Policy', 'no-referrer');
    reply.header('Cache-Control', 'no-store');
    reply.header('Content-Security-Policy', "default-src 'self'; connect-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; font-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
  });
  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof AppError) return reply.code(error.status).send({ error: error.message, details: error.details ?? null });
    if (error instanceof z.ZodError) return reply.code(422).send({ error: 'Revisa los datos enviados.', details: error.flatten() });
    const status = error && typeof error === 'object' && 'statusCode' in error ? Number(error.statusCode) : 500;
    return reply.code(status >= 400 && status < 500 ? status : 500).send({ error: status === 413 ? 'El archivo es demasiado grande.' : 'No se pudo completar la operación. La última copia válida sigue guardada.' });
  });
  const readState = async (): Promise<AppState & { workspaceSearchContext: WorkspaceSearchContext | null }> => ({
    snapshot: store.snapshot, spec: store.spec, generation: store.generation,
    reconciliation: store.reconciliation, disconnected: store.disconnected, runtime: !!options.runtime,
    ready: store.ready, changes: store.changesCount, usage: store.usage(),
    aiConfigured: !options.runtime && (options.aiConfigured?.() ?? false),
    hubspotConfigured: !options.runtime && (!!store.get('hubspotConnection',null)||(options.hubspotConfigured?.() ?? false)),
    lastError: store.get<string | null>('lastError', null),
    aiSettings: options.runtime ? null : options.aiPublic?.() ?? null
    ,candidate: store.candidate, workspaceSearchContext: workspaceSearchIdentity(store)
  });
  app.get('/api/state',readState);
  app.get('/api/v2/state',async()=>{
    const state=await readState();
    const compact=(snapshot:NonNullable<AppState['snapshot']>)=>({...snapshot,records:[],links:[]});
    return {...state,snapshot:state.snapshot?compact(state.snapshot):null,candidate:state.candidate?{...state.candidate,snapshot:compact(state.candidate.snapshot)}:null};
  });
  app.get('/api/records', async () => ({ records: store.records() }));
  app.get<{ Params: { entity: string } }>('/api/records/:entity', async request => {
    const entity = EntityNameSchema.parse(request.params.entity);
    return { records: store.records(entity) };
  });
  app.post<{ Params: { entity: string } }>('/api/records/:entity', async request => {
    const entity = EntityNameSchema.parse(request.params.entity);
    const body = z.object({ values: z.record(z.string(),z.union([z.string(), z.number().finite(), z.boolean(), z.null()])) }).strict().parse(request.body);
    // La identidad del cambio permite deshacer exactamente este guardado (CLAUDE-UNDO-LAST R2).
    let change: { id: number; at: string } | null = null;
    const record = store.saveRecord(entity, body.values, undefined, { onChange: value => { change = value; } });
    return { record, change };
  });
  app.patch<{ Params: { entity: string; id: string } }>('/api/records/:entity/:id', async request => {
    const entity = EntityNameSchema.parse(request.params.entity);
    const body = z.object({ values: z.record(z.string(),z.union([z.string(), z.number().finite(), z.boolean(), z.null()])) }).strict().parse(request.body);
    let change: { id: number; at: string } | null = null;
    const record = store.saveRecord(entity, body.values, request.params.id, { onChange: value => { change = value; } });
    return { record, change };
  });
  app.post('/api/activate', async request => {
    z.object({ reviewed: z.literal(true) }).strict().parse(request.body);
    store.activate(); return { ready: true };
  });
  app.post('/api/disconnect', async request => {
    const { disconnected } = z.object({ disconnected: z.boolean() }).strict().parse(request.body);
    if (options.runtime && !disconnected) throw new AppError(403, 'El paquete independiente no contiene conectores externos.');
    if(store.get('continuitySession',null)&&!disconnected)throw new AppError(409,'Cierra la sesión de continuidad antes de habilitar los servicios.');
    if (disconnected && !store.ready) throw new AppError(409, 'Activa una aplicación verificada antes de desconectar.');
    store.set('disconnected', disconnected);
    return { disconnected };
  });
  app.get('/api/changes', async () => ({ changes: store.changes() }));
  app.post('/api/probe', async () => {
    const spec = store.spec, snapshot = store.snapshot, generation = store.generation;
    const records = store.records();
    const ruleErrors = spec && snapshot && generation ? validateSpec(spec, snapshot, generation.prompt) : ['Falta una aplicación generada.'];
    const dataErrors = spec ? records.flatMap(record => Object.values(validateRecord(spec, record))) : ['Falta una especificación.'];
    const probeValue = new Date().toISOString();
    store.transaction(() => store.set('lastProbe', probeValue));
    const checks = [
      { id: 'snapshot', label: 'Captura completa y relaciones conciliadas', passed: !!store.reconciliation?.complete },
      { id: 'schema', label: 'Especificación y reglas verificadas', passed: !!spec && ruleErrors.length === 0 },
      { id: 'data', label: 'Registros compatibles con la aplicación', passed: !!spec && dataErrors.length === 0 },
      { id: 'persistence', label: 'Lectura y escritura en SQLite local', passed: store.get('lastProbe', '') === probeValue },
      { id: 'disconnected', label: 'Servicios externos desconectados', passed: store.disconnected },
      { id: 'approved', label: 'Reglas revisadas y aplicación activada', passed: store.ready }
    ];
    return { passed: checks.every(c => c.passed), checks, at: probeValue,
      note: 'Esta comprobación local no sustituye las pruebas automatizadas de reinicio y bloqueo de red incluidas en la entrega.' };
  });
  app.get('/api/export/bundle', async (_request, reply) =>
    { if(store.snapshot?.source.isTestData!==true)throw new AppError(403,'Usa una exportación cifrada para datos reales.');
      return reply.header('Content-Disposition', 'attachment; filename="plan-b-continuidad.json"').send(store.bundle()); });
  app.get<{ Querystring: { format?: string } }>('/api/export/changes', async (request, reply) => {
    const changes = store.changes();
    if (request.query.format === 'csv') {
      const rows = [['fecha', 'entidad', 'id', 'operacion', 'antes_json', 'despues_json'],
        ...changes.map(c => [c.at, c.entity, c.recordId, c.operation, JSON.stringify(c.before), JSON.stringify(c.after)])];
      return reply.type('text/csv; charset=utf-8').header('Content-Disposition', 'attachment; filename="plan-b-cambios.csv"')
        .send('\uFEFF' + rows.map(row => row.map(csvCell).join(',')).join('\r\n'));
    }
    return reply.header('Content-Disposition', 'attachment; filename="plan-b-cambios.json"').send({ exportedAt: new Date().toISOString(), changes });
  });
  app.get('/api/export/package', async (_request, reply) => {
    const zip = await runtimeZip(store.bundle(), options.root);
    return reply.type('application/zip').header('Content-Disposition', 'attachment; filename="Plan-B-independiente.zip"').send(zip);
  });
  registerV2(app,store,options.root,!!options.runtime,options.external);
  registerV4(app,store,!!options.runtime);
  registerResponseQueue(app,store);
  registerUndo(app,store);
  registerWorkspaceSearch(app,store);
  registerLocalOperations(app,store);
  if (options.taskRevisions) registerTaskRevision(app,store);
  if (existsSync(options.staticDir)) {
    await app.register(staticPlugin, { root: options.staticDir, prefix: '/', decorateReply: true });
    app.setNotFoundHandler((request, reply) => {
      if (request.url.startsWith('/api/')) return reply.code(404).send({ error: 'Operación no disponible en esta aplicación.' });
      return reply.sendFile('index.html');
    });
  }
  return { app, store, security };
}
