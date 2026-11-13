import type { FastifyInstance, FastifyReply } from 'fastify';
import {
  RELAY_ISSUE_MESSAGES, RELAY_NOT_PROVEN, RELAY_REHEARSAL_ROUTE, RelayRehearsalPostBodySchema, RelayRehearsalStoredSchema, inspectRelayRecord, recordFromRehearsal,
  type RehearsalResultLike, type RelayIssue, type RelayRehearsalApiState, type RelayRehearsalStored,
} from '../shared/relay-rehearsal.js';
import { RunLease, type RunLeaseOptions } from './relay-rehearsal-lease.js';

// ENSAYO DE RELEVO desde el recorrido (unidad 216): instalador de rutas con dependencias inyectadas, pensado para createBaseApp (hereda host, Origin y bloqueo por sesión de `/api/*`).
// GET devuelve SOLO el último registro (no ejecuta nada). POST (consentimiento explícito de ficción) inicia UN ensayo con el Kit aceptado: exportar → inspeccionar → aprobar ligado al contenido →
// importar en destino NUEVO → abrirlo en un proceso nuevo → ID equivocado rechazado → conciliar un único create. Es con FICCIÓN en una raíz propia: no exporta el espacio activo y la
// contraseña la genera el servidor. NO acredita otro equipo, HubSpot real, RTO/RPO ni autoría. No se registra sola en ningún arranque.
// EXCLUSIÓN (R2): hay como máximo UN ejecutor vivo por instancia. La plaza es la de `RunLease` (unidad 224): cancelar, revocar, cerrar o agotar el tiempo NO la liberan; pasan a «deteniéndose»
// (`stopping`) y solo se admite otro ensayo cuando el ejecutor terminó de verdad (su promesa se asienta cuando todo su árbol de procesos cerró). Un resultado de una ejecución cancelada,
// revocada o vencida nunca se publica y un resultado antiguo no sobrescribe uno posterior.
export interface RelayRecordStore { load(): RelayRehearsalStored | null; save(value: RelayRehearsalStored): void }
export interface RelayRehearsalDeps {
  /** OBLIGATORIA y con fallo cerrado (en el montaje real `security.captureAuthorization`): se captura al entrar en POST y se revalida antes de persistir y de devolver. */
  captureAuthorization(cookieHeader?: string): () => boolean;
  store: RelayRecordStore;
  /**
   * Ejecutor del Kit. OBLIGATORIO (no hay valor por defecto que use el cwd del servidor): en el montaje real, `createRelayExecutor({ installRoot, appRoot }).run` de la unidad 224.
   * Contrato: respeta la señal (la aborta al cancelar, revocar, cerrar o agotar el tiempo) y asienta su promesa SOLO cuando todo su trabajo y sus procesos terminaron.
   */
  run: (context: { signal: AbortSignal }) => Promise<RehearsalResultLike>;
  now?: () => number;
  /** Tope de duración (ms); pasado ese plazo el ensayo se registra como interrumpido, pero la plaza sigue ocupada hasta que el ejecutor termine. */
  timeoutMs?: number;
  /** Espera máxima al cerrar el servidor a que termine el ejecutor (ms). */
  closeGraceMs?: number;
  /** Solo pruebas: temporizadores de la plaza. */
  timers?: RunLeaseOptions['timers'];
}
export interface RelayRehearsalHandle {
  /** Hay un ensayo ejecutándose con normalidad (no deteniéndose). */
  running(): boolean;
  /** Hay un ejecutor vivo, también si ya se pidió detenerlo y sigue terminando: es la plaza física. */
  occupied(): boolean;
  /** Pide descartar el ensayo en curso. No libera la plaza. */
  cancel(): boolean;
  /** Se cumple cuando la plaza está libre (nada vivo). */
  drained(): Promise<void>;
}

export function storeRelayRecord(store: { get<T>(key: string, fallback: T): T; set(key: string, value: unknown): unknown }, key = 'relayRehearsal'): RelayRecordStore {
  return { load() { const raw = store.get<unknown>(key, null); if (raw === null) return null; const parsed = RelayRehearsalStoredSchema.safeParse(raw); if (!parsed.success) throw new Error('record-unreadable'); return parsed.data; }, save(value) { store.set(key, value); } };
}
const sameOrigin = (origin: string | undefined, host: string | undefined) => { if (!origin || !host) return false; try { const u = new URL(origin); return u.protocol === 'http:' && u.host === host; } catch { return false; } };
const UNAUTHORIZED = { error: 'Desbloquea tu copia local para continuar.' };
const STOP_REASON = { cancelled: 'cancelled', unauthorized: 'revoked', closing: 'closing', timeout: 'timeout' } as const;

export function registerRelayRehearsalApi(app: FastifyInstance, deps: RelayRehearsalDeps): RelayRehearsalHandle {
  if (typeof deps.captureAuthorization !== 'function') throw new Error('captureAuthorization es obligatoria: sin ella el ensayo no puede vincularse a la sesión que lo inicia.');
  if (typeof deps.run !== 'function') throw new Error('run es obligatorio: el ensayo necesita un ejecutor con raíz propia y cierre de procesos (createRelayExecutor).');
  const clock = deps.now ?? Date.now, lease = new RunLease<RehearsalResultLike>({ timeoutMs: Math.min(600_000, Math.max(100, deps.timeoutMs ?? 120_000)), now: clock, timers: deps.timers });
  let owner: (() => boolean) | null = null;   // autorización de la sesión que inició la ejecución actual
  const captureAuth = (cookie: string | undefined): (() => boolean) => { try { const check = deps.captureAuthorization(cookie); return () => { try { return check() === true; } catch { return false; } }; } catch { return () => false; } };
  function state(extra: { issue?: RelayIssue; started?: boolean } = {}): RelayRehearsalApiState {
    let last: RelayRehearsalStored | null = null, issue: RelayIssue | null = extra.issue ?? null;
    try { last = deps.store.load(); } catch { issue ??= 'RECORD_UNREADABLE'; }
    if (last && inspectRelayRecord(last, clock()) !== null) { last = null; issue ??= 'RECORD_INCONSISTENT'; }   // un registro incoherente no se acredita
    if (owner && lease.snapshot().phase === 'running' && !owner()) lease.cancel('unauthorized');   // la sesión que lo inició ya no es válida: se descarta, la plaza sigue ocupada
    const snap = lease.snapshot();
    return {
      format: 'planb-relay-rehearsal-api-v1', last, running: snap.phase === 'running' ? { since: new Date(snap.since ?? clock()).toISOString() } : null,
      stopping: snap.phase === 'draining' && snap.drainingFor ? { since: new Date(snap.since ?? clock()).toISOString(), reason: STOP_REASON[snap.drainingFor] } : null,
      scope: { fiction: true, exportsActiveSpace: false, notProven: [...RELAY_NOT_PROVEN] },
      issue, message: issue ? RELAY_ISSUE_MESSAGES[issue] : null, ...(extra.started === undefined ? {} : { started: extra.started }),
    };
  }
  const noStore = { exposeHeadRoute: false, onSend: async (_r: unknown, reply: FastifyReply, payload: unknown) => { reply.header('Cache-Control', 'no-store').header('Pragma', 'no-cache'); return payload; } } as const;

  // Frontera de SALIDA común (R4): TODO método captura la autorización original al entrar, prepara el estado público (lee el almacenamiento y el reloj) y la REVALIDA después; si la sesión venció mientras tanto
  // sale 401 `{error}` (con las cabeceras restrictivas de la ruta) sin estado ni resultado, también en las respuestas de error que adjuntan estado.
  const respondWith = (authorized: () => boolean, reply: FastifyReply, code: number, extra: { issue?: RelayIssue; started?: boolean } = {}) => { const body = state(extra); return authorized() ? reply.code(code).send(body) : reply.code(401).send(UNAUTHORIZED); };
  app.get(RELAY_REHEARSAL_ROUTE, noStore, async (request, reply) => {
    const authorized = captureAuth(request.headers.cookie); if (!authorized()) return reply.code(401).send(UNAUTHORIZED);
    return (Number(request.headers['content-length'] ?? 0) !== 0 || request.headers['transfer-encoding']) ? respondWith(authorized, reply, 422, { issue: 'INVALID_REQUEST' }) : respondWith(authorized, reply, 200);
  });
  app.delete(RELAY_REHEARSAL_ROUTE, noStore, async (request, reply) => {
    const authorized = captureAuth(request.headers.cookie); if (!authorized()) return reply.code(401).send(UNAUTHORIZED);   // permiso vigente ANTES de cancelar nada
    if (!sameOrigin(request.headers.origin, request.headers.host)) return respondWith(authorized, reply, 403, { issue: 'ORIGIN_REQUIRED' });
    lease.cancel('cancelled');   // solicita descartar y detener; la plaza se libera cuando el ejecutor termina de verdad (aunque el estado ya no se pueda entregar a esta sesión)
    return respondWith(authorized, reply, 200);
  });
  app.post(RELAY_REHEARSAL_ROUTE, noStore, async (request, reply) => {
    const authorized = captureAuth(request.headers.cookie);   // síncrono al entrar, antes de cualquier espera
    if (!authorized()) return reply.code(401).send(UNAUTHORIZED);
    // Frontera de SALIDA (R3): el estado público se prepara primero (lee el almacenamiento y el reloj) y el permiso de la sesión que inició la acción se revalida DESPUÉS; si venció mientras tanto no sale ningún estado ni resultado.
    const respond = (code: number, extra: { issue?: RelayIssue; started?: boolean } = {}) => { const body = state(extra); return authorized() ? reply.code(code).send(body) : reply.code(401).send(UNAUTHORIZED); };
    if (!sameOrigin(request.headers.origin, request.headers.host)) return respond(403, { issue: 'ORIGIN_REQUIRED' });
    if (!RelayRehearsalPostBodySchema.safeParse(request.body).success) return respond(422, { issue: 'INVALID_REQUEST' });
    const started = lease.start(deps.run);
    if (started.kind === 'busy') {   // doble clic / segunda pestaña / sesión nueva / ejecutor aún deteniéndose: no se inicia otro
      return started.snapshot.phase === 'draining' ? respond(409, { issue: 'STOPPING', started: false }) : respond(202, { issue: 'ALREADY_RUNNING', started: false });
    }
    const mine = started.run; owner = authorized;
    const outcome = await mine.outcome;   // puede cumplirse ANTES de que el trabajo físico termine (cancelación, revocación, tiempo agotado)
    if (outcome.kind === 'discarded') {
      if (outcome.reason === 'unauthorized' || !authorized()) return reply.code(401).send(UNAUTHORIZED);   // sesión revocada: nada de lo ensayado se devuelve
      return respond(409, { issue: 'CANCELLED', started: true });
    }
    if (!authorized()) { lease.cancel('unauthorized'); return reply.code(401).send(UNAUTHORIZED); }
    const record = recordFromRehearsal({ now: clock(), result: outcome.kind === 'finished' ? outcome.value : null, interrupted: outcome.kind === 'timeout' });   // el motivo concreto puede llevar rutas: no se conserva
    if (!authorized()) { lease.cancel('unauthorized'); return reply.code(401).send(UNAUTHORIZED); }   // el reloj de `recordFromRehearsal`/`inspectRelayRecord` pudo cruzar el vencimiento: nada se confirma ni se guarda
    if (inspectRelayRecord(record, clock()) !== null || !RelayRehearsalStoredSchema.safeParse(record).success) return respond(502, { issue: 'RECORD_INCONSISTENT', started: true });
    if (!authorized()) { lease.cancel('unauthorized'); return reply.code(401).send(UNAUTHORIZED); }   // idem tras la validación y antes de `commit`/`save`
    if (!lease.commit(mine, outcome)) return respond(409, { issue: 'CANCELLED', started: true });   // un resultado antiguo no sobrescribe uno posterior
    try { deps.store.save(record); } catch { return respond(503, { issue: 'RECORD_UNREADABLE', started: true }); }
    return respond(200, { issue: record.outcome === 'completed' ? undefined : 'RUN_FAILED', started: true });   // el registro confirmado con permiso se conserva aunque la respuesta ya no se pueda entregar
  });
  // `preClose` (no `onClose`): Fastify espera a las peticiones en curso antes de ejecutar `onClose`, así que hay que pedir detener ANTES de cerrar el servidor.
  app.addHook('preClose', async () => { await lease.close(deps.closeGraceMs ?? 15_000); });
  return {
    running: () => lease.snapshot().phase === 'running', occupied: () => lease.snapshot().phase !== 'idle', cancel: () => lease.cancel('cancelled'),
    drained: async () => { while (lease.snapshot().phase !== 'idle') await new Promise(resolve => setTimeout(resolve, 20)); },
  };
}
