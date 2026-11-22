// Plan B Verifica · prueba de referencia de la vigilancia: la empresa vigilada (fase 3).
// Parte de la empresa SANA de la prueba de referencia, firmada el TRAP_AS_OF, y la sigue 5 semanas con actividad normal:
// cada semana 2 contactos se van y llegan 4, entra 1 empresa y 6 oportunidades, se ganan 2 y se pierde 1.
// Con `traps: true` siembra tres trampas: 80 contactos borrados la semana 2, la captura de la semana 3 no llega y la
// semana 4 se vacía la cartera (18 perdidas, 6 borradas y 4 rebajadas a cero).
// Como en la empresa con trampas, lo esperado se anota MIENTRAS se siembra, no aplicando las reglas.
import { buildTrapCompany, seeded, TRAP_AS_OF, type ExpectedFigure } from './empresa-con-trampas.js';
import type { VerificaCapture, VerificaDeal } from './model.js';
import type { WatchAlertKind, WatchReport } from './watch.js';

const DAY = 86_400_000;
export const WATCH_SIGNED_AT = TRAP_AS_OF;
export const WATCH_WEEKS = 5;
/** El parte se pide el día después de la última captura, el del cierre. */
export const WATCH_CLOSING_AT = new Date(Date.parse(WATCH_SIGNED_AT) + (WATCH_WEEKS * 7 + 1) * DAY).toISOString();
export const WATCH_SALT = 'empresa vigilada · sal de prueba';

export interface ExpectedAlert { kind: WatchAlertKind; figures: Record<string, ExpectedFigure> }
export interface ExpectedWatch {
  /** Una por captura semanal, en orden. */
  weekly: { at: string; status: 'accepted' | 'retained'; alerts: ExpectedAlert[] }[];
  closing: ExpectedAlert[];
}

export interface WatchedCompany {
  signing: VerificaCapture;
  captures: VerificaCapture[];
  asOf: string;
  salt: string;
  expected: ExpectedWatch;
  /** Nombres, correos e IDs que nunca pueden salir en el parte. */
  forbidden: string[];
}

const iso = (t: number) => new Date(t).toISOString();
const dateOnly = (t: number) => iso(t).slice(0, 10);
const amountOf = (d: VerificaDeal) => d.amount ?? 0;
const sumOf = (list: VerificaDeal[]) => list.reduce((total, d) => total + amountOf(d), 0);

export function buildWatchedCompany(options: { traps: boolean }): WatchedCompany {
  const { traps } = options;
  const random = seeded(20261127);
  const signedAt = Date.parse(WATCH_SIGNED_AT);
  const signing: VerificaCapture = structuredClone({ ...buildTrapCompany({ traps: false }).latest, id: 'firma', capturedAt: WATCH_SIGNED_AT });
  const openAtSigning = new Set(signing.deals.filter(d => d.status === 'open').map(d => d.id));
  const state = structuredClone(signing);
  const everything = structuredClone(signing);
  const captures: VerificaCapture[] = [];
  const weekly: ExpectedWatch['weekly'] = [];
  // Lo que sale de la cartera abierta desde la última captura y desde la firma, apuntado al sembrarlo.
  const sinceCapture = { lost: [] as VerificaDeal[], deleted: [] as VerificaDeal[], reduced: [] as VerificaDeal[] };
  const sinceSigning = { lost: [] as VerificaDeal[], deleted: [] as VerificaDeal[], reduced: [] as VerificaDeal[] };
  const drained = (kind: keyof typeof sinceCapture, deal: VerificaDeal) => { sinceCapture[kind].push(structuredClone(deal)); sinceSigning[kind].push(structuredClone(deal)); };
  let contactsGone = 0, contactsNew = 0, lastContacts = state.contacts.length;
  let weekGone = 0, weekNew = 0;

  // Las abiertas desde la firma que siguen abiertas y no ha tocado ninguna trampa, por fecha de cierre y luego por id.
  const trapped = new Set<string>();
  const stillOpen = () => state.deals.filter(d => d.status === 'open' && openAtSigning.has(d.id) && !trapped.has(d.id)).sort((a, b) => (a.closeDate! < b.closeDate! ? -1 : a.closeDate! > b.closeDate! ? 1 : a.id < b.id ? -1 : 1));
  const close = (d: VerificaDeal, status: 'won' | 'lost', at: number) => { d.status = status; d.closeDate = dateOnly(at); d.history?.closeDate.push({ value: d.closeDate, at: iso(at) }); };

  for (let week = 1; week <= WATCH_WEEKS; week++) {
    const at = signedAt + week * 7 * DAY;
    // Actividad normal.
    state.contacts.splice(week * 11, 2); weekGone += 2;
    for (let k = 1; k <= 4; k++) {
      const n = week * 10 + k;
      state.contacts.push({ id: 'p' + (1000 + n), name: 'Persona Ficticia Nueva ' + n, email: 'nueva' + n + '@cliente-nuevo.example', companyId: 'c' + String(1 + Math.floor(random() * 300)).padStart(3, '0') });
    }
    weekNew += 4;
    state.companies.push({ id: 'c' + (400 + week), name: 'Cliente Ficticio Nuevo ' + week + ' S.L.', customer: false });
    for (let i = 0; i < 6; i++) {
      const created = at - (6 - i) * DAY, amount = 4000 + Math.floor(random() * 161) * 100;
      state.deals.push({ id: 'v' + week + i, name: 'Oportunidad ficticia nueva ' + week + '-' + i, companyId: 'c' + String(1 + Math.floor(random() * 300)).padStart(3, '0'), ownerId: 'o' + (i + 1), status: 'open', amount, createdAt: iso(created), closeDate: dateOnly(created + 90 * DAY), history: { amount: [{ value: amount, at: iso(created) }], closeDate: [{ value: dateOnly(created + 90 * DAY), at: iso(created) }] } });
    }
    const [wonA, wonB, lost] = stillOpen();
    close(wonA!, 'won', at - 2 * DAY); close(wonB!, 'won', at - 2 * DAY); close(lost!, 'lost', at - 2 * DAY); drained('lost', lost!);

    // Trampas.
    if (traps && week === 2) { state.contacts.splice(0, 80); weekGone += 80; }
    if (traps && week === 4) {
      const biggest = stillOpen().sort((a, b) => amountOf(b) - amountOf(a) || (a.id < b.id ? -1 : 1)).slice(0, 28);
      for (const d of biggest) trapped.add(d.id);
      for (const d of biggest.slice(0, 18)) { drained('lost', d); close(d, 'lost', at - DAY); }
      for (const d of biggest.slice(18, 24)) drained('deleted', d);
      state.deals = state.deals.filter(d => !biggest.slice(18, 24).includes(d));
      for (const d of biggest.slice(24, 28)) { drained('reduced', d); d.amount = 0; d.history?.amount.push({ value: 0, at: iso(at - DAY) }); }
    }

    for (const kind of ['contacts', 'companies', 'deals'] as const) for (const r of state[kind]) if (!everything[kind].some(e => e.id === r.id)) (everything[kind] as { id: string }[]).push(structuredClone(r));
    if (traps && week === 3) continue; // La captura de la semana 3 no llega.

    captures.push(structuredClone({ ...state, id: 'semana-' + week, capturedAt: iso(at) }));
    const alerts: ExpectedAlert[] = [];
    const out = [...sinceCapture.lost, ...sinceCapture.deleted, ...sinceCapture.reduced];
    if (traps && week === 2) alerts.push({ kind: 'contacts-deleted', figures: { before: lastContacts, after: state.contacts.length, deleted: weekGone, added: weekNew } });
    if (traps && week === 4) {
      alerts.push({ kind: 'capture-missing', figures: { gapDays: 14, missedWeeks: 1 } });
      alerts.push({ kind: 'pipeline-drained', figures: { drainedCount: out.length, drainedAmount: sumOf(out), lostCount: sinceCapture.lost.length, deletedCount: sinceCapture.deleted.length, reducedCount: sinceCapture.reduced.length } });
    }
    // La semana 2 deja los contactos por debajo del 80 % de la semana 1, y nadie la acepta: desde ahí todas quedan retenidas.
    weekly.push({ at: iso(at), status: traps && week >= 2 ? 'retained' : 'accepted', alerts });
    contactsGone += weekGone; contactsNew += weekNew; weekGone = 0; weekNew = 0;
    lastContacts = state.contacts.length;
    sinceCapture.lost = []; sinceCapture.deleted = []; sinceCapture.reduced = [];
  }

  const out = [...sinceSigning.lost, ...sinceSigning.deleted, ...sinceSigning.reduced];
  const closing: ExpectedAlert[] = traps ? [
    { kind: 'contacts-deleted', figures: { before: signing.contacts.length, after: state.contacts.length, deleted: contactsGone, added: contactsNew } },
    { kind: 'pipeline-drained', figures: { drainedCount: out.length, drainedAmount: sumOf(out), lostCount: sinceSigning.lost.length, deletedCount: sinceSigning.deleted.length, reducedCount: sinceSigning.reduced.length } },
  ] : [];

  const forbidden = [
    ...everything.owners.map(o => o.name), ...everything.companies.map(c => c.name), ...everything.contacts.flatMap(c => [c.name, c.email ?? '']),
    ...everything.deals.map(d => d.name), ...(['owners', 'companies', 'contacts', 'deals'] as const).flatMap(kind => everything[kind].map(r => '"' + r.id + '"')),
  ].filter(Boolean);

  return { signing, captures, asOf: WATCH_CLOSING_AT, salt: WATCH_SALT, expected: { weekly, closing }, forbidden };
}

/** Diferencias entre un parte de vigilancia y lo esperado. Vacío = la prueba pasa. */
export function checkWatch(report: WatchReport, expected: ExpectedWatch): string[] {
  const problems: string[] = [];
  const compare = (where: string, got: WatchReport['closing']['alerts'], want: ExpectedAlert[]) => {
    const kinds = (list: { kind: string }[]) => list.map(a => a.kind).sort().join(',');
    if (kinds(got) !== kinds(want)) { problems.push(where + ': avisos [' + kinds(got) + '], se esperaba [' + kinds(want) + ']'); return; }
    for (const w of want) {
      const g = got.find(a => a.kind === w.kind)!;
      for (const [key, figure] of Object.entries(w.figures)) {
        const value = g.figures[key];
        if (typeof value !== 'number') problems.push(where + ' ' + w.kind + '.' + key + ': falta');
        else if (typeof figure === 'number' ? value !== figure : (figure.min !== undefined && value < figure.min) || (figure.max !== undefined && value > figure.max)) problems.push(where + ' ' + w.kind + '.' + key + ': ' + value + ', se esperaba ' + JSON.stringify(figure));
      }
    }
  };
  const weeks = report.entries.slice(1);
  if (weeks.length !== expected.weekly.length) problems.push('capturas: ' + weeks.length + ', se esperaban ' + expected.weekly.length);
  expected.weekly.forEach((want, i) => {
    const got = weeks[i];
    if (!got) return;
    if (got.at !== want.at) problems.push('captura ' + (i + 1) + ': fecha ' + got.at + ', se esperaba ' + want.at);
    if (got.status !== want.status) problems.push('captura ' + want.at.slice(0, 10) + ': ' + got.status + ', se esperaba ' + want.status);
    compare('captura ' + want.at.slice(0, 10), got.alerts, want.alerts);
  });
  compare('cierre', report.closing.alerts, expected.closing);
  if (report.overdue) problems.push('aviso de captura pendiente inesperado');
  return problems;
}
