// Plan B Verifica · lo que el informe dice de un vistazo (dirección visual «Dictamen», 23/11/2026).
// Lógica pura: la conclusión que encabeza la página, la cifra clave de cada hallazgo, las tres cifras del resumen y de
// qué fuentes sale cada hallazgo, dicho con fechas y no con huellas. Todo sale de `figures`, que el motor ya calcula:
// aquí no se deduce nada que el informe no afirme (por eso la conclusión no habla de «% de la cartera abierta»: lo
// creado en la ventana puede estar ya ganado o perdido).
import { euros } from '../../shared/verifica/rules.js';
import type { VerificaFinding, VerificaRuleId } from '../../shared/verifica/model.js';
import type { ReportSource, VerificaReport } from '../../shared/verifica/report.js';
import { day } from './documents.js';

const fig = (finding: VerificaFinding, key: string): number | null => {
  const value = (finding.figures as Record<string, number | undefined>)[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
};
const decimal = (value: number) => value.toLocaleString('es-ES', { maximumFractionDigits: 1 });
const plural = (n: number, one: string, many: string) => n.toLocaleString('es-ES') + ' ' + (n === 1 ? one : many);

/** Cifra clave de un hallazgo, la que se lee en la columna de la derecha. null si el hallazgo no tiene cifras (sin comprobar). */
export function keyFigure(finding: VerificaFinding): string | null {
  switch (finding.rule) {
    case 'window-inflation': { const v = fig(finding, 'totalAmount'); return v === null ? null : euros(v); }
    case 'close-date-pushed': { const v = fig(finding, 'pushedAmount'); return v === null ? null : euros(v); }
    case 'won-without-invoice': { const v = fig(finding, 'missingAmount'); return v === null ? null : euros(v); }
    case 'owner-concentration': { const v = fig(finding, 'top2Pct'); return v === null ? null : decimal(v) + ' %'; }
    case 'bulk-deletion': { const v = fig(finding, 'deleted'); return v === null ? null : v === 0 ? '0' : '−' + v.toLocaleString('es-ES'); }
    case 'declared-renewal': {
      const customers = fig(finding, 'customers'), declared = fig(finding, 'declaredActive'), rate = fig(finding, 'declaredRatePct');
      if (customers !== null && declared !== null) return customers.toLocaleString('es-ES') + ' de ' + declared.toLocaleString('es-ES');
      return rate === null ? null : decimal(rate) + ' %';
    }
  }
}

/** Qué mide la cifra clave, para el resumen de arriba. */
const HIGHLIGHT_LABEL: Record<VerificaRuleId, string> = {
  'window-inflation': 'creados o subidos en la ventana de venta',
  'won-without-invoice': 'en oportunidades ganadas sin factura',
  'owner-concentration': 'de la cartera abierta en los dos primeros comerciales',
  'close-date-pushed': 'en oportunidades abiertas aplazadas una y otra vez',
  'bulk-deletion': 'contactos borrados entre capturas',
  'declared-renewal': 'clientes en el CRM frente a los declarados',
};
const PRIORITY: VerificaRuleId[] = ['window-inflation', 'won-without-invoice', 'owner-concentration', 'close-date-pushed', 'bulk-deletion', 'declared-renewal'];

/** La frase que encabeza la página: el hallazgo más grave con su cifra. */
export function conclusion(report: VerificaReport): { headline: string; rule: VerificaRuleId | null } {
  const alarms = report.findings.filter(f => f.alarm);
  if (alarms.length === 0) return { headline: 'Ninguna de las ' + report.findings.length + ' comprobaciones se sale de lo normal.', rule: null };
  const first = PRIORITY.map(rule => alarms.find(f => f.rule === rule)).find((f): f is VerificaFinding => f !== undefined)!;
  switch (first.rule) {
    case 'window-inflation': {
      const total = fig(first, 'totalAmount'), ratio = fig(first, 'ratioPct');
      if (total !== null && ratio !== null && ratio > 0) return { rule: first.rule, headline: 'En la ventana de venta se creó o se subió cartera por ' + euros(total) + ': ' + decimal(ratio / 100) + ' veces lo habitual.' };
      break;
    }
    case 'won-without-invoice': {
      const count = fig(first, 'missingCount'), amount = fig(first, 'missingAmount');
      if (count !== null && amount !== null) return { rule: first.rule, headline: plural(count, 'oportunidad ganada no tiene', 'oportunidades ganadas no tienen') + ' factura, por ' + euros(amount) + '.' };
      break;
    }
    case 'owner-concentration': {
      const share = fig(first, 'top2Pct');
      if (share !== null) return { rule: first.rule, headline: 'Dos comerciales concentran el ' + decimal(share) + ' % de la cartera abierta.' };
      break;
    }
    case 'close-date-pushed': {
      const count = fig(first, 'pushedCount'), amount = fig(first, 'pushedAmount');
      if (count !== null && amount !== null) return { rule: first.rule, headline: plural(count, 'oportunidad abierta se ha', 'oportunidades abiertas se han') + ' aplazado una y otra vez, por ' + euros(amount) + '.' };
      break;
    }
    case 'bulk-deletion': {
      const deleted = fig(first, 'deleted');
      if (deleted !== null) return { rule: first.rule, headline: 'Entre las dos capturas desaparecieron ' + plural(deleted, 'contacto', 'contactos') + '.' };
      break;
    }
    case 'declared-renewal':
      return { rule: first.rule, headline: 'Lo que declara el vendedor no cuadra con el CRM ni con las facturas.' };
  }
  return { rule: first.rule, headline: first.title + '.' };
}

/** Hasta tres cifras para el resumen, de los hallazgos que se salen de lo normal, sin repetir el de la conclusión. */
export function highlights(report: VerificaReport, max = 3): { rule: VerificaRuleId; value: string; label: string }[] {
  const { rule: lead } = conclusion(report);
  const out: { rule: VerificaRuleId; value: string; label: string }[] = [];
  for (const rule of PRIORITY) {
    if (out.length >= max) break;
    const finding = report.findings.find(f => f.rule === rule && f.alarm);
    if (!finding) continue;
    if (rule === lead) continue;
    const value = keyFigure(finding);
    if (value) out.push({ rule, value, label: HIGHLIGHT_LABEL[rule] });
  }
  return out;
}

/** De qué sale un hallazgo, con fechas: «De la captura del 20 de noviembre de 2026 y las facturas». */
export function traceText(captures: readonly string[], sources: readonly ReportSource[]): string {
  const found = captures.map(fingerprint => sources.find(s => s.fingerprint === fingerprint));
  const dates = found.filter((s): s is ReportSource => s !== undefined && s.role !== 'invoices').map(s => s.at ? day(s.at) : 'día sin fecha');
  const named: string[] = [];
  if (dates.length === 1) named.push('la captura del ' + dates[0]);
  if (dates.length > 1) named.push('las capturas del ' + dates.slice(0, -1).join(', del ') + ' y del ' + dates.at(-1));
  if (found.some(s => s?.role === 'invoices')) named.push('las facturas');
  if (found.some(s => s === undefined)) named.push('una fuente que no está en el informe');
  if (named.length === 0) return '';
  const joined = named.length === 1 ? named[0]! : named.slice(0, -1).join(', ') + ' y ' + named.at(-1)!;
  return 'Sale de ' + joined + '.';
}

/** Cuántas capturas y facturas respaldan el informe, para la frase bajo la conclusión. */
export function sourcesText(report: VerificaReport): string {
  const captures = report.sources.filter(s => s.role !== 'invoices').length;
  const invoices = report.sources.find(s => s.role === 'invoices');
  const count = invoices ? Number.parseInt(invoices.detail, 10) : Number.NaN;
  const capturesText = captures === 1 ? 'una captura del CRM' : captures + ' capturas del CRM';
  return 'Observado en ' + capturesText + (invoices ? (Number.isFinite(count) ? ' y ' + plural(count, 'factura', 'facturas') : ' y las facturas') : '') + '.';
}
