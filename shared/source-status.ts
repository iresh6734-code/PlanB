import { z } from 'zod';
import { commitmentId } from './commitments.js';
import { describeStop, isReadingFresh, sourceReading, sourceStops, type SourceReading, type SourceStop } from './source-reading.js';

// ESTADO DE FUENTE PARA INTEGRACIONES (unidad Claude B · CLAUDE-SOURCE-INTEGRATIONS-CONTRACT · R3). Contrato MÍNIMO y derivación PURA de lo que Integraciones (o el Radar) necesita mostrar de una fuente de lectura
// (Zendesk, Pipedrive…) a partir de una `SourceReading` ya aceptada. NO monta nada, NO lee red y NO es una verdad de conexión nueva: reutiliza la cobertura y la causa de parada de la lectura.
//
// LÍMITE DE CONFIANZA (R2). `SourceReading` y `sourceRegistryEntry` son datos que el anfitrión CONFÍA: no son firmas ni autenticación de procedencia. La entrada de registro (cuenta, identidad observada, autorización,
// alcance) la declara el anfitrión; esta derivación solo comprueba su coherencia con la lectura (proveedor, cuenta, objeto, cronología). El anfitrión tiene que AUTENTICAR la identidad y la autorización y comprobar cuenta,
// objeto y alcance AL EJECUTAR cada lectura: esta derivación no sustituye ese control ni lo realiza.
//
// Niveles que nunca se confunden:
//   · implementation-prepared  el adaptador existe; no hay ninguna lectura ni intento.
//   · fixture-reading          lectura de ENSAYO con datos (proveedor «*-fixture», ficticios): NO acredita acceso al proveedor.
//   · attempt-without-data     se INTENTÓ leer y no se obtuvo ninguna página: no es una lectura observada (de ensayo ni real). Conserva causa y siguiente acción; el recuento queda desconocido, nunca cero.
//   · provider-observed        lectura de un proveedor REAL que SÍ devolvió datos (completa o parcial), con cuenta configurada y una autorización registrada ANTERIOR o IGUAL al inicio de la lectura.
// Evidencia del intento (`evidence`), porque «se llamó a fetch» o «hubo un error» no es lo mismo que «el proveedor respondió con datos»:
//   · data              llegó al menos una página utilizable.
//   · not-sent          no salió ninguna petición (credencial ausente, cancelación previa, presupuesto, petición bloqueada).
//   · no-response       salió una petición y falló la red ANTES de recibir ninguna respuesta (el recibo lo sabe: causa `network`).
//   · interrupted       salió una petición y se interrumpió por plazo o cancelación antes de completar una página. El recibo NO distingue si ya habían llegado las cabeceras (la interrupción pudo ocurrir esperando
//                       las cabeceras o durante el cuerpo): no se afirma que no llegara respuesta ni que llegara. Conserva causa, acción y recuento desconocido.
//   · error-response    el proveedor respondió con un error HTTP (permisos, acceso, límite, no encontrado, error propio): una respuesta, pero sin datos.
//   · unusable-response llegó una respuesta que no se pudo usar (ilegible, truncada, demasiado grande, valor sin interpretar).
// `connected` es SIEMPRE false en este contrato (conectar exigiría otra evidencia que no se define aquí). La vista lleva recuentos, nunca texto de registros ni credenciales; un fallo NO es cero registros.
export const SOURCE_STATUS_FORMAT = 'planb-source-status-v1' as const;
export const readinessLevels = ['implementation-prepared', 'fixture-reading', 'attempt-without-data', 'provider-observed'] as const;
export const evidenceKinds = ['data', 'not-sent', 'no-response', 'interrupted', 'error-response', 'unusable-response'] as const;
export const accessStates = ['not-attempted', 'data-obtained', 'denied', 'unknown'] as const;
export const nextActions = ['configure-account', 'request-authorization', 'run-explicit-read', 'retry-later', 'review-permissions', 'review-account', 'none'] as const;
export type ReadinessLevel = (typeof readinessLevels)[number];
export type EvidenceKind = (typeof evidenceKinds)[number];
export type AccessState = (typeof accessStates)[number];
export type NextAction = (typeof nextActions)[number];

const iso = z.iso.datetime();
const label = z.string().trim().min(1).max(160);
const text = z.string().trim().min(1).max(400);
const objectType = z.string().regex(/^[a-z][a-z-]{0,39}$/);

/** Lo que el anfitrión sabe de la fuente (persistido localmente por Codex en el montaje); la derivación no lo modifica. Son datos CONFIADOS, no autenticados. */
export const sourceRegistryEntry = z.object({
  /** Proveedor tal como lo produce el adaptador: `zendesk`, `pipedrive` o su variante `-fixture`. */
  provider: commitmentId,
  label,
  /** Cuenta que la persona configuró (subdominio, dominio…). null = todavía sin configurar. */
  accountId: label.nullable(),
  /** Cuenta comprobada con una respuesta del proveedor (identidad OBSERVADA). null = no comprobada. */
  observedAccount: z.object({ accountId: label, at: iso }).strict().nullable(),
  /** Autorización explícita de la persona para leer ESTA cuenta con este alcance, declarada por el anfitrión. `objectTypes` (opcional) restringe los objetos: una lectura de otro objeto no queda respaldada. */
  authorization: z.object({ authorizedAt: iso, scope: label, objectTypes: z.array(objectType).min(1).max(8).optional() }).strict().nullable(),
}).strict();

export const sourceStatusView = z.object({
  format: z.literal(SOURCE_STATUS_FORMAT),
  provider: commitmentId,
  label,
  accountId: label.nullable(),
  accountIdentity: z.enum(['none', 'configured', 'observed']),
  level: z.enum(readinessLevels),
  /** Siempre false: ver el comentario del módulo. */
  connected: z.literal(false),
  authorizedAt: iso.nullable(),
  /** Qué evidencia hay del último intento (null si no hay ninguno). */
  evidence: z.enum(evidenceKinds).nullable(),
  /** Acceso según el último intento: no es una promesa de acceso actual. */
  access: z.enum(accessStates),
  /** true solo si la lectura llegó al final y devolvió cero registros visibles: distinto de no tener recibos locales (`reading: null`). */
  emptyListing: z.boolean(),
  reading: z.object({
    objectType, mode: z.enum(['listing', 'lookup']), at: iso, coverage: z.enum(['complete', 'partial', 'unavailable']),
    stoppedBy: z.enum(sourceStops).nullable(), cause: label,
    /** null cuando no se leyó nada (no disponible): un fallo NO es cero registros. */
    records: z.number().int().min(0).nullable(), pages: z.number().int().min(0), requests: z.number().int().min(0), skipped: z.number().int().min(0),
    retryAfterSeconds: z.number().int().min(0).max(3600).nullable(), fresh: z.boolean(),
  }).strict().nullable(),
  nextAction: z.enum(nextActions),
  statements: z.array(text).min(1).max(10),
}).strict().superRefine((view, ctx) => {
  const bad = (message: string) => ctx.addIssue({ code: 'custom', message });
  const fixture = view.provider.endsWith('-fixture');
  if (view.level === 'fixture-reading' && !fixture) bad('Una lectura de ensayo es de un proveedor -fixture');
  if (fixture && view.level === 'provider-observed') bad('Un proveedor de ensayo nunca es «observado en proveedor»');
  if (view.level === 'implementation-prepared' && (view.reading !== null || view.evidence !== null)) bad('Sin lectura no hay detalle ni evidencia');
  if (view.level !== 'implementation-prepared' && (view.reading === null || view.evidence === null)) bad('Con lectura o intento hace falta su detalle y su evidencia');
  if ((view.level === 'fixture-reading' || view.level === 'provider-observed') && view.evidence !== 'data') bad('Una lectura con ese nivel exige datos observados');
  if (view.level === 'attempt-without-data' && view.evidence === 'data') bad('Un intento con datos es una lectura');
  if (view.level === 'provider-observed' && (view.authorizedAt === null || view.accountId === null || view.accountIdentity === 'none')) bad('Una lectura observada exige cuenta y autorización');
  if (view.accountIdentity === 'none' && view.accountId !== null) bad('Cuenta sin identidad declarada');
  if (view.reading && view.reading.coverage === 'unavailable' && view.reading.records !== null) bad('Una lectura no disponible no tiene recuento de registros');
  if (view.reading && view.reading.coverage !== 'unavailable' && view.reading.records === null) bad('Una lectura con datos tiene recuento');
  if (view.reading && (view.reading.coverage === 'unavailable') === (view.evidence === 'data')) bad('La evidencia de datos y la cobertura no coinciden');
  if (view.reading && view.evidence === 'not-sent' && view.reading.requests !== 0) bad('Sin petición enviada no hay peticiones contadas');
  if (view.reading && view.evidence !== null && view.evidence !== 'not-sent' && view.reading.requests === 0) bad('Una petición enviada se cuenta');
  if (view.emptyListing && !(view.reading && view.reading.coverage === 'complete' && view.reading.records === 0 && view.reading.mode === 'listing')) bad('Un listado vacío es una lectura completa sin registros');
  if (view.access === 'data-obtained' && view.evidence !== 'data') bad('Acceso con datos exige datos');
  if (view.access === 'not-attempted' && view.evidence !== null && view.evidence !== 'not-sent') bad('Acceso no intentado solo sin petición enviada');
});
export type SourceRegistryEntry = z.infer<typeof sourceRegistryEntry>;
export type SourceStatusView = z.infer<typeof sourceStatusView>;

export class SourceStatusError extends Error {
  constructor(public readonly code: 'READING_WITHOUT_AUTHORIZATION' | 'READING_OF_OTHER_ACCOUNT' | 'READING_OF_OTHER_PROVIDER' | 'AUTHORIZATION_AFTER_READING' | 'READING_OUTSIDE_AUTHORIZED_SCOPE', message: string) { super(message); this.name = 'SourceStatusError'; }
}

const providerErrors = new Set<SourceStop>(['unauthorized', 'forbidden', 'not-found', 'rate-limited', 'server-error', 'client-error', 'redirect']);
const unusable = new Set<SourceStop>(['malformed', 'oversize', 'truncated', 'unsupported-value']);
const actionByStop: Partial<Record<SourceStop, NextAction>> = {
  forbidden: 'review-permissions', unauthorized: 'review-account', 'rate-limited': 'retry-later', timeout: 'retry-later', network: 'retry-later', 'server-error': 'retry-later', truncated: 'retry-later',
  oversize: 'review-permissions', aborted: 'run-explicit-read', budget: 'run-explicit-read', 'page-budget': 'run-explicit-read', 'record-budget': 'run-explicit-read',
};

/** Qué evidencia dejó la lectura. Los adaptadores aceptados construyen `unavailable` solo con cero páginas; una lectura con páginas utilizables es `data`. */
export function evidenceOf(reading: Pick<SourceReading, 'coverage' | 'requests' | 'stoppedBy'>): EvidenceKind {
  if (reading.coverage !== 'unavailable') return 'data';
  if (reading.requests === 0) return 'not-sent';
  if (reading.stoppedBy && providerErrors.has(reading.stoppedBy)) return 'error-response';
  if (reading.stoppedBy && unusable.has(reading.stoppedBy)) return 'unusable-response';
  if (reading.stoppedBy === 'timeout' || reading.stoppedBy === 'aborted') return 'interrupted';   // R3: plazo o cancelación con petición enviada: no se sabe si llegaron cabeceras
  return 'no-response';
}

/**
 * R3 · Orden de dos instantes ISO con TODA la precisión que admite el esquema compartido (hasta nueve decimales). `Date.parse` trunca a milisegundos: `.000001Z` parecería igual a `.000Z`.
 * Devuelve true si `a` es ESTRICTAMENTE posterior a `b`.
 */
const fraction = (value: string) => ((/\.(\d+)/.exec(value)?.[1] ?? '').padEnd(9, '0')).slice(3);
export const isLaterInstant = (a: string, b: string): boolean => { const x = Date.parse(a), y = Date.parse(b); return x > y || (x === y && fraction(a) > fraction(b)); };

/**
 * Deriva la vista de una fuente. Pura: sin red, sin reloj propio (`now` lo da el llamador) y sin leer ninguna credencial. Lanza `SourceStatusError` si la lectura no corresponde a la entrada (otro proveedor o
 * cuenta), es de un proveedor real sin autorización registrada, la autorización es POSTERIOR al inicio de la lectura (no respalda retrospectivamente) o el objeto leído queda fuera de los objetos autorizados.
 */
export function describeSourceStatus(entryInput: unknown, readingInput: SourceReading | null, now: number): SourceStatusView {
  const entry = sourceRegistryEntry.parse(entryInput), reading = readingInput === null ? null : sourceReading.parse(readingInput);
  const fixture = entry.provider.endsWith('-fixture');
  if (reading) {
    if (reading.provider !== entry.provider) throw new SourceStatusError('READING_OF_OTHER_PROVIDER', 'La lectura es de otro proveedor que la entrada.');
    if (reading.accountId !== entry.accountId) throw new SourceStatusError('READING_OF_OTHER_ACCOUNT', 'La lectura es de otra cuenta que la configurada.');
    if (!fixture) {
      if (!entry.authorization) throw new SourceStatusError('READING_WITHOUT_AUTHORIZATION', 'Una lectura de un proveedor real exige una autorización explícita registrada.');
      if (isLaterInstant(entry.authorization.authorizedAt, reading.startedAt)) throw new SourceStatusError('AUTHORIZATION_AFTER_READING', 'La autorización es posterior al inicio de la lectura: no la respalda.');
      if (entry.authorization.objectTypes && !entry.authorization.objectTypes.includes(reading.objectType)) throw new SourceStatusError('READING_OUTSIDE_AUTHORIZED_SCOPE', 'El objeto leído no está entre los objetos autorizados.');
    }
  }
  const identity: SourceStatusView['accountIdentity'] = entry.accountId === null ? 'none' : entry.observedAccount && entry.observedAccount.accountId === entry.accountId ? 'observed' : 'configured';
  const evidence = reading ? evidenceOf(reading) : null;
  const level: ReadinessLevel = reading === null ? 'implementation-prepared' : evidence !== 'data' ? 'attempt-without-data' : fixture ? 'fixture-reading' : 'provider-observed';
  const skipped = reading ? reading.skipped.unknownValue + reading.skipped.malformed + reading.skipped.duplicates : 0;
  const detail = reading ? {
    objectType: reading.objectType, mode: reading.mode, at: reading.completedAt, coverage: reading.coverage, stoppedBy: reading.stoppedBy, cause: describeStop(reading.stoppedBy),
    records: reading.coverage === 'unavailable' ? null : reading.records.length, pages: reading.pages, requests: reading.requests, skipped, retryAfterSeconds: reading.retryAfterSeconds, fresh: isReadingFresh(reading, now),
  } : null;
  const emptyListing = !!detail && detail.coverage === 'complete' && detail.records === 0 && detail.mode === 'listing';
  const access: AccessState = !reading || evidence === 'not-sent' ? 'not-attempted' : evidence === 'data' ? 'data-obtained' : evidence === 'error-response' && (reading.stoppedBy === 'forbidden' || reading.stoppedBy === 'unauthorized') ? 'denied' : 'unknown';
  let nextAction: NextAction;
  if (entry.accountId === null) nextAction = 'configure-account';
  else if (!fixture && !entry.authorization) nextAction = 'request-authorization';
  else if (!reading) nextAction = 'run-explicit-read';
  else if (reading.coverage === 'complete') nextAction = detail!.fresh ? 'none' : 'run-explicit-read';
  else nextAction = (reading.stoppedBy && actionByStop[reading.stoppedBy]) || 'run-explicit-read';
  const statements: string[] = [];
  if (level === 'implementation-prepared') statements.push('Implementación preparada: todavía no se ha realizado ninguna lectura.', 'Sin recibos locales: no hay ninguna lectura ni intento guardados para esta fuente (no es lo mismo que un listado vacío).');
  if (level === 'fixture-reading') statements.push('Lectura de ensayo con datos ficticios: no acredita acceso a ' + entry.label + '.');
  if (level === 'provider-observed') statements.push('Lectura realizada en el proveedor con la cuenta ' + (identity === 'observed' ? 'comprobada' : 'configurada') + ' ' + entry.accountId + (identity === 'configured' ? ' (la identidad no se ha comprobado con una respuesta del proveedor)' : '') + '.');
  if (level === 'attempt-without-data') {
    statements.push((fixture ? 'Intento de lectura de ensayo' : 'Intento de lectura') + ' sin ningún dato: no es una lectura observada' + (fixture ? ' y los datos serían ficticios' : '') + '.');
    statements.push(evidence === 'not-sent' ? 'No llegó a enviarse ninguna petición.' : evidence === 'no-response' ? 'Se envió la petición y falló la red antes de recibir respuesta.' : evidence === 'interrupted' ? 'La petición salió y se interrumpió (plazo agotado o cancelación) antes de completar una página: no se sabe si la fuente llegó a responder.' : evidence === 'error-response' ? 'El proveedor respondió con un error: no se observaron datos.' : 'Llegó una respuesta que no se pudo usar.');
  }
  if (detail?.coverage === 'unavailable') statements.push('No se leyó nada (' + detail.cause + '): esto no significa que no haya registros.');
  if (detail?.coverage === 'partial') statements.push('Lectura parcial (' + detail.cause + '): los recuentos son una cota inferior.');
  if (detail?.coverage === 'complete') statements.push(emptyListing ? 'Listado observado vacío: se leyó hasta el final y no devolvió registros visibles con esa credencial (distinto de no tener recibos locales).' : 'Lectura completa de lo visible con esa credencial: no es una captura atómica ni el inventario íntegro de la cuenta.');
  if (detail && detail.coverage !== 'unavailable' && !detail.fresh) statements.push('La lectura es antigua: vuelve a leer con una acción explícita.');
  if (skipped > 0) statements.push(skipped + ' registro(s) omitidos por no poder interpretarse con seguridad.');
  statements.push('No conectado: este estado no prueba una conexión ni se actualiza solo.');
  return sourceStatusView.parse({ format: SOURCE_STATUS_FORMAT, provider: entry.provider, label: entry.label, accountId: entry.accountId, accountIdentity: identity, level, connected: false, authorizedAt: entry.authorization?.authorizedAt ?? null, evidence, access, emptyListing, reading: detail, nextAction, statements });
}

// ───────────────────────── Matriz de textos y acciones de producto ─────────────────────────
/** Texto de la acción siguiente. La interfaz nunca ofrece «Conectar»: las lecturas externas son acciones explícitas con cuenta y alcance autorizados. */
export const ACTION_LABEL: Record<NextAction, string> = {
  'configure-account': 'Configurar la cuenta', 'request-authorization': 'Autorizar la lectura de esta cuenta', 'run-explicit-read': 'Leer ahora (acción explícita)', 'retry-later': 'Reintentar más tarde',
  'review-permissions': 'Revisar los permisos concedidos', 'review-account': 'Revisar el acceso de la cuenta', none: 'Sin acción pendiente',
};
const EVIDENCE_HEAD: Record<Exclude<EvidenceKind, 'data'>, string> = { 'not-sent': 'Intento sin petición', 'no-response': 'Intento sin respuesta', interrupted: 'Intento interrumpido', 'error-response': 'El proveedor respondió con un error', 'unusable-response': 'Respuesta que no se pudo usar' };

/** Titular, detalle y etiqueta de acción para una vista. Fuente única de redacción: configuración preparada, ensayo ficticio, intento sin lectura útil, lectura parcial y lectura observada dentro del alcance. */
export function describeSourceHeadline(view: SourceStatusView): { headline: string; detail: string; action: string; tone: 'neutral' | 'info' | 'warning' | 'ok' } {
  const action = ACTION_LABEL[view.nextAction], r = view.reading;
  const account = view.accountId === null ? 'sin cuenta configurada' : view.accountIdentity === 'observed' ? 'cuenta comprobada ' + view.accountId : 'cuenta configurada ' + view.accountId + ' (identidad sin comprobar)';
  if (view.level === 'implementation-prepared') return { headline: 'Configuración preparada · sin lecturas', detail: view.label + ' · ' + account + '. Todavía no hay recibos locales: no se ha intentado ninguna lectura.', action, tone: 'neutral' };
  if (view.level === 'attempt-without-data') return { headline: EVIDENCE_HEAD[view.evidence as Exclude<EvidenceKind, 'data'>] + ' · recuento desconocido', detail: view.label + ' · ' + account + '. Causa: ' + r!.cause + '. No se observaron datos: el número de registros se desconoce (no es cero).' + (view.provider.endsWith('-fixture') ? ' Intento de ensayo con datos ficticios.' : ''), action, tone: 'warning' };
  if (view.level === 'fixture-reading') return { headline: (r!.coverage === 'partial' ? 'Lectura de ensayo parcial' : view.emptyListing ? 'Lectura de ensayo: listado vacío' : 'Lectura de ensayo') + ' · datos ficticios', detail: view.label + ' · ' + account + '. ' + (r!.coverage === 'partial' ? 'Cobertura parcial (' + r!.cause + '): al menos ' + r!.records + ' registro(s). ' : view.emptyListing ? 'Se leyó hasta el final y no hubo registros. ' : r!.records + ' registro(s) en la lectura de ensayo. ') + 'No acredita acceso a ' + view.label + '.', action, tone: 'info' };
  const freshness = r!.fresh ? 'reciente' : 'antigua';
  return { headline: (r!.coverage === 'partial' ? 'Lectura parcial observada' : view.emptyListing ? 'Listado observado vacío' : 'Lectura observada') + ' · ' + freshness, detail: view.label + ' · ' + account + (view.authorizedAt ? '. Autorizada antes de leer.' : '') + ' ' + (r!.coverage === 'partial' ? 'Cobertura parcial (' + r!.cause + '): al menos ' + r!.records + ' registro(s).' : view.emptyListing ? 'Se leyó hasta el final y no hubo registros visibles con esa credencial.' : r!.records + ' registro(s) visibles con esa credencial; no es el inventario íntegro.') + ' Acceso según el último intento: datos obtenidos.', action, tone: r!.coverage === 'partial' || !r!.fresh ? 'warning' : 'ok' };
}
