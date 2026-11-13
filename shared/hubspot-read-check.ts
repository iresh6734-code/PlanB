// Contrato de la comprobación de LECTURA de HubSpot. Un estado «verificado» solo existe si hay una respuesta real del proveedor y reciente;
// lo guardado (credencial, fecha de cuando se guardó) nunca equivale a acceso actual. Sin secretos: este tipo no admite credenciales.
export const READ_CHECK_ENTITIES = ['contacts', 'companies', 'deals', 'tasks'] as const;
export type ReadCheckEntity = typeof READ_CHECK_ENTITIES[number];
/** Cuánto tiempo una respuesta positiva sigue considerándose «reciente». Pasado ese plazo el estado vuelve a «sin comprobar». */
export const READ_CHECK_TTL_MS = 15 * 60 * 1000;

export type ReadCheckState =
  | 'not_configured'            // no hay credencial guardada
  | 'saved_unchecked'           // hay configuración guardada; el acceso actual NO se ha comprobado (o la comprobación caducó)
  | 'checking'                  // comprobación en curso
  | 'read_verified'             // el proveedor respondió: identidad y lectura de los cuatro objetos, hace poco
  | 'partial'                   // identidad correcta, pero solo se pudo leer una parte de los objetos
  | 'rejected'                  // el proveedor no acepta la credencial (401)
  | 'insufficient_permissions'  // identidad o lectura denegadas (403)
  | 'unavailable'               // sin respuesta útil: red, tiempo agotado, límite de uso, 5xx o respuesta no válida
  | 'identity_mismatch'         // la credencial pertenece a otro portal
  | 'account_type_mismatch';    // el tipo de cuenta no coincide con el modo elegido (ensayo/real)

/** «rehearsal»: cuenta de ensayo del proveedor (DEVELOPER_TEST/SANDBOX). «real»: STANDARD. Ninguna es la simulación local de Plan B. */
export type ReadCheckEnvironment = 'rehearsal' | 'real' | 'unknown';
export type ObjectOutcome = 'readable' | 'forbidden' | 'rejected' | 'unavailable' | 'malformed' | 'not_attempted';
export interface ObjectReadResult { entity: ReadCheckEntity; outcome: ObjectOutcome; httpStatus: number | null }

export interface ReadCheckResult {
  state: Exclude<ReadCheckState, 'not_configured' | 'saved_unchecked' | 'checking'> ;
  /** Siempre «provider_response» cuando hubo una respuesta del proveedor, «none» si no llegó ninguna. */
  evidence: 'provider_response' | 'none';
  environment: ReadCheckEnvironment;
  /** Solo se devuelve si coincide con el portal esperado (no se expone el de otra cuenta). */
  accountId: string | null;
  accountType: string | null;
  checkedAt: string;
  freshUntil: string;
  objects: ObjectReadResult[];
  retryAfterSeconds: number | null;
  message: string;
}

export interface ReadCheckView { state: ReadCheckState; fresh: boolean; label: string; detail: string; environment: ReadCheckEnvironment; checkedAt: string | null }
const LABEL: Record<ReadCheckState, string> = {
  not_configured: 'Sin configurar', saved_unchecked: 'Configuración guardada · acceso sin comprobar', checking: 'Comprobando…', read_verified: 'Lectura comprobada',
  partial: 'Lectura parcial', rejected: 'Acceso rechazado', insufficient_permissions: 'Permisos insuficientes', unavailable: 'Servicio no disponible', identity_mismatch: 'Portal distinto', account_type_mismatch: 'Tipo de cuenta distinto',
};
/** Estado que se muestra AHORA: una comprobación positiva caducada o inexistente nunca se presenta como acceso actual. */
export function viewOfReadCheck(input: { configured: boolean; checking?: boolean; last: ReadCheckResult | null; now: number }): ReadCheckView {
  const { last, now } = input;
  if (!input.configured) return { state: 'not_configured', fresh: false, label: LABEL.not_configured, detail: 'No hay credencial guardada.', environment: 'unknown', checkedAt: null };
  if (input.checking) return { state: 'checking', fresh: false, label: LABEL.checking, detail: 'Esperando la respuesta de HubSpot.', environment: last?.environment ?? 'unknown', checkedAt: last?.checkedAt ?? null };
  if (!last) return { state: 'saved_unchecked', fresh: false, label: LABEL.saved_unchecked, detail: 'Hay configuración guardada, pero no se ha comprobado el acceso actual.', environment: 'unknown', checkedAt: null };
  const until = Date.parse(last.freshUntil), fresh = Number.isFinite(until) && now <= until;
  if (!fresh) return { state: 'saved_unchecked', fresh: false, label: LABEL.saved_unchecked, detail: 'La última comprobación (' + LABEL[last.state].toLowerCase() + ') caducó; el acceso actual no se ha vuelto a comprobar.', environment: last.environment, checkedAt: last.checkedAt };
  return { state: last.state, fresh, label: LABEL[last.state] + (last.environment === 'rehearsal' ? ' · cuenta de ensayo' : last.environment === 'real' ? ' · cuenta real' : ''), detail: last.message, environment: last.environment, checkedAt: last.checkedAt };
}
