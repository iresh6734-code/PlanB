// Plan B Verifica · informe con huella (docs/plan-b-verifica-plan-de-producto.md, «Formato»).
// Página 1: las cifras, cada una con su base y la huella de las capturas de las que sale.
// Página 2: lo que no se pudo comprobar y por qué. Ningún nombre sale del lado del vendedor:
// las referencias son seudónimos con una sal que no viaja en el informe.
import { sha256Hex } from '../sha256.js';
import type { NotVerified, VerificaCapture, VerificaDeclarations, VerificaFinding, VerificaInvoice } from './model.js';
import { RULES, type RuleContext } from './rules.js';

export const REPORT_FORMAT = 'planb-verifica-report-v1';

export interface ReportSource { role: 'previous' | 'latest' | 'invoices'; at: string | null; fingerprint: string; detail: string }

export interface VerificaReport {
  format: typeof REPORT_FORMAT;
  asOf: string;
  sources: ReportSource[];
  findings: VerificaFinding[];
  notVerified: NotVerified[];
  /** sha256 del informe sin este campo. Cualquiera puede recalcularlo con `reportFingerprint`. */
  fingerprint: string;
}

export interface ReportInput {
  asOf: string;
  previous: VerificaCapture | null;
  latest: VerificaCapture;
  invoices: VerificaInvoice[] | null;
  declarations: VerificaDeclarations;
  /** Secreto del lado del vendedor. Sin él, los seudónimos no se pueden deshacer probando identificadores. */
  salt: string;
}

/** JSON con las claves ordenadas: el mismo contenido da siempre la misma huella. */
export function stableJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return '[' + value.map(stableJson).join(',') + ']';
  const entries = Object.entries(value as Record<string, unknown>).filter(([, v]) => v !== undefined).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0);
  return '{' + entries.map(([key, v]) => JSON.stringify(key) + ':' + stableJson(v)).join(',') + '}';
}

export const fingerprintOf = (value: unknown): string => sha256Hex(stableJson(value));

export function pseudonymizer(salt: string) {
  if (salt.length < 16) throw new Error('La sal del informe debe tener al menos 16 caracteres.');
  return (kind: 'deal' | 'company' | 'owner', id: string) => kind + ':' + sha256Hex(salt + '|' + kind + '|' + id).slice(0, 10);
}

export function reportFingerprint(report: Omit<VerificaReport, 'fingerprint'> | VerificaReport): string {
  const { fingerprint: _ignored, ...body } = report as VerificaReport;
  return fingerprintOf(body);
}

/** true si el informe no se ha tocado desde que se firmó su huella. */
export const verifyReport = (report: VerificaReport): boolean => report.format === REPORT_FORMAT && reportFingerprint(report) === report.fingerprint;

export function buildVerificaReport(input: ReportInput): VerificaReport {
  const fingerprints = {
    previous: input.previous ? fingerprintOf(input.previous) : null,
    latest: fingerprintOf(input.latest),
    invoices: input.invoices ? fingerprintOf(input.invoices) : null,
  };
  const ctx: RuleContext = { asOf: input.asOf, previous: input.previous, latest: input.latest, invoices: input.invoices, declarations: input.declarations, pseudonym: pseudonymizer(input.salt), fingerprints };
  const results = RULES.map(rule => rule(ctx));
  const sources: ReportSource[] = [
    ...(input.previous && fingerprints.previous ? [{ role: 'previous' as const, at: input.previous.capturedAt, fingerprint: fingerprints.previous, detail: describe(input.previous) }] : []),
    { role: 'latest', at: input.latest.capturedAt, fingerprint: fingerprints.latest, detail: describe(input.latest) },
    ...(input.invoices && fingerprints.invoices ? [{ role: 'invoices' as const, at: null, fingerprint: fingerprints.invoices, detail: input.invoices.length + ' facturas' }] : []),
  ];
  const body = { format: REPORT_FORMAT, asOf: input.asOf, sources, findings: results.map(r => r.finding), notVerified: results.flatMap(r => r.notVerified) } as const;
  return { ...body, fingerprint: reportFingerprint(body) };
}

function describe(capture: VerificaCapture): string {
  return capture.source + ' · ' + capture.companies.length + ' empresas, ' + capture.contacts.length + ' contactos, ' + capture.deals.length + ' oportunidades' + (capture.historyAvailable ? ', con historial' : ', sin historial');
}

export const reportToJson = (report: VerificaReport): string => JSON.stringify(report, null, 2) + '\n';
