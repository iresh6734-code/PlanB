// Plan B Verifica · lectura de las entradas que aporta el vendedor: capturas del CRM y cifras declaradas.
// Una sola pieza para los scripts (que las leen de archivos) y para el servidor local (que las recibe de la pantalla).
// Puro: valida la forma y devuelve el objeto o lanza VerificaInputError con un mensaje para la persona. Un texto que no
// es JSON deja pasar el SyntaxError de JSON.parse, para que cada llamador lo explique a su manera.
import type { VerificaCapture, VerificaDeclarations, VerificaInvoice } from './model.js';

export class VerificaInputError extends Error { constructor(message: string) { super(message); this.name = 'VerificaInputError'; } }

/** Lectores que producen capturas de Verifica. */
export const CAPTURE_SOURCES: ReadonlySet<string> = new Set(['fixture', 'hubspot', 'pipedrive', 'export']);

/** `label` nombra la entrada en el mensaje de error (en los scripts, la opción: «--previous»). */
export function parseCaptureText(text: string, label: string): VerificaCapture {
  const value = JSON.parse(text) as Partial<VerificaCapture> | null;
  if (!value || !CAPTURE_SOURCES.has(value.source as string) || typeof value.id !== 'string' || typeof value.capturedAt !== 'string' || Number.isNaN(Date.parse(value.capturedAt))
    || typeof value.historyAvailable !== 'boolean' || ![value.owners, value.companies, value.contacts, value.deals].every(Array.isArray)) {
    throw new VerificaInputError(label + ' no es una captura de Verifica.');
  }
  return value as VerificaCapture;
}

export const DECLARATION_KEYS = ['openPipelineAmount', 'activeCustomers', 'renewalRate'] as const;

export function parseDeclarationsText(text: string, label: string): VerificaDeclarations {
  const value = JSON.parse(text) as Record<string, unknown> | null;
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new VerificaInputError(label + ' tiene que ser un objeto JSON.');
  const out: VerificaDeclarations = {};
  for (const [key, raw] of Object.entries(value)) {
    if (key !== 'openPipelineAmount' && key !== 'activeCustomers' && key !== 'renewalRate') throw new VerificaInputError(label + ' solo admite openPipelineAmount, activeCustomers y renewalRate.');
    if (typeof raw !== 'number' || !Number.isFinite(raw) || raw < 0 || (key === 'renewalRate' && raw > 1)) throw new VerificaInputError(label + ': ' + key + ' tiene que ser un número ' + (key === 'renewalRate' ? 'entre 0 y 1.' : 'no negativo.'));
    out[key] = raw;
  }
  return out;
}

/** La entrada de la sala limpia, igual para el script y para el servidor local: el corte es la fecha de la captura más
 *  reciente. Así un mismo juego de fuentes (con la misma sal y llave) da el mismo informe por los dos caminos. */
export function cleanRoomInput(sources: { previous: VerificaCapture | null; latest: VerificaCapture; invoices: VerificaInvoice[] | null; declarations: VerificaDeclarations }) {
  return { asOf: sources.latest.capturedAt, previous: sources.previous, latest: sources.latest, invoices: sources.invoices, declarations: sources.declarations };
}
