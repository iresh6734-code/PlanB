// Plan B Verifica · el encargo (fase D, corte 1): lo que el operador reúne en el equipo del vendedor antes de la sala
// limpia. Lógica pura y compartida: recibe los textos guardados de cada fuente y dice, por fuente, si sirve, qué es y su
// huella, calculada exactamente como la del informe (fingerprintOf del objeto que entra en la sala limpia). Así lo que la
// pantalla enseña coincide con las fuentes que luego firma el informe y con lo que dan los scripts.
import { importInvoices, InvoiceImportError } from './invoices.js';
import { parseCaptureText, parseDeclarationsText, VerificaInputError } from './inputs.js';
import type { VerificaCapture, VerificaDeclarations, VerificaInvoice } from './model.js';
import { describeCapture, fingerprintOf } from './report.js';

export const ENGAGEMENT_ROLES = ['previous', 'latest', 'invoices', 'declarations'] as const;
export type EngagementRole = typeof ENGAGEMENT_ROLES[number];

export const ROLE_LABEL: Record<EngagementRole, string> = {
  previous: 'Captura anterior', latest: 'Captura más reciente', invoices: 'Libro de facturas', declarations: 'Cifras declaradas por el vendedor',
};

/** Límites del encargo. `sourceBytes` es el máximo común de una fuente, en bytes UTF-8 del texto tal como se guarda, y se
 * comprueba antes de guardar en la subida, la lectura de HubSpot y la vigilancia. */
export const ENGAGEMENT_LIMITS = Object.freeze({ nameChars: 120, engagements: 50, sourceBytes: 48 * 1024 * 1024, fileNameChars: 160 });

const sizeLabel = (bytes: number, exact: boolean) => exact || bytes < 1024 * 1024
  ? String(bytes).replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ' bytes'
  : (bytes / (1024 * 1024)).toFixed(1).replace('.', ',') + ' MB';

/** El mismo aviso en todas las entradas. `what` nombra la fuente («La captura de HubSpot», «"ventas.csv"»…). */
export function sourceSizeProblem(what: string, bytes: number, limit: number = ENGAGEMENT_LIMITS.sourceBytes): string | null {
  if (bytes <= limit) return null;
  const exact = sizeLabel(bytes, false) === sizeLabel(limit, false);
  return what + ' ocupa ' + sizeLabel(bytes, exact) + ' y el máximo de una fuente del encargo es ' + sizeLabel(limit, exact) + '. No se ha guardado nada. '
    + 'Si es un archivo, expórtalo con menos periodo u objetos; si es una lectura de HubSpot, la cuenta supera lo que admite esta versión.';
}

export interface Engagement { id: string; name: string; createdAt: string; updatedAt: string }
export interface StoredSource { text: string; fileName: string; storedAt: string }
export type StoredSources = Partial<Record<EngagementRole, StoredSource>>;

export type SourceState =
  | { role: EngagementRole; status: 'missing' }
  | { role: EngagementRole; status: 'waiting'; reason: string; fileName: string; storedAt: string }
  | { role: EngagementRole; status: 'invalid'; reason: string; fileName: string; storedAt: string }
  | { role: EngagementRole; status: 'ok'; fingerprint: string; detail: string; at: string | null; notes: string[]; fileName: string; storedAt: string };

export interface EngagementView {
  engagement: Engagement;
  sources: Record<EngagementRole, SourceState>;
  /** Lo que falta para pasar a la sala limpia (corte 2). Vacío = listo. */
  missing: string[];
  /** La última emisión de la sala limpia (corte 2), si la hay. La llave nunca va aquí. */
  issue?: IssueSummary | null;
}

/** Lo que se guarda y se enseña de una emisión. `stale`: alguna fuente cambió después de emitir. */
export interface IssueSummary { issuedAt: string; reportFingerprint: string; custodyFingerprint: string; findings: number; alarms: number; stale: boolean }
/** La respuesta de emitir: lo mismo y, solo esta vez, la llave de la copia, que no se guarda en ningún sitio. */
export type IssueResult = IssueSummary & { key: string };

/** Lectura de HubSpot desde la pantalla (corte 3). `target`: dónde entra la captura; `rotate` la pone como más reciente y
 * pasa la actual a anterior. En modo cliente van la autorización (texto de autorizacion.json) y el documento firmado; en
 * modo pruebas, la confirmación de leer el portal entero. La credencial solo viaja en esta petición. */
export type ReadTarget = 'previous' | 'latest' | 'rotate';
/** El documento firmado viaja entero para comprobar su huella; la autorización es un JSON pequeño. */
export const READ_LIMITS = Object.freeze({ authorizationChars: 64 * 1024, documentBytes: 10 * 1024 * 1024 });
export interface ReadRequest {
  mode: 'client' | 'test';
  portalId: string;
  token: string;
  target: ReadTarget;
  authorization?: string;
  documentBase64?: string;
  confirmFullRead?: boolean;
}
/** Lo que la pantalla sabe de una lectura en marcha o terminada. Nunca la credencial. */
export interface ReadJob {
  state: 'running' | 'done' | 'failed';
  mode: 'client' | 'test';
  startedAt: string;
  finishedAt?: string;
  progress: string[];
  error?: string;
  result?: { captureId: string; role: 'previous' | 'latest'; counts: { owners: number; companies: number; contacts: number; deals: number }; historyAvailable: boolean; requests: number; recordFingerprint: string | null };
}
export interface RecordSummary { captureId: string; fingerprint: string; finishedAt: string; portalId: string; engagement: string }

/** Por qué una entrada no sirve, en palabras para la persona. */
export function inputProblem(error: unknown): string {
  if (error instanceof VerificaInputError || error instanceof InvoiceImportError) return error.message;
  if (error instanceof SyntaxError) return 'El archivo no es JSON válido.';
  return 'No se pudo leer el archivo.';
}

const plural = (n: number, one: string, many: string) => n.toLocaleString('es-ES') + ' ' + (n === 1 ? one : many);

function captureState(role: 'previous' | 'latest', stored: StoredSource): { state: SourceState; capture: VerificaCapture | null } {
  const base = { role, fileName: stored.fileName, storedAt: stored.storedAt };
  try {
    const capture = parseCaptureText(stored.text, ROLE_LABEL[role]);
    return { capture, state: { ...base, status: 'ok', fingerprint: fingerprintOf(capture), detail: describeCapture(capture), at: capture.capturedAt, notes: capture.historyAvailable ? [] : ['Sin historial de cambios: dos reglas no se podrán comprobar.'] } };
  } catch (error) {
    return { capture: null, state: { ...base, status: 'invalid', reason: inputProblem(error) } };
  }
}

/** Lo que entra en la sala limpia, si cada fuente presente sirve. */
export interface EngagementInputs { previous: VerificaCapture | null; latest: VerificaCapture | null; invoices: VerificaInvoice[] | null; declarations: VerificaDeclarations }

export function readEngagement(engagement: Engagement, stored: StoredSources): EngagementView & { inputs: EngagementInputs } {
  const missing: string[] = [];
  const previous = stored.previous ? captureState('previous', stored.previous) : null;
  const latest = stored.latest ? captureState('latest', stored.latest) : null;
  const sources = {} as Record<EngagementRole, SourceState>;
  sources.previous = previous?.state ?? { role: 'previous', status: 'missing' };
  sources.latest = latest?.state ?? { role: 'latest', status: 'missing' };
  if (previous?.capture && latest?.capture && Date.parse(previous.capture.capturedAt) >= Date.parse(latest.capture.capturedAt)) {
    const reason = 'La captura anterior tiene que ser anterior a la más reciente.';
    sources.previous = { role: 'previous', status: 'invalid', reason, fileName: stored.previous!.fileName, storedAt: stored.previous!.storedAt };
  }

  let invoices: VerificaInvoice[] | null = null;
  if (!stored.invoices) sources.invoices = { role: 'invoices', status: 'missing' };
  else if (!latest?.capture) sources.invoices = { role: 'invoices', status: 'waiting', reason: 'Para leer las facturas hace falta la captura más reciente: se asignan a sus empresas.', fileName: stored.invoices.fileName, storedAt: stored.invoices.storedAt };
  else {
    try {
      const imported = importInvoices(stored.invoices.text, latest.capture.companies);
      invoices = imported.invoices;
      const notes = [
        ...(imported.amountBasis === 'total' ? ['El archivo solo trae el total con IVA: el cruce por importe puede fallar.'] : []),
        ...(imported.unmatched ? [plural(imported.unmatched, 'factura no se asigna', 'facturas no se asignan') + ' a ninguna empresa del CRM.'] : []),
        ...(imported.issues.length ? [plural(imported.issues.length, 'línea descartada', 'líneas descartadas') + '.'] : []),
      ];
      sources.invoices = { role: 'invoices', status: 'ok', fingerprint: fingerprintOf(invoices), detail: plural(invoices.length, 'factura', 'facturas'), at: null, notes, fileName: stored.invoices.fileName, storedAt: stored.invoices.storedAt };
    } catch (error) {
      sources.invoices = { role: 'invoices', status: 'invalid', reason: inputProblem(error), fileName: stored.invoices.fileName, storedAt: stored.invoices.storedAt };
    }
  }

  let declarations: VerificaDeclarations = {};
  if (!stored.declarations) sources.declarations = { role: 'declarations', status: 'missing' };
  else {
    try {
      declarations = parseDeclarationsText(stored.declarations.text, ROLE_LABEL.declarations);
      const parts = [
        declarations.openPipelineAmount !== undefined ? 'cartera abierta ' + declarations.openPipelineAmount.toLocaleString('es-ES') + ' €' : null,
        declarations.activeCustomers !== undefined ? declarations.activeCustomers.toLocaleString('es-ES') + ' clientes activos' : null,
        declarations.renewalRate !== undefined ? 'renovación ' + Math.round(declarations.renewalRate * 1000) / 10 + ' %' : null,
      ].filter((p): p is string => p !== null);
      sources.declarations = { role: 'declarations', status: 'ok', fingerprint: fingerprintOf(declarations), detail: parts.length ? parts.join(', ') : 'No declara ninguna cifra', at: null, notes: [], fileName: stored.declarations.fileName, storedAt: stored.declarations.storedAt };
    } catch (error) {
      sources.declarations = { role: 'declarations', status: 'invalid', reason: inputProblem(error), fileName: stored.declarations.fileName, storedAt: stored.declarations.storedAt };
    }
  }

  if (sources.previous.status !== 'ok') missing.push(sources.previous.status === 'missing' ? 'Falta la captura anterior.' : 'La captura anterior no sirve.');
  if (sources.latest.status !== 'ok') missing.push(sources.latest.status === 'missing' ? 'Falta la captura más reciente.' : 'La captura más reciente no sirve.');
  if (sources.invoices.status === 'invalid') missing.push('El libro de facturas no sirve; quítalo o sube otro.');
  if (sources.declarations.status === 'invalid') missing.push('Las cifras declaradas no sirven; quítalas o sube otras.');
  return {
    engagement, sources, missing,
    inputs: { previous: sources.previous.status === 'ok' ? previous!.capture : null, latest: latest?.capture ?? null, invoices, declarations },
  };
}

/** Lo que se publica de un encargo: nunca los textos guardados ni los objetos de entrada, solo su descripción. */
export function engagementView(engagement: Engagement, stored: StoredSources): EngagementView {
  const { inputs: _inputs, ...view } = readEngagement(engagement, stored);
  return view;
}
