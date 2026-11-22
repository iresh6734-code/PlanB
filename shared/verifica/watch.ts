// Plan B Verifica · vigilancia entre la firma y el cierre (fase 3, docs/plan-b-verifica-plan-de-producto.md).
// Una captura en la firma y una por semana hasta el cierre. Cada captura se compara con la anterior: los avisos dicen
// qué cambió esa semana. Aparte, la captura que encoge frente a la última aceptada queda RETENIDA (cuarentena A2):
// se conserva, pero no pasa a ser la base de comparación hasta que las partes acepten su huella.
// Al cierre, un parte compara la firma con la última captura. Puro: sin red, sin disco, sin reloj del sistema.
import { assessShrink, type Counts } from '../capture-quarantine.js';
import { CleanRoomError, leaksIn } from './clean-room.js';
import type { FindingItem, VerificaCapture } from './model.js';
import { describeCapture, fingerprintOf, pseudonymizer } from './report.js';
import { euros, THRESHOLDS } from './rules.js';

const DAY = 86_400_000;
export const WATCH_FORMAT = 'planb-verifica-watch-v1';

/** Umbrales de la vigilancia, versión 1. Los borrados en bloque usan los de la prueba de referencia (`THRESHOLDS`). */
export const WATCH_RULES = Object.freeze({
  /** Una captura cada 7 días desde la firma. */
  cadenceDays: 7,
  /** Margen antes de dar una semana por perdida. */
  graceDays: 3,
  /** Aviso si lo perdido, borrado o rebajado de la cartera abierta llega al 10 % de su importe... */
  drainShare: 0.1,
  /** ...y afecta al menos a 3 oportunidades. */
  drainMinDeals: 3,
});

export const WATCH_ALERT_KINDS = ['contacts-deleted', 'companies-deleted', 'deals-deleted', 'pipeline-drained', 'capture-missing'] as const;
export type WatchAlertKind = typeof WATCH_ALERT_KINDS[number];

export interface WatchAlert { kind: WatchAlertKind; title: string; summary: string; figures: Record<string, number>; items: FindingItem[] }

/** `signing`: la captura de la firma. `retained`: encoge frente a la última aceptada y nadie ha aceptado su huella. */
export type WatchStatus = 'signing' | 'accepted' | 'retained';

export interface WatchEntry {
  at: string;
  fingerprint: string;
  detail: string;
  status: WatchStatus;
  /** Qué encoge frente a la última captura aceptada, aunque las partes la hayan aceptado después. */
  shrink: string | null;
  alerts: WatchAlert[];
}

export interface WatchReport {
  format: typeof WATCH_FORMAT;
  signedAt: string;
  asOf: string;
  cadenceDays: number;
  entries: WatchEntry[];
  /** La captura que tocaba y no ha llegado a la fecha del parte. */
  overdue: WatchAlert | null;
  /** De la firma a la última captura: lo que se perdió entre medias, aunque fuera poco a poco. */
  closing: { from: string; to: string; alerts: WatchAlert[] };
  fingerprint: string;
}

export interface WatchInput {
  signing: VerificaCapture;
  captures: readonly VerificaCapture[];
  asOf: string;
  salt: string;
  /** Huellas de capturas retenidas que las partes han revisado y aceptan como nueva base. */
  accepted?: readonly string[];
}

export class WatchInputError extends Error { constructor(message: string) { super(message); this.name = 'WatchInputError'; } }

const plural = (n: number, one: string, many: string) => n + ' ' + (n === 1 ? one : many);
const pct = (value: number) => Math.round(value * 1000) / 10;
const amountOf = (value: number | null) => typeof value === 'number' && Number.isFinite(value) ? value : 0;
const dateOf = (t: number) => new Date(t).toISOString().slice(0, 10);

const DELETIONS = [
  { entity: 'contacts', kind: 'contacts-deleted', title: 'Contactos borrados en bloque', one: 'contacto desaparece', many: 'contactos desaparecen', added: ['nuevo', 'nuevos'] },
  { entity: 'companies', kind: 'companies-deleted', title: 'Empresas borradas en bloque', one: 'empresa desaparece', many: 'empresas desaparecen', added: ['nueva', 'nuevas'] },
  { entity: 'deals', kind: 'deals-deleted', title: 'Oportunidades borradas en bloque', one: 'oportunidad desaparece', many: 'oportunidades desaparecen', added: ['nueva', 'nuevas'] },
] as const;

/** Registros que desaparecen de una captura a otra, con los umbrales de la prueba de referencia. */
export function deletionAlerts(before: VerificaCapture, after: VerificaCapture): WatchAlert[] {
  const alerts: WatchAlert[] = [];
  for (const d of DELETIONS) {
    const prev = new Set(before[d.entity].map(r => r.id)), next = new Set(after[d.entity].map(r => r.id));
    const deleted = [...prev].filter(id => !next.has(id)).length, added = [...next].filter(id => !prev.has(id)).length;
    if (deleted < THRESHOLDS.deletionMin || deleted < prev.size * THRESHOLDS.deletionShare) continue;
    alerts.push({
      kind: d.kind, title: d.title,
      summary: plural(deleted, d.one, d.many) + ' (' + prev.size + ' → ' + next.size + ', ' + plural(added, d.added[0], d.added[1]) + ').',
      figures: { before: prev.size, after: next.size, deleted, added }, items: [],
    });
  }
  return alerts;
}

/**
 * La cartera abierta de `before` que en `after` está perdida, borrada o rebajada. Lo ganado no cuenta: cerrar una venta
 * es lo normal. Las oportunidades nuevas tampoco compensan: el aviso mira lo que se va, no el saldo.
 */
export function pipelineAlert(before: VerificaCapture, after: VerificaCapture, pseudonym: (kind: 'deal', id: string) => string): WatchAlert | null {
  const next = new Map(after.deals.map(d => [d.id, d]));
  const open = before.deals.filter(d => d.status === 'open');
  const openAmount = open.reduce((total, d) => total + amountOf(d.amount), 0);
  const items: FindingItem[] = [];
  let lost = 0, deleted = 0, reduced = 0;
  for (const d of open) {
    const was = amountOf(d.amount), now = next.get(d.id);
    if (!now) { deleted++; items.push({ ref: pseudonym('deal', d.id), amount: was, note: 'borrada' }); }
    else if (now.status === 'lost') { lost++; items.push({ ref: pseudonym('deal', d.id), amount: was, note: 'perdida' }); }
    else if (now.status === 'open' && amountOf(now.amount) < was) { reduced++; items.push({ ref: pseudonym('deal', d.id), amount: was - amountOf(now.amount), note: 'rebajada' }); }
  }
  const drained = items.reduce((total, item) => total + (item.amount ?? 0), 0);
  const share = openAmount > 0 ? drained / openAmount : 0;
  if (items.length < WATCH_RULES.drainMinDeals || share < WATCH_RULES.drainShare) return null;
  items.sort((a, b) => (b.amount ?? 0) - (a.amount ?? 0) || (a.ref < b.ref ? -1 : 1));
  return {
    kind: 'pipeline-drained', title: 'La cartera abierta se vacía',
    summary: 'Sale el ' + String(pct(share)).replace('.', ',') + ' % de la cartera abierta (' + euros(drained) + ' de ' + euros(openAmount) + '): ' + [plural(lost, 'perdida', 'perdidas'), plural(deleted, 'borrada', 'borradas'), plural(reduced, 'rebajada', 'rebajadas')].join(', ') + '.',
    figures: { openCount: open.length, openAmount, drainedCount: items.length, drainedAmount: drained, drainedPct: pct(share), lostCount: lost, deletedCount: deleted, reducedCount: reduced },
    items,
  };
}

/** Semanas sin captura entre dos instantes. null si la siguiente llegó a tiempo (7 días más 3 de margen). */
export function gapAlert(from: string, to: string): WatchAlert | null {
  const cadence = WATCH_RULES.cadenceDays * DAY, grace = WATCH_RULES.graceDays * DAY;
  const gap = Date.parse(to) - Date.parse(from);
  if (gap <= cadence + grace) return null;
  const missed = Math.floor((gap - grace) / cadence);
  return {
    kind: 'capture-missing', title: 'Semana sin captura',
    summary: 'La captura que tocaba el ' + dateOf(Date.parse(from) + cadence) + ' no llegó: ' + plural(missed, 'semana', 'semanas') + ' sin captura (' + Math.round(gap / DAY) + ' días entre una y otra).',
    figures: { gapDays: Math.round(gap / DAY), missedWeeks: missed }, items: [],
  };
}

/** Cuándo toca la siguiente captura y si ya va tarde, para el aviso de la herramienta. */
export function watchSchedule(lastCaptureAt: string, now: string): { nextDue: string; late: boolean } {
  const due = Date.parse(lastCaptureAt) + WATCH_RULES.cadenceDays * DAY;
  return { nextDue: new Date(due).toISOString(), late: Date.parse(now) > due + WATCH_RULES.graceDays * DAY };
}

const counts = (capture: VerificaCapture): Counts => ({ contacts: capture.contacts.length, companies: capture.companies.length, deals: capture.deals.length });
const LABEL = { contacts: 'Contactos', companies: 'Empresas', deals: 'Oportunidades', tasks: 'Tareas' } as const;

export function buildWatchReport(input: WatchInput): WatchReport {
  const pseudonym = pseudonymizer(input.salt);
  const signedAt = Date.parse(input.signing.capturedAt), asOf = Date.parse(input.asOf);
  if (!Number.isFinite(signedAt) || !Number.isFinite(asOf)) throw new WatchInputError('Fecha de firma o del parte no válida.');
  const captures = [...input.captures].sort((a, b) => Date.parse(a.capturedAt) - Date.parse(b.capturedAt));
  let last = signedAt;
  for (const c of captures) {
    const at = Date.parse(c.capturedAt);
    if (!Number.isFinite(at) || at <= last) throw new WatchInputError('Cada captura semanal debe ser posterior a la firma y a la anterior (' + c.capturedAt + ').');
    last = at;
  }
  if (asOf < last) throw new WatchInputError('El parte no puede ser anterior a la última captura.');
  const accepted = new Set(input.accepted ?? []);

  const entries: WatchEntry[] = [{ at: input.signing.capturedAt, fingerprint: fingerprintOf(input.signing), detail: describeCapture(input.signing), status: 'signing', shrink: null, alerts: [] }];
  let base = input.signing, previous = input.signing;
  for (const capture of captures) {
    const fingerprint = fingerprintOf(capture);
    const gap = gapAlert(previous.capturedAt, capture.capturedAt), drain = pipelineAlert(previous, capture, pseudonym);
    const alerts = [...(gap ? [gap] : []), ...deletionAlerts(previous, capture), ...(drain ? [drain] : [])];
    const shrink = assessShrink(counts(base), counts(capture), capture.capturedAt);
    const status: WatchStatus = shrink && !accepted.has(fingerprint) ? 'retained' : 'accepted';
    entries.push({ at: capture.capturedAt, fingerprint, detail: describeCapture(capture), status, shrink: shrink ? shrink.reasons.map(r => LABEL[r.entity] + ' ' + r.before + ' → ' + r.after).join(' · ') : null, alerts });
    if (status === 'accepted') base = capture;
    previous = capture;
  }
  const drain = pipelineAlert(input.signing, previous, pseudonym);
  const body: Omit<WatchReport, 'fingerprint'> = {
    format: WATCH_FORMAT, signedAt: input.signing.capturedAt, asOf: input.asOf, cadenceDays: WATCH_RULES.cadenceDays, entries,
    overdue: gapAlert(previous.capturedAt, input.asOf),
    closing: { from: entries[0]!.fingerprint, to: entries.at(-1)!.fingerprint, alerts: [...deletionAlerts(input.signing, previous), ...(drain ? [drain] : [])] },
  };
  return { ...body, fingerprint: fingerprintOf(body) };
}

export function watchReportFingerprint(report: WatchReport): string {
  const { fingerprint: _ignored, ...body } = report;
  return fingerprintOf(body);
}

export const verifyWatchReport = (report: WatchReport): boolean => report.format === WATCH_FORMAT && watchReportFingerprint(report) === report.fingerprint;
export const watchReportToJson = (report: WatchReport): string => JSON.stringify(report, null, 2) + '\n';

/** Textos del CRM que aparecen en el parte. Solo para mostrarlos en el equipo del vendedor. */
export const findWatchLeaks = (report: WatchReport, input: Pick<WatchInput, 'signing' | 'captures'>): string[] => leaksIn(watchReportToJson(report), [input.signing, ...input.captures], null);

/** El parte que puede salir del lado del vendedor: la misma barrera que el informe de la sala limpia. */
export function releaseWatchReport(input: WatchInput): WatchReport {
  const report = buildWatchReport(input);
  const leaks = findWatchLeaks(report, input).length;
  if (leaks) throw new CleanRoomError(leaks, 'El parte lleva ' + leaks + (leaks === 1 ? ' texto' : ' textos') + ' del CRM (nombres, correos, NIF o IDs). No sale nada.');
  return report;
}

/** Comprueba que un JSON de fuera tiene la forma de un parte de vigilancia. La huella la comprueba `verifyWatchReport`. */
export function parseWatchReport(value: unknown): WatchReport {
  const fail = (where: string): never => { throw new WatchInputError('No es un parte de vigilancia de Verifica (' + where + ').'); };
  const obj = (v: unknown, where: string) => (typeof v === 'object' && v !== null && !Array.isArray(v) ? v as Record<string, unknown> : fail(where));
  const list = (v: unknown, where: string) => (Array.isArray(v) ? v as unknown[] : fail(where));
  const text = (v: unknown, where: string) => (typeof v === 'string' ? v : fail(where));
  const hex = (v: unknown, where: string) => (typeof v === 'string' && /^[0-9a-f]{64}$/.test(v) ? v : fail(where));
  const alert = (v: unknown) => {
    const a = obj(v, 'aviso');
    if (!(WATCH_ALERT_KINDS as readonly unknown[]).includes(a.kind)) fail('aviso');
    text(a.title, 'aviso'); text(a.summary, 'aviso');
    if (!Object.values(obj(a.figures, 'cifras')).every(n => typeof n === 'number')) fail('cifras');
    for (const item of list(a.items, 'referencias').map(i => obj(i, 'referencia'))) {
      text(item.ref, 'referencia');
      if (item.amount !== null && typeof item.amount !== 'number') fail('referencia');
      if (item.note !== undefined) text(item.note, 'referencia');
    }
  };
  const r = obj(value, 'raíz');
  if (r.format !== WATCH_FORMAT) fail('formato');
  text(r.signedAt, 'firma'); text(r.asOf, 'fecha');
  if (typeof r.cadenceDays !== 'number') fail('cadencia');
  hex(r.fingerprint, 'huella');
  const entries = list(r.entries, 'capturas');
  if (!entries.length) fail('capturas');
  entries.map(v => obj(v, 'captura')).forEach((e, i) => {
    text(e.at, 'captura'); hex(e.fingerprint, 'captura'); text(e.detail, 'captura');
    if (e.status !== (i === 0 ? 'signing' : 'accepted') && !(i > 0 && e.status === 'retained')) fail('estado');
    if (e.shrink !== null) text(e.shrink, 'captura');
    list(e.alerts, 'avisos').forEach(alert);
  });
  if (r.overdue !== null) alert(r.overdue);
  const closing = obj(r.closing, 'cierre');
  hex(closing.from, 'cierre'); hex(closing.to, 'cierre');
  list(closing.alerts, 'cierre').forEach(alert);
  return value as WatchReport;
}
