// Motor asincrono de capturas CRM sobre CrmCaptureContract.
// Recorre las entidades en orden con un transporte inyectado (solo lectura), valida cada
// pagina con el contrato y devuelve los datos unicamente cuando TODAS las entidades terminan.
//
// Limites que conviene conocer:
// - Si un callback (readPage, getBinding, sleep) ignora `signal` o nunca resuelve, el motor
//   abandona su resultado y rechaza a tiempo, pero la operacion fisica puede seguir viva:
//   no se promete cancelacion externa, solo que el motor deja de esperarla.
// - Los items se copian de forma superficial y se congelan; sus payloads anidados se tratan
//   como datos opacos y NO se congelan.
// - No hay persistencia, reanudacion ni lease distribuido: cada ejecucion es independiente.
import {
  CaptureContractError,
  CrmCaptureContract,
  type CaptureBinding,
  type CaptureSummary,
  type Entity,
} from './crm-capture-contract.js';

export interface CaptureItem {
  readonly id: string;
}

export interface RunnerPage<T extends CaptureItem> {
  items: readonly T[];
  nextCursor: string | null;
  total?: number;
}

export interface RunnerRequest {
  binding: CaptureBinding;
  entity: Entity;
  cursor: string | null;
  attempt: number;
  signal: AbortSignal;
}

export interface RunnerOptions<T extends CaptureItem> {
  binding: CaptureBinding;
  entities: readonly Entity[];
  readPage: (request: RunnerRequest) => Promise<RunnerPage<T>>;
  getBinding: () => Promise<CaptureBinding>;
  signal?: AbortSignal;
  maxPages?: number;
  maxRecords?: number;
  maxAttempts?: number;
  requestTimeoutMs?: number;
  deadlineMs?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  sleep?: (ms: number, signal: AbortSignal) => Promise<void>;
}

export interface RunnerResult<T extends CaptureItem> {
  readonly summary: CaptureSummary;
  readonly records: Readonly<Partial<Record<Entity, readonly T[]>>>;
  readonly attempts: number;
  readonly retries: number;
}

export class CaptureReadError extends Error {
  readonly status: number;
  readonly retryAfterMs: number | undefined;

  constructor(status: number, retryAfterMs?: number) {
    super('Lectura CRM fallida');
    Object.setPrototypeOf(this, new.target.prototype);
    this.name = 'CaptureReadError';
    this.status = status;
    this.retryAfterMs = retryAfterMs;
  }
}

const RUNNER_MESSAGES: Readonly<Record<string, string>> = {
  INVALID_OPTIONS: 'Opciones de captura invalidas',
  CANCELLED: 'Captura cancelada',
  TIMEOUT: 'Una operacion de la captura supero su tiempo limite',
  DEADLINE: 'La captura supero su plazo total',
  BINDING_CHANGED: 'El contexto de la captura cambio',
  RETRY_EXHAUSTED: 'Se agotaron los reintentos de lectura',
  READ_FAILED: 'Lectura de captura fallida',
};

export class CaptureRunnerError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(RUNNER_MESSAGES[code] ?? 'Captura fallida');
    Object.setPrototypeOf(this, new.target.prototype);
    this.name = 'CaptureRunnerError';
    this.code = code;
  }
}

const ENTITY_NAMES: ReadonlySet<string> = new Set(['contacts', 'companies', 'deals', 'tasks']);
// setTimeout trata valores mayores como 1 ms; se acota al maximo representable.
const MAX_TIMER_MS = 2_147_483_647;
// Mismos valores por defecto que CrmCaptureContract; el motor los necesita para comprobar el
// cupo antes de copiar una pagina.
const DEFAULT_MAX_PAGES = 1000;
const DEFAULT_MAX_RECORDS = 1_000_000;

// ---------------------------------------------------------------------------
// Opciones y binding
// ---------------------------------------------------------------------------

function isCanonical(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value === value.trim();
}

function readBinding(value: unknown): CaptureBinding | undefined {
  try {
    if (typeof value !== 'object' || value === null) return undefined;
    const source = value as Record<string, unknown>;
    const tenantId = source.tenantId;
    const portalId = source.portalId;
    const generation = source.generation;
    if (!isCanonical(tenantId) || !isCanonical(portalId)) return undefined;
    if (typeof generation !== 'number' || !Number.isSafeInteger(generation) || generation < 0) return undefined;
    return { tenantId, portalId, generation };
  } catch {
    return undefined;
  }
}

function sameBinding(a: CaptureBinding, b: CaptureBinding): boolean {
  return a.tenantId === b.tenantId && a.portalId === b.portalId && a.generation === b.generation;
}

function freezeBinding(binding: CaptureBinding): CaptureBinding {
  return Object.freeze({ tenantId: binding.tenantId, portalId: binding.portalId, generation: binding.generation });
}

function invalidOptions(): never {
  throw new CaptureRunnerError('INVALID_OPTIONS');
}

function integerOption(raw: unknown, fallback: number, min: number, max = Number.MAX_SAFE_INTEGER): number {
  if (raw === undefined) return fallback;
  if (typeof raw !== 'number' || !Number.isSafeInteger(raw) || raw < min || raw > max) invalidOptions();
  return raw;
}

function optionalLimit(raw: unknown): number | undefined {
  if (raw === undefined) return undefined;
  if (typeof raw !== 'number' || !Number.isSafeInteger(raw) || raw < 1) invalidOptions();
  return raw;
}

interface Config {
  readonly binding: CaptureBinding;
  readonly entities: readonly Entity[];
  readonly readPage: (request: RunnerRequest) => unknown;
  readonly getBinding: () => unknown;
  readonly sleep: (ms: number, signal: AbortSignal) => unknown;
  readonly signal: AbortSignal | undefined;
  readonly maxPages: number | undefined;
  readonly maxRecords: number | undefined;
  readonly maxAttempts: number;
  readonly requestTimeoutMs: number;
  readonly deadlineMs: number;
  readonly baseDelayMs: number;
  readonly maxDelayMs: number;
}

// Captura una unica lectura de cada opcion: despues de esto el caller no puede cambiar el contexto.
function parseOptions(options: unknown): Config {
  try {
    if (typeof options !== 'object' || options === null) invalidOptions();
    const o = options as Record<string, unknown>;

    const binding = readBinding(o.binding);
    if (binding === undefined) invalidOptions();

    const rawEntities = o.entities;
    if (!Array.isArray(rawEntities) || rawEntities.length === 0) invalidOptions();
    const entities: Entity[] = [];
    const seen = new Set<string>();
    for (let i = 0; i < rawEntities.length; i += 1) {
      const name: unknown = rawEntities[i];
      if (typeof name !== 'string' || !ENTITY_NAMES.has(name) || seen.has(name)) invalidOptions();
      seen.add(name);
      entities.push(name as Entity);
    }

    const readPage = o.readPage;
    const getBinding = o.getBinding;
    if (typeof readPage !== 'function' || typeof getBinding !== 'function') invalidOptions();
    const rawSleep = o.sleep;
    if (rawSleep !== undefined && typeof rawSleep !== 'function') invalidOptions();

    const rawSignal = o.signal;
    let signal: AbortSignal | undefined;
    if (rawSignal !== undefined) {
      const candidate = rawSignal as Partial<AbortSignal> | null;
      if (
        typeof candidate !== 'object' ||
        candidate === null ||
        typeof candidate.aborted !== 'boolean' ||
        typeof candidate.addEventListener !== 'function' ||
        typeof candidate.removeEventListener !== 'function'
      ) {
        invalidOptions();
      }
      signal = rawSignal as AbortSignal;
    }

    const baseDelayMs = integerOption(o.baseDelayMs, 250, 0);
    const maxDelayMs = integerOption(o.maxDelayMs, 10_000, 0);
    if (maxDelayMs < baseDelayMs) invalidOptions();

    return {
      binding: freezeBinding(binding),
      entities,
      readPage: readPage as Config['readPage'],
      getBinding: getBinding as Config['getBinding'],
      sleep: (rawSleep as Config['sleep'] | undefined) ?? defaultSleep,
      signal,
      maxPages: optionalLimit(o.maxPages),
      maxRecords: optionalLimit(o.maxRecords),
      maxAttempts: integerOption(o.maxAttempts, 3, 1, 10),
      requestTimeoutMs: integerOption(o.requestTimeoutMs, 30_000, 1),
      deadlineMs: integerOption(o.deadlineMs, 120_000, 1),
      baseDelayMs,
      maxDelayMs,
    };
  } catch (error) {
    if (error instanceof CaptureRunnerError) throw error;
    throw new CaptureRunnerError('INVALID_OPTIONS');
  }
}

function defaultSleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise<void>((resolve) => {
    if (signal.aborted) {
      resolve();
      return;
    }
    const onAbort = (): void => {
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, Math.min(ms, MAX_TIMER_MS));
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

// ---------------------------------------------------------------------------
// Estado de la ejecucion y operaciones acotadas
// ---------------------------------------------------------------------------

// Fallo propio de la operacion acotada (lo que lanzo/rechazo el callback), distinto de los
// fallos de control (cancelacion, plazo, timeout) para no confundir errores del transporte.
class OpFailure {
  readonly error: unknown;
  constructor(error: unknown) {
    this.error = error;
  }
}

class RunState {
  failure: Error | undefined;
  readonly #listeners = new Set<(error: Error) => void>();

  onTerminate(listener: (error: Error) => void): () => void {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  }

  terminate(error: Error): void {
    if (this.failure !== undefined) return;
    this.failure = error;
    for (const listener of [...this.#listeners]) listener(error);
  }

  check(): void {
    if (this.failure !== undefined) throw this.failure;
  }
}

// Ejecuta `start` y compite contra cancelacion, plazo global y (opcional) timeout propio.
// Rechaza rapido aunque `start` ignore su signal o no resuelva nunca; cualquier rechazo tardio
// de `start` queda consumido por los handlers de `pending`.
function bounded<R>(
  run: RunState,
  start: (signal: AbortSignal) => R | PromiseLike<R>,
  timeoutMs: number | undefined,
): Promise<R> {
  return new Promise<R>((resolve, reject) => {
    if (run.failure !== undefined) {
      reject(run.failure);
      return;
    }
    const controller = new AbortController();
    let done = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let detach: (() => void) | undefined;

    const finish = (settle: () => void, abort: boolean): void => {
      if (done) return;
      done = true;
      if (timer !== undefined) clearTimeout(timer);
      if (detach !== undefined) detach();
      if (abort) controller.abort();
      settle();
    };

    detach = run.onTerminate((error) => finish(() => reject(error), true));
    if (timeoutMs !== undefined) {
      timer = setTimeout(
        () => finish(() => reject(new CaptureRunnerError('TIMEOUT')), true),
        Math.min(timeoutMs, MAX_TIMER_MS),
      );
    }

    let pending: Promise<R>;
    try {
      pending = Promise.resolve(start(controller.signal));
    } catch (error) {
      finish(() => reject(new OpFailure(error)), false);
      return;
    }
    pending.then(
      (value) => finish(() => resolve(value), false),
      (error: unknown) => finish(() => reject(new OpFailure(error)), false),
    );
  });
}

// ---------------------------------------------------------------------------
// Paginas
// ---------------------------------------------------------------------------

interface PageSnapshot<T extends CaptureItem> {
  readonly items: T[];
  readonly ids: unknown[];
  readonly nextCursor: unknown;
  readonly total: unknown;
}

// Cupo global que queda antes de aceptar la pagina: acumula todas las entidades y solo avanza
// cuando el contrato acepta una pagina (un reintento de transporte no lo consume).
interface Budget {
  readonly pages: number;
  readonly records: number;
}

function limitExceeded(): CaptureContractError {
  return new CaptureContractError('LIMIT_EXCEEDED', 'la pagina supera el cupo de la captura');
}

// Copia inmediata de la pagina del transporte: lo que el transporte mute despues no cuenta.
// Los limites se comprueban ANTES de recorrer items o leer propiedades por item, de modo que
// una pagina sobredimensionada no ejecuta getters ni copia nada.
function snapshotPage<T extends CaptureItem>(value: unknown, budget: Budget): PageSnapshot<T> {
  try {
    if (budget.pages < 1) throw limitExceeded();
    if (typeof value !== 'object' || value === null) throw new Error('page');
    const source = value as Record<string, unknown>;
    const rawItems = source.items;
    const nextCursor = source.nextCursor;
    const total = source.total;
    if (!Array.isArray(rawItems)) throw new Error('items');
    if (rawItems.length > budget.records) throw limitExceeded();
    const items: T[] = [];
    const ids: unknown[] = [];
    for (let i = 0; i < rawItems.length; i += 1) {
      const raw: unknown = rawItems[i];
      if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new Error('item');
      const copy = Object.freeze({ ...(raw as object) }) as unknown as T;
      items.push(copy);
      ids.push((copy as unknown as Record<string, unknown>).id);
    }
    return { items, ids, nextCursor, total };
  } catch (error) {
    if (error instanceof CaptureContractError) throw error; // LIMIT_EXCEEDED se conserva
    throw new CaptureContractError('INVALID_INPUT', 'pagina del transporte con forma invalida');
  }
}

function isRetryable(error: unknown): boolean {
  if (!(error instanceof CaptureReadError)) return false;
  const status: unknown = error.status;
  return typeof status === 'number' && Number.isInteger(status) && (status === 429 || (status >= 500 && status <= 599));
}

function retryDelay(error: unknown, attempt: number, config: Config): number {
  const advertised: unknown = error instanceof CaptureReadError ? error.retryAfterMs : undefined;
  if (typeof advertised === 'number' && Number.isInteger(advertised) && advertised >= 0) {
    return Math.min(advertised, config.maxDelayMs);
  }
  return Math.min(config.baseDelayMs * 2 ** (attempt - 1), config.maxDelayMs);
}

// ---------------------------------------------------------------------------
// Motor
// ---------------------------------------------------------------------------

export async function runCrmCapture<T extends CaptureItem>(options: RunnerOptions<T>): Promise<RunnerResult<T>> {
  // Todo lo anterior al primer await es sincrono: el caller ya no puede alterar el contexto.
  const config = parseOptions(options);
  let contract: CrmCaptureContract;
  try {
    contract = new CrmCaptureContract(config.binding, config.entities, {
      maxPages: config.maxPages,
      maxRecords: config.maxRecords,
    });
  } catch {
    throw new CaptureRunnerError('INVALID_OPTIONS');
  }
  if (config.signal?.aborted === true) throw new CaptureRunnerError('CANCELLED');

  const run = new RunState();
  const { signal } = config;
  const onAbort = (): void => run.terminate(new CaptureRunnerError('CANCELLED'));
  signal?.addEventListener('abort', onAbort, { once: true });
  const deadlineTimer = setTimeout(
    () => run.terminate(new CaptureRunnerError('DEADLINE')),
    Math.min(config.deadlineMs, MAX_TIMER_MS),
  );

  let attempts = 0;
  let retries = 0;
  const maxPages = config.maxPages ?? DEFAULT_MAX_PAGES;
  const maxRecords = config.maxRecords ?? DEFAULT_MAX_RECORDS;
  let acceptedPages = 0;
  let acceptedRecords = 0;

  const verifyBinding = async (): Promise<void> => {
    run.check();
    let raw: unknown;
    try {
      raw = await bounded(run, () => config.getBinding(), config.requestTimeoutMs);
    } catch (error) {
      if (error instanceof OpFailure) throw new CaptureRunnerError('READ_FAILED');
      throw error;
    }
    run.check();
    const current = readBinding(raw);
    if (current === undefined || !sameBinding(current, config.binding)) {
      throw new CaptureRunnerError('BINDING_CHANGED');
    }
  };

  const pause = async (ms: number): Promise<void> => {
    try {
      await bounded(run, (s) => config.sleep(ms, s) as PromiseLike<void>, undefined);
    } catch (error) {
      if (error instanceof OpFailure) throw new CaptureRunnerError('READ_FAILED');
      throw error;
    }
    run.check();
  };

  // Lee una pagina con reintentos. `attempt` reinicia por pagina.
  const readPageWithRetry = async (entity: Entity, cursor: string | null): Promise<PageSnapshot<T>> => {
    for (let attempt = 1; ; attempt += 1) {
      run.check();
      await verifyBinding();

      attempts += 1;
      if (attempt > 1) retries += 1;

      let failure: { error: unknown } | undefined;
      let snapshot: PageSnapshot<T> | undefined;
      let shapeError: unknown;
      try {
        const value = await bounded(
          run,
          (s) =>
            config.readPage(
              Object.freeze({
                binding: freezeBinding(config.binding),
                entity,
                cursor,
                attempt,
                signal: s,
              }),
            ),
          config.requestTimeoutMs,
        );
        try {
          snapshot = snapshotPage<T>(value, {
            pages: maxPages - acceptedPages,
            records: maxRecords - acceptedRecords,
          });
        } catch (error) {
          shapeError = error;
        }
      } catch (error) {
        if (!(error instanceof OpFailure)) throw error; // TIMEOUT / CANCELLED / DEADLINE: sin mas llamadas
        failure = { error: error.error };
      }

      await verifyBinding(); // el cambio de contexto tiene prioridad sobre cualquier otro resultado
      if (failure === undefined) {
        if (shapeError !== undefined) throw shapeError;
        return snapshot as PageSnapshot<T>;
      }

      if (!isRetryable(failure.error)) throw new CaptureRunnerError('READ_FAILED');
      if (attempt >= config.maxAttempts) throw new CaptureRunnerError('RETRY_EXHAUSTED');
      await pause(retryDelay(failure.error, attempt, config));
    }
  };

  try {
    const stored = new Map<Entity, T[]>();
    for (const entity of config.entities) {
      const items: T[] = [];
      let cursor: string | null = null;
      for (;;) {
        const page: PageSnapshot<T> = await readPageWithRetry(entity, cursor);
        const input =
          page.total === undefined
            ? { ids: page.ids, nextCursor: page.nextCursor }
            : { ids: page.ids, nextCursor: page.nextCursor, total: page.total };
        contract.addPage(config.binding, entity, cursor, input as never);
        for (const item of page.items) items.push(item);
        acceptedPages += 1;
        acceptedRecords += page.items.length;
        cursor = page.nextCursor as string | null;
        if (cursor === null) break;
      }
      stored.set(entity, items);
    }

    await verifyBinding();
    run.check();
    const summary = contract.finalize(config.binding);
    const records: Partial<Record<Entity, readonly T[]>> = {};
    for (const [entity, items] of stored) records[entity] = Object.freeze(items);
    return Object.freeze({
      summary,
      records: Object.freeze(records),
      attempts,
      retries,
    });
  } catch (error) {
    const normalized: Error =
      error instanceof CaptureRunnerError || error instanceof CaptureContractError
        ? error
        : new CaptureRunnerError('READ_FAILED');
    const final = run.failure ?? normalized;
    run.terminate(final); // aborta cualquier operacion todavia en vuelo
    throw final;
  } finally {
    clearTimeout(deadlineTimer);
    signal?.removeEventListener('abort', onAbort);
  }
}
