// Contrato puro para validar un recorrido paginado CRM antes de publicar una captura.
// Solo retiene IDs y metadatos de control; no persiste registros ni credenciales.

export type Entity = 'contacts' | 'companies' | 'deals' | 'tasks';

export interface CaptureBinding {
  tenantId: string;
  portalId: string;
  generation: number;
}

export interface CapturePage {
  ids: readonly string[];
  nextCursor: string | null;
  total?: number;
}

export interface CaptureLimits {
  maxPages?: number;
  maxRecords?: number;
}

export interface CaptureSummary {
  readonly binding: CaptureBinding;
  readonly totalPages: number;
  readonly totalRecords: number;
  readonly complete: true;
  readonly entities: Partial<Record<Entity, { readonly pages: number; readonly records: number }>>;
}

export class CaptureContractError extends Error {
  readonly code: string;

  constructor(code: string, message?: string) {
    super(message ?? code);
    Object.setPrototypeOf(this, new.target.prototype);
    this.name = 'CaptureContractError';
    this.code = code;
  }
}

const ENTITY_NAMES: ReadonlySet<string> = new Set(['contacts', 'companies', 'deals', 'tasks']);
const DEFAULT_MAX_PAGES = 1000;
const DEFAULT_MAX_RECORDS = 1_000_000;

interface EntityState {
  expectedCursor: string | null;
  done: boolean;
  pages: number;
  records: number;
  total: number | undefined;
  ids: Set<string>;
  usedCursors: Set<string>;
}

type Status = 'collecting' | 'invalidated' | 'finalized';

function fail(code: string, message: string): never {
  throw new CaptureContractError(code, message);
}

function isCanonicalString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value === value.trim();
}

function isSafeInteger(value: unknown, min: number): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= min;
}

function parseBinding(value: unknown): CaptureBinding {
  if (typeof value !== 'object' || value === null) fail('INVALID_INPUT', 'binding debe ser un objeto');
  const source = value as Record<string, unknown>;
  const tenantId = source.tenantId;
  const portalId = source.portalId;
  const generation = source.generation;
  if (!isCanonicalString(tenantId)) fail('INVALID_INPUT', 'tenantId debe ser un string canonico no vacio');
  if (!isCanonicalString(portalId)) fail('INVALID_INPUT', 'portalId debe ser un string canonico no vacio');
  if (!isSafeInteger(generation, 0)) fail('INVALID_INPUT', 'generation debe ser un entero seguro >= 0');
  return { tenantId, portalId, generation };
}

function parseCursor(value: unknown): string | null {
  if (value === null) return null;
  if (!isCanonicalString(value)) fail('INVALID_INPUT', 'cursor debe ser null o un string canonico no vacio');
  return value;
}

function parseLimit(value: unknown, fallback: number, name: string): number {
  if (value === undefined) return fallback;
  if (!isSafeInteger(value, 1)) fail('INVALID_INPUT', `${name} debe ser un entero seguro > 0`);
  return value;
}

export class CrmCaptureContract {
  readonly #binding: Readonly<CaptureBinding>;
  readonly #maxPages: number;
  readonly #maxRecords: number;
  readonly #states: Map<Entity, EntityState> = new Map();
  #status: Status = 'collecting';
  #totalPages = 0;
  #totalRecords = 0;
  #summary: CaptureSummary | undefined;

  constructor(binding: CaptureBinding, entities: readonly Entity[], limits?: CaptureLimits) {
    try {
      this.#binding = Object.freeze(parseBinding(binding));

      if (!Array.isArray(entities) || entities.length === 0) {
        fail('INVALID_INPUT', 'entities debe ser un array no vacio');
      }
      const seen = new Set<string>();
      for (let i = 0; i < entities.length; i += 1) {
        const name: unknown = entities[i];
        if (typeof name !== 'string' || !ENTITY_NAMES.has(name)) fail('INVALID_INPUT', 'entidad no admitida');
        if (seen.has(name)) fail('INVALID_INPUT', 'entidad duplicada');
        seen.add(name);
        this.#states.set(name as Entity, {
          expectedCursor: null,
          done: false,
          pages: 0,
          records: 0,
          total: undefined,
          ids: new Set(),
          usedCursors: new Set(),
        });
      }

      let rawPages: unknown;
      let rawRecords: unknown;
      if (limits !== undefined) {
        if (typeof limits !== 'object' || limits === null) fail('INVALID_INPUT', 'limits debe ser un objeto');
        rawPages = (limits as Record<string, unknown>).maxPages;
        rawRecords = (limits as Record<string, unknown>).maxRecords;
      }
      this.#maxPages = parseLimit(rawPages, DEFAULT_MAX_PAGES, 'maxPages');
      this.#maxRecords = parseLimit(rawRecords, DEFAULT_MAX_RECORDS, 'maxRecords');
    } catch (error) {
      if (error instanceof CaptureContractError) throw error;
      throw new CaptureContractError('INVALID_INPUT', 'argumentos del constructor invalidos');
    }
  }

  addPage(binding: CaptureBinding, entity: Entity, cursor: string | null, page: CapturePage): void {
    this.#assertCollecting();
    this.#guard(() => this.#apply(binding, entity, cursor, page));
  }

  finalize(binding: CaptureBinding): CaptureSummary {
    if (this.#status === 'invalidated') fail('INVALIDATED', 'el acumulador esta invalidado');
    if (this.#status === 'finalized') {
      // Un error aqui no destruye el resumen ya finalizado.
      this.#assertBinding(binding);
      return this.#summary as CaptureSummary;
    }
    return this.#guard(() => {
      this.#assertBinding(binding);
      for (const state of this.#states.values()) {
        if (!state.done) fail('INCOMPLETE', 'hay entidades sin terminar');
      }
      const entities: Partial<Record<Entity, { readonly pages: number; readonly records: number }>> = {};
      for (const [name, state] of this.#states) {
        entities[name] = Object.freeze({ pages: state.pages, records: state.records });
      }
      const summary: CaptureSummary = Object.freeze({
        binding: this.#binding,
        totalPages: this.#totalPages,
        totalRecords: this.#totalRecords,
        complete: true as const,
        entities: Object.freeze(entities),
      });
      this.#summary = summary;
      this.#status = 'finalized';
      this.#releaseState();
      return summary;
    });
  }

  #assertCollecting(): void {
    if (this.#status === 'finalized') fail('FINALIZED', 'la captura ya esta finalizada');
    if (this.#status === 'invalidated') fail('INVALIDATED', 'el acumulador esta invalidado');
  }

  // Cualquier error durante collecting invalida de forma permanente.
  #guard<T>(action: () => T): T {
    try {
      return action();
    } catch (error) {
      this.#status = 'invalidated';
      this.#releaseState();
      if (error instanceof CaptureContractError) throw error;
      throw new CaptureContractError('INVALID_INPUT', 'entrada invalida');
    }
  }

  #releaseState(): void {
    for (const state of this.#states.values()) {
      state.ids.clear();
      state.usedCursors.clear();
    }
  }

  #assertBinding(value: unknown): void {
    const parsed = parseBinding(value);
    const expected = this.#binding;
    if (
      parsed.tenantId !== expected.tenantId ||
      parsed.portalId !== expected.portalId ||
      parsed.generation !== expected.generation
    ) {
      fail('BINDING_MISMATCH', 'el binding no coincide con el de la captura');
    }
  }

  // Valida la pagina completa antes de tocar el estado: no hay mutaciones parciales.
  #apply(binding: unknown, entity: unknown, cursor: unknown, page: unknown): void {
    this.#assertBinding(binding);

    const state = typeof entity === 'string' ? this.#states.get(entity as Entity) : undefined;
    if (state === undefined) fail('UNKNOWN_ENTITY', 'entidad no configurada');
    if (state.done) fail('CURSOR_MISMATCH', 'la entidad ya termino');

    const cursorIn = parseCursor(cursor);
    if (cursorIn !== state.expectedCursor) {
      if (cursorIn !== null && state.usedCursors.has(cursorIn)) fail('CURSOR_LOOP', 'cursor ya consumido');
      fail('CURSOR_MISMATCH', 'cursor distinto del nextCursor anterior');
    }

    if (typeof page !== 'object' || page === null) fail('INVALID_INPUT', 'page debe ser un objeto');
    const source = page as Record<string, unknown>;
    const rawIds = source.ids;
    const rawNext = source.nextCursor;
    const rawTotal = source.total;

    if (!Array.isArray(rawIds)) fail('INVALID_INPUT', 'ids debe ser un array');
    const nextCursor = parseCursor(rawNext);
    if (rawTotal !== undefined && !isSafeInteger(rawTotal, 0)) {
      fail('INVALID_INPUT', 'total debe ser un entero seguro >= 0');
    }
    const declaredTotal = rawTotal as number | undefined;

    const length = rawIds.length;
    if (length === 0 && nextCursor !== null) fail('EMPTY_PAGE', 'pagina vacia con cursor siguiente');
    if (this.#totalPages + 1 > this.#maxPages) fail('LIMIT_EXCEEDED', 'maxPages superado');
    if (length > this.#maxRecords - this.#totalRecords) fail('LIMIT_EXCEEDED', 'maxRecords superado');

    const pageIds = new Set<string>();
    for (let i = 0; i < length; i += 1) {
      const id: unknown = rawIds[i];
      if (!isCanonicalString(id)) fail('INVALID_INPUT', 'id debe ser un string canonico no vacio');
      if (pageIds.has(id) || state.ids.has(id)) fail('DUPLICATE_ID', 'id duplicado en la misma entidad');
      pageIds.add(id);
    }

    if (nextCursor !== null && (nextCursor === cursorIn || state.usedCursors.has(nextCursor))) {
      fail('CURSOR_LOOP', 'nextCursor repite un cursor ya usado');
    }

    if (declaredTotal !== undefined && state.total !== undefined && declaredTotal !== state.total) {
      fail('TOTAL_CHANGED', 'el total declarado cambio');
    }
    const effectiveTotal = declaredTotal ?? state.total;
    if (nextCursor === null && effectiveTotal !== undefined && effectiveTotal !== state.ids.size + pageIds.size) {
      fail('COUNT_MISMATCH', 'el total declarado no coincide con los IDs unicos');
    }

    // Aplicacion: a partir de aqui nada puede fallar.
    for (const id of pageIds) state.ids.add(id);
    if (cursorIn !== null) state.usedCursors.add(cursorIn);
    state.expectedCursor = nextCursor;
    state.done = nextCursor === null;
    state.pages += 1;
    state.records += pageIds.size;
    state.total = effectiveTotal;
    this.#totalPages += 1;
    this.#totalRecords += pageIds.size;
  }
}
