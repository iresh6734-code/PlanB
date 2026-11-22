// Plan B Verifica · utilidades de la página: abrir un documento de un archivo, fechas, huellas cortas y descarga.
import { EQUIVALENCE_FORMAT, EquivalenceFormatError, parseEquivalenceReport, type EquivalenceReport } from '../../shared/verifica/equivalence.js';
import { parseReport, ReportFormatError, type VerificaReport } from '../../shared/verifica/report.js';
import { parseWatchReport, WATCH_FORMAT, WatchInputError, type WatchReport } from '../../shared/verifica/watch.js';

export type VerificaDocument =
  | { kind: 'report'; report: VerificaReport }
  | { kind: 'watch'; report: WatchReport }
  | { kind: 'migration'; report: EquivalenceReport };

export const MAX_DOCUMENT_FILE = 5 * 1024 * 1024;
export const NOT_A_DOCUMENT = 'no es un informe, un parte de vigilancia ni un informe de equivalencia de Verifica';

/** Lee un informe, un parte de vigilancia o un informe de equivalencia. Devuelve el documento o por qué no se puede abrir («no es…»). */
export function readDocumentText(text: string): VerificaDocument | string {
  let value: unknown;
  try { value = JSON.parse(text); } catch { return 'no es un archivo JSON válido'; }
  try {
    const format = typeof value === 'object' && value !== null ? (value as { format?: unknown }).format : undefined;
    if (format === WATCH_FORMAT) return { kind: 'watch', report: parseWatchReport(value) };
    if (format === EQUIVALENCE_FORMAT) return { kind: 'migration', report: parseEquivalenceReport(value) };
    return { kind: 'report', report: parseReport(value) };
  } catch (error) {
    if (error instanceof ReportFormatError || error instanceof WatchInputError || error instanceof EquivalenceFormatError) return NOT_A_DOCUMENT;
    throw error;
  }
}

export const day = (iso: string) => new Date(iso).toLocaleDateString('es-ES', { timeZone: 'Europe/Madrid', day: 'numeric', month: 'long', year: 'numeric' });
export const short = (fingerprint: string) => fingerprint.slice(0, 12);

export function downloadJson(json: string, name: string) {
  const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}
