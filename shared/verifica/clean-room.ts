// Plan B Verifica · sala limpia (fase 2). Se ejecuta en el lado del vendedor y solo deja salir el informe.
// Antes de soltarlo comprueba que no lleva nada del CRM: nombres, correos, NIF ni IDs. Si encuentra algo, no sale nada.
// Las capturas, las facturas y la sal quedan en la copia custodiada (custody.ts), cifrada con una llave aparte.
import { newCustodyKey, sealCustody, type CustodyEnvelope } from './custody.js';
import type { VerificaCapture, VerificaInvoice } from './model.js';
import { buildVerificaReport, reportToJson, type ReportInput, type VerificaReport } from './report.js';

export class CleanRoomError extends Error {
  constructor(readonly leaks: number, message: string) { super(message); this.name = 'CleanRoomError'; }
}

const fold = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

/**
 * Textos del CRM que nunca pueden salir en el informe.
 * Nombres: solo los de dos palabras o más y 8 caracteres o más, comparados sin tildes ni mayúsculas; un nombre de una
 * sola palabra («Acme») podría coincidir con el texto fijo del informe y bloquearlo sin motivo.
 * Correos y NIF: tal cual. IDs: entre comillas, es decir, como valor exacto de un campo del JSON.
 */
export function sensitiveTexts(input: Pick<ReportInput, 'previous' | 'latest' | 'invoices'>): { folded: string[]; quoted: string[] } {
  return sensitiveTextsOf([input.previous, input.latest].filter((c): c is VerificaCapture => c !== null), input.invoices);
}

export function sensitiveTextsOf(captures: readonly VerificaCapture[], invoices: readonly VerificaInvoice[] | null): { folded: string[]; quoted: string[] } {
  const names = new Set<string>(), exact = new Set<string>(), ids = new Set<string>();
  const name = (value: string | null | undefined) => { if (value) { const f = fold(value); if (f.length >= 8 && f.includes(' ')) names.add(f); } };
  for (const capture of captures) {
    for (const o of capture.owners) { ids.add(o.id); name(o.name); }
    for (const c of capture.companies) { ids.add(c.id); name(c.name); if (c.taxId) exact.add(fold(c.taxId)); }
    for (const p of capture.contacts) { ids.add(p.id); name(p.name); if (p.email) exact.add(fold(p.email)); }
    for (const d of capture.deals) { ids.add(d.id); name(d.name); }
  }
  for (const invoice of invoices ?? []) ids.add(invoice.id);
  return { folded: [...names, ...exact], quoted: [...ids].map(id => JSON.stringify(id)) };
}

/** Textos de esas capturas y facturas que aparecen en un JSON que va a salir (informe o parte de vigilancia). */
export function leaksIn(json: string, captures: readonly VerificaCapture[], invoices: readonly VerificaInvoice[] | null): string[] {
  const folded = fold(json);
  const { folded: texts, quoted } = sensitiveTextsOf(captures, invoices);
  return [...texts.filter(text => folded.includes(text)), ...quoted.filter(id => json.includes(id))];
}

/** Textos del CRM que aparecen en el informe. Solo para mostrarlos en el equipo del vendedor, nunca en un mensaje que salga. */
export function findLeaks(report: VerificaReport, input: Pick<ReportInput, 'previous' | 'latest' | 'invoices'>): string[] {
  return leaksIn(reportToJson(report), [input.previous, input.latest].filter((c): c is VerificaCapture => c !== null), input.invoices);
}

/** Cuántos textos del CRM aparecen en el informe. No dice cuáles, para no sacarlos por el mensaje de error. */
export const countLeaks = (report: VerificaReport, input: Pick<ReportInput, 'previous' | 'latest' | 'invoices'>): number => findLeaks(report, input).length;

export interface CleanRoomOutput {
  report: VerificaReport;
  custody: CustodyEnvelope;
  /** Llave de la copia. Se entrega aparte de la copia, a quien la custodie; nunca junto al informe. */
  key: string;
}

/** Sal nueva para los seudónimos: 32 bytes aleatorios. Queda dentro de la copia custodiada. */
export const newSalt = () => Array.from(globalThis.crypto.getRandomValues(new Uint8Array(32)), b => b.toString(16).padStart(2, '0')).join('');

/** El informe que puede salir del lado del vendedor. Para si encuentra algún texto del CRM. */
export function releaseReport(input: ReportInput): VerificaReport {
  const report = buildVerificaReport(input);
  const leaks = countLeaks(report, input);
  if (leaks) throw new CleanRoomError(leaks, 'El informe lleva ' + leaks + (leaks === 1 ? ' texto' : ' textos') + ' del CRM (nombres, correos, NIF o IDs). No sale nada.');
  return report;
}

/** Sala limpia completa: informe comprobado, copia custodiada y su llave. */
export async function runCleanRoom(input: Omit<ReportInput, 'salt'>, options: { salt?: string; key?: string } = {}): Promise<CleanRoomOutput> {
  const full: ReportInput = { ...input, salt: options.salt ?? newSalt() };
  const report = releaseReport(full);
  const key = options.key ?? newCustodyKey();
  return { report, custody: await sealCustody(full, report, key), key };
}
