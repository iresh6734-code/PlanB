// Plan B Verifica · informe con huella (docs/plan-b-verifica-plan-de-producto.md, «Formato»).
// Página 1: las cifras, cada una con su base y la huella de las capturas de las que sale.
// Página 2: lo que no se pudo comprobar y por qué. Ningún nombre sale del lado del vendedor:
// las referencias son seudónimos con una sal que no viaja en el informe.
import { sha256Hex } from '../sha256.js';
import { RULE_IDS, type NotVerified, type VerificaCapture, type VerificaDeclarations, type VerificaFinding, type VerificaInvoice } from './model.js';
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
  return (kind: 'deal' | 'company' | 'owner' | 'contact', id: string) => kind + ':' + sha256Hex(salt + '|' + kind + '|' + id).slice(0, 10);
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
    ...(input.previous && fingerprints.previous ? [{ role: 'previous' as const, at: input.previous.capturedAt, fingerprint: fingerprints.previous, detail: describeCapture(input.previous) }] : []),
    { role: 'latest', at: input.latest.capturedAt, fingerprint: fingerprints.latest, detail: describeCapture(input.latest) },
    ...(input.invoices && fingerprints.invoices ? [{ role: 'invoices' as const, at: null, fingerprint: fingerprints.invoices, detail: input.invoices.length + ' facturas' }] : []),
  ];
  const body = { format: REPORT_FORMAT, asOf: input.asOf, sources, findings: results.map(r => r.finding), notVerified: results.flatMap(r => r.notVerified) } as const;
  return { ...body, fingerprint: reportFingerprint(body) };
}

export function describeCapture(capture: VerificaCapture): string {
  return capture.source + ' · ' + capture.companies.length + ' empresas, ' + capture.contacts.length + ' contactos, ' + capture.deals.length + ' oportunidades' + (capture.historyAvailable ? ', con historial' : ', sin historial');
}

export const reportToJson = (report: VerificaReport): string => JSON.stringify(report, null, 2) + '\n';

export class ReportFormatError extends Error { constructor(message: string) { super(message); this.name = 'ReportFormatError'; } }

/**
 * Comprueba que un JSON de fuera tiene la forma de un informe, para poder pintarlo. No comprueba la huella: un informe
 * bien formado pero retocado se acepta aquí y `verifyReport` dice después que no coincide.
 */
export function parseReport(value: unknown): VerificaReport {
  const fail = (where: string): never => { throw new ReportFormatError('No es un informe de Verifica (' + where + ').'); };
  const obj = (v: unknown, where: string) => (typeof v === 'object' && v !== null && !Array.isArray(v) ? v as Record<string, unknown> : fail(where));
  const list = (v: unknown, where: string) => (Array.isArray(v) ? v as unknown[] : fail(where));
  const text = (v: unknown, where: string) => (typeof v === 'string' ? v : fail(where));
  const hex = (v: unknown, where: string) => (typeof v === 'string' && /^[0-9a-f]{64}$/.test(v) ? v : fail(where));
  const r = obj(value, 'raíz');
  if (r.format !== REPORT_FORMAT) fail('formato');
  text(r.asOf, 'fecha');
  hex(r.fingerprint, 'huella');
  for (const s of list(r.sources, 'fuentes').map(v => obj(v, 'fuente'))) {
    if (!['previous', 'latest', 'invoices'].includes(s.role as string)) fail('fuente');
    if (s.at !== null) text(s.at, 'fuente');
    hex(s.fingerprint, 'fuente'); text(s.detail, 'fuente');
  }
  const rules = new Set<string>();
  for (const f of list(r.findings, 'hallazgos').map(v => obj(v, 'hallazgo'))) {
    const rule = text(f.rule, 'hallazgo');
    if (!RULES_BY_ID.has(rule) || rules.has(rule)) fail('hallazgo');
    rules.add(rule);
    text(f.title, 'hallazgo'); text(f.summary, 'hallazgo');
    if (typeof f.alarm !== 'boolean' || !['observed', 'declared', 'unverified'].includes(f.basis as string)) fail('hallazgo');
    if (!Object.values(obj(f.figures, 'cifras')).every(n => typeof n === 'number')) fail('cifras');
    for (const item of list(f.items, 'referencias').map(v => obj(v, 'referencia'))) {
      text(item.ref, 'referencia');
      if (item.amount !== null && typeof item.amount !== 'number') fail('referencia');
      if (item.note !== undefined) text(item.note, 'referencia');
    }
    list(f.captures, 'capturas').forEach(c => text(c, 'capturas'));
  }
  for (const n of list(r.notVerified, 'sin comprobar').map(v => obj(v, 'sin comprobar'))) {
    if (!RULES_BY_ID.has(text(n.rule, 'sin comprobar'))) fail('sin comprobar');
    text(n.topic, 'sin comprobar'); text(n.reason, 'sin comprobar');
  }
  return value as VerificaReport;
}

const RULES_BY_ID = new Set<string>(RULE_IDS);
