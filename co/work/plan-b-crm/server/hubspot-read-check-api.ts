import { createHash } from 'node:crypto';
import type { FastifyInstance, FastifyReply } from 'fastify';
import { checkHubspotRead } from './hubspot-read-check.js';
import { guardedReadFetch, LIVE_MAX_REQUESTS } from './hubspot-read-check-transport.js';
import { READ_CHECK_ENTITIES, READ_CHECK_TTL_MS, viewOfReadCheck, type ReadCheckResult, type ReadCheckView } from '../shared/hubspot-read-check.js';
import {
  READ_CHECK_API_FORMAT, READ_CHECK_AUTHORIZED_READS, READ_CHECK_ISSUE_MESSAGES, READ_CHECK_ROUTE, ReadCheckEvidenceSchema, ReadCheckPostBodySchema,
  type ReadCheckApiState, type ReadCheckEvidence, type ReadCheckIssue,
} from '../shared/hubspot-read-check-api.js';

// API PROTEGIDA de comprobación de lectura de HubSpot (unidad 212). Un instalador de rutas con dependencias inyectadas, pensado para createBaseApp:
// hereda su comprobación de host y Origin y el bloqueo por sesión de todo `/api/*`. NO se registra sola en ningún arranque y no crea otra base de datos
// ni otro almacén de credenciales: la configuración se LEE de quien ya la guarda (`deps.config`, en el montaje real `Continuity.connection()`).
//
// GET  → solo evidencia ya guardada + vista de actualidad. Jamás llama al proveedor: abrir o recargar Integraciones no genera tráfico.
// POST → acción explícita: sesión, Origin del mismo host, portal y cinco lecturas confirmados, cuenta de ensayo. Una comprobación en curso por
//        configuración (doble clic o segunda pestaña ⇒ 202 sin lecturas nuevas). Identidad primero y después cuatro objetos de un elemento; máximo 5 GET,
//        cada ruta una vez, sin escritura, redirección, paginación ni reintento (transporte de 173, tope de 64 KiB sin entregar prefijos).
// DELETE → cancela la comprobación en curso y descarta su resultado.
//
// CONFIGURACIÓN CAMBIANTE. La evidencia queda ligada a una REVISIÓN derivada de portal + modo + huella de la credencial (+ `version` opcional del propietario).
// Se vuelve a leer la configuración antes de CADA petición al proveedor, antes de publicar y al servir el estado. Si cambió: no sale ninguna petición más,
// las que ya estuvieran en vuelo se abortan y su respuesta se descarta (no pueden «recordarse» en la red, pero nunca se publican) y la evidencia anterior pasa
// a historia (`invalidated`): no acredita la configuración nueva. Una respuesta tardía de la configuración antigua no confirma la nueva.

export interface ReadCheckConfig { token: string; accountId: string; mode: 'test' | 'production_readonly'; /** Contador o sello opcional del propietario de la configuración: si cambia, la evidencia se invalida aunque la credencial sea la misma. */ version?: string }
/** Lo único que se persiste: la evidencia PÚBLICA (lista blanca, sin credencial) y la revisión de configuración a la que corresponde. */
export interface StoredReadCheck { format: 'planb-hubspot-read-check-stored-v1'; configRevision: string; evidence: ReadCheckEvidence }
export interface ReadCheckEvidenceStore { load(): StoredReadCheck | null; save(value: StoredReadCheck): void }
export interface ReadCheckApiDeps {
  /**
   * OBLIGATORIA y con fallo cerrado. Se llama SÍNCRONAMENTE al entrar en POST con la cabecera `Cookie` de la solicitud y devuelve una comprobación de vigencia de ESA autorización
   * (en el montaje real: `security.captureAuthorization` de `createBaseApp`). Se vuelve a invocar tras cualquier espera, inmediatamente antes de cada petición al proveedor y antes de
   * persistir o devolver el resultado. Si devuelve `false` (sesión revocada o caducada) o lanza, el recorrido se corta y se descarta sin exponer evidencia a esa sesión.
   */
  captureAuthorization(cookieHeader?: string): () => boolean;
  /** ÚNICA fuente de verdad de la configuración. Puede lanzar: se trata como «ilegible», sin tráfico y sin copiar el error. */
  config(): ReadCheckConfig | null;
  evidence: ReadCheckEvidenceStore;
  fetch?: typeof fetch; now?: () => number;
  /** Plazo por petición (1–15 s; 8 s por defecto). */
  timeoutMs?: number;
  /** Por defecto solo cuentas de ensayo. Poner `true` exige una decisión y una autorización específicas de producción. */
  allowProduction?: boolean;
}
export interface ReadCheckApiHandle {
  /** Cancela la comprobación en curso y descarta su resultado. Devuelve si había una. */
  cancel(): boolean;
  /** A llamar cuando se guarda o retira la configuración: aborta lo que esté en vuelo y descarta su resultado. */
  invalidate(): void;
  running(): boolean;
}

const sha = (text: string) => createHash('sha256').update(text).digest('hex');
/** Revisión de configuración: portal + modo + huella (no reversible) de la credencial + sello opcional. Nunca sale del servidor. */
export const readCheckRevision = (config: ReadCheckConfig) => sha(['planb-hubspot-read-config-v1', config.accountId, config.mode, sha(config.token), config.version ?? ''].join('\0'));

/** Adaptador mínimo sobre el almacén local existente (clave propia, valor JSON sin secretos). No crea tablas ni bases nuevas. */
export function storeReadCheckEvidence(store: { get<T>(key: string, fallback: T): T; set(key: string, value: unknown): unknown }, key = 'hubspotReadCheck'): ReadCheckEvidenceStore {
  return {
    load() {
      const raw = store.get<unknown>(key, null); if (raw === null) return null;
      const value = raw as Partial<StoredReadCheck>, evidence = ReadCheckEvidenceSchema.safeParse(value?.evidence);
      if (!value || value.format !== 'planb-hubspot-read-check-stored-v1' || typeof value.configRevision !== 'string' || !/^[a-f0-9]{64}$/.test(value.configRevision) || !evidence.success) throw new Error('evidence-unreadable');
      return { format: value.format, configRevision: value.configRevision, evidence: evidence.data };
    },
    save(value) { store.set(key, value); },
  };
}

interface Run { revision: string; startedAt: number; controller: AbortController; reason: 'config-changed' | 'cancelled' | 'unauthorized' | null; settled: Promise<void>; authorized: () => boolean }
const UNAUTHORIZED_BODY = { error: 'Desbloquea tu copia local para continuar.' };
/** Valor de `Retry-After` normalizado para el contrato público: entero 1–3600 o `null` (fraccionarios y no válidos nunca llegan al registro tal cual). */
const normalizeRetry = (value: number | null): number | null => value !== null && Number.isFinite(value) && value > 0 ? Math.min(3600, Math.max(1, Math.ceil(value))) : null;
/**
 * Coherencia SEMÁNTICA de una evidencia con la configuración vigente y el reloj (no basta la forma). `null` = coherente. Se aplica al escribir y al servir:
 * una positiva exige mismo portal y entorno, exactamente cinco peticiones, las cuatro entidades distintas y legibles, cero bloqueos o truncados y la ventana de
 * actualidad definida (15 min exactos desde la observación); una observación futura nunca se acredita.
 */
export function inspectReadCheckEvidence(evidence: ReadCheckEvidence, config: ReadCheckConfig, now: number): string | null {
  const checked = Date.parse(evidence.checkedAt), until = Date.parse(evidence.freshUntil);
  if (!Number.isFinite(checked) || !Number.isFinite(until) || until - checked !== READ_CHECK_TTL_MS) return 'ventana';
  if (checked > now) return 'futura';
  const entities = evidence.objects.map(object => object.entity);
  if (new Set(entities).size !== entities.length) return 'objetos-repetidos';
  const environment = config.mode === 'production_readonly' ? 'real' : 'rehearsal';
  if (evidence.state === 'read_verified' || evidence.state === 'partial') {
    if (evidence.portalId !== config.accountId || evidence.accountType === null || evidence.environment !== environment) return 'portal-o-entorno';
    if (evidence.requests !== LIVE_MAX_REQUESTS || entities.length !== READ_CHECK_ENTITIES.length || READ_CHECK_ENTITIES.some(entity => !entities.includes(entity))) return 'recorrido-incompleto';
    const readable = evidence.objects.filter(object => object.outcome === 'readable').length;
    if (evidence.state === 'read_verified' && (readable !== READ_CHECK_ENTITIES.length || evidence.truncated !== 0 || evidence.blocked !== 0)) return 'positiva-no-pura';
    if (evidence.state === 'partial' && (readable === 0 || readable === READ_CHECK_ENTITIES.length)) return 'parcial-incoherente';
  } else if (evidence.state === 'identity_mismatch' || evidence.state === 'account_type_mismatch') {
    if (evidence.objects.length !== 0) return 'objetos-tras-parada';
  }
  return null;
}
const clampTimeout = (value: number | undefined) => Math.min(15_000, Math.max(1_000, Math.round(value ?? 8_000)));
const asResult = (evidence: ReadCheckEvidence): ReadCheckResult => ({
  state: evidence.state, evidence: evidence.state === 'unavailable' && evidence.accountType === null && evidence.objects.length === 0 ? 'none' : 'provider_response', environment: evidence.environment,
  accountId: evidence.portalId, accountType: evidence.accountType, checkedAt: evidence.checkedAt, freshUntil: evidence.freshUntil, objects: evidence.objects, retryAfterSeconds: evidence.retryAfterSeconds, message: evidence.message,
});
const sameOrigin = (origin: string | undefined, host: string | undefined) => {
  if (!origin || !host) return false;
  try { const url = new URL(origin); return url.protocol === 'http:' && url.host === host; } catch { return false; }
};

export function registerHubspotReadCheckApi(app: FastifyInstance, deps: ReadCheckApiDeps): ReadCheckApiHandle {
  if (typeof deps.captureAuthorization !== 'function') throw new Error('captureAuthorization es obligatoria: sin ella la comprobación no puede vincularse a la sesión que la inicia.');
  const clock = deps.now ?? Date.now, timeoutMs = clampTimeout(deps.timeoutMs), allowProduction = deps.allowProduction === true;
  let slot: Run | null = null;
  const readConfig = (): { ok: true; config: ReadCheckConfig | null } | { ok: false } => {
    try {
      const config = deps.config();
      if (config && (typeof config.token !== 'string' || config.token.length < 10 || !/^\d{1,20}$/.test(config.accountId) || (config.mode !== 'test' && config.mode !== 'production_readonly'))) return { ok: false };
      return { ok: true, config };
    } catch { return { ok: false }; }   // el motivo concreto puede llevar rutas o datos: no se conserva
  };
  const abortRun = (run: Run, reason: 'config-changed' | 'cancelled' | 'unauthorized') => { run.reason ??= reason; run.controller.abort(); };
  // Fallo cerrado: sin dependencia válida, una excepción o un `false` significan «no autorizado».
  const captureAuth = (cookie: string | undefined): (() => boolean) => {
    try { const check = deps.captureAuthorization(cookie); return () => { try { return check() === true; } catch { return false; } }; } catch { return () => false; }
  };
  const unreadableView = (): ReadCheckView => ({ state: 'unavailable', fresh: false, label: 'Configuración no legible', detail: READ_CHECK_ISSUE_MESSAGES.CONFIG_UNREADABLE, environment: 'unknown', checkedAt: null });

  /** Estado PÚBLICO ahora. No hace ninguna petición al proveedor: solo lee configuración y evidencia locales. */
  function state(extra: { issue?: ReadCheckIssue; started?: boolean } = {}): ReadCheckApiState {
    const cfg = readConfig(), now = clock();
    let stored: StoredReadCheck | null = null, evidenceUnreadable = false;
    try { stored = deps.evidence.load(); } catch { evidenceUnreadable = true; }
    const config = cfg.ok ? cfg.config : null, revision = config ? readCheckRevision(config) : null;
    const sameRevision = !!stored && !!revision && stored.configRevision === revision;
    // Evidencia de ESTA configuración: solo se sirve si además es coherente (portal, entorno, recorrido, ventana y reloj). Si no, es evidencia MALFORMADA (≠ falta de evidencia).
    const inconsistent = sameRevision && !!config && inspectReadCheckEvidence(stored!.evidence, config, now) !== null;
    const current = sameRevision && !inconsistent ? stored!.evidence : null;
    // Una comprobación guardada para OTRA configuración es historia válida: se declara, pero jamás acredita la actual.
    const invalidated = stored && !sameRevision ? { checkedAt: stored.evidence.checkedAt, portalId: stored.evidence.portalId, state: stored.evidence.state } : null;
    if (slot && slot.revision !== revision && !slot.controller.signal.aborted) abortRun(slot, 'config-changed');   // la configuración cambió con una comprobación en vuelo
    if (slot && !slot.controller.signal.aborted && !slot.authorized()) abortRun(slot, 'unauthorized');            // la sesión que la inició ya no está autorizada
    const running = !!slot && slot.revision === revision && !slot.controller.signal.aborted;
    const production = config?.mode === 'production_readonly';
    const issue: ReadCheckIssue | null = extra.issue ?? (!cfg.ok ? 'CONFIG_UNREADABLE' : evidenceUnreadable ? 'EVIDENCE_UNREADABLE' : inconsistent ? 'EVIDENCE_INCONSISTENT' : null);
    return {
      format: READ_CHECK_API_FORMAT, configured: !!config,
      portal: config ? { id: config.accountId, mode: production ? 'production' : 'rehearsal' } : null,
      consent: { reads: READ_CHECK_AUTHORIZED_READS, writes: 0, freshnessMinutes: READ_CHECK_TTL_MS / 60_000, allowed: !!config && (!production || allowProduction), reason: production && !allowProduction ? READ_CHECK_ISSUE_MESSAGES.PRODUCTION_NOT_AUTHORIZED : null },
      running: running && slot ? { since: new Date(slot.startedAt).toISOString() } : null,
      view: !cfg.ok ? unreadableView() : viewOfReadCheck({ configured: !!config, checking: running, last: current ? asResult(current) : null, now }),
      evidence: current, invalidated, issue, message: issue ? READ_CHECK_ISSUE_MESSAGES[issue] : null,
      ...(extra.started === undefined ? {} : { started: extra.started }),
    };
  }
  const noStore = { exposeHeadRoute: false, onSend: async (_request: unknown, reply: FastifyReply, payload: unknown) => { reply.header('Cache-Control', 'no-store').header('Pragma', 'no-cache'); return payload; } } as const;
  const hasBody = (request: { headers: Record<string, unknown> }) => !!request.headers['transfer-encoding'] || Number(request.headers['content-length'] ?? 0) !== 0;

  app.get(READ_CHECK_ROUTE, noStore, async (request, reply) => {
    if (hasBody(request)) return reply.code(422).send(state({ issue: 'INVALID_REQUEST' }));
    return state();
  });

  app.delete(READ_CHECK_ROUTE, noStore, async (request, reply) => {
    if (!sameOrigin(request.headers.origin, request.headers.host)) return reply.code(403).send(state({ issue: 'ORIGIN_REQUIRED' }));
    if (slot && !slot.controller.signal.aborted) abortRun(slot, 'cancelled');
    return state();
  });

  app.post(READ_CHECK_ROUTE, noStore, async (request, reply) => {
    // La autorización se captura SÍNCRONAMENTE al entrar (antes de cualquier espera) y se revalida en cada frontera: una sesión revocada no puede terminar lo que inició.
    const authorized = captureAuth(request.headers.cookie);
    if (!authorized()) return reply.code(401).send(UNAUTHORIZED_BODY);
    if (!sameOrigin(request.headers.origin, request.headers.host)) return reply.code(403).send(state({ issue: 'ORIGIN_REQUIRED' }));
    const body = ReadCheckPostBodySchema.safeParse(request.body);
    if (!body.success) return reply.code(422).send(state({ issue: 'INVALID_REQUEST' }));
    // Se espera a que termine una comprobación abortada (sus peticiones en vuelo ya no cuentan) antes de iniciar otra; una viva para esta misma configuración se une, no se repite.
    let config: ReadCheckConfig, revision: string;
    for (;;) {
      const cfg = readConfig();
      if (!cfg.ok) return reply.code(503).send(state({ issue: 'CONFIG_UNREADABLE' }));
      if (!cfg.config) return reply.code(409).send(state({ issue: 'NOT_CONFIGURED' }));
      if (cfg.config.accountId !== body.data.portalId) return reply.code(409).send(state({ issue: 'PORTAL_MISMATCH' }));
      if (cfg.config.mode === 'production_readonly' && !allowProduction) return reply.code(403).send(state({ issue: 'PRODUCTION_NOT_AUTHORIZED' }));
      config = cfg.config; revision = readCheckRevision(config);
      if (!slot) break;
      if (!slot.controller.signal.aborted && slot.revision === revision) return reply.code(202).send(state({ issue: 'ALREADY_RUNNING', started: false }));
      if (!slot.controller.signal.aborted) abortRun(slot, 'config-changed');
      await slot.settled;
      if (!authorized()) return reply.code(401).send(UNAUTHORIZED_BODY);   // tras esperar la ranura
    }
    // A partir de aquí, sin esperas hasta registrar la comprobación: dos solicitudes no pueden entrar a la vez.
    const run: Run = { revision, startedAt: clock(), controller: new AbortController(), reason: null, settled: Promise.resolve(), authorized };
    let finish!: () => void; run.settled = new Promise<void>(resolve => { finish = resolve; });
    slot = run;
    const guard = guardedReadFetch(deps.fetch ?? fetch);
    const superseded = () => { const cfg = readConfig(); return !cfg.ok || !cfg.config || readCheckRevision(cfg.config) !== revision; };
    const fetcher = (async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
      // Última puerta antes de CADA petición al proveedor: si la configuración cambió o se canceló, no sale ninguna más.
      if (!authorized()) { abortRun(run, 'unauthorized'); throw new Error('SUPERSEDED'); }
      if (run.controller.signal.aborted || slot !== run || superseded()) { abortRun(run, run.reason ?? 'config-changed'); throw new Error('SUPERSEDED'); }
      return guard.fetch(input, init);
    }) as typeof fetch;
    let result: ReadCheckResult | null = null, published: ReadCheckEvidence | null = null, saveFailed = false, inconsistent = false;
    try {
      result = await checkHubspotRead({ token: config.token, accountId: config.accountId, mode: config.mode },
        { fetcher, now: clock, timeoutMs, signal: AbortSignal.any([run.controller.signal, AbortSignal.timeout(timeoutMs * LIVE_MAX_REQUESTS + 5_000)]) });
      // PUERTA DE PUBLICACIÓN (síncrona: sin esperas entre comprobarla y guardar): solo se publica lo que sigue siendo de la configuración vigente.
      if (!run.controller.signal.aborted && run.reason === null && slot === run && authorized() && !superseded()) {
        const stats = guard.stats();
        let status = result.state;
        // Defensa en profundidad: con una respuesta truncada o una petición bloqueada nunca se acredita lectura completa.
        if (status === 'read_verified' && (stats.blocked.length > 0 || stats.truncated > 0)) status = 'unavailable';
        const evidence: ReadCheckEvidence = {
          checkedAt: result.checkedAt, freshUntil: result.freshUntil, state: status, environment: result.environment, accountType: result.accountType, portalId: result.accountId,
          objects: result.objects.map(object => ({ entity: object.entity, outcome: object.outcome, httpStatus: object.httpStatus })), retryAfterSeconds: normalizeRetry(result.retryAfterSeconds),
          requests: Math.min(stats.requests, LIVE_MAX_REQUESTS), truncated: Math.min(stats.truncated, LIVE_MAX_REQUESTS), blocked: Math.min(stats.blocked.length, 32),
          durationMs: Math.max(0, Math.min(600_000, clock() - run.startedAt)),
          message: status === result.state ? result.message.slice(0, 400) : 'Hubo respuestas truncadas o peticiones bloqueadas: no se acredita lectura completa.',
        };
        // Lo que se escribe tiene que poder leerse y acreditarse con el contrato público: forma Y coherencia. Si no, no se persiste ni se presenta como lectura.
        const parsedEvidence = ReadCheckEvidenceSchema.safeParse(evidence);
        if (!parsedEvidence.success || inspectReadCheckEvidence(evidence, config, clock()) !== null) inconsistent = true;
        else { try { deps.evidence.save({ format: 'planb-hubspot-read-check-stored-v1', configRevision: revision, evidence }); published = evidence; } catch { saveFailed = true; } }
      }
    } finally {
      if (slot === run) slot = null;
      finish();
    }
    // Frontera final: si la sesión ya no está autorizada no se devuelve NADA de lo comprobado (ni estado ni evidencia).
    if (!authorized()) return reply.code(401).send(UNAUTHORIZED_BODY);
    if (!published) {
      const issue: ReadCheckIssue = inconsistent ? 'EVIDENCE_INCONSISTENT' : saveFailed ? 'EVIDENCE_UNREADABLE' : run.reason === 'cancelled' ? 'CANCELLED' : 'CONFIG_CHANGED';
      return reply.code(saveFailed ? 503 : inconsistent ? 502 : 409).send(state({ issue, started: true }));
    }
    return state({ started: true });
  });

  app.addHook('onClose', async () => { if (slot) abortRun(slot, 'cancelled'); });
  return {
    cancel() { if (!slot || slot.controller.signal.aborted) return false; abortRun(slot, 'cancelled'); return true; },
    invalidate() { if (slot && !slot.controller.signal.aborted) abortRun(slot, 'config-changed'); },
    running: () => !!slot && !slot.controller.signal.aborted,
  };
}
